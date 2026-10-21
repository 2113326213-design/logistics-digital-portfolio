// Rebuild public/data.json from the local source workbooks: the inventory, the taxonomy and (since
// 2026-10-16) the business capability standard. Replaces the retired prepare_data.py, so Python is no
// longer needed. Workbooks are read with the application's own readers (public/xlsx.mjs); nothing is sent anywhere.
//
//   node scripts/prepare-data.mjs --inventory <inventory.xlsx> --taxonomy <taxonomy.xlsx>
//        --capabilities <standard.xlsx> [--output public/data.json] [--preserve-workspace <json>] [--check]
//
// Exit codes: 0 = written, or --check found no differences; 1 = --check found differences, or --check has
// no existing file to compare; 2 = error.
//
// Differences from prepare_data.py, each chosen on purpose (where it matters, the choice reproduces the
// current public/data.json byte for byte):
//  1. ROI: roiScore/roiSource are now written (prepare_data.py dropped them on every rebuild).
//  2. --preserve-workspace also accepts a workspace exported by this application
//     ({format:'logistics-portfolio-workspace',version:1..6,data:{...}}); anything else is rejected.
//     An explicitly named file that does not exist is an error (Python silently carried nothing over).
//  3. Output format: JSON.stringify(data,null,2) plus a final line feed, which is what the current
//     public/data.json is (Python's one-line json.dumps output is not). Non-ASCII text is kept as is.
//  4. Empty inventory cells become '' (Python wrote null); the current data.json has '' (one empty Processes).
//     Empty taxonomy cells stay null as in Python (the current capabilityRows contain null).
//  5. Header rows are found by name, as in the browser readers ('Logistic Apps': first row with ID and Name;
//     'Parameter Score': first row with LeanIX ID; process sheet: first row with Process ID). Python assumed
//     row 1, row 1 and row 3, and fixed process columns A, C, D, E. A note is printed when the workbook
//     differs from those positions, because the old script would have read it differently.
//  6. All ten application columns, the unnamed column C, and LeanIX ID / App operation cost / ROI are
//     required; a missing or duplicated column stops the rebuild instead of writing null (Python).
//  7. Inventory rows without an ID are skipped as before, but now listed. Rows with an ID but no Name,
//     and duplicate IDs, stop the rebuild: the application refuses to load such data (model.mjs).
//  8. scopeSource stays '' when the scope note is empty (Python), although the browser reader always fills it.
//  9. Values are read as text (browser reader): App operation cost '4' stored as text is accepted (Python
//     rejected it), numbers in text columns stay strings, and a duplicate LeanIX ID is an error (Python
//     silently kept the last row). Lifecycle: Active date serials become YYYY-MM-DD even without a date format;
//     the reader does not see cell types, so any numeric text from 10000 to 100000 (decimals included) is
//     read as a date serial too. Text that is exactly an ISO date-time keeps only its date (Python kept such
//     text as is); any other text, such as a date followed by a note, is kept as recorded. Boolean cells read
//     as TRUE/FALSE, so a TRUE/FALSE score stops the rebuild (as Python did for App operation cost; Python
//     did not read ROI).
// 10. Business Capability rows whose first three cells are blank are dropped (Python kept [null,null,null]
//     for every formatted-but-empty row). The current data.json has no such rows.
// 11. The rebuilt data must pass the application's own loader (workspaceData + buildModel) before it is written.
// 12. An 'Annual benefit (CNY/year)' column is ignored like every other non-snapshot column (the browser
//     reader would validate it and could stop the rebuild over a column that is not written).
// 13. The default --output is this program's public/data.json wherever the command is run from (Python used
//     the current directory). Explicit paths are still relative to the current directory.
// 14. An existing --output file is replaced only when it is a data.json snapshot (a JSON object with an
//     "apps" list); a workbook or any other file named by mistake is left untouched (Python overwrote it).
// 15. --capabilities <xlsx> takes the capability list from the business capability standard ('Standard Name'
//     sheet: Level 1–3 Code and Name) instead of the 'Business Capability' sheet; taxonomySource then names
//     both workbooks. A taxonomy workbook that has its own 'Standard Name' sheet uses that sheet. Since
//     2026-10-16 public/data.json uses the standard list, so rebuilds need --capabilities to reproduce it.
//     Writing over data that uses a standard without one stops (the old catalogue would come back
//     unnoticed) unless --capabilities-from-taxonomy asks for exactly that; --check only notes it.
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {installDOMParser} from './xml-dom.mjs';
import {readXlsx,inventoryFromSheets,taxonomyFromSheets,capabilityRowsFromStandard,taxonomySourceName} from '../public/xlsx.mjs';
import {operationCostScoresFromSheets,cleanCostScore} from '../public/costs.mjs';
import {cleanROIScore} from '../public/roi.mjs';
import {workspaceData,importWorkspace} from '../public/workspace.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {buildModel} from '../public/model.mjs';
import {english} from '../public/english.mjs';

export const DEFAULT_OUTPUT=fileURLToPath(new URL('../public/data.json',import.meta.url));
// Output order of application fields. Contact and infrastructure columns are never copied.
export const APP_COLUMNS=['ID','Division','Entity','Name','Description','Main Business Capability','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active'];
export const PRESERVED_KEYS=['corrections','reviews','reviewHistory','applicationEvents','importHistory','similarityWeights','similarityWeightsVersion','similarityThreshold','inventoryExport'];
const SCORE_COLUMNS=['LeanIX ID','App operation cost','ROI'];
const PROCESS_COLUMNS=['RBW E2E Process Chain','Process Level','Process ID','Process Name'];
const ANNUAL_BENEFIT_COLUMN='Annual benefit (CNY/year)';
// Owner decision on 2026-09-29: remove this unclassified process entry. Same exact-match condition as
// prepare_data.py (untrimmed ID, whole Processes text).
const OWNER_DECISION={id:'a103918e-63a2-4b26-ae5b-a5b1b7af8fd1',processes:'BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Receive to Store L1;Manufacturing',suffix:';Manufacturing'};
const MAX_DIFFERENCE_LINES=200;

export const USAGE=`Usage: node scripts/prepare-data.mjs --inventory <inventory.xlsx> --taxonomy <taxonomy.xlsx> --capabilities <standard.xlsx> [options]
   or: npm run prepare:data -- --inventory <inventory.xlsx> --taxonomy <taxonomy.xlsx> --capabilities <standard.xlsx> [options]

Rebuilds the application data from the inventory workbook ('Logistic Apps', 'Parameter Score'), the
taxonomy workbook ('Data_RBW Process Structure'; its 'Business Capability' sheet is used only without
--capabilities) and the business capability standard ('Standard Name'). --capabilities is needed to
reproduce the current public/data.json.

Options:
  --capabilities <xlsx>        Take the capability list from this business capability standard workbook
                               ('Standard Name' sheet) instead of the taxonomy's 'Business Capability' sheet.
                               Needed to reproduce the current public/data.json.
  --capabilities-from-taxonomy Allow writing the taxonomy's 'Business Capability' list over data that uses
                               a capability standard (otherwise that stops with an error).
  --output <json>              File to write (default: public/data.json in this program).
  --preserve-workspace <json>  Carry corrections, reviews, history and similarity weights over from this
                               data.json snapshot or exported workspace (default: the existing output file).
  --check                      Do not write. Compare the rebuild with the existing output file and list
                               every difference; exit 0 when identical, 1 when different or when
                               there is no existing file to compare.
  --help                       Show this help.

Relative paths are resolved from the current directory (npm run uses the program folder).
Exit codes: 0 success or no differences, 1 differences found by --check (or nothing to compare), 2 error.`;

export class PrepareDataError extends Error{}
const fail=message=>{throw new PrepareDataError(message);};
const quote=value=>`'${value}'`;
const list=values=>values.map(quote).join(', ');
const columnLetter=index=>{let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
const plural=(count,word,many=word+'s')=>`${count.toLocaleString('en-US')} ${count===1?word:many}`;
const appLabel=app=>`${String(app?.Name??'').trim()||'(no name)'} (${String(app?.ID??'').trim()||'no ID'})`;

// Header checks give English messages naming the sheet, and point out near misses such as 'ROI '.
function requireColumns(sheet,header,names){
 const missing=names.filter(name=>!header.includes(name));
 if(missing.length){
  const hints=missing.map(name=>{const near=header.find(cell=>typeof cell==='string'&&cell!==name&&cell.trim().toLowerCase()===name.toLowerCase());return near===undefined?'':` (found "${near}"; check spaces and capitals)`;});
  fail(`${quote(sheet)} is missing the required column${missing.length>1?'s':''} ${missing.map((name,i)=>quote(name)+hints[i]).join(', ')}.`);
 }
 const duplicated=names.filter(name=>header.indexOf(name)!==header.lastIndexOf(name));
 if(duplicated.length)fail(`${quote(sheet)} has more than one ${list(duplicated)} column; keep only one.`);
}
function requireSheets(sheets,names,role,file,hint=''){
 const missing=names.filter(name=>!Array.isArray(sheets[name]));
 if(missing.length)fail(`The ${role} workbook ${file} has no ${missing.map(quote).join(' or ')} worksheet${missing.length>1?'s':''} (worksheets found: ${list(Object.keys(sheets))||'none'}).${missing.length===1&&missing[0]==='Business Capability'?hint:''}`);
}
const standardNote=(standard,taxonomyName)=>`The existing data takes its capability names from ${standard}; this rebuild uses the 'Business Capability' sheet of ${taxonomyName} instead. Add --capabilities <${standard}> to keep the standard names.`;
const standardIn=source=>String(source??'').match(/^(.+?) \(capabilities\); /)?.[1];

export async function readWorkbook(file,role){
 installDOMParser();
 let bytes;
 try{bytes=readFileSync(file);}
 catch(error){fail(`Cannot read the ${role} workbook ${file}: ${error.code==='ENOENT'?'file not found':error.message}.`);}
 try{return await readXlsx(new File([bytes],path.basename(file)));}
 catch(error){fail(`Cannot read the ${role} workbook ${path.basename(file)}: ${english(error.message)}`);}
}

function inventoryApps(sheets,file,notes){
 requireSheets(sheets,['Logistic Apps','Parameter Score'],'inventory',file);
 const rows=sheets['Logistic Apps'],header=rows.findIndex(row=>row?.includes('ID')&&row?.includes('Name'));
 if(header<0)fail(`'Logistic Apps' has no header row with both an 'ID' and a 'Name' column.`);
 const headers=rows[header];
 requireColumns('Logistic Apps',headers,APP_COLUMNS);
 // Column C has no header. It holds the scope note; the browser reader only reads it when the header is blank.
 if(String(headers[2]??'').trim())fail(`'Logistic Apps' column C must be the unnamed scope-note column, but its header is "${headers[2]}".`);
 if(header!==0)notes.push(`'Logistic Apps' header is on row ${header+1}; prepare_data.py assumed row 1.`);
 if(headers.indexOf('ID')!==0)notes.push(`'Logistic Apps' ID is in column ${columnLetter(headers.indexOf('ID'))}; prepare_data.py assumed column A.`);

 const scores=sheets['Parameter Score'],scoreHeader=scores.findIndex(row=>row?.includes('LeanIX ID'));
 if(scoreHeader<0)fail(`'Parameter Score' has no header row with a 'LeanIX ID' column.`);
 requireColumns('Parameter Score',scores[scoreHeader],SCORE_COLUMNS);
 if(scoreHeader!==0)notes.push(`'Parameter Score' header is on row ${scoreHeader+1}; prepare_data.py assumed row 1.`);
 const [idColumn,costColumn,roiColumn]=SCORE_COLUMNS.map(name=>scores[scoreHeader].indexOf(name));
 // Validate score cells before the shared reader runs, so an invalid value names its row and column.
 for(let index=scoreHeader+1;index<scores.length;index++){
  const row=scores[index],id=String(row?.[idColumn]??'').trim();if(!id)continue;
  for(const [column,name,clean] of [[costColumn,'App operation cost',cleanCostScore],[roiColumn,'ROI',cleanROIScore]]){
   try{clean(row[column]);}catch(error){fail(`'Parameter Score' row ${index+1} (LeanIX ID ${id}), column ${quote(name)}: ${error.message} Found "${row[column]}".`);}
  }
 }

 // The annual-benefit import column is not part of this snapshot. Hide it from the shared reader so an
 // unrelated cell there cannot stop the rebuild. date1904 is non-enumerable and must be copied explicitly.
 const view={...sheets,'Logistic Apps':rows.map((row,index)=>index===header?row.map(cell=>cell===ANNUAL_BENEFIT_COLUMN?'':cell):row)};
 Object.defineProperty(view,'date1904',{value:sheets.date1904});
 let parsed;
 try{parsed=inventoryFromSheets(view);}catch(error){fail(`Cannot read 'Logistic Apps' / 'Parameter Score': ${english(error.message)}`);}

 const apps=[],rowsById=new Map(),skipped=[];
 for(const source of parsed){
  // The reader always records the scope cell, so the sheet row is known for every application.
  const row=Number(String(source.scopeSource).replace('Logistic Apps!C',''));
  const id=String(source.ID??'');
  if(!id.trim()){skipped.push(row);continue;}
  if(!String(source.Name??'').trim())fail(`'Logistic Apps' row ${row} (ID ${id.trim()}) has no Name; the application cannot load a record without a name.`);
  if(rowsById.has(id.trim()))fail(`'Logistic Apps' rows ${rowsById.get(id.trim())} and ${row} have the same ID ${id.trim()}.`);
  rowsById.set(id.trim(),row);
  const app=Object.fromEntries(APP_COLUMNS.map(key=>[key,source[key]??'']));
  app.scopeNote=source.scopeNote;
  app.scopeSource=source.scopeNote?source.scopeSource:'';
  app.operationCostScore=source.operationCostScore??null;
  app.operationCostSource=source.operationCostSource??'';
  app.roiScore=source.roiScore??null;
  app.roiSource=source.roiSource??'';
  apps.push(app);
 }
 if(skipped.length)notes.push(`Skipped ${plural(skipped.length,'row')} of 'Logistic Apps' without an ID: ${skipped.join(', ')}.`);
 if(!apps.length)fail(`'Logistic Apps' has no application rows with an ID.`);
 const unmatched=[...operationCostScoresFromSheets(sheets).entries()].filter(([id])=>!rowsById.has(id)).map(([,score])=>score.source.replace(/^.* row /,''));
 if(unmatched.length)notes.push(`'Parameter Score' ${plural(unmatched.length,'row')} with a LeanIX ID that is not in 'Logistic Apps' (ignored): ${unmatched.join(', ')}.`);

 for(const app of apps){
  if(app.ID===OWNER_DECISION.id&&app.Processes===OWNER_DECISION.processes){
   app.Processes=app.Processes.slice(0,-OWNER_DECISION.suffix.length);
   notes.push(`Owner decision applied: removed 'Manufacturing' from the Processes of ${appLabel(app)}.`);
  }else if(app.ID.trim()===OWNER_DECISION.id&&/Manufacturing/i.test(app.Processes)){
   notes.push(`Owner decision NOT applied to ${appLabel(app)}: its Processes no longer match the recorded text exactly; check 'Manufacturing' with the business owner.`);
  }
 }
 return apps;
}

// The capability list comes from the --capabilities standard workbook when given, else from the taxonomy
// workbook's 'Standard Name' sheet, else from its 'Business Capability' sheet.
function taxonomy(sheets,file,notes,standardSheets=null,standardFile=''){
 if(Array.isArray(sheets['Standard Name'])&&!Array.isArray(sheets['Data_RBW Process Structure']))fail(`The taxonomy workbook ${file} has a 'Standard Name' worksheet but no 'Data_RBW Process Structure' worksheet (worksheets found: ${list(Object.keys(sheets))}), so it looks like the business capability standard. ${standardSheets?'The standard is already given with --capabilities; give':'Pass it with --capabilities and give'} the process taxonomy workbook as --taxonomy.`);
 requireSheets(sheets,standardSheets||Array.isArray(sheets['Standard Name'])?['Data_RBW Process Structure']:['Business Capability','Data_RBW Process Structure'],'taxonomy',file,' Or pass --capabilities <standard.xlsx> to take the capability list from the business capability standard.');
 if(standardSheets)requireSheets(standardSheets,['Standard Name'],'capability standard',standardFile);
 const processes=sheets['Data_RBW Process Structure'],header=processes.findIndex(row=>row?.includes('Process ID'));
 if(header<0)fail(`'Data_RBW Process Structure' has no header row with a 'Process ID' column.`);
 requireColumns('Data_RBW Process Structure',processes[header],PROCESS_COLUMNS);
 // prepare_data.py skipped three rows and read columns A, C, D and E without looking at the header.
 if(header!==2)notes.push(`'Data_RBW Process Structure' header is on row ${header+1}; prepare_data.py assumed row 3.`);
 const columns=PROCESS_COLUMNS.map(name=>columnLetter(processes[header].indexOf(name))).join(', ');
 if(columns!=='A, C, D, E')notes.push(`'Data_RBW Process Structure' columns ${list(PROCESS_COLUMNS)} are ${columns}; prepare_data.py assumed A, C, D, E.`);
 // With --capabilities the standard replaces any capability sheet of the taxonomy workbook, which then
 // needs only its process sheet.
 if(standardSheets)try{capabilityRowsFromStandard(standardSheets['Standard Name']);}catch(error){fail(`Cannot read the capability standard ${standardFile}: ${english(error.message)}`);}
 let rows;
 try{rows=taxonomyFromSheets(standardSheets?{...sheets,'Standard Name':standardSheets['Standard Name']}:sheets);}catch(error){fail(`Cannot read the taxonomy workbook ${file}: ${english(error.message)}`);}
 const capabilityRows=rows.capabilityRows;
 const blankToNull=value=>value===''||value===undefined?null:value;
 return {
  capabilityRows:capabilityRows.filter(row=>row.some(value=>String(value??'').trim())).map(row=>row.map(blankToNull)),
  processRows:rows.processRows.map(row=>row.map(blankToNull))
 };
}

// Windows tools may save JSON with a byte-order mark; the application loads such a file, so it is accepted here too.
const withoutBOM=text=>text.replace(/^\uFEFF/,'');
// Reads the file whose decisions are carried over: a data.json snapshot or an exported workspace.
// The label names the file as the user knows it: the named --preserve-workspace file, or the existing output.
export function readPreserved(file,label='--preserve-workspace file'){
 const Label=label[0].toUpperCase()+label.slice(1);
 let text;
 try{text=withoutBOM(readFileSync(file,'utf8'));}
 catch(error){fail(`Cannot read ${label} ${file}: ${error.code==='ENOENT'?'file not found':error.message}.`);}
 let document;
 try{document=JSON.parse(text);}catch{fail(`${Label} ${file} is not valid JSON.`);}
 const expected=`Expected a data.json snapshot or a workspace exported by this application (format "logistics-portfolio-workspace", version 1 to 6).`;
 if(!document||typeof document!=='object'||Array.isArray(document))fail(`Unsupported ${label} ${file}: it is not a JSON object. ${expected}`);
 let data,kind;
 if(Object.hasOwn(document,'format')){
  // The application's own import decides which versions are accepted and validates the data.
  try{importWorkspace(text);}
  catch(error){
   const message=english(error.message);
   if(message==='Select a workspace JSON exported from this application.')fail(`Unsupported ${label} ${file}: format ${JSON.stringify(document.format)}, version ${JSON.stringify(document.version)}. ${expected}`);
   fail(`${Label} ${file} is a workspace export, but its data is invalid: ${message}`);
  }
  data=document.data;kind=`workspace export, version ${document.version}`;
 }else if(Array.isArray(document.apps)){
  try{workspaceData(document);}catch(error){fail(`${Label} ${file} is not a valid data.json snapshot: ${english(error.message)}`);}
  data=document;kind='data.json snapshot';
 }else fail(`Unsupported ${label} ${file}: it has neither "apps" nor "format". ${expected}`);
 if(data.isAcceptanceSample===true)fail(`${Label} ${file} holds the A/B demo sample, not the portfolio. Export the workspace again with the real data loaded.`);
 return {kind,data};
}

export function buildData({inventorySheets,taxonomySheets,inventoryName,taxonomyName,standardSheets=null,standardName='',preserved=null}){
 const notes=[];
 const apps=inventoryApps(inventorySheets,inventoryName,notes);
 const {capabilityRows,processRows}=taxonomy(taxonomySheets,taxonomyName,notes,standardSheets,standardName);
 const data={apps,capabilityRows,processRows,source:inventoryName,taxonomySource:taxonomySourceName(taxonomyName,standardSheets?standardName:'')};
 // A rebuild without the capability standard would bring back the taxonomy workbook's own capability names.
 const keptStandard=standardIn(preserved?.taxonomySource);
 if(keptStandard&&!standardSheets&&!Array.isArray(taxonomySheets['Standard Name']))notes.push(standardNote(keptStandard,taxonomyName));
 const carried=[];
 if(preserved)for(const key of PRESERVED_KEYS)if(Object.hasOwn(preserved,key)){data[key]=preserved[key];carried.push(key);}
 try{buildModel(workspaceData(data));}
 catch(error){fail(`The rebuilt data would not load in the application: ${english(error.message)}`);}
 return {data,notes,carried};
}

// Same bytes as the current public/data.json: two-space indentation, non-ASCII kept, final line feed.
export const formatData=data=>JSON.stringify(data,null,2)+'\n';

const SHOW_LIMIT=120,MAX_LIST_ITEMS=10;
// Values are quoted as JSON, with invisible and look-alike characters (no-break space, zero-width space, bidi marks, BOM ...)
// written as \u escapes, so a change in them cannot look like no change.
const literal=value=>JSON.stringify(value).replace(/[\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g,char=>'\\u'+char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
const show=value=>{
 if(value===undefined)return '(missing)';
 if(Array.isArray(value))return plural(value.length,'entry','entries');
 if(value&&typeof value==='object')return plural(Object.keys(value).length,'key');
 const text=literal(value);if(text.length<=SHOW_LIMIT||typeof value!=='string')return text;
 // Cut whole characters, so an escape is never split.
 let kept='',size=1;for(const char of value){const width=literal(char).length-2;if(size+width>SHOW_LIMIT-3)break;kept+=char;size+=width;}
 return literal(kept).slice(0,-1)+'...';
};
// Semicolon lists: a change is shown as the entries removed and added (each entry exactly as recorded).
const LIST_FIELDS=new Set(['Business Capabilities','Processes']);
const without=(items,others)=>{const left=new Map();for(const item of others)left.set(item,(left.get(item)||0)+1);return items.filter(item=>{const n=left.get(item);if(n){left.set(item,n-1);return false;}return true;});};
// One line per changed field. Shortening a long text could hide the change, so long texts are shown
// around their first difference instead.
function fieldChange(key,before,after){
 if(typeof before==='string'&&typeof after==='string'){
  if(LIST_FIELDS.has(key)&&before&&after){
   const removed=without(before.split(';'),after.split(';')),added=without(after.split(';'),before.split(';'));
   if(!removed.length&&!added.length)return `${key}: the same entries in a different order`;
   const items=[...removed.map(item=>`removed ${literal(item)}`),...added.map(item=>`added ${literal(item)}`)];
   return `${key}: ${items.slice(0,MAX_LIST_ITEMS).join('; ')}${items.length>MAX_LIST_ITEMS?`; ... and ${items.length-MAX_LIST_ITEMS} more`:''}`;
  }
  if(literal(before).length>SHOW_LIMIT||literal(after).length>SHOW_LIMIT){
   // Count characters, not UTF-16 units, so positions are right and a cut never splits an emoji.
   const a=[...before],b=[...after];let at=0;while(at<a.length&&a[at]===b[at])at++;
   const from=Math.max(0,at-30),excerpt=chars=>`${from?'...':''}${literal(chars.slice(from,at+50).join(''))}${chars.length>at+50?'...':''}`;
   return `${key} (${a.length} -> ${b.length} characters; first difference at character ${at+1}): ${excerpt(a)} -> ${excerpt(b)}`;
  }
 }
 return `${key}: ${show(before)} -> ${show(after)}`;
}
// Lists differences between an existing file and rebuilt data, as "file value -> rebuilt value".
export function describeDifferences(existingText,data,rebuiltText=formatData(data)){
 if(existingText===rebuiltText)return [];
 let existing;
 try{existing=JSON.parse(withoutBOM(existingText));}catch{return ['The existing file is not valid JSON.'];}
 if(!existing||typeof existing!=='object'||Array.isArray(existing))return ['The existing file is not a JSON object.'];
 const lines=[];
 for(const key of Object.keys(data))if(!Object.hasOwn(existing,key))lines.push(`${key}: only in the rebuilt data (${show(data[key])})`);
 for(const key of Object.keys(existing))if(!Object.hasOwn(data,key))lines.push(`${key}: only in the existing file (${show(existing[key])})`);
 if(Array.isArray(existing.apps)){
  const id=app=>String(app?.ID??'').trim();
  const before=new Map(existing.apps.map(app=>[id(app),app])),after=new Map(data.apps.map(app=>[id(app),app]));
  const added=data.apps.filter(app=>!before.has(id(app))),removed=existing.apps.filter(app=>!after.has(id(app)));
  const changed=[];
  for(const app of data.apps){
   const old=before.get(id(app));if(!old||isDeepStrictEqual(old,app))continue;
   const fields=[...new Set([...Object.keys(app),...Object.keys(old)])].filter(key=>!isDeepStrictEqual(old[key],app[key]));
   changed.push([app,fields.map(key=>`    ${fieldChange(key,old[key],app[key])}`)]);
  }
  if(added.length||removed.length||changed.length)lines.push(`Applications: ${existing.apps.length} in the file, ${data.apps.length} rebuilt; ${added.length} added, ${removed.length} removed, ${changed.length} changed.`);
  for(const app of added)lines.push(`  + ${appLabel(app)}`);
  for(const app of removed)lines.push(`  - ${appLabel(app)}`);
  for(const [app,fields] of changed){
   if(fields.length)lines.push(`  ${appLabel(app)}`,...fields);
  }
  if(!added.length&&!removed.length&&existing.apps.map(id).join('\n')!==data.apps.map(id).join('\n'))lines.push('Applications are listed in a different order.');
  const reordered=data.apps.filter(app=>{const old=before.get(id(app));return old&&isDeepStrictEqual(old,app)&&Object.keys(old).join('\n')!==Object.keys(app).join('\n');});
  if(reordered.length)lines.push(`${plural(reordered.length,'application')} list the same fields in a different order.`);
 }
 for(const key of ['capabilityRows','processRows']){
  if(!Object.hasOwn(existing,key)||isDeepStrictEqual(existing[key],data[key]))continue;
  if(!Array.isArray(existing[key])){lines.push(`${key}: not a list in the existing file.`);continue;}
  const remaining=new Map();
  for(const row of existing[key]){const text=JSON.stringify(row);remaining.set(text,(remaining.get(text)||0)+1);}
  const onlyRebuilt=[];
  for(const row of data[key]){const text=JSON.stringify(row),count=remaining.get(text);if(count)remaining.set(text,count-1);else onlyRebuilt.push(text);}
  const onlyFile=[...remaining].flatMap(([text,count])=>Array(count).fill(text));
  if(!onlyRebuilt.length&&!onlyFile.length){lines.push(`${key}: the same ${existing[key].length} rows in a different order.`);continue;}
  lines.push(`${key}: ${existing[key].length} rows in the file, ${data[key].length} rebuilt; ${onlyFile.length} only in the file, ${onlyRebuilt.length} only in the rebuilt data.`);
  for(const text of onlyFile.slice(0,10))lines.push(`  - ${text}`);
  if(onlyFile.length>10)lines.push(`  ... and ${onlyFile.length-10} more only in the file`);
  for(const text of onlyRebuilt.slice(0,10))lines.push(`  + ${text}`);
  if(onlyRebuilt.length>10)lines.push(`  ... and ${onlyRebuilt.length-10} more only in the rebuilt data`);
 }
 for(const key of Object.keys(data)){
  if(['apps','capabilityRows','processRows'].includes(key)||!Object.hasOwn(existing,key)||isDeepStrictEqual(existing[key],data[key]))continue;
  lines.push(`${key}: ${show(existing[key])} -> ${show(data[key])}${existing[key]&&typeof existing[key]==='object'?' (contents differ)':''}`);
 }
 if(!lines.length)lines.push(JSON.stringify(existing)===JSON.stringify(data)
  ?'Same data; only the formatting differs (indentation, spacing, line endings or a byte-order mark).'
  :'Same values; only the order of keys differs.');
 return lines;
}

function summary({data,notes,carried},{inventoryName,taxonomyName,preservedFile,preservedKind}){
 const counted=key=>data.apps.filter(app=>app[key]!==null).length;
 const lines=[
  `Inventory: ${inventoryName}: ${plural(data.apps.length,'application')}; App operation cost recorded for ${counted('operationCostScore')}, ROI for ${counted('roiScore')}.`,
  `Taxonomy: ${data.taxonomySource}: ${plural(data.capabilityRows.length,'capability row')}, ${plural(data.processRows.length,'process row')}.`,
  preservedFile?`Carried over from ${preservedFile} (${preservedKind}): ${carried.length?carried.join(', '):'nothing (none of the carried keys are present)'}.`:'Carried over: nothing (no existing output file).'
 ];
 if(Object.hasOwn(data,'corrections')){
  const states=correctionStates(data),count=state=>states.filter(c=>c.state===state).length,stale=states.filter(c=>c.state==='Needs review');
  lines.push(`Corrections: ${count('Applied')} applied, ${stale.length} need review, ${count('Revoked')} revoked.`);
  for(const c of stale.slice(0,20))lines.push(`  Warning: the ${c.dimension==='cap'?'capability':'process'} mapping of "${c.raw}" for ${appLabel(data.apps.find(app=>String(app.ID).trim()===c.appId)??{ID:c.appId})} no longer matches its source row or taxonomy and will show as Needs review.`);
 }
 return [...lines,...notes];
}

const isDataSnapshot=text=>{try{const value=JSON.parse(withoutBOM(text));return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Array.isArray(value.apps);}catch{return false;}};
const relative=file=>{const rel=path.relative(process.cwd(),file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)?rel:file;};

export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
 const out=text=>stdout.write(text+'\n'),err=text=>stderr.write(text+'\n');
 let values;
 try{
  ({values}=parseArgs({args:argv,strict:true,allowPositionals:false,options:{inventory:{type:'string'},taxonomy:{type:'string'},capabilities:{type:'string'},'capabilities-from-taxonomy':{type:'boolean'},output:{type:'string'},'preserve-workspace':{type:'string'},check:{type:'boolean'},help:{type:'boolean',short:'h'}}}));
 }catch(error){err(`Error: ${error.message}\n\n${USAGE}`);return 2;}
 if(values.help){out(USAGE);return 0;}
 const missing=['inventory','taxonomy'].filter(name=>!values[name]);
 if(missing.length){err(`Error: ${missing.map(name=>'--'+name).join(' and ')} ${missing.length>1?'are':'is'} required.\n\n${USAGE}`);return 2;}
 try{
  const inventory=path.resolve(values.inventory),taxonomyFile=path.resolve(values.taxonomy);
  const output=values.output?path.resolve(values.output):DEFAULT_OUTPUT;
  // A path below an existing file cannot be a folder; writing it later fails with a clear message.
  const outputStat=(()=>{try{return statSync(output,{throwIfNoEntry:false});}catch{return undefined;}})();
  if(outputStat?.isDirectory())fail(`--output ${output} is a folder; give a file name such as data.json.`);
  const explicitPreserve=Boolean(values['preserve-workspace']);
  const preservedFile=explicitPreserve?path.resolve(values['preserve-workspace']):existsSync(output)?output:null;
  const preserved=preservedFile?readPreserved(preservedFile,explicitPreserve?'--preserve-workspace file':'existing output file (read for --preserve-workspace by default)'):null;
  const inventoryName=path.basename(inventory),taxonomyName=path.basename(taxonomyFile);
  const [inventorySheets,taxonomySheets]=[await readWorkbook(inventory,'inventory'),await readWorkbook(taxonomyFile,'taxonomy')];
  const standardFile=values.capabilities?path.resolve(values.capabilities):null,standardName=standardFile?path.basename(standardFile):'';
  const standardSheets=standardFile?await readWorkbook(standardFile,'capability standard'):null;
  const result=buildData({inventorySheets,taxonomySheets,inventoryName,taxonomyName,standardSheets,standardName,preserved:preserved?.data});
  const text=formatData(result.data);
  let existingText=null;
  if(existsSync(output))try{existingText=readFileSync(output,'utf8');}catch(error){fail(`Cannot read the existing output file ${output}: ${error.message}.`);}
  const differences=existingText===null?null:describeDifferences(existingText,result.data,text);
  // The existing output may use the capability standard even when the preserved file does not.
  const usesSheet=!standardSheets&&!Array.isArray(taxonomySheets['Standard Name']);
  const keptStandard=standardIn(preserved?.data?.taxonomySource)||(existingText!==null&&isDataSnapshot(existingText)?standardIn(JSON.parse(withoutBOM(existingText)).taxonomySource):undefined);
  if(usesSheet&&keptStandard&&!result.notes.some(note=>note.startsWith('The existing data takes')))result.notes.push(standardNote(keptStandard,taxonomyName));
  const info=summary(result,{inventoryName,taxonomyName,preservedFile:preservedFile&&relative(preservedFile),preservedKind:preserved?.kind});
  const report=lines=>lines.length>MAX_DIFFERENCE_LINES?[...lines.slice(0,MAX_DIFFERENCE_LINES),`... and ${lines.length-MAX_DIFFERENCE_LINES} more lines`]:lines;
  if(values.check){
   out(`Checking ${relative(output)} against a rebuild from ${inventoryName} and ${taxonomyName}${standardName?` with ${standardName}`:''} (nothing is written).`);
   for(const line of info)out(line);
   if(differences===null){out(`Result: ${relative(output)} does not exist, so there is nothing to compare.`);return 1;}
   if(!differences.length){out(`Result: no differences. ${relative(output)} matches the rebuild byte for byte.`);return 0;}
   out(`Result: ${relative(output)} differs from the rebuild (file value -> rebuilt value):`);
   for(const line of report(differences))out('  '+line);
   return 1;
  }
  // Without the standard, writing would quietly bring the old capability catalogue back.
  if(usesSheet&&keptStandard&&!values['capabilities-from-taxonomy'])fail(`The existing data takes its capability list from the business capability standard ${keptStandard}, and this rebuild has no --capabilities, so it would bring back the 'Business Capability' sheet of ${taxonomyName}. Add --capabilities <${keptStandard}> to keep the standard, or --capabilities-from-taxonomy to go back to the sheet on purpose. Nothing was written.`);
  // Only a data.json snapshot is ever replaced, so a mistyped --output cannot overwrite a workbook,
  // an exported workspace or another file.
  if(existingText!==null&&!isDataSnapshot(existingText))fail(`${relative(output)} exists but is not a data.json snapshot (a JSON object with an "apps" list); it may be a workbook or another file. Nothing was written. Check --output.`);
  try{mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,text,'utf8');}
  catch(error){fail(`Cannot write ${relative(output)}: ${error.message}.`);}
  out(`Wrote ${relative(output)} from ${inventoryName} and ${taxonomyName}${standardName?` with ${standardName}`:''}.`);
  for(const line of info)out(line);
  if(differences===null)out('Changes from the previous file: none to compare (new file).');
  else if(!differences.length)out('Changes from the previous file: none (identical bytes).');
  else{out('Changes from the previous file (old value -> new value):');for(const line of report(differences))out('  '+line);}
  return 0;
 }catch(error){
  err(error instanceof PrepareDataError?`Error: ${error.message}`:`Unexpected error: ${error?.stack||error}`);
  return 2;
 }
}

const invokedDirectly=(()=>{try{return Boolean(process.argv[1])&&realpathSync.native(process.argv[1])===realpathSync.native(fileURLToPath(import.meta.url));}catch{return false;}})();
if(invokedDirectly)process.exitCode=await main();

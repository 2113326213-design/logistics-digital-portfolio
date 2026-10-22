// The business capability standard (standard+name.xlsx, sheet 'Standard Name') as the capability catalogue
// (owner decision 2026-10-16): reading the standard, taxonomy workbooks with and without it, the combined
// taxonomy source, catalogue change counts in the import preview, and the recorded switch in public/data.json.
// Owner decision 2026-10-19 ("HC 去除，这不属于我们部门的"): HC capabilities belong to another department, so the
// standard's HC entries are left out of the catalogue (recorded as a second taxonomy event); applications keep their HC records.
import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {installDOMParser} from '../scripts/xml-dom.mjs';
import {readXlsx,taxonomyFromSheets,capabilityRowsFromStandard,taxonomySourceName,processTaxonomySource,OTHER_DEPARTMENT_CODE} from '../public/xlsx.mjs';
import {capabilityCatalogueChanges,previewImport,catalogueNotice,importAppliedStatus} from '../public/import-review.mjs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold,textEvidence} from '../public/weighted.mjs';
import {pairResultLabel,pairStatusReason} from '../public/pair-status.mjs';
// codeEvidenceScore (owner decision 2026-10-19) is read from the module namespace, so that a build without it fails only
// the tests that use it.
import * as pairStatusModule from '../public/pair-status.mjs';
import {similarityCSV} from '../public/exports.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {recordImport,cleanImportHistory,importEvents,applicationTimeline,applicationTimelineCSV} from '../public/application-history.mjs';
import {chronologicalEvents,renderHistoryRecords} from '../public/history-view.mjs';
import {capCode,split,otherCompanyRecord} from '../public/codes.mjs';
import {taxonomySheets,xlsxBuffer} from './source-workbooks.mjs';
import {recordsBefore20261020,EXPORT_FILE} from './records-before-20261020.mjs';

installDOMParser();
// This file pins the catalogue switch (2026-10-16) and the HC removal (2026-10-19) as recorded in public/data.json. Since
// V9.16 (2026-10-21) the file also holds the LeanIX application export of 2026-10-20 (new application records and a third
// import event), so the history checks below run on the records before that export, restored from its import event;
// the last test checks that the export changed only application records and added exactly that one event.
const current=JSON.parse(readFileSync(RECORDS_V916,'utf8'));
const raw=recordsBefore20261020(current),data=workspaceData(raw);
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url),'utf8'));
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
// The workspace before the switch: the same applications and processes with the 2026-10-15 catalogue and no history.
const {importHistory:_history,applicationEvents:_events,...shipped}=raw;
const legacy=workspaceData({...shipped,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sorted=values=>[...values].sort();
// Since 2026-10-22 HC records (another company) take part in no check, so recomputing a stored event gives it without
// its HC records; the stored history itself stays as it was recorded.
const ownRecords=e=>({...e,issues:(e.issues||[]).filter(i=>!otherCompanyRecord(i.record))});
const PROCESS_BOOK='Business Capability + Process.xlsx',STANDARD_BOOK='standard+name.xlsx';
const HEADER=['Level 1 Code','Level 1 Name','Level 2 Code','Level 2 Name','Level 3 Code','Level 3 Name'];
// The layout of the real standard+name.xlsx (checked 2026-10-16): header on row 1, one entry per row, each row
// repeating its parent levels, blank cells for missing levels. Each "CODE Name" label is split back into its two cells.
const standardRow=row=>row.flatMap(label=>label?[label.match(/^\S+/)[0],label.replace(/^\S+ /,'')]:[null,null]);
const standardSheet=rows=>[HEADER,...rows.map(standardRow)];
const workbook=(sheets,name)=>new File([xlsxBuffer(sheets)],name);
const noChanges={renamed:0,added:0,removed:0,total:0};
// Code -> first label in a catalogue, by capCode (B.06.2.01 and B.06.2.1 are one code).
const catalogue=rows=>{const map=new Map();for(const row of rows)for(const label of row)if(label&&capCode(label)&&!map.has(capCode(label)))map.set(capCode(label),label);return map;};
const L=new Map(raw.apps.map(app=>[app.ID.trim(),app]));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// The real standard+name.xlsx (checked again 2026-10-19 against the file): the 61 entries of public/data.json on sheet
// rows 2-62, then these ten HC.06 entries on rows 63-72, in the same layout. They belong to another department.
const HC_ENTRIES=[['HC.06.01 Supply Chain Planning',null],['HC.06.01 Supply Chain Planning','HC.06.01.01 Demand Planning'],
 ['HC.06.01 Supply Chain Planning','HC.06.01.02 Sales and Operations Planning'],['HC.06.01 Supply Chain Planning','HC.06.01.03 Customer Order Planning'],
 ['HC.06.01 Supply Chain Planning','HC.06.01.04 Supply Planning'],['HC.06.01 Supply Chain Planning','HC.06.01.05 Detailed Production Scheduling'],
 ['HC.06.02 Intralogistics Management',null],['HC.06.02 Intralogistics Management','HC.06.02.01 Inbound & Receiving Management'],
 ['HC.06.02 Intralogistics Management','HC.06.02.02 Material Flow & Storage Management'],['HC.06.02 Intralogistics Management','HC.06.02.03 Outbound & Shipping Management']].map(row=>['B.06 Logistics Management',...row]);
const HC_CODES=['HC.06.1','HC.06.1.1','HC.06.1.2','HC.06.1.3','HC.06.1.4','HC.06.1.5','HC.06.2','HC.06.2.1','HC.06.2.2','HC.06.2.3'];
const REAL_STANDARD=[...raw.capabilityRows,...HC_ENTRIES],realSheet=()=>standardSheet(REAL_STANDARD);
const isOtherDepartment=row=>row.some(label=>label&&OTHER_DEPARTMENT_CODE.test(label));
// The applications that record HC capabilities (they keep these records; HC.02 was never in any catalogue).
const VMCN='8aa81a3c-259e-400e-9eb4-1a792cb12d08',WUJ='2be34702-a301-49bd-b00c-0d235639253d';
// The workspace between the switch (2026-10-16, HC entries still taken) and the HC removal (2026-10-19).
const beforeRemoval=workspaceData({...shipped,capabilityRows:REAL_STANDARD,importHistory:raw.importHistory.slice(0,1)});

test('capabilityRowsFromStandard finds the header by name, keeps names as recorded and writes blank levels as null',()=>{
 const rows=[['Business capability standard'],[],['Remark','Level 3 Name','Level 3 Code','Level 1 Code','Level 1 Name','Level 2 Code','Level 2 Name'],
  [null,null,null,' B.06 ','  Logistics Management ',null,null],
  ['first level 2',null,null,'B.06','Logistics Management','B.06.1','Supply Chain (Logistics)  Strategy and Design Management'],
  ['  ',null,'',null,null],
  [null,'Document Exchange & Release Mgmt','B.06.9.4','B.06','Logistics Management','B.06.9','Logistics Partner Management and Supply Chain Collaboration'],
  [],
  [null,'Traceability','B.06.8.4',null,null,'B.06.8','Supply Chain (Logistics) Performance Monitoring and Analytics'],
  [null,'Demand Planning','HC.06.01.01','B.06','Logistics Management','HC.06.01','Supply Chain Planning'],
  [null,'Sales and Operations Planning ',' B.06.2.01','B.06','Logistics Management','B.06.2','Supply Chain (Logistics) Planning for Demand-Driven Fulfillment'],
  [null,'Customer Order Planning','B.06.2.10','B.06','Logistics Management','B.06.2','Supply Chain (Logistics) Planning for Demand-Driven Fulfillment']];
 assert.deepEqual(capabilityRowsFromStandard(rows),[
  ['B.06 Logistics Management',null,null],
  ['B.06 Logistics Management','B.06.1 Supply Chain (Logistics)  Strategy and Design Management',null],
  ['B.06 Logistics Management','B.06.9 Logistics Partner Management and Supply Chain Collaboration','B.06.9.4 Document Exchange & Release Mgmt'],
  [null,'B.06.8 Supply Chain (Logistics) Performance Monitoring and Analytics','B.06.8.4 Traceability'],
  ['B.06 Logistics Management','B.06.2 Supply Chain (Logistics) Planning for Demand-Driven Fulfillment','B.06.2.01 Sales and Operations Planning'],
  ['B.06 Logistics Management','B.06.2 Supply Chain (Logistics) Planning for Demand-Driven Fulfillment','B.06.2.10 Customer Order Planning']],
  'title, blank and whitespace-only rows are skipped; the HC.06.01.01 row (another department) is left out; codes and names are trimmed at the ends only; abbreviations, "&" and two-digit codes stay as written');
 // Two-digit and HC codes (as applications record them) compare by capCode; B.06.2.10 stays a code of its own.
 assert.equal(capCode('B.06.2.01 Sales and Operations Planning'),capCode('B.06.2.1 Sales and Operations Planning'));assert.equal(capCode('B.06.2.01 X'),'B.06.2.1');
 assert.equal(capCode('B.06.2.10 Customer Order Planning'),'B.06.2.10');assert.equal(capCode('HC.06.01.01 Demand Planning'),'HC.06.1.1');assert.equal(capCode('HC.06.01 Supply Chain Planning'),'HC.06.1');
});

test('the 71-entry real standard reads back as the 61-entry catalogue in public/data.json, with B.06.9.x, without HC.06.xx and with no truncated names',async()=>{
 // The 71 entries are what the real file gave on 2026-10-16, when HC entries were still taken (the hash pinned then).
 assert.equal(hash(REAL_STANDARD),'ffab66b4b8c1e20ff4ffd140e147b04e1df8f4544a7c0dce2859e65ec16eee23');
 const sheet=realSheet();assert.equal(sheet.length,72);
 assert.deepEqual(capabilityRowsFromStandard(sheet),raw.capabilityRows,'the ten HC entries on rows 63-72 are left out');
 const read=taxonomyFromSheets(await readXlsx(workbook({'Standard Name':sheet},STANDARD_BOOK)));
 assert.deepEqual(read,{capabilityRows:raw.capabilityRows},'the .xlsx round trip gives the same rows, blank levels null');
 const own=standardSheet(raw.capabilityRows);assert.equal(own.length,62);assert.deepEqual(capabilityRowsFromStandard(own),raw.capabilityRows,'the catalogue written as a standard reads back as itself');
 // Each row adds exactly one new code: the deepest filled level.
 const deepest=raw.capabilityRows.map(row=>capCode(row.filter(Boolean).at(-1)));
 assert.equal(new Set(deepest).size,61);assert.deepEqual(sorted(deepest),sorted(catalogue(raw.capabilityRows).keys()));
 // Level 2 loses HC.06.01 and HC.06.02 (11 -> 9), Level 3 the eight HC.06.0x.0y entries (59 -> 51).
 assert.deepEqual([1,2,3].map(level=>new Set(raw.capabilityRows.map(row=>row[level-1]).filter(Boolean)).size),[1,9,51]);
 for(const code of ['B.06.9.1','B.06.9.7'])assert(deepest.includes(code),code);
 for(const code of HC_CODES)assert(!deepest.includes(code),code);
 assert(!raw.capabilityRows.some(isOtherDepartment),'no HC label at any level');
 const dots=String.fromCharCode(0x2026);
 assert(raw.capabilityRows.flat().filter(Boolean).every(label=>!label.includes(dots)),'no truncated names');
 assert(old.capabilityRows.flat().some(label=>label?.includes(dots)),'the 2026-10-15 catalogue had truncated names');
 assert.equal(catalogue(raw.capabilityRows).get('B.06.5'),'B.06.5 Material Flow Orchestration');assert.equal(catalogue(old.capabilityRows).get('B.06.5'),'B.06.5 Intra Logistics Management');
 assert.equal(catalogue(raw.capabilityRows).get('B.06.1.1'),'B.06.1.1 Supply Chain (Logistics) Strategy Development');
});

test('capabilityRowsFromStandard stops on a missing header, missing columns, non-code text, a code without a name or one code with two names',async()=>{
 const fails=(rows,message)=>assert.throws(()=>capabilityRowsFromStandard(rows),{message});
 const top=['B.06','Logistics Management'];
 fails([['Code','Name'],top],"'Standard Name' has no header row with a 'Level 1 Code' column.");
 fails([['Level 1 Code','Level 1 Name','Level 2 Code','Level 3 Name'],top],"'Standard Name' is missing the columns 'Level 2 Name', 'Level 3 Code'.");
 fails([HEADER.filter(name=>name!=='Level 3 Name'),top],"'Standard Name' is missing the column 'Level 3 Name'.");
 fails([HEADER],"'Standard Name' has no capability rows.");fails([HEADER,[],['  ',null]],"'Standard Name' has no capability rows.");
 fails([HEADER,top,[...top,'A','Order Planning Management']],`'Standard Name' row 3, Level 2: "A" is not a capability code.`);
 fails([HEADER,[...top,'b.06.1','Strategy']],`'Standard Name' row 2, Level 2: "b.06.1" is not a capability code.`);
 fails([HEADER,[...top,'B.06.1 Strategy','Strategy']],`'Standard Name' row 2, Level 2: "B.06.1 Strategy" is not a capability code.`);
 fails([HEADER,[...top,null,'Supply Chain Planning']],`'Standard Name' row 2, Level 2: "" is not a capability code.`);
 fails([HEADER,top,[...top,'B.06.1','  ']],"'Standard Name' row 3, Level 2: code B.06.1 has no name.");
 fails([HEADER,[...top,'B.06.1','Strategy'],top,[...top,'B.06.1','Strategy and Design']],`'Standard Name' rows 2 and 4 give B.06.1 two different names: "Strategy" and "Strategy and Design".`);
 fails([HEADER,['B.06','Logistics Management'],['B.06','Logistics Mgmt.']],`'Standard Name' rows 2 and 3 give B.06 two different names: "Logistics Management" and "Logistics Mgmt.".`);
 // B.06.2.01 and B.06.2.1 (and B.06.01 and B.06.1) are the same code.
 const planning=[...top,'B.06.2','Planning'];
 fails([HEADER,[...planning,'B.06.2.01','Sales and Operations Planning'],[...planning,'B.06.2.1','Sales & Operations Planning']],`'Standard Name' rows 2 and 3 give B.06.2.1 two different names: "Sales and Operations Planning" and "Sales & Operations Planning".`);
 assert.deepEqual(capabilityRowsFromStandard([HEADER,[...planning,'B.06.2.01','Sales and Operations Planning'],[...planning,'B.06.2.1','Sales and Operations Planning']]).map(row=>row[2]),['B.06.2.01 Sales and Operations Planning','B.06.2.01 Sales and Operations Planning'],'one code written two ways with one name is one entry, kept in its first spelling');
 fails([HEADER,[...top,'B.06.01','Supply Chain Planning'],[...top,'B.06.1','Supply Chain Strategy']],`'Standard Name' rows 2 and 3 give B.06.1 two different names: "Supply Chain Planning" and "Supply Chain Strategy".`);
 // The same conflict between HC entries is another department's and does not stop the import (see the HC test below).
 const hc=[...top,'HC.06.01','Supply Chain Planning'];
 assert.deepEqual(capabilityRowsFromStandard([HEADER,top,[...hc,'HC.06.01.01','Demand Planning'],[...hc,'HC.06.1.1','Demand Forecasting']]),[['B.06 Logistics Management',null,null]]);
 // Row numbers are Excel row numbers, also with a title above the header and empty rows in between.
 const sheet=[['Capability standard 2026'],[],HEADER,top,[],[...top,'B.06.1',null],[...top,'B.06.1','Strategy']];
 const rows=(await readXlsx(workbook({'Standard Name':sheet},STANDARD_BOOK)))['Standard Name'];
 assert.throws(()=>taxonomyFromSheets({'Standard Name':rows}),{message:"'Standard Name' row 6, Level 2: code B.06.1 has no name."});
 const twice=[['Capability standard 2026'],[],HEADER,[...top,'B.06.1','Strategy'],[],[],[...top,'B.06.1','Strategy and Design']];
 await assert.rejects(async()=>taxonomyFromSheets(await readXlsx(workbook({'Standard Name':twice},STANDARD_BOOK))),{message:`'Standard Name' rows 4 and 7 give B.06.1 two different names: "Strategy" and "Strategy and Design".`});
});

test('HC entries belong to another department: the real standard keeps none, HC rows (even invalid ones) are left out before checking, applications keep their HC records',async()=>{
 // OTHER_DEPARTMENT_CODE is the one rule: a code that starts with "HC." (codes are written in capitals).
 assert(OTHER_DEPARTMENT_CODE instanceof RegExp);assert.equal(OTHER_DEPARTMENT_CODE.source,'^HC\\.');assert.equal(OTHER_DEPARTMENT_CODE.flags,'');
 for(const code of ['HC.06','HC.06.01','HC.06.01.01','HC.02.04.05'])assert(OTHER_DEPARTMENT_CODE.test(code),code);
 for(const code of ['B.06','B.06.9.1','XHC.06.01','HCX.06.01','HC06'])assert(!OTHER_DEPARTMENT_CODE.test(code),code);
 assert.match(capabilityRowsFromStandard.toString(),/OTHER_DEPARTMENT_CODE\.test\(/,'capabilityRowsFromStandard applies the exported rule');
 // The real standard: exactly its entries without an HC code are kept, so none of its ten HC entries.
 const kept=capabilityRowsFromStandard(realSheet());
 assert.deepEqual(kept,REAL_STANDARD.filter(row=>!isOtherDepartment(row)));assert.equal(kept.length,61);
 assert.deepEqual(REAL_STANDARD.filter(isOtherDepartment),HC_ENTRIES);
 assert.deepEqual(sorted(HC_ENTRIES.map(row=>capCode(row.filter(Boolean).at(-1)))),sorted(HC_CODES));
 const codes=catalogue(kept);for(const code of HC_CODES)assert(!codes.has(code),code);
 const sheet=realSheet();
 assert(sheet.slice(62).every(row=>OTHER_DEPARTMENT_CODE.test(row[2]))&&sheet.slice(1,62).every(row=>!row.some(cell=>OTHER_DEPARTMENT_CODE.test(String(cell??'')))),'HC entries on sheet rows 63-72 only');
 assert.throws(()=>capabilityRowsFromStandard(standardSheet(HC_ENTRIES)),{message:"'Standard Name' has no capability rows."},'a standard with only HC entries gives no catalogue');

 // A synthetic standard: HC rows at every level, some with data that would stop the import if it were checked.
 const top=['B.06','Logistics Management'],partner=[...top,'B.06.9','Logistics Partner Management'],hc=[...top,'HC.06.01','Supply Chain Planning'];
 const invalid=[
  [...top,'HC.06.02',null],                                       // an HC code without a name
  [...top,'HC.06.x','Supply Chain Planning'],                     // not a capability code
  [...top,'HC.06.02 Intralogistics','Intralogistics Management'], // code and name in one cell
  [...hc,'HC.06.1.1','Demand Forecasting'],                       // the code of HC.06.01.01 with another name
  [...top,'B.06.9','Partner Management','HC.06.09.01','Collaboration'], // under an HC entry, B.06.9 with another name than below
  ['HC.06','Other Department',null,'Planning']];                  // HC at Level 1, a Level 2 name without a code
 const rows=[HEADER,top,hc,[...hc,'HC.06.01.01','Demand Planning'],...invalid,partner,[...partner,'B.06.9.1','Logistics Collaboration Suppliers']];
 const expected=[['B.06 Logistics Management',null,null],['B.06 Logistics Management','B.06.9 Logistics Partner Management',null],['B.06 Logistics Management','B.06.9 Logistics Partner Management','B.06.9.1 Logistics Collaboration Suppliers']];
 assert.deepEqual(capabilityRowsFromStandard(rows),expected,'only the non-HC rows; the invalid HC rows do not stop the import');
 // Each of those rows would stop the import as a code of this department (HC. written as HD.).
 const own=row=>row.map(cell=>typeof cell==='string'?cell.replace(/^HC\./,'HD.'):cell);
 for(const row of invalid)assert.throws(()=>capabilityRowsFromStandard([HEADER,top,own(hc),own([...hc,'HC.06.01.01','Demand Planning']),own(row),partner,[...partner,'B.06.9.1','Logistics Collaboration Suppliers']]),{message:/^'Standard Name' rows? \d+/},JSON.stringify(row));
 // In the browser: the same through the .xlsx reader, and a later broken row keeps its Excel row number.
 assert.deepEqual(taxonomyFromSheets(await readXlsx(workbook({'Standard Name':rows},STANDARD_BOOK))),{capabilityRows:expected});
 await assert.rejects(async()=>taxonomyFromSheets(await readXlsx(workbook({'Standard Name':[...rows,[...partner,'B.06.9.2',null]]},STANDARD_BOOK))),{message:"'Standard Name' row 13, Level 3: code B.06.9.2 has no name."});

 // The applications keep their own HC records (byte for byte the v3 release applications); none is in the catalogue now.
 const records=[];for(const app of raw.apps)for(const record of split(app['Business Capabilities']))if(OTHER_DEPARTMENT_CODE.test(record))records.push([app.ID.trim(),record]);
 assert.deepEqual(records,[[VMCN,'HC.06.01.01 Demand Planning'],[VMCN,'HC.06.01.05 Detailed Production Scheduling'],[WUJ,'HC.02.04.05 Transportation Management']]);
 assert.equal(L.get(VMCN).Name,'VMCN_CONNEX');assert.match(L.get(WUJ).Name,/^Wuj HK AGV/);
 assert.equal(hash(raw.apps),'dc65a6f3702720bb61aed9e8279fa5b8bd93d608cc628afa1e4dd6713574ec05');
 const now=catalogue(raw.capabilityRows),then=catalogue(REAL_STANDARD);
 assert.deepEqual(records.map(([,record])=>[now.has(capCode(record)),then.has(capCode(record))]),[[false,true],[false,true],[false,false]],'HC.06.01.01 and HC.06.01.05 left the catalogue; HC.02.04.05 was never in it');
});

test('taxonomyFromSheets: a standard-only workbook gives only capabilityRows, a standard sheet beside the processes wins, the old workbook is unchanged',async()=>{
 const oldBook=taxonomySheets(legacy),standard={'Standard Name':realSheet()};
 assert.deepEqual(Object.keys(oldBook),['Business Capability','Data_RBW Process Structure']);
 const only=taxonomyFromSheets(standard);
 assert.deepEqual(Object.keys(only),['capabilityRows'],'no processRows, so the current process taxonomy is kept');assert.deepEqual(only.capabilityRows,raw.capabilityRows);
 assert.deepEqual(Object.keys(taxonomyFromSheets({...standard,'Business Capability':oldBook['Business Capability']})),['capabilityRows'],'without a process sheet the workbook is a capability standard');
 for(const sheets of [{...oldBook,...standard},{'Data_RBW Process Structure':oldBook['Data_RBW Process Structure'],...standard}]){
  const both=taxonomyFromSheets(sheets);
  assert.deepEqual(both,{capabilityRows:raw.capabilityRows,processRows:data.processRows},'the standard replaces the Business Capability sheet; processes are read as before');
 }
 // The old two-sheet workbook reads exactly as before the change: first three columns, blanks as '', header row skipped.
 const expected={capabilityRows:old.capabilityRows.map(row=>row.map(value=>value??'')),processRows:data.processRows};
 assert.deepEqual(taxonomyFromSheets(oldBook),expected);
 assert.deepEqual(taxonomyFromSheets(await readXlsx(workbook(oldBook,PROCESS_BOOK))),expected);
 assert.equal(expected.capabilityRows.length,44);
 for(const sheets of [{},{'Data_RBW Process Structure':oldBook['Data_RBW Process Structure']},{'Business Capability':oldBook['Business Capability']}])assert.throws(()=>taxonomyFromSheets(sheets),/Business Capability/);
 assert.throws(()=>taxonomyFromSheets({'Standard Name':[['Level 1 Code']],'Data_RBW Process Structure':oldBook['Data_RBW Process Structure']}),/missing the columns/,'a broken standard is not skipped in favour of nothing');
});

test('taxonomySourceName and processTaxonomySource round trip the combined taxonomy source',()=>{
 assert.equal(raw.taxonomySource,'standard+name.xlsx (capabilities); Business Capability + Process.xlsx (processes)');
 assert.equal(taxonomySourceName(PROCESS_BOOK,STANDARD_BOOK),raw.taxonomySource);
 assert.equal(processTaxonomySource(raw.taxonomySource),PROCESS_BOOK);
 for(const source of [PROCESS_BOOK,old.taxonomySource,'Workspace taxonomy','Process (processes).xlsx'])assert.equal(processTaxonomySource(source),source,source);
 assert.equal(processTaxonomySource(undefined),'');assert.equal(processTaxonomySource(null),'');
 // A capability file name that itself contains "; " does not shift the split.
 assert.equal(processTaxonomySource(taxonomySourceName(PROCESS_BOOK,'std; v2.xlsx')),PROCESS_BOOK);
 for(const capabilities of ['',undefined,PROCESS_BOOK])assert.equal(taxonomySourceName(PROCESS_BOOK,capabilities),PROCESS_BOOK,String(capabilities));
 // A newer standard replaces the capability file name instead of nesting, and the original comes back the same way.
 const v2=taxonomySourceName(processTaxonomySource(raw.taxonomySource),'standard+name v2.xlsx');
 assert.equal(v2,'standard+name v2.xlsx (capabilities); Business Capability + Process.xlsx (processes)');
 assert.equal(taxonomySourceName(processTaxonomySource(v2),STANDARD_BOOK),raw.taxonomySource);
 const semicolon=taxonomySourceName('Process; 2026.xlsx',STANDARD_BOOK);assert.equal(processTaxonomySource(semicolon),'Process; 2026.xlsx');
});

// Read off the two catalogues by hand (2026-10-15 fixture vs public/data.json): 53 and 61 codes, 46 shared,
// 8 of them with the same label. The ten HC_CODES the real standard also holds were added on 2026-10-16 (25 added
// then) and removed on 2026-10-19; the 2026-10-15 catalogue had no HC code.
const REMOVED=['B.06.1.8','B.06.1.9','B.06.4.4','B.06.4.5','B.06.4.6','B.06.7.4','B.06.7.5'];
const ADDED=['B.06.9','B.06.3.5','B.06.3.6','B.06.5.6','B.06.5.7','B.06.6.4','B.06.6.5','B.06.8.4','B.06.9.1','B.06.9.2','B.06.9.3','B.06.9.4','B.06.9.5','B.06.9.6','B.06.9.7'];
const SAME_LABEL=['B.06','B.06.3','B.06.6','B.06.7','B.06.1.2','B.06.1.3','B.06.3.2','B.06.8.3'];
const SWITCH={renamed:37,added:15,removed:7,total:59};
// The two recorded steps: the switch with the HC entries (2026-10-16) and the HC removal (2026-10-19).
const SWITCH_WITH_HC={renamed:37,added:25,removed:7,total:69},HC_REMOVAL={renamed:0,added:0,removed:10,total:10};

test('capabilityCatalogueChanges counts the switch to the standard by code: 37 renamed, 15 added, 7 removed (25 added before the HC removal)',()=>{
 const before=catalogue(old.capabilityRows),after=catalogue(raw.capabilityRows),withHc=catalogue(REAL_STANDARD);
 assert.deepEqual([before.size,after.size,withHc.size],[53,61,71]);
 assert(![...before.keys()].some(id=>OTHER_DEPARTMENT_CODE.test(id)),'no HC code in the 2026-10-15 catalogue');
 assert.deepEqual(sorted([...withHc.keys()].filter(id=>!after.has(id))),sorted(HC_CODES),'the HC removal takes out exactly the ten HC codes');
 assert.deepEqual(sorted([...withHc.keys()].filter(id=>!before.has(id))),sorted([...ADDED,...HC_CODES]));
 assert(after.size===withHc.size-HC_CODES.length&&[...after].every(([id,label])=>withHc.get(id)===label),'every other entry keeps its label');
 const nameOf=label=>label.slice(label.indexOf(' ')+1).trim();
 const shared=[...after.keys()].filter(id=>before.has(id)),renamed=shared.filter(id=>nameOf(before.get(id))!==nameOf(after.get(id)));
 assert.deepEqual(sorted([...before.keys()].filter(id=>!after.has(id))),sorted(REMOVED));
 assert.deepEqual(sorted([...after.keys()].filter(id=>!before.has(id))),sorted(ADDED));
 assert.deepEqual(sorted(shared.filter(id=>before.get(id)===after.get(id))),sorted(SAME_LABEL));
 assert.equal(shared.length,46);assert.equal(renamed.length,37);
 assert.deepEqual(SWITCH,{renamed:renamed.length,added:ADDED.length,removed:REMOVED.length,total:renamed.length+ADDED.length+REMOVED.length});
 assert.deepEqual(capabilityCatalogueChanges(old.capabilityRows,raw.capabilityRows),SWITCH);
 assert.deepEqual(capabilityCatalogueChanges(legacy.capabilityRows,data.capabilityRows),SWITCH,'blank cells as "" (workspace form) count the same');
 assert.deepEqual(capabilityCatalogueChanges(raw.capabilityRows,old.capabilityRows),{renamed:37,added:7,removed:15,total:59},'going back reverses added and removed');
 assert.deepEqual(capabilityCatalogueChanges(raw.capabilityRows,raw.capabilityRows),noChanges);
 assert.deepEqual(capabilityCatalogueChanges(old.capabilityRows,REAL_STANDARD),SWITCH_WITH_HC);
 assert.deepEqual(capabilityCatalogueChanges(REAL_STANDARD,raw.capabilityRows),HC_REMOVAL);
 assert.deepEqual(capabilityCatalogueChanges(beforeRemoval.capabilityRows,data.capabilityRows),HC_REMOVAL,'blank cells as "" count the same');
 // The old two-digit B.06.2.0x codes are the same codes as B.06.2.x: never added and removed, and renamed
 // only when the name changed (B.06.2.02 -> B.06.2.2 keeps "Material Requirements Planning").
 assert.equal(before.get('B.06.2.2'),'B.06.2.02 Material Requirements Planning');assert.equal(after.get('B.06.2.2'),'B.06.2.2 Material Requirements Planning');
 assert.equal(renamed.filter(id=>id.startsWith('B.06.2.')).length,9);assert(!renamed.includes('B.06.2.2'));
 assert.deepEqual(capabilityCatalogueChanges([['B.06.2.01 Sales'],['A',null,'']],[['B.06.2.1 Sales','B.06.2.10 Order']]),{renamed:0,added:1,removed:0,total:1},'a code written another way is not a rename');
 assert.deepEqual(capabilityCatalogueChanges([['B.06.2.01 Sales']],[['B.06.2.1 Sales Planning']]),{renamed:1,added:0,removed:0,total:1});
 assert.deepEqual(capabilityCatalogueChanges(undefined,[['B.06 Logistics Management']]),{renamed:0,added:1,removed:0,total:1});
});

test('the import preview reports the switch for the real portfolio without changing any application',()=>{
 const preview=previewImport(legacy,{...legacy,capabilityRows:raw.capabilityRows,taxonomySource:raw.taxonomySource});
 assert.deepEqual(preview.capabilityChanges,SWITCH);assert.equal(preview.taxonomyChanged,true);assert.equal(preview.hasChanges,true);
 assert.deepEqual([preview.added.length,preview.removed.length,preview.updated.length,preview.unchanged],[0,0,0,raw.apps.length]);
 assert.equal(preview.appliedMappings,12);assert.equal(preview.staleMappings,0);
 assert.deepEqual(previewImport(data,data).capabilityChanges,noChanges);
 // The preview text in public/app.js, rendered with these counts.
 const row=appSource.match(/\$\{preview\.capabilityChanges\.total\?(`<dt>Capabilities<\/dt>[\s\S]*?<\/dd>`):''\}/)?.[1],reason=appSource.match(/\$\{preview\.capabilityChanges\.total\?(`<p class="review-reason">[\s\S]*?<\/p>`):''\}/)?.[1];
 assert(row&&reason,'capability change templates found');
 assert.equal(runInNewContext(row,{preview}),'<dt>Capabilities</dt><dd>37 renamed · 15 added · 7 removed</dd>');
 assert.equal(runInNewContext(reason,{preview}),'<p class="review-reason">This taxonomy changes the capability catalogue: 37 names, 15 added and 7 removed codes. Similarity results follow the new catalogue; application records are not changed.</p>');
 // The HC removal on the workspace of 2026-10-16: ten codes removed, no application record changed.
 const removal=previewImport(beforeRemoval,{...beforeRemoval,capabilityRows:data.capabilityRows});
 assert.deepEqual(removal.capabilityChanges,HC_REMOVAL);assert.equal(removal.taxonomyChanged,true);assert.equal(removal.hasChanges,true);
 assert.deepEqual([removal.added.length,removal.removed.length,removal.updated.length,removal.unchanged],[0,0,0,raw.apps.length]);
 assert.equal(removal.appliedMappings,12);assert.equal(removal.staleMappings,0);
 assert.equal(runInNewContext(row,{preview:removal}),'<dt>Capabilities</dt><dd>0 renamed · 0 added · 10 removed</dd>');
 assert.equal(runInNewContext(reason,{preview:removal}),'<p class="review-reason">This taxonomy changes the capability catalogue: 0 names, 0 added and 10 removed codes. Similarity results follow the new catalogue; application records are not changed.</p>');
});

test('public/data.json records the switch and the HC removal as two taxonomy events that change no application record',()=>{
 assert.deepEqual(raw.applicationEvents,[]);assert.equal(raw.importHistory.length,2);
 const [event,removal]=raw.importHistory;
 assert.deepEqual(cleanImportHistory(raw.importHistory),raw.importHistory,'stored in the form the program writes');
 assert.equal(event.kind,'taxonomy');assert.equal(event.taxonomyFile,STANDARD_BOOK);assert.equal(event.inventoryFile,'');
 assert.equal(event.source,raw.source);assert.equal(event.taxonomySource,raw.taxonomySource);assert.match(event.at,/^2026-10-16T/);
 assert.deepEqual(event.addedIds,[]);assert.deepEqual(event.changes,[]);assert.equal(event.decisions,undefined);assert.equal(event.appIdsBase,undefined);
 assert.deepEqual(sorted(event.appIds),sorted(L.keys()),'a full event: it covers every application');
 // The applications are byte for byte those of the 2026-10-16 v3 release (sha256 of JSON.stringify(apps) in its public/data.json).
 assert.equal(hash(raw.apps),'dc65a6f3702720bb61aed9e8279fa5b8bd93d608cc628afa1e4dd6713574ec05');
 // recordImport from the 2026-10-15 catalogue to the standard as read then (with its HC entries) gives exactly the first event.
 const again=recordImport(legacy,workspaceData({...shipped,capabilityRows:REAL_STANDARD}),{taxonomyFile:STANDARD_BOOK,at:event.at}).importHistory;
 assert.deepEqual(cleanImportHistory(again).map(e=>({...e,id:event.id})),[ownRecords(event)]);
 // Every check in the event follows from the catalogue change alone (verified by code with capCode).
 const before=catalogue(old.capabilityRows),after=catalogue(REAL_STANDARD),count={};
 for(const issue of event.issues){
  const id=capCode(issue.record),key=`${issue.kind} ${issue.category}`;count[key]=(count[key]||0)+1;
  assert(split(L.get(issue.appId)['Business Capabilities']).includes(issue.record),'the record is the application\'s own text');
  if(issue.category==='能力编码缺失')assert.deepEqual([before.has(id),after.has(id)],issue.kind==='cleared'?[false,true]:[true,false],issue.record);
  else{assert.equal(issue.category,'能力匹配');assert.equal(issue.kind,'cleared');assert.notEqual(before.get(id),issue.record);assert.equal(after.get(id),issue.record,'the recorded name is now the catalogue name');}
 }
 assert.deepEqual(count,{'cleared 能力匹配':22,'cleared 能力编码缺失':9,'flagged 能力编码缺失':1},'22 name-meaning holds cleared, 9 unlisted codes now listed, B.06.4.4 now unlisted');
 // Completeness of the code checks: every recorded capability whose code entered or left the catalogue.
 const entered=[],left=[];
 for(const app of raw.apps)for(const record of split(app['Business Capabilities'])){const id=capCode(record);if(id&&!before.has(id)&&after.has(id))entered.push([app.ID.trim(),record]);if(id&&before.has(id)&&!after.has(id))left.push([app.ID.trim(),record]);}
 assert.deepEqual(sorted(event.issues.filter(i=>i.category==='能力编码缺失'&&i.kind==='cleared').map(i=>JSON.stringify([i.appId,i.record]))),sorted(entered.map(item=>JSON.stringify(item))));
 assert.deepEqual(left,[['d1c48c78-b4ff-45b8-84aa-ef15629dde06','B.06.4.4 Physical Inventory Management']],'the original record is kept although the standard has no B.06.4.4');
 assert.deepEqual(event.issues.filter(i=>i.kind==='flagged').map(i=>[i.appId,i.record]),left);
 assert(entered.some(([appId,record])=>appId===VMCN&&record==='HC.06.01.01 Demand Planning')&&entered.some(([appId,record])=>appId===VMCN&&record==='HC.06.01.05 Detailed Production Scheduling'),'VMCN_CONNEX\'s HC records were listed by the switch');

 // The HC removal: a compact event on top of the switch (same applications), the same standard file and taxonomy source.
 assert.equal(removal.kind,'taxonomy');assert.equal(removal.taxonomyFile,STANDARD_BOOK);assert.equal(removal.inventoryFile,'');
 assert.equal(removal.source,raw.source);assert.equal(removal.taxonomySource,raw.taxonomySource);assert.match(removal.at,/^2026-10-19T/);assert(removal.at>event.at);
 assert.deepEqual(removal.appIds,[]);assert.equal(removal.appIdsBase,event.id);assert.deepEqual(removal.removedIds,[]);
 assert.deepEqual(removal.addedIds,[]);assert.deepEqual(removal.changes,[]);assert.equal(removal.decisions,undefined);
 assert.deepEqual(importEvents(raw.importHistory).map(e=>sorted(e.appIds)),[sorted(L.keys()),sorted(L.keys())],'both events cover every application');
 // recordImport from the workspace after the switch to the catalogue without HC gives exactly the stored history.
 const removed=recordImport(beforeRemoval,workspaceData(shipped),{taxonomyFile:STANDARD_BOOK,at:removal.at}).importHistory;
 assert.deepEqual(cleanImportHistory(removed).map((e,index)=>index===1?{...e,id:removal.id}:e),raw.importHistory.map((e,index)=>index===1?ownRecords(e):e));
 // Its checks are exactly the recorded capabilities whose code left the catalogue; nothing entered and no name changed.
 const now=catalogue(raw.capabilityRows),gone=[],came=[];
 for(const app of raw.apps)for(const record of split(app['Business Capabilities'])){const id=capCode(record);if(id&&after.has(id)&&!now.has(id))gone.push([app.ID.trim(),record]);if(id&&!after.has(id)&&now.has(id))came.push([app.ID.trim(),record]);}
 assert.deepEqual(gone,[[VMCN,'HC.06.01.01 Demand Planning'],[VMCN,'HC.06.01.05 Detailed Production Scheduling']]);assert.deepEqual(came,[]);
 assert.deepEqual(removal.issues,gone.map(([appId,record])=>({appId,kind:'flagged',category:'能力编码缺失',record})),'VMCN_CONNEX keeps its HC records, now outside the catalogue');
 assert(!removal.issues.some(i=>i.appId===WUJ),'HC.02.04.05 was never in the catalogue');
});

test('History shows the switch and the HC removal in English with the standard as taxonomy file',()=>{
 const app=L.get('d1c48c78-b4ff-45b8-84aa-ef15629dde06'),[event,removal]=raw.importHistory;
 const events=chronologicalEvents(applicationTimeline(data,app.ID)),html=renderHistoryRecords(events,{},esc),csv=applicationTimelineCSV(app,events,data.source);
 const main=events.find(e=>e.id===event.id+':'+app.ID.trim()),second=events.find(e=>e.id===removal.id+':'+app.ID.trim());
 assert.equal(main.description,'Taxonomy uploaded; application recalculated');assert.equal(main.taxonomyFile,STANDARD_BOOK);assert.equal(main.inventoryFile,'');
 assert.equal(second.description,'Taxonomy uploaded; application recalculated');assert.equal(second.taxonomyFile,STANDARD_BOOK);assert.equal(second.inventoryFile,'');
 assert(events.indexOf(main)<events.indexOf(second),'oldest first');
 assert(!events.some(e=>e.id.startsWith(removal.id+':issue:')),'the HC removal changes no check of this application');
 assert(events.some(e=>e.kind==='flagged'&&e.description==='Missing capability code: B.06.4.4 Physical Inventory Management'));
 assert(events.some(e=>e.kind==='cleared'&&e.description==='Capability mapping: B.06.5.2 Material Flow and Storage Management'));
 assert(html.includes('Taxonomy file')&&html.includes(STANDARD_BOOK));assert(csv.includes(STANDARD_BOOK));
 for(const text of [html,csv])assert.doesNotMatch(text,/能力|缺失|匹配/);
 assert.deepEqual(importEvents(raw.importHistory).map(e=>e.appIds.length),[raw.apps.length,raw.apps.length]);
 // VMCN_CONNEX: its HC codes were listed by the switch and are unlisted again by the HC removal; its records stay.
 const vmcn=L.get(VMCN),timeline=chronologicalEvents(applicationTimeline(data,vmcn.ID)),vmcnHtml=renderHistoryRecords(timeline,{},esc),vmcnCsv=applicationTimelineCSV(vmcn,timeline,data.source);
 const checks=prefix=>timeline.filter(e=>e.id.startsWith(prefix+':issue:'+VMCN+':')).map(e=>[e.kind,e.description]);
 const hcChecks=kind=>['HC.06.01.01 Demand Planning','HC.06.01.05 Detailed Production Scheduling'].map(record=>[kind,'Missing capability code: '+record]);
 assert.deepEqual(checks(event.id).filter(([,description])=>description.includes('HC.')),hcChecks('cleared'));
 assert.deepEqual(checks(removal.id),hcChecks('flagged'));
 assert(timeline.some(e=>e.id===removal.id+':'+VMCN&&e.description==='Taxonomy uploaded; application recalculated'));
 assert(timeline.findIndex(e=>e.id.startsWith(event.id+':'))<timeline.findIndex(e=>e.id.startsWith(removal.id+':')),'oldest first');
 for(const text of [vmcnHtml,vmcnCsv]){assert(text.includes('Missing capability code: HC.06.01.05 Detailed Production Scheduling'));assert.doesNotMatch(text,/能力|缺失|匹配/);}
});

test('uploading the standard workbook alone in the browser keeps the processes, names both files, leaves out the HC entries and records the stored events',async()=>{
 // Run the taxonomy step of the Import button exactly as written in public/app.js.
 assert(appSource.includes("import {readXlsx,inventoryFromSheets,taxonomyFromSheets,taxonomySourceName,processTaxonomySource} from './xlsx.mjs';"));
 const step=appSource.match(/\n\s*if\(taxonomy\)\{(.*)\}\r?\n/)?.[1];assert(step?.includes('taxonomySourceName(processTaxonomySource(next.taxonomySource),taxonomy.name)'),'taxonomy import step found');
 const AsyncFunction=(async()=>{}).constructor,taxonomyStep=new AsyncFunction('taxonomy','next','readXlsx','taxonomyFromSheets','taxonomySourceName','processTaxonomySource',step+'return next;');
 const upload=async(base,file)=>{const next=await taxonomyStep(file,base,readXlsx,taxonomyFromSheets,taxonomySourceName,processTaxonomySource);return previewImport(base,next,next);};
 // The real standard workbook, with its ten HC entries on rows 63-72.
 const standardBook=()=>workbook({'Standard Name':realSheet()},STANDARD_BOOK);
 const [switchEvent,removalEvent]=raw.importHistory;

 const preview=await upload(legacy,standardBook());
 assert.equal(preview.next.taxonomySource,raw.taxonomySource);
 assert.deepEqual(preview.next.processRows,legacy.processRows,'the process taxonomy is kept');assert.deepEqual(preview.next.capabilityRows,data.capabilityRows,'without the HC entries');
 assert.deepEqual(preview.capabilityChanges,SWITCH);assert.equal(preview.taxonomyChanged,true);assert.equal(preview.hasChanges,true);assert.deepEqual(preview.updated,[]);assert.deepEqual(preview.ownerDecisions,[]);
 // Applying it to the 2026-10-15 workspace now gives one event: the stored switch without VMCN_CONNEX's HC codes
 // being listed (the HC removal undid exactly that).
 const applied=recordImport(legacy,preview.next,{inventoryFile:'',taxonomyFile:STANDARD_BOOK,decisions:preview.ownerDecisions,at:switchEvent.at});
 assert.deepEqual(cleanImportHistory(applied.importHistory).map(e=>({...e,id:switchEvent.id})),[{...switchEvent,issues:switchEvent.issues.filter(i=>!(i.appId===VMCN&&OTHER_DEPARTMENT_CODE.test(i.record)))}]);
 assert.equal(switchEvent.issues.length-applied.importHistory[0].issues.length,2);
 assert.deepEqual(workspaceData(applied).apps,data.apps);

 // Uploading the same standard to the workspace of 2026-10-16 (HC entries still in its catalogue) is the HC removal,
 // and applying it gives the two events stored in public/data.json.
 const removal=await upload(beforeRemoval,standardBook());
 assert.equal(removal.next.taxonomySource,raw.taxonomySource);assert.deepEqual(removal.next.capabilityRows,data.capabilityRows);assert.deepEqual(removal.next.processRows,data.processRows);
 assert.deepEqual(removal.capabilityChanges,HC_REMOVAL);assert.equal(removal.taxonomyChanged,true);assert.equal(removal.hasChanges,true);assert.deepEqual(removal.updated,[]);assert.deepEqual(removal.ownerDecisions,[]);
 const appliedRemoval=recordImport(beforeRemoval,removal.next,{inventoryFile:'',taxonomyFile:STANDARD_BOOK,decisions:removal.ownerDecisions,at:removalEvent.at});
 assert.deepEqual(cleanImportHistory(appliedRemoval.importHistory).map((e,index)=>index===1?{...e,id:removalEvent.id}:e),raw.importHistory.map((e,index)=>index===1?ownRecords(e):e));
 assert.deepEqual(workspaceData(appliedRemoval).apps,data.apps);

 // Re-uploading the same standard changes nothing and keeps the combined source.
 const again=await upload(data,standardBook());
 assert.equal(again.next.taxonomySource,raw.taxonomySource);assert.equal(again.taxonomyChanged,false);assert.equal(again.hasChanges,false);assert.deepEqual(again.capabilityChanges,noChanges);
 // An HC entry with conflicting data does not stop it either (row 65 given the code of row 64 with another name).
 const hcConflict=realSheet().map((row,index)=>index===64?[...row.slice(0,4),'HC.06.1.1','Demand Forecasting']:row);
 assert.deepEqual(realSheet()[63].slice(4),['HC.06.01.01','Demand Planning'],'sheet row 64');
 const conflict=await upload(data,workbook({'Standard Name':hcConflict},STANDARD_BOOK));
 assert.deepEqual(conflict.next.capabilityRows,data.capabilityRows);assert.equal(conflict.taxonomyChanged,false);

 // A single workbook with processes and a Standard Name sheet is named alone; the old workbook brings the old names back and says so.
 const combined=await upload(legacy,workbook({...taxonomySheets(legacy),'Standard Name':realSheet()},'taxonomy with standard.xlsx'));
 assert.equal(combined.next.taxonomySource,'taxonomy with standard.xlsx');assert.deepEqual(combined.next.capabilityRows,data.capabilityRows);assert.deepEqual(combined.next.processRows,data.processRows);
 const reverted=await upload(data,workbook(taxonomySheets(legacy),PROCESS_BOOK));
 assert.equal(reverted.next.taxonomySource,PROCESS_BOOK);assert.deepEqual(reverted.capabilityChanges,{renamed:37,added:7,removed:15,total:59});
 assert.deepEqual(reverted.next.capabilityRows,legacy.capabilityRows);

 // A broken standard stops the import with the Excel row numbers.
 const broken=realSheet().map((row,index)=>index===41?[...row.slice(0,4),'B.06.6.1','Packaging Design']:row);
 assert.deepEqual(realSheet()[40].slice(4),['B.06.6.1','Packaging Design and Engineering'],'sheet row 41');
 await assert.rejects(upload(data,workbook({'Standard Name':broken},STANDARD_BOOK)),{message:`'Standard Name' rows 41 and 42 give B.06.6.1 two different names: "Packaging Design and Engineering" and "Packaging Design".`});
});

test('public/data.json pins the catalogue read from the real standard and keeps the processes and corrections of the v3 release',()=>{
 // capabilityRowsFromStandard of the real standard+name.xlsx (read again 2026-10-19, HC entries left out) gives exactly
 // this hash; read on 2026-10-16 with its HC entries it gave ffab66b4... (REAL_STANDARD, checked above).
 assert.equal(hash(raw.capabilityRows),'1f692064fc70933fe5d2dd82393845781c9e2d9c15377102b0679da6a5aa65e4');
 assert.equal(raw.capabilityRows.length,61);assert.equal(raw.taxonomySource,'standard+name.xlsx (capabilities); Business Capability + Process.xlsx (processes)');
 assert.equal(hash(raw.processRows),'404e4dea88af4e6cf4d4e1c618e925350f9471ed0ff63b98164122abfdbe6675');
 assert.equal(hash(raw.corrections),'4b9d16b1e1f952505c4d8d34499871b7cdf34d20306ae6d7d2187ca1ad7c819a');
});

test('the standard header matches without regard to spaces and capitals, and a remark-only row is not an entry',async()=>{
 assert.deepEqual(capabilityRowsFromStandard([[' level 1 code ','LEVEL 1 NAME','Level 2 Code','Level 2 Name','Level 3 Code ','level 3 name','Remark'],['B.06','Logistics Management',null,null,null,null,'top'],[null,null,null,null,null,null,'remark only']]),[['B.06 Logistics Management',null,null]]);
 // In the browser: the real standard with a remark column and a remark-only row is the same catalogue, so nothing changes.
 const sheet=realSheet(),withRemark=[[...sheet[0],'Remark'],...sheet.slice(1),[null,null,null,null,null,null,'checked by the business']];
 const {capabilityRows}=taxonomyFromSheets(await readXlsx(workbook({'Standard Name':withRemark},STANDARD_BOOK)));
 assert.deepEqual(capabilityRows,raw.capabilityRows);
 assert.equal(previewImport(data,{...data,capabilityRows}).taxonomyChanged,false);
});

test('a restored saved workspace with its own capability list is told how to switch, and nothing is changed',()=>{
 assert.equal(catalogueNotice(legacy,data),`This saved workspace keeps its own capability list (${old.taxonomySource}). The bundled data uses the business capability standard ${STANDARD_BOOK}; to switch, get that workbook from the data owner and import it as the taxonomy in Import data.`);
 assert.equal(catalogueNotice(data,data),'','already on the standard');
 assert.equal(catalogueNotice(legacy,legacy),'','the bundled data names no standard');
 assert.equal(catalogueNotice({...legacy,capabilityRows:data.capabilityRows},data),'','the same catalogue under another source name');
 // V14: not for kept work that came from a server data package at least as new as this file's data (its catalogue is the steward's).
 assert(appSource.includes("const fromPackage=packageNotOlder(merged.data.dataPackage,dataAsOf(initialData)?.date||'');const notice=fromPackage?'':catalogueNotice(merged.data,initialData);if(notice)$('sessionStatus').textContent=notice;"),'shown after a saved workspace is restored');
});

test('the status after an applied import says what changed: applications, else the taxonomy, else the workspace',()=>{
 const none={added:[],updated:[],removed:[],taxonomyChanged:false};
 assert.equal(importAppliedStatus({...none,updated:[{}]},76),'Updated 76 applications.');
 assert.equal(importAppliedStatus({...none,added:[{}],taxonomyChanged:true},77),'Updated 77 applications.');
 assert.equal(importAppliedStatus({...none,taxonomyChanged:true},76),'Taxonomy updated; no application records changed.');
 assert.equal(importAppliedStatus(none,76),'Workspace updated; no application records changed.','e.g. a colleague\'s workspace with other notes or weights');
 // The real switch is a taxonomy-only import; a workspace that differs only in weights is not.
 assert.equal(importAppliedStatus(previewImport(legacy,{...legacy,capabilityRows:data.capabilityRows}),76),'Taxonomy updated; no application records changed.');
 assert.equal(importAppliedStatus(previewImport(data,{...data,similarityWeights:{name:.25,description:.25,cap:.25,process:.25}}),76),'Workspace updated; no application records changed.');
 assert(appSource.includes("$('sessionStatus').textContent=importAppliedStatus(pendingImport,model.apps.length);"),'the page uses it after Apply');
});

// Portfolio results per catalogue and weights, computed once for the tests below (each takes about a second).
const tally=values=>values.reduce((counts,value)=>(counts[value]=(counts[value]||0)+1,counts),{});
const pairName=p=>[p.target.app.Name,p.peer.app.Name].sort().join(' | ');
const CATALOGUES={standard:data,'2026-10-15':legacy},portfolioCache=new Map();
const portfolio=(catalogue,weights)=>{
 const key=catalogue+' '+JSON.stringify(weights??'default weights');
 if(!portfolioCache.has(key)){
  const candidates=portfolioCandidates(createWeightedSimilarity(buildModel(CATALOGUES[catalogue]),weights));
  const byName=new Map(candidates.pairs.map(p=>[pairName(p),p]));assert.equal(byName.size,candidates.pairs.length,'application names are unique');
  portfolioCache.set(key,{candidates,byName,statuses:tally(candidates.pairs.map(p=>p.status)),labels:tally(candidates.pairs.map(p=>pairResultLabel(p,50))),
   thresholds:[30,50,60].map(t=>{const r=portfolioAtThreshold(candidates,t);return [t,r.confirmed.length,r.confirmedPairs.length];})});
 }
 return portfolioCache.get(key);
};
const near=(actual,expected,message)=>assert(typeof actual==='number'&&Math.abs(actual-expected)<1e-12,`${message}: ${actual} is not ${expected}`);
const component=(direction,key)=>direction.components.find(c=>c.key===key);
// This file's own copy of the name words before 2026-10-19 (NFKC, camelCase split, runs of letters and digits, lower
// case) and of owner decision (b) of 2026-10-19 for names as corrected in round 2: the name is NFKC-normalized, the
// "(recovered <timestamp>)" suffix (spaces allowed after the bracket) is removed, and single LETTERS are not words; single
// digits and single Chinese (Han) characters stay words.
const oldNameWords=text=>new Set((String(text??'').normalize('NFKC').replace(/([a-z])([A-Z])/g,'$1 $2').match(/[\p{L}\p{N}]+/gu)||[]).map(word=>word.toLowerCase()));
const isSingleLetter=word=>{const chars=Array.from(word);return chars.length===1&&/\p{L}/u.test(chars[0])&&!/\p{Script=Han}/u.test(chars[0]);};
const newNameWords=text=>new Set([...oldNameWords(String(text??'').normalize('NFKC').replace(/\(\s*recovered\b[^)]*\)/gi,' '))].filter(word=>!isSingleLetter(word)));
// Round 1 of the decision (superseded): the suffix without spaces after the bracket, and every single character dropped.
const roundOneNameWords=text=>new Set([...oldNameWords(String(text??'').replace(/\(recovered\b[^)]*\)/gi,' '))].filter(word=>Array.from(word).length>=2));
const jaccard=(a,b)=>a.size&&b.size?[...a].filter(word=>b.has(word)).length/new Set([...a,...b]).size:null;
// The status and labels a pair had before the 2026-10-19 decision, worked out from its components with this file's own
// copy of the old rules: old name words, and a pair held back when its name and description both score exactly 0 (at any
// weight). Labels of unscored pairs depend only on missing evidence and codes, which the decision did not change.
// Labels are those of the 2026-10-20 status rule (owner request): a confirmed pair below the threshold is 'Below threshold'
// (until 2026-10-20 'Not similar'); investigation pairs take the program's label ('No shared registrations' and 'No complete
// score', until 2026-10-20 'Not similar' and 'Review needed').
const atThreshold=(value,threshold)=>Math.round(value*1e9)>=Math.round(threshold*1e7);
const beforeDecision=p=>{
 const name=jaccard(oldNameWords(p.target.app.Name),oldNameWords(p.peer.app.Name));
 const total=direction=>{const scores=direction.components.map(c=>({...c,score:c.key==='name'?name:c.score}));return scores.some(c=>c.weight>0&&c.score===null)?null:scores.reduce((sum,c)=>sum+(c.score??0)*c.weight,0);};
 const [forward,reverse]=[total(p.forward),total(p.reverse)];
 const status=!p.scopeEligible?'excluded':name===0&&p.forward.components.find(c=>c.key==='description').score===0?'investigation':forward!==null&&reverse!==null?'confirmed':'incomplete';
 const coverage=status==='confirmed'?Math.min(forward,reverse):null;
 const label=threshold=>status==='confirmed'?(atThreshold(coverage,threshold)?'Potential overlap':'Below threshold'):status==='excluded'?'Out of scope':pairResultLabel({...p,status,coverage},threshold);
 return {status,coverage,label30:label(30),label50:label(50)};
};
const thresholdCounts=rows=>[30,50,60].map(t=>{const pairs=rows.filter(r=>r.status==='confirmed'&&atThreshold(r.coverage,t));return [t,new Set(pairs.flatMap(r=>[r.a,r.b])).size,pairs.length];});
// Code evidence (c) worked out from the components: each direction's capability and process points, the lower one.
const ownCodeEvidence=p=>Math.min(...[p.forward,p.reverse].map(d=>d.components.filter(c=>(c.key==='cap'||c.key==='process')&&c.weight>0).reduce((sum,c)=>sum+c.score*c.weight,0)));
const shownPoints=value=>String(Math.round(value*1000)/10); // points out of 100 with at most one decimal, as shown

test('the documented portfolio counts with the standard catalogue and, for contrast, with the 2026-10-15 catalogue (README "Current counts")',()=>{
 const now=portfolio('standard'),before=portfolio('2026-10-15');
 // L3V is Level 3 (owner decision 2026-10-19). Seven L3V records in four applications have no standard L3 of the same
 // name and are pending like any unmatched L3, so no pair with one of these applications is confirmed and every such pair
 // in scope needs confirmation; all other pairs keep their results. Against the counts before the decision this moves
 // 21 confirmed pairs (all below 50) to incomplete (613 -> 592, 625 -> 646) and 116 labels to Needs confirmation
 // (829 -> 945: Not similar 1228 -> 1181, More detail needed 278 -> 214, Review needed 143 -> 138; these historical counts
 // use the labels before 2026-10-20, when 'Not similar' covered both what is now 'Below threshold' (confirmed pairs) and
 // 'No shared registrations' (investigation pairs), and 'Review needed' is now 'No complete score'); at 30 the four
 // applications leave 2 pairs and 2 applications (43 / 73 -> 41 / 71). With the 2026-10-15 catalogue 17 confirmed pairs
 // and 96 labels move the same way.
 const L3V_PENDING=['AUTO-RACK','RBCD LOM Scrap Management Platform','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5'];
 for(const {candidates} of [now,before]){
  const withL3V=candidates.pairs.filter(p=>L3V_PENDING.includes(p.target.app.Name)||L3V_PENDING.includes(p.peer.app.Name));
  assert.equal(withL3V.length,4*75-6,'each of the four applications pairs with the 75 others, six pairs among themselves');
  assert(withL3V.every(p=>p.status!=='confirmed'&&pairResultLabel(p,50)===(p.status==='excluded'?'Out of scope':'Needs confirmation')));
  assert(withL3V.every(p=>[p.forward,p.reverse].some(direction=>direction.components.find(c=>c.key==='process').result.target.pending.some(item=>/\bL3V\s*$/.test(item.value)))));
 }
 // Owner decision 2026-10-19 on the similarity check: (b) name words ignore single letters and the LeanIX
 // "(recovered …)" suffix (round 2: single digits and single Chinese characters stay words); (a) only name/description
 // fields with weight above 0 can hold a pair back (no effect with the default weights); (c) No complete score pairs
 // (named Review needed until 2026-10-20) show their code evidence (labels unchanged by that decision). Labels below are
 // those of the 2026-10-20 status rule: the old 'Not similar' is split into 'Below threshold' (confirmed pairs) and 'No
 // shared registrations' (investigation pairs). Derived independently of the program's new code: the pairs of the code before the
 // change, re-scored by a separate script with its own copy of rule (b) as corrected in round 2 and gate (a), then compared
 // pair by pair with the program (status, pair score, directional minimum, labels at 30 and 50, name score, code evidence,
 // gate: 0 differences in either catalogue). Round 2 keeps every count of round 1: the single digit it gives back ('0' of
 // RBCC I4.0 Visualization (Davis), the only one in the real names) changes only name scores of incomplete pairs. In each
 // catalogue exactly six pairs, whose names shared only a single letter and whose descriptions share no word, go to
 // investigation (next test).
 // Standard catalogue: four of them were confirmed, two incomplete, so 592 - 4 = 588 confirmed, 646 - 2 = 644 incomplete,
 // 1,247 + 6 = 1,253 investigation. The four confirmed ones were Below threshold at 50 (585 - 4 = 581): one (48.5) becomes
 // No complete score (138 + 1 = 139), the other three No shared registrations (596 + 3 = 599); the two incomplete pairs
 // stay Needs confirmation. (Under the labels before 2026-10-20: Not similar 1,181 - 1 = 1,180 = 581 + 599, Review needed
 // 138 + 1 = 139.) At 30 the 48.5 pair leaves and with it QinP FG Smart Label Management, which has no other pair at 30:
 // 41 / 71 -> 40 / 70. The 94 pairs that stay confirmed with a changed score cross none of 30, 50 and 60.
 // 2026-10-15 catalogue: two were confirmed (Below threshold before, No shared registrations now; both were Not similar
 // under the labels before 2026-10-20), four incomplete (Needs confirmation either way): 404 - 2 = 402, 834 - 4 = 830,
 // 1,247 + 6 = 1,253; Below threshold 402 - 2 = 400, No shared registrations 372 + 2 = 374, thresholds unchanged (51
 // confirmed scores change).
 // The label counts at 50 of the standard catalogue are the ones stated with the 2026-10-20 status rule; the other label
 // counts in this test were derived by a short node script that tallied pairResultLabel of the public/ modules per
 // catalogue and threshold (and beforeDecision with 'Below threshold' for the prior counts). Each old 'Not similar' count
 // equals Below threshold + No shared registrations, and each old 'Review needed' count equals No complete score.
 assert.deepEqual(now.statuses,{confirmed:588,incomplete:644,investigation:1253,excluded:365});
 assert.deepEqual(now.labels,{'Potential overlap':7,'Below threshold':581,'No shared registrations':599,'Needs confirmation':945,'More detail needed':214,'No complete score':139,'Out of scope':365});
 assert.deepEqual(now.thresholds,[[30,40,70],[50,8,7],[60,6,3]]);
 assert.deepEqual(now.candidates.pairs.filter(p=>pairResultLabel(p,50)==='Potential overlap').map(pairName).sort(),[
  'CGQB_Logistic_system | CGQB_Logistic_system_Q','CGQB_Logistic_system | Iris','CGQB_Logistic_system | RBCD B308 AGV Traffic Control System',
  'CGQB_Logistic_system_Q | Iris','CGQB_Logistic_system_Q | RBCD B308 AGV Traffic Control System','Control Tower | Physical Logistics Management System','Datahub (recovered 2025-12-19 10:03:06) | RBCC_CDP']);
 // The one pair that leaves threshold 30, and the application that leaves with it.
 const at30=portfolioAtThreshold(now.candidates,30);
 assert(!at30.confirmedPairs.some(p=>pairName(p)==='BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management'));
 assert(!at30.confirmed.some(row=>row.app.Name==='QinP FG Smart Label Management')&&at30.confirmed.some(row=>row.app.Name==='BMLP_Nexeed_IAS@WxP'));
 assert.deepEqual(before.statuses,{confirmed:402,incomplete:830,investigation:1253,excluded:365});
 // 2026-10-15 catalogue at 50 (node script): Not similar 774 = Below threshold 400 (402 confirmed - 2 Potential overlap)
 // + No shared registrations 374; Review needed 85 = No complete score 85.
 assert.deepEqual(before.labels,{'Potential overlap':2,'Below threshold':400,'No shared registrations':374,'Needs confirmation':1450,'More detail needed':174,'No complete score':85,'Out of scope':365});
 assert.deepEqual(before.thresholds,[[30,34,59],[50,4,2],[60,4,2]]);
 // Labels at 30 (same separate script; split by the node script): only the confirmed pairs from 30 to 50 move from Below
 // threshold to Potential overlap. Standard: 7 + 63 = 70 Potential overlap, 581 - 63 = 518 Below threshold, No shared
 // registrations 599 as at 50 (old Not similar 1,117 = 518 + 599); the 48.5 pair, Potential overlap at 30 before the
 // decision, is now No complete score (71 -> 70). 2026-10-15: 2 + 57 = 59 Potential overlap and 400 - 57 = 343 Below
 // threshold, No shared registrations 374 (old Not similar 717 = 343 + 374).
 assert.deepEqual(tally(now.candidates.pairs.map(p=>pairResultLabel(p,30))),{'Potential overlap':70,'Below threshold':518,'No shared registrations':599,'Needs confirmation':945,'More detail needed':214,'No complete score':139,'Out of scope':365});
 assert.deepEqual(tally(before.candidates.pairs.map(p=>pairResultLabel(p,30))),{'Potential overlap':59,'Below threshold':343,'No shared registrations':374,'Needs confirmation':1450,'More detail needed':174,'No complete score':85,'Out of scope':365});
 // The counts before the decision, rebuilt in this file from each pair's components with the old rules (beforeDecision),
 // are the documented ones: standard 592 / 646 / 1,247 / 365, thresholds 41 / 71, 8 / 7, 6 / 3, Not similar 1,181 and
 // Review needed 138 at 50, Potential overlap 71 at 30; 2026-10-15 404 / 834 / 1,247 / 365 with the same thresholds as
 // now. Under the 2026-10-20 labels (node script, beforeDecision with 'Below threshold'): standard Below threshold 585 and
 // No shared registrations 596 at 50 (= 1,181), 521 and 596 at 30 (= 1,117), No complete score 138; 2026-10-15 Below
 // threshold 402 and No shared registrations 372 at 50 (= 774), 345 and 372 at 30 (= 717), No complete score 85.
 const prior={standard:{statuses:{confirmed:592,incomplete:646,investigation:1247,excluded:365},thresholds:[[30,41,71],[50,8,7],[60,6,3]],
   labels50:{'Potential overlap':7,'Below threshold':585,'No shared registrations':596,'Needs confirmation':945,'More detail needed':214,'No complete score':138,'Out of scope':365},
   labels30:{'Potential overlap':71,'Below threshold':521,'No shared registrations':596,'Needs confirmation':945,'More detail needed':214,'No complete score':138,'Out of scope':365}},
  '2026-10-15':{statuses:{confirmed:404,incomplete:834,investigation:1247,excluded:365},thresholds:[[30,34,59],[50,4,2],[60,4,2]],
   labels50:{'Potential overlap':2,'Below threshold':402,'No shared registrations':372,'Needs confirmation':1450,'More detail needed':174,'No complete score':85,'Out of scope':365},
   labels30:{'Potential overlap':59,'Below threshold':345,'No shared registrations':372,'Needs confirmation':1450,'More detail needed':174,'No complete score':85,'Out of scope':365}}};
 for(const [catalogue,expected] of Object.entries(prior)){
  const rows=portfolio(catalogue).candidates.pairs.map(p=>({a:p.target.app.Name,b:p.peer.app.Name,...beforeDecision(p)}));
  assert.deepEqual({statuses:tally(rows.map(r=>r.status)),thresholds:thresholdCounts(rows),labels50:tally(rows.map(r=>r.label50)),labels30:tally(rows.map(r=>r.label30))},expected,catalogue);
 }
});

// The six pairs per catalogue that the 2026-10-19 name rule (b) sends to investigation: their names shared exactly one
// word, a single letter ('p' split by camelCase from the plant codes QinP / WxP / ShzP, 'i' from I-PFEP / iTracker /
// iWPC / iSCMP), and their descriptions share none. Name Jaccard before, by hand: 1/10, 1/8, 1/8, 1/4, 1/6, 1/10; now 0.
const SINGLE_LETTER_PAIRS={
 'BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management':'p','QinP FG Smart Label Management | ShzP_Karis':'p','QinP FG Smart Label Management | ShzP_DAVIS':'p',
 'RBCC I-PFEP | iTracker':'i','VMCN_iWPC_AKL_Szh5 | iTracker':'i','RBCC I-PFEP | VMCN_iSCMP: Intelligent Supply Chain management platform':'i'};

test('similarity decision 2026-10-19 (b): in each catalogue exactly six pairs, whose names shared only a single letter, go to investigation',()=>{
 // Label after the change (the same at 30 and 50; labels of the 2026-10-20 status rule); before the change, from the code
 // before it: standard: BMLP | QinP confirmed 48.5 (Potential overlap at 30, Below threshold at 50); QinP | ShzP_Karis
 // confirmed 1.25, I-PFEP | iTracker confirmed 2.5 and iWPC | iTracker confirmed 1.67 (only the name scored: 1/8, 1/4,
 // 1/6 x 10, so no shared code: Below threshold before, No shared registrations now; both were Not similar under the
 // labels before 2026-10-20); QinP | ShzP_DAVIS and I-PFEP | iSCMP incomplete (process needs confirmation). BMLP | QinP is
 // No complete score now (Review needed before 2026-10-20).
 // 2026-10-15: BMLP | QinP and QinP | ShzP_Karis are incomplete there (capability needs confirmation), the rest as above.
 const expected={
  standard:{'BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management':'No complete score','QinP FG Smart Label Management | ShzP_Karis':'No shared registrations','QinP FG Smart Label Management | ShzP_DAVIS':'Needs confirmation',
   'RBCC I-PFEP | iTracker':'No shared registrations','VMCN_iWPC_AKL_Szh5 | iTracker':'No shared registrations','RBCC I-PFEP | VMCN_iSCMP: Intelligent Supply Chain management platform':'Needs confirmation'},
  '2026-10-15':{'BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management':'Needs confirmation','QinP FG Smart Label Management | ShzP_Karis':'Needs confirmation','QinP FG Smart Label Management | ShzP_DAVIS':'Needs confirmation',
   'RBCC I-PFEP | iTracker':'No shared registrations','VMCN_iWPC_AKL_Szh5 | iTracker':'No shared registrations','RBCC I-PFEP | VMCN_iSCMP: Intelligent Supply Chain management platform':'Needs confirmation'}};
 for(const [catalogue,labels] of Object.entries(expected)){
  const {candidates,byName}=portfolio(catalogue);
  // Exactly these pairs are in investigation although their names shared a word under the old rule.
  const moved=candidates.pairs.filter(p=>p.status==='investigation'&&jaccard(oldNameWords(p.target.app.Name),oldNameWords(p.peer.app.Name))>0);
  assert.deepEqual(moved.map(pairName).sort(),Object.keys(SINGLE_LETTER_PAIRS).sort(),catalogue);
  for(const [name,word] of Object.entries(SINGLE_LETTER_PAIRS)){
   const p=byName.get(name),[a,b]=name.split(' | ');
   assert.deepEqual([...oldNameWords(a)].filter(w=>oldNameWords(b).has(w)),[word],name+': the one word the names shared before');
   assert.deepEqual([component(p.forward,'name').score,component(p.forward,'description').score,component(p.reverse,'name').score],[0,0,0],name);
   assert.deepEqual([p.status,p.zeroText,p.coverage,pairResultLabel(p,30),pairResultLabel(p,50)],['investigation',true,null,labels[name],labels[name]],catalogue+': '+name);
  }
  // These six are the only pairs whose status or label (at 30 or 50) differs from before the decision (beforeDecision,
  // this file's own copy of the old rules); every other pair keeps both. Before, by hand from the old name words:
  // I-PFEP | iTracker 1/4 x 10 = 2.5, iWPC | iTracker 1/6 x 10 = 1.67, QinP | ShzP_Karis 1/8 x 10 = 1.25 points
  // (no code in common), BMLP | QinP 48.5 (see below). Under the labels before 2026-10-20 only BMLP | QinP in the standard
  // catalogue changed its label; with the 2026-10-20 labels the formerly confirmed pairs below the threshold also move from
  // Below threshold to No shared registrations (or, for BMLP | QinP, No complete score).
  const changed=candidates.pairs.map(p=>({p,old:beforeDecision(p)})).filter(({p,old})=>old.status!==p.status||old.label30!==pairResultLabel(p,30)||old.label50!==pairResultLabel(p,50));
  assert.deepEqual(changed.map(({p})=>pairName(p)).sort(),Object.keys(SINGLE_LETTER_PAIRS).sort(),catalogue+': the pairs whose status or label changed');
  const confirmedBefore=catalogue==='standard'?{'BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management':.485,'QinP FG Smart Label Management | ShzP_Karis':.0125,'RBCC I-PFEP | iTracker':.025,'VMCN_iWPC_AKL_Szh5 | iTracker':.1/6}:{'RBCC I-PFEP | iTracker':.025,'VMCN_iWPC_AKL_Szh5 | iTracker':.1/6};
  for(const {p,old} of changed){
   const name=pairName(p),score=confirmedBefore[name];
   assert.equal(old.status,score===undefined?'incomplete':'confirmed',catalogue+': '+name);
   if(score!==undefined)near(old.coverage,score,catalogue+': '+name);
   const was=name.startsWith('BMLP')&&catalogue==='standard'?['Potential overlap','Below threshold']:score===undefined?['Needs confirmation','Needs confirmation']:['Below threshold','Below threshold'];
   assert.deepEqual([old.label30,old.label50],was,catalogue+': '+name);
  }
 }
 // BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management (standard catalogue), by hand from its components: from BMLP,
 // capability 25% x 30 + process 100% x 40 = 47.5; from QinP, 100% x 30 + 50% x 40 = 50. Before the change the shared
 // 'p' added 1/10 x 10 = 1 point to each direction: confirmed at min(48.5, 51) = 48.5. Now no pair score; code evidence
 // min(47.5, 50) = 47.5 out of 100.
 const bmlp=portfolio('standard').byName.get('BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management');
 const [fromBmlp,fromQinp]=bmlp.target.app.Name.startsWith('BMLP')?[bmlp.forward,bmlp.reverse]:[bmlp.reverse,bmlp.forward];
 assert.deepEqual([component(fromBmlp,'cap').score,component(fromBmlp,'process').score,component(fromQinp,'cap').score,component(fromQinp,'process').score],[.25,1,1,.5]);
 near(fromBmlp.coverage,.475,'from BMLP');near(fromQinp.coverage,.5,'from QinP');near(bmlp.directionalMinimum,.475,'directional minimum');
 near(pairStatusModule.codeEvidenceScore?.(bmlp),.475,'code evidence');
 assert.equal(bmlp.reason,'Name and description both have zero overlap; investigate the underlying function before treating this as an opportunity.','default weights: both text fields count');
 assert.equal(pairStatusReason(bmlp,50),'No shared words in names or descriptions; compare the recorded functions. Code evidence 47.5 / 100 from capabilities and processes; not a pair score.');
});

// The 21 application names whose words change under rule (b) as corrected in round 2, worked out by hand from the names:
// single letters split off by camelCase or punctuation (WxP -> wx p, iTracker -> i tracker, E-Queue -> e queue,
// w/ -> w, system_Q -> q) and the "(recovered <timestamp>)" suffix of four LeanIX names. The other 55 keep their words,
// among them RBCC I4.0 Visualization (Davis): I4.0 -> i4 0, and the single digit 0 stays a word since round 2 (round 1
// dropped it and changed 22 names). No real name holds a Chinese character, a full-width bracket or "( recovered".
const NEW_NAME_WORDS={
 'AGR w/ Camera':['agr','camera'],'BMLP_Nexeed_IAS@WxP':['bmlp','nexeed','ias','wx'],'CGQB_Logistic_system_Q':['cgqb','logistic','system'],
 'CngP/MSE-Nbo Supplier SCM':['cng','mse','nbo','supplier','scm'],'D-sample tracking system':['sample','tracking','system'],
 'Datahub (recovered 2025-12-19 10:03:06)':['datahub'],'iTracker':['tracker'],'QinP FG Smart Label Management':['qin','fg','smart','label','management'],
 'RBAC_ME_i-Warehouse':['rbac','me','warehouse'],'RBCC E-Queue system(Karis)':['rbcc','queue','system','karis'],'RBCC I-PFEP':['rbcc','pfep'],
 'RBCW E-Queue system':['rbcw','queue','system'],
 'RMM System (recovered 2025-12-19 10:03:58)':['rmm','system'],'Scrap Management System (recovered 2025-11-19 08:20:28)':['scrap','management','system'],
 'ShzP_ALICE':['shz','alice'],'ShzP_DAVIS':['shz','davis'],'ShzP_Karis':['shz','karis'],'ShzP_Pad system':['shz','pad','system'],
 'VMCN_iSCMP: Intelligent Supply Chain management platform':['vmcn','scmp','intelligent','supply','chain','management','platform'],
 'VMCN_iWPC_AKL_Szh5':['vmcn','wpc','akl','szh5'],'Wuj HK AGV (recovered 2025-06-26 03:31:37)':['wuj','hk','agv']};
const I40='RBCC I4.0 Visualization (Davis)';

test('similarity decision 2026-10-19 (b): the name words of the real applications and the pair scores that change',()=>{
 const words=name=>textEvidence(name,name).shared; // the program's words of one name: all of them are shared with itself
 for(const app of raw.apps)assert.deepEqual(words(app.Name),NEW_NAME_WORDS[app.Name]??[...oldNameWords(app.Name)],app.Name);
 assert.equal(raw.apps.filter(app=>app.Name in NEW_NAME_WORDS).length,21);
 // Round 2: the single digit of I4.0 is a word again (round 1 gave rbcc, i4, visualization, davis).
 assert.deepEqual(words(I40),['rbcc','i4','0','visualization','davis']);
 // It is the only single-digit word of the 76 names, and none has a Chinese character or a bracket form only round 2 removes.
 assert.deepEqual(raw.apps.flatMap(app=>[...oldNameWords(app.Name)].filter(word=>/^\p{N}$/u.test(word)).map(word=>[app.Name,word])),[[I40,'0']]);
 assert(!raw.apps.some(app=>/\p{Script=Han}/u.test(app.Name)||/\(\s+recovered/i.test(app.Name)||app.Name.normalize('NFKC')!==app.Name));
 // Over all 2,850 pairs (names do not depend on the catalogue) the program's name score is the Jaccard index of this
 // file's copy of rule (b); it differs from the old rule in 234 pairs (180 through single letters only, 42 through the
 // suffix only, 12 through both: counted by the separate script with each rule on its own; round 1 had 242 = 188 + 42 + 12,
 // the 8 more being pairs of RBCC I4.0 Visualization (Davis), listed below). Their statuses now, against those before the
 // change (standard: 98 confirmed, 101 incomplete, 35 excluded; 2026-10-15: 53, 146, 35): six moved to investigation
 // (test above), the others keep their status.
 for(const [catalogue,statuses] of [['standard',{confirmed:94,incomplete:99,investigation:6,excluded:35}],['2026-10-15',{confirmed:51,incomplete:142,investigation:6,excluded:35}]]){
  const changed=[],sinceRoundOne=[];
  for(const p of portfolio(catalogue).candidates.pairs){
   const a=p.target.app.Name,b=p.peer.app.Name,score=component(p.forward,'name').score;
   assert.equal(score,jaccard(newNameWords(a),newNameWords(b)),pairName(p));assert.equal(component(p.reverse,'name').score,score,pairName(p));
   if(score!==jaccard(oldNameWords(a),oldNameWords(b)))changed.push(p);
   if(score!==jaccard(roundOneNameWords(a),roundOneNameWords(b)))sinceRoundOne.push(p);
  }
  assert.equal(changed.length,234,catalogue);assert.deepEqual(tally(changed.map(p=>p.status)),statuses,catalogue);
  // Round 1 -> round 2: exactly the 11 pairs in which RBCC I4.0 Visualization (Davis) shares a word (rbcc or davis) with
  // the other name. Its words grow from 4 to 5, so 1 / (4 + n - 1) becomes 1 / (5 + n - 1), n the other name's words.
  // All 11 are incomplete in both catalogues (Needs confirmation at 30 and 50): no status, label, threshold, pair score or
  // code evidence changes. Against before the decision 8 of them are back to their old score; I-PFEP, E-Queue and
  // ShzP_DAVIS still lost their single letter (old 1/7, 1/9, 1/7).
  const expected={'RBCC E-Queue system(Karis)':[1/8,1/7],'RBCC I-PFEP':[1/6,1/5],'RBCC LOG Control Tower V2':[1/9,1/8],
   'RBCC Production Excution Support System(PESS)':[1/10,1/9],'RBCC Supplier Logistics Management Platform':[1/9,1/8],'RBCC/LOG Digital Twin':[1/8,1/7],
   'RBCC_CDP':[1/6,1/5],'RBCC_IDPS_Intelligent document print system':[1/10,1/9],'RBCC_VNA task management':[1/8,1/7],'ShzP_DAVIS':[1/6,1/5],'VM/LOG-Szh2_DAVIS':[1/8,1/7]};
  assert.deepEqual(sinceRoundOne.map(pairName).sort(),Object.keys(expected).map(other=>[I40,other].sort().join(' | ')).sort(),catalogue);
  for(const p of sinceRoundOne){
   const other=p.target.app.Name===I40?p.peer.app.Name:p.target.app.Name,[now,roundOne]=expected[other];
   near(component(p.forward,'name').score,now,pairName(p));near(jaccard(roundOneNameWords(I40),roundOneNameWords(other)),roundOne,pairName(p));
   assert.deepEqual([p.status,pairResultLabel(p,30),pairResultLabel(p,50),p.coverage,pairStatusModule.codeEvidenceScore?.(p)],['incomplete','Needs confirmation','Needs confirmation',null,null],catalogue+': '+pairName(p));
  }
  assert.equal(sinceRoundOne.filter(p=>changed.includes(p)).length,3,'I-PFEP, E-Queue and ShzP_DAVIS');
 }
 // Score changes of pairs that stay confirmed, by hand from their component scores (weights 10 / 20 / 30 / 40, both
 // directions equal): [pair, name score now, pair score now].
 const {byName}=portfolio('standard');
 for(const [name,nameScore,coverage] of [
  // suffix only: the names shared recovered, 2025, 12, 19, 10, 03 (6 of 11 words) and now share nothing; description 1/6.
  // Was 6/11 x 10 + 1/6 x 20 = 8.79, now 3.33.
  ['Datahub (recovered 2025-12-19 10:03:06) | RMM System (recovered 2025-12-19 10:03:58)',0,.2/6],
  // two suffixes: system, recovered, 2025, 19 (4 of 15 words) -> system (1 of 4); description 1/10. Was 4.67, now 4.5.
  ['RMM System (recovered 2025-12-19 10:03:58) | Scrap Management System (recovered 2025-11-19 08:20:28)',1/4,.1/4+.2/10],
  // single letter: shz, p (2 of 4 words) -> shz (1 of 3); the descriptions keep their single 'p' (5 of 26 words).
  // Was 8.85, now 7.18.
  ['ShzP_ALICE | ShzP_Karis',1/3,.1/3+.2*5/26],
  // single letter: p (1 of 7 words) -> nothing; description 5%, process 100%: was 42.43, now 41, still at 30.
  ['BMLP_Nexeed_IAS@WxP | ShzP_Karis',0,.2*.05+.4]]){
  const p=byName.get(name);assert.equal(p.status,'confirmed',name);assert.equal(component(p.forward,'name').score,nameScore,name);near(p.coverage,coverage,name);
 }
 assert(component(byName.get('ShzP_ALICE | ShzP_Karis').forward,'description').text.shared.includes('p'),'descriptions keep single letters');
 assert.equal(pairResultLabel(byName.get('BMLP_Nexeed_IAS@WxP | ShzP_Karis'),30),'Potential overlap');
});

test('the seven Potential overlap pairs at 50 stay the same; two scores rise because CGQB_Logistic_system_Q loses its single "q"',()=>{
 // Pair scores by hand from the component scores (weights 10 / 20 / 30 / 40; the lower direction):
 const expected={
  // names {cgqb, logistic, system} and {cgqb, logistic, system, q}: 3/4 -> 3/3; description 8/31; capability, process 100%.
  // Was 82.66, now 85.16.
  'CGQB_Logistic_system | CGQB_Logistic_system_Q':.1+.2*8/31+.3+.4,
  // names share nothing; description 1/40; capability 1/3, process 100%: 50.5 unchanged.
  'CGQB_Logistic_system | Iris':.2/40+.3/3+.4,
  // names share 'system' (1 of 8 words), descriptions nothing: 51.25 unchanged.
  'CGQB_Logistic_system | RBCD B308 AGV Traffic Control System':.1/8+.3/3+.4,
  // names share nothing before and after; description 1/37: 50.54 unchanged.
  'CGQB_Logistic_system_Q | Iris':.2/37+.3/3+.4,
  // 'system' 1 of 9 words -> 1 of 8 without 'q'; description 1/37. Was 51.65, now 51.79.
  'CGQB_Logistic_system_Q | RBCD B308 AGV Traffic Control System':.1/8+.2/37+.3/3+.4,
  // names share nothing; description 2/25: 71.6 unchanged.
  'Control Tower | Physical Logistics Management System':.2*2/25+.3+.4,
  // the "(recovered …)" words never matched RBCC_CDP; description 2/5: 78 unchanged.
  'Datahub (recovered 2025-12-19 10:03:06) | RBCC_CDP':.2*2/5+.3+.4};
 const {candidates,byName}=portfolio('standard');
 assert.deepEqual(candidates.pairs.filter(p=>pairResultLabel(p,50)==='Potential overlap').map(pairName).sort(),Object.keys(expected).sort());
 for(const [name,coverage] of Object.entries(expected))near(byName.get(name).coverage,coverage,name);
 // The 2026-10-15 catalogue keeps its two Potential overlap pairs and their scores.
 const old15=portfolio('2026-10-15');
 assert.deepEqual(old15.candidates.pairs.filter(p=>pairResultLabel(p,50)==='Potential overlap').map(pairName).sort(),['Control Tower | Physical Logistics Management System','Datahub (recovered 2025-12-19 10:03:06) | RBCC_CDP']);
 for(const name of ['Control Tower | Physical Logistics Management System','Datahub (recovered 2025-12-19 10:03:06) | RBCC_CDP'])near(old15.byName.get(name).coverage,expected[name],name);
});

test('similarity decision 2026-10-19 (c): every No complete score pair shows its code evidence, the lower capability and process total; no other pair has one',()=>{
 // 'No complete score' was named 'Review needed' until the 2026-10-20 status rule; codeEvidenceScore keys on the new label.
 const codeEvidence=pairStatusModule.codeEvidenceScore;
 assert.equal(typeof codeEvidence,'function');
 // Distribution derived independently (component scores of the code before the change, rule (b) and gate (a) applied by
 // the separate script; 0 differences from the program): 139 No complete score pairs in the standard catalogue (138 before
 // plus BMLP | QinP at 47.5), 85 in the 2026-10-15 catalogue. Keys are points out of 100.
 const expected={
  standard:{'30':57,'15':23,'10':21,'20':12,'7.5':9,'5':5,'47.5':4,'40':3,'22.5':2,'6':1,'50':1,'70':1},
  '2026-10-15':{'30':55,'15':11,'10':6,'5':5,'20':4,'40':2,'50':1,'70':1}};
 for(const [catalogue,distribution] of Object.entries(expected)){
  const seen=[];
  for(const p of portfolio(catalogue).candidates.pairs){
   const value=codeEvidence(p);
   if(pairResultLabel(p,50)!=='No complete score'){assert.equal(value,null,pairName(p));continue;}
   // The weighted name and description score 0, so each directional total is its capability and process points.
   assert([p.forward,p.reverse].every(d=>component(d,'name').score===0&&component(d,'description').score===0),pairName(p));
   const own=ownCodeEvidence(p);
   near(value,own,pairName(p));near(p.directionalMinimum,own,pairName(p));
   assert.deepEqual([p.status,p.coverage],['investigation',null],pairName(p));
   assert.equal(pairStatusReason(p,50),`No shared words in names or descriptions; compare the recorded functions. Code evidence ${shownPoints(own)} / 100 from capabilities and processes; not a pair score.`,pairName(p));
   seen.push(String(Math.round(own*1e9)/1e7));
  }
  assert.deepEqual(tally(seen),distribution,catalogue);
 }
 // Owner-confirmed example of 2026-10-15: Iris | RCS-2000 showed 'Unavailable · Review needed' with a directional weighted
 // subtotal of 30.0 (since 2026-10-20 the status reads 'No complete score'); that is its code evidence (capability 100% x
 // 30 in both directions, process 0).
 const {byName}=portfolio('standard'),rcs=byName.get('Iris | RCS-2000'),agv=byName.get('Iris | RBCD B308 AGV Traffic Control System');
 assert.equal(pairResultLabel(rcs,50),'No complete score');near(codeEvidence(rcs),.3,'Iris | RCS-2000');
 assert.equal(pairStatusReason(rcs,50),'No shared words in names or descriptions; compare the recorded functions. Code evidence 30 / 100 from capabilities and processes; not a pair score.');
 // Iris | RBCD B308 AGV Traffic Control System: capability 100% x 30 + process 100% x 40 = 70 in both directions.
 assert.equal(pairResultLabel(agv,50),'No complete score');near(codeEvidence(agv),.7,'Iris | RBCD B308 AGV Traffic Control System');
 // Round 2: the reason names only the code fields that carry weight. One pair at a time (no portfolio needed).
 const model=buildModel(data),id=name=>model.apps.find(app=>app.Name===name).id;
 const pairWith=(weights,a,b)=>createWeightedSimilarity(model,weights).pair(id(a),id(b));
 const AGV='RBCD B308 AGV Traffic Control System',PREFIX='No shared words in names or descriptions; compare the recorded functions.';
 // Process weight 0: weights 1/6, 2/6, 3/6, 0. Iris | RCS-2000 capability 100% x 3/6 = 50 in both directions.
 const capOnly=pairWith({name:.1,description:.2,cap:.3,process:0},'Iris','RCS-2000');
 assert.equal(pairResultLabel(capOnly,50),'No complete score');near(codeEvidence(capOnly),.5,'process weight 0');
 assert.equal(pairStatusReason(capOnly,50),PREFIX+' Code evidence 50 / 100 from capabilities; not a pair score.');
 // Capability weight 0: weights 1/7, 2/7, 0, 4/7. Iris | RBCD B308 process 100% x 4/7 = 57.14 (shown 57.1).
 const processOnly=pairWith({name:.1,description:.2,cap:0,process:.4},'Iris',AGV);
 assert.equal(pairResultLabel(processOnly,50),'No complete score');near(codeEvidence(processOnly),4/7,'capability weight 0');
 assert.equal(pairStatusReason(processOnly,50),PREFIX+' Code evidence 57.1 / 100 from processes; not a pair score.');
 // No code weight: still No complete score, but no code evidence and no code sentence.
 const textOnly=pairWith({name:.5,description:.5,cap:0,process:0},'Iris',AGV);
 assert.deepEqual([textOnly.status,pairResultLabel(textOnly,50),codeEvidence(textOnly),pairStatusReason(textOnly,50)],['investigation','No complete score',null,PREFIX]);
});

test('similarity decision 2026-10-19 (a): only name and description fields with weight above 0 hold a pair back (real portfolio, standard catalogue)',()=>{
 // Counts derived independently like those above (the code before the change run with these weights, gate (a) applied by
 // the separate script; 0 differences from the program). Before the change all three weightings gave 592 confirmed and
 // 1,247 investigation, because a zero name or description held a pair back even at weight 0.
 // Name weight 0: a pair is held back when its descriptions share no word, whatever its names share.
 const W0={name:0,description:.2,cap:.3,process:.4},noName=portfolio('standard',W0);
 assert.deepEqual(noName.statuses,{confirmed:461,incomplete:558,investigation:1466,excluded:365});
 // Labels of the 2026-10-20 status rule, split by a short node script over the public/ modules: the old Not similar 1,155
 // = Below threshold 454 (461 confirmed - 7 Potential overlap) + No shared registrations 701; Review needed 164 = No
 // complete score 164.
 assert.deepEqual(noName.labels,{'Potential overlap':7,'Below threshold':454,'No shared registrations':701,'Needs confirmation':945,'More detail needed':214,'No complete score':164,'Out of scope':365});
 assert.deepEqual(noName.thresholds,[[30,43,61],[50,10,7],[60,6,3]]);
 // CGQB_Logistic_system | D-sample tracking system: the names share 'system' (1 of 5 words), the descriptions nothing.
 // Weights normalized to 0 / 2/9 / 3/9 / 4/9; capability 20% one way and 100% the other, process 0: code evidence
 // min(.2, 1) x 3/9 = 6.67 (shown 6.7). Before the change it was confirmed at 6.67.
 const dsample=noName.byName.get('CGQB_Logistic_system | D-sample tracking system');
 assert.equal(component(dsample.forward,'name').score,1/5);
 assert.deepEqual([dsample.status,pairResultLabel(dsample,50)],['investigation','No complete score']);
 assert.equal(dsample.reason,'Description has zero overlap; investigate the underlying function before treating this as an opportunity.');
 near(pairStatusModule.codeEvidenceScore?.(dsample),.2*3/9,'code evidence');
 assert.equal(pairStatusReason(dsample,50),'No shared words in descriptions; compare the recorded functions. Code evidence 6.7 / 100 from capabilities and processes; not a pair score.');
 // Description weight 0: only the name holds a pair back. Iris | RCS-2000: names share nothing; capability 100% x 3/8.
 const noDescription=portfolio('standard',{name:.1,description:0,cap:.3,process:.4});
 assert.deepEqual(noDescription.statuses,{confirmed:216,incomplete:215,investigation:2054,excluded:365});
 const rcs=noDescription.byName.get('Iris | RCS-2000');
 assert.equal(rcs.reason,'Name has zero overlap; investigate the underlying function before treating this as an opportunity.');
 assert.equal(pairStatusReason(rcs,50),'No shared words in names; compare the recorded functions. Code evidence 37.5 / 100 from capabilities and processes; not a pair score.');
 // Name and description weight 0: nothing holds a pair back, so no pair is in investigation and none is No complete score
 // or No shared registrations; the old Not similar 1,303 are all confirmed pairs below 50, now Below threshold
 // (1,326 - 23; node script over the public/ modules).
 const codeOnly=portfolio('standard',{name:0,description:0,cap:.3,process:.4});
 assert.deepEqual(codeOnly.statuses,{confirmed:1326,incomplete:1159,excluded:365});
 assert.deepEqual(codeOnly.labels,{'Potential overlap':23,'Below threshold':1303,'Needs confirmation':945,'More detail needed':214,'Out of scope':365});
 assert.deepEqual(codeOnly.thresholds,[[30,51,141],[50,23,23],[60,14,14]]);
 // Iris | RBCD B308 AGV Traffic Control System: capability and process 100% -> 3/7 + 4/7 = 100; Iris | RCS-2000: 3/7 = 42.86.
 near(codeOnly.byName.get('Iris | RBCD B308 AGV Traffic Control System').coverage,1,'Iris | RBCD B308');near(codeOnly.byName.get('Iris | RCS-2000').coverage,3/7,'Iris | RCS-2000');
 assert(codeOnly.candidates.pairs.every(p=>pairStatusModule.codeEvidenceScore?.(p)===null));
});

test('the weighted CSV reports the zero-text gate as "Zero overlap in all weighted name/description fields", so a pair whose unweighted names overlap can say Yes',()=>{
 // Round 2 of the 2026-10-19 decision renamed the column "Zero name and description overlap" (it said Yes for pairs whose
 // names share words when the name weight is 0); the value is still the gate (a): every weighted name/description field 0.
 const COLUMN='Zero overlap in all weighted name/description fields';
 // The code evidence column, renamed with the 2026-10-20 status rule (was 'Review needed code evidence (out of 100)').
 const CODE_COLUMN='No complete score: code evidence (out of 100)';
 const parse=csv=>csv.replace(String.fromCharCode(0xFEFF),'').split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
 const exported=(pairs,weights)=>{
  const [header,...rows]=parse(similarityCSV(pairs,'weighted',weights?{...data,similarityWeights:weights}:data,{threshold:50}));
  assert.deepEqual(header.filter(name=>/zero/i.test(name)),[COLUMN],'one zero-overlap column, under its new name');
  assert.equal(header.indexOf(COLUMN),header.indexOf(CODE_COLUMN)+1);
  assert(rows.every(row=>row.length===header.length));
  return new Map(rows.map(row=>{const record=Object.fromEntries(header.map((name,index)=>[name,row[index]]));return [[record['Application A'],record['Application B']].sort().join(' | '),record];}));
 };
 const fields=record=>[record[COLUMN],record['Status'],record['Confirmed pair similarity (out of 100)'],record[CODE_COLUMN]];
 const DSAMPLE='CGQB_Logistic_system | D-sample tracking system',BMLP='BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management',RCS='Iris | RCS-2000';
 // Name weight 0: D-sample's names share 'system' (1/5) but carry no weight and the descriptions share nothing, so the
 // gate holds: Yes, No complete score, code evidence min(.2, 1) x 3/9 = 6.6667. Iris | RCS-2000 shares no word at all: Yes.
 const W0={name:0,description:.2,cap:.3,process:.4},noName=portfolio('standard',W0);
 assert(component(noName.byName.get(DSAMPLE).forward,'name').score>0,'the names share a word');
 const zeroName=exported([DSAMPLE,RCS].map(name=>noName.byName.get(name)),W0);
 assert.deepEqual(fields(zeroName.get(DSAMPLE)),['Yes','No complete score','N/A','6.6667']);
 // Iris | RCS-2000 at name weight 0: capability 100% x 3/9 = 33.3333 in both directions.
 assert.deepEqual(fields(zeroName.get(RCS)),['Yes','No complete score','N/A','33.3333']);
 // Default weights: the shared name word now counts, so D-sample is confirmed at 1/5 x 10 + 20% x 30 = 8 (No; a confirmed
 // pair below 50: Below threshold, Not similar before 2026-10-20); BMLP | QinP shares nothing in either weighted field
 // (Yes, code evidence 47.5).
 const standard=portfolio('standard'),byDefault=exported([DSAMPLE,BMLP].map(name=>standard.byName.get(name)),undefined);
 assert.deepEqual(fields(byDefault.get(DSAMPLE)),['No','Below threshold','8.0000','']);
 assert.deepEqual(fields(byDefault.get(BMLP)),['Yes','No complete score','N/A','47.5000']);
});

test('a saved workspace that still lists HC entries is told how to remove them, even under the same source name',()=>{
 const withHC={...data,capabilityRows:[...data.capabilityRows,['B.06 Logistics Management','HC.06.01 Supply Chain Planning','HC.06.01.01 Demand Planning']]};
 assert.equal(withHC.taxonomySource,data.taxonomySource,'saved before 2026-10-19 under the same source name');
 assert.equal(catalogueNotice(withHC,data),`This saved workspace still lists HC capabilities, which belong to another department and were removed from the catalogue on 2026-10-19. To remove them, get the business capability standard ${STANDARD_BOOK} from the data owner and import it as the taxonomy in Import data.`);
 // Another list under the same source name is still reported; the same list is not.
 assert(catalogueNotice({...data,capabilityRows:data.capabilityRows.slice(0,-1)},data).startsWith('This saved workspace keeps its own capability list'));
 assert.equal(catalogueNotice(data,data),'');
});

test('the older Business Capability sheet leaves HC rows out as well',()=>{
 const process=[['RBW E2E Process Chain','Process Level','Process ID','Process Name'],['Plan to Fulfill (P2F)','L1','M.P2F.010','Plan Demand']];
 const {capabilityRows,processRows}=taxonomyFromSheets({'Business Capability':[['L1','L2','L3'],['B.06 Logistics Management','B.06.1 Strategy',''],['B.06 Logistics Management','HC.06.01 Supply Chain Planning','HC.06.01.01 Demand Planning'],[' HC.02 Other','','']],'Data_RBW Process Structure':process});
 assert.deepEqual(capabilityRows,[['B.06 Logistics Management','B.06.1 Strategy','']]);
 assert.deepEqual(processRows,[['Plan to Fulfill (P2F)','L1','M.P2F.010','Plan Demand']]);
});

test('the LeanIX export of 2026-10-20 changed only application records: same catalogue, processes and earlier history, one inventory event (V9.16)',()=>{
 // The current file keeps the catalogue and the two taxonomy events checked above, and adds one inventory import.
 assert.deepEqual(current.capabilityRows,raw.capabilityRows);assert.deepEqual(current.processRows,raw.processRows);assert.equal(current.taxonomySource,raw.taxonomySource);
 assert.deepEqual(current.importHistory.slice(0,-1),raw.importHistory);
 const event=current.importHistory.at(-1);
 assert.deepEqual([event.kind,event.inventoryFile,event.taxonomyFile,event.source,event.taxonomySource],['import',EXPORT_FILE,'',EXPORT_FILE,raw.taxonomySource]);
 assert.equal(current.source,EXPORT_FILE);
 // The HC records stay the applications' own records: Wuj HK AGV keeps HC.02.04.05; VMCN_CONNEX's HC.06 records were
 // replaced by B.06 codes in the export itself, not by the program.
 assert.equal(current.apps.find(a=>a.ID===WUJ)['Business Capabilities'],raw.apps.find(a=>a.ID===WUJ)['Business Capabilities']);
 assert.deepEqual(event.changes.filter(c=>c.appId===VMCN).map(c=>[c.field,c.before,c.after]),[['Business Capabilities','HC.06.01.01 Demand Planning;HC.06.01.05 Detailed Production Scheduling','B.06.2.3 Demand Planning;B.06.2.6 Procurement Planning'],['Processes','','BBM PM P2F Prepare demand forecasting L3']]);
});

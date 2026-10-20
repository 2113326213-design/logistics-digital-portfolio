// Test helper (not a test file): synthesises the three source workbooks from a data.json snapshot, in the
// layout that public/xlsx.mjs and the retired prepare_data.py expect, as real .xlsx packages
// (deflate-compressed ZIP, shared strings, a date style, [Content_Types].xml) that Excel can open.
//
//  inventory: 'Logistic Apps'  row 1 header; ID in column A, unnamed scope-note column C, the ten
//                              snapshot columns plus contact/infrastructure columns that must not be copied;
//                              each application on the row named by its scopeSource.
//             'Parameter Score' row 1 header with LeanIX ID, App operation cost and ROI (plus filler);
//                              each scored application on the row named by its operationCostSource/roiSource.
//  taxonomy:  'Business Capability'         row 1 header, capability rows from row 2 (first three columns).
//                              The real workbook still holds the old catalogue here (tests pass it in from
//                              tests/capability-rows-2026-10-15.json); public/data.json no longer uses it.
//             'Data_RBW Process Structure'  title on row 1, header on row 3 (where prepare_data.py expected
//                              it) with chain, level, ID and name in columns A, C, D and E; data from row 4.
//  standard:  'Standard Name'  the business capability standard (standard+name.xlsx, the only sheet), as in the
//                              real file: row 1 header Level 1-3 Code / Name, one entry per row from row 2,
//                              each "CODE Name" label split at its first space; a missing level has no cells.
//                              After the snapshot's entries come the ten HC entries the real file still lists
//                              (rows 63-72 there): since the owner decision of 2026-10-19 the import skips HC
//                              codes (another department's), so public/data.json no longer has them, but the
//                              workbook a rebuild reads does.
//
// Sheets are plain arrays (row index = sheet row - 1, column index = column - 1) so tests can edit them
// before encoding. Cell values: string (shared string), number, {date:'YYYY-MM-DD'} (serial with a date
// format) or null/'' (no cell).
import {deflateRawSync,crc32} from 'node:zlib';

const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
export const MANUFACTURING_APP='a103918e-63a2-4b26-ae5b-a5b1b7af8fd1';
export const MANUFACTURING_DECIDED='BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Receive to Store L1';
export const INVENTORY_HEADER=Object.freeze(['ID','Name','','Division','Entity','Description','Main Business Capability','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active','Application Owner','IT Contact','Hosting Server','Infrastructure Notes']);
export const EXCLUDED_MARKERS=['Owner person','contact-person','SRV-HOST','VM cluster'];

const sourceRow=text=>{const match=String(text??'').match(/(?:!C| row )(\d+)$/);return match?Number(match[1]):null;};
const place=(rows,rowNumber,values)=>{if(rows[rowNumber-1])throw Error(`Row ${rowNumber} is used twice`);rows[rowNumber-1]=values;};

export function inventorySheets(data){
 const apps=[[...INVENTORY_HEADER]],scores=[['LeanIX ID','Application','App operation cost','Business value','ROI']];
 let next=2;
 data.apps.forEach((app,index)=>{
  const row=sourceRow(app.scopeSource)??Math.max(next,apps.length+1);next=row+1;
  // The source still holds the 'Manufacturing' entry that the 2026-09-29 owner decision removes.
  const processes=app.ID===MANUFACTURING_APP&&app.Processes===MANUFACTURING_DECIDED?app.Processes+';Manufacturing':app.Processes;
  const active=/^\d{4}-\d{2}-\d{2}$/.test(app['Lifecycle: Active'])?{date:app['Lifecycle: Active']}:app['Lifecycle: Active'];
  place(apps,row,[app.ID,app.Name,app.scopeNote,app.Division,app.Entity,app.Description,app['Main Business Capability'],app['Business Capabilities'],processes,app['Lifecycle: Current Lifecycle'],active,
   `${EXCLUDED_MARKERS[0]} ${index+1}`,`${EXCLUDED_MARKERS[1]}-${index+1}`,`${EXCLUDED_MARKERS[2]}-${String(index+1).padStart(3,'0')}`,`${EXCLUDED_MARKERS[3]} ${index%3+1}`]);
  const costRow=sourceRow(app.operationCostSource),roiRow=sourceRow(app.roiSource);
  if(costRow!==roiRow)throw Error(`${app.ID}: cost and ROI come from different rows`);
  if(costRow)place(scores,costRow,[app.ID,app.Name,app.operationCostScore,`Value ${index%4+1}`,app.roiScore]);
 });
 return {'Logistic Apps':apps,'Parameter Score':scores,'Notes':[['This workbook was generated for tests.']]};
}

// capabilityRows: what the 'Business Capability' sheet holds (default: the snapshot's own catalogue).
export function taxonomySheets(data,capabilityRows=data.capabilityRows){
 const capabilities=[['Business Capability L1','Business Capability L2','Business Capability L3','Remark'],...capabilityRows.map((row,index)=>[...row,index===0?'Only the first three columns are read':null])];
 const processes=[['RBW Process Structure'],[],['RBW E2E Process Chain','E2E Chain Code','Process Level','Process ID','Process Name','Process Owner'],
  ...data.processRows.map(([chain,level,id,name])=>[chain,String(id??'').split('.').slice(0,2).join('.'),level,id,name,'Process owner role'])];
 return {'Business Capability':capabilities,'Data_RBW Process Structure':processes};
}

export const STANDARD_HEADER=Object.freeze(['Level 1 Code','Level 1 Name','Level 2 Code','Level 2 Name','Level 3 Code','Level 3 Name']);
// A label must split back exactly ("CODE Name", one space, nothing the reader would trim), else the rebuild could not match.
const codeAndName=label=>{
 if(label===null||label===undefined||label==='')return [null,null];
 const match=String(label).match(/^([A-Z]+\.\d+(?:\.\d+)*) (\S(?:.*\S)?)$/s);
 if(!match)throw Error(`Capability label ${JSON.stringify(label)} is not "CODE Name"`);
 return [match[1],match[2]];
};
// The HC entries of the real standard+name.xlsx (rows 63-72, after B.06.9.7), as capability rows. The owner
// decided on 2026-10-19 that HC capabilities belong to another department; the import leaves them out.
const HC_PLANNING='HC.06.01 Supply Chain Planning',HC_INTRA='HC.06.02 Intralogistics Management',B06='B.06 Logistics Management';
export const OTHER_DEPARTMENT_ROWS=Object.freeze([
 [B06,HC_PLANNING,null],[B06,HC_PLANNING,'HC.06.01.01 Demand Planning'],[B06,HC_PLANNING,'HC.06.01.02 Sales and Operations Planning'],
 [B06,HC_PLANNING,'HC.06.01.03 Customer Order Planning'],[B06,HC_PLANNING,'HC.06.01.04 Supply Planning'],[B06,HC_PLANNING,'HC.06.01.05 Detailed Production Scheduling'],
 [B06,HC_INTRA,null],[B06,HC_INTRA,'HC.06.02.01 Inbound & Receiving Management'],[B06,HC_INTRA,'HC.06.02.02 Material Flow & Storage Management'],
 [B06,HC_INTRA,'HC.06.02.03 Outbound & Shipping Management']
].map(row=>Object.freeze(row)));
const hasHcCode=row=>row.some(label=>/^HC\./.test(String(label??'')));
// otherDepartment: the HC entries written after the snapshot's own rows ([] writes the standard without them).
export function standardSheets(data,{otherDepartment=OTHER_DEPARTMENT_ROWS}={}){
 if(otherDepartment.length&&data.capabilityRows.some(hasHcCode))throw Error('The snapshot already lists HC capabilities; pass {otherDepartment:[]} to write them only once.');
 return {'Standard Name':[[...STANDARD_HEADER],...[...data.capabilityRows,...otherDepartment].map(row=>row.flatMap(codeAndName))]};
}

const escapeXml=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const column=index=>{let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
const serial=(date,date1904)=>{const [y,m,d]=date.split('-').map(Number);return (Date.UTC(y,m-1,d)-(date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30)))/86400000;};

// prefix: write the SpreadsheetML parts with a namespace prefix (<x:row>), as some exporters do.
// date1904: use the 1904 date system (older Mac workbooks), where every date serial is 1462 smaller.
export function xlsxBuffer(sheets,{prefix='',date1904=false}={}){
 const p=prefix?prefix+':':'',ns=prefix?`xmlns:${prefix}`:'xmlns',strings=new Map();
 const shared=value=>{if(!strings.has(value))strings.set(value,strings.size);return strings.get(value);};
 const names=Object.keys(sheets),declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
 const worksheet=rows=>{
  const xmlRows=[];
  rows.forEach((row,r)=>{
   const cells=[];
   (row||[]).forEach((value,c)=>{
    if(value===null||value===undefined||value==='')return;
    const ref=column(c)+(r+1);
    if(typeof value==='number')cells.push(`<${p}c r="${ref}"><${p}v>${value}</${p}v></${p}c>`);
    else if(typeof value==='object')cells.push(`<${p}c r="${ref}" s="1"><${p}v>${serial(value.date,date1904)}</${p}v></${p}c>`);
    else cells.push(`<${p}c r="${ref}" t="s"><${p}v>${shared(String(value))}</${p}v></${p}c>`);
   });
   if(cells.length)xmlRows.push(`<${p}row r="${r+1}">${cells.join('')}</${p}row>`);
  });
  return `${declaration}<${p}worksheet ${ns}="${MAIN}" xmlns:r="${REL}"><${p}sheetData>${xmlRows.join('')}</${p}sheetData></${p}worksheet>`;
 };
 const parts=names.map((name,i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheet(sheets[name])]);
 const sst=[...strings.keys()].map(text=>`<${p}si><${p}t${/^\s|\s$/.test(text)?' xml:space="preserve"':''}>${escapeXml(text)}</${p}t></${p}si>`).join('');
 const files=[
  ['[Content_Types].xml',`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`],
  ['_rels/.rels',`${declaration}<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml',`${declaration}<${p}workbook ${ns}="${MAIN}" xmlns:r="${REL}"><${p}workbookPr${date1904?' date1904="1"':''}/><${p}sheets>${names.map((name,i)=>`<${p}sheet name="${escapeXml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</${p}sheets></${p}workbook>`],
  ['xl/_rels/workbook.xml.rels',`${declaration}<Relationships xmlns="${PACKAGE_REL}">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${names.length+1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${names.length+2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
  ['xl/styles.xml',`${declaration}<${p}styleSheet ${ns}="${MAIN}"><${p}fonts count="1"><${p}font><${p}sz val="11"/><${p}name val="Calibri"/></${p}font></${p}fonts><${p}fills count="2"><${p}fill><${p}patternFill patternType="none"/></${p}fill><${p}fill><${p}patternFill patternType="gray125"/></${p}fill></${p}fills><${p}borders count="1"><${p}border><${p}left/><${p}right/><${p}top/><${p}bottom/><${p}diagonal/></${p}border></${p}borders><${p}cellStyleXfs count="1"><${p}xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></${p}cellStyleXfs><${p}cellXfs count="2"><${p}xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><${p}xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></${p}cellXfs><${p}cellStyles count="1"><${p}cellStyle name="Normal" xfId="0" builtinId="0"/></${p}cellStyles></${p}styleSheet>`],
  ...parts,
  ['xl/sharedStrings.xml',`${declaration}<${p}sst ${ns}="${MAIN}" count="${strings.size}" uniqueCount="${strings.size}">${sst}</${p}sst>`]
 ];
 return zip(files);
}

// A standard ZIP archive with deflate-compressed entries (method 8) and CRC-32 checksums.
export function zip(files){
 const locals=[],centrals=[];let offset=0;
 for(const [name,content] of files){
  const data=Buffer.isBuffer(content)?content:Buffer.from(content,'utf8'),compressed=deflateRawSync(data),path=Buffer.from(name,'utf8'),checksum=crc32(data);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(8,8);
  local.writeUInt16LE(0,10);local.writeUInt16LE(0x21,12);local.writeUInt32LE(checksum,14);
  local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(path.length,26);local.writeUInt16LE(0,28);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(8,10);
  central.writeUInt16LE(0,12);central.writeUInt16LE(0x21,14);central.writeUInt32LE(checksum,16);
  central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(path.length,28);
  central.writeUInt32LE(offset,42);
  locals.push(local,path,compressed);centrals.push(central,path);
  offset+=local.length+path.length+compressed.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}

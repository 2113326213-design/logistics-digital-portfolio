// Excel import data safety: omitted optional columns, explicit blanks, owner decisions,
// Annual benefit validation and XLSX parser edge cases (audit 2026-10-15 items 1, 12, 16, 17).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readXlsx,inventoryFromSheets,taxonomyFromSheets,excelDate} from '../public/xlsx.mjs';
import {mergeInventoryEvidence,previewImport} from '../public/import-review.mjs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {recordImport,applicationTimeline,applicationTimelineCSV} from '../public/application-history.mjs';
import {chronologicalEvents,renderHistoryRecords} from '../public/history-view.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const required=['ID','Name','Division','Entity','Business Capabilities','Processes'];
const optional=['Description','Lifecycle: Current Lifecycle','Lifecycle: Active'];

// Minimal in-memory XLSX: a stored (uncompressed) ZIP plus a small XML reader standing in for the browser DOMParser.
class XmlElement{
 constructor(localName,attributes,parentNode){this.localName=localName;this.attributes=attributes;this.parentNode=parentNode;this.children=[];}
 getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
 getAttributeNS(){return null;}
 getElementsByTagNameNS(_,name){const found=[],walk=node=>{for(const child of node.children)if(typeof child!=='string'){if(child.localName===name)found.push(child);walk(child);}};walk(this);return found;}
 getElementsByTagName(name){return this.getElementsByTagNameNS('*',name);}
 get textContent(){return this.children.map(child=>typeof child==='string'?child:child.textContent).join('');}
}
const decode=text=>text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi,(_,entity)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"})[entity]??String.fromCodePoint(/^#x/i.test(entity)?parseInt(entity.slice(2),16):Number(entity.slice(1))));
globalThis.DOMParser??=class{
 parseFromString(text){
  const doc=new XmlElement('#document',{},null);let current=doc;
  for(const m of text.matchAll(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g)){
   if(m[1])current=current.parentNode;
   else if(m[2]){const attributes={};for(const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attributes[a[1]]=decode(a[2]??a[3]);const element=new XmlElement(m[2].split(':').pop(),attributes,current);current.children.push(element);if(!m[4])current=element;}
   else if(m[5]!==undefined)current.children.push(decode(m[5]));
  }
  return doc;
 }
};
function zipFile(files){
 const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;
 for(const [name,content] of Object.entries(files)){
  const path=encoder.encode(name),bytes=encoder.encode(content);
  const local=new Uint8Array(30+path.length+bytes.length),lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint32(18,bytes.length,true);lv.setUint32(22,bytes.length,true);lv.setUint16(26,path.length,true);local.set(path,30);local.set(bytes,30+path.length);
  const central=new Uint8Array(46+path.length),cv=new DataView(central.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(6,20,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,path.length,true);cv.setUint32(42,offset,true);central.set(path,46);
  locals.push(local);centrals.push(central);offset+=local.length;
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,centrals.reduce((n,c)=>n+c.length,0),true);ev.setUint32(16,offset,true);
 return new File([...locals,...centrals,end],'fixture.xlsx');
}
const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xmlText=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const si=value=>`<si><t xml:space="preserve">${xmlText(value)}</t></si>`;
const column=index=>{let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
// Like Excel: empty cells are omitted and the rest carry r references; refs:false writes every cell in order without r.
function sheetXml(rows,{shared,refs=true}={}){
 return rows.map((row,r)=>`<row${refs?` r="${r+1}"`:''}>${row.map((value,c)=>{
  const ref=refs?` r="${column(c)}${r+1}"`:'';
  if(value===''||value==null)return refs?'':'<c/>';
  if(typeof value==='number')return `<c${ref}><v>${value}</v></c>`;
  if(shared){if(!shared.has(value))shared.set(value,shared.size);return `<c${ref} t="s"><v>${shared.get(value)}</v></c>`;}
  return `<c${ref} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
 }).join('')}</row>`).join('');
}
function xlsxFile(sheets,{shared=[]}={}){
 const names=Object.keys(sheets),files={
  'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${main}" xmlns:r="${rel}"><workbookPr/><sheets>${names.map((name,i)=>`<sheet name="${xmlText(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`
 };
 names.forEach((name,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${main}"><sheetData>${sheets[name]}</sheetData></worksheet>`;});
 if(shared.length)files['xl/sharedStrings.xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${main}" count="${shared.length}" uniqueCount="${shared.length}">${shared.join('')}</sst>`;
 return zipFile(files);
}

test('an inventory without Description and Lifecycle columns keeps existing values and all 12 applied mappings',()=>{
 assert.equal(correctionStates(data).filter(c=>c.state==='Applied').length,12);
 const parsed=inventoryFromSheets({'Logistic Apps':[required,...data.apps.map(app=>required.map(key=>app[key]))]});
 assert(parsed.every(app=>optional.every(key=>!Object.hasOwn(app,key))),'absent optional columns are not written as blank values');
 const preview=previewImport(data,{...data,apps:mergeInventoryEvidence(data.apps,parsed),source:'without-optional-columns.xlsx'});
 assert.equal(preview.appliedMappings,12);assert.equal(preview.staleMappings,0);
 assert.deepEqual(preview.updated.map(app=>app.ID),[]);assert.equal(preview.descriptionsCleared,0);assert.equal(preview.lifecycleValuesCleared,0);
 for(const app of preview.next.apps){const original=data.apps.find(a=>a.ID===app.ID);for(const key of optional)assert.equal(app[key],original[key],`${app.ID} keeps ${key}`);}
});

test('the same inventory read from an .xlsx file (cells without r references) keeps descriptions and mappings',async()=>{
 const sheets=await readXlsx(xlsxFile({'Logistic Apps':sheetXml([required,...data.apps.map(app=>required.map(key=>app[key]))],{refs:false})}));
 const parsed=inventoryFromSheets(sheets);
 assert.deepEqual(parsed.map(app=>required.map(key=>String(app[key]))),data.apps.map(app=>required.map(key=>app[key])));
 const preview=previewImport(data,{...data,apps:mergeInventoryEvidence(data.apps,parsed),source:'inventory.xlsx'});
 assert.equal(preview.appliedMappings,12);assert.equal(preview.updated.length,0);
 assert(preview.next.apps.every(app=>app.Description&&app['Lifecycle: Current Lifecycle']&&app['Lifecycle: Active']));
});

test('explicit blank Description and Lifecycle cells still replace values and are counted for the preview warning',()=>{
 const columns=[...required,...optional],[first,second]=data.apps;
 const rows=[columns,...data.apps.map(app=>columns.map(key=>app===first&&key==='Description'||app===second&&key.startsWith('Lifecycle')?'':app[key]))];
 const incoming=[...inventoryFromSheets({'Logistic Apps':rows}),{ID:'NEW-APP',Name:'New application',Division:'PS',Entity:'TEST','Business Capabilities':'',Processes:''}];
 const preview=previewImport(data,{...data,apps:mergeInventoryEvidence(data.apps,incoming)});
 assert.equal(preview.descriptionsCleared,1);assert.equal(preview.lifecycleValuesCleared,2);
 assert.equal(preview.next.apps.find(app=>app.ID===first.ID).Description,'');
 assert.equal(preview.next.apps.find(app=>app.ID===second.ID)['Lifecycle: Active'],'');
 const added=preview.next.apps.find(app=>app.ID==='NEW-APP');for(const key of optional)assert.equal(added[key],'','new IDs get the empty default');
 assert.match(appSource,/This import clears \$\{preview\.descriptionsCleared\} existing descriptions and \$\{preview\.lifecycleValuesCleared\} lifecycle values/,'the import preview shows the clearing warning');
});

test('an invalid Annual benefit cell names the Excel row and application ID',()=>{
 const header=[...required,'Annual benefit (CNY/year)'];
 assert.throws(()=>inventoryFromSheets({'Logistic Apps':[header,['A','App A','PS','P1','','','100'],['B','App B','PS','P1','','','-5']]}),error=>/^Row 3, application ID B: /.test(error.message)&&/non-negative CNY amount/.test(error.message));
 assert.equal(inventoryFromSheets({'Logistic Apps':[header,['A','App A','PS','P1','','','100']]})[0].annualBenefitCNY,100);
});

test('the owner-approved Manufacturing removal is reported in the preview and kept with its original text in import history',()=>{
 const id='a103918e-63a2-4b26-ae5b-a5b1b7af8fd1',decided=data.apps.find(app=>app.ID===id),original=decided.Processes+';Manufacturing';
 const preview=previewImport(data,{...data,source:'owner-source.xlsx',apps:data.apps.map(app=>app.ID===id?{...app,Processes:original}:app)});
 assert.deepEqual(preview.ownerDecisions.map(d=>d.note),["Owner decision applied: removed 'Manufacturing' from BMLP_Nexeed_IAS@WxP processes"]);
 assert.equal(preview.ownerDecisions[0].before,original);
 assert.equal(preview.next.apps.find(app=>app.ID===id).Processes,decided.Processes,'owner-approved outcome is unchanged');
 assert.deepEqual(preview.updated,[],'no application or score input changes');
 assert.deepEqual(previewImport(data,data).ownerDecisions,[],'no note when the imported value was not rewritten');
 const olderJson=JSON.stringify({format:'logistics-portfolio-workspace',version:4,data:{...data,apps:data.apps.map(app=>app.ID===id?{...app,Processes:original}:app)}});
 assert.equal(previewImport(data,importWorkspace(olderJson),JSON.parse(olderJson).data).ownerDecisions.length,1,'older workspace JSON files are reported too');
 assert.match(appSource,/next=importWorkspace\(text\);raw=JSON\.parse\(text\)\.data;/);assert.match(appSource,/previewImport\(base,next,raw\|\|next\)/);
 assert.match(appSource,/decisions:pendingImport\.ownerDecisions/,'applying the import records the decision');
 const recorded=workspaceData(recordImport(data,preview.next,{inventoryFile:'owner-source.xlsx',decisions:preview.ownerDecisions}));
 assert.equal(recorded.importHistory.at(-1).decisions[0].before,original,'original source string is traceable');
 assert.deepEqual(importWorkspace(exportWorkspace(recorded)).importHistory,recorded.importHistory);
 const events=chronologicalEvents(applicationTimeline(recorded,id)),entry=events.find(event=>event.kind==='decision');
 assert.equal(entry.description,preview.ownerDecisions[0].note);
 const html=renderHistoryRecords(events,{},esc),csv=applicationTimelineCSV(decided,events,recorded.source);
 for(const text of [html,csv]){assert(text.includes('Owner decision'));assert(text.includes(original));}
 assert(csv.includes("Owner decision applied: removed 'Manufacturing' from BMLP_Nexeed_IAS@WxP processes"));
});

test('XLSX rows and cells without r take sequential positions, phonetic runs are ignored and cells have no holes',async()=>{
 const shared=['<si><t>Tokyo </t><r><t>東京</t></r><rPh sb="0" eb="1"><t>トウキョウ</t></rPh><phoneticPr fontId="1"/></si>','<si><r><t>Ware</t></r><r><rPr><b/></rPr><t>house</t></r></si>'];
 const sheet='<row><c t="inlineStr"><is><t>ID</t></is></c><c t="inlineStr"><is><t>Name</t></is></c><c t="inlineStr"><is><t>Note</t><rPh sb="0" eb="1"><t>ノート</t></rPh></is></c><c t="inlineStr"><is><t>Extra</t></is></c></row>'
  +'<row><c><v>1</v></c><c r="C2"><v>3</v></c><c><v>4</v></c></row>'
  +'<row r="5"><c r="B5" t="s"><v>0</v></c></row><row><c t="s"><v>1</v></c></row>';
 const rows=(await readXlsx(xlsxFile({Sheet1:sheet},{shared}))).Sheet1;
 assert.deepEqual(rows[0],['ID','Name','Note','Extra']);
 assert.deepEqual(rows[1],['1','','3','4']);assert(1 in rows[1],'skipped cells are filled, not left as holes');
 assert.deepEqual(rows[4],['','Tokyo 東京']);assert.deepEqual(rows[5],['Warehouse']);assert.equal(rows.length,6);
});

// The 2026-10-15 catalogue (44 rows) in its original 'Business Capability' layout, and the current 61-row standard
// list (71 standard entries less the 10 HC.06 entries of another department, owner decision 2026-10-19) written in
// the same layout. The blank formatted row sits 15 rows below the last capability row (row 60 for the 44-row
// catalogue, as before), so it never overwrites a capability row.
const legacyCatalogue=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const legacy=workspaceData({...data,capabilityRows:legacyCatalogue.capabilityRows,taxonomySource:legacyCatalogue.taxonomySource});
test('re-uploading the identical taxonomy workbook is reported as Unchanged',async()=>{
 assert.deepEqual([legacy,data].map(workspace=>workspace.capabilityRows.length),[44,61]);
 assert(!data.capabilityRows.flat().some(cell=>/^HC\./.test(String(cell??''))),'the current catalogue has no HC entry');
 for(const workspace of [legacy,data]){
  const blank=workspace.capabilityRows.length+16,strings=new Map(),capabilities=sheetXml([['Level 1','Level 2','Level 3'],...workspace.capabilityRows],{shared:strings})+`<row r="${blank}"><c r="A${blank}" s="3"/></row>`;
  const processes=sheetXml([['RBW E2E Process Chain','Process Level','Process ID','Process Name'],...workspace.processRows],{shared:strings});
  const taxonomy=taxonomyFromSheets(await readXlsx(xlsxFile({'Business Capability':capabilities,'Data_RBW Process Structure':processes},{shared:[...strings.keys()].map(si)})));
  assert(taxonomy.capabilityRows.every(row=>row.length===3&&[0,1,2].every(i=>i in row)));
  assert.equal(taxonomy.capabilityRows.length,workspace.capabilityRows.length,'blank formatted rows are not taxonomy rows');
  const preview=previewImport(workspace,{...workspace,...taxonomy,taxonomySource:'same-taxonomy.xlsx'});
  assert.equal(preview.taxonomyChanged,false);assert.equal(preview.appliedMappings,12);
  assert.deepEqual(preview.capabilityChanges,{renamed:0,added:0,removed:0,total:0},'no capability name, added or removed code is reported');
 }
});

test('Excel date-time serials and date-time text keep only the calendar date',async()=>{
 assert.equal(excelDate('44197.75'),'2021-01-01');assert.equal(excelDate('44197'),'2021-01-01');assert.equal(excelDate('42735.5',true),'2021-01-01');
 assert.equal(excelDate('2020-12-21 08:30:00'),'2020-12-21');assert.equal(excelDate('2020-12-21T08:30:00Z'),'2020-12-21');
 assert.equal(excelDate('25569'),'1970-01-01');assert.equal(excelDate('Planned'),'Planned');assert.equal(excelDate('12.5'),'12.5');
 for(const value of ['2020-12-21T08:30','2020-12-21 08:30:00.250','2020-12-21T08:30:00+08:00','2020-12-21T08:30:00-0500'])assert.equal(excelDate(value),'2020-12-21',value);
 // A date followed by a note is text the owner wrote; it is kept, not cut to the date.
 for(const value of ['2021-02-01 (go-live moved to 2021-03-15)','2021-02-01 planned','2021-02-01T','2021-02-01 08:30 local'])assert.equal(excelDate(value),value,value);
 const header=[...required,'Lifecycle: Active'];
 const sheets=await readXlsx(xlsxFile({'Logistic Apps':sheetXml([header,['A','App A','PS','P1','','',44197.5]])}));
 assert.equal(inventoryFromSheets(sheets)[0]['Lifecycle: Active'],'2021-01-01');
});

test('the owner-decision note only promises a record when the import will actually be applied',async()=>{
 const {runInNewContext}=await import('node:vm');
 const template=appSource.match(/\$\{preview\.ownerDecisions\.length\?(`<p class="hint">[\s\S]*?<\/p>`):''\}/)?.[1];
 assert(template,'owner-decision preview template found');
 const render=hasChanges=>runInNewContext(template,{esc,preview:{hasChanges,ownerDecisions:[{note:"Owner decision applied: removed 'Manufacturing' from BMLP_Nexeed_IAS@WxP processes"}]}});
 assert.match(render(true),/The original source value is recorded with this import\./);
 const unchanged=render(false);
 assert.doesNotMatch(unchanged,/recorded with this import/);assert.match(unchanged,/already reflected in the current workspace; nothing will be recorded/);
 const id='a103918e-63a2-4b26-ae5b-a5b1b7af8fd1',original=data.apps.find(app=>app.ID===id).Processes+';Manufacturing';
 const reupload=previewImport(data,{...data,apps:data.apps.map(app=>app.ID===id?{...app,Processes:original}:app)});
 assert.equal(reupload.hasChanges,false,'re-uploading the raw source text alone changes nothing');assert.equal(reupload.ownerDecisions.length,1);
});

test('boolean cells read as TRUE/FALSE, so a TRUE score is rejected instead of becoming 1',async()=>{
 const sheet=`<row r="1"><c r="A1" t="inlineStr"><is><t>LeanIX ID</t></is></c><c r="B1" t="inlineStr"><is><t>ROI</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>app-1</t></is></c><c r="B2" t="b"><v>1</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>app-2</t></is></c><c r="B3" t="b"><v>0</v></c></row>`;
 const rows=(await readXlsx(xlsxFile({'Parameter Score':sheet})))['Parameter Score'];
 assert.deepEqual(rows.slice(1).map(row=>row[1]),['TRUE','FALSE']);
 const {roiScoresFromSheets}=await import('../public/roi.mjs');
 assert.throws(()=>roiScoresFromSheets({'Parameter Score':rows}),{message:'Parameter Score row 2 (LeanIX ID app-1), ROI: ROI score must be 1 to 5, or blank. Found "TRUE".'});
 const costs=rows.map((row,index)=>index?row:['LeanIX ID','App operation cost']),{operationCostScoresFromSheets}=await import('../public/costs.mjs');
 assert.throws(()=>operationCostScoresFromSheets({'Parameter Score':costs}),{message:'Parameter Score row 2 (LeanIX ID app-1), App operation cost: App operation cost must be a score from 1 to 5, or blank. Found "TRUE".'});
});

import {split,otherCompanyRecord} from './codes.mjs';

// LeanIX process check (owner decision 2026-10-22, V15: "先只核对、不改数据"). The data steward exports the saved LeanIX view
// "BBM PM process" (type Process, with the Applications column) on the company laptop and selects the file in Import data.
// The tool compares, per application, the processes LeanIX links to it with the processes recorded in the tool:
// in both, only in LeanIX, only in the tool. Nothing is changed and nothing can be applied.
// Export layout (screenshots 2026-10-22): technical field names in row 1 (id, type, name, displayName, description,
// processLifecycleStatus, relToParent, relProcessToApplication, fullName, updatedAt), display names in row 2, records
// from row 3; Applications holds application names separated by ";".
const LINKS='relProcessToApplication';
const isDataSheet=([name,rows])=>!/^readme$/i.test(name)&&Array.isArray(rows)&&Array.isArray(rows[0]);
const keys=rows=>rows[0].map(v=>String(v??'').trim());
export const processLinkSheet=sheets=>Object.entries(sheets||{}).filter(isDataSheet).find(([,rows])=>keys(rows).includes(LINKS)&&keys(rows).some(k=>k==='name'||k==='displayName'))||null;
export const isLeanixProcessLinks=sheets=>!!processLinkSheet(sheets);
// A LeanIX process export without the Applications column (as the export of 2026-10-20) cannot be checked. Only sheets
// whose records are processes count, so another LeanIX export with field names in row 1 is not taken for one.
const types=rows=>{const c=keys(rows).indexOf('type');return new Set(rows.slice(1).map(r=>String(r?.[c]??'').trim()));};
export const processExportWithoutLinks=sheets=>Object.entries(sheets||{}).filter(isDataSheet).some(([,rows])=>['id','type','name','displayName'].every(k=>keys(rows).includes(k))&&!keys(rows).includes(LINKS)&&types(rows).has('Process'));
export const NO_APPLICATIONS_COLUMN='This LeanIX process export has no Applications column, so it cannot be compared. In LeanIX, add the Applications column to the view (Manage columns) and export again.';

// Names are compared ignoring case, spacing and '&' / 'and' (the usual spelling variants); anything else is a different name.
export const nameKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/\s+/g,' ').trim();
const EXPORTED_AT=/created at:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) GMT/i;
// The export time as the owner reads it, in Beijing time (UTC+8); without a ReadMe, the date in the sheet name.
const beijing=gmt=>{const t=Date.parse(gmt.replace(' ','T')+'Z');return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,16).replace('T',' ')+' (Beijing time)':'';};

export function readProcessLinks(sheets){
 const entry=processLinkSheet(sheets);
 if(!entry)throw Error(processExportWithoutLinks(sheets)?NO_APPLICATIONS_COLUMN:'No LeanIX process sheet with an Applications column was found.');
 const [sheet,rows]=entry,head=keys(rows),col=k=>head.indexOf(k);
 const displayHeader=/^applications$/i.test(String(rows[1]?.[col(LINKS)]??'').trim());
 const first=displayHeader?2:1;
 const records=rows.slice(first).flatMap((r,i)=>{
  if(!Array.isArray(r)||!r.some(v=>String(v??'').trim()))return [];
  const get=k=>col(k)<0?'':String(r[col(k)]??'').trim();
  // Records of another type (the view filters on Process) are left out.
  if(get('type')&&get('type')!=='Process')return [];
  const name=get('name')||get('displayName');
  return name?[{row:first+i+1,id:get('id'),name,displayName:get('displayName'),fullName:get('fullName'),parent:get('relToParent'),applications:split(get(LINKS))}]:[];
 });
 const readme=Object.entries(sheets).find(([name])=>/^readme$/i.test(name))?.[1]||[];
 const gmt=readme.flat().map(v=>String(v??'').match(EXPORTED_AT)?.[1]).find(Boolean);
 const exportedAt=gmt&&beijing(gmt)||String(sheet).match(/Export (\d{4}-\d{2}-\d{2})/)?.[1]||'';
 return {sheet,exportedAt,records};
}

// One row per application of the tool. A recorded process the export does not contain at all is outside this export
// (the view covers BBM PM processes only) and is not a difference. HC entries belong to another company and are not
// compared (V13.3). LeanIX links applications by name, so applications LeanIX names that the tool does not know, and
// names the tool uses for more than one application, are listed for checking.
export function compareProcessLinks(data,links,{file=''}={}){
 const apps=data?.apps||[],canonical=new Map(),linked=new Map();
 for(const record of links.records){
  if(otherCompanyRecord(record.name))continue;
  const key=nameKey(record.name);
  for(const variant of [record.name,record.displayName,record.fullName])if(variant&&!canonical.has(nameKey(variant)))canonical.set(nameKey(variant),key);
  for(const app of record.applications){
   const appKey=nameKey(app);if(!linked.has(appKey))linked.set(appKey,{name:app,processes:new Map()});
   if(!linked.get(appKey).processes.has(key))linked.get(appKey).processes.set(key,record.name);
  }
 }
 const sameName=new Map();for(const app of apps)sameName.set(nameKey(app.Name),(sameName.get(nameKey(app.Name))||0)+1);
 const rows=apps.map(app=>{
  const fromLeanix=linked.get(nameKey(app.Name))?.processes||new Map(),found=new Set(),seen=new Set();
  const both=[],onlyTool=[],notInExport=[];
  for(const process of split(app.Processes).filter(p=>!otherCompanyRecord(p))){
   const key=canonical.get(nameKey(process));
   if(seen.has(key??nameKey(process)))continue;seen.add(key??nameKey(process));
   if(!key)notInExport.push(process);
   else if(fromLeanix.has(key)){both.push(process);found.add(key);}
   else onlyTool.push(process);
  }
  const onlyLeanix=[...fromLeanix].filter(([key])=>!found.has(key)).map(([,name])=>name);
  const status=onlyLeanix.length||onlyTool.length?'differs':both.length?'matches':'not-in-export';
  return {id:app.ID,name:String(app.Name??''),status,both,onlyLeanix,onlyTool,notInExport,sameName:sameName.get(nameKey(app.Name))};
 });
 const order={differs:0,matches:1,'not-in-export':2};
 rows.sort((a,b)=>order[a.status]-order[b.status]||nameKey(a.name).localeCompare(nameKey(b.name))||String(a.id).localeCompare(String(b.id)));
 const known=new Set(apps.map(app=>nameKey(app.Name)));
 const unknownApplications=[...linked].filter(([key])=>!known.has(key)).map(([,v])=>({name:v.name,processes:v.processes.size})).sort((a,b)=>a.name.localeCompare(b.name));
 const count=status=>rows.filter(r=>r.status===status).length;
 return {file,sheet:links.sheet,exportedAt:links.exportedAt,processes:links.records.length,linkedApplications:linked.size,rows,unknownApplications,
  counts:{applications:rows.length,differs:count('differs'),matches:count('matches'),notInExport:count('not-in-export')}};
}

// The check as CSV for Excel: one row per application and process. Values starting with a formula character are
// prefixed with ' (as in the other CSV exports).
const RESULT_TEXT={both:'In both',onlyLeanix:'Only in LeanIX',onlyTool:'Only in the tool',notInExport:'Not in this export'};
export function processCheckCSV(check){
 const quote=x=>'"'+String(x??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
 const rows=[['Application ID','Application','Process','Result','LeanIX export'],
  ...check.rows.flatMap(r=>Object.keys(RESULT_TEXT).flatMap(part=>r[part].map(process=>[r.id,r.name,process,RESULT_TEXT[part],check.file]))),
  ...check.unknownApplications.map(a=>['',a.name,'','Application in LeanIX, not in the tool',check.file])];
 return '﻿'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}

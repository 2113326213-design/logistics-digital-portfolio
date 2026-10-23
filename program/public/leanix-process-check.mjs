import {split,otherCompanyRecord,norm,PROCESS_LEVEL} from './codes.mjs';
import {processLookup,buildModel} from './model.mjs';

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

// LeanIX names an application by its Display Name, which adds the release to the name ("Supply Chain Management System
// 1.0", "Wuj HK AGV (recovered …) 2025.02.28"; real export 2026-10-22). A name that ends in a release (numbers with dots
// or dashes, or v1) also counts for the application with the name before it.
const RELEASE=/^(.*\S)\s+(v\d+|v?\d+(?:[.\-]\d+)+)$/i;
const withoutRelease=name=>String(name??'').trim().match(RELEASE)?.[1]||null;

// One row per application of the tool. A recorded process the export does not contain at all is outside this export
// (the view covers BBM PM processes only) and is not a difference. HC entries belong to another company and are not
// compared (V13.3). LeanIX links applications by name (with or without the release). The processes are also linked to
// many applications outside the tool's inventory (10,230 in the real export): they are counted, not compared; an
// application of the tool that LeanIX links to nothing gets the LeanIX names that look like it, to check its name. With
// the model, every process gets its standard Process ID and Process Name (V16): the tool's own match for the processes
// the application records (owner mappings included), the shared name rule for the others.
export function compareProcessLinks(data,links,{file='',model=null}={}){
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
 const known=new Set(apps.map(app=>nameKey(app.Name)));
 // LeanIX names of each tool application: its exact name, and its name followed by a release.
 const leanixNames=new Map();
 for(const [key,v] of linked){const base=withoutRelease(v.name),target=known.has(key)?key:base&&known.has(nameKey(base))?nameKey(base):null;if(target){if(!leanixNames.has(target))leanixNames.set(target,[]);leanixNames.get(target).push(key);}}
 const sameName=new Map();for(const app of apps)sameName.set(nameKey(app.Name),(sameName.get(nameKey(app.Name))||0)+1);
 const lookup=model?processLookup(model.procs):null,modelApps=new Map((model?.apps||[]).map(a=>[a.id,a]));
 const standardOf=name=>{if(!lookup)return null;const id=lookup(name).id;return id?{id,name:model.procs.get(id).label}:null;};
 const assigned=new Set([...leanixNames.values()].flat()),unknown=[...linked].filter(([key])=>!assigned.has(key));
 const rows=apps.map(app=>{
  const keys=leanixNames.get(nameKey(app.Name))||[],fromLeanix=new Map(keys.flatMap(k=>[...linked.get(k).processes])),found=new Set(),seen=new Set();
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
  // The standard process of each process: the tool's own match for what the application records, the rule for the rest.
  const matches=new Map((modelApps.get(String(app.ID??'').trim())?.processMatches||[]).map(m=>[m.raw,m.id]));
  const standard=new Map();
  if(model)for(const process of [...both,...onlyTool,...notInExport,...onlyLeanix]){const id=matches.get(process);standard.set(process,id?{id,name:model.procs.get(id)?.label??''}:standardOf(process));}
  const names=keys.map(k=>linked.get(k).name).filter(n=>nameKey(n)!==nameKey(app.Name));
  // An application LeanIX links to nothing although it records processes of this export: LeanIX names that look like it.
  const stem=String(app.Name??'').toLowerCase().replace(/\(recovered[^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
  const similar=!keys.length&&onlyTool.length&&stem.length>=4?unknown.map(([,v])=>v.name).filter(n=>{const x=n.toLowerCase().replace(/[^a-z0-9]/g,'');return x.includes(stem)||x.length>=6&&stem.includes(x);}).slice(0,5):[];
  return {id:app.ID,name:String(app.Name??''),status,both,onlyLeanix,onlyTool,notInExport,sameName:sameName.get(nameKey(app.Name)),leanixNames:names,similar,standard};
 });
 const order={differs:0,matches:1,'not-in-export':2};
 rows.sort((a,b)=>order[a.status]-order[b.status]||nameKey(a.name).localeCompare(nameKey(b.name))||String(a.id).localeCompare(String(b.id)));
 const count=status=>rows.filter(r=>r.status===status).length;
 return {file,sheet:links.sheet,exportedAt:links.exportedAt,processes:links.records.length,linkedApplications:linked.size,rows,otherApplications:unknown.length,
  counts:{applications:rows.length,differs:count('differs'),matches:count('matches'),notInExport:count('not-in-export')}};
}

// The standard process catalogue against the LeanIX export (owner request 2026-10-22, V16: "business CAPABILITY + PROCESS
// 那个表格 和我拉出来的新的 … 一些缺少的？我要去补齐的"). The catalogue is the tool's process taxonomy (Business Capability +
// Process.xlsx, sheet Data_RBW Process Structure: RBW E2E Process Chain, Process Level, Process ID, Process Name). Each
// LeanIX process (HC entries left out, V13.3) finds its standard process by the rule the applications' records use
// (processLookup in model.mjs; by the Display Name when the Name finds none), else by the owner's applied mapping of that
// exact text. A name the catalogue gives several processes of a level and chain (e.g. Register Truck) is decided by the
// record's Parent; when the Parent does not decide, the LeanIX processes of that name cover as many of those processes as
// there are records, and the rest are possibly missing.
// A process chain is compared when the export has a "BBM PM <chain>" name or a process found in it (review: a chain whose
// names all differ is still in the export); in a compared chain, a standard process no LeanIX process finds is missing.
// Chains the export does not name are not compared, nor is a Process ID the catalogue gives two names.
// LeanIX processes that find no standard process: names ending in L0–L3 are listed with the reason (to correct or to
// check); local variants (L3V, under an L2 in the real export) and names without a level (other naming, e.g. BBM_PPM_PM …)
// are counted and kept in the CSV, since they are not meant to be in the catalogue.
const SEVERAL='流程名称对应多个编号',NO_LEVEL='流程未标注标准层级';
const LOOKUP_REASON={'流程未匹配层级表':'No standard process has this name at this level.','流程链编号存在差异':'The name is found only in another process chain.'};
const chainCode=id=>String(id).split('.')[1]||'';
const chainOfName=name=>String(name??'').match(/^BBM\s+PM\s+([A-Z0-9]+)\s/i)?.[1]?.toUpperCase()||'';
const levelOf=name=>String(name??'').match(PROCESS_LEVEL);
const bareName=name=>String(name??'').replace(/^BBM\s+PM\s+[A-Z0-9]+\s+/i,'').replace(/\s+L[0-3]V?\s*$/i,'');
const expectedName=n=>`BBM PM ${chainCode(n.id)} ${n.label.replace(/\s+/g,' ').trim()} L${n.level}`;
// How a LeanIX process finds its catalogue process: the name rule (processLookup), then the owner's applied mapping of
// that exact text, by Name and then by Display Name; and which names belong to a Process ID the catalogue gives two names.
function resolver(model,processRows){
 const lookup=processLookup(model.procs);
 // The owner's applied process mappings, by recorded text (one target only).
 const mapped=new Map();for(const a of model.apps)for(const m of a.processMatches)if(m.via==='mapping'){const k=nameKey(m.raw);mapped.set(k,mapped.has(k)&&mapped.get(k)!==m.id?null:m.id);}
 // Names of Process IDs the catalogue gives two names (left out of the name rule).
 const ambiguous=new Map();for(const [,l,id,label] of processRows){const n=model.procs.get(String(id));if(n?.ambiguous)ambiguous.set(n.level+'|'+norm(label)+'|'+chainCode(n.id),n.id);}
 const resolve=name=>{const hit=lookup(name);if(hit.id||hit.type===SEVERAL)return hit;const id=mapped.get(nameKey(name));return id&&model.procs.has(id)?{id,via:'mapping'}:hit;};
 const find=record=>{let hit=resolve(record.name);if(!hit.id&&hit.type!==SEVERAL&&record.displayName&&nameKey(record.displayName)!==nameKey(record.name)){const byDisplayName=resolve(record.displayName);if(byDisplayName.id||byDisplayName.type===SEVERAL)hit=byDisplayName;}return hit;};
 const ambiguousId=name=>{const m=levelOf(name);return m?ambiguous.get(+m[1]+'|'+norm(bareName(name))+'|'+(chainOfName(name)||''))||null:null;};
 return {resolve,find,ambiguousId};
}
export function compareCatalogue(model,links,{processRows=[]}={}){
 const {resolve,find,ambiguousId}=resolver(model,processRows),found=new Map(),notInCatalogue=[],variants=[],otherNaming=[],groups=new Map(),local=[];
 const add=(id,record,how)=>{if(!found.has(id))found.set(id,[]);found.get(id).push({id:record.id,name:record.name,...how});};
 for(const record of links.records){
  if(otherCompanyRecord(record.name))continue;
  const hit=find(record);
  const variant=/L3V\s*$/i.test(record.name);
  // A process of the LeanIX local layer (V17) is in the catalogue, but not in the Signavio standard: counted apart.
  if(hit.id&&model.procs.get(hit.id)?.local){local.push({id:record.id,name:record.name,localId:hit.id});continue;}
  if(hit.id){add(hit.id,record,{via:hit.via,variant});continue;}
  if(hit.type===SEVERAL){
   const parent=record.parent?resolve(record.parent).id:null,byParent=parent?hit.candidates.filter(c=>model.procs.get(c.id)?.parent===parent):[];
   if(byParent.length===1){add(byParent[0].id,record,{via:'parent',variant});continue;}
   const key=hit.candidates.map(c=>c.id).sort().join('|');
   if(!groups.has(key))groups.set(key,{ids:hit.candidates.map(c=>c.id),records:[]});groups.get(key).records.push({id:record.id,name:record.name,variant});continue;
  }
  const amb=ambiguousId(record.name);
  if(amb){notInCatalogue.push({row:record.row,id:record.id,name:record.name,reason:`The catalogue gives this Process ID (${amb}) two names, so it is not compared.`,candidates:[]});continue;}
  const entry={row:record.row,id:record.id,name:record.name,reason:LOOKUP_REASON[hit.type]||'The name does not end with a level (L0–L3).',candidates:hit.candidates||[]};
  if(hit.type===NO_LEVEL)otherNaming.push(entry);else if(variant)variants.push(entry);else notInCatalogue.push(entry);
 }
 // Shared names the Parent did not decide: the LeanIX processes of that name cover as many catalogue processes.
 const possibly=new Map();
 for(const g of groups.values()){
  const open=g.ids.filter(id=>!found.has(id));
  if(g.records.length>=open.length)for(const id of open)for(const r of g.records)add(id,r,{via:'shared',shared:g.ids.length,variant:r.variant});
  else for(const id of open)possibly.set(id,{shared:g.ids.length,records:g.records.length,names:g.records.map(r=>r.name)});
 }
 const catalogueChains=new Set([...model.procs.keys()].map(chainCode));
 const reached=new Set([...found.keys(),...possibly.keys()].map(chainCode));
 for(const record of links.records)if(!otherCompanyRecord(record.name)&&catalogueChains.has(chainOfName(record.name)))reached.add(chainOfName(record.name));
 const rows=[...model.procs.values()].filter(n=>!n.local).map(n=>{
  const leanix=found.get(n.id)||[];
  const status=n.ambiguous?'ambiguous':!reached.has(chainCode(n.id))?'chain-not-in-export':leanix.length?'in-leanix':possibly.has(n.id)?'possibly-missing':'missing';
  return {chain:n.chain,level:'L'+n.level,id:n.id,name:n.label,expected:expectedName(n),status,leanix,variantOnly:!!leanix.length&&leanix.every(x=>x.variant),possibly:possibly.get(n.id)||null};
 });
 const chains=new Map();
 for(const r of rows){const c=chains.get(r.chain)||{chain:r.chain,code:chainCode(r.id),reached:reached.has(chainCode(r.id)),processes:0,inLeanix:0,missing:0};c.processes++;if(r.status==='in-leanix')c.inLeanix++;if(r.status==='missing'||r.status==='possibly-missing')c.missing++;chains.set(r.chain,c);}
 const count=status=>rows.filter(r=>r.status===status).length;
 return {rows,missing:rows.filter(r=>r.status==='missing'||r.status==='possibly-missing'),notInCatalogue,variants,otherNaming,local,chains:[...chains.values()],
  counts:{standard:rows.length,compared:count('in-leanix')+count('missing')+count('possibly-missing'),inLeanix:count('in-leanix'),missing:count('missing')+count('possibly-missing'),
   possiblyMissing:count('possibly-missing'),variantOnly:rows.filter(r=>r.status==='in-leanix'&&r.variantOnly).length,notCompared:count('chain-not-in-export'),ambiguous:count('ambiguous'),
   notInCatalogue:notInCatalogue.length,variants:variants.length,otherNaming:otherNaming.length,local:local.length}};
}

// The LeanIX local process layer this export gives (V17, local-layer.mjs). Candidates are BBM PM processes ("BBM PM
// <chain> <name> L0–L3/L3V", a chain of the catalogue, HC left out) that the Signavio standard does not have: neither the
// name rule, the owner's mappings, a shared catalogue name nor a catalogue ID with two names finds them. Each hangs under
// its LeanIX Parent: a standard process found by the same rule, or another local process of this export. A candidate
// whose name the standard has in another chain, without a Parent, whose Parent is not found, is in another chain or is
// not one level above, is not added and is listed with the reason. The layer is computed against the Signavio standard
// alone, so a newer export replaces the whole layer.
export function localProcessesFrom(data,links){
 const model=buildModel({...data,localProcesses:[]}),{resolve,find,ambiguousId}=resolver(model,data?.processRows||[]);
 const catalogueChains=new Set([...model.procs.keys()].map(chainCode)),candidates=[],skipped=[];
 const skip=(record,reason)=>skipped.push({id:record.id,name:record.name,reason});
 for(const record of links.records){
  if(otherCompanyRecord(record.name))continue;
  const chain=chainOfName(record.name),m=levelOf(record.name);
  if(!chain||!catalogueChains.has(chain)||!m)continue;
  const hit=find(record);
  if(hit.id||hit.type===SEVERAL||ambiguousId(record.name))continue;
  if(hit.type==='流程链编号存在差异'){skip(record,'The Signavio standard has this name in another process chain.');continue;}
  if(+m[1]<1){skip(record,'A Level 0 process is a process chain; only the standard chains are used.');continue;}
  candidates.push({record,chain,level:+m[1],name:bareName(record.name).replace(/\s+/g,' ').trim(),variant:/L3V\s*$/i.test(record.name)});
 }
 const waiting=new Set(candidates.map(c=>nameKey(c.record.name))),placed=new Map(),ids=new Set(),keys=new Set(),added=[];
 // The Parents each local name is found under (one name under two Parents is two processes).
 const homes=new Map();for(const c of candidates){const k=nameKey(c.record.name);if(!homes.has(k))homes.set(k,new Set());homes.get(k).add(nameKey(c.record.parent));}
 let pending=candidates;
 for(let pass=0;pending.length&&pass<4;pass++)pending=pending.filter(c=>{
  if(!c.record.parent){skip(c.record,'No Parent in LeanIX.');return false;}
  const standard=resolve(c.record.parent).id;
  // A Parent name that several local processes use (under different Parents) does not say which one: never decided by row order (V17 review).
  if(!standard&&(homes.get(nameKey(c.record.parent))?.size||0)>1){skip(c.record,'Its LeanIX Parent name is used by several local processes, so the Parent is not clear.');return false;}
  const parentNode=standard?model.procs.get(standard):placed.get(nameKey(c.record.parent));
  if(!parentNode){if(waiting.has(nameKey(c.record.parent))&&pass<3)return true;skip(c.record,'Its LeanIX Parent is neither in the Signavio standard nor added here.');return false;}
  if(chainCode(parentNode.id)!==c.chain){skip(c.record,'Its LeanIX Parent is in another process chain.');return false;}
  if(parentNode.level!==c.level-1){skip(c.record,`Its LeanIX Parent is Level ${parentNode.level}, not Level ${c.level-1}.`);return false;}
  const key=parentNode.id+'|'+c.level+'|'+norm(c.name);
  if(keys.has(key)){skip(c.record,'The same name under the same Parent is already added.');return false;}
  const hex=String(c.record.id).replace(/[^0-9a-f]/gi,'').toLowerCase();let id=`${parentNode.id}.L${hex.slice(0,8)}`;
  for(let n=12;ids.has(id)&&n<=hex.length;n+=4)id=`${parentNode.id}.L${hex.slice(0,n)}`;
  if(hex.length<8||ids.has(id)){skip(c.record,'No usable LeanIX Fact Sheet ID.');return false;}
  ids.add(id);keys.add(key);
  const entry={id,name:c.name,level:c.level,parent:parentNode.id,variant:c.variant,leanixId:c.record.id,leanixName:c.record.name};
  added.push(entry);placed.set(nameKey(c.record.name),entry);return false;
 });
 for(const c of pending)skip(c.record,'Its LeanIX Parent is neither in the Signavio standard nor added here.');
 added.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {added,skipped};
}

// The checks as CSV for Excel. Values starting with a formula character are prefixed with ' (as in the other CSV exports).
const quote=x=>'"'+String(x??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
const csv=rows=>'﻿'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
// Per application: one row per application and process, with the standard Process ID and Process Name when found (V16).
const RESULT_TEXT={both:'In both',onlyLeanix:'Only in LeanIX',onlyTool:'Only in the tool',notInExport:'Not in this export'};
export function processCheckCSV(check){
 return csv([['Application ID','Application','Process','Process ID','Process Name','Result','LeanIX export'],
  ...check.rows.flatMap(r=>Object.keys(RESULT_TEXT).flatMap(part=>r[part].map(process=>{const s=r.standard?.get(process);return [r.id,r.name,process,s?.id,s?.name,RESULT_TEXT[part],check.file];})))]);
}
// What a catalogue row's result needs explained: several LeanIX processes, the Parent, the owner's mapping, a shared
// name, a local variant only, or a possibly missing process.
export const catalogueNote=r=>{
 const own=r.leanix.filter(x=>x.via!=='shared'),shared=r.leanix.filter(x=>x.via==='shared');
 return [own.length>1?`${own.length} LeanIX processes find this standard process.`:'',
  r.leanix.some(x=>x.via==='mapping')?'Found through the owner\'s mapping of this LeanIX name.':'',
  r.leanix.some(x=>x.via==='parent')?'The catalogue uses this name more than once; the LeanIX Parent decides which.':'',
  shared.length?`The catalogue gives ${shared[0].shared} standard processes this name at this level and the LeanIX Parent does not decide which; the LeanIX processes of that name count for them.`:'',
  r.variantOnly?'In LeanIX only as a local variant (L3V).':'',
  r.possibly?`The catalogue gives ${r.possibly.shared} standard processes this name at this level, but LeanIX has only ${r.possibly.records} (${r.possibly.names.join('; ')}) and the Parent does not decide which: check whether this one is missing.`:''].filter(Boolean).join(' ');
};
// The catalogue: every standard process in catalogue order with its result (V16), then the LeanIX processes that are not
// in it. The first four columns are those of the Data_RBW Process Structure sheet, so the rows can be filled in.
const CATALOGUE_RESULT={'in-leanix':'In LeanIX','missing':'Missing in LeanIX','possibly-missing':'Possibly missing in LeanIX','chain-not-in-export':'Not compared: this process chain is not in the export','ambiguous':'Not compared: the catalogue gives this Process ID two names'};
export function catalogueCheckCSV(catalogue,{file=''}={}){
 const outside=(list,result)=>list.map(r=>['','','','',result,'',r.name,r.id,r.reason+(r.candidates.length?' Candidates: '+r.candidates.map(c=>`${c.id} ${c.label}`).join('; '):''),file]);
 return csv([['RBW E2E Process Chain','Process Level','Process ID','Process Name','Result','Name expected in LeanIX','LeanIX name','LeanIX ID','Note','LeanIX export'],
  ...catalogue.rows.map(r=>[r.chain,r.level,r.id,r.name,CATALOGUE_RESULT[r.status],r.status==='missing'||r.status==='possibly-missing'?r.expected:'',r.leanix.map(x=>x.name).join('\n'),r.leanix.map(x=>x.id).join('\n'),catalogueNote(r),file]),
  ...outside(catalogue.notInCatalogue,'In LeanIX, not in the catalogue'),
  ...outside(catalogue.variants,'In LeanIX as a local variant (L3V), not in the catalogue'),
  ...outside(catalogue.otherNaming,'In LeanIX under other naming (no level L0–L3), not compared')]);
}

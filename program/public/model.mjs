import {split,norm,capCode,PROCESS_LEVEL,compareNatural,otherCompanyRecord} from './codes.mjs';
export {split,norm,capCode} from './codes.mjs';
import {correctionStates,recordKey} from './corrections.mjs';
import {applyLeanixExport} from './leanix-processes.mjs';
import {addLocalProcesses} from './local-layer.mjs';
import {cleanAcceptedRecords,acceptedKey} from './accepted-records.mjs';
const level=id=>id.split('.').length-1;
// How a recorded process name finds its standard process (V16: one rule for the applications and the LeanIX catalogue
// check). An M. code of the catalogue in the text wins; otherwise the level suffix (L0–L3, L3V) and the name after "BBM PM <chain>" are
// looked up within that chain, first among the snapshot names, then among LeanIX names that differ from the snapshot (a
// second, separately marked way to find the same code). Returns {id,via} or, when no single process is found,
// {id:null,type,candidates}. procs: the model's process nodes after the LeanIX export is applied.
export function processLookup(procs){
 const index=key=>{const map=new Map();for(const n of procs.values()){const k=key(n);if(k===null)continue;if(!map.has(k))map.set(k,[]);map.get(k).push(n);}return map;};
 const leanixIndex=index(n=>n.nameStatus==='differs'&&!n.ambiguous?n.level+'|'+norm(n.leanix.name):null);
 const nameIndex=index(n=>n.ambiguous?null:n.level+'|'+norm(n.matchName??n.label));
 return s=>{
  // A code may be a chain's own (Level 0) code, M.I2D, as LeanIX writes it (V16 review; same form as processCode).
  const code=s.match(/\bM\.[A-Z0-9]+(?:\.\d+)*(?=\s|$)/)?.[0];
  if(code&&procs.has(code)&&!procs.get(code).ambiguous)return {id:code,via:'code'};
  const m=s.match(PROCESS_LEVEL);if(!m)return {id:null,type:'流程未标注标准层级'};
  const l=+m[1],name=s.replace(/^BBM\s+PM\s+[A-Z0-9]+\s+/i,'').replace(/\s+L[0-3]V?\s*$/i,'');
  const snapshotNames=nameIndex.get(l+'|'+norm(name))||[],leanixNames=(leanixIndex.get(l+'|'+norm(name))||[]).filter(n=>!snapshotNames.includes(n)),byName=[...snapshotNames,...leanixNames];
  let choices=byName;const chain=s.match(/^BBM\s+PM\s+([A-Z0-9]+)/i)?.[1];if(chain)choices=choices.filter(n=>n.id.split('.')[1]===chain);
  // The Signavio standard wins over a LeanIX local process of the same name (V17).
  if(choices.some(n=>n.local)&&choices.some(n=>!n.local))choices=choices.filter(n=>!n.local);
  if(choices.length===1)return {id:choices[0].id,via:leanixNames.includes(choices[0])?'leanix-name':'name'};
  return {id:null,type:choices.length?'流程名称对应多个编号':byName.length?'流程链编号存在差异':'流程未匹配层级表',candidates:(choices.length?choices:byName).map(n=>({id:n.id,label:n.label}))};
 };
}
export function buildModel(data){
 const caps=new Map(),procs=new Map(),capVersions=new Map(),taxonomyIssues=[];
 function ensureCap(id,label,reference=false){if(!caps.has(id))caps.set(id,{id,label:label||id,level:level(id),children:[],parent:id.includes('.')?id.slice(0,id.lastIndexOf('.')):null});const n=caps.get(id);if(label){if(reference)n.reference=label;else{if(!capVersions.has(id))capVersions.set(id,new Set());capVersions.get(id).add(label);n.label=label;}}return n;}
 for(const row of data.capabilityRows)for(const s of row){const id=capCode(s);if(id)ensureCap(id,String(s),true);}
 for(const r of data.processRows){const [chain,l,id,label]=r;if(!/^L[0-3]$/.test(l)||!id)continue;if(procs.has(String(id))){const n=procs.get(String(id));if(n.label!==String(label)){n.ambiguous=true;taxonomyIssues.push({id:String(id),type:'同一流程编号对应不同名称',value:n.label+' / '+String(label)});}continue;}procs.set(String(id),{id:String(id),label:String(label),level:Number(l[1]),chain:String(chain),children:[],parent:l==='L0'?null:String(id).slice(0,String(id).lastIndexOf('.'))});}
 // The latest LeanIX export is applied to the snapshot by code; it adds names and Fact Sheet IDs, never levels.
 const leanix=applyLeanixExport(procs,data.leanixProcessExport);
 // The LeanIX local process layer (V17) after the Signavio standard; local processes are marked (local-layer.mjs).
 addLocalProcesses(procs,data.localProcesses);
 for(const n of procs.values())if(n.parent&&!procs.has(n.parent))taxonomyIssues.push({id:n.id,type:'流程缺少父级记录',value:n.parent});
 const lookupProcess=processLookup(procs);
 const correctionLog=correctionStates(data),mappings=new Map(correctionLog.filter(c=>c.state==='Applied').map(c=>[recordKey(c),c.targetId]));
 const mapped=(appId,dimension,raw)=>mappings.get(recordKey({appId,dimension,raw}));
 const issues=[];const ids=new Set();
 // Records the owner confirmed as recorded (accepted-records.mjs) are kept on the application instead of becoming issues.
 const accepted=new Map(cleanAcceptedRecords(data.acceptedRecords).map(d=>[acceptedKey(d),d]));
 const flag=(a,dimension,issue)=>{const decision=accepted.get(acceptedKey({appId:a.id,dimension,raw:issue.value}));if(decision)a.accepted.push(decision);else issues.push(issue);};
 // Applications the latest LeanIX export did not list (kept by applyInventory): the profile shows a note.
 const missingFromExport=new Set(data.inventoryExport?.missingIds||[]);
 const apps=data.apps.map((raw,i)=>{
  const id=String(raw.ID??'').trim();if(!id||!String(raw.Name??'').trim())throw Error(`第 ${i+2} 行缺少 ID 或 Name`);if(ids.has(id))throw Error(`应用 ID 重复：${id}`);ids.add(id);
  // HC records belong to another company (owner 2026-10-22): left out of every count, column, search and comparison
  // unless an owner mapping names them. The source fields stay as recorded; Source records names what is not used.
  const records=(dimension,value)=>{const all=split(value),other=s=>otherCompanyRecord(s)&&!mapped(id,dimension,s);return {own:all.filter(s=>!other(s)),other:all.filter(other)};};
  const capRecords=records('cap',raw['Business Capabilities']),processRecords=records('process',raw.Processes);
  const a={...raw,id,cap:[],process:[],unmatched:[],processMatches:[],accepted:[],notInExport:missingFromExport.has(id)?data.inventoryExport:null,rawCap:capRecords.own,rawProcess:processRecords.own,otherCompany:[...capRecords.other,...processRecords.other]};
  for(const s of a.rawCap){const corrected=mapped(id,'cap',s);if(corrected){a.cap.push(corrected);continue;}const code=capCode(s);if(code){ensureCap(code,s);a.cap.push(code);}else{a.unmatched.push(s);flag(a,'cap',{appId:a.id,app:a.Name,type:'业务能力无法识别',value:s});}}
  // L3V is Level 3 (owner decision 2026-10-19): matched by name and counted exactly like L3.
  // A record with a full business process code is matched by that code first; otherwise by chain, level and
  // name (case, spacing and 'and' / '&' are equivalent). A name that fits several codes is never resolved by order.
  for(const s of a.rawProcess){const corrected=mapped(id,'process',s);if(corrected){a.process.push(corrected);a.processMatches.push({raw:s,id:corrected,via:'mapping'});continue;}const found=lookupProcess(s);if(found.id){a.process.push(found.id);a.processMatches.push({raw:s,id:found.id,via:found.via});continue;}a.unmatched.push(s);flag(a,'process',{appId:a.id,app:a.Name,type:found.type,value:s,...(found.candidates?{candidates:found.candidates}:{})});}
  if(!a.rawCap.length&&mapped(id,'cap',''))a.cap.push(mapped(id,'cap',''));
  if(!a.rawProcess.length&&mapped(id,'process',''))a.process.push(mapped(id,'process',''));
  a.cap=[...new Set(a.cap)];a.process=[...new Set(a.process)];return a;
 });
 // Codes define capability ancestry, never worksheet row positions.
 for(const id of [...caps.keys()]){let p=id;while(p.includes('.')){p=p.slice(0,p.lastIndexOf('.'));ensureCap(p);}}
 for(const map of [caps,procs])for(const n of map.values())if(n.parent&&map.has(n.parent))map.get(n.parent).children.push(n.id);
 for(const map of [caps,procs])for(const n of map.values())n.children.sort((a,b)=>compareNatural(a,b));
 const ancestor=(a,b)=>a===b||b.startsWith(a+'.');
 for(const a of apps)for(const dim of ['cap','process'])a[dim+'Leaf']=a[dim].filter(id=>!a[dim].some(other=>other!==id&&ancestor(id,other)));
 const conflicts=[];for(const [id,labels]of capVersions){const n=caps.get(id);n.labels=[...labels];n.hasNameDifference=!!n.reference&&n.labels.some(s=>norm(s.replace(/^\S+\s*/,''))!==norm(n.reference.replace(/^\S+\s*/,'')));if(!n.reference&&n.labels.length>1)n.label=id+' 名称存在差异（'+n.labels.length+' 种）';if(n.hasNameDifference)conflicts.push({id,reference:n.reference,actual:n.labels});}
 // The user-selected taxonomy owns display names. Raw application registrations
 // remain intact, including when a code has several source labels.
 for(const n of caps.values())if(n.reference){n.label=n.reference;n.nameSource='reference';}
 // The capability list is the business capability standard when taxonomySource names it (see xlsx.mjs taxonomySourceName).
 const standardCatalogue=/^.+? \(capabilities\); /.test(String(data.taxonomySource??''));
 return {apps,caps,procs,issues,conflicts,taxonomyIssues,ancestor,correctionLog,standardCatalogue,leanix,accepted:apps.flatMap(a=>a.accepted.map(d=>({...d,app:a.Name})))};
}
export function columns(model,view,expanded,focus=''){
 const map=view==='cap'?model.caps:model.procs,leaf=view+'Leaf';const match=id=>model.apps.filter(a=>a[leaf].some(x=>model.ancestor(id,x)));
 // Each column records the opened categories it sits in (outermost first), so the page can show which parent a
 // sub-category column belongs to.
 const descend=(id,opened=[])=>{const node=map.get(id),all=match(id);if(!all.length)return[];const children=node.children.filter(x=>match(x).length);if(expanded.has(id)&&children.length){const exact=all.filter(a=>a[leaf].includes(id)),inside=[...opened,id];return [...(exact.length?[{...node,key:id+'@direct',direct:true,apps:exact,opened:inside}]:[]),...children.flatMap(child=>descend(child,inside))];}return[{...node,key:id,apps:all,canExpand:!!children.length,opened}];};
 let roots;if(view==='cap'){roots=[...map.values()].filter(n=>n.level===2&&n.id.startsWith('B.06.')).map(n=>n.id);const outside=[...map.values()].filter(n=>n.level===1&&n.id!=='B.06'&&match(n.id).length).map(n=>n.id).sort();roots.push(...outside);}else roots=[...map.values()].filter(n=>!n.parent||!map.has(n.parent)).map(n=>n.id);
 if(focus&&map.has(focus))return descend(focus);
 const cols=roots.flatMap(id=>descend(id));const covered=new Set(cols.flatMap(c=>c.apps.map(a=>a.id)));const extra=model.apps.filter(a=>!covered.has(a.id)||(view==='cap'&&a.capLeaf.some(id=>!roots.some(root=>model.ancestor(root,id)))));
 // Keep unmatched process assignments visible even when some other assignments map.
 const unresolved=model.apps.filter(a=>model.issues.some(i=>i.appId===a.id&&i.type.startsWith(view==='process'?'流程':'业务能力')));
 const others=[...new Map([...extra,...unresolved].map(a=>[a.id,a])).values()];
 if(others.length)cols.push({id:'unmapped',key:'unmapped',label:view==='cap'?'仅填到总类 / 未匹配':'未匹配 / 未填写流程',level:null,apps:others,opened:[]});
 return cols;
}

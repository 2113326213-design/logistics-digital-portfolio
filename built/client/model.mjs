import {split,norm,capCode,PROCESS_LEVEL,compareNatural} from './codes.mjs';
export {split,norm,capCode} from './codes.mjs';
import {correctionStates,recordKey} from './corrections.mjs';
import {applyLeanixExport} from './leanix-processes.mjs';
const level=id=>id.split('.').length-1;
export function buildModel(data){
 const caps=new Map(),procs=new Map(),capVersions=new Map(),taxonomyIssues=[];
 function ensureCap(id,label,reference=false){if(!caps.has(id))caps.set(id,{id,label:label||id,level:level(id),children:[],parent:id.includes('.')?id.slice(0,id.lastIndexOf('.')):null});const n=caps.get(id);if(label){if(reference)n.reference=label;else{if(!capVersions.has(id))capVersions.set(id,new Set());capVersions.get(id).add(label);n.label=label;}}return n;}
 for(const row of data.capabilityRows)for(const s of row){const id=capCode(s);if(id)ensureCap(id,String(s),true);}
 for(const r of data.processRows){const [chain,l,id,label]=r;if(!/^L[0-3]$/.test(l)||!id)continue;if(procs.has(String(id))){const n=procs.get(String(id));if(n.label!==String(label)){n.ambiguous=true;taxonomyIssues.push({id:String(id),type:'同一流程编号对应不同名称',value:n.label+' / '+String(label)});}continue;}procs.set(String(id),{id:String(id),label:String(label),level:Number(l[1]),chain:String(chain),children:[],parent:l==='L0'?null:String(id).slice(0,String(id).lastIndexOf('.'))});}
 // The latest LeanIX export is applied to the snapshot by code; it adds names and Fact Sheet IDs, never levels.
 const leanix=applyLeanixExport(procs,data.leanixProcessExport);
 // LeanIX names that differ from the snapshot are a second, separately marked way to find the same code.
 const leanixIndex=new Map();for(const n of procs.values())if(n.nameStatus==='differs'&&!n.ambiguous){const k=n.level+'|'+norm(n.leanix.name);if(!leanixIndex.has(k))leanixIndex.set(k,[]);leanixIndex.get(k).push(n);}
 const nameIndex=new Map();for(const n of procs.values()){if(n.parent&&!procs.has(n.parent))taxonomyIssues.push({id:n.id,type:'流程缺少父级记录',value:n.parent});if(n.ambiguous)continue;const k=n.level+'|'+norm(n.label);if(!nameIndex.has(k))nameIndex.set(k,[]);nameIndex.get(k).push(n);}
 const correctionLog=correctionStates(data),mappings=new Map(correctionLog.filter(c=>c.state==='Applied').map(c=>[recordKey(c),c.targetId]));
 const mapped=(appId,dimension,raw)=>mappings.get(recordKey({appId,dimension,raw}));
 const issues=[];const ids=new Set();
 const apps=data.apps.map((raw,i)=>{
  const id=String(raw.ID??'').trim();if(!id||!String(raw.Name??'').trim())throw Error(`第 ${i+2} 行缺少 ID 或 Name`);if(ids.has(id))throw Error(`应用 ID 重复：${id}`);ids.add(id);
  const a={...raw,id,cap:[],process:[],unmatched:[],processMatches:[],rawCap:split(raw['Business Capabilities']),rawProcess:split(raw.Processes)};
  for(const s of a.rawCap){const corrected=mapped(id,'cap',s);if(corrected){a.cap.push(corrected);continue;}const code=capCode(s);if(code){ensureCap(code,s);a.cap.push(code);}else{a.unmatched.push(s);issues.push({appId:a.id,app:a.Name,type:'业务能力无法识别',value:s});}}
  // L3V is Level 3 (owner decision 2026-10-19): matched by name and counted exactly like L3.
  // A record with a full business process code is matched by that code first; otherwise by chain, level and
  // name (case, spacing and 'and' / '&' are equivalent). A name that fits several codes is never resolved by order.
  for(const s of a.rawProcess){const corrected=mapped(id,'process',s);if(corrected){a.process.push(corrected);a.processMatches.push({raw:s,id:corrected,via:'mapping'});continue;}const code=s.match(/\bM\.[A-Z0-9]+(?:\.\d+)+(?=\s|$)/)?.[0];if(code&&procs.has(code)&&!procs.get(code).ambiguous){a.process.push(code);a.processMatches.push({raw:s,id:code,via:'code'});continue;}const m=s.match(PROCESS_LEVEL);if(!m){a.unmatched.push(s);issues.push({appId:a.id,app:a.Name,type:'流程未标注标准层级',value:s});continue;}const l=+m[1],name=s.replace(/^BBM\s+PM\s+[A-Z0-9]+\s+/i,'').replace(/\s+L[0-3]V?\s*$/i,'');const snapshotNames=nameIndex.get(l+'|'+norm(name))||[],leanixNames=(leanixIndex.get(l+'|'+norm(name))||[]).filter(n=>!snapshotNames.includes(n)),byName=[...snapshotNames,...leanixNames];let choices=byName;const chain=s.match(/^BBM\s+PM\s+([A-Z0-9]+)/i)?.[1];if(chain)choices=choices.filter(n=>n.id.split('.')[1]===chain);if(choices.length===1){a.process.push(choices[0].id);a.processMatches.push({raw:s,id:choices[0].id,via:leanixNames.includes(choices[0])?'leanix-name':'name'});}else{a.unmatched.push(s);issues.push({appId:a.id,app:a.Name,type:choices.length?'流程名称对应多个编号':byName.length?'流程链编号存在差异':'流程未匹配层级表',value:s,candidates:(choices.length?choices:byName).map(n=>({id:n.id,label:n.label}))});}}
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
 return {apps,caps,procs,issues,conflicts,taxonomyIssues,ancestor,correctionLog,standardCatalogue,leanix};
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

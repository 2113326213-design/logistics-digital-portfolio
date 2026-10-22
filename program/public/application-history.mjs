import {buildModel} from './model.mjs';
import {reviewItems,reviewAuditEvents} from './reviews.mjs';
import {correctionStates} from './corrections.mjs';
import {english} from './english.mjs';
import {historyFieldLabel,historyFieldValue} from './history-view.mjs';

const kinds=['created','issue','fixed','updated','uploaded','note'];
const fields=['Name','Division','Entity','Description','Main Business Capability','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active','operationCostScore','roiScore','annualBenefitCNY','annualBenefitSource','scopeNote','statusNote'];
// Annual benefit changes stay in stored history for retention but are never displayed.
const hiddenFields=new Set(['annualBenefitCNY','annualBenefitSource']);
// Field changes between two workspaces for every application in both, in field order, without the hidden fields. The
// import preview shows them before Apply (owner request 2026-10-22, V9.20); recordImport stores the same comparison.
export function fieldChanges(current,incoming){
 const before=new Map(current.apps.map(a=>[String(a.ID).trim(),a])),out=[];
 for(const a of incoming.apps){
  const appId=String(a.ID).trim(),previous=before.get(appId);if(!previous)continue;
  for(const field of fields){if(hiddenFields.has(field))continue;const x=String(previous[field]??''),y=String(a[field]??'');if(x!==y)out.push({appId,name:String(a.Name??''),field,before:x,after:y});}
 }
 return out;
}
const value=(v,max=6000)=>String(v??'').slice(0,max);
const unique=events=>[...new Map(events.map(e=>[e.id,e])).values()];
// Import events are immutable records: the first (local) copy of an ID wins. Fields an older
// edition strips (compact application list, owner decisions) are restored from a later copy.
const mergeImportEvents=events=>{const byId=new Map();for(const e of events){const prior=byId.get(e.id);if(!prior){byId.set(e.id,e);continue;}
 const lostApps=!prior.appIds.length&&!prior.appIdsBase&&(e.appIds.length||e.appIdsBase),lostDecisions=!prior.decisions&&e.decisions;
 if(lostApps||lostDecisions)byId.set(e.id,{...prior,...(lostApps?{appIds:e.appIds,...(e.appIdsBase?{appIdsBase:e.appIdsBase,removedIds:e.removedIds}:{})}:{}),...(lostDecisions?{decisions:e.decisions}:{})});}
 return [...byId.values()];};
export const eventId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');

export function cleanApplicationEvents(events){
 if(!Array.isArray(events))return [];
 return events.filter(e=>e&&typeof e==='object'&&e.id&&e.appId&&kinds.includes(e.kind)&&e.happenedAt&&e.recordedAt&&e.recorder&&e.details).map(e=>({
  id:value(e.id,100),appId:value(e.appId,200),kind:e.kind,happenedAt:value(e.happenedAt,40),recordedAt:value(e.recordedAt,40),recorder:value(e.recorder,200),details:value(e.details)
 }));
}

export function cleanImportHistory(events){
 if(!Array.isArray(events))return [];
 return events.filter(e=>e&&typeof e==='object'&&e.id&&e.at&&Array.isArray(e.appIds)).map(e=>({
  id:value(e.id,100),at:value(e.at,40),kind:['restore','taxonomy'].includes(e.kind)?e.kind:'import',source:value(e.source,300),taxonomySource:value(e.taxonomySource,300),
  inventoryFile:value(e.inventoryFile,300),taxonomyFile:value(e.taxonomyFile,300),appIds:e.appIds.map(id=>value(id,200)),
  // Compact events list only the difference from an earlier event (see importAppIds).
  ...(e.appIdsBase?{appIdsBase:value(e.appIdsBase,100),removedIds:Array.isArray(e.removedIds)?e.removedIds.map(id=>value(id,200)):[]}:{}),
  addedIds:Array.isArray(e.addedIds)?e.addedIds.map(id=>value(id,200)):[],
  changes:Array.isArray(e.changes)?e.changes.filter(c=>c?.appId&&fields.includes(c.field)).map(c=>({appId:value(c.appId,200),field:c.field,before:value(c.before,850),after:value(c.after,850),truncated:!!c.truncated})):[],
  issues:Array.isArray(e.issues)?e.issues.filter(i=>i?.appId&&['flagged','cleared'].includes(i.kind)).map(i=>({appId:value(i.appId,200),kind:i.kind,category:value(i.category,150),record:value(i.record,1000)})):[],
  ...(Array.isArray(e.decisions)&&e.decisions.length?{decisions:e.decisions.filter(d=>d?.appId&&d.note).map(d=>({appId:value(d.appId,200),field:value(d.field,100),before:value(d.before,850),after:value(d.after,850),note:value(d.note,300)}))}:{})
 }));
}

// Applications covered by each import event. Older events list every ID; compact events
// store the base event plus removed/added IDs and resolve to the same list.
export function importAppIds(events){
 const byId=new Map(events.map(e=>[e.id,e])),resolved=new Map();
 const resolve=(e,seen)=>{
  if(resolved.has(e.id))return resolved.get(e.id);
  let ids=e.appIds;const base=e.appIdsBase&&byId.get(e.appIdsBase);
  if(base&&!seen.has(base.id)){seen.add(e.id);const removed=new Set(e.removedIds||[]);ids=[...new Set([...resolve(base,seen).filter(id=>!removed.has(id)),...e.addedIds])];}
  // A compact event whose base is unavailable still covers every application it records.
  else if(!ids.length)ids=[...new Set([...e.addedIds,...e.changes.map(c=>c.appId),...e.issues.map(i=>i.appId),...(e.decisions||[]).map(d=>d.appId)])];
  resolved.set(e.id,ids);return ids;
 };
 for(const e of events)resolve(e,new Set());
 return resolved;
}
export function importEvents(history){const events=cleanImportHistory(history),ids=importAppIds(events);return events.map(e=>({...e,appIds:ids.get(e.id)}));}

function issueMap(data){
 const items=reviewItems(buildModel({...data,corrections:[]})),byApp=new Map();
 for(const i of items)for(const appId of i.appIds){if(!byApp.has(appId))byApp.set(appId,new Map());const key=JSON.stringify([i.category,i.code,i.raw]);byApp.get(appId).set(key,{category:i.category,record:i.raw});}
 return byApp;
}

export function recordImport(current,incoming,{inventoryFile='',taxonomyFile='',kind='import',at=new Date().toISOString(),decisions=[]}={}){
 const before=new Map(current.apps.map(a=>[String(a.ID).trim(),a])),after=new Map(incoming.apps.map(a=>[String(a.ID).trim(),a]));
 const beforeIssues=issueMap(current),afterIssues=issueMap(incoming),changes=[],issues=[],addedIds=[];
 for(const [appId,a] of after){
  const previous=before.get(appId);if(!previous)addedIds.push(appId);
  if(previous)for(const field of fields){const x=String(previous[field]??''),y=String(a[field]??'');if(x===y)continue;changes.push({appId,field,before:x.slice(0,850),after:y.slice(0,850),truncated:x.length>850||y.length>850});}
  const old=beforeIssues.get(appId)||new Map(),fresh=afterIssues.get(appId)||new Map();
  for(const [key,item] of fresh)if(!old.has(key))issues.push({appId,kind:'flagged',...item});
  for(const [key,item] of old)if(!fresh.has(key))issues.push({appId,kind:'cleared',...item});
 }
 // Keep each event small without losing data: when the latest event already lists the current
 // applications, store only the removed/added IDs relative to it instead of every ID again.
 const history=cleanImportHistory(current.importHistory),base=history.at(-1),baseIds=base&&importAppIds(history).get(base.id);
 const apps=baseIds&&baseIds.length===before.size&&baseIds.every(id=>before.has(id))?{appIds:[],appIdsBase:base.id,removedIds:[...before.keys()].filter(id=>!after.has(id))}:{appIds:[...after.keys()]};
 const event={id:eventId(),at,kind:kind==='restore'?'restore':!inventoryFile&&taxonomyFile?'taxonomy':'import',source:incoming.source,taxonomySource:incoming.taxonomySource,inventoryFile,taxonomyFile,...apps,addedIds,changes,issues,...(decisions.length?{decisions}:{})};
 return {...incoming,applicationEvents:unique([...cleanApplicationEvents(current.applicationEvents),...cleanApplicationEvents(incoming.applicationEvents)]),importHistory:mergeImportEvents([...history,...cleanImportHistory(incoming.importHistory),event])};
}

export function applicationTimeline(data,appId){
 const entries=[];
 for(const e of cleanApplicationEvents(data.applicationEvents))if(e.appId===appId)entries.push({id:e.id,at:e.happenedAt,recordedAt:e.recordedAt,kind:e.kind,source:'manual',actor:e.recorder,description:e.details});
 for(const e of importEvents(data.importHistory))if(e.appIds.includes(appId)){
  const changed=e.changes.filter(c=>c.appId===appId&&!hiddenFields.has(c.field)),added=e.addedIds.includes(appId),details=changed.map(c=>({field:c.field,before:c.before,after:c.after,truncated:c.truncated}));
  entries.push({id:e.id+':'+appId,at:e.at,kind:e.kind,source:'system',actor:'Workspace import',description:added?'Application first added to this workspace':e.kind==='restore'?'Previous workspace restored':e.kind==='taxonomy'?'Taxonomy uploaded; application recalculated':'Inventory included in import',inventoryFile:e.inventoryFile||e.kind==='import'&&e.source||'',taxonomyFile:e.taxonomyFile,details});
  for(const [n,issue] of e.issues.filter(i=>i.appId===appId).entries())entries.push({id:e.id+':issue:'+appId+':'+n,at:e.at,kind:issue.kind,source:'system',actor:'Import check',description:`${english(issue.category)}: ${english(issue.record)}`});
  for(const [n,decision] of (e.decisions||[]).filter(d=>d.appId===appId).entries())entries.push({id:e.id+':decision:'+appId+':'+n,at:e.at,kind:'decision',source:'system',actor:'Owner decision',description:decision.note,inventoryFile:e.inventoryFile||e.kind==='import'&&e.source||'',details:[{field:decision.field,before:decision.before,after:decision.after,truncated:false}]});
 }
 const corrections=correctionStates(data);
 for(const e of reviewAuditEvents(data,reviewItems(buildModel({...data,corrections:[]})))){
  const isMapping=e.action==='mapping'||e.action==='revoke';
  const correction=isMapping?corrections.find(c=>c.id===e.mappingId):null;
  const match=isMapping?correction?.appId===appId:e.appIds?.includes(appId);
  if(!match)continue;
  const entry={id:e.id,at:e.at,kind:e.action,source:'review',actor:e.reviewer,description:e.action==='mapping'?`${e.raw||'Source record'} → ${e.targetId}. ${e.reason||''}`:e.action==='revoke'?`Mapping to ${e.targetId} revoked. ${e.reason||''}`:e.action==='snapshot'?`Previous saved review note: ${e.result||'No written result'}`:`${english(e.previousStatus||'Pending')} → ${english(e.status||'Pending')}. ${e.result||'No written result'}`};
  if(correction){
   // Historical labels come from the saved decision, not today's taxonomy.
   let target;
   try{const snapshot=JSON.parse(correction.taxonomySnapshot);if(Array.isArray(snapshot))target=snapshot.find(node=>node.id===correction.targetId);}catch{}
   const targetLabel=String(target?.label||'');
   const targetName=correction.dimension==='cap'?targetLabel.replace(/^\s*[A-Z]+\.\d+(?:\.\d+)*\s+/i,''):targetLabel;
   entry.mapping={dimension:correction.dimension,raw:correction.raw,targetId:correction.targetId,targetName,reason:e.reason||''};
  }else if(e.action==='note'||e.action==='snapshot'){
   entry.review={raw:e.raw||'',previousStatus:e.previousStatus,status:e.status,previousResult:e.previousResult,result:e.result,reason:e.reason||''};
  }
  entries.push(entry);
 }
 return entries.sort((a,b)=>String(b.at).localeCompare(String(a.at))||a.id.localeCompare(b.id));
}

export function applicationTimelineCSV(app,events,inventorySource){
 const quote=x=>'"'+String(x??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
 const rows=[['Application ID','Application','Lifecycle active since','Inventory source','Event date','Event','Recorded by','Description','Field changes','Source file','Entered at'],...events.map(e=>[
  app.ID,app.Name,app['Lifecycle: Active'],inventorySource,e.at,e.kind,e.actor,e.description,
  (e.details||[]).map(c=>`${historyFieldLabel(c.field)}: ${historyFieldValue(c.field,c.before)} → ${historyFieldValue(c.field,c.after)}${c.truncated?' (preview shortened)':''}`).join('\n'),e.inventoryFile||e.taxonomyFile||'',e.recordedAt||''
 ])];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}

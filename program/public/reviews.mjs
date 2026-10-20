import {english} from './english.mjs';
import {capCode} from './model.mjs';
import {semanticConcerns} from './semantic-review.mjs';
export const reviewStatuses=['待核对','待补充','已确认'];
export function cleanReviews(value){
 const out=Object.create(null);
 if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const [key,n] of Object.entries(value)){
  if(!n||typeof n!=='object')continue;
  const note={status:reviewStatuses.includes(n.status)?n.status:'待核对',result:String(n.result||'').slice(0,6000),reviewer:String(n.reviewer||'').slice(0,200),updatedAt:String(n.updatedAt||'').slice(0,40)};
  if(note.status==='已确认'&&(!note.result.trim()||!note.reviewer.trim()))note.status='待核对';
  out[key]=note;
 }
 return out;
}
export function cleanReviewHistory(value){
 if(!Array.isArray(value))return [];
 return value.filter(e=>e&&typeof e==='object'&&['note','revoke','snapshot'].includes(e.action)&&e.id&&e.at&&e.reviewer).map(e=>({
  id:String(e.id).slice(0,100),action:e.action,at:String(e.at).slice(0,40),reviewer:String(e.reviewer).slice(0,200),
  issueKey:String(e.issueKey||'').slice(0,2000),appIds:Array.isArray(e.appIds)?e.appIds.map(String).slice(0,100):[],
  appNames:Array.isArray(e.appNames)?e.appNames.map(x=>String(x).slice(0,250)).slice(0,100):[],
  raw:String(e.raw||'').slice(0,1000),targetId:String(e.targetId||'').slice(0,150),mappingId:String(e.mappingId||'').slice(0,100),
  status:reviewStatuses.includes(e.status)?e.status:'待核对',previousStatus:reviewStatuses.includes(e.previousStatus)?e.previousStatus:'待核对',
  result:String(e.result||'').slice(0,6000),previousResult:String(e.previousResult||'').slice(0,6000),reason:String(e.reason||'').slice(0,6000)
 }));
}
export function reviewAuditEvents(data,items=[]){
 const names=new Map((data.apps||[]).map(a=>[String(a.ID),String(a.Name)])),byKey=new Map(items.map(i=>[i.key,i]));
 const notes=cleanReviewHistory(data.reviewHistory),events=notes.map(e=>({...e,application:e.appNames.join(', ')||e.appIds.map(id=>names.get(id)||id).join(', ')||byKey.get(e.issueKey)?.code||'Process taxonomy'}));
 const revoked=new Set(notes.filter(e=>e.action==='revoke').map(e=>e.mappingId));
 for(const c of data.corrections||[]){
  const app=names.get(c.appId)||c.appId;
  events.push({id:'mapping:'+c.id,action:'mapping',at:c.createdAt,reviewer:c.reviewer,issueKey:c.reviewKey,application:app,raw:c.raw,targetId:c.targetId,mappingId:c.id,reason:c.reason,state:c.revokedAt?'Revoked':'Applied'});
  if(c.revokedAt&&!revoked.has(c.id))events.push({id:'legacy-revoke:'+c.id,action:'revoke',at:c.revokedAt,reviewer:'Not recorded',issueKey:c.reviewKey,application:app,raw:c.raw,targetId:c.targetId,mappingId:c.id,reason:'Reason was not recorded in the previous version.'});
 }
 // Older saved workspaces kept only the latest note; show it as a snapshot,
 // without inventing earlier changes that were never recorded.
 for(const [key,n] of Object.entries(data.reviews||{}))if(n.updatedAt&&!notes.some(e=>e.issueKey===key)){
  const i=byKey.get(key);events.push({id:'snapshot:'+key,action:'snapshot',at:n.updatedAt,reviewer:n.reviewer||'Not recorded',issueKey:key,appIds:i?.appIds||[],application:i?.apps.join(', ')||i?.code||'Unknown issue',raw:i?.raw||'',status:n.status,result:n.result,reason:'Earlier changes were not recorded.'});
 }
 return events.sort((a,b)=>String(b.at).localeCompare(String(a.at))||String(b.id).localeCompare(String(a.id)));
}
export function reviewAuditCSV(events){
 const quote=v=>'"'+String(v??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
 const rows=[['Time','Action','Application / Code','Source record','Standard code','Previous status','Status','Previous result','Result / Reason','Reviewer'],...events.map(e=>[e.at,e.action,e.application,e.raw,e.targetId,e.action==='note'?e.previousStatus:'',e.status||e.state||'',e.action==='note'?e.previousResult:'',e.action==='note'?e.result:e.reason,e.reviewer])];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
export function reviewItems(model){
 const items=[];
 const add=(category,apps,code,raw,reference,reason,extra={})=>{
  apps=[...apps].sort((a,b)=>a.id.localeCompare(b.id));const appIds=apps.map(a=>a.id);
  items.push({key:JSON.stringify([category,appIds,code,raw,reference]),category,appIds,apps:apps.map(a=>a.Name),code,raw,reference,reason,...extra});
 };
 for(const i of model.issues){
  const a=model.apps.find(a=>a.id===i.appId);
  add(i.type.startsWith('流程')?'流程匹配':'能力匹配',a?[a]:[],'',i.value,i.candidates?.map(n=>n.id+' '+n.label).join('\n')||'标准表未找到唯一对应项',i.type);
 }
 for(const i of model.taxonomyIssues)add('流程层级表',[],i.id,i.value,model.procs.get(i.id)?.label||'需补充标准记录',i.type);
 const missing=new Map();
 for(const a of model.apps){
  for(const id of a.cap)if(!model.caps.get(id)?.reference){if(!missing.has(id))missing.set(id,[]);missing.get(id).push(a);}
  if(!a.rawProcess.length)add('未填写流程',[a],'','未填写','需由业务方确认流程链、名称和层级','应用清单未填写 Process');
 }
 for(const [id,apps] of missing)add('能力编码缺失',apps,id,[...new Set(apps.flatMap(a=>a.rawCap.filter(v=>capCode(v)===id)))].join('\n'),'当前分类表未收录此编号','保留原始编号，请确认分类表是否需要补充');
 // Keep exact source wording and the standard reference in the issue identity.
 // Applied decisions are resolved by reviewResolution, not by hiding the source.
 const meanings=new Map();
 for(const app of model.apps)for(const concern of semanticConcerns(app,[],model.caps)){
  const reference=model.caps.get(concern.code)?.reference||`${concern.code} ${concern.standardName}`;
  const key=JSON.stringify([concern.code,concern.raw,reference]);
  if(!meanings.has(key))meanings.set(key,{...concern,reference,apps:[]});
  meanings.get(key).apps.push(app);
 }
 for(const group of meanings.values())add('能力匹配',group.apps,group.code,group.raw,group.reference,'Business meaning needs confirmation; capability evidence is withheld until a verified mapping is applied.',{semantic:true});
 return items;
}
// Keep the shared issue identity for its audit note, but project every application
// field and mapping action onto the selected cohort.
export function scopeReviewItems(items,scope,model){
 if(!scope)return items;
 const ids=new Set(scope.appIds),categories=scope.dimension==='cap'?['能力匹配','能力编码缺失']:['流程匹配','未填写流程'];
 return items.flatMap(item=>{
  if(!categories.includes(item.category))return [];
  const indices=item.appIds.map((id,i)=>ids.has(id)?i:-1).filter(i=>i>=0);
  if(!indices.length)return [];
  const appIds=indices.map(i=>item.appIds[i]),apps=indices.map(i=>item.apps[i]);
  const raw=item.category==='能力编码缺失'?[...new Set(model.apps.filter(a=>appIds.includes(a.id)).flatMap(a=>a.rawCap.filter(v=>capCode(v)===item.code)))].join('\n'):item.raw;
  return [{...item,appIds,apps,raw,sharedApplicationCount:item.sharedApplicationCount??item.appIds.length}];
 });
}
export function scopeReviewMappings(mappings,scope){
 return scope?mappings.filter(c=>scope.appIds.includes(c.appId)&&c.dimension===scope.dimension):mappings;
}
export function scopeReviewAuditEvents(events,scope,mappings=[],items=[]){
 if(!scope)return events;
 const ids=new Set(scope.appIds),byKey=new Map(items.map(i=>[i.key,i]));
 const categories=scope.dimension==='cap'?['能力匹配','能力编码缺失']:['流程匹配','未填写流程'];
 return events.filter(event=>{
  const issue=byKey.get(event.issueKey);
  if(issue&&!categories.includes(issue.category))return false;
  return event.appIds?.some(id=>ids.has(id))||mappings.some(c=>c.id===event.mappingId&&ids.has(c.appId)&&c.dimension===scope.dimension);
 });
}
export function reviewItemResolved(item,mappings){
 if(!item.appIds.length)return false;
 return item.appIds.every(appId=>mappings.some(c=>c.state==='Applied'&&c.reviewKey===item.key&&c.appId===appId));
}
export function reviewResolution(item,mappings){
 if(reviewItemResolved(item,mappings))return 'mapped';
 if(item.category==='能力编码缺失'&&!/^B\.06(?:\.|$)/.test(item.code))return 'outside';
 return 'action';
}
export function reviewCSV(items,reviews,source,taxonomySource,corrections=[]){
 const quote=v=>'"'+String(v??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
 const labels={action:'Needs review',mapped:'Mapped or aligned',outside:'Outside B.06'};
 const rows=[['Resolution group','Issue category','Application ID','Application name','Code','Source record','Reference / Unconfirmed candidates','Issue','Review status','Resolution / Proposed correction','Reviewer','Updated at','Inventory source','Taxonomy source','Mapping audit'],...items.map(i=>{const n=reviews[i.key]||{};return [labels[reviewResolution(i,corrections)],english(i.category),i.appIds.join('\n'),i.apps.join('\n'),i.code,english(i.raw),english(i.reference),english(i.reason),english(n.status||'待核对'),n.result||'',n.reviewer||'',n.updatedAt||'',english(source),english(taxonomySource),corrections.filter(c=>c.reviewKey===i.key&&i.appIds.includes(c.appId)).map(c=>`${c.state} | ${c.appId} | ${c.raw} -> ${c.targetId} | ${c.reviewer} | ${c.createdAt}${c.revokedAt?' | Revoked '+c.revokedAt:''}`).join('\n')];})];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}

// Application History presentation (English, no Annual benefit) and lossless compact import
// history (audit 2026-10-15 items 5, 6, 14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {recordImport,applicationTimeline,applicationTimelineCSV,importEvents} from '../public/application-history.mjs';
import {chronologicalEvents,renderHistoryRecords} from '../public/history-view.mjs';
import {autosaveLimitBytes} from '../public/autosave.mjs';
import {buildModel,columns} from '../public/model.mjs';
import {english} from '../public/english.mjs';
import {landscapeHeaderCell} from '../public/landscape.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const CJK=/[　-ヿ㐀-鿿豈-﫿＀-￯]/;
const ids=data.apps.map(app=>app.ID.trim());
const history=(workspace,app)=>{const events=chronologicalEvents(applicationTimeline(workspace,app.ID));return {events,html:renderHistoryRecords(events,{},esc),csv:applicationTimelineCSV(app,events,workspace.source)};};
const same=(left,right)=>assert.deepEqual([...left].sort(),[...right].sort());

test('History panel and CSV show import checks in English while stored records stay original',()=>{
 const rack=data.apps.find(app=>app.Name==='AUTO-RACK'),other=data.apps.find(app=>app.ID!==rack.ID&&app.Processes);
 const incoming={...data,apps:data.apps.map(app=>app.ID===rack.ID?{...app,Processes:''}:app.ID===other.ID?{...app,Processes:app.Processes+';Unclassified new process','Business Capabilities':app['Business Capabilities']+';B.06.9.9 Unlisted capability'}:app)};
 const recorded=recordImport(data,incoming,{inventoryFile:'checks.xlsx',at:'2026-10-16T01:00:00.000Z'}),stored=recorded.importHistory.at(-1).issues;
 assert(stored.some(issue=>issue.appId===rack.ID&&issue.category==='未填写流程'&&issue.record==='未填写'),'stored history is not rewritten');
 const blank=history(recorded,rack),changed=history(recorded,other);
 assert(blank.events.some(event=>event.description==='Missing process: Not provided'));
 assert(changed.events.some(event=>event.description==='Process mapping: Unclassified new process'));
 assert(changed.events.some(event=>event.description.startsWith('Missing capability code: ')));
 for(const {html,csv} of [blank,changed]){assert.doesNotMatch(html,CJK);assert.doesNotMatch(csv,CJK);}
});

test('History field headings use readable labels instead of internal keys',()=>{
 const app=data.apps.find(item=>item.operationCostScore===1&&item.roiScore),roi=app.roiScore===5?3:5;
 const incoming={...data,apps:data.apps.map(item=>item===app?{...item,operationCostScore:2,roiScore:roi,scopeNote:'Scope reviewed in test'}:item)};
 const {html,csv}=history(recordImport(data,incoming,{inventoryFile:'scores.xlsx'}),app);
 for(const text of [html,csv]){assert(text.includes('Operation cost score'));assert(text.includes('ROI (payback period)'));assert(text.includes('Scope note'));assert.doesNotMatch(text,/operationCostScore|roiScore|scopeNote|ROI score/);}
 // ROI appears as its payback period with the score it comes from (1 → > 2 years, 3 → > 1 year, 5 → < 1 year).
 const payback={1:'> 2 years',3:'> 1 year',5:'< 1 year'};
 assert(csv.includes('Operation cost score: 1 → 2'));assert(csv.includes(`ROI (payback period): ${payback[app.roiScore]} (score ${app.roiScore}) → ${payback[roi]} (score ${roi})`));
 assert(html.includes(`${payback[roi]} (score ${roi})`.replace('>','&gt;').replace('<','&lt;')));
});

test('Annual benefit changes stay in stored history but never reach the History panel or CSV',()=>{
 const app=data.apps[0],withBenefit=amount=>({...data,apps:data.apps.map(item=>item===app?{...item,annualBenefitCNY:amount,annualBenefitSource:'Inventory · Annual benefit (CNY/year) · row 2'}:item)});
 const after=withBenefit(654321);after.apps[0]={...after.apps[0],Description:after.apps[0].Description+' Updated.'};
 const recorded=recordImport(withBenefit(123456),after,{inventoryFile:'benefit.xlsx'});
 assert(recorded.importHistory.at(-1).changes.some(change=>change.field==='annualBenefitCNY'&&change.after==='654321'),'retained for audit');
 const {events,html,csv}=history(recorded,app);
 assert(events.some(event=>event.details?.some(change=>change.field==='Description')),'other changes are still shown');
 for(const text of [html,csv])assert.doesNotMatch(text,/annualBenefit|Annual benefit|123,?456|654,?321/i);
});

test('the Not classified landscape column tooltip is English',()=>{
 const model=buildModel(data),labels=['cap','process'].map(view=>columns(model,view,new Set()).find(column=>column.id==='unmapped')?.label).filter(Boolean);
 assert(labels.length);for(const label of labels)assert.doesNotMatch(english(label),CJK);
 // The heading is rendered by landscape.mjs, and its tooltip goes through english().
 for(const view of ['cap','process']){
  const column=columns(model,view,new Set()).find(c=>c.id==='unmapped');
  const title=landscapeHeaderCell(column,{label:'Not classified',escape:esc}).match(/class="category-head" title="([^"]*)"/)[1];
  assert.equal(title,esc(english(column.label)));assert.doesNotMatch(title,CJK);
 }
});

const legacyEvent={id:'legacy-import',at:'2026-09-01T00:00:00.000Z',kind:'import',source:'legacy.xlsx',taxonomySource:'',inventoryFile:'legacy.xlsx',taxonomyFile:'',appIds:ids,addedIds:[],changes:[],issues:[]};
const legacy=workspaceData({...data,importHistory:[legacyEvent]});

test('older events that list every application ID still render and keep their format',()=>{
 assert.deepEqual(legacy.importHistory,[legacyEvent]);
 assert.deepEqual(importEvents(legacy.importHistory)[0].appIds,ids);
 for(const id of [ids[0],ids.at(-1)])assert(applicationTimeline(legacy,id).some(event=>event.id==='legacy-import:'+id&&event.description==='Inventory included in import'));
});

test('repeated, changed and restored imports store compact events that resolve to the same applications',()=>{
 const first=recordImport(legacy,legacy,{inventoryFile:'same.xlsx',at:'2026-10-01T00:00:00.000Z'}),event=first.importHistory.at(-1);
 assert.deepEqual(event.appIds,[]);assert.equal(event.appIdsBase,'legacy-import');assert.deepEqual(event.removedIds,[]);
 assert(JSON.stringify(event).length*5<JSON.stringify(legacyEvent).length,'an unchanged inventory no longer repeats every ID');
 same(importEvents(first.importHistory).at(-1).appIds,ids);
 for(const id of [ids[0],ids.at(-1)])assert(applicationTimeline(first,id).some(item=>item.id===event.id+':'+id));

 const removed=ids[0],changed=workspaceData({...first,apps:[...first.apps.filter(app=>app.ID!==removed),{ID:'NEW-APP',Name:'New application',Division:'PS',Entity:'TEST','Business Capabilities':'',Processes:''}]});
 const second=recordImport(first,changed,{inventoryFile:'changed.xlsx',at:'2026-10-02T00:00:00.000Z'}),delta=second.importHistory.at(-1);
 assert.equal(delta.appIdsBase,event.id);assert.deepEqual(delta.removedIds,[removed]);assert.deepEqual(delta.addedIds,['NEW-APP']);
 const expected=[...ids.filter(id=>id!==removed),'NEW-APP'];same(importEvents(second.importHistory).at(-1).appIds,expected);
 assert(!applicationTimeline(second,removed).some(item=>item.id.startsWith(delta.id)),'a removed application is not listed in later imports');
 assert(applicationTimeline(second,'NEW-APP').some(item=>item.description==='Application first added to this workspace'));

 const restored=recordImport(second,first,{kind:'restore',at:'2026-10-03T00:00:00.000Z'}),back=restored.importHistory.at(-1);
 assert.equal(back.appIdsBase,delta.id);same(importEvents(restored.importHistory).at(-1).appIds,ids);

 const saved=workspaceData(restored),roundTrip=importWorkspace(exportWorkspace(restored));
 assert.deepEqual(roundTrip.importHistory,saved.importHistory,'the compact form survives export and import');
 assert.deepEqual(importEvents(roundTrip.importHistory).map(item=>[item.id,[...item.appIds].sort()]),importEvents(restored.importHistory).map(item=>[item.id,[...item.appIds].sort()]));
 assert.deepEqual(roundTrip.importHistory.map(item=>item.id),['legacy-import',event.id,delta.id,back.id],'no history is dropped');

 // Another workspace with its own history keeps both lineages resolvable after a JSON import.
 const otherLineage=recordImport(data,data,{inventoryFile:'other.xlsx',at:'2026-10-04T00:00:00.000Z'});
 assert.deepEqual(otherLineage.importHistory[0].appIds,ids,'the first event of a lineage lists every ID');
 const merged=recordImport(second,otherLineage,{inventoryFile:'other.json',at:'2026-10-05T00:00:00.000Z'}),resolved=new Map(importEvents(merged.importHistory).map(item=>[item.id,item.appIds]));
 assert.equal(resolved.size,second.importHistory.length+otherLineage.importHistory.length+1);
 same(resolved.get(delta.id),expected);same(resolved.get(otherLineage.importHistory[0].id),ids);same(resolved.get(merged.importHistory.at(-1).id),ids);
});

test('repeated imports grow the workspace slowly enough to stay far below the autosave limit',()=>{
 let workspace=legacy;const start=JSON.stringify(workspaceData(workspace)).length;
 for(let i=0;i<20;i++)workspace=recordImport(workspace,workspace,{inventoryFile:'same.xlsx',at:`2026-10-06T00:00:${String(i).padStart(2,'0')}.000Z`});
 const perImport=(JSON.stringify(workspaceData(workspace)).length-start)/20;
 assert(perImport<600,`each unchanged import adds ${perImport} bytes`);
 assert(start+1000*perImport<autosaveLimitBytes,'a thousand unchanged imports still fit the autosave limit');
 assert.equal(workspace.importHistory.length,21);
});

// Review 2026-10-16: compact events must survive a round trip through the 2026-10-15 edition.
const legacyClean=events=>events.map(({appIdsBase,removedIds,decisions,...rest})=>rest);
test('workspace format 6 is exported, 1–6 import, and the 2026-10-15 edition (max 5) rejects it instead of dropping fields',()=>{
 const doc=JSON.parse(exportWorkspace(data));assert.equal(doc.version,6);
 for(const version of [1,2,3,4,5,6])assert.doesNotThrow(()=>importWorkspace(JSON.stringify({...doc,version})));
 assert.throws(()=>importWorkspace(JSON.stringify({...doc,version:7})));
 assert(![1,2,3,4,5].includes(doc.version),'the 2026-10-15 importer only accepts versions 1–5');
});

test('compact events keep their applications when a copy stripped by an older edition comes back',()=>{
 const edited=app=>({...app,Description:app.Description+' (edited)'});
 let current=recordImport(data,data,{inventoryFile:'first.xlsx',at:'2026-10-16T01:00:00.000Z'});const first=current.importHistory.at(-1);
 assert.equal(first.appIdsBase,data.importHistory.at(-1).id,'public/data.json starts with its taxonomy event, so the first import is already compact');
 current=recordImport(current,{...current,apps:current.apps.map((app,i)=>i===0?edited(app):app)},{inventoryFile:'second.xlsx',at:'2026-10-16T02:00:00.000Z'});
 const compact=current.importHistory.at(-1);assert(compact.appIdsBase,'second event is compact');
 const stripped={...current,importHistory:legacyClean(current.importHistory)};
 const merged=recordImport(current,stripped,{inventoryFile:'third.xlsx',at:'2026-10-16T03:00:00.000Z'});
 const resolved=new Map(importEvents(merged.importHistory).map(e=>[e.id,e.appIds]));
 same(resolved.get(compact.id),ids);same(resolved.get(first.id),ids);same(resolved.get(merged.importHistory.at(-1).id),ids);
 assert(history(merged,data.apps[0]).csv.includes('(edited)'),'field changes stay visible');
 const orphan=importEvents(legacyClean(current.importHistory).slice(1)).find(e=>e.id===compact.id);
 assert.deepEqual(orphan.appIds,[data.apps[0].ID.trim()],'without its base, a compact event still covers the applications it changed');
});

// public/data.json starts with the 2026-10-16 taxonomy event, so the first-import case needs a workspace without history.
const noHistory=workspaceData({...data,importHistory:[],applicationEvents:[]});
const decision={appId:data.apps[0].ID.trim(),field:'Processes',before:'raw;Manufacturing',after:'raw',note:"Owner decision applied: removed 'Manufacturing' from test processes"};
const ownerImport=base=>recordImport(base,{...base,apps:base.apps.map((app,i)=>i===0?{...app,Description:app.Description+' (owner test)'}:app)},{inventoryFile:'raw.xlsx',at:'2026-10-16T04:00:00.000Z',decisions:[decision]});
test('an owner decision on a full import event comes back when the intact copy is re-imported after an older edition stripped it',()=>{
 assert.deepEqual(noHistory.importHistory,[]);
 const recorded=ownerImport(noHistory);
 const full=recorded.importHistory.at(-1);assert(full.appIds.length&&!full.appIdsBase,'first import in a workspace is a full event');
 const stripped={...recorded,importHistory:legacyClean(recorded.importHistory)};assert.equal(stripped.importHistory.at(-1).decisions,undefined);
 const repaired=recordImport(stripped,importWorkspace(exportWorkspace(recorded)),{inventoryFile:'reimport.json',at:'2026-10-16T05:00:00.000Z'});
 assert.deepEqual(repaired.importHistory.find(e=>e.id===full.id).decisions,[decision]);
});

test('an owner decision on a compact import event after the taxonomy event in public/data.json comes back with its applications',()=>{
 const recorded=ownerImport(data),compact=recorded.importHistory.at(-1);
 assert.equal(compact.appIdsBase,data.importHistory.at(-1).id,'an import into the shipped workspace is compact on its taxonomy event');assert.deepEqual(compact.appIds,[]);
 const stripped={...recorded,importHistory:legacyClean(recorded.importHistory)},lost=stripped.importHistory.at(-1);
 assert.equal(lost.decisions,undefined);assert.equal(lost.appIdsBase,undefined);
 const repaired=recordImport(stripped,importWorkspace(exportWorkspace(recorded)),{inventoryFile:'reimport.json',at:'2026-10-16T05:00:00.000Z'}),back=repaired.importHistory.find(e=>e.id===compact.id);
 assert.deepEqual(back.decisions,[decision]);assert.equal(back.appIdsBase,compact.appIdsBase);assert.deepEqual(back.removedIds,[]);
 same(importEvents(repaired.importHistory).find(e=>e.id===compact.id).appIds,ids);
 assert(history(repaired,data.apps[0]).events.some(event=>event.kind==='decision'&&event.description===decision.note),'the decision is shown in History again');
});

test('History shows Division and Entity changes under the UI names Business unit and Plant',()=>{
 const app=data.apps[0];
 const incoming={...data,apps:data.apps.map(item=>item===app?{...item,Division:item.Division+' (moved)',Entity:'Plant renamed in test'}:item)};
 const {html,csv}=history(recordImport(data,incoming,{inventoryFile:'org.xlsx'}),app);
 for(const text of [html,csv]){assert(text.includes('Business unit'));assert(text.includes('Plant'));assert.doesNotMatch(text,/\bDivision\b|\bEntity\b/);}
 assert(csv.includes('Plant: '+app.Entity+' → Plant renamed in test'));
});

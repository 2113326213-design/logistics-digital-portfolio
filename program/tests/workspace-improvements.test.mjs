import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {workspaceAPI} from '../worker/index.mjs';
import {reviewItems,reviewCSV,reviewAuditCSV,reviewAuditEvents,cleanReviewHistory,cleanReviews,reviewItemResolved,reviewResolution} from '../public/reviews.mjs';
import {workspaceData,mergeBundledCorrections,exportWorkspace,importWorkspace,acceptanceSample} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createAutosave,readView,writeView} from '../public/autosave.mjs';
import {explainResult,quickDifference} from '../public/explanations.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {previewImport} from '../public/import-review.mjs';
import {applicationTimeline,applicationTimelineCSV,recordImport,cleanApplicationEvents} from '../public/application-history.mjs';
import {excelDate} from '../public/xlsx.mjs';
const initial=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)))),model=buildModel(initial),items=reviewItems(model);
const oldWorkspace=structuredClone(initial),manufacturing=oldWorkspace.apps.find(a=>a.ID==='a103918e-63a2-4b26-ae5b-a5b1b7af8fd1');
manufacturing.Processes+=';Manufacturing';
const migrated=mergeBundledCorrections(oldWorkspace,initial);
assert.equal(migrated.changed,true);
assert.equal(migrated.data.apps.find(a=>a.ID===manufacturing.ID).Processes,initial.apps.find(a=>a.ID===manufacturing.ID).Processes);
assert.equal(oldWorkspace.apps.find(a=>a.ID===manufacturing.ID).Processes.endsWith(';Manufacturing'),true,'source workspace is not mutated');
const rack=initial.apps.find(a=>a.Name==='AUTO-RACK');
assert.equal(rack['Lifecycle: Active'],'2020-12-21','source lifecycle date is distinct from creation');
assert.equal(initial.apps.filter(a=>a['Lifecycle: Active']).length,76);
assert.equal(excelDate('25569'),'1970-01-01');
assert.equal(excelDate('2020-12-21'),'2020-12-21');
const manual=cleanApplicationEvents([{id:'manual-1',appId:rack.ID,kind:'created',happenedAt:'2019-01-01T00:00:00.000Z',recordedAt:'2026-09-24T06:00:00.000Z',recorder:'Plant owner',details:'Initial project release confirmed by owner'}]);
const incoming={...initial,apps:initial.apps.map(a=>a.ID===rack.ID?{...a,Processes:a.Processes+';Unclassified new process'}:a)};
// The bundled workspace already records two taxonomy events: the 2026-10-16 capability-standard switch and the 2026-10-19
// removal of the HC entries (another department's capabilities), which flags VMCN_CONNEX's two HC records as missing codes
// again. Since 2026-10-21 a third event records the inventory import of the 2026-10-20 LeanIX export (38 field changes in
// 35 applications, one owner decision, no application added or removed). Later imports append after them.
assert.equal(initial.importHistory.length,3);
assert.deepEqual(initial.importHistory.map(e=>[e.kind,e.taxonomyFile,e.at.slice(0,10)]),[['taxonomy','standard+name.xlsx','2026-10-16'],['taxonomy','standard+name.xlsx','2026-10-19'],['import','','2026-10-21']]);
const connex=initial.apps.find(a=>a.Name==='VMCN_CONNEX');
assert.deepEqual(initial.importHistory[1].issues.map(i=>[i.appId,i.kind,i.category,i.record]),[[connex.ID,'flagged','能力编码缺失','HC.06.01.01 Demand Planning'],[connex.ID,'flagged','能力编码缺失','HC.06.01.05 Detailed Production Scheduling']]);
assert.deepEqual([initial.importHistory[1].addedIds,initial.importHistory[1].removedIds,initial.importHistory[1].changes],[[],[],[]],'removing HC entries adds, removes and changes no application');
// 2026-10-21 import event (re-derived from the current data): the export replaced VMCN_CONNEX's HC records by B.06.2.3/B.06.2.6
// and filled its empty Processes, dropped B.06.4.4 from VMCN_Digital Dynamic Supermarket and brought RBCW Auto Warehouse
// Management System an L3 record the catalogue cannot confirm; these five issues explain the review counts below.
const inventoryImport=initial.importHistory[2],rbcwAuto=initial.apps.find(a=>a.Name==='RBCW Auto Warehouse Management System'),supermarket=initial.apps.find(a=>a.Name==='VMCN_Digital Dynamic Supermarket');
assert.deepEqual([inventoryImport.inventoryFile,inventoryImport.changes.length,inventoryImport.decisions.length,inventoryImport.addedIds,inventoryImport.removedIds],['20261020_083736_UKj4Y_inventory.xlsx',38,1,[],[]]);
assert.deepEqual(inventoryImport.issues.map(i=>[i.appId,i.kind,i.category,i.record]),[[rbcwAuto.ID,'flagged','流程匹配','BBM PM I2D Transport Material Intra Plant L3'],[connex.ID,'cleared','未填写流程','未填写'],[connex.ID,'cleared','能力编码缺失','HC.06.01.01 Demand Planning'],[connex.ID,'cleared','能力编码缺失','HC.06.01.05 Detailed Production Scheduling'],[supermarket.ID,'cleared','能力编码缺失','B.06.4.4 Physical Inventory Management']]);
assert.equal(initial.inventoryExport.missingIds.length,5,'five applications missing from the export are kept unchanged');
const imported=recordImport({...initial,applicationEvents:manual},incoming,{at:'2026-09-24T06:10:00.000Z',inventoryFile:'new-inventory.xlsx'});
assert.equal(imported.importHistory.length,4);
assert.deepEqual(imported.importHistory.slice(0,3),initial.importHistory,'the earlier taxonomy and import events are kept unchanged');
assert(imported.importHistory.at(-1).issues.some(i=>i.appId===rack.ID&&i.kind==='flagged'));
assert(applicationTimeline(imported,rack.ID).some(e=>e.kind==='import'&&e.inventoryFile==='new-inventory.xlsx'));
assert(applicationTimeline(imported,rack.ID).some(e=>e.kind==='created'&&e.actor==='Plant owner'));
assert.match(applicationTimelineCSV(rack,applicationTimeline(imported,rack.ID),initial.source),/new-inventory\.xlsx/);
assert.deepEqual(importWorkspace(exportWorkspace(imported)),workspaceData(imported));
const broughtBack=recordImport(imported,initial,{at:'2026-09-24T06:20:00.000Z',kind:'restore'});
assert(applicationTimeline(broughtBack,rack.ID).some(e=>e.kind==='cleared'));
assert.equal(broughtBack.importHistory.length,5);assert.equal(broughtBack.importHistory.at(-1).kind,'restore');
const categoryCounts=list=>Object.fromEntries([...new Set(list.map(i=>i.category))].map(c=>[c,list.filter(i=>i.category===c).length]));
const resolutionCounts=(list,history)=>Object.fromEntries(['action','mapped','outside','beyond'].map(status=>[status,list.filter(i=>reviewResolution(i,history)===status).length]));
// Legacy catalogue (before 2026-10-16) against the current applications: seven semantic review groups and eight missing codes
// (incl. B.06.9, B.06.9.1). Re-derived 2026-10-21 after the inventory import: VMCN_CONNEX's HC.06.1.1 and HC.06.1.5 are gone
// (-2), B.06.5.7 (VMCN_iWPC_AKL_Szh5, VM-CN Auto labeling printing system) is not in this catalogue (+1), VMCN_CONNEX's empty
// process is filled (-1) and RBCW Auto Warehouse Management System's new L3 record is unmatched (+1): 41 - 2 + 1 - 1 + 1 = 40.
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url))),legacy=workspaceData({...initial,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource,importHistory:[],applicationEvents:[]}),legacyModel=buildModel(legacy),legacyItems=reviewItems(legacyModel);
assert.equal(legacyItems.length,40);
assert(legacyItems.every(i=>i.raw.trim()),'original evidence includes zero-padded capability codes');
assert.deepEqual(categoryCounts(legacyItems),{'流程匹配':23,'流程层级表':2,'能力编码缺失':8,'能力匹配':7});
assert.deepEqual(legacyItems.filter(i=>i.category==='能力编码缺失').map(i=>i.code).sort(),['B.01.1.2','B.05.2','B.05.3.7','B.06.5.7','B.06.9','B.06.9.1','B.14.9.1','HC.02.4.5']);
assert.equal(legacyItems.filter(i=>i.semantic).length,7);
const legacySourceItems=reviewItems(buildModel({...legacy,corrections:[]})),legacyMappingHistory=correctionStates(legacy);
// L3V is Level 3 (owner decision 2026-10-19, "level 3v就是level3"). Without the mappings, each of the six mapped L3V
// records already matches its unique L3 name, so it is no source record (52 - 6 = 46) and only the six other mappings
// resolve one (12 - 6 = 6). The seven unmatched L3V records need action like any unmatched L3: nothing is beyond L3
// (action 28 + 7 = 35, beyond 7 - 7 = 0); the 40 open records are unchanged. Outside B.06 are the five missing codes
// B.01.1.2, B.05.2, B.05.3.7, B.14.9.1 and HC.02.4.5 (the two HC.06 codes left with the 2026-10-21 import).
assert.equal(legacySourceItems.length,46);assert.equal(legacySourceItems.filter(i=>reviewItemResolved(i,legacyMappingHistory)).length,6);assert.equal(legacySourceItems.filter(i=>!reviewItemResolved(i,legacyMappingHistory)).length,40);
assert.deepEqual(resolutionCounts(legacySourceItems,legacyMappingHistory),{action:35,mapped:6,outside:5,beyond:0});
for(const item of legacyItems)for(let i=0;i<item.appIds.length;i++)assert.equal(legacyModel.apps.find(a=>a.id===item.appIds[i]).Name,item.apps[i]);
// Business capability standard without its HC entries (another department, owner decision 2026-10-19): no semantic groups;
// missing codes 8 - 3 now catalogued (B.06.9, B.06.9.1, B.06.5.7) = 5; items 40 - 7 - 3 = 30. Re-derived 2026-10-21: the
// inventory import removed the B.06.4.4 record and VMCN_CONNEX's HC records (its B.06.2.3/B.06.2.6 are catalogued), so no
// missing code is left under B.06 or HC.06 and no application is without a process.
assert.equal(items.length,30);
assert(items.every(i=>i.raw.trim()),'original evidence includes zero-padded capability codes');
assert.deepEqual(categoryCounts(items),{'流程匹配':23,'流程层级表':2,'能力编码缺失':5});
assert.deepEqual(items.filter(i=>i.category==='能力编码缺失').map(i=>i.code).sort(),['B.01.1.2','B.05.2','B.05.3.7','B.14.9.1','HC.02.4.5']);
assert.deepEqual(items.filter(i=>i.category==='能力编码缺失'&&i.code.startsWith('HC.')).map(i=>[i.code,i.raw,i.apps]).sort((a,b)=>a[0].localeCompare(b[0])),[['HC.02.4.5','HC.02.04.05 Transportation Management',['Wuj HK AGV (recovered 2025-06-26 03:31:37)']]],'the application keeps its own HC record as evidence');
assert(!items.some(i=>i.appIds.includes(connex.ID)),'VMCN_CONNEX needs no review since the 2026-10-21 import');
assert(items.some(i=>i.category==='流程匹配'&&i.appIds.includes(rbcwAuto.ID)&&i.raw==='BBM PM I2D Transport Material Intra Plant L3'),'the unconfirmed L3 record from the import is open for review');
const unmappedModel=buildModel({...initial,corrections:[]}),sourceItems=reviewItems(unmappedModel),mappingHistory=correctionStates(initial);
// Each missing code outside B.06 (incl. HC.02.4.5) resolves as Outside B.06 (5); none needs action. L3V as Level 3, as for
// the legacy catalogue: 42 - 6 = 36 source records, 6 resolved by mappings, action 18 + 7 = 25, nothing beyond L3.
assert.equal(sourceItems.length,36);assert.equal(sourceItems.filter(i=>reviewItemResolved(i,mappingHistory)).length,6);assert.equal(sourceItems.filter(i=>!reviewItemResolved(i,mappingHistory)).length,30);
assert.deepEqual(resolutionCounts(sourceItems,mappingHistory),{action:25,mapped:6,outside:5,beyond:0});
// The seven L3V records without a standard L3 of the same name are unmatched Level 3 records that need action.
assert.deepEqual(sourceItems.filter(i=>/\bL3V\s*$/i.test(i.raw)).map(i=>[i.apps.join(', '),i.raw,i.reason,reviewResolution(i,mappingHistory)]).sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1])),[
 ['AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V','流程未匹配层级表','action'],
 ['RBCD LOM Scrap Management Platform','BBM PM B2P Manage Fixed Assets Scrapping L3V','流程未匹配层级表','action'],
 ['RBCD LOM Scrap Management Platform','BBM PM I2P Disposal due to Scrapping L3V','流程未匹配层级表','action'],
 ['Szh5_ASRS_WCS_WMS','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V','流程未匹配层级表','action'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Move Material Production to Production L3V','流程未匹配层级表','action'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Return from Production L3V','流程未匹配层级表','action'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Round quantity in material request and picking L3V','流程未匹配层级表','action']]);
// The six applied L3V mappings agree with the unique L3 name: without them each record already counts as its mapped code.
const l3vMappings=mappingHistory.filter(c=>c.state==='Applied'&&/\bL3V\s*$/i.test(c.raw));
assert.equal(l3vMappings.length,6);
for(const c of l3vMappings){
 assert(unmappedModel.apps.find(a=>a.id===c.appId).process.includes(c.targetId),c.raw+' matches '+c.targetId+' by name');
 assert(!unmappedModel.issues.some(i=>i.appId===c.appId&&i.value===c.raw),c.raw+' needs no review without its mapping');
 assert(model.apps.find(a=>a.id===c.appId).process.includes(c.targetId),c.raw+' still counts as '+c.targetId+' with its mapping');
}
assert.deepEqual(sourceItems.filter(i=>i.code?.startsWith('HC.')).map(i=>[i.code,reviewResolution(i,mappingHistory)]).sort((a,b)=>a[0].localeCompare(b[0])),[['HC.02.4.5','outside']]);
for(const item of items)for(let i=0;i<item.appIds.length;i++)assert.equal(model.apps.find(a=>a.id===item.appIds[i]).Name,item.apps[i]);
const notes=cleanReviews({[items[0].key]:{status:'已确认',result:'经业务确认，保留该流程变体',reviewer:'验收人员',updatedAt:'2026-09-15T03:00:00.000Z'}});
const event={id:'note-1',action:'note',at:'2026-09-15T03:00:00.000Z',reviewer:'验收人员',issueKey:items[0].key,appIds:items[0].appIds,appNames:items[0].apps,raw:items[0].raw,status:'已确认',previousStatus:'待核对',result:'经业务确认，保留该流程变体',previousResult:''};
const reviewed={...initial,reviews:notes,reviewHistory:cleanReviewHistory([event])};
assert.deepEqual(importWorkspace(exportWorkspace(reviewed)),reviewed);
assert.equal(importWorkspace(JSON.stringify({format:'logistics-portfolio-workspace',version:1,data:initial})).apps.length,76);
assert.deepEqual(importWorkspace(JSON.stringify({format:'logistics-portfolio-workspace',version:2,data:{...initial,reviewHistory:undefined}})).reviewHistory,[]);
const activity=reviewAuditEvents(reviewed,items);
assert(activity.some(e=>e.action==='note'&&e.result===event.result&&e.reviewer===event.reviewer));
assert(activity.some(e=>e.action==='mapping'&&e.targetId==='M.I2D.010.050.010'));
assert.match(reviewAuditCSV(activity),/Previous result/);
const reversed=reviewAuditEvents({...reviewed,reviewHistory:[...reviewed.reviewHistory,{...event,id:'revoke-1',action:'revoke',mappingId:reviewed.corrections[0].id,reason:'Wrong process',at:'2026-09-16T03:00:00.000Z'}]},items);
assert(reversed.some(e=>e.action==='revoke'&&e.reason==='Wrong process'));
assert.equal(previewImport(reviewed,reviewed).activityRemoved,0);
assert.equal(previewImport(reviewed,reviewed).hasChanges,false,'reimporting unchanged data must not add another application event');
assert.equal(previewImport(initial,incoming).hasChanges,true,'a changed inventory remains importable');
assert(previewImport(reviewed,initial).activityRemoved>0,'older imports must warn before removing audit records');
const preserved=reviewAuditEvents({...reviewed,reviews:cleanReviews({[items[0].key]:{...notes[items[0].key],result:'New decision'}}),reviewHistory:[{...event,id:'old-snapshot',action:'snapshot',result:event.result},{...event,id:'second-note',result:'New decision',previousResult:event.result}]},items);
assert(preserved.some(e=>e.id==='old-snapshot'&&e.action==='snapshot'));
assert.equal(cleanReviews({x:{status:'已确认',result:'',reviewer:''}}).x.status,'待核对');
assert.deepEqual(reviewed.apps,initial.apps);
assert.match(reviewCSV(items,notes,initial.source,initial.taxonomySource),/经业务确认/);
assert.match(reviewCSV(items,{[items[0].key]:{result:'=HYPERLINK("x")'}},'', ''),/"'=HYPERLINK/);
const changed=structuredClone(initial);changed.apps.find(a=>a.ID===items[0].appIds[0]).Processes=changed.apps.find(a=>a.ID===items[0].appIds[0]).Processes.replace(items[0].raw,items[0].raw+' changed');
assert(!reviewItems(buildModel(changed)).some(i=>i.key===items[0].key),'changed source must not inherit an old confirmation');
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const view={group:'Entity',view:'process',expanded:['M.I2D'],comparison:{search:'AR',relation:'other'}};
assert(writeView(storage,view));assert.deepEqual(readView(storage),view);assert.equal(writeView({setItem(){throw Error('quota');}},view),false);
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_portfolio_workspaces.sql',import.meta.url),'utf8'));
const env={DB:{prepare:sql=>({bind:(...values)=>({first:async()=>sqlite.prepare(sql).get(...values)||null})})}};
const request=(method,user,input,origin='https://portfolio.test')=>new Request('https://portfolio.test/api/workspace',{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(method==='PUT'?{'Content-Type':'application/json',Origin:origin}:{})},...(input?{body:JSON.stringify(input)}:{})});
assert.equal((await workspaceAPI(request('GET'),env)).status,401);
assert.equal((await workspaceAPI(request('PUT','one',{revision:0,data:reviewed},'https://elsewhere.test'),env)).status,403);
assert.equal((await workspaceAPI(request('GET','one'),{})).status,503);
let response=await workspaceAPI(request('PUT','one',{revision:0,data:reviewed}),env);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
assert.deepEqual((await (await workspaceAPI(request('GET','one'),env)).json()).data,JSON.parse(JSON.stringify(reviewed)));
assert.equal((await (await workspaceAPI(request('GET','two'),env)).json()).data,null);
assert.equal((await workspaceAPI(request('PUT','one',{revision:0,data:initial}),env)).status,409);
assert.equal((await workspaceAPI(request('PUT','one',{revision:1,data:{apps:[]}}),env)).status,400);
assert.equal((await workspaceAPI(request('PUT','one',{revision:1,data:acceptanceSample(initial)}),env)).status,400);
assert.equal((await (await workspaceAPI(request('GET','one'),env)).json()).revision,1);
const huge={...initial,source:'x'.repeat(1500000)};assert.equal((await workspaceAPI(request('PUT','one',{revision:1,data:huge}),env)).status,413);
let current=initial,status,fail=false;
const adapter=async(url,options={})=>{if(fail&&options.method==='PUT')throw Error('offline');return workspaceAPI(request(options.method||'GET','client',options.body?JSON.parse(options.body):undefined),env);};
const client=createAutosave({getData:()=>current,onRestore:data=>{current=data;},onStatus:s=>{status=s;},request:adapter});
assert(await client.load());current=reviewed;client.schedule();await client.flush();assert.equal(status.kind,'saved');
let restored;const reopened=createAutosave({getData:()=>restored,onRestore:data=>{restored=data;},onStatus:()=>{},request:adapter});assert(await reopened.load());assert.deepEqual(restored,reviewed);
fail=true;current={...current,source:'updated.xlsx'};client.schedule();await client.flush();assert.equal(status.kind,'error');fail=false;await client.retry();assert.equal(status.kind,'saved');
const snapshot=(await (await workspaceAPI(request('GET','client'),env)).json()).data;assert.equal(snapshot.source,'updated.xlsx');
const sample=acceptanceSample(initial),index=createSimilarity(buildModel(sample),'cap'),a=index.compare(sample.apps[0].ID,sample.apps[1].ID),b=index.compare(sample.apps[1].ID,sample.apps[0].ID),difference=quickDifference(a,b);
assert.equal(a.coverage,.5);assert.deepEqual(difference.common.map(n=>n.id),['B.06.1.2']);assert.deepEqual(difference.targetOnly.map(n=>n.id),['B.06.1.3']);assert.deepEqual(difference.peerOnly.map(n=>n.id),['B.06.1.4']);assert.match(explainResult(a),/1 shared codes/);
const mixed=structuredClone(sample);mixed.apps[1]['Business Capabilities']='B.06.1 Supply Chain Strategy';const shallow=createSimilarity(buildModel(mixed),'cap').compare(mixed.apps[0].ID,mixed.apps[1].ID);assert.equal(shallow.coverage,1);assert.deepEqual(shallow.comparisonLevels,[2]);assert.deepEqual(shallow.deferredLevels,[3]);
sqlite.close();
console.log('PASS: 36 source review records (HC missing code outside B.06; L3V as Level 3, unmatched L3V needing action) (46 with the legacy catalogue, including seven semantic review groups), workspace migration, both taxonomy events and the 2026-10-21 inventory import kept in import history, review activity round trip and CSV, legacy workspaces, SQLite persistence, user isolation, revision conflicts, save recovery, preferences and comparison evidence.');

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createAutosave} from '../public/autosave.mjs';
import {workspaceData,exportWorkspace,importWorkspace,acceptanceSample,mergeBundledCorrections} from '../public/workspace.mjs';
import {buildModel,columns} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createCorrection,verifyCorrection,correctionStates,revokeCorrection} from '../public/corrections.mjs';
import {filterLandscape} from '../public/landscape.mjs';
import {reviewItems,reviewResolution} from '../public/reviews.mjs';
import {dataChecksForApp} from '../public/data-checks.mjs';
import {previewImport} from '../public/import-review.mjs';
import {similarityCSV} from '../public/exports.mjs';
import {workspaceAPI} from '../worker/index.mjs';
const initial=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const saveReply=revision=>reply({revision,updatedAt:'2026-09-16T12:00:00Z'});
function setup(request){let data=structuredClone(initial),lastStatus,restores=0,recoveries=0;const client=createAutosave({request,getData:()=>data,onRestore:d=>{data=d;restores++;},onStatus:s=>{lastStatus=s;},onRecovery:()=>{recoveries++;},requestTimeoutMs:100});return {client,get data(){return data;},set data(d){data=d;},get status(){return lastStatus;},get restores(){return restores;},get recoveries(){return recoveries;}};}

test('failed initial GET retries and restores remote; no PUT without local edits',async()=>{
 let gets=0,puts=0;const remote={...initial,source:'saved.xlsx'};
 const s=setup(async(_,o)=>{if(o.method==='PUT'){puts++;return saveReply(9);}if(++gets===1)throw Error('offline');return reply({data:remote,revision:8});});
 assert.equal(await s.client.load(),false);await s.client.retry();assert.equal(gets,2);assert.equal(s.restores,1);assert.equal(s.data.source,'saved.xlsx');assert.equal(puts,0);assert.equal(s.status.kind,'saved');
});
test('local edits before retry survive an empty server and use fetched revision',async()=>{
 let gets=0,payload;const s=setup(async(_,o)=>{if(o.method==='PUT'){payload=JSON.parse(o.body);return saveReply(5);}if(++gets===1)throw Error('offline');return reply({data:null,revision:4});});
 await s.client.load();s.data={...s.data,source:'local.xlsx'};s.client.schedule();await s.client.retry();assert.equal(s.restores,0);assert.equal(payload.revision,4);assert.equal(payload.data.source,'local.xlsx');assert(!s.client.hasUnsaved());
});
test('edits while GET is pending require an explicit recovery choice; keep local is revision safe',async()=>{
 const get=deferred();let put;const s=setup(async(_,o)=>o.method==='PUT'?(put=JSON.parse(o.body),saveReply(7)):get.promise);
 const loading=s.client.load();s.data={...s.data,source:'local.xlsx'};s.client.schedule();get.resolve(reply({data:{...initial,source:'remote.xlsx'},revision:6}));await loading;
 assert.equal(s.data.source,'local.xlsx');assert.equal(s.restores,0);assert.equal(s.recoveries,1);assert.equal(put,undefined);assert(s.client.hasUnsaved());
 await s.client.resolveRecovery('local');assert.equal(put.revision,6);assert.equal(put.data.source,'local.xlsx');assert(!s.client.hasUnsaved());
});
test('explicit saved choice restores remote; a GET timeout ignores late completion',async()=>{
 const get=deferred();const s=setup(()=>get.promise);await s.client.load();assert.equal(s.status.kind,'error');get.resolve(reply({data:{...initial,source:'late.xlsx'},revision:1}));await Promise.resolve();assert.equal(s.restores,0);
 let gets=0;const other=setup(async()=>{if(++gets===1)throw Error('offline');return reply({data:{...initial,source:'remote.xlsx'},revision:3});});await other.client.load();other.data={...initial,source:'local.xlsx'};other.client.schedule();await other.client.retry();await other.client.resolveRecovery('saved');assert.equal(other.data.source,'remote.xlsx');assert(!other.client.hasUnsaved());
});
test('edits during PUT are saved afterward; conflict retry fetches and never overwrites automatically',async()=>{
 const firstPut=deferred(),writes=[];let gets=0;const s=setup(async(_,o)=>{if(o.method==='PUT'){writes.push(JSON.parse(o.body));return writes.length===1?firstPut.promise:saveReply(3);}gets++;return reply({data:null,revision:1});});
 await s.client.load();s.data={...s.data,source:'first.xlsx'};s.client.schedule();const saving=s.client.flush();s.data={...s.data,source:'second.xlsx'};s.client.schedule();firstPut.resolve(saveReply(2));await saving;assert.equal(writes.length,2);assert.equal(writes[1].revision,2);assert.equal(writes[1].data.source,'second.xlsx');assert(!s.client.hasUnsaved());
 let puts=0;const conflict=setup(async(_,o)=>{if(o.method==='PUT'){puts++;return reply({error:'Conflict'},409);}return reply({data:{...initial,source:puts?'other-tab.xlsx':'original.xlsx'},revision:puts?9:8});});await conflict.client.load();conflict.data={...conflict.data,source:'local.xlsx'};conflict.client.schedule();await conflict.client.flush();await conflict.client.retry();assert.equal(puts,1);assert.equal(conflict.recoveries,1);assert.equal(conflict.data.source,'local.xlsx');
});

// L3V is Level 3 (owner decision 2026-10-19). This real L3V record has no same-named standard L3, so it stays
// unmatched under that rule and still needs an explicit mapping; a same-named L3V record would match by itself.
const l3vRaw='BBM PM I2D Return from Production L3V';
const fixture=()=>workspaceData({source:'inventory.xlsx',taxonomySource:'taxonomy.xlsx',capabilityRows:[['B.06 Logistics','B.06.1 Strategy','B.06.1.1 Planning']],processRows:[['I2D','L0','M.I2D','I2D'],['I2D','L1','M.I2D.010','Warehousing'],['I2D','L2','M.I2D.010.010','Storage'],['I2D','L3','M.I2D.010.010.010','Receive']],apps:[{ID:'a',Name:'Application A',Division:'PS',Entity:'P1','Business Capabilities':'B.06.1.1 Planning',Processes:l3vRaw},{ID:'b',Name:'Application B',Division:'PS',Entity:'P2','Business Capabilities':'B.06.1.1 Planning',Processes:'BBM PM I2D Receive L3'},{ID:'c',Name:'Application C',Division:'EM',Entity:'P1','Business Capabilities':'B.06.1.1 Planning',Processes:l3vRaw}]});
function mapping(data){const item=reviewItems(buildModel({...data,corrections:[]})).find(i=>i.category==='流程匹配'&&i.appIds.includes('a')&&i.raw===l3vRaw);return createCorrection(data,{appId:'a',dimension:'process',raw:l3vRaw,targetId:'M.I2D.010.010.010',reviewer:'Reviewer',reason:'Business confirmed the standard process',reviewKey:item.key});}
test('explicit mapping affects only the chosen source, updates similarity, retains raw data/history and can be revoked',()=>{
 const data=fixture(),before=buildModel(data),original=JSON.stringify(data.apps),c=mapping(data),next={...data,corrections:[c]},after=buildModel(next);
 assert.equal(createSimilarity(before,'process').compare('a','b').coverage,null);assert.equal(createSimilarity(after,'process').compare('a','b').coverage,1);
 // Before the mapping the L3V record is an ordinary unmatched Level 3 record: no variant hold, actionable in review.
 assert.deepEqual(before.issues.filter(i=>i.appId==='a').map(i=>[i.type,i.value]),[['流程未匹配层级表',l3vRaw]]);assert(!before.issues.some(i=>/L3V/.test(i.type)),'no L3V variant issue type');
 // V19.1 union (owner 2026-10-23, "也按并集"): the L3V record has a level, so it is in LeanIX and is not pending in the
 // similarity check (until V19 it was pending as '流程未匹配层级表'). It has no Signavio code either, so a has no process
 // record to compare: the direction still has no score until the mapping gives the record its code.
 assert.deepEqual(createSimilarity(before,'process').scopes.get('a').pending,[]);
 const unmapped=createSimilarity(before,'process').compare('a','b');assert.deepEqual([unmapped.status,unmapped.reason,unmapped.coverage],['needs-review','目标没有可比较的登记。',null]);
 assert.deepEqual(createSimilarity(after,'process').scopes.get('a').pending,[]);assert.equal(createSimilarity(after,'process').compare('a','b').status,'comparable');
 // A mapping still resolves a pending record: the same record without a level ('Process level not specified') is pending
 // until the owner maps it, then the direction is scored like the L3V record above.
 const noLevel='BBM PM I2D Return from Production',unlevelled=fixture();unlevelled.apps[0].Processes=noLevel;
 const noLevelItem=reviewItems(buildModel(unlevelled)).find(i=>i.category==='流程匹配'&&i.appIds.includes('a')&&i.raw===noLevel);
 const noLevelMapping=createCorrection(unlevelled,{appId:'a',dimension:'process',raw:noLevel,targetId:'M.I2D.010.010.010',reviewer:'Reviewer',reason:'Business confirmed the standard process',reviewKey:noLevelItem.key});
 const pendingBefore=createSimilarity(buildModel(unlevelled),'process'),pendingAfter=createSimilarity(buildModel({...unlevelled,corrections:[noLevelMapping]}),'process');
 assert.deepEqual(pendingBefore.scopes.get('a').pending.map(p=>[p.value,p.reason]),[[noLevel,'流程未标注标准层级']]);
 assert.deepEqual([pendingBefore.compare('a','b').status,pendingBefore.compare('a','b').reason],['needs-review','目标应用仍有未确认的分类。']);
 assert.deepEqual(pendingAfter.scopes.get('a').pending,[]);assert.deepEqual([pendingAfter.compare('a','b').status,pendingAfter.compare('a','b').coverage],['comparable',1]);
 const item=reviewItems(before).find(i=>i.key===c.reviewKey);assert.equal(reviewResolution(item,[]),'action');assert.equal(reviewResolution(item,correctionStates(next)),'mapped');
 // V19.1 union (owner 2026-10-23): the L3V record is in LeanIX (it has a level), so it matches and is no data check before the
 // mapping either (until V19 it was a 'No confirmed standard match' check); it is listed in inLeanix until the mapping gives it its code.
 assert(!dataChecksForApp(before,before.apps[0]).checks.some(r=>r.raw===l3vRaw),'the LeanIX record is not a data check');
 assert.deepEqual(before.apps[0].inLeanix.map(x=>[x.raw,x.level]),[[l3vRaw,3]]);assert.deepEqual(after.apps[0].inLeanix,[]);
 const afterChecks=dataChecksForApp(after,after.apps[0]);assert(!afterChecks.checks.some(r=>r.raw===l3vRaw),'the mapped record is no longer a data check');assert.deepEqual(afterChecks.mappings.map(m=>[m.raw,m.targetId]),[[l3vRaw,'M.I2D.010.010.010']]);
 assert.equal(after.issues.filter(i=>i.appId==='a').length,0);assert.equal(after.issues.filter(i=>i.appId==='c').length,1);assert.equal(JSON.stringify(next.apps),original);
 assert(reviewItems(buildModel({...next,corrections:[]})).some(i=>i.key===c.reviewKey),'raw checklist key remains accessible');
 const revoked=revokeCorrection(next,c.id);assert.equal(correctionStates(revoked)[0].state,'Revoked');assert.equal(createSimilarity(buildModel(revoked),'process').compare('a','b').coverage,null);
 assert.deepEqual(importWorkspace(exportWorkspace(next)),next);assert.deepEqual(acceptanceSample(initial).corrections,[]);
});
test('reviewed bundled mappings migrate only into unchanged saved workspaces',()=>{
 const saved=fixture(),correction=mapping(saved),bundled={...saved,corrections:[correction]};
 const migrated=mergeBundledCorrections(saved,bundled);assert(migrated.changed);assert.equal(correctionStates(migrated.data)[0].state,'Applied');
 const again=mergeBundledCorrections(migrated.data,bundled);assert(!again.changed);assert.equal(again.data.corrections.length,1);
 const changed=structuredClone(saved);changed.apps[0].Description='Source changed';const skipped=mergeBundledCorrections(changed,bundled);assert(!skipped.changed);assert.equal(skipped.data.corrections.length,0);
 const revoked={...saved,corrections:[{...correction,revokedAt:'2026-09-23T00:00:00Z'}]};const respected=mergeBundledCorrections(revoked,bundled);assert(!respected.changed);assert.equal(respected.data.corrections.length,1);
});
test('changed source, renamed/removed/ambiguous targets invalidate mappings; duplicate mappings cannot silently win',()=>{
 const data=fixture(),c=mapping(data),next={...data,corrections:[c]};
 for(const mutate of [d=>{d.apps[0].Processes+=' changed';},d=>{d.apps[0].Name='Changed app';},d=>{d.processRows.at(-1)[3]='Renamed';},d=>{d.processRows.pop();},d=>{d.processRows.push(['I2D','L3','M.I2D.010.010.010','Different']);},d=>{d.processRows.splice(2,1);}]){const changed=structuredClone(next);mutate(changed);assert.equal(correctionStates(changed)[0].state,'Needs review');assert(!buildModel(changed).apps[0].process.includes(c.targetId));}
 assert.throws(()=>mapping(next),/Revoke/);const duplicates={...data,corrections:[c,{...c,id:'duplicate'}]};assert(correctionStates(duplicates).every(c=>c.state==='Needs review'));
 const unchanged={...next,source:'renamed-file.xlsx'};assert.equal(correctionStates(unchanged)[0].state,'Applied','filename alone is not the evidence');
});
test('missing capability code and empty process are explicit reversible source mappings',()=>{
 const data=fixture();data.apps[0]['Business Capabilities']='B.06.9.9 Unlisted';data.apps[0].Processes='';
 const cap=createCorrection(data,{appId:'a',dimension:'cap',raw:'B.06.9.9 Unlisted',targetId:'B.06.1.1',reviewer:'R',reason:'Confirmed'}),process=createCorrection(data,{appId:'a',dimension:'process',raw:'',targetId:'M.I2D.010.010.010',reviewer:'R',reason:'Confirmed'});
 const after=buildModel({...data,corrections:[cap,process]});assert.deepEqual(after.apps[0].capLeaf,['B.06.1.1']);assert.deepEqual(after.apps[0].processLeaf,['M.I2D.010.010.010']);assert.equal(after.apps[0].Processes,'');
 assert.throws(()=>createCorrection(data,{appId:'a',dimension:'cap',raw:'B.06.9.9 Unlisted',targetId:'B.06.99',reviewer:'R',reason:'Confirmed'}),/unique code/);
});
test('landscape filters intersect; branch columns use visible membership and global indexes stay unchanged',()=>{
 const model=buildModel(fixture()),index=createSimilarity(model,'cap'),subset=filterLandscape(model,'cap',{query:'b.06.1.1',division:'PS',entity:'P1',branch:'B.06.1'}),cols=columns(subset,'cap',new Set(['B.06.1']),'B.06.1');
 assert.deepEqual(subset.apps.map(a=>a.id),['a']);assert.deepEqual(cols.flatMap(c=>c.apps.map(a=>a.id)),['a']);assert.equal(index.scopes.size,3);assert.equal(index.compare('a','b').coverage,1);
 assert.equal(filterLandscape(model,'cap',{query:'no-such-app'}).apps.length,0);assert.equal(filterLandscape(model,'cap',{}).apps.length,3);
 assert.equal(filterLandscape(model,'process',{query:'M.I2D.010.010.010'}).apps.length,1,'unmatched L3V records do not appear as confirmed codes');
});
test('L3V is Level 3: a unique standard name matches exactly like L3; otherwise the ordinary L3 issue applies',()=>{
 const data=fixture();data.apps[0].Processes='BBM PM I2D Receive L3V';const model=buildModel(data),a=model.apps[0];
 assert.deepEqual(a.process,['M.I2D.010.010.010']);assert.deepEqual(a.processLeaf,['M.I2D.010.010.010']);assert.equal(model.procs.get('M.I2D.010.010.010').level,3);assert.deepEqual(model.issues.filter(i=>i.appId==='a'),[]);
 assert(!reviewItems(model).some(i=>i.appIds.includes('a')),'a matched L3V record needs no review or mapping');
 const index=createSimilarity(model,'process'),pair=index.compare('a','b');assert.deepEqual(index.scopes.get('a').known.map(n=>[n.id,n.level]),[['M.I2D.010.010.010',3]]);assert.deepEqual(index.scopes.get('a').pending,[]);assert.equal(pair.status,'comparable');assert.equal(pair.coverage,1);
 assert.deepEqual(filterLandscape(model,'process',{query:'M.I2D.010.010.010'}).apps.map(x=>x.id),['a','b']);
 const issue=(processes,rows)=>{const d=fixture();d.apps[0].Processes=processes;d.processRows.push(...rows);const found=buildModel(d).issues.filter(i=>i.appId==='a');return found.map(i=>({type:i.type,value:i.value,candidates:i.candidates.map(n=>n.id)}));};
 for(const [name,rows,type,candidates] of [['I2D Return from Production',[],'流程未匹配层级表',[]],['O2C Receive',[],'流程链编号存在差异',['M.I2D.010.010.010']],['I2D Receive',[['I2D','L3','M.I2D.010.010.020','Receive']],'流程名称对应多个编号',['M.I2D.010.010.010','M.I2D.010.010.020']]])
  for(const suffix of ['L3V','L3']){const raw=`BBM PM ${name} ${suffix}`;assert.deepEqual(issue(raw,rows),[{type,value:raw,candidates}],raw);}
});
test('import preview validates before replacing and reports source changes and stale corrections',()=>{
 const data=fixture(),next={...data,corrections:[mapping(data)]},incoming=structuredClone(next);incoming.apps=incoming.apps.filter(a=>a.ID!=='c');incoming.apps[0].Name='Updated A';incoming.apps.push({...incoming.apps[1],ID:'d',Name:'Added D'});incoming.processRows.at(-1)[3]='Updated reference';const snapshot=JSON.stringify(next),preview=previewImport(next,incoming);
 assert.deepEqual(preview.added.map(a=>a.ID),['d']);assert.deepEqual(preview.removed.map(a=>a.ID),['c']);assert.deepEqual(preview.updated.map(a=>a.ID),['a']);assert.equal(preview.unchanged,1);assert.equal(preview.staleMappings,1);assert(preview.taxonomyChanged);assert.equal(JSON.stringify(next),snapshot);
 assert.throws(()=>previewImport(next,{...incoming,apps:[incoming.apps[0],incoming.apps[0]]}),/ID/);assert.equal(JSON.stringify(next),snapshot);
});
test('export carries scope, GB, source files and exact code evidence without CSV injection',()=>{
 const data=fixture();data.apps[0].Name=' =formula';const index=createSimilarity(buildModel(data),'cap'),csv=similarityCSV([index.compare('a','b')],'cap',data);
 for(const text of ['B.06 codes at shared comparison depth','Target GB','inventory.xlsx','taxonomy.xlsx','B.06.1.1','100.0000'])assert(csv.includes(text));assert(csv.includes('"\' =formula"'));
});
test('mapping and audit survive authenticated API persistence',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_portfolio_workspaces.sql',import.meta.url),'utf8'));
 try{const env={DB:{prepare:sql=>({bind:(...values)=>({first:async()=>sqlite.prepare(sql).get(...values)||null})})}},data=fixture();data.corrections=[mapping(data)];
 const request=(method,body)=>new Request('https://portfolio.test/api/workspace',{method,headers:{'oai-authenticated-user-id':'mapping-user',Origin:'https://portfolio.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await workspaceAPI(request('PUT',{revision:0,data}),env)).status,200);const saved=await (await workspaceAPI(request('GET'),env)).json();assert.deepEqual(saved.data.corrections,data.corrections);assert.equal(createSimilarity(buildModel(saved.data),'process').compare('a','b').coverage,1);
 }finally{sqlite.close();}
});

test('mapping apply rejects a stale preview and accepts IDs normalized by the model',()=>{
 const data=fixture();data.apps[0].ID=' a ';const draft=mapping(data);assert.equal(draft.appId,'a');assert.equal(correctionStates({...data,corrections:[draft]})[0].state,'Applied');const changed=structuredClone(data);changed.processRows.at(-1)[3]='Changed meaning';assert.throws(()=>verifyCorrection(changed,draft),/Preview this mapping again/);assert.equal(verifyCorrection(data,draft).targetId,draft.targetId);
});

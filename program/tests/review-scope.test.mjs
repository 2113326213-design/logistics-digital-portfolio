import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {reviewItems,reviewResolution,scopeReviewItems,scopeReviewMappings,scopeReviewAuditEvents,reviewAuditEvents,reviewAuditCSV,reviewCSV} from '../public/reviews.mjs';
import {correctionStates,createCorrection,revokeCorrection} from '../public/corrections.mjs';
import {semanticConcerns} from '../public/semantic-review.mjs';
import {viewForDatasetRestore,readView,writeView} from '../public/autosave.mjs';
import {maintenanceReport} from '../public/overview.mjs';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
// Workspace as it was before the 2026-10-16 switch to the business capability standard (no import history).
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const {importHistory,applicationEvents,...previous}=data,legacy={...previous,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource};

test('seven semantic groups remain actionable until each source has a verified mapping',()=>{
 const source=buildModel({...legacy,corrections:[]}),groups=reviewItems(source).filter(i=>i.semantic);
 // 2026-10-21: re-derived after the 2026-10-20 export — the B.06.4 group now also holds BMLP_Nexeed_IAS@WxP and VMCN_Digital Dynamic Supermarket and no longer Material Requistion Digitalization (22 → 23 source applications).
 assert.equal(groups.length,7);assert.equal(groups.reduce((n,i)=>n+i.appIds.length,0),23);
 assert(groups.every(i=>reviewResolution(i,correctionStates(legacy))==='action'));
 const group=groups.find(i=>i.code==='B.06.4'),appId=group.appIds[0];
 const mapping=createCorrection(legacy,{appId,dimension:'cap',raw:group.raw,targetId:group.code,reviewKey:group.key,reviewer:'Business owner',reason:'Same business scope verified against the standard definition'});
 const next={...legacy,corrections:[...legacy.corrections,mapping]},model=buildModel(next);
 assert.equal(semanticConcerns(model.apps.find(a=>a.id===appId),model.correctionLog,model.caps).filter(c=>c.code===group.code).length,0);
 assert.equal(reviewResolution(group,model.correctionLog),'action','one mapping must not approve the other applications in a shared group');
 const scoped=scopeReviewItems([group],{appIds:[appId],dimension:'cap'},source)[0];
 assert.equal(reviewResolution(scoped,model.correctionLog),'mapped');
 const restored=buildModel(revokeCorrection(next,mapping.id));
 assert(semanticConcerns(restored.apps.find(a=>a.id===appId),restored.correctionLog,restored.caps).some(c=>c.code===group.code));
 assert.equal(reviewResolution(scoped,restored.correctionLog),'action');
 assert.equal(reviewItems(buildModel({...next,corrections:[]})).find(i=>i.code===group.code&&i.semantic).key,group.key);
 const current=buildModel({...data,corrections:[]});
 assert.deepEqual(reviewItems(current).filter(i=>i.semantic),[],'the business capability standard uses these source names');
 assert(groups.every(i=>i.appIds.every(id=>current.apps.find(a=>a.id===id).rawCap.includes(i.raw))),'original records are preserved');
});

test('with the business capability standard no unconfirmed B.06 capability code remains',()=>{
 const items=reviewItems(buildModel({...data,corrections:[]})),history=correctionStates(data);
 const missing=items.filter(i=>i.category==='能力编码缺失'&&/^B\.06(?:\.|$)/.test(i.code));
 // 2026-10-21: the 2026-10-20 export registers VMCN_Digital Dynamic Supermarket under B.06.4 Inventory Management instead of B.06.4.4, so no B.06 code is unconfirmed any more (was [['B.06.4.4',...,'action']]).
 assert.deepEqual(missing.map(i=>[i.code,i.apps,i.raw,reviewResolution(i,history)]),[]);
 const legacyMissing=reviewItems(buildModel({...legacy,corrections:[]})).filter(i=>i.category==='能力编码缺失'&&/^B\.06(?:\.|$)/.test(i.code));
 // 2026-10-21: B.06.5.7 Intralogistics Infrastructure came with the export (VM-CN Auto labeling printing system, VMCN_iWPC_AKL_Szh5); the 2026-10-15 rows do not list that code.
 assert.deepEqual(legacyMissing.map(i=>[i.code,i.appIds.length]),[['B.06.9',4],['B.06.9.1',3],['B.06.5.7',2]]);
});

test('RBHP review projects shared capability issues onto selected applications and export audit',()=>{
 const model=buildModel(legacy),items=reviewItems(model),before=JSON.stringify(items);
 const apps=maintenanceReport(model,{entity:'RBHP'},'cap').pending;
 assert.equal(apps.length,1);
 const scope={appIds:apps.map(a=>a.id),dimension:'cap'},rows=scopeReviewItems(items,scope,model);
 assert.equal(rows.length,2);
 assert(rows.every(i=>i.appIds.length===1&&i.apps[0]==='RBHP_LOG SupplierManager'));
 const row=rows.find(i=>i.code==='B.06.9'),original=items.find(i=>i.key===row.key);
 assert.equal(original.appIds.length,4);
 assert.equal(row.sharedApplicationCount,4);
 assert.equal(row.key,original.key,'existing notes must retain their audit identity');
 const outside=original.appIds.find(id=>!scope.appIds.includes(id));
 const mappings=[{reviewKey:row.key,appId:scope.appIds[0],dimension:'cap',state:'Applied',raw:row.raw,targetId:'B.06.1',reason:'in scope'},
 {reviewKey:row.key,appId:outside,dimension:'cap',state:'Applied',raw:'OUTSIDE RAW',targetId:'B.06.2'},
 {appId:scope.appIds[0],dimension:'process'}];
 assert.deepEqual(scopeReviewMappings(mappings,scope),[mappings[0]]);
 const csv=reviewCSV(rows,{},legacy.source,legacy.taxonomySource,mappings);
 assert(!csv.includes(outside));assert(!csv.includes('OUTSIDE RAW'));assert(!csv.includes('ShzP_Karis'));
 assert.equal(scopeReviewItems(items,null,model),items,'clearing scope restores the complete checklist');
 assert.deepEqual(scopeReviewItems(items,{appIds:[],dimension:'cap'},model),[]);
 assert.equal(JSON.stringify(items),before,'scoped display must not mutate the source checklist');
 const current=buildModel(data),rbhp=maintenanceReport(current,{entity:'RBHP'},'cap');
 assert.deepEqual(rbhp.pending,[],'B.06.9 and B.06.9.1 are part of the business capability standard');
 assert.deepEqual(scopeReviewItems(reviewItems(current),{appIds:rbhp.apps.map(a=>a.id),dimension:'cap'},current),[]);
});

test('Process scope and source text remain limited to selected applications',()=>{
 const model=buildModel(data),apps=maintenanceReport(model,{entity:'RBCD'},'process').pending;
 const rows=scopeReviewItems(reviewItems(model),{appIds:apps.map(a=>a.id),dimension:'process'},model);
 // L3V is Level 3 (owner decision 2026-10-19): the unmatched L3V records of AUTO-RACK and RBCD LOM Scrap Management Platform
 // are pending process records that need review like any unmatched L3 record (3 earlier rows + 3 L3V rows).
 assert.deepEqual(apps.map(a=>a.Name).sort(),['AUTO-RACK','RBCD LOG Xone','RBCD LOM Scrap Management Platform','RBCD WI management system']);
 assert.equal(rows.length,6);assert(rows.every(i=>i.appIds.every(id=>apps.some(a=>a.id===id))));
 const history=correctionStates(data),l3v=rows.filter(i=>/\sL3V$/.test(i.raw));
 assert.deepEqual(l3v.map(i=>[i.category,i.apps.join(),i.raw,i.reason,reviewResolution(i,history)]).sort(),[
  ['流程匹配','AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V','流程未匹配层级表','action'],
  ['流程匹配','RBCD LOM Scrap Management Platform','BBM PM B2P Manage Fixed Assets Scrapping L3V','流程未匹配层级表','action'],
  ['流程匹配','RBCD LOM Scrap Management Platform','BBM PM I2P Disposal due to Scrapping L3V','流程未匹配层级表','action']]);
 assert(rows.every(i=>reviewResolution(i,history)==='action'),'no process row is set aside as beyond L3');
 // The mapping flow resolves an unmatched L3V row like any other process row.
 const row=l3v.find(i=>i.apps[0]==='AUTO-RACK'),mapping=createCorrection(data,{appId:row.appIds[0],dimension:'process',raw:row.raw,targetId:'M.I2D.010.050.020',reviewKey:row.key,reviewer:'Business owner',reason:'Same putaway step verified against the standard process'});
 const next={...data,corrections:[...data.corrections,mapping]},mapped=buildModel(next);
 assert.equal(reviewResolution(row,correctionStates(next)),'mapped');
 assert(mapped.apps.find(a=>a.id===row.appIds[0]).process.includes('M.I2D.010.050.020'));
 assert.deepEqual(maintenanceReport(mapped,{entity:'RBCD'},'process').pending.map(a=>a.Name).sort(),['RBCD LOG Xone','RBCD LOM Scrap Management Platform','RBCD WI management system']);
 assert.equal(data.apps.find(a=>String(a.ID)===row.appIds[0]).Processes.includes(row.raw),true,'the mapping keeps the source record');
 const items=[{key:'shared',category:'能力编码缺失',appIds:['a','b'],apps:['A','B'],code:'B.06.9',raw:'all source records'}];
 const scoped=scopeReviewItems(items,{appIds:['a'],dimension:'cap'},{apps:[{id:'a',rawCap:['B.06.9 Plant A wording']},{id:'b',rawCap:['B.06.9 Plant B wording']}]});
 assert.equal(scoped[0].raw,'B.06.9 Plant A wording');
});

test('Overview review scope counts every visible source-record row, including outside B.06',()=>{
 const model=buildModel(legacy),source=buildModel({...legacy,corrections:[]});
 const pending=maintenanceReport(model,{entity:'RBMC'},'cap').pending;
 const scope={appIds:pending.map(a=>a.id),dimension:'cap'};
 const rows=scopeReviewItems(reviewItems(source),scope,source),history=correctionStates(legacy);
 assert.equal(pending.length,1,'Overview counts applications');
 assert.equal(rows.length,3,'the review button must count source-record rows');
 assert.equal(rows.filter(item=>reviewResolution(item,history)==='action').length,2);
 assert.equal(rows.filter(item=>reviewResolution(item,history)==='outside').length,1);
 const current=buildModel({...data,corrections:[]}),now=maintenanceReport(buildModel(data),{entity:'RBMC'},'cap').pending;
 const currentRows=scopeReviewItems(reviewItems(current),{appIds:now.map(a=>a.id),dimension:'cap'},current);
 assert.deepEqual(now.map(a=>a.Name),['CngP/MSE-Nbo Supplier SCM'],'the outside-B.06 record still needs review');
 assert.deepEqual(currentRows.map(item=>[item.code,item.raw,reviewResolution(item,correctionStates(data))]),[['B.05.3.7','B.05.3.7 Supplier Collaboration Management','outside']]);
});

test('Activity export contains the same plant and dimension events shown on screen',()=>{
 const model=buildModel(data),items=reviewItems(buildModel({...data,corrections:[]}));
 const events=reviewAuditEvents(data,items),scope={appIds:maintenanceReport(model,{entity:'RBHP'},'process').apps.map(a=>a.id),dimension:'process'};
 const scoped=scopeReviewAuditEvents(events,scope,correctionStates(data),items),csv=reviewAuditCSV(scoped);
 // 2026-10-21: the import carried 5 owner mappings over (revoked and re-created, no reviewHistory note), so 17 mapping + 5 revoke events; the RBHP process scope now holds both AGV Performance Tracking System mappings twice plus their two revokes next to the SupplierManager mapping (3 → 7).
 assert.equal(events.length,22);assert.equal(scoped.length,7);
 assert.equal(csv.split('\r\n').length,scoped.length+1);
 assert.doesNotMatch(csv,/AUTO-RACK/);
 assert.equal(scopeReviewAuditEvents(events,null,correctionStates(data),items).length,events.length);
 const capabilityNote={issueKey:'cap-only',appIds:[scope.appIds[0]]};
 assert.deepEqual(scopeReviewAuditEvents([capabilityNote],scope,[],[{key:'cap-only',category:'能力匹配'}]),[]);
});

test('Saved imported-plant preferences survive initial bundled data and a load retry',()=>{
 const saved={active:'overview',overview:{division:'PS',entity:'TEST_NEW_PLANT',dimension:'process'},comparison:{selected:['imported-app']}};
 const rendered={...saved,overview:{...saved.overview,entity:''},comparison:{selected:[]}};
 const storage=new Map(),adapter={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 writeView(adapter,viewForDatasetRestore(saved,rendered,structuredClone(rendered)));
 assert.deepEqual(readView(adapter),saved,'clicking retry without a view change must not overwrite original preferences');
 const restored=viewForDatasetRestore(readView(adapter),rendered,structuredClone(rendered));
 const imported={...data,apps:[{...data.apps.find(a=>a.Division==='PS'),ID:'imported-app',Entity:'TEST_NEW_PLANT'}]};
 assert.equal(maintenanceReport(buildModel(imported),restored.overview,'process').apps.length,1);
 assert.deepEqual(restored.comparison.selected,['imported-app']);
 const changed={...rendered,active:'landscape'};
 assert.equal(viewForDatasetRestore(saved,rendered,changed),changed,'navigation while data loads must take precedence');
 assert.equal(viewForDatasetRestore(null,rendered,changed),changed);
});

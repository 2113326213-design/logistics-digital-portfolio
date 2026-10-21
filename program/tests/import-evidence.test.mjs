import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {mergeInventoryEvidence,previewImport} from '../public/import-review.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {costSummary} from '../public/costs.mjs';
import {opportunityEligibility} from '../public/scope.mjs';
import {recordImport,applicationTimeline} from '../public/application-history.mjs';
const data=workspaceData(JSON.parse(readFileSync(RECORDS_V916)));
const columns=['ID','Name','Division','Entity','Description','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active'];
const sheets={'Logistic Apps':[columns,...data.apps.map(app=>columns.map(key=>app[key]))]};

test('Excel missing optional evidence preserves known costs and source scope by ID',()=>{
 const parsed=inventoryFromSheets(sheets);
 assert(parsed.every(app=>!Object.hasOwn(app,'operationCostScore')&&!Object.hasOwn(app,'scopeNote')&&!Object.hasOwn(app,'Main Business Capability')));
 const apps=mergeInventoryEvidence(data.apps,parsed.reverse());
 assert.deepEqual(costSummary(apps),costSummary(data.apps));
 assert.equal(apps.filter(app=>!opportunityEligibility(app).eligible).length,5);
 assert(apps.every(app=>app['Main Business Capability']));
 for(const app of apps){const original=data.apps.find(a=>a.ID===app.ID);assert.equal(app.operationCostSource,original.operationCostSource);assert.equal(app.scopeSource,original.scopeSource);}
 const incoming={...data,apps};
 assert.equal(previewImport(data,incoming).costScoresRemoved,0);
 assert.equal(previewImport(data,incoming).scopeExclusionsRemoved,0);
});

test('explicit blank values replace evidence and are counted in import preview; new IDs inherit nothing',()=>{
 const scored=data.apps.find(a=>a.operationCostScore===1),excluded=data.apps.find(a=>!opportunityEligibility(a).eligible);
 const apps=mergeInventoryEvidence(data.apps,[{...scored,operationCostScore:null,operationCostSource:'New score sheet',scopeNote:''},{...excluded,scopeNote:'',scopeSource:'New source C column','Main Business Capability':''},{ID:'NEW',Name:'New app',Division:'PS',Entity:'Test','Business Capabilities':'',Processes:''}]);
 assert.equal(apps[0].operationCostScore,null);assert.equal(apps[1].scopeNote,'');assert.equal(apps[1]['Main Business Capability'],'');assert.equal(apps[2].operationCostScore,undefined);assert.equal(apps[2].scopeNote,undefined);
 const preview=previewImport(data,{...data,apps});
 assert.equal(preview.costScoresRemoved,1);assert.equal(preview.scopeExclusionsRemoved,1);
 const history=recordImport(data,{...data,apps},{inventoryFile:'replacement.xlsx'});
 assert(applicationTimeline(history,excluded.ID).some(e=>e.details?.some(c=>c.field==='scopeNote')));
 assert(applicationTimeline(history,excluded.ID).some(e=>e.details?.some(c=>c.field==='Main Business Capability')));
 const blankCosts=inventoryFromSheets({...sheets,'Parameter Score':[['LeanIX ID','App operation cost']]});
 assert(blankCosts.every(app=>Object.hasOwn(app,'operationCostScore')&&app.operationCostScore===null));
 assert.equal(costSummary(mergeInventoryEvidence(data.apps,blankCosts)).scored,0);
});


test('import history detects edits after 6,000 characters and marks shortened evidence',()=>{
 const before=structuredClone(data),after=structuredClone(data);
 before.apps[0].Description='x'.repeat(6100)+' before';
 after.apps[0].Description='x'.repeat(6100)+' after';
 const recorded=recordImport(before,after,{inventoryFile:'long-description.xlsx'});
 const change=recorded.importHistory.at(-1).changes.find(item=>item.appId===before.apps[0].ID&&item.field==='Description');
 assert(change,'a change beyond the stored preview must still create a history record');
 assert.equal(change.truncated,true);
 assert.equal(change.before.length,850);assert.equal(change.after.length,850);
 assert.equal(recorded.apps[0].Description,after.apps[0].Description,'full current description is preserved');
});

test('legacy owner-review submissions are dropped while genuine source audit records survive',()=>{
 const note={id:'original-history',appId:data.apps[0].ID,kind:'updated',happenedAt:'2026-10-14T01:00:00Z',recordedAt:'2026-10-14T01:00:00Z',recorder:'Recorded user',details:'Original inventory change'};
 const normalized=workspaceData({...data,applicationEvents:[note],reviewSubmissions:{old:{purpose:'Legacy owner review'}}});
 assert.equal(Object.hasOwn(normalized,'reviewSubmissions'),false);
 assert.deepEqual(normalized.applicationEvents,[note]);
 assert.deepEqual(normalized.corrections,data.corrections);
});

// 2026-11-12 export compatibility: zero-padded capability segments have the same meaning.
// Synthetic records keep this regression independent of changes to the bundled inventory.
import test from 'node:test';
import assert from 'node:assert/strict';
import {capCode} from '../public/codes.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';

const fixture=raw=>workspaceData({
 source:'synthetic-capability-format.xlsx',
 capabilityRows:[['B.06 Logistics','B.06.5 Warehousing','B.06.5.2 Inventory Movement']],
 processRows:[],
 apps:[{ID:'format-test',Name:'Format test',Entity:'Test plant',Division:'Test unit','Business Capabilities':raw,Processes:''}]
});

test('two-digit capability segments resolve to the existing standard code',()=>{
 assert.equal(capCode('B.06.05.02 Inventory Movement'),'B.06.5.2');
 const model=buildModel(fixture('B.06.05.02 Inventory Movement')),app=model.apps[0];
 assert.deepEqual(app.cap,['B.06.5.2']);
 assert.equal(model.caps.get(app.cap[0]).reference,'B.06.5.2 Inventory Movement');
 assert.deepEqual(app.rawCap,['B.06.05.02 Inventory Movement'],'the original source spelling is retained');
});

test('padding capability codes preserves matching and level-completion results',()=>{
 const report=raw=>maintenanceReport(buildModel(fixture(raw)),{},'cap');
 const old=report('B.06.5.2 Inventory Movement'),padded=report('B.06.05.02 Inventory Movement');
 assert.deepEqual(padded.records.get('format-test').map(r=>[r.level,r.valid]),[[3,true]]);
 const levels=r=>r.levels.map(l=>({level:l.level,filled:l.filled.map(a=>a.id),valid:l.valid.map(a=>a.id)}));
 assert.deepEqual(levels(padded),levels(old),'padding must not create a new code or missing level');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {labelDifferenceRows} from '../public/label-differences.mjs';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
// Catalogue in use until 2026-10-16: its outdated names keep the scope and application identity covered.
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const {importHistory,applicationEvents,...previous}=data;
const model=buildModel(data),legacy=buildModel({...previous,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});
test('source label differences identify the exact application and respect the supplied scope',()=>{
 const rows=labelDifferenceRows(legacy),order=rows.find(r=>r.code==='B.06.2.10'&&r.sourceName==='Customer Order Planning');
 assert(order);assert.equal(order.appName,'RBCD LOG Xone');assert.equal(order.standardName,'Order Planning Simulation');
 const app=legacy.apps.find(a=>a.id===order.appId);
 assert(labelDifferenceRows(legacy,[app]).every(row=>row.appId===app.id));
 assert.deepEqual(labelDifferenceRows(legacy,[]),[]);
 assert.deepEqual(labelDifferenceRows(model,[model.apps.find(a=>a.id===app.id)]),[],'Customer Order Planning is the standard name');
});
test('with the business capability standard only the two B.06.8 records of one application differ',()=>{
 const rows=labelDifferenceRows(model);
 assert.deepEqual(rows.map(r=>[r.plant,r.appName,r.code,r.sourceName,r.standardName,r.semanticStatus]),[
  ['ME-CN','360° Supplier dashboard','B.06.8.1','Supply Chain (Logistics) Standard Reporting Mgmt.','Supply Chain (Logistics) Standard Reporting',null],
  ['ME-CN','360° Supplier dashboard','B.06.8.2','Supply Chain (Logistics) Visualization and Tracking Mgmt.','Supply Chain (Logistics) Monitoring and Dashboarding',null]
 ]);
 const app=model.apps.find(a=>a.id===rows[0].appId);
 assert.deepEqual(labelDifferenceRows(model,[app]),rows);
 assert.deepEqual(labelDifferenceRows(model,model.apps.filter(a=>a.id!==app.id)),[]);
});

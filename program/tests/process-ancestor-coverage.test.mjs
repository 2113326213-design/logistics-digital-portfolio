import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processAncestorCoverage,reviewIssues} from '../public/review-issues.mjs';
const setup=()=>{const data=workspaceData(JSON.parse(readFileSync(RECORDS_V916)));const model=buildModel(data),report=maintenanceReport(model,{},'process'),app=model.apps.find(a=>a.Name==='CGQB_Logistic_system');return {data,model,report,app};};
// Fixed rule 2026-10-23 (V18.1): the covered levels count as filled and matching; before, they matched but were not filled.
test('a matching L3 makes the unrecorded L0–L2 full without changing source data',()=>{
 const {data,model,report,app}=setup(),before=JSON.stringify(data);
 assert.deepEqual(report.issues.get(app.id),[]);
 for(const level of [0,1,2]){const row=report.levels.find(r=>r.level===level);assert(row.filled.includes(app));assert(!row.direct.includes(app));assert(row.valid.includes(app));assert(processAncestorCoverage(model,report,app,level).length);}
 // 2026-10-21 (V9.16 import of 20261020_083736_UKj4Y_inventory.xlsx): re-derived from current data.json — VMCN_CONNEX gained a confirmed L3 (+1 valid at L0-L3, +1 filled at L3) and left To review (24 → 23); RBCW Auto Warehouse Management System swapped its L2 for three L3 records (+1 filled at L3, still unconfirmed).
 assert.equal(report.needsReview.length,23);
 // V18.1: filled now includes the covered levels (direct registrations unchanged: 47, 54, 47, 68).
 assert.deepEqual(report.levels.map(r=>[r.filled.length,r.valid.length]),[[74,74],[72,72],[68,68],[68,56]]);
 assert.deepEqual(report.levels.map(r=>r.direct.length),[47,54,47,68]);
 assert.equal(JSON.stringify(data),before);
});
test('unconfirmed L3, absent ancestor and invalid directly registered ancestor stay reviewable',()=>{
 for(const level of [0,1]){
  const {model,report,app}=setup();
  const evidence=processAncestorCoverage(model,report,app,level);assert(evidence.length);
  model.procs.delete(evidence[0].parent);
  assert.deepEqual(processAncestorCoverage(model,report,app,level),[]);
  assert(reviewIssues(model,report,app).some(i=>i.level===level&&i.kind==='catalogue'));
 }
 for(const level of [0,1]){
  const {model,report,app}=setup();report.records.get(app.id).push({raw:'bad ancestor',level,valid:false});
  assert.deepEqual(processAncestorCoverage(model,report,app,level),[]);
  assert(reviewIssues(model,report,app).some(i=>i.level===level&&i.kind==='match'));
 }
 const {model,report,app}=setup();report.records.get(app.id)[0].valid=false;
 for(const level of [0,1])assert(reviewIssues(model,report,app).some(i=>i.level===level&&i.kind==='missing'));
});

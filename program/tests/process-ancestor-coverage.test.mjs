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
 // V19.1 union (owner 2026-10-23): a process recorded with a level is in LeanIX and matches. To review 23 → 11: 10
 // applications whose only process issues were records with a level outside the Signavio list (or levels those records now
 // fill), RBAC_ME_Szh5 whose only issue was "Process name differs between sources" (no longer an issue), and VM-CN_WACOS_Szh5
 // with both (tests/v92.test.mjs names the Level 2 ones).
 assert.equal(report.needsReview.length,11);
 // V18.1: filled now includes the covered levels (direct registrations unchanged: 47, 54, 47, 68).
 // V19.1 union: Level 3 valid 56 → 68, the 12 applications with Level 3 records outside the Signavio list (every direct
 // Level 3 registration now matches); those records also fill the levels above: L0 and L1 +2 (RBCD WI management system,
 // RBCW E-Queue system), L2 +3 (also RBCD LOM Scrap Management Platform).
 assert.deepEqual(report.levels.map(r=>[r.filled.length,r.valid.length]),[[76,76],[74,74],[71,71],[68,68]]);
 assert.deepEqual(report.levels.map(r=>r.direct.length),[47,54,47,68]);
 const union=a=>(a.inLeanix||[]).some(x=>report.records.get(a.id).some(r=>r.level===3&&r.raw===x.raw));
 assert.equal(model.apps.filter(union).length,12,'applications with a Level 3 record in LeanIX but not in the Signavio list');
 assert(model.apps.filter(union).every(a=>report.levels.find(r=>r.level===3).valid.includes(a)));
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

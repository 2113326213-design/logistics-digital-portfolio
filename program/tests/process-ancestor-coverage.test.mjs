import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processAncestorCoverage,reviewIssues} from '../public/review-issues.mjs';
const setup=()=>{const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));const model=buildModel(data),report=maintenanceReport(model,{},'process'),app=model.apps.find(a=>a.Name==='CGQB_Logistic_system');return {data,model,report,app};};
test('V9.5: confirmed L3 covers missing L0/L1 without filling or changing source data',()=>{
 const {data,model,report,app}=setup(),before=JSON.stringify(data);
 assert.deepEqual(report.issues.get(app.id),[]);
 for(const level of [0,1,2]){const row=report.levels.find(r=>r.level===level);assert(!row.filled.includes(app));assert(row.valid.includes(app));assert(processAncestorCoverage(model,report,app,level).length);}
 assert.equal(report.needsReview.length,24);
 assert.deepEqual(report.levels.map(r=>[r.filled.length,r.valid.length]),[[47,67],[54,68],[47,67],[66,55]]);
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

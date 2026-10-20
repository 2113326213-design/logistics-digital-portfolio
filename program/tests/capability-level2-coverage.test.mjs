import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {maintenanceReport,applicationsNotPassingLevelQuality,maintenanceGapReasons} from '../public/overview.mjs';
import {capabilityIssues} from '../public/process-issues.mjs';
import {createCorrection,revokeCorrection} from '../public/corrections.mjs';
import {capabilityLevel2Coverage} from '../public/review-issues.mjs';

const app=(ID,cap,extra={})=>({ID,Name:`App ${ID}`,Entity:'Plant A',Division:'PS','Main Business Capability':'B.06 Logistics','Business Capabilities':cap,Processes:'BBM PM T Detail L3',...extra});
const fixture=apps=>({
 taxonomySource:'Business Capability Standard (capabilities); Process standard',
 capabilityRows:[['B.06 Logistics','B.06.1 Branch','B.06.1.1 Detail','B.06.1.2 Second'],['B.06 Logistics','B.06.2 Other branch','B.06.2.1 Other detail']],
 processRows:[['Test','L0','M.T','Test'],['Test','L1','M.T.010','Stage'],['Test','L2','M.T.010.010','Step'],['Test','L3','M.T.010.010.010','Detail']],
 apps
});
const reportFor=data=>{const model=buildModel(data);return {model,report:maintenanceReport(model,{},'cap')};};
const ids=apps=>apps.map(a=>a.id);
const l2=report=>report.levels.find(l=>l.level===2);
const missingL2=(report,id)=>report.issues.get(id).some(i=>i.level===2&&i.kind==='missing');

test('confirmed L3 satisfies L2 review and quality without creating a registration or changing the source',()=>{
 const data=fixture([app('leaf','B.06.1.1 Detail')]),before=JSON.stringify(data),{model,report}=reportFor(data),level=l2(report);
 assert.deepEqual(ids(level.filled),[]);
 assert.deepEqual(ids(level.missing),['leaf'],'missing keeps the literal source-registration meaning');
 assert.deepEqual(ids(level.directValid),[]);
 assert.deepEqual(ids(level.inferred),['leaf']);
 assert.deepEqual(ids(level.covered),['leaf']);
 assert.deepEqual(ids(level.valid),['leaf']);
 assert.deepEqual(level.uncovered,[]);
 assert.deepEqual(applicationsNotPassingLevelQuality(report,level),[]);
 assert.deepEqual(maintenanceGapReasons(report,report,model.apps[0],[2]),[]);
 assert.deepEqual(report.needsReview,[]);
 assert.deepEqual(capabilityIssues(model,model.apps[0]),[]);
 assert.deepEqual(report.level2Coverage.get('leaf'),[{raw:'B.06.1.1 Detail',code:'B.06.1.1',parent:'B.06.1'}]);
 assert(!report.records.get('leaf').some(r=>r.level===2));
 assert.equal(JSON.stringify(data),before);
});

test('a good L3 never overrides an explicit bad L2; a direct good L2 stays direct even if L3 is bad',()=>{
 const {report}=reportFor(fixture([app('badL2','B.06.9 Unknown;B.06.1.1 Detail'),app('goodL2','B.06.1 Branch;B.06.1.9 Unknown')]));
 assert.deepEqual(ids(l2(report).filled),['badL2','goodL2']);
 assert.deepEqual(ids(l2(report).inferred),[]);
 assert.deepEqual(ids(l2(report).valid),['goodL2']);
 assert.deepEqual(ids(applicationsNotPassingLevelQuality(report,l2(report))),['badL2']);
 assert(report.issues.get('badL2').some(i=>i.level===2&&i.kind==='match'));
 assert(report.issues.get('goodL2').some(i=>i.level===3&&i.kind==='match'));
});

test('every L3 must be confirmed, including its name and standard parent',()=>{
 const data=fixture([
  app('mixed','B.06.1.1 Detail;B.06.1.9 Unknown'),
  app('name','B.06.1.1 A different purpose'),
  app('orphan','B.06.7.1 Orphan detail'),
  app('semantic','B.06.4.1 Commercial Inventory Management'),
  app('allGood','B.06.1.1 Detail;B.06.2.1 Other detail')
 ]);
 data.capabilityRows.push(['B.06.7.1 Orphan detail'],['B.06.4 Storage Management','B.06.4.1 Stock Putaway Management']);
 const {model,report}=reportFor(data);
 assert.deepEqual(ids(l2(report).inferred),['allGood']);
 for(const id of ['mixed','name','orphan','semantic'])assert(missingL2(report,id),id);
 assert(report.issues.get('mixed').some(i=>i.level===3&&i.kind==='match'));
 assert(report.issues.get('name').some(i=>i.label==='Name differs from standard'));
 assert(report.issues.get('semantic').some(i=>i.label==='Meaning needs confirmation'));
 assert(!model.caps.get('B.06.7')?.reference,'a tree placeholder cannot establish standard-parent coverage');
 assert.deepEqual(report.level2Coverage.get('allGood').map(e=>e.parent),['B.06.1','B.06.2']);
 const orphanParent=structuredClone(data);orphanParent.capabilityRows[1]=['B.06 Logistics','B.06.2.1 Other detail'];
 assert(missingL2(reportFor(orphanParent).report,'allGood'),'one unconfirmed parent blocks the all-L3 exception');
});

test('applied L3 corrections support coverage, including an empty raw field, but revocation removes it',()=>{
 for(const raw of ['B.06.1.9 Unknown','']){
  const data=fixture([app('mapped',raw)]);
  const correction=createCorrection(data,{appId:'mapped',dimension:'cap',raw,targetId:'B.06.1.1',reviewer:'Tester',reason:'Confirmed capability'});
  const mapped={...data,corrections:[correction]},before=JSON.stringify(mapped.apps),{report}=reportFor(mapped);
  assert.deepEqual(ids(l2(report).inferred),['mapped']);
  assert.deepEqual(report.issues.get('mapped'),[]);
  assert.equal(report.level2Coverage.get('mapped')[0].raw,raw);
  assert.equal(JSON.stringify(mapped.apps),before);
  assert(missingL2(reportFor(revokeCorrection(mapped,correction.id)).report,'mapped'));
 }
});

test('L2 coverage keeps other issues; Process L2 follows the same rule since V9.2 and never fills L0 or L1',()=>{
 const data=fixture([app('noL1','B.06.1.1 Detail',{'Main Business Capability':''}),app('unknown','B.06.1.1 Detail;Unreadable assignment')]),{model,report}=reportFor(data);
 assert.deepEqual(ids(l2(report).inferred),['noL1','unknown']);
 assert(report.issues.get('noL1').some(i=>i.level===1&&i.kind==='missing'));
 assert(report.issues.get('unknown').some(i=>i.level===null&&i.kind==='record'));
 const process=maintenanceReport(model,{},'process'),processL2=process.levels.find(l=>l.level===2);
 // The confirmed Level 3 'Detail' (M.T.010.010.010) has the catalogue Level 2 parent M.T.010.010: no Level 2 missing.
 assert(!process.issues.get('noL1').some(i=>i.level===2&&i.kind==='missing'));
 assert(process.issues.get('noL1').some(i=>i.level===0&&i.kind==='missing')&&process.issues.get('noL1').some(i=>i.level===1&&i.kind==='missing'),'L0 and L1 are still required');
 assert.deepEqual(capabilityLevel2Coverage(model,process,model.apps[0]),[],'the capability rule reads capability records only');
 assert.deepEqual(ids(processL2.valid),['noL1','unknown']);assert.deepEqual(ids(processL2.inferred),['noL1','unknown']);
 assert.deepEqual(ids(processL2.filled),[],'coverage is not a direct registration');
});

test('the bundled portfolio keeps direct L2 count 54 and removes only fifteen confirmed-L3 coverage gaps',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))),before=JSON.stringify(data.apps),{model,report}=reportFor(data),level=l2(report);
 assert.deepEqual([report.apps.length,level.filled.length,level.directValid.length,level.inferred.length,level.valid.length,level.missing.length,level.uncovered.length,level.invalid.length],[76,54,53,15,68,22,7,1]);
 assert.equal(report.needsReview.length,38);
 assert.equal(applicationsNotPassingLevelQuality(report,level).length,8);
 const agr=model.apps.find(a=>a.Name==='AGR w/ Camera'),dashboard=model.apps.find(a=>a.Name.startsWith('360'));
 assert.deepEqual(report.issues.get(agr.id),[]);
 assert(missingL2(report,dashboard.id),'an open L3 name question does not qualify as correctly filled');
 for(const a of level.inferred){
  assert(!report.needsReview.includes(a),'these 15 applications previously had only the L2 gap');
  assert.deepEqual(capabilityIssues(model,a),[]);
  assert.deepEqual(maintenanceGapReasons(report,report,a,[2]),[]);
 }
 for(const plant of report.plants){
  const filtered=maintenanceReport(model,{entity:plant.plant},'cap');
  assert.deepEqual(ids(l2(plant).valid),ids(l2(filtered).valid));
  assert.deepEqual(ids(plant.needsReview),ids(filtered.needsReview));
 }
 assert.equal(report.plants.reduce((n,p)=>n+l2(p).valid.length,0),level.valid.length);
 assert.equal(JSON.stringify(data.apps),before);
});

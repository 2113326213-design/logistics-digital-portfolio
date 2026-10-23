import {RECORDS_V916} from './records-v916.mjs';
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

// Fixed rule 2026-10-23 (V18.1): a level without a record is full (filled and matching) when a deeper level fully
// matches the standard. Before, the covered L2 matched but was not counted as filled.
test('a matching L3 makes the unrecorded L2 full (filled and matching) without creating a registration or changing the source',()=>{
 const data=fixture([app('leaf','B.06.1.1 Detail')]),before=JSON.stringify(data),{model,report}=reportFor(data),level=l2(report);
 assert.deepEqual(ids(level.filled),['leaf']);
 assert.deepEqual(ids(level.missing),[]);
 assert.deepEqual(ids(level.direct),[],'no direct registration is created');
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

test('every L3 must match the standard and have its standard parent; a name or meaning question stays its own issue and does not block coverage',()=>{
 const data=fixture([
  app('mixed','B.06.1.1 Detail;B.06.1.9 Unknown'),
  app('name','B.06.1.1 A different purpose'),
  app('orphan','B.06.7.1 Orphan detail'),
  app('semantic','B.06.4.1 Commercial Inventory Management'),
  app('allGood','B.06.1.1 Detail;B.06.2.1 Other detail')
 ]);
 data.capabilityRows.push(['B.06.7.1 Orphan detail'],['B.06.4 Storage Management','B.06.4.1 Stock Putaway Management']);
 const {model,report}=reportFor(data);
 // V18.1: 'name' and 'semantic' match the standard at Level 3 (their names are separate questions), so L2 is full.
 assert.deepEqual(ids(l2(report).inferred),['name','semantic','allGood']);
 for(const id of ['mixed','orphan'])assert(missingL2(report,id),id);
 for(const id of ['name','semantic'])assert(!missingL2(report,id),id);
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

test('coverage keeps other issues; a matching L3 fills every level above it, in Capability and in Process',()=>{
 const data=fixture([app('noL1','B.06.1.1 Detail',{'Main Business Capability':''}),app('unknown','B.06.1.1 Detail;Unreadable assignment')]),{model,report}=reportFor(data);
 assert.deepEqual(ids(l2(report).inferred),['noL1','unknown']);
 // V18.1: the matching L3 B.06.1.1 also fills Capability L1 (B.06), which 'noL1' does not record.
 assert(!report.issues.get('noL1').some(i=>i.level===1&&i.kind==='missing'));
 assert.deepEqual(ids(report.levels.find(l=>l.level===1).inferred),['noL1']);
 assert(report.issues.get('unknown').some(i=>i.level===null&&i.kind==='record'));
 const process=maintenanceReport(model,{},'process'),processL2=process.levels.find(l=>l.level===2);
 // The confirmed Level 3 'Detail' (M.T.010.010.010) has the catalogue Level 2 parent M.T.010.010: no Level 2 missing.
 assert(!process.issues.get('noL1').some(i=>i.level===2&&i.kind==='missing'));
 assert(!process.issues.get('noL1').some(i=>[0,1].includes(i.level)&&i.kind==='missing'),'V9.5 covers L0 and L1 through confirmed L3');
 assert.deepEqual(capabilityLevel2Coverage(model,process,model.apps[0]),[],'the capability rule reads capability records only');
 assert.deepEqual(ids(processL2.valid),['noL1','unknown']);assert.deepEqual(ids(processL2.inferred),['noL1','unknown']);
 assert.deepEqual(ids(processL2.filled),['noL1','unknown'],'a covered level counts as filled (V18.1)');
 assert.deepEqual(ids(processL2.direct),[],'but it is not a direct registration');
});

test('the bundled portfolio keeps direct L2 count 73; its three applications without L2 get it from their matching L3',()=>{
 // 2026-10-21 V9.16: re-derived from the merged LeanIX export (20261020_083736_UKj4Y_inventory.xlsx). 19 applications gained a direct L2 code (the L2 ancestor of their L3, or an L2 replacing the old L3/L1 registration):
 // missing 22 -> 3 (RBCD WI management system, VMCN_CONNEX, 360° Supplier dashboard), filled 54 -> 73, directValid 53 -> 72, inferred 15 -> 2, valid 68 -> 74, uncovered 7 -> 1, invalid 1 (ShzP_ALICE).
 // To review 38 -> 40 (+Control Tower, D-sample tracking system, Dolly call off program, Physical Logistics Management System: direct L2 only, L3 missing; -VMCN_CONNEX, VMCN_Digital Dynamic Supermarket). Not passing L2 quality 8 -> 2 (ShzP_ALICE, 360° Supplier dashboard).
 // V18.1 (fixed rule 2026-10-23): the 3 without L2 (RBCD WI management system, VMCN_CONNEX, 360° Supplier dashboard) are
 // full through their matching L3: filled 73 -> 76 (direct stays 73), inferred 2 -> 3, valid 74 -> 75, missing 3 -> 0.
 // 360° Supplier dashboard keeps its two name questions, so To review stays 40; not passing L2: ShzP_ALICE only.
 const data=JSON.parse(readFileSync(RECORDS_V916)),before=JSON.stringify(data.apps),{model,report}=reportFor(data),level=l2(report);
 assert.deepEqual([report.apps.length,level.filled.length,level.directValid.length,level.inferred.length,level.valid.length,level.missing.length,level.uncovered.length,level.invalid.length,level.direct.length],[76,76,72,3,75,0,0,1,73]);
 assert.equal(report.needsReview.length,40);
 assert.deepEqual(applicationsNotPassingLevelQuality(report,level).map(a=>a.Name),['ShzP_ALICE']);
 const agr=model.apps.find(a=>a.Name==='AGR w/ Camera'),dashboard=model.apps.find(a=>a.Name.startsWith('360'));
 assert.deepEqual(report.issues.get(agr.id),[]);
 assert(!missingL2(report,dashboard.id),'its L3 matches the standard');
 assert.deepEqual(report.issues.get(dashboard.id).map(i=>i.label),['Name differs from standard','Name differs from standard'],'the name questions stay');
 for(const a of level.inferred){
  assert(!capabilityIssues(model,a).some(i=>i.level===2));
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

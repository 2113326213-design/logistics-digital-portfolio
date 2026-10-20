import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {overviewStats,filterOverviewApplications,applicationsNotPassingLevelQuality,l3MaintenanceMetrics,maintenanceGapReasons} from '../public/overview.mjs';
const app=(ID,cap,process,Division='PS')=>({ID,Name:'Application '+ID,Description:'Description',Division,Entity:Division==='PS'?'Plant A':'Plant B','Lifecycle: Current Lifecycle':'active','Business Capabilities':cap,Processes:process});
const fixture=()=>({capabilityRows:[['B.06 Logistics','B.06.1 Branch','B.06.1.1 Detail']],processRows:[['Test','L0','M.T','Test'],['Test','L1','M.T.010','Stage'],['Test','L3','M.T.010.010.010','Detail']],apps:[app('A','B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail','BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Detail L3'),app('B','B.06.9.1 Unknown','BBM PM T Stage L1;BBM PM T Detail L3V'),app('C','B.06.1 Branch','','EM')]});
test('Drill search intersects plant and original cohort without changing the source applications',()=>{
 const apps=[{id:'001',Name:'Warehouse Camera',Entity:'RBCD',Division:'PS'},{id:'002',Name:'Warehouse Camera',Entity:'RBHP',Division:'PS'},{id:'003',Name:'Planning',Entity:'RBCD',Division:'EM'},{id:'004',Name:'Unknown plant'}];
 const original=JSON.stringify(apps),cohort=apps.slice(0,2);
 assert.deepEqual(filterOverviewApplications(cohort,{entity:'RBCD',query:'  camera   rbcd  '}).map(a=>a.id),['001']);
 assert.deepEqual(filterOverviewApplications(cohort,{entity:'RBCD',query:'002'}),[]);
 assert.deepEqual(filterOverviewApplications(cohort,{query:'Planning'}),[],'search must not include applications outside this drill');
 assert.deepEqual(filterOverviewApplications(apps,{entity:'Not provided'}).map(a=>a.id),['004']);
 assert.deepEqual(filterOverviewApplications(cohort),cohort,'clearing returns the original cohort');
 assert.equal(JSON.stringify(apps),original);
});
test('Overview separates field presence, exact taxonomy matches and deepest confirmed levels',()=>{
 const model=buildModel(fixture()),before=JSON.stringify(model.apps),s=overviewStats(model);
 assert.equal(s.maintenance.complete.length,2);
 assert.deepEqual(s.cap.levels.map(x=>[x.label,x.apps.length]),[['L1',0],['L2',1],['L3',1],['No B.06 match',1]]);
 assert.deepEqual([s.cap.matched.length,s.cap.pending.length,s.cap.missing.length],[2,1,0]);
 assert.deepEqual([s.process.matched.length,s.process.pending.length,s.process.missing.length],[2,0,1]);
 // L3V is Level 3 (owner decision 2026-10-19): B's 'Detail L3V' has a unique standard name in chain T, so it is matched as Level 3.
 assert.deepEqual(model.apps.find(a=>a.id==='B').process,['M.T.010','M.T.010.010.010']);
 assert(!model.issues.some(i=>i.appId==='B'&&i.type.startsWith('流程')),'a matched L3V record raises no process issue');
 assert.deepEqual(s.process.levels.find(x=>x.label==='L3').apps.map(a=>a.id),['A','B']);
 assert.equal(s.process.levels.find(x=>x.label==='L1').apps.length,0);
 assert.equal(s.process.branches.length,1,'orphan detail nodes must not become process chains');
 assert.equal(s.cap.branches[0].apps.length,2,'parents and children do not duplicate application counts');
 assert.equal(JSON.stringify(model.apps),before,'reporting must not rewrite application data');
 // An L3V record without a unique standard name is pending like an unmatched L3; B's deepest confirmed level stays L1.
 const data=fixture();data.apps[1].Processes='BBM PM T Stage L1;BBM PM T Unlisted L3V';
 const unmatchedModel=buildModel(data),unmatched=overviewStats(unmatchedModel);
 assert.deepEqual(unmatchedModel.issues.filter(i=>i.appId==='B'&&i.type.startsWith('流程')).map(i=>[i.type,i.value]),[['流程未匹配层级表','BBM PM T Unlisted L3V']]);
 assert.deepEqual([unmatched.process.matched.map(a=>a.id),unmatched.process.pending.map(a=>a.id),unmatched.process.missing.map(a=>a.id)],[['A'],['B'],['C']]);
 assert.deepEqual(unmatched.process.levels.find(x=>x.label==='L1').apps.map(a=>a.id),['B']);
 assert.deepEqual(unmatched.process.levels.find(x=>x.label==='L3').apps.map(a=>a.id),['A']);
 // An application whose only process record is an unmatched L3V record has registered a process: it is pending, not missing.
 const onlyL3V=fixture();onlyL3V.apps[2].Processes='BBM PM T Unlisted L3V';
 const only=overviewStats(buildModel(onlyL3V));
 assert.deepEqual([only.process.matched.map(a=>a.id),only.process.pending.map(a=>a.id),only.process.missing.map(a=>a.id)],[['A','B'],['C'],[]]);
});
test('Filters intersect and zero-result scopes keep taxonomy denominators without inventing matches',()=>{
 const model=buildModel(fixture());
 const unknownOnly=overviewStats(model,{division:'PS'});assert.equal(unknownOnly.apps.length,2);
 const onlyUnknown={...model,apps:model.apps.filter(a=>a.id==='B')};assert.equal(overviewStats(onlyUnknown).cap.covered,0,'an unknown descendant cannot establish ancestor coverage');
 const empty=overviewStats(model,{division:'PS',entity:'Plant B'});assert.equal(empty.apps.length,0);assert.equal(empty.maintenance.complete.length,0);assert.equal(empty.cap.covered,0);assert.equal(empty.cap.taxonomyTotal,3);assert.equal(empty.process.levels.reduce((n,l)=>n+l.apps.length,0),0);
});
test('Effective mapping can resolve classification without changing source completeness',()=>{
 const model=buildModel(fixture());model.apps[2].process=['M.T.010'];model.apps[2].processLeaf=['M.T.010'];
 const s=overviewStats(model,{division:'EM'});assert.equal(s.process.matched.length,1);assert.equal(s.process.missing.length,0);assert.equal(s.maintenance.complete.length,0);assert.equal(s.maintenance.fields.find(f=>f.key==='Processes').missing.length,1);
});

import {maintenanceReport} from '../public/overview.mjs';
import {createCorrection} from '../public/corrections.mjs';
test('Plant rates count registered and valid applications separately with the same denominator',()=>{
 const m=buildModel(fixture()),r=maintenanceReport(m,{},'cap');
 assert.deepEqual(r.levelsAvailable,[1,2,3]);
 assert.deepEqual(r.levels.map(l=>[l.level,l.filled.length,l.valid.length]),[[1,1,1],[2,2,2],[3,2,1]]);
 const ps=r.plants.find(p=>p.plant==='Plant A');assert.equal(ps.apps.length,2);assert.equal(ps.levels[2].filled.length,2);assert.equal(ps.levels[2].valid.length,1);
 const bOnly=maintenanceReport({...m,apps:m.apps.filter(a=>a.id==='B')},{},'cap');assert.equal(bOnly.levels[0].filled.length,0,'unknown descendants must not infer parent maintenance');
});
test('Any bad registration at a level reduces quality once, and no L3V record is held outside the report',()=>{
 const data=fixture();data.apps[0]['Business Capabilities']+=';B.06.7.1 Unknown detail';
 const cap=maintenanceReport(buildModel(data),{},'cap');assert.equal(cap.levels[2].filled.length,2);assert.equal(cap.levels[2].valid.length,0);assert.equal(cap.pending.length,2);
 // L3V is Level 3 (owner decision 2026-10-19): no record is a variant excluded from registration and quality.
 const p=maintenanceReport(buildModel(fixture()),{},'process');assert.deepEqual(p.levelsAvailable,[0,1,2,3]);assert(!('l3v' in p)&&p.records.get('B').every(r=>!('variant' in r)),'no variant state remains');assert.deepEqual(p.registered.map(a=>a.id),['A','B']);assert.equal(p.missing.length,1);
 // An unmatched L3V record is a bad registration: its application no longer passes quality.
 const unmatched=fixture();unmatched.apps[1].Processes='BBM PM T Stage L1;BBM PM T Unlisted L3V';
 const u=maintenanceReport(buildModel(unmatched),{},'process');
 assert.deepEqual([u.quality.map(a=>a.id),u.pending.map(a=>a.id),u.missing.map(a=>a.id)],[['A'],['B'],['C']]);
 assert.deepEqual(u.records.get('B').filter(r=>!r.valid).map(r=>[r.raw,r.level,r.reason]),[['BBM PM T Unlisted L3V',3,'流程未匹配层级表']]);
 const empty=maintenanceReport(buildModel(fixture()),{entity:'No plant'},'process');assert.equal(empty.apps.length,0);assert.equal(empty.plants.length,0);
});
// L3V is Level 3 (owner decision 2026-10-19): without a mapping, a matched L3V record counts as a valid Level 3
// registration and an unmatched one as an unrecognized Level 3 registration, never as 'unknown'.
test('L3V records are Level 3 registrations in the maintenance report',()=>{
 const p=maintenanceReport(buildModel(fixture()),{},'process');
 assert.deepEqual(p.records.get('B').map(r=>[r.raw,r.level,r.valid]),[['BBM PM T Stage L1',1,true],['BBM PM T Detail L3V',3,true]]);
 assert.deepEqual([p.levels[3].filled.map(a=>a.id),p.levels[3].valid.map(a=>a.id)],[['A','B'],['A','B']]);
 assert.deepEqual(p.unknown,[]);assert.deepEqual(p.quality.map(a=>a.id),['A','B']);assert.deepEqual(l3MaintenanceMetrics(p).notPassing.map(a=>a.id),['C']);
 // To review covers every level (owner specification 2026-10-20): A has no L2, B no L0 and no L2, C no process at all.
 assert.deepEqual(p.needsReview.map(a=>a.id),['A','B','C']);
 assert.deepEqual(p.issues.get('B').map(i=>i.label),['Level 0 missing','Level 2 missing']);
 const data=fixture();data.apps[1].Processes='BBM PM T Stage L1;BBM PM T Unlisted L3V';
 const u=maintenanceReport(buildModel(data),{},'process'),b=u.apps.find(a=>a.id==='B');
 assert.deepEqual(u.records.get('B').find(r=>r.raw==='BBM PM T Unlisted L3V').level,3);
 assert.deepEqual([u.levels[3].valid.map(a=>a.id),u.levels[3].invalid.map(a=>a.id),u.unknown],[['A'],['B'],[]]);
 // The level suffix is read the same way as the model reads it, in any letter case.
 const lower=fixture();lower.apps[1].Processes='BBM PM T Stage l1;BBM PM T Detail l3v';
 const lowerModel=buildModel(lower);
 assert.deepEqual(lowerModel.apps.find(a=>a.id==='B').process,['M.T.010','M.T.010.010.010']);
 assert.deepEqual(maintenanceReport(lowerModel,{},'process').records.get('B').map(r=>[r.level,r.valid]),[[1,true],[3,true]]);
 // Only a record with no level suffix at all is 'unknown'.
 const noLevel=fixture();noLevel.apps[1].Processes='BBM PM T Stage L1;BBM PM T Detail';
 assert.deepEqual(maintenanceReport(buildModel(noLevel),{},'process').unknown.map(a=>a.id),['B']);
 assert.deepEqual(maintenanceGapReasons(u,u,b,[3]),['L3 '+String.fromCharCode(183)+' Unrecognized registration: BBM PM T Unlisted L3V']);
});
test('Only applied verified mappings repair the quality numerator; notes alone do not',()=>{
 const data=fixture(),raw=data.apps[1]['Business Capabilities'];data.reviews={example:{status:'已确认',result:'done',reviewer:'test'}};
 assert.equal(maintenanceReport(buildModel(data),{},'cap').quality.length,2);
 data.corrections=[createCorrection(data,{appId:'B',dimension:'cap',raw,targetId:'B.06.1.1',reviewer:'Test',reason:'Verified source'})];
 const fixed=maintenanceReport(buildModel(data),{},'cap');assert.equal(fixed.quality.length,3);assert.equal(fixed.levels[2].valid.length,2);assert.equal(data.apps[1]['Business Capabilities'],raw);
});
test('L2 quality drill includes invalid records and missing L2 records in its denominator',()=>{
 const data=fixture();data.apps=[
  app('A','B.06.8 Unknown','','PS'),app('B','B.06.9 Unknown','','PS'),
  app('C','B.06.1.1 Detail','','PS'),app('D','','','PS')
 ];
 const report=maintenanceReport(buildModel(data),{division:'PS',entity:'Plant A'},'cap'),l2=report.levels.find(l=>l.level===2);
 assert.deepEqual([report.apps.length,l2.valid.length,l2.invalid.length,l2.missing.length],[4,0,2,2]);
 assert.deepEqual(applicationsNotPassingLevelQuality(report,l2).map(a=>a.id),['A','B','C','D']);
 assert.match(maintenanceGapReasons(report,report,report.apps[0],[2])[0],/L2 · Unrecognized registration/);
 assert.deepEqual(maintenanceGapReasons(report,report,report.apps[2],[2]),['L2 · No explicit registration']);
});
test('Main Business Capability supplies L1 once when it repeats in the capability list',()=>{
 const data=fixture();data.apps[1]['Main Business Capability']='B.06 Logistics';
 data.apps[1]['Business Capabilities']+=';B.06 Logistics';
 const report=maintenanceReport(buildModel(data),{},'cap');
 assert.equal(report.records.get('B').filter(record=>record.level===1).length,1);
 assert.equal(report.levels.find(level=>level.level===1).filled.length,2);
});
test('An empty-field capability mapping remains counted alongside a recorded main capability',()=>{
 const data=fixture();data.apps[1]['Business Capabilities']='';data.apps[1]['Main Business Capability']='B.06 Logistics';
 data.corrections=[createCorrection(data,{appId:'B',dimension:'cap',raw:'',targetId:'B.06.1.1',reviewer:'Test',reason:'Verified source'})];
 const model=buildModel(data),report=maintenanceReport(model,{},'cap');
 assert.deepEqual(model.apps.find(a=>a.id==='B').cap,['B.06.1.1']);
 assert(report.levels.find(l=>l.level===1).valid.some(a=>a.id==='B'));
 assert(report.levels.find(l=>l.level===3).valid.some(a=>a.id==='B'));
 // Only the level without any record stays open: the main capability gives L1, the mapping gives L3.
 assert.deepEqual(report.issues.get('B').map(i=>i.label),['Level 2 missing']);
 assert.equal(data.apps[1]['Business Capabilities'],'','the mapping must not overwrite raw data');
});
test('RBCW and portfolio: the Level 3 gap stays Level 3 only; To review covers every level',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
 const model=buildModel(data),all=maintenanceReport(model,{},'cap'),report=maintenanceReport(model,{entity:'RBCW'},'cap'),l1=report.levels.find(l=>l.level===1),l3=l3MaintenanceMetrics(report);
 assert.equal(all.levels.find(level=>level.level===1).filled.length,76);
 // Legacy catalogue (before 2026-10-16): 38. The standard adds B.06.9.x (2 applications pass L3) but has no B.06.4.4 (1 application fails): 37.
 // Its HC.06.xx entries belong to another department and are not catalogued (owner decision 2026-10-19), so VMCN_CONNEX
 // (HC.06.01.01, HC.06.01.05) still needs review, as with the legacy catalogue.
 const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url))),legacy=maintenanceReport(buildModel({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource}),{},'cap');
 assert.equal(l3MaintenanceMetrics(legacy).notPassing.length,38);
 // To review (2026-10-20) adds applications whose open issues are at other levels: 63 with the legacy catalogue.
 assert.equal(legacy.needsReview.length,63);
 assert(l3MaintenanceMetrics(legacy).notPassing.every(app=>legacy.needsReview.includes(app)),'every Level 3 gap is also To review');
 assert.deepEqual([...model.caps.values()].filter(node=>node.reference&&node.id.startsWith('HC.')).map(node=>node.id),[],'no HC entry in the capability catalogue');
 assert.equal(l3MaintenanceMetrics(all).notPassing.length,37);
 assert.equal(all.needsReview.length,53);
 assert.equal(all.levels.find(level=>level.level===3).valid.length,39);
 const names=report=>new Set(l3MaintenanceMetrics(report).notPassing.map(app=>app.Name));
 assert.deepEqual([...names(legacy)].filter(name=>!names(all).has(name)).sort(),['RBCC Supplier Logistics Management Platform','RBHP_LOG SupplierManager']);
 assert.deepEqual([...names(all)].filter(name=>!names(legacy).has(name)),['VMCN_Digital Dynamic Supermarket']);
 assert(names(all).has('VMCN_CONNEX')&&names(all).has('Wuj HK AGV (recovered 2025-06-26 03:31:37)'),'applications whose only L3 records are HC still need review');
 assert(l3MaintenanceMetrics(all).notPassing.every(app=>all.needsReview.includes(app)));
 assert.equal(report.apps.length,8);
 assert.equal(l1.filled.length,8);
 assert.equal(l3.complete.length,7);
 assert.equal(l3.quality.length,7);
 assert.equal(report.pending.length,0,'all existing registrations can pass taxonomy checks');
 assert.equal(report.needsReview.length,1,'RBCW: one application has open issues, its missing Level 3 registration');
 assert.deepEqual(report.needsReview.map(app=>app.id),l3.notPassing.map(app=>app.id));
 assert(report.needsReview.every(app=>maintenanceGapReasons(report,report,app,[3]).length>0));
});

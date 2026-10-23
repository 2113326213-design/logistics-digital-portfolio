// V9.2 (owner decisions 2026-10-20): pair reviews in the import preview, one status rule, and Process Level 2 covered by
// confirmed Level 3 records exactly as Capability Level 2.
import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processLevel2Coverage,reviewIssues} from '../public/review-issues.mjs';
import {previewImport,importAppliedStatus} from '../public/import-review.mjs';
import {PAIR_STATES} from '../public/pair-status.mjs';

const bundled=()=>workspaceData(JSON.parse(readFileSync(RECORDS_V916)));

test('every preview field the import dialog reads exists, including pair reviews (v8 and V9.1 lacked it)',()=>{
 const current=bundled(),incoming={...bundled(),pairReviews:{'a::b':{status:'Complementary',reason:'r',reviewer:'',date:'2026-10-20'}}};
 const preview=previewImport(current,incoming);
 const used=[...new Set(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').match(/\bpreview\.([A-Za-z]+)/g).map(s=>s.slice(8)))];
 for(const key of used)assert.notEqual(preview[key],undefined,`preview.${key} is read by app.js`);
 assert.deepEqual(preview.pairReviews,{added:1,updated:0,removed:0,total:1,count:1});
 assert.match(importAppliedStatus(preview,current.apps.length),/Pair reviews updated/);
 assert.deepEqual(previewImport(incoming,current).pairReviews,{added:0,updated:0,removed:1,total:1,count:0});
});

test('one status vocabulary: the old labels are gone from every page and export',()=>{
 assert.deepEqual([...PAIR_STATES],['Potential overlap','Below threshold','No complete score','No shared registrations','Data missing','Needs confirmation','More detail needed','Out of scope']);
 for(const file of ['similarity-ui.mjs','pair-status.mjs','exports.mjs','comparison-records.mjs']){
  const text=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(text,/'Review needed'|'Not similar'/,file);
 }
});

test('bundled data: Process Level 2 is full through matching Level 3 records for 24 applications; source records unchanged',()=>{
 const data=bundled(),before=JSON.stringify(data.apps),model=buildModel(data),report=maintenanceReport(model,{},'process'),l2=report.levels.find(l=>l.level===2);
 // 2026-10-21 (V9.16 export merge): VMCN_CONNEX gained the confirmed L3 record "BBM PM P2F Prepare demand forecasting L3" (Processes
 // were empty), so it joined the inferred list (20 → 21, valid 67 → 68) and left Process To review (24 → 23); recomputed from data.json.
 // V18.1 (fixed rule 2026-10-23): the 21 covered applications count as filled too (direct registrations stay 47).
 // V19.1 union (owner 2026-10-23): 3 applications whose Level 3 records are in LeanIX but not in the Signavio list now have
 // matching Level 3 records that fill Level 2 (inferred 21 → 24, filled and valid 68 → 71, Level 2 missing 8 → 5): RBCD WI
 // management system, RBCW E-Queue system, RBCD LOM Scrap Management Platform. To review 23 → 11: 10 applications whose only
 // process issues were records with a level outside the Signavio list (or levels those records now fill), RBAC_ME_Szh5
 // whose only issue was "Process name differs between sources" (no longer an issue), and VM-CN_WACOS_Szh5 with both.
 assert.deepEqual([l2.filled.length,l2.direct.length,l2.inferred.length,l2.valid.length],[71,47,24,71]);
 assert.deepEqual(l2.inferred.filter(a=>processLevel2Coverage(model,report,a).some(e=>e.inLeanix)).map(a=>a.Name).sort(),['RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW E-Queue system']);
 assert.equal([...report.issues.values()].filter(list=>list.some(i=>i.level===2&&i.kind==='missing')).length,5);
 assert.equal(report.needsReview.length,11);
 assert.equal(JSON.stringify(data.apps),before,'source records are not changed');
 // V9.5 also accepts confirmed L3 coverage for missing L0 and L1.
 const cgqb=model.apps.find(a=>a.Name==='CGQB_Logistic_system');
 assert(processLevel2Coverage(model,report,cgqb).length);
 assert(!report.issues.get(cgqb.id).some(i=>i.level===2));
});

// V19.1 union (owner 2026-10-23): each of these three applications has Level 3 records that are not in the Signavio list
// but, recorded with a level, are in LeanIX. They match, so all Level 3 records match and fill Level 2 (fixed rule
// 2026-10-23); until V19 they were "Level 3 match needs review" and kept Level 2 missing. model.issues still lists them (similarity check and
// mappings unchanged). A Level 3 record that does not match still keeps Level 2 missing (checked below on the same report).
test('a Level 3 record in LeanIX but not in the Signavio list matches and fills Level 2; one that does not match keeps Level 2 missing',()=>{
 const data=bundled(),model=buildModel(data),report=maintenanceReport(model,{},'process');
 for(const name of ['RBCD WI management system','RBCW E-Queue system','RBCD LOM Scrap Management Platform']){
  const app=model.apps.find(a=>a.Name===name),l3=report.records.get(app.id).filter(r=>r.level===3);
  const union=new Set(app.inLeanix.map(x=>x.raw)),inLeanix=l3.filter(r=>union.has(r.raw));
  // Each has at least one Level 3 record outside the Signavio list next to Signavio-matched ones; all of them match now.
  assert(inLeanix.length&&inLeanix.length<l3.length&&l3.every(r=>r.valid),name);
  assert(inLeanix.every(r=>r.reason==='In LeanIX, not in the Signavio list'&&model.issues.some(i=>i.appId===app.id&&i.value===r.raw)),`${name}: model.issues keeps the records`);
  assert(!report.issues.get(app.id).some(i=>i.level===2&&i.kind==='missing'),name);
  assert(!report.issues.get(app.id).some(i=>i.level===3&&i.kind==='match'),name);
  // The evidence: the LeanIX records without a Signavio code or parent, the Signavio records with theirs.
  const evidence=processLevel2Coverage(model,report,app);
  assert.deepEqual(evidence.filter(e=>e.inLeanix),inLeanix.map(r=>({raw:r.raw,code:null,parent:null,inLeanix:true})),name);
  assert(evidence.filter(e=>!e.inLeanix).length===l3.length-inLeanix.length&&evidence.filter(e=>!e.inLeanix).every(e=>e.code&&e.parent),name);
  // The LeanIX records marked as not matching (their state before V19.1): no coverage, Level 2 missing and the Level 3 match to review.
  const records=new Map(report.records);records.set(app.id,report.records.get(app.id).map(r=>union.has(r.raw)?{...r,valid:false}:r));
  const notMatching={...report,records};
  assert.deepEqual(processLevel2Coverage(model,notMatching,app),[],name);
  const issues=reviewIssues(model,notMatching,app);
  assert(issues.some(i=>i.level===2&&i.kind==='missing'),name);
  assert(issues.some(i=>i.level===3&&i.kind==='match'),name);
 }
});

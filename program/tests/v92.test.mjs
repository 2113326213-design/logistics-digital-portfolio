// V9.2 (owner decisions 2026-10-20): pair reviews in the import preview, one status rule, and Process Level 2 covered by
// confirmed Level 3 records exactly as Capability Level 2.
import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processLevel2Coverage} from '../public/review-issues.mjs';
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

test('bundled data: Process Level 2 is covered by confirmed Level 3 records for 21 applications; filled and source records unchanged',()=>{
 const data=bundled(),before=JSON.stringify(data.apps),model=buildModel(data),report=maintenanceReport(model,{},'process'),l2=report.levels.find(l=>l.level===2);
 // 2026-10-21 (V9.16 export merge): VMCN_CONNEX gained the confirmed L3 record "BBM PM P2F Prepare demand forecasting L3" (Processes
 // were empty), so it joined the inferred list (20 → 21, valid 67 → 68) and left Process To review (24 → 23); recomputed from data.json.
 assert.deepEqual([l2.filled.length,l2.inferred.length,l2.valid.length],[47,21,68]);
 assert.equal([...report.issues.values()].filter(list=>list.some(i=>i.level===2&&i.kind==='missing')).length,8);
 assert.equal(report.needsReview.length,23);
 assert.equal(JSON.stringify(data.apps),before,'source records are not changed');
 // V9.5 also accepts confirmed L3 coverage for missing L0 and L1.
 const cgqb=model.apps.find(a=>a.Name==='CGQB_Logistic_system');
 assert(processLevel2Coverage(model,report,cgqb).length);
 assert(!report.issues.get(cgqb.id).some(i=>i.level===2));
});

test('a Level 3 record that is not confirmed keeps Level 2 missing',()=>{
 const data=bundled(),model=buildModel(data),report=maintenanceReport(model,{},'process');
 for(const name of ['RBCD WI management system','RBCW E-Queue system','RBCD LOM Scrap Management Platform']){
  const app=model.apps.find(a=>a.Name===name);
  assert(report.issues.get(app.id).some(i=>i.level===2&&i.kind==='missing'),name);
  assert(report.issues.get(app.id).some(i=>i.level===3&&i.kind==='match'),name);
  assert.deepEqual(processLevel2Coverage(model,report,app),[],name);
 }
});

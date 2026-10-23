// V9.18 (owner decision 2026-10-22, "确定就是这样登记的", both records): RBCW Auto Warehouse Management System
// "BBM PM I2D Transport Material Intra Plant L3" and AUTO-RACK "BBM PM I2D Putaway to Automated Warehouse L3V" are
// registered correctly although the process catalogue has no such process. A confirmed record is not an open issue
// (To review, application issues, record checks, similarity pending records) and never counts as matching the
// standard. The decision applies only while the application records exactly that text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanAcceptedRecords,acceptedKey,acceptedText} from '../public/accepted-records.mjs';
import {workspaceData,exportWorkspace,importWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {maintenanceReport,l3MaintenanceMetrics,maintenanceGapReasons} from '../public/overview.mjs';
import {reviewIssues} from '../public/review-issues.mjs';
import {dataChecksForApp} from '../public/data-checks.mjs';
import {reviewItems} from '../public/reviews.mjs';
import {previewImport} from '../public/import-review.mjs';
import {PRESERVED_KEYS} from '../scripts/prepare-data.mjs';

const raw=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const data=workspaceData(raw),model=buildModel(data);
const RBCW='RBCW Auto Warehouse Management System',TRANSPORT='BBM PM I2D Transport Material Intra Plant L3';
const AUTORACK='AUTO-RACK',PUTAWAY='BBM PM I2D Putaway to Automated Warehouse L3V';
const app=name=>model.apps.find(a=>a.Name===name);
const withoutDecisions=buildModel({...data,acceptedRecords:[]});

test('accepted records are cleaned: complete entries only, one per application, dimension and record',()=>{
 const entry={appId:' A ',dimension:'process',raw:'X L3',reviewer:'Owner decision',reason:'Not in the catalogue.',acceptedAt:'2026-10-22'};
 assert.deepEqual(cleanAcceptedRecords([entry,{...entry},{...entry,dimension:'other'},{...entry,reviewer:''},{...entry,raw:'  '},null,'x']),[{...entry,appId:'A'}]);
 assert.deepEqual(cleanAcceptedRecords('not a list'),[]);
 assert.equal(acceptedKey({appId:'A',dimension:'process',raw:'X L3'}),acceptedKey({appId:' A ',dimension:'process',raw:'X L3'}));
 assert.equal(acceptedText(entry),'Owner decision of 2026-10-22: confirmed as recorded; not in the current process catalogue, so it does not count as matching the standard. Not in the catalogue.');
});

test('bundled data: the two owner decisions of 2026-10-22, with a history note on each application',()=>{
 assert.deepEqual(raw.acceptedRecords.map(d=>[model.apps.find(a=>a.id===d.appId).Name,d.dimension,d.raw,d.reviewer,d.acceptedAt]),[
  [RBCW,'process',TRANSPORT,'Owner decision','2026-10-22'],[AUTORACK,'process',PUTAWAY,'Owner decision','2026-10-22']
 ]);
 for(const d of raw.acceptedRecords){
  assert.equal(d.reason,'It is in neither the process snapshot of 21.02.2025 nor the LeanIX process export of 2026-10-20, so it has no standard code.');
  const note=raw.applicationEvents.find(e=>e.appId===d.appId&&e.kind==='note');
  assert.match(note.details,new RegExp(`Owner confirmed on 2026-10-22 that the process record "${d.raw.replace(/[()]/g,'\\$&')}" is registered correctly as recorded`));
  assert.equal(note.recorder,'Owner decision');
 }
 assert.deepEqual(model.accepted.map(d=>`${d.app}: ${d.raw}`).sort(),[`${AUTORACK}: ${PUTAWAY}`,`${RBCW}: ${TRANSPORT}`]);
});

test('a confirmed record is not an issue anywhere, and it still does not match the standard',()=>{
 const process=maintenanceReport(model,{},'process'),before=maintenanceReport(withoutDecisions,{},'process');
 for(const name of [RBCW,AUTORACK]){
  const a=app(name),record=process.records.get(a.id).find(r=>r.raw===(name===RBCW?TRANSPORT:PUTAWAY));
  assert.deepEqual([record.valid,!!record.accepted,record.reason],[false,true,'Confirmed by owner as recorded']);
  assert.equal(model.issues.some(i=>i.appId===a.id&&i.value===record.raw),false,'not a model issue (record checks, similarity)');
  assert.equal(withoutDecisions.issues.some(i=>i.appId===a.id&&i.value===record.raw),true,'it was one before the decision');
  assert.equal(reviewIssues(model,process,a).some(i=>i.record===record.raw),false,'not in To review or the application detail');
  assert.equal(reviewItems(model).some(i=>i.raw===record.raw),false,'not in the review checklist');
  const check=dataChecksForApp(model,a).checks.find(c=>c.dimension==='process'&&c.raw===record.raw);
  assert.deepEqual(check.tags.map(t=>t.label),['Confirmed by owner as recorded']);
  assert.match(maintenanceGapReasons(process,process,a,[3]).join(' | '),new RegExp(`L3 · Confirmed by owner as recorded \\(not in the catalogue\\): ${record.raw.replace(/[()]/g,'\\$&')}`));
 }
 // AUTO-RACK had no other process issue: it leaves Process To review. RBCW keeps its traceable Level 0 / Level 1 entries.
 assert.deepEqual(reviewIssues(model,process,app(AUTORACK)),[]);
 assert.deepEqual(reviewIssues(model,process,app(RBCW)).map(i=>i.label),['Level 0 missing','Level 1 missing']);
 assert.deepEqual([before.needsReview.length,process.needsReview.length],[23,22]);
 const [l3,l3Before]=[l3MaintenanceMetrics(process),l3MaintenanceMetrics(before)];
 assert.deepEqual([l3Before.quality.length,l3.quality.length],[55,55],'Level 3 matches standard does not change');
 assert.deepEqual([l3Before.notPassing.length,l3.notPassing.length,l3.confirmed.length],[20,18,2]);
 // The similarity check no longer holds AUTO-RACK's pairs back for this record.
 assert.equal(model.issues.filter(i=>i.appId===app(AUTORACK).id).length,0);
});

test('the decision applies only to the exact record text; a changed record is checked again',()=>{
 const changed=buildModel({...data,apps:data.apps.map(a=>a.Name===AUTORACK?{...a,Processes:a.Processes.replace(PUTAWAY,'BBM PM I2D Putaway to Automated Warehouse (new) L3V')}:a)});
 const a=changed.apps.find(x=>x.Name===AUTORACK);
 assert.deepEqual(a.accepted,[]);
 assert.equal(changed.issues.some(i=>i.appId===a.id&&/Automated Warehouse \(new\)/.test(i.value)),true);
});

test('the decisions travel with the workspace, imports and rebuilds',()=>{
 assert.deepEqual(importWorkspace(exportWorkspace(data)).acceptedRecords,data.acceptedRecords);
 const {acceptedRecords,...saved}=data,merged=mergeBundledCorrections(saved,raw);
 assert.equal(merged.changed,true);assert.deepEqual(merged.data.acceptedRecords,data.acceptedRecords);
 const preview=previewImport(data,{...data,acceptedRecords:[]},{...data,acceptedRecords:[]});
 assert.deepEqual([preview.added.length,preview.updated.length,preview.removed.length,preview.taxonomyChanged,preview.hasChanges],[0,0,0,false,true],'removing a decision is a workspace change');
 assert.equal(previewImport(data,data,data).hasChanges,false);
 assert(PRESERVED_KEYS.includes('acceptedRecords'),'prepare-data keeps them on a rebuild');
 const profile=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(profile.includes('<p class="hint profile-confirmed">${a.accepted.map(d=>esc(`${d.dimension===\'cap\'?\'Business Capability\':\'Process\'} · ${d.raw} — ${acceptedText(d)}`)).join(\'<br>\')}</p>'));
 const overview=readFileSync(new URL('../public/overview.mjs',import.meta.url),'utf8');
 // V17.3 (owner 2026-10-23): the Overview no longer shows the count of records confirmed as recorded.
 assert(!overview.includes('confirmed as recorded</small>'));
});

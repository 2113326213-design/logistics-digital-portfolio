// V9.18 (owner decision 2026-10-22, "确定就是这样登记的", both records): RBCW Auto Warehouse Management System
// "BBM PM I2D Transport Material Intra Plant L3" and AUTO-RACK "BBM PM I2D Putaway to Automated Warehouse L3V" are
// registered correctly although the process catalogue has no such process. A confirmed record is not an open issue
// (To review, application issues, record checks, similarity pending records) and never counts as matching the
// standard. The decision applies only while the application records exactly that text.
// V19.1 union (owner 2026-10-23): both records are in LeanIX (every process recorded with a level is), so they now match
// and their confirmation is superseded (not shown as confirmed). Confirmations of other records (a process without a
// level, capabilities) work as before.
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

test('a confirmed record is not an issue anywhere, and it still does not match the standard; a process with a level now matches (V19.1)',()=>{
 // V19.1 union (owner 2026-10-23: "要并集的看", "应用登记的就算"): a process recorded with a level is in LeanIX, so the two
 // records confirmed on 2026-10-22 now simply match the standard. Their confirmation is superseded: not confirmed, not
 // listed in Data checks, not a Level 3 gap. Until V19 they stayed valid=false with "Confirmed by owner as recorded".
 // The decision is still held on the application, so the model keeps them out of its open records (similarity pending
 // records) exactly as before.
 const process=maintenanceReport(model,{},'process'),before=maintenanceReport(withoutDecisions,{},'process');
 for(const name of [RBCW,AUTORACK]){
  const a=app(name),record=process.records.get(a.id).find(r=>r.raw===(name===RBCW?TRANSPORT:PUTAWAY));
  assert.deepEqual([record.valid,record.accepted,record.reason],[true,null,'In LeanIX, not in the Signavio list']);
  const unconfirmed=before.records.get(a.id).find(r=>r.raw===record.raw);
  assert.deepEqual([unconfirmed.valid,unconfirmed.accepted,unconfirmed.reason],[true,null,'In LeanIX, not in the Signavio list'],'it matches with or without the decision');
  assert(a.inLeanix.some(x=>x.raw===record.raw&&x.level===3),'listed as in LeanIX at Level 3');
  assert(a.accepted.some(d=>d.raw===record.raw),'the decision is still held on the application');
  assert.equal(model.issues.some(i=>i.appId===a.id&&i.value===record.raw),false,'not a model issue (record checks, similarity)');
  assert.equal(withoutDecisions.issues.some(i=>i.appId===a.id&&i.value===record.raw),true,'it was one before the decision');
  assert.equal(reviewIssues(model,process,a).some(i=>i.record===record.raw),false,'not in To review or the application detail');
  assert.equal(reviewItems(model).some(i=>i.raw===record.raw),false,'not in the review checklist');
  assert.equal(dataChecksForApp(model,a).checks.find(c=>c.dimension==='process'&&c.raw===record.raw),undefined,'not listed in Data checks');
  assert.deepEqual(maintenanceGapReasons(process,process,a,[3]),[],'no Level 3 gap: it matches');
 }
 // AUTO-RACK had no other process issue; RBCW's Level 0 / Level 1 are full through its matching L2 (fixed rule
 // 2026-10-23, V18.1). Neither has a process issue.
 assert.deepEqual(reviewIssues(model,process,app(AUTORACK)),[]);
 assert.deepEqual(reviewIssues(model,process,app(RBCW)),[]);
 // V19.1 union: the two decisions no longer change Process To review (23 → 21 until V19; now 11 with or without them),
 // and both records count as matching at Level 3 (55 → 67, Level 3 to review 18 → 8; see v18-1 and v17-5).
 assert.deepEqual([before.needsReview.length,process.needsReview.length],[11,11]);
 const [l3,l3Before]=[l3MaintenanceMetrics(process),l3MaintenanceMetrics(before)];
 assert.deepEqual([l3Before.quality.length,l3.quality.length],[67,67],'Level 3 matches standard does not change');
 for(const name of [RBCW,AUTORACK])assert(l3.quality.some(a=>a.id===app(name).id),`${name} matches at Level 3`);
 assert.deepEqual([l3Before.notPassing.length,l3.notPassing.length,l3.confirmed.length],[8,8,0]);
 // The similarity check no longer holds AUTO-RACK's pairs back for this record.
 assert.equal(model.issues.filter(i=>i.appId===app(AUTORACK).id).length,0);
 // The rule itself is unchanged for a record a confirmation still applies to: one without a level. RBCD LOG Xone's only
 // process issue is such a record; confirmed, it is no issue anywhere, it still does not match, and Xone leaves To review.
 const xone=app('RBCD LOG Xone'),XONE='BBM_O2C_OM_01 Schedule Agreement for Goods';
 const confirmed=buildModel({...data,acceptedRecords:[...data.acceptedRecords,{appId:xone.id,dimension:'process',raw:XONE,reviewer:'Owner decision',reason:'Test confirmation.',acceptedAt:'2026-10-23'}]});
 const report=maintenanceReport(confirmed,{},'process'),a=confirmed.apps.find(x=>x.id===xone.id),record=report.records.get(a.id).find(r=>r.raw===XONE);
 assert.deepEqual([record.level,record.valid,!!record.accepted,record.reason],[null,false,true,'Confirmed by owner as recorded']);
 assert.equal(confirmed.issues.some(i=>i.appId===a.id&&i.value===XONE),false,'not a model issue');
 assert.equal(model.issues.some(i=>i.appId===a.id&&i.value===XONE),true,'it was one before the decision');
 assert.deepEqual(reviewIssues(confirmed,report,a),[],'not in To review or the application detail');
 assert.deepEqual(reviewIssues(model,process,xone).map(i=>i.label),['Process level not specified'],'its only process issue before');
 assert.equal(reviewItems(confirmed).some(i=>i.raw===XONE),false,'not in the review checklist');
 assert.deepEqual(dataChecksForApp(confirmed,a).checks.find(c=>c.dimension==='process'&&c.raw===XONE).tags.map(t=>t.label),['Confirmed by owner as recorded']);
 assert.equal(report.needsReview.length,10,'Xone leaves Process To review');
 // A record without a level belongs to no level, so the Level 3 reason "Confirmed by owner as recorded (not in the
 // catalogue)" no longer arises (it did for the two records above until V19).
 assert(!maintenanceGapReasons(report,report,a).some(r=>/Confirmed by owner/.test(r)));
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
 // V19.1 union (owner 2026-10-23): the profile shows the confirmations except those of a process in LeanIX (it matches),
 // so the two bundled confirmations are no longer shown; a confirmation of a process without a level still is.
 assert(profile.includes('<p class="hint profile-confirmed">${confirmedShown.map(d=>esc(`${d.dimension===\'cap\'?\'Business Capability\':\'Process\'} · ${d.raw} — ${acceptedText(d)}`)).join(\'<br>\')}</p>'));
 const shownSource=profile.match(/const confirmedShown=(.+?);\n/)?.[1];
 assert(shownSource,'the profile filters the confirmations it shows');
 const confirmedShown=new Function('a',`return ${shownSource};`);
 for(const name of [RBCW,AUTORACK])assert.deepEqual(confirmedShown(app(name)),[],`${name}: its confirmation is not shown`);
 const xone=app('RBCD LOG Xone'),XONE='BBM_O2C_OM_01 Schedule Agreement for Goods';
 const confirmed=buildModel({...data,acceptedRecords:[...data.acceptedRecords,{appId:xone.id,dimension:'process',raw:XONE,reviewer:'Owner decision',reason:'Test confirmation.',acceptedAt:'2026-10-23'}]});
 assert.deepEqual(confirmedShown(confirmed.apps.find(a=>a.id===xone.id)).map(d=>d.raw),[XONE],'a confirmation of a process without a level is shown');
 const overview=readFileSync(new URL('../public/overview.mjs',import.meta.url),'utf8');
 // V17.3 (owner 2026-10-23): the Overview no longer shows the count of records confirmed as recorded.
 assert(!overview.includes('confirmed as recorded</small>'));
});

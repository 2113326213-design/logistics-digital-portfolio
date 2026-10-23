// V17.5: the five problems the 2026-10-23 audit confirmed (owner: "这 5 个问题全部修，做成 V17.5 发布"), each where a rule
// was applied in one place but not in another, or the same number differed between two places.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData,exportWorkspace,importWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';
import * as overview from '../public/overview.mjs';
// Read from the module namespace, so that code without the shared rule fails these tests instead of failing to load.
const {maintenanceReport,l3MaintenanceMetrics,applicationsNotPassingLevelQuality}=overview,applicationsToReviewAtLevel=(...args)=>{assert.equal(typeof overview.applicationsToReviewAtLevel,'function','one shared to-review rule');return overview.applicationsToReviewAtLevel(...args);};
import {dataChecksForApp,dataChecksSummary} from '../public/data-checks.mjs';
import {previewImport} from '../public/import-review.mjs';
import {recordImport} from '../public/application-history.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'))),model=buildModel(data);
const app=name=>model.apps.find(a=>a.Name===name);
const appJs=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('V17.5 (1): the plant table lists as many Level 3 applications to review as the summary card, for the total and every plant',()=>{
 const report=maintenanceReport(model,{},'process'),L3=group=>group.levels.find(l=>l.level===3);
 const card=l3MaintenanceMetrics(report).notPassing.map(a=>a.Name).sort();
 // V19.1 union (owner 2026-10-23): 18 -> 8. These 10 recorded Level 3 processes outside the Signavio list; they are in
 // LeanIX, so they now match at Level 3.
 assert.equal(card.length,8);
 for(const name of ['RBCD LOG Xone','RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','VMCN_iSCMP: Intelligent Supply Chain management platform'])
  assert(!card.includes(name)&&L3(report).valid.some(a=>a.id===app(name).id),`${name}: its Level 3 outside the Signavio list now matches`);
 assert.deepEqual(applicationsToReviewAtLevel(report,report,L3(report)).map(a=>a.Name).sort(),card);
 // Before V17.5 the plant table also listed the two applications whose records the owner confirmed (20 against 18).
 // V19.1 union: those two confirmed records are in LeanIX and now simply match, so no application is confirmed-only at
 // Level 3 any more and the plain "not passing" list equals the card. (A confirmation is now only possible for a record
 // without a level, which belongs to no level, so the confirmed-only case cannot arise at a level.)
 assert.deepEqual(l3MaintenanceMetrics(report).confirmed,[]);
 assert.deepEqual(applicationsNotPassingLevelQuality(report,L3(report)).map(a=>a.Name).sort(),card);
 assert(!card.includes('AUTO-RACK')&&!card.includes('RBCW Auto Warehouse Management System'));
 for(const name of ['AUTO-RACK','RBCW Auto Warehouse Management System'])assert(L3(report).valid.some(a=>a.id===app(name).id),`${name} matches at Level 3`);
 for(const plant of report.plants){
  const own=l3MaintenanceMetrics(maintenanceReport(model,{entity:plant.plant},'process')).notPassing.map(a=>a.id).sort();
  assert.deepEqual(applicationsToReviewAtLevel(report,plant,L3(plant)).map(a=>a.id).sort(),own,plant.plant);
 }
 assert(/const notPassing=applicationsToReviewAtLevel\(report,r,l\)/.test(readFileSync(new URL('../public/overview.mjs',import.meta.url),'utf8')),'the plant table uses the same rule');
});

test('V17.5 (2): an out-of-scope application gets no "Cost score 1 — Counted as ¥200,000 / year" check; an in-scope one still does',()=>{
 const tags=a=>dataChecksForApp(model,a).checks.flatMap(row=>row.tags.map(t=>t.label));
 assert(!tags(app('VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)')).includes('Cost score 1'));
 assert(tags(app('RBAC_ME_i-Warehouse')).includes('Cost score 1'));
});

test('V17.5 (3): a record the owner confirmed as recorded is listed in Data checks but not counted as to check',()=>{
 // V19.1 union (owner 2026-10-23): the two bundled confirmations (AUTO-RACK, RBCW Auto Warehouse) are of Level 3 records
 // that are in LeanIX, so the records now simply match: the confirmation is superseded and Data checks no longer list it.
 const auto=dataChecksForApp(model,app('AUTO-RACK'));
 assert(!auto.checks.some(row=>row.raw==='BBM PM I2D Putaway to Automated Warehouse L3V'),'a matching record is not listed');
 assert(!auto.checks.some(row=>row.primary),'no check line for it');
 assert.equal(auto.n,0);assert.equal(dataChecksSummary(auto),'0 to check · 1 mapped');
 const rbcw=dataChecksForApp(model,app('RBCW Auto Warehouse Management System'));
 assert(!rbcw.checks.some(row=>row.raw==='BBM PM I2D Transport Material Intra Plant L3'),'a matching record is not listed');
 assert.equal(rbcw.n,rbcw.checks.length,'every line left is one to check');
 // The rule itself is unchanged for the records a confirmation still applies to: a record without a level, confirmed by
 // the owner, is listed with its tag but is not counted as to check.
 const xone=app('RBCD LOG Xone'),raw='BBM_O2C_OM_01 Schedule Agreement for Goods';
 const before=dataChecksForApp(model,xone);
 const confirmedModel=buildModel({...data,acceptedRecords:[...data.acceptedRecords,{appId:xone.id,dimension:'process',raw,reviewer:'Owner decision',reason:'Test confirmation.',acceptedAt:'2026-10-23'}]});
 const after=dataChecksForApp(confirmedModel,confirmedModel.apps.find(a=>a.id===xone.id)),row=after.checks.find(r=>r.raw===raw);
 assert(before.checks.find(r=>r.raw===raw)?.tags.some(t=>t.label==='Process level not specified'),'unconfirmed: a line to check');
 assert(row?.tags.some(t=>t.label==='Confirmed by owner as recorded'),'confirmed: still listed');
 assert(!row.primary&&row.tags.every(t=>t.label==='Confirmed by owner as recorded'),'confirmed: no check line for it');
 assert.equal(after.n,before.n-1,'its confirmed record is not counted');
 assert.equal(after.n,after.checks.length-1);
});

test('V17.5 (4): importing a workspace backup keeps the release\'s owner decisions, as reopening kept work does',()=>{
 // A backup of the same data source from before the owner confirmed the two records (no acceptedRecords).
 const backup=exportWorkspace({...data,acceptedRecords:[]});
 const imported=mergeBundledCorrections(importWorkspace(backup),data).data;
 assert.deepEqual(imported.acceptedRecords,data.acceptedRecords);
 const preview=previewImport(data,imported,JSON.parse(backup).data);
 // V19.1 union (owner 2026-10-23): the two confirmed records are in LeanIX and match at Level 3 with or without the
 // decisions, so the Level 3 card no longer shows whether they were kept (18 until V19, now 8 either way).
 const next=buildModel(preview.next),without=buildModel(importWorkspace(backup));
 assert.equal(l3MaintenanceMetrics(maintenanceReport(next,{},'process')).notPassing.length,8);
 assert.equal(l3MaintenanceMetrics(maintenanceReport(without,{},'process')).notPassing.length,8);
 // The kept decisions still take effect: the confirmed records are held on the applications instead of being open
 // records of the model (so they stay out of the similarity check's pending records), as without the backup.
 for(const decision of data.acceptedRecords){
  const pending=m=>m.issues.some(i=>i.appId===decision.appId&&i.value===decision.raw);
  assert(next.apps.find(a=>a.id===decision.appId).accepted.some(d=>d.raw===decision.raw),`${decision.raw}: decision kept`);
  assert(!pending(next)&&!pending(model),`${decision.raw}: not an open record, as in the release`);
  assert(pending(without),`${decision.raw}: an open record when the decision is lost`);
 }
 assert(appJs.includes('next=mergeBundledCorrections(importWorkspace(text),initialData).data;'));
});

// V19: the page no longer adds BBM PM processes from LeanIX; History still records a process list update this way.
test('V17.5 (5): a process list update is recorded in History as a taxonomy update, not an inventory import',()=>{
 const applied=recordImport(data,{...data,localProcesses:[{id:'M.I2D.030.070.Laaaaaaaa',name:'Load Truck',level:3,parent:'M.I2D.030.070'}]},{inventoryFile:'',taxonomyFile:'export.xlsx (BBM PM processes not in the standard list)'});
 assert.equal(applied.importHistory.at(-1).kind,'taxonomy');
});

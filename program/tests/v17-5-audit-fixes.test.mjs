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
 assert.equal(card.length,18);
 assert.deepEqual(applicationsToReviewAtLevel(report,report,L3(report)).map(a=>a.Name).sort(),card);
 // Before: the plant table also listed the two applications whose records the owner confirmed (20).
 assert.equal(applicationsNotPassingLevelQuality(report,L3(report)).length,20);
 assert(!card.includes('AUTO-RACK')&&!card.includes('RBCW Auto Warehouse Management System'));
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
 const auto=dataChecksForApp(model,app('AUTO-RACK'));
 assert(auto.checks.some(row=>row.tags.some(t=>t.label==='Confirmed by owner as recorded')),'still listed');
 assert(!auto.checks.some(row=>row.primary),'no check line for it');
 assert.equal(auto.n,0);assert.equal(dataChecksSummary(auto),'0 to check · 1 mapped');
 const rbcw=dataChecksForApp(model,app('RBCW Auto Warehouse Management System'));
 assert.equal(rbcw.n,rbcw.checks.length-1,'its confirmed record is not counted');
});

test('V17.5 (4): importing a workspace backup keeps the release\'s owner decisions, as reopening kept work does',()=>{
 // A backup of the same data source from before the owner confirmed the two records (no acceptedRecords).
 const backup=exportWorkspace({...data,acceptedRecords:[]});
 const imported=mergeBundledCorrections(importWorkspace(backup),data).data;
 assert.deepEqual(imported.acceptedRecords,data.acceptedRecords);
 const preview=previewImport(data,imported,JSON.parse(backup).data);
 assert.equal(l3MaintenanceMetrics(maintenanceReport(buildModel(preview.next),{},'process')).notPassing.length,18);
 assert(appJs.includes('next=mergeBundledCorrections(importWorkspace(text),initialData).data;'));
});

// V19: the page no longer adds BBM PM processes from LeanIX; History still records a process list update this way.
test('V17.5 (5): a process list update is recorded in History as a taxonomy update, not an inventory import',()=>{
 const applied=recordImport(data,{...data,localProcesses:[{id:'M.I2D.030.070.Laaaaaaaa',name:'Load Truck',level:3,parent:'M.I2D.030.070'}]},{inventoryFile:'',taxonomyFile:'export.xlsx (BBM PM processes not in the standard list)'});
 assert.equal(applied.importHistory.at(-1).kind,'taxonomy');
});

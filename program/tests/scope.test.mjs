import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opportunityEligibility} from '../public/scope.mjs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {workspaceData,exportWorkspace,importWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';

const bundled=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));

test('the scope and status columns exclude only the five no-score and the three not still active applications',()=>{
 // V9.17 (owner workbook 20261021_logistic_inventory.xlsx): the scope column is 'with score or not' (column D of Logistic Apps_1021)
 // and 'Status in Oct' (column C) marks three applications that are not still active (owner decision 2026-10-21: not counted).
 assert.equal(bundled.apps.length,75);
 assert(bundled.apps.every(app=>app['Main Business Capability']&&/^Logistic Apps_1021!D\d+$/.test(app.scopeSource)&&/^Logistic Apps_1021!C\d+ \(Status in Oct\)$/.test(app.statusSource)));
 assert.equal(bundled.apps.filter(app=>opportunityEligibility(app).eligible).length,67);
 const excluded=bundled.apps.filter(app=>!opportunityEligibility(app).eligible);
 assert.deepEqual(excluded.filter(app=>app.scopeNote!=='with score').map(app=>app.scopeNote).sort(),[
  'no score, not go-live','no score, not go-live','no score,not BBM',
  'no score,not an application','no score,not an application'
 ].sort());
 assert.deepEqual(excluded.filter(app=>app.scopeNote==='with score').map(app=>[app.Name,app.statusNote]).sort(),[
  ['360° Supplier dashboard','owner changed to central'],['RBCW LOM Dashboard','phaseout'],['VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','endoflife']
 ]);
 assert(excluded.filter(app=>app.scopeNote!=='with score').every(app=>app.statusNote==='still active'),'the no-score applications are excluded by their scope note');
 assert.equal(opportunityEligibility({scopeNote:'Unverified note'}).eligible,true);
});

test('Excel import keeps unnamed column C and Main Business Capability by row and ID',()=>{
 const header=['ID','Type',null,'Division','Entity','Name','Display Name','Description','Lifecycle: Current Lifecycle','Lifecycle: Active','Lifecycle: End of Life','IT Owner','Application Manager','Responsible','Main Business Capability','Business Capabilities','Processes'];
 const first=['A','Application','no score, not go-live','PS','RBCE','Warehouse','','','active','','','','','','B.06 Logistics Management','B.06 Logistics Management',''];
 const second=['B','Application','with score','PS','RBCD','Live','','','active','','','','','','B.06 Logistics Management','B.06 Logistics Management',''];
 const apps=inventoryFromSheets({'Logistic Apps':[header,first,second],'Parameter Score':[['LeanIX ID','App operation cost'],['B','3']]});
 assert.deepEqual(apps.map(app=>[app.ID,app.scopeNote,app.scopeSource,app['Main Business Capability'],app.operationCostScore]),[
  ['A','no score, not go-live','Logistic Apps!C2','B.06 Logistics Management',null],
  ['B','with score','Logistic Apps!C3','B.06 Logistics Management',3]
 ]);
 assert.deepEqual(importWorkspace(exportWorkspace(bundled)).apps,bundled.apps);
});

test('old saved workspaces receive scope and main capability only for unchanged source rows',()=>{
 const old=structuredClone(bundled);
 for(const app of old.apps){delete app.scopeNote;delete app.scopeSource;delete app['Main Business Capability'];}
 old.apps[0].Name+=' edited';
 old.apps[1].scopeNote='Manual scope note';
 const merged=mergeBundledCorrections(old,bundled);
 assert.equal(merged.data.apps[0].scopeNote,undefined);
 assert.equal(merged.data.apps[0]['Main Business Capability'],undefined);
 assert.equal(merged.data.apps[1].scopeNote,'Manual scope note');
 assert.equal(merged.data.apps[1]['Main Business Capability'],bundled.apps[1]['Main Business Capability']);
 assert.equal(merged.data.apps[2].scopeNote,bundled.apps[2].scopeNote);
 assert.equal(merged.data.apps[2].scopeSource,bundled.apps[2].scopeSource);
 assert.equal(merged.changed,true);
});

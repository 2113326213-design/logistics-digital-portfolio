import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opportunityEligibility} from '../public/scope.mjs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {workspaceData,exportWorkspace,importWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';

const bundled=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));

test('source C markers exclude only the five explicit out-of-scope applications from opportunities',()=>{
 assert.equal(bundled.apps.length,76);
 assert(bundled.apps.every(app=>app['Main Business Capability']&&/^Logistic Apps!C\d+$/.test(app.scopeSource)));
 assert.equal(bundled.apps.filter(app=>opportunityEligibility(app).eligible).length,71);
 const excluded=bundled.apps.filter(app=>!opportunityEligibility(app).eligible);
 assert.deepEqual(excluded.map(app=>app.scopeNote).sort(),[
  'no score, not go-live','no score, not go-live','no score,not BBM',
  'no score,not an application','no score,not an application'
 ].sort());
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

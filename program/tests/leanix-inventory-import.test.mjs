// V9.16 (owner decision 2026-10-21): Import data accepts a LeanIX application export (display-name header, Type column,
// no Division / Entity, no cost sheet, a ReadMe sheet). Fields the export lacks are kept by ID; applications it does
// not list are kept and recorded in data.inventoryExport, shown in the profile and the import preview.
import {RECORDS_V916} from './records-v916.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {applyInventory,previewImport} from '../public/import-review.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {createWeightedSimilarity,portfolioCandidates,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {PRESERVED_KEYS} from '../scripts/prepare-data.mjs';

const bundled=()=>workspaceData(JSON.parse(readFileSync(RECORDS_V916)));
// The header row of the real export of 2026-10-20 (20261020_083736_UKj4Y_inventory.xlsx).
const HEADER=['ID','Type','Name','Display Name','Description','Lifecycle: Current Lifecycle','Lifecycle: Active','Lifecycle: End of Life','IT Owner of the Application','Application Manager Organization','Responsible: Application Manager(IT)','Main Business Capability','Business Capabilities','Processes','User Groups','Provided Interfaces','Consumed Interfaces','Application Basis','Business Criticality','Design Scope Level','IT Components','Open Source Software (OSS) - Relevance','Open Source Software (OSS) - Status','Third-Party Software - Relevance','Third-Party Software - Status'];
const row=(app,overrides={})=>{const r=Object.fromEntries(HEADER.map(h=>[h,'']));Object.assign(r,{ID:app.ID,Type:'Application',Name:app.Name,'Display Name':app.Name,Description:app.Description,'Lifecycle: Current Lifecycle':app['Lifecycle: Current Lifecycle'],'Lifecycle: Active':44228,'Main Business Capability':app['Main Business Capability'],'Business Capabilities':app['Business Capabilities'],Processes:app.Processes},overrides);return HEADER.map(h=>r[h]);};
const SHEET='bbm-cn log (Export 2026-10-20…';
const sheetsFor=(apps,overrides=[])=>({[SHEET]:[HEADER,...apps.map((app,i)=>row(app,overrides[i]||{}))],ReadMe:[['LeanIX inventory export created at: 2026-10-20 08:37:37 GMT'],null,['General notes'],['Column header','Type','Mandatory']]});

test('a LeanIX application export is read: display-name header, Type filter, ReadMe ignored, export time kept, serial dates converted',()=>{
 const [a,b]=bundled().apps;
 const sheets=sheetsFor([a,b]);
 sheets[SHEET].push(row({...b,ID:'proj-1',Name:'A project'},{Type:'Project'}));
 const apps=inventoryFromSheets(sheets);
 assert.equal(apps.length,2,'the Project row is not an application');
 assert.deepEqual(Object.keys(apps[0]).sort(),['Business Capabilities','Description','ID','Lifecycle: Active','Lifecycle: Current Lifecycle','Main Business Capability','Name','Processes'].sort());
 assert.equal(apps[0]['Lifecycle: Active'],'2021-02-01','Excel serial 44228');
 assert.deepEqual(apps.leanixExport,{exportedAt:'2026-10-20 08:37:37 GMT',sheet:SHEET});
 // The inventory workbook still needs its plant and business unit columns.
 assert.throws(()=>inventoryFromSheets({'Logistic Apps':[['ID','Name','Business Capabilities','Processes'],['x','X','','']]}),/应用清单缺少列：Division/);
});

test('applyInventory: fields the export lacks are kept by ID, unlisted applications are kept and recorded, a full workbook still replaces',()=>{
 const data=bundled(),[a,b]=data.apps;
 const incoming=inventoryFromSheets(sheetsFor([a,b],[{'Business Capabilities':'B.06.5 Material Flow Orchestration;B.06.5.1 Inbound Management and Receiving'},{}]));
 const next=applyInventory(data,incoming,'export.xlsx');
 assert.equal(next.apps.length,data.apps.length,'nothing is dropped');
 assert.deepEqual(next.apps.map(x=>x.ID),data.apps.map(x=>x.ID),'order is kept');
 const first=next.apps[0];
 assert.equal(first['Business Capabilities'],'B.06.5 Material Flow Orchestration;B.06.5.1 Inbound Management and Receiving');
 for(const key of ['Division','Entity','operationCostScore','operationCostSource','roiScore','roiSource'])assert.equal(first[key],a[key],key+' kept by ID');
 assert.deepEqual(next.apps.slice(2),data.apps.slice(2),'unlisted applications are unchanged');
 assert.equal(next.source,'export.xlsx');
 assert.deepEqual(next.inventoryExport,{file:'export.xlsx',exportedAt:'2026-10-20 08:37:37 GMT',sheet:SHEET,missingIds:data.apps.slice(2).map(x=>x.ID)});
 const preview=previewImport(data,next,next);
 assert.deepEqual([preview.added.length,preview.removed.length,preview.keptNotInExport,preview.hasChanges],[0,0,data.apps.length-2,true]);
 // A classic inventory workbook (Division / Entity present) is the full list: unlisted applications go, the record is cleared.
 const classic=[{ID:a.ID,Name:a.Name,Division:a.Division,Entity:a.Entity,'Business Capabilities':a['Business Capabilities'],Processes:a.Processes}];
 const full=applyInventory({...data,inventoryExport:next.inventoryExport},classic,'inventory.xlsx');
 assert.equal(full.apps.length,1);assert.equal(full.inventoryExport,undefined);
 assert.equal(workspaceData(full).inventoryExport,undefined);
 assert.deepEqual(workspaceData({...next,inventoryExport:{file:1,missingIds:[' x ','x',7,null]}}).inventoryExport,{file:'1',exportedAt:'',sheet:'',missingIds:['x','7']});
 assert(PRESERVED_KEYS.includes('inventoryExport'),'a rebuild from the workbooks keeps the record');
});

test('bundled data: the export of 2026-10-20 is applied, the five unlisted applications are kept, the owner decision and mappings hold',()=>{
 const data=bundled(),model=buildModel(data);
 assert.equal(data.source,'20261020_083736_UKj4Y_inventory.xlsx');
 assert.equal(data.apps.length,76);
 const kept=data.inventoryExport.missingIds.map(id=>model.apps.find(a=>a.id===id).Name).sort();
 assert.deepEqual(kept,['360° Supplier dashboard','CGQB_Logistic_system_Q','RBCW LOM Dashboard','RMM System (recovered 2025-12-19 10:03:58)','VM/LOG-Szh2_DAVIS']);
 assert.equal(data.inventoryExport.exportedAt,'2026-10-20 08:37:37 GMT');
 for(const name of kept){const app=model.apps.find(a=>a.Name===name);assert.equal(app.notInExport,data.inventoryExport,name);assert(app.operationCostScore!==null&&app.roiScore!==null,name+' keeps its cost and ROI');}
 assert.equal(model.apps.filter(a=>a.notInExport).length,5);
 const event=data.importHistory.at(-1);
 assert.equal(event.inventoryFile,'20261020_083736_UKj4Y_inventory.xlsx');
 assert.equal(new Set(event.changes.map(c=>c.appId)).size,35,'35 applications changed');
 assert.deepEqual(Object.fromEntries(Object.entries(event.changes.reduce((n,c)=>(n[c.field]=(n[c.field]||0)+1,n),{}))),{'Business Capabilities':35,Processes:2,'Lifecycle: Current Lifecycle':1},'BMLP Processes is unchanged after the owner decision');
 assert.equal(event.decisions?.length,1);
 const bmlp=model.apps.find(a=>a.Name==='BMLP_Nexeed_IAS@WxP');
 assert.doesNotMatch(bmlp.Processes,/Manufacturing/,'the owner decision of 2026-10-19 is kept');
 const states=correctionStates(data);
 assert.equal(states.filter(c=>c.state==='Needs review').length,0,'no mapping is left for re-confirmation');
 assert.equal(states.filter(c=>c.state==='Applied'&&/carried over/.test(c.reviewer)).length,5,'five mappings re-confirmed because only other fields of their applications changed');
 const rbcw=model.apps.find(a=>a.Name==='RBCW Auto Warehouse Management System');
 assert(rbcw.rawProcess.includes('BBM PM I2D Transport Material Intra Plant L3')&&rbcw.unmatched.includes('BBM PM I2D Transport Material Intra Plant L3'),'the new L3 that the catalogue cannot confirm stays open');
 assert.deepEqual([maintenanceReport(model,{},'cap').needsReview.length,maintenanceReport(model,{},'process').needsReview.length],[40,23]);
 const rows=portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights||DEFAULT_WEIGHTS));
 const score=(x,y)=>{const p=rows.pairs.find(p=>[p.target.app.Name,p.peer.app.Name].sort().join('|')===[x,y].sort().join('|'));return Math.round(p.coverage*1000)/10;};
 assert.equal(score('Control Tower','Physical Logistics Management System'),41.6);
 assert.equal(score('CGQB_Logistic_monitoring','Physical Logistics Management System'),71.7);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROCESS_POLICY,allowedProcess,processPolicyChanges} from '../public/process-policy.mjs';
import {workspaceData,mergeBundledCorrections,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {previewImport,applyInventory} from '../public/import-review.mjs';
import {buildModel} from '../public/model.mjs';
import {processIssues} from '../public/process-issues.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const original=JSON.parse(readFileSync(new URL('./fixtures/v21.1-process-records.json',import.meta.url),'utf8'));
const old=()=>{const saved={...data,apps:data.apps.map(a=>({...a,Processes:original[a.ID]??a.Processes}))};delete saved.processPolicy;return saved;};

test('V21.2: only a BBM PM prefix is accepted, with a token boundary',()=>{
 for(const record of ['BBM PM I2D Material Request L2',' bbm pm I2D Material Request L2 '])assert(allowedProcess(record),record);
 for(const record of ['BBM_SWS.P2F Plan to Fulfill','M.P2F.040.090 Plan to Supply Analytics and Reporting','ETAS.I2D.010.050.010 Putaway','BBM_P2S_LE_01 Production Replenishment','Something BBM PM I2D L3','BBM PMX I2D L3'])assert.equal(allowedProcess(record),false,record);
});

test('V21.2: the approved cleanup removes exactly 18 records on 7 applications',()=>{
 const before=old(),changes=processPolicyChanges({...before,processPolicy:PROCESS_POLICY}),next=workspaceData({...before,processPolicy:PROCESS_POLICY});
 assert.equal(changes.length,7);assert.equal(changes.reduce((n,c)=>n+c.removed.length,0),18);
 assert.deepEqual(next.apps,workspaceData(data).apps);assert.equal(next.apps.length,75);
 assert.deepEqual(next.capabilityRows,workspaceData(before).capabilityRows);assert.deepEqual(next.processRows,workspaceData(before).processRows);
 assert.deepEqual(next.importHistory,workspaceData(before).importHistory);assert.deepEqual(next.corrections,workspaceData(before).corrections);
 for(const app of before.apps){const after=next.apps.find(a=>a.ID===app.ID);for(const field of ['Name','Business Capabilities','Description','Lifecycle: Current Lifecycle'])assert.equal(after[field],app[field]);}
 assert.equal(next.apps.find(a=>a.Name.includes('(PESS)')).Processes.split(';').length,12);
 assert.equal(next.apps.find(a=>a.Name==='EDCN AWS').Processes.split(';').length,1);
 assert.equal(next.apps.find(a=>a.Name==='RBCC LOG Control Tower V2').Processes,'');
 for(const app of next.apps)for(const record of app.Processes.split(';').filter(Boolean))assert(allowedProcess(record));
 const model=buildModel(next),pess=model.apps.find(a=>a.Name.includes('(PESS)'));
 assert.deepEqual(processIssues(model,pess),[]);
});

test('V21.2: older saved workspaces are cleaned once and marked for saving',()=>{
 const result=mergeBundledCorrections(old(),data);assert.equal(result.changed,true);
 assert.equal(result.data.processPolicy,PROCESS_POLICY);assert.deepEqual(result.data.apps,workspaceData(data).apps);
 assert.equal(mergeBundledCorrections(result.data,data).changed,false);
 assert.deepEqual(importWorkspace(exportWorkspace(result.data)),result.data);
});

test('V21.2: inventory and older workspace imports keep the active rule and explain removals',()=>{
 const current=workspaceData(data),incoming=applyInventory(current,old().apps,'20261112_inventory.xlsx');
 for(const source of [incoming,old()]){
  const preview=previewImport(current,source);assert.equal(preview.next.processPolicy,PROCESS_POLICY);
  assert.equal(preview.ownerDecisions.length,7);assert.deepEqual(preview.next.apps,current.apps);
  assert(preview.ownerDecisions.every(d=>d.note.includes('BBM PM')));
 }
});

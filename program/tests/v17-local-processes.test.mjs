// V17 (owner decision 2026-10-23: "Signavio 标准为主，LeanIX 的 BBM PM 本地流程作为单独标注的一层加进流程目录，导入时先预览再
// Apply"): BBM PM processes that are not in the Signavio standard are a separate, marked layer of the process catalogue.
// V19 (owner decision 2026-10-23) removed the LeanIX comparison that added them; a layer already in saved work, a
// workspace backup or the server data is kept and used as before. These tests use such a layer directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel,processLookup} from '../public/model.mjs';
import {cleanLocalProcesses} from '../public/local-layer.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {previewImport} from '../public/import-review.mjs';
import {recordImport} from '../public/application-history.mjs';
import {createDataPackage,readDataPackage,applyDataPackage,dataPackageText} from '../public/data-package.mjs';
import {matchSource} from '../public/leanix-processes.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')),model=buildModel(data);
// The layer V17 made from a LeanIX export: two local Level 3 processes under standard Level 2 processes, a local Level 2
// under a standard Level 1 and a local Level 3 under that local Level 2.
const layer=[
 {id:'M.I2D.010.020.Lbbbbbbbb',name:'Special Truck Check',level:3,parent:'M.I2D.010.020'},
 {id:'M.I2D.030.070.Laaaaaaaa',name:'Load Truck',level:3,parent:'M.I2D.030.070'},
 {id:'M.I2D.030.Lcccccccc',name:'Local Area',level:2,parent:'M.I2D.030'},
 {id:'M.I2D.030.Lcccccccc.Ldddddddd',name:'Local Step',level:3,parent:'M.I2D.030.Lcccccccc'}];

test('V17: with the layer, the model marks local processes, keeps the hierarchy and matches application records — the standard still wins',()=>{
 assert.equal(cleanLocalProcesses(layer).length,4);
 const withLayer=buildModel({...data,localProcesses:layer});
 const truck=withLayer.procs.get('M.I2D.030.070.Laaaaaaaa');
 assert.deepEqual([truck.label,truck.local,truck.level,truck.chain],['Load Truck',true,3,'Intralogistics to Demand (I2D)']);
 assert(withLayer.procs.get('M.I2D.030.070').children.includes(truck.id));
 // Three applications record "BBM PM I2D Load Truck L3": unmatched before, matched to the local process now.
 const recorders=model.apps.filter(a=>a.unmatched.includes('BBM PM I2D Load Truck L3'));assert.equal(recorders.length,3);
 for(const a of recorders){const b=withLayer.apps.find(x=>x.id===a.id);assert(b.process.includes(truck.id));assert(!b.unmatched.includes('BBM PM I2D Load Truck L3'));assert(!withLayer.issues.some(i=>i.appId===a.id&&i.value==='BBM PM I2D Load Truck L3'));}
 assert.equal(withLayer.issues.length,model.issues.length-3);
 // The source of a local match says so.
 assert.match(matchSource(withLayer,truck.id,'name').sources[0],/BBM PM process, not in the standard list/);
 // A local process with a standard name never takes the standard's records.
 const clash=buildModel({...data,localProcesses:[{id:'M.I2D.010.Laaaaaaaa',name:'Pre-Processing',level:2,parent:'M.I2D.010'}]});
 assert.equal(processLookup(clash.procs)('BBM PM I2D Receive to Store L1').id,'M.I2D.010');
 assert.equal(processLookup(clash.procs)('BBM PM I2D Pre-Processing L2').id,'M.I2D.010.010');
});

test('V17: a layer is kept in saved work and in the data package (V19: the tool no longer adds one)',()=>{
 const next={...data,localProcesses:layer},preview=previewImport(data,next);
 assert.deepEqual([preview.taxonomyChanged,preview.hasChanges,preview.added.length,preview.removed.length],[true,true,0,0]);
 const applied=recordImport(data,preview.next,{inventoryFile:'',taxonomyFile:'workspace backup'});
 assert.equal(workspaceData(JSON.parse(JSON.stringify(applied))).localProcesses.length,4,'kept in a saved or exported workspace');
 assert.equal(workspaceData(data).localProcesses,undefined,'no layer, no field');
 // Invalid entries are dropped: an ID that is not its parent's ID + .L…, or a level outside 1–3.
 assert.deepEqual(cleanLocalProcesses([{id:'M.I2D.Lzzzzzzzz',name:'x',level:1,parent:'M.I2D'},{id:'M.I2D.010.Laaaaaaaa',name:'x',level:2,parent:'M.I2D'},{id:'M.I2D.Laaaaaaaa',name:'x',level:4,parent:'M.I2D'}]),[]);
 // The server data carries the layer; applying it gives it to the user.
 const pkg=readDataPackage(dataPackageText(applied));
 assert.equal(pkg.data.localProcesses.length,4);
 assert.equal(applyDataPackage(data,pkg).localProcesses.length,4);
 assert.equal(createDataPackage(data).data.localProcesses,undefined);
});

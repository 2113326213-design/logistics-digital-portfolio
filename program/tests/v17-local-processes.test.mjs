// V17 (owner decision 2026-10-23: "Signavio 标准为主，LeanIX 的 BBM PM 本地流程作为单独标注的一层加进流程目录，导入时先预览再
// Apply"): BBM PM processes of the LeanIX export that are not in the Signavio standard become a separate, marked layer of
// the process catalogue, under their LeanIX Parent, added only through the import preview. Synthetic exports in the
// layout of the saved view "BBM PM process".
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel,processLookup} from '../public/model.mjs';
import {readProcessLinks,localProcessesFrom,compareCatalogue} from '../public/leanix-process-check.mjs';
import {cleanLocalProcesses} from '../public/local-layer.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {previewImport} from '../public/import-review.mjs';
import {recordImport} from '../public/application-history.mjs';
import {createDataPackage,readDataPackage,applyDataPackage,dataPackageText} from '../public/data-package.mjs';
import {matchSource} from '../public/leanix-processes.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')),model=buildModel(data);
const KEYS=['id','type','name','displayName','description','processLifecycleStatus','relToParent','relProcessToApplication','fullName','updatedAt'];
const LABELS=['ID','Type','Name','Display Name','Description','Process Lifecycle Status','Parent','Applications','Full Name','Updated At'];
const record=(id,name,parent='',apps='')=>[id,'Process',name,name,'','',parent,apps,name,'2025-10-10'];
const links=records=>readProcessLinks({'BBM PM process (Export 2026-10-22 08_17)':[KEYS,LABELS,...records]});
const leanixName=n=>`BBM PM ${n.id.split('.')[1]} ${n.label.trim()} L${n.level}`;
const loading=model.procs.get('M.I2D.030.070'),dock=model.procs.get('M.I2D.010.020');
const sample=()=>links([
 record('aaaaaaaa-0000-0000-0000-000000000001','BBM PM I2D Load Truck L3',leanixName(loading),'AGR w/ Camera'),
 record('bbbbbbbb-0000-0000-0000-000000000002','BBM PM I2D Special Truck Check L3V',leanixName(dock)),
 record('cccccccc-0000-0000-0000-000000000003','BBM PM I2D Local Area L2',leanixName(model.procs.get('M.I2D.030'))),
 record('dddddddd-0000-0000-0000-000000000004','BBM PM I2D Local Step L3','BBM PM I2D Local Area L2'),
 record('eeeeeeee-0000-0000-0000-000000000005','BBM PM I2D Orphan Step L3'),
 record('ffffffff-0000-0000-0000-000000000006','BBM PM I2D Wrong Level L3',leanixName(model.procs.get('M.I2D'))),
 record('99999999-0000-0000-0000-000000000007','BBM PM O2C Cross Chain L3',leanixName(loading)),
 record('88888888-0000-0000-0000-000000000008',leanixName(loading),leanixName(model.procs.get('M.I2D.030'))),
 record('77777777-0000-0000-0000-000000000009','BBM_PPM_PM Project Management'),
 record('66666666-0000-0000-0000-000000000010','HC.Other L3',leanixName(loading))]);

test('V17: the local layer holds the BBM PM processes the Signavio standard lacks, under their LeanIX Parent, with the reason for the rest',()=>{
 const {added,skipped}=localProcessesFrom(data,sample());
 assert.deepEqual(added.map(p=>[p.id,p.name,p.level,p.parent]),[
  ['M.I2D.010.020.Lbbbbbbbb','Special Truck Check',3,'M.I2D.010.020'],
  ['M.I2D.030.070.Laaaaaaaa','Load Truck',3,'M.I2D.030.070'],
  ['M.I2D.030.Lcccccccc','Local Area',2,'M.I2D.030'],
  ['M.I2D.030.Lcccccccc.Ldddddddd','Local Step',3,'M.I2D.030.Lcccccccc']]);
 assert.deepEqual(skipped.map(s=>[s.name,s.reason]),[
  ['BBM PM I2D Orphan Step L3','No Parent in LeanIX.'],
  ['BBM PM I2D Wrong Level L3','Its LeanIX Parent is Level 0, not Level 2.'],
  ['BBM PM O2C Cross Chain L3','Its LeanIX Parent is in another process chain.']]);
 // A standard process, other naming and HC are never local.
 assert(!added.some(p=>/Loading|PPM|HC/.test(p.leanixName)));
 assert.equal(cleanLocalProcesses(added).length,4);
});

test('V17: with the layer, the model marks local processes, keeps the hierarchy and matches application records — the standard still wins',()=>{
 const {added}=localProcessesFrom(data,sample()),withLayer=buildModel({...data,localProcesses:added});
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

test('V17: the layer is added only through the import preview and Apply, kept in saved work and in the data package',()=>{
 const {added}=localProcessesFrom(data,sample()),next={...data,localProcesses:added};
 const preview=previewImport(data,next);
 assert.deepEqual([preview.taxonomyChanged,preview.hasChanges,preview.added.length,preview.removed.length],[true,true,0,0]);
 const applied=recordImport(data,preview.next,{inventoryFile:'export.xlsx (LeanIX local processes)',taxonomyFile:''});
 assert.equal(workspaceData(JSON.parse(JSON.stringify(applied))).localProcesses.length,4,'kept in a saved or exported workspace');
 assert.equal(workspaceData(data).localProcesses,undefined,'no layer, no field');
 // Invalid entries are dropped: an ID that is not its parent's ID + .L…, or a level outside 1–3.
 assert.deepEqual(cleanLocalProcesses([{id:'M.I2D.Lzzzzzzzz',name:'x',level:1,parent:'M.I2D'},{id:'M.I2D.010.Laaaaaaaa',name:'x',level:2,parent:'M.I2D'},{id:'M.I2D.Laaaaaaaa',name:'x',level:4,parent:'M.I2D'}]),[]);
 // The steward's package carries the layer; applying it gives it to the user.
 const pkg=readDataPackage(dataPackageText(applied));
 assert.equal(pkg.data.localProcesses.length,4);
 assert.equal(applyDataPackage(data,pkg).localProcesses.length,4);
 assert.equal(createDataPackage(data).data.localProcesses,undefined);
});

test('V17: the catalogue check counts LeanIX processes of the local layer apart and compares only the Signavio standard',()=>{
 const {added}=localProcessesFrom(data,sample()),withLayer=buildModel({...data,localProcesses:added});
 const before=compareCatalogue(model,sample(),{processRows:data.processRows}),after=compareCatalogue(withLayer,sample(),{processRows:data.processRows});
 assert.equal(after.counts.local,4);
 assert.equal(after.rows.length,before.rows.length,'the local layer is not part of the standard rows');
 assert(!after.rows.some(r=>/\.L[0-9a-f]{8}/.test(r.id)));
 assert(after.counts.notInCatalogue<before.counts.notInCatalogue);
});

test('V17: the page offers the layer as a preview from the process check and changes nothing before Apply',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=app.slice(app.indexOf('function previewLocalLayer('),app.indexOf('function showProcessCheck('));
 assert(fn.includes('previewImport(base,next)')&&fn.includes('pendingImport=')&&fn.includes('showImportPreview(')&&!/useData|autosave/.test(fn));
 assert(app.includes("local=localProcessesFrom(base,links)"));
 assert(app.includes("$('previewLocalLayer').onclick=()=>previewLocalLayer(local,check.file)"));
});

test('V17 review: a Parent name that two local processes share is not decided by row order — the child is not added',()=>{
 const area=n=>record(n,'BBM PM I2D Dup Area L2',leanixName(model.procs.get(n.startsWith('a1')?'M.I2D.010':'M.I2D.030')));
 const child=record('a3000000-0000-0000-0000-000000000003','BBM PM I2D Dup Child L3','BBM PM I2D Dup Area L2');
 for(const order of [[area('a1000000-0000-0000-0000-000000000001'),area('a2000000-0000-0000-0000-000000000002'),child],[area('a2000000-0000-0000-0000-000000000002'),area('a1000000-0000-0000-0000-000000000001'),child]]){
  const {added,skipped}=localProcessesFrom(data,links(order));
  assert.deepEqual(added.map(p=>p.id),['M.I2D.010.La1000000','M.I2D.030.La2000000']);
  assert.deepEqual(skipped.map(s=>[s.name,s.reason]),[['BBM PM I2D Dup Child L3','Its LeanIX Parent name is used by several local processes, so the Parent is not clear.']]);
 }
 // The same local process listed twice under the same Parent is one process, and its child is still added.
 const twice=[record('b1000000-0000-0000-0000-000000000001','BBM PM I2D One Area L2',leanixName(model.procs.get('M.I2D.030'))),record('b2000000-0000-0000-0000-000000000002','BBM PM I2D One Area L2',leanixName(model.procs.get('M.I2D.030'))),record('b3000000-0000-0000-0000-000000000003','BBM PM I2D One Child L3','BBM PM I2D One Area L2')];
 assert.deepEqual(localProcessesFrom(data,links(twice)).added.map(p=>p.id),['M.I2D.030.Lb1000000','M.I2D.030.Lb1000000.Lb3000000']);
});

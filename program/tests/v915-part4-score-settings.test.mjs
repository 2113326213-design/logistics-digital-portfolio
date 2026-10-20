// V9.15 part 4: the minimum score travels in the workspace backup with the weights, and the offline export
// reminder tells "changes not exported" apart from "export of the current version started".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,cp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {previewImport,importAppliedStatus} from '../public/import-review.mjs';
import {cleanThreshold,effectiveThreshold,keepThreshold,DEFAULT_THRESHOLD} from '../public/score-settings.mjs';
import {createOfflineAutosave,OFFLINE_SAVE_MESSAGES} from '../public/offline-save.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold} from '../public/weighted.mjs';
import {PRESERVED_KEYS} from '../scripts/prepare-data.mjs';
import {OFFLINE_FILE_NAME} from '../scripts/release.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const raw=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const data=workspaceData(raw);
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const roundTrip=workspace=>importWorkspace(exportWorkspace(workspace));
const file=(workspace,version=6)=>JSON.stringify({format:'logistics-portfolio-workspace',version,data:workspace});

test('a minimum score of 0 to 100 is valid; blanks, text and values outside the range are rejected',()=>{
 for(const [value,expected] of [[0,0],[100,100],[40,40],[34.5,34.5],['40',40],[' 0 ',0],['100',100],[-0,0]])assert.equal(cleanThreshold(value),expected,JSON.stringify(value));
 assert(Object.is(cleanThreshold(-0),0),'-0 is stored as 0');
 for(const value of [undefined,null,'','  ',-1,-0.1,100.1,101,NaN,Infinity,-Infinity,true,false,[],[40],{},'40abc','0x10','abc'])assert.equal(cleanThreshold(value),null,String(JSON.stringify(value)));
 assert.equal(DEFAULT_THRESHOLD,50);
 assert.equal(effectiveThreshold({similarityThreshold:0},60),0,'0 in the workspace is a value, not a missing field');
 assert.equal(effectiveThreshold({similarityThreshold:40},60),40,'the workspace wins over the saved page view');
 assert.equal(effectiveThreshold({},60),60,'a workspace without the field falls back to the saved view');
 assert.equal(effectiveThreshold({similarityThreshold:'bad'},'bad'),50,'nothing valid gives the default 50');
});

test('threshold 40, 0 and 100 round-trip through Export workspace and Import data with the weights',()=>{
 for(const threshold of [40,0,100]){
  const exported=JSON.parse(exportWorkspace({...data,similarityThreshold:threshold}));
  assert.equal(exported.version,6,'the format version is unchanged');
  assert.equal(exported.data.similarityThreshold,threshold,'the backup stores the threshold');
  assert.deepEqual(Object.keys(exported.data).slice(0,3),['similarityWeights','similarityWeightsVersion','similarityThreshold'],'stored next to the weights');
  const back=roundTrip({...data,similarityThreshold:threshold});
  assert.equal(back.similarityThreshold,threshold);
  assert.deepEqual(back.similarityWeights,data.similarityWeights);
 }
 const weighted=roundTrip({...data,similarityWeights:{name:.25,description:.25,cap:.25,process:.25},similarityThreshold:40});
 assert.deepEqual([weighted.similarityWeights,weighted.similarityThreshold],[{name:.25,description:.25,cap:.25,process:.25},40]);
});

test('an old backup without the field, or with an invalid value, imports without a threshold and without crashing',()=>{
 assert(!Object.hasOwn(importWorkspace(file(raw)),'similarityThreshold'),'version 6 backup made before V9.15');
 assert(!Object.hasOwn(importWorkspace(file({apps:raw.apps,capabilityRows:raw.capabilityRows,processRows:raw.processRows},1)),'similarityThreshold'),'version 1 backup');
 for(const value of [-5,101,'',null,'forty',true,[40]]){
  let imported;
  assert.doesNotThrow(()=>{imported=importWorkspace(file({...raw,similarityThreshold:value}));},JSON.stringify(value));
  assert(!Object.hasOwn(imported,'similarityThreshold'),`invalid ${JSON.stringify(value)} is ignored`);
 }
 assert(!Object.hasOwn(data,'similarityThreshold'),'the bundled data.json has no threshold, so the default or the current setting applies');
 assert(PRESERVED_KEYS.includes('similarityThreshold'),'prepare-data carries the threshold from a workspace export');
});

test('the import preview applies a backup threshold and keeps the current one for backups without it',()=>{
 const current={...data,similarityThreshold:60};
 const old=previewImport(current,importWorkspace(file(raw)));
 assert.equal(old.next.similarityThreshold,60,'old backup: the current setting is kept');
 assert.equal(old.hasChanges,false,'an identical old backup is not reported as a change');
 const same=previewImport(current,roundTrip(current));
 assert.equal(same.hasChanges,false);
 const forty=previewImport(current,roundTrip({...data,similarityThreshold:40}));
 assert.equal(forty.next.similarityThreshold,40,'the backup threshold is applied');
 assert.equal(forty.hasChanges,true,'a backup that only changes the minimum score can be applied');
 assert.equal(importAppliedStatus(forty,76),'Workspace updated; no application records changed.');
 const zero=previewImport(current,roundTrip({...data,similarityThreshold:0}));
 assert.deepEqual([zero.next.similarityThreshold,zero.hasChanges],[0,true],'0 replaces the current setting');
 assert.equal(previewImport(data,importWorkspace(file(raw))).next.similarityThreshold,undefined,'no setting anywhere: nothing is invented');
 assert.deepEqual(keepThreshold({similarityThreshold:0},{}),{similarityThreshold:0});
 assert.deepEqual(keepThreshold({similarityThreshold:70},{similarityThreshold:100}),{similarityThreshold:100});
});

// A small DOM double, as in the V9.14 tests.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,textContent:'',
  classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},
  fire(type,event){for(const listener of this.listeners.get(type)||[])listener(event);},
  setAttribute(){},querySelectorAll(){return [];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},
  showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function withUI(initial,run){
 const previous=globalThis.document,document=stubDocument(),changes=[];
 let current=initial,model=buildModel(current);
 globalThis.document=document;
 try{
  const ui=createComparisonUI({getModel:()=>model,getData:()=>current,escape:esc,isSignedIn:()=>true,onApp(){},onThresholdChange:value=>changes.push(value)});
  ui.showPortfolio();
  // Import data: app.js useData replaces the data and the model, then render() refreshes the comparison.
  const load=next=>{current=workspaceData(next);model=buildModel(current);ui.refresh();};
  const shown=()=>({input:document.getElementById('portfolioThreshold').value,stats:document.getElementById('portfolioStats').innerHTML});
  const submit=value=>{document.getElementById('portfolioThreshold').value=value;document.getElementById('portfolioThresholdForm').onsubmit({preventDefault(){}});};
  run({ui,document,load,shown,submit,changes});
 }finally{globalThis.document=previous;}
}
const pairsAt=threshold=>portfolioAtThreshold(portfolioCandidates(createWeightedSimilarity(buildModel(data),data.similarityWeights)),threshold).pairCount;
const stats=threshold=>{const n=pairsAt(threshold);return `<h3>${n} ${n===1?'pair':'pairs'} to review · Score ${threshold} or above</h3>`;};

test('after an import, the backup threshold drives the form and the candidate list, even if the saved view says otherwise',()=>withUI(data,({ui,load,shown,changes})=>{
 assert.notEqual(pairsAt(40),pairsAt(60),'the two thresholds give different candidate counts');
 ui.restoreState({...ui.getState(),similarityThreshold:60});
 assert.deepEqual(shown(),{input:'60',stats:stats(60)},'before the import: the saved view applies (no workspace value)');
 const oldView=ui.getState();
 load(roundTrip({...data,similarityThreshold:40}));
 assert.deepEqual(shown(),{input:'40',stats:stats(40)},'the imported value is used right away');
 assert.equal(ui.getState().similarityThreshold,40);
 ui.restoreState(oldView);
 assert.deepEqual(shown(),{input:'40',stats:stats(40)},'an older saved view does not override the backup');
 assert.deepEqual(changes,[],'loading a backup is not reported as a new user change');
}));

test('an old backup keeps the current setting; with no valid setting the default 50 applies',()=>{
 withUI(data,({ui,load,shown})=>{
  ui.restoreState({...ui.getState(),similarityThreshold:60});
  load(importWorkspace(file(raw)));
  assert.deepEqual(shown(),{input:'60',stats:stats(60)},'old backup: the current effective setting stays');
  load(importWorkspace(file({...raw,similarityThreshold:'bad'})));
  assert.equal(shown().input,'60','an invalid value in a backup is ignored');
 });
 withUI(data,({ui,load,shown})=>{
  load(importWorkspace(file(raw)));
  assert.deepEqual(shown(),{input:'50',stats:stats(50)},'nothing set: default 50');
  ui.restoreState({...ui.getState(),similarityThreshold:250});
  assert.equal(shown().input,'50','an invalid saved view falls back to 50');
 });
 withUI({...data,similarityThreshold:0},({ui,shown})=>{
  assert.deepEqual(shown(),{input:'0',stats:stats(0)},'0 from the workspace is applied, not treated as missing');
  ui.restoreState({...ui.getState(),similarityThreshold:70});
  assert.equal(shown().input,'0','workspace data wins on reload');
 });
 withUI({...data,similarityThreshold:100},({shown})=>assert.deepEqual(shown(),{input:'100',stats:stats(100)}));
});

test('Score settings accepts 0 and 100, rejects invalid entries and reports each change for the backup',()=>withUI(data,({document,shown,submit,changes})=>{
 submit('0');assert.deepEqual(shown(),{input:'0',stats:stats(0)});
 submit('100');assert.deepEqual(shown(),{input:'100',stats:stats(100)});
 submit('40');assert.equal(shown().input,'40');
 assert.deepEqual(changes,[0,100,40]);
 for(const value of ['','-1','101','abc']){
  submit(value);
  assert.equal(document.getElementById('portfolioStats').textContent,'Enter a minimum score from 0 to 100.',JSON.stringify(value));
 }
 assert.deepEqual(changes,[0,100,40],'rejected entries change nothing');
 const review=document.getElementById('similarityReview');
 review.fire('click',{target:{closest:()=>({dataset:{},hasAttribute:name=>name==='data-reset-threshold'})}});
 assert.deepEqual(shown(),{input:'50',stats:stats(50)});
 assert.deepEqual(changes,[0,100,40,50],'Reset threshold is a change for the backup as well');
}));

// app.js handlers as written: Export workspace, storing the threshold, and the offline save adapter.
function appHarness({admin=true,threshold=40,failExport=false,initial=data}={}){
 const lines=appSource.split('\n'),pick=prefix=>{const line=lines.find(l=>l.trim().startsWith(prefix));assert(line,prefix);return line;};
 const code=[pick('function downloadWorkspace('),pick("$('exportOpen').onclick="),pick('function storeThreshold(')].join('\n');
 const elements={},$=id=>elements[id]??={textContent:'',onclick:null};
 const files=[],names=[];
 const autosave=createOfflineAutosave({onStatus:status=>{elements.status=status;},onNotice:message=>{$('sessionStatus').textContent=message;}});
 const context={$,english:value=>value,exportWorkspace:workspace=>{if(failExport)throw Error('disk full');return exportWorkspace(workspace);},data:initial,isAdmin:()=>admin,autosave,comparison:{getState:()=>({similarityThreshold:threshold})},
  Blob:class{constructor(chunks){files.push(chunks.join(''));}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL(){}},setTimeout:()=>0,Date,
  document:{createElement:()=>({click(){},remove(){},set download(name){names.push(name);this.name=name;},get download(){return this.name;}}),body:{append(){}}}};
 runInNewContext(`${code}\nglobalThis.store=storeThreshold;globalThis.current=()=>data;`,context);
 return {context,elements,files,names,autosave,exportNow:()=>elements.exportOpen.onclick(),store:value=>context.store(value),current:()=>context.current()};
}

test('app.js stores the threshold in the workspace and Export workspace includes the threshold in use',()=>{
 assert(appSource.split('\n').some(line=>line.startsWith('const comparison=createComparisonUI({')&&line.endsWith(',onThresholdChange:storeThreshold});')),'createComparisonUI reports threshold changes to app.js');
 const h=appHarness({threshold:40});
 h.exportNow();
 assert.equal(h.files.length,1);
 assert.equal(JSON.parse(h.files[0]).data.similarityThreshold,40,'the backup carries the threshold shown in Score settings, also when it came from the saved view');
 assert.match(h.names[0],/^logistics-workspace-\d{4}-\d{2}-\d{2}\.json$/);
 h.store(40);assert.equal(h.current().similarityThreshold,40);assert.equal(h.autosave.exportState(),'unsaved');
 const before=h.current();h.store(40);assert.equal(h.current(),before,'the same value is not a new change');
 const viewer=appHarness({admin:false});viewer.store(30);
 assert.equal(viewer.current().similarityThreshold,undefined,'signed-out viewers keep it in the page view only, like the weights');
 assert.equal(viewer.autosave.exportState(),'clean');
});

test('export status: changes not exported → export started → not exported again; it never claims the file was saved',()=>{
 const h=appHarness({threshold:45});
 assert.equal(h.autosave.exportState(),'clean');assert.equal(h.autosave.hasUnsaved(),false);
 h.store(45);
 assert.equal(h.autosave.exportState(),'unsaved');
 assert.equal(h.elements.sessionStatus.textContent,OFFLINE_SAVE_MESSAGES.unsaved);
 assert.equal(h.elements.status.message,OFFLINE_SAVE_MESSAGES.unsaved);
 assert.equal(h.autosave.hasUnsaved(),true);
 h.exportNow();
 assert.equal(h.autosave.exportState(),'exportStarted');
 assert.equal(h.elements.sessionStatus.textContent,OFFLINE_SAVE_MESSAGES.exportStarted);
 assert.equal(h.elements.status.message,OFFLINE_SAVE_MESSAGES.exportStarted);
 assert.equal(h.autosave.hasUnsaved(),true,'a started download does not cancel the leave warning');
 h.store(55);
 assert.equal(h.autosave.exportState(),'unsaved','a further change asks for a new export');
 assert.equal(h.elements.sessionStatus.textContent,OFFLINE_SAVE_MESSAGES.unsaved);
 h.autosave.schedule();h.exportNow();h.autosave.schedule();
 assert.equal(h.autosave.exportState(),'unsaved','any data change after an export (weights, reviews, imports) reminds again');
 for(const message of Object.values(OFFLINE_SAVE_MESSAGES))assert.doesNotMatch(message,/\bsaved\b|success|Workspace exported/i,message);
 assert.match(OFFLINE_SAVE_MESSAGES.unsaved,/^Changes not exported\./);
 assert.match(OFFLINE_SAVE_MESSAGES.exportStarted,/^Export of the current version started\./);
 for(const message of [OFFLINE_SAVE_MESSAGES.unsaved,OFFLINE_SAVE_MESSAGES.exportStarted])assert.match(message,/To restore, reopen this file and use Import data/);
 // A failed export is not reported as started.
 const failed=appHarness({failExport:true});failed.store(30);failed.exportNow();
 assert.equal(failed.autosave.exportState(),'unsaved');
 assert.equal(failed.elements.sessionStatus.textContent,'Export failed: disk full');
});

test('the hosted export message says the download started and does not claim success',()=>{
 const line=appSource.split('\n').find(l=>l.trim().startsWith('function downloadWorkspace('));
 assert.doesNotMatch(line,/Workspace exported\.|saved successfully/);
 const h=appHarness();
 const hosted={...h.context,autosave:{schedule(){}}};
 runInNewContext(`${line}\nglobalThis.ok=downloadWorkspace(data,'logistics-workspace-');`,hosted);
 assert.equal(hosted.ok,true);
 assert.match(h.elements.sessionStatus.textContent,/^Export started\. Check your downloads for logistics-workspace-\d{4}-\d{2}-\d{2}\.json\.$/);
});

test('the offline file uses the shared save adapter and its messages',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'logistics-part4-'));
 try{
  await cp(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  execFileSync(process.execPath,[path.join(root,'scripts/export-offline.mjs')],{cwd:dir,stdio:'pipe'});
  const html=await readFile(path.join(dir,'outputs',OFFLINE_FILE_NAME),'utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  for(const message of Object.values(OFFLINE_SAVE_MESSAGES))assert(script.includes(message),message);
  assert(!script.includes('Workspace exported.')&&!script.includes('Offline changes: export workspace to keep a backup.'),'the old messages are gone');
  assert.match(script,/exportStarted/);
  assert.doesNotMatch(script,/\bfetch\b/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

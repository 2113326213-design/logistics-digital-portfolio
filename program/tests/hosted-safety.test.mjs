// Hosted build data safety: the save-conflict dialog and the autosave size warning
// (audit 2026-10-15 items 14, 15). Sign-in expiry and the offline edition are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createAutosave,autosaveLimitBytes} from '../public/autosave.mjs';
import {workspaceData} from '../public/workspace.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const saved=revision=>reply({revision,updatedAt:'2026-10-16T01:00:00Z'});
function client(request,initial=data){let current=initial,status;const autosave=createAutosave({getData:()=>current,onRestore:next=>{current=next;},onStatus:s=>{status=s;},request,requestTimeoutMs:200});return {autosave,get status(){return status;},set data(next){current=next;}};}

// The owner deferred the session-expiry notice/backup proposal (README 2026-10-13), so sign-in
// expiry keeps its original behaviour; only the conflict dialog and size warning changed.
test('sign-in expiry keeps the original messages and leaves unsaved changes pending',async()=>{
 let signedOut=false;
 const s=client(async(_,options)=>signedOut?reply({error:'Sign in to save changes.'},401):options.method==='PUT'?saved(2):reply({data:null,revision:1}));
 assert(await s.autosave.load());signedOut=true;
 s.data={...data,source:'local-edit.xlsx'};s.autosave.schedule();await s.autosave.flush();
 assert.equal(s.status.kind,'signin');assert.equal(s.status.message,'Sign in to save changes.');
 assert(s.autosave.hasUnsaved());assert.equal(s.autosave.isSignedIn(),false);
 await s.autosave.retry();
 assert.equal(s.status.kind,'signin');assert.equal(s.status.message,'Sign in to save changes.');assert(s.autosave.hasUnsaved());
 s.autosave.schedule();assert.equal(s.status.message,'Sign in to save changes.','saving stays blocked after a 401, as before');
 const fresh=client(async()=>reply({error:'Sign in to save changes.'},401));
 assert.equal(await fresh.autosave.load(),false);fresh.autosave.schedule();assert.equal(fresh.status.message,'Not saved. Sign in or export a backup.');
});

test('signed-out visibility is unchanged and the size warning shows the save bar for signed-in users',()=>{
 const code=app.match(/^function syncAdmin\([\s\S]*?\n\}\n/m)[0];
 const render=({admin,kind})=>{const elements={},$=id=>elements[id]??={hidden:true,textContent:'',title:''};runInNewContext(`${code};syncAdmin(kind,'Status message');`,{$,kind,document:{body:{classList:{toggle(){}}}},isAdmin:()=>admin,autosave:{hasUnsaved:()=>true},localAdmin:false,model:null,comparison:{refresh(){}}});return elements;};
 let ui=render({admin:false,kind:'signin'});
 assert.equal(ui.exportOpen.hidden,true);assert.equal(ui.importOpen.hidden,true);assert.equal(ui.saveBar.hidden,true);assert.equal(ui.accountStatus.textContent,'');
 ui=render({admin:false,kind:'error'});assert.equal(ui.accountStatus.textContent,'Unavailable');assert.equal(ui.accountRetry.hidden,false);assert.equal(ui.exportOpen.hidden,true);
 ui=render({admin:true,kind:'warning'});assert.equal(ui.saveBar.hidden,false);assert.equal(ui.accountStatus.textContent,'Saved');assert.equal(ui.accountStatus.title,'Status message');
 ui=render({admin:true,kind:'saved'});assert.equal(ui.saveBar.hidden,true);assert.equal(ui.exportOpen.hidden,false);
});

test('the save-conflict dialog warns that Keep my changes replaces the other tab and offers exports first',()=>{
 const dialog=html.match(/<dialog id="saveRecovery"[\s\S]*?<\/dialog>/)[0];
 assert.match(dialog,/Keep my changes replaces the version saved in the other tab\. That version cannot be recovered afterwards\./);
 const buttons=[...dialog.matchAll(/<button id="(\w+)"/g)].map(m=>m[1]);
 for(const id of ['recoveryExport','recoveryExportSaved'])assert(buttons.indexOf(id)>=0&&buttons.indexOf(id)<buttons.indexOf('recoveryLocal'),`${id} is offered before Keep my changes`);
 assert.match(app,/\$\('recoveryExport'\)\.onclick=\(\)=>\$\('exportOpen'\)\.click\(\);/);
 assert.match(app,/\$\('recoveryExportSaved'\)\.onclick=\(\)=>\{if\(recoveryRemote\)downloadWorkspace\(recoveryRemote\.data,/);
});

test('Export saved version downloads the other tab\'s saved workspace, not this tab\'s changes',async()=>{
 const {exportWorkspace}=await import('../public/workspace.mjs');
 const lines=app.split('\n'),start=lines.findIndex(line=>line.startsWith('let recoveryRemote=null;')),end=lines.findIndex(line=>line.startsWith("$('recoveryExportSaved').onclick="));
 const download=lines.find(line=>line.trim().startsWith('function downloadWorkspace('));
 assert(start>=0&&end>start&&download,'recovery handlers and downloadWorkspace found');
 const elements={},$=id=>elements[id]??={open:false,innerHTML:'',textContent:'',showModal(){this.open=true;},close(){this.open=false;},click(){}};
 const parts=[],names=[];
 const context={$,esc:value=>String(value??''),english:value=>value,exportWorkspace,data:{...data,source:'local-edit.xlsx'},Blob:class{constructor(chunks){parts.push(chunks.join(''));}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL(){}},setTimeout:()=>0,document:{createElement:()=>({click(){},remove(){},set download(name){names.push(name);}}),body:{append(){}}}};
 runInNewContext(`${lines.slice(start,end+1).join('\n')}\n${download}\nshowRecovery({data:remoteData});$('recoveryExportSaved').onclick();`,{...context,remoteData:{...data,source:'other-tab.xlsx'}});
 assert.equal(parts.length,1);assert.equal(JSON.parse(parts[0]).data.source,'other-tab.xlsx');
 assert.match(names[0],/^logistics-workspace-saved-version-\d{4}-\d{2}-\d{2}\.json$/);
});

test('offline export anchors in app.js stay exact and unique',()=>{
 assert.equal(app.split('autosave=createAutosave({').length-1,1);
 assert.equal([...app.matchAll(/const localAdmin=.*?;/g)].length,1);
 assert.equal(app.split("'Admin preview'").length-1,1);
});

test('autosave warns near the size limit and recommends Export workspace',async()=>{
 const s=client(async(_,options)=>options.method==='PUT'?saved(2):reply({data:null,revision:1}));
 await s.autosave.load();s.data={...data,source:'normal.xlsx'};s.autosave.schedule();await s.autosave.flush();assert.equal(s.status.kind,'saved');
 s.data={...data,source:'x'.repeat(Math.round(autosaveLimitBytes*.75))};s.autosave.schedule();await s.autosave.flush();
 assert.equal(s.status.kind,'warning');assert.match(s.status.message,/^Saved · .+\. Workspace is \d+\.\d\d MB, close to the 1\.5 MB autosave limit\. Export workspace to keep a backup\.$/);
 assert(!s.autosave.hasUnsaved(),'the warning is shown after a successful save');
 const restored=client(async()=>reply({data:{...data,source:'y'.repeat(Math.round(autosaveLimitBytes*.75))},revision:3}));
 await restored.autosave.load();assert.equal(restored.status.kind,'warning');assert.match(restored.status.message,/^Saved workspace restored\. Workspace is/);
});

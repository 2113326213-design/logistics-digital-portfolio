// V11 (owner request 2026-10-22): changes are kept in this browser on this computer, the To review list exports to
// CSV for Excel, and a link opens one application's details.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOfflineAutosave,readKeptWork,keptWorkText,LOCAL_SAVE_KEY,LOCAL_SAVE_MESSAGES,OFFLINE_SAVE_MESSAGES} from '../public/offline-save.mjs';
import {workspaceData,importWorkspace} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {toReviewRows,toReviewCSV,toReviewFileName} from '../public/to-review-export.mjs';
import {appFromSearch,searchWithApp,appLink} from '../public/view-route.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const model=buildModel(data);
const source=file=>readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
const memory=()=>{const m=new Map();return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));},removeItem:k=>{m.delete(k);}};};
const adapter=(options={})=>{const log={status:[],notices:[],restored:null};let current=options.data||data;
 const autosave=createOfflineAutosave({getData:()=>current,onRestore:next=>{log.restored=next;current=next;},onStatus:s=>log.status.push(s.message),onNotice:m=>log.notices.push(m),release:'V11',delay:60000,...options});
 return {autosave,log,set:next=>{current=next;}};};

test('a change is kept in this browser; leaving then needs no warning',()=>{
 const storage=memory(),{autosave,log,set}=adapter({storage});
 set({...data,similarityThreshold:45});autosave.schedule();
 assert.equal(storage.m.has(LOCAL_SAVE_KEY),false,'kept after a short pause, not on every keystroke');
 assert.equal(autosave.hasUnsaved(),false,'leaving keeps the pending change first');
 const kept=JSON.parse(storage.m.get(LOCAL_SAVE_KEY));
 assert.deepEqual([kept.version,kept.release,kept.source],[1,'V11','20261021_logistic_inventory.xlsx']);
 assert.equal(importWorkspace(kept.workspace).similarityThreshold,45);
 assert.equal(importWorkspace(kept.workspace).apps.length,75);
 assert.equal(autosave.exportState(),'kept');
 assert.equal(log.status.at(-1),LOCAL_SAVE_MESSAGES.kept);
 assert.match(LOCAL_SAVE_MESSAGES.kept,/^Changes are kept in this browser on this computer\. Export workspace to back them up or to share them\.$/);
 // An export started from a kept state still names the export.
 autosave.exportStarted();assert.equal(autosave.exportState(),'exportStarted');assert.equal(log.notices.at(-1),OFFLINE_SAVE_MESSAGES.exportStarted);
});

test('when the browser refuses to keep the work, the earlier rules apply: not exported, leave warning',()=>{
 const storage={...memory(),setItem:()=>{throw Error('QuotaExceededError');}};
 const {autosave,log}=adapter({storage});
 autosave.schedule();autosave.flush();
 assert.equal(autosave.exportState(),'unsaved');
 assert.equal(log.notices.at(-1),OFFLINE_SAVE_MESSAGES.unsaved);
 assert.equal(autosave.hasUnsaved(),true);
 const none=adapter({storage:null});none.autosave.schedule();
 assert.deepEqual([none.autosave.exportState(),none.log.notices.at(-1),none.autosave.hasUnsaved()],['unsaved',OFFLINE_SAVE_MESSAGES.unsaved,true]);
});

test('on opening: kept work that differs from the file asks; continue restores it, starting fresh deletes it',async()=>{
 const storage=memory(),first=adapter({storage});
 first.set({...data,similarityThreshold:35});first.autosave.schedule();first.autosave.flush();
 // Same release, same data as kept: nothing to ask.
 const same=adapter({storage,data:importWorkspace(storage.m.get(LOCAL_SAVE_KEY)&&JSON.parse(storage.m.get(LOCAL_SAVE_KEY)).workspace),choose:()=>{throw Error('must not ask');}});
 assert.equal(await same.autosave.load(),false);
 let asked=null;
 const resume=adapter({storage,choose:async(kept,info)=>{asked={kept,info};return 'continue';}});
 assert.equal(await resume.autosave.load(),true);
 assert.deepEqual(asked.info,{release:'V11',source:'20261021_logistic_inventory.xlsx',dataAsOf:'2026-10-21'},'V14: with the date of the data in this file');
 assert.equal(resume.log.restored.similarityThreshold,35);
 assert.equal(resume.autosave.exportState(),'clean','continuing is not a new change');
 const fresh=adapter({storage,choose:async()=>'fresh'});
 assert.equal(await fresh.autosave.load(),false);
 assert.equal(storage.m.has(LOCAL_SAVE_KEY),false);assert.equal(fresh.log.restored,null);
 assert.equal(await adapter({storage,choose:()=>{throw Error('nothing kept');}}).autosave.load(),false);
 // Unreadable kept work is removed, never shown.
 storage.setItem(LOCAL_SAVE_KEY,'{not json');assert.equal(readKeptWork(storage),null);assert.equal(storage.m.has(LOCAL_SAVE_KEY),false);
});

// V18.1: the page shows no version number (owner decision 2026-10-23); the release is compared but not named.
test('the restore question says when the work was kept and warns when the file is another release, without a version number',()=>{
 const kept={savedAt:'2026-10-22T03:15:00.000Z',release:'V11',source:'20261021_logistic_inventory.xlsx'};
 const same=keptWorkText(kept,{release:'V11',source:'20261021_logistic_inventory.xlsx'});
 assert.match(same.text,/^This browser keeps work from .*2026.* \(data from 20261021_logistic_inventory\.xlsx\)\. Continue it, or start from the data in this file and delete the kept work\.$/);
 assert.equal(same.warning,'');
 const newer=keptWorkText(kept,{release:'V12',source:'20261201_logistic_inventory.xlsx'});
 assert.equal(newer.warning,'This file is another version of the tool, with data from 20261201_logistic_inventory.xlsx. Continuing keeps your earlier data and changes; the data in this file may be newer. Export the kept work first if you are unsure.');
 const html=source('index.html');
 for(const id of ['localRestore','localRestoreText','localRestoreWarning','localRestoreExport','localRestoreFresh','localRestoreContinue'])assert(html.includes(`id="${id}"`),id);
 assert(readFileSync(new URL('../scripts/export-offline.mjs',import.meta.url),'utf8').includes("`autosave=createOfflineAutosave({release:${JSON.stringify(RELEASE_VERSION.toUpperCase())},`"));
});

test('To review exports every open issue of the filtered applications, one row per issue, for Excel',()=>{
 const rows=toReviewRows(model,{});
 const cap=maintenanceReport(model,{},'cap'),process=maintenanceReport(model,{},'process');
 const expected=[...cap.needsReview.map(a=>cap.issues.get(a.id).length),...process.needsReview.map(a=>process.issues.get(a.id).length)].reduce((x,y)=>x+y,0);
 assert.equal(rows.length,expected);
 // V19.1 union (owner 2026-10-23): Process 21 -> 11 applications. 9 applications whose only process issues were records
 // with a level outside the Signavio list or the name difference (and the unrecorded levels those records now cover;
 // VM-CN_WACOS_Szh5 had both kinds) and RBAC_ME_Szh5
 // Intralogistics control system, whose only issue was "Process name differs between sources" (no longer produced).
 // Business Capability is unchanged.
 assert.deepEqual([new Set(rows.filter(r=>r.dimension==='Business Capability').map(r=>r.appId)).size,new Set(rows.filter(r=>r.dimension==='Process').map(r=>r.appId)).size],[39,11]);
 const processRows=rows.filter(r=>r.dimension==='Process');
 for(const name of ['RBAC_ME_Szh5 Intralogistics control system','RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','VMCN_iSCMP: Intelligent Supply Chain management platform'])
  assert(!processRows.some(r=>r.application===name),`${name}: no process row`);
 // No row for a process recorded with a level (it is in LeanIX and matches) and no name-difference row; a process record
 // without a level is still exported (RBCD LOG Xone).
 const inLeanix=new Map(model.apps.map(a=>[a.id,new Set(a.inLeanix.map(x=>x.raw))]));
 assert(!processRows.some(r=>r.record&&inLeanix.get(r.appId).has(r.record)),'no row for a process in LeanIX');
 assert(!processRows.some(r=>/match needs review|name differs between sources/i.test(r.issue)));
 assert.deepEqual(processRows.filter(r=>r.application==='RBCD LOG Xone').map(r=>[r.issue,r.record]),[['Process level not specified','BBM_O2C_OM_01 Schedule Agreement for Goods']]);
 const rbcw=rows.filter(r=>r.application==='RBCW Auto Warehouse Management System'&&r.dimension==='Process');
 // V18.1 (fixed rule 2026-10-23): its matching L2 makes L0 and L1 full; its L3 is in LeanIX and matches (V19.1 union;
 // until V19 it was confirmed as recorded): nothing to review.
 assert.deepEqual(rbcw,[]);
 assert.equal(rows.some(r=>r.application==='AUTO-RACK'&&r.dimension==='Process'),false,'its L3V is in LeanIX and matches (until V19 confirmed as recorded): not to review');
 const plant=toReviewRows(model,{entity:'RBCW'});
 assert(plant.length>0&&plant.every(r=>r.plant==='RBCW'));
 const csv=toReviewCSV(model,{entity:'RBCW'},{source:data.source});
 assert(csv.startsWith('\uFEFF"Plant","Business unit","Application ID","Application","Dimension","Level","Issue","Source record","What to check","Details","Data source"\r\n'));
 assert.equal(csv.split('\r\n').length,plant.length+1);
 assert(csv.includes('"20261021_logistic_inventory.xlsx"'));
 assert.deepEqual([toReviewFileName({entity:'RBCW'},'2026-10-22'),toReviewFileName({division:'PS'},'2026-10-22'),toReviewFileName({},'2026-10-22'),toReviewFileName({entity:'MA-ShzP'},'2026-10-22')],
  ['To_review_RBCW_2026-10-22.csv','To_review_PS_2026-10-22.csv','To_review_all_plants_2026-10-22.csv','To_review_MA-ShzP_2026-10-22.csv']);
 assert(source('overview.mjs').includes('<button id="overviewExportReview" type="button"'));
 assert(source('app.js').includes("downloadText(toReviewCSV(model,filters,{source:data?.source||''}),toReviewFileName(filters),'text/csv;charset=utf-8')"));
});

test('a link opens one application: ?app=<ID>, the address bar follows the open application, Copy link',()=>{
 assert.equal(appFromSearch('?tab=landscape&app=%20abc%20'),'abc');assert.equal(appFromSearch(''),'');
 assert.equal(searchWithApp('?tab=landscape','A1'),'?tab=landscape&app=A1');
 assert.equal(searchWithApp('?tab=landscape&app=A1',''),'?tab=landscape');
 assert.equal(searchWithApp('?app=A1',''),'');
 assert.equal(appLink('http://wx-web-td02.apac.bosch.com:8083/?tab=similarity#top','b97561de-87df-46ec-a86c-477fe0e431f9'),'http://wx-web-td02.apac.bosch.com:8083/?app=b97561de-87df-46ec-a86c-477fe0e431f9');
 assert.equal(appLink('file:///C:/Users/me/Downloads/tool.html','x'),'file:///C:/Users/me/Downloads/tool.html?app=x');
 const app=source('app.js');
 assert(app.includes("const linked=appFromSearch(location.search);if(linked){if(model.apps.some(a=>a.id===linked))showApp(linked);"),'opened after loading, once any kept work is restored');
 assert(app.includes("if(!$('detail').open)$('detail').showModal();setAppParam(a.id);"));
 assert(app.includes("$('detail').addEventListener('close',()=>setAppParam(''));"));
 assert(app.includes('<button type="button" id="copyAppLink">Copy link to this application</button>'));
 assert(app.includes("await navigator.clipboard.writeText(link)")&&app.includes("window.prompt('Copy this link to the application:',link)"));
});

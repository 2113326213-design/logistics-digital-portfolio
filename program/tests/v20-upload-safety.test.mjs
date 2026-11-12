// V20 (owner 2026-11-02, "先做 A 组"): the shared server data is protected. An upload never overwrites server data the
// page did not start from, large differences need a second click, the server keeps the last five uploads and one of them
// can be put back, and a file that looks wrong is named before Apply. The server's requests are stood in for here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uploadToServer,uploadMessage,listServerData,restoreServerData,BACKUP_FILES,PREVIOUS_FILE} from '../public/server-upload.mjs';
import {DATA_PACKAGE_FILE,dataPackageText,readDataPackage,applyDataPackage,packageIsNew,packageDiffers} from '../public/data-package.mjs';
import {importWarnings,uploadWarnings} from '../public/import-warnings.mjs';
import {workspaceData} from '../public/workspace.mjs';

const read=file=>readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
const data=JSON.parse(read('data.json'));
const at=(day,publishedAt=`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6)}T08:00:00.000Z`,change={})=>dataPackageText({...data,source:`${day}_logistic_inventory.xlsx`,...change},{publishedAt});
const ours=dataPackageText(data,{publishedAt:'2026-11-02T08:00:00.000Z'});
const older=at('20261020'),idOf=text=>JSON.parse(text).id;
// A stand-in server: files by name, PUTs kept, every request recorded.
const server=(files={})=>{
 const calls=[];
 const request=async(url,init={})=>{
  const method=init.method||'GET';calls.push([method,url]);
  if(method==='PUT'){files[url]=init.body;return {status:201,ok:true,text:async()=>''};}
  return url in files?{status:200,ok:true,text:async()=>files[url]}:{status:404,ok:false,text:async()=>''};
 };
 return {files,calls,request};
};
const server_=(...a)=>server(...a);
const up=(s,text,options={})=>uploadToServer(text,{request:s.request,protocol:'http:',...options});

test('V20: server data the page did not start from is never overwritten; with the right start it is',async()=>{
 for(const base of ['',idOf(at('20261015'))]){
  const s=server({[DATA_PACKAGE_FILE]:older});const result=await up(s,ours,{base});
  assert.equal(result.status,'conflict');assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE]],'only read');
  assert.equal(result.server,'2026-10-20');
  assert.match(uploadMessage(result),/^The server has data that this page did not start from \(as of 2026-10-20, uploaded 2026-10-20\)\. Nothing was uploaded, so it is not overwritten\. First take the server data with "Preview server data".*then import your file again and upload\.$/);
 }
 const s=server({[DATA_PACKAGE_FILE]:older});
 assert.equal((await up(s,ours,{base:idOf(older)})).status,'done');assert.equal(s.files[DATA_PACKAGE_FILE],ours);
 // Newer server data is still named as newer first (V18), whatever the start.
 assert.equal((await up(server({[DATA_PACKAGE_FILE]:at('20261130')}),ours,{base:''})).status,'older');
});

test('V20: an empty server file is no data (the deploy script creates the files empty)',async()=>{
 const s=server({[DATA_PACKAGE_FILE]:'',[PREVIOUS_FILE]:''});
 const result=await up(s,ours);
 assert.deepEqual([result.status,result.previous],['done',false]);
 assert.equal(s.files[PREVIOUS_FILE],'','nothing to keep');
 assert.equal(s.files[DATA_PACKAGE_FILE],ours);
 // The page does not report an empty file as damaged data.
 const app=read('app.js');
 assert(app.includes("let text='';try{text=await response.text();}catch{return;}\n if(!text.trim())return;\n try{serverPackage=readDataPackage(text);}"));
});

test('V20: many applications added or removed against the server data need a second click',async()=>{
 const half=dataPackageText({...data,apps:data.apps.slice(0,30)},{publishedAt:'2026-11-02T09:00:00.000Z'});
 const s=server({[DATA_PACKAGE_FILE]:ours});
 const first=await up(s,half,{base:idOf(ours)});
 assert.equal(first.status,'check');assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE]],'nothing written');
 assert.deepEqual(first.warnings,[`This data does not have ${data.apps.length-30} applications that the server data has; they would disappear for everyone.`]);
 assert.match(uploadMessage(first),/^Check before uploading: .* If this is right, click Upload to server again\.$/);
 const second=await up(s,half,{base:idOf(ours),confirmed:true});
 assert.equal(second.status,'done');assert.equal(s.files[DATA_PACKAGE_FILE],half);assert.equal(s.files[PREVIOUS_FILE],ours);
 // A server file that cannot be read is replaced only after the second click.
 const broken=server({[DATA_PACKAGE_FILE]:'{"broken":'});
 const check=await up(broken,ours);
 assert.deepEqual([check.status,check.warnings],['check',['The data on the server cannot be read. Uploading replaces it.']]);
 assert.equal((await up(broken,ours,{confirmed:true})).status,'done');assert.equal(broken.files[PREVIOUS_FILE],'{"broken":','kept as a backup');
});

test('V20: uploadWarnings counts applications by ID, above a tenth and a small floor',()=>{
 const pkg=apps=>({data:{apps:apps.map(ID=>({ID}))}}),ids=n=>Array.from({length:n},(_,i)=>`A${i}`);
 assert.deepEqual(uploadWarnings(pkg(ids(100)),pkg(ids(100))),[]);
 assert.deepEqual(uploadWarnings(pkg(ids(100)),pkg(ids(110))),[],'10 of 100 added is not more than a tenth');
 assert.equal(uploadWarnings(pkg(ids(100)),pkg(ids(111))).length,1);
 assert.deepEqual(uploadWarnings(pkg(ids(20)),pkg(ids(17))),[],'3 removed is the floor');
 assert.equal(uploadWarnings(pkg(ids(20)),pkg(ids(16))).length,1);
});

test('V20: the server keeps the last five uploads; each moves one place down and the oldest is dropped',async()=>{
 const files={[DATA_PACKAGE_FILE]:older};BACKUP_FILES.forEach((file,i)=>{files[file]=`backup ${i+1}`;});
 const s=server(files);
 assert.equal((await up(s,ours,{base:idOf(older)})).status,'done');
 assert.deepEqual(BACKUP_FILES.map(file=>s.files[file]),[older,'backup 1','backup 2','backup 3','backup 4']);
 // Read first, then written from the oldest down, then the new data, then read back.
 assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE],...BACKUP_FILES.slice(0,-1).map(f=>['GET',f]),...[...BACKUP_FILES].reverse().map(f=>['PUT',f]),['GET',DATA_PACKAGE_FILE],['PUT',DATA_PACKAGE_FILE],['GET',DATA_PACKAGE_FILE]]);
 assert.deepEqual(BACKUP_FILES,['logistics-data.previous.json','logistics-data.previous-2.json','logistics-data.previous-3.json','logistics-data.previous-4.json','logistics-data.previous-5.json']);
 assert.match(uploadMessage({status:'done',dataAsOf:'2026-11-02',previous:true}),/kept as a backup \(the last five are kept\)/);
});

test('V20: Restore earlier server data puts a kept upload back, marked as replacing the data it replaces',async()=>{
 const good=older,bad=ours,s=server({[DATA_PACKAGE_FILE]:bad,[PREVIOUS_FILE]:good,[BACKUP_FILES[1]]:'',[BACKUP_FILES[2]]:'{"x":'});
 const list=await listServerData({request:s.request,protocol:'http:'});
 assert.equal(list.status,'ok');assert.equal(list.current.id,idOf(bad));
 assert.deepEqual(list.backups.map(b=>[b.file,b.pkg?.id??null]),[[PREVIOUS_FILE,idOf(good)],[BACKUP_FILES[2],null]],'empty files are left out; an unreadable one is listed without data');
 const result=await restoreServerData(PREVIOUS_FILE,{request:s.request,protocol:'http:',currentId:idOf(bad),publishedAt:'2026-11-03T10:00:00.000Z'});
 assert.deepEqual([result.status,result.restored,result.id],['done',true,idOf(good)]);
 const now=readDataPackage(s.files[DATA_PACKAGE_FILE]);
 assert.deepEqual([now.id,now.replaces,now.publishedAt,now.dataAsOf],[idOf(good),[idOf(bad)],'2026-11-03T10:00:00.000Z','2026-10-20']);
 assert.equal(s.files[PREVIOUS_FILE],bad,'the replaced data is the newest backup, so the restore can be undone');
 assert.match(uploadMessage(result),/^Restored\. Everyone who opens the tool is now offered this data \(as of 2026-10-20\)\. The data it replaced is kept as the newest backup\.$/);
 // The server data changed while the list was open: nothing is restored.
 const moved=server({[DATA_PACKAGE_FILE]:at('20261105'),[PREVIOUS_FILE]:good});
 const changed=await restoreServerData(PREVIOUS_FILE,{request:moved.request,protocol:'http:',currentId:idOf(bad)});
 assert.equal(changed.status,'changed');assert(!moved.calls.some(c=>c[0]==='PUT'));assert.match(uploadMessage(changed),/Nothing was restored/);
 // Only the kept upload files, and only readable ones.
 for(const file of ['logistics-data.json','../web.config',BACKUP_FILES[2]])assert.equal((await restoreServerData(file,{request:server({[BACKUP_FILES[2]]:'{"x":'}).request,protocol:'http:'})).status,'unreadable');
 assert.equal((await restoreServerData(PREVIOUS_FILE,{request:s.request,protocol:'file:'})).status,'offline');
});

test('V20: restored data is offered to pages that took the replaced data, although its data date is older',()=>{
 const bundled=workspaceData(data);
 const bad=readDataPackage(dataPackageText({...data,apps:data.apps.map((a,i)=>i===0?{...a,Description:'Wrong upload'}:a)},{publishedAt:'2026-11-02T10:00:00.000Z'}));
 const goodText=at('20261020','2026-11-03T10:00:00.000Z');
 const restored=readDataPackage(JSON.stringify({...JSON.parse(goodText),replaces:bad.id}));
 const plain=readDataPackage(goodText);
 const tookBad=applyDataPackage(bundled,bad);
 assert.equal(tookBad.serverBase,bad.id,'applying server data records where the page started from');
 assert.equal(packageIsNew(tookBad,plain),false,'older data is not offered as new');
 assert.equal(packageIsNew(tookBad,restored),true,'restored over the data this page took');
 // After a file import the page keeps only serverBase; the restore is still offered.
 const {dataPackage:_taken,...afterImport}=tookBad;
 assert.equal(packageIsNew(afterImport,restored),true);
 assert.equal(packageIsNew(bundled,restored),false,'a page that never took the wrong data keeps its newer data');
 assert.equal(readDataPackage(JSON.stringify({...JSON.parse(goodText),replaces:'not an id'})).replaces,undefined);
});

test('V20: the Import data dialog offers server data the page did not start from, so it can be taken before uploading',()=>{
 const bundled=workspaceData(data),server=readDataPackage(at('20261020','2026-10-20T08:00:00.000Z',{apps:data.apps.map((a,i)=>i===1?{...a,Description:'Changed on the server'}:a)}));
 assert.equal(packageIsNew(bundled,server),false,'older: not offered under the title');
 assert.equal(packageDiffers(bundled,server),true,'but named in the Import data dialog');
 assert.equal(packageDiffers({...bundled,serverBase:server.id},server),false,'the page started from it');
 assert.equal(packageDiffers(applyDataPackage(bundled,server),server),false,'the page holds it');
});

test('V20: serverBase is kept in the workspace and survives saving',()=>{
 const id='0123456789abcdef';
 assert.equal(workspaceData({...data,serverBase:id}).serverBase,id);
 assert.equal(workspaceData({...data,serverBase:'../x'}).serverBase,undefined);
});

test('V20: a file that looks wrong is named before Apply',()=>{
 const current={apps:Array.from({length:100},(_,i)=>({ID:`A${i}`}))},logistics={ID:'N','Main Business Capability':'B.06.02 Warehousing'};
 const preview=(change={})=>({added:[],removed:[],updated:[],keptNotInExport:0,next:{},...change});
 const leftOut=n=>({inventoryExport:{missingIds:Array.from({length:n},(_,i)=>`M${i}`)}});
 assert.deepEqual(importWarnings(preview({added:Array(10).fill(logistics),removed:Array(10).fill({}),keptNotInExport:10,next:leftOut(10)}),current),[],'a tenth is normal');
 assert.deepEqual(importWarnings(preview({added:Array(11).fill(logistics)}),current),['11 applications are new; usually only a few are.']);
 assert.deepEqual(importWarnings(preview({removed:Array(11).fill({})}),current),['11 applications would be removed.']);
 assert.deepEqual(importWarnings(preview({keptNotInExport:11,next:leftOut(11)}),current,{newExport:true}),['11 applications are not in this file and are kept unchanged; the LeanIX export may have been filtered.']);
 // Review 2026-11-03: more than a tenth, not more than a rounded-up tenth (75 applications: 8 is more than 7.5).
 const seventyFive={apps:current.apps.slice(0,75)};
 assert.deepEqual(importWarnings(preview({removed:Array(8).fill({})}),seventyFive),['8 applications would be removed.']);
 assert.deepEqual(importWarnings(preview({removed:Array(7).fill({})}),seventyFive),[]);
 // Kept applications only when this file is a new export that left them out: not again for a taxonomy file or a backup
 // that carries the earlier list, and not for the server data (whoever uploaded it saw this check).
 assert.deepEqual(importWarnings(preview({keptNotInExport:11,next:leftOut(11)}),{...current,...leftOut(11)},{newExport:true}),[],'the same list as before');
 assert.deepEqual(importWarnings(preview({keptNotInExport:11,next:leftOut(11)}),current),[],'a taxonomy file, a workspace backup or the server data with another list (V20 review)');
 // Data put back on purpose may be older: not named as older.
 const olderData={...data,source:'20261001_logistic_inventory.xlsx'};
 assert.deepEqual(importWarnings(preview({next:olderData}),data,{restored:true}),[]);
 assert.equal(importWarnings(preview({next:olderData}),data).length,1);
 // Applications of another department: no B.06 capability and no BBM PM process or ETAS number.
 const other={ID:'X','Main Business Capability':'B.03 Purchasing',Processes:'MM Procurement'};
 assert.deepEqual(importWarnings(preview({added:[other,other,other,logistics]}),current),['3 of the new applications have no logistics capability (B.06) and no BBM PM process; they may belong to another department.']);
 assert.deepEqual(importWarnings(preview({added:[other,other,{ID:'P',Processes:'BBM PM Inbound L2'},{ID:'E',Processes:'ETAS.01.02'}]}),current),[]);
 // Older data than the page shows.
 const olderNext={...data,source:'20261001_logistic_inventory.xlsx'};
 // 2026-11-12 data: the older-file warning compares against the new bundled inventory date.
 assert.deepEqual(importWarnings(preview({next:olderNext}),data),['This data (as of 2026-10-01) is older than the data on this page (as of 2026-11-12).']);
});

test('V20: the page asks before Apply and before Upload, sends nothing while a preview waits, and can put earlier data back',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('interface.css');
 // Apply waits for the tick when there are warnings, for file imports and server data alike.
 assert(app.includes(`<label><input type="checkbox" id="importWarningsChecked"> I checked this. Apply anyway.</label>`));
 assert(app.includes("$('importApply').disabled=true;$('importWarningsChecked').onchange=e=>{$('importApply').disabled=!e.target.checked;};"));
 assert(app.includes("$('importApply').hidden=true;$('importApply').disabled=false;}"),'a new preview starts enabled');
 assert.equal((app.match(/showImportPreview\(preview,\{base,/g)||[]).length,2,'both previews are checked');
 assert(app.includes("importWarnings(preview,base,{newExport,restored:!!server&&replacesPageData(base,server)})")&&app.includes('showImportPreview(preview,{base,server:pkg,')&&app.includes('inventorySheet,newExport:!!inventorySheets});'));
 // Review 2026-11-03: a workspace backup (.json) keeps the server data the page started from, as an Excel import does;
 // otherwise "take the server data, then import your file again" would end in the same conflict every time.
 assert(app.includes('raw=JSON.parse(text).data;if(base.serverBase)next={...next,serverBase:base.serverBase};}'));
 // Upload: nothing while an import preview waits; the second click is for the same data only; done records the start.
 // V20 review: only a preview with changes waits; after "No changes found" the upload goes ahead.
 assert(app.includes("if(pendingImport?.hasChanges){$('uploadToServerStatus').textContent='An import preview is waiting."));
 assert(app.includes("uploadConfirmedId=result.status==='check'?id:'';"));
 assert(app.includes("if(['done','same'].includes(result.status)&&result.id){data={...data,serverBase:result.id};autosave.schedule();}"));
 assert(app.includes("else if(result.status==='conflict'&&result.pkg&&!packageAdds(data,result.pkg,packageOptions())){data={...data,serverBase:result.pkg.id};autosave.schedule();message='This page already has everything in the server data. Nothing was uploaded yet: click Upload to server again to replace it.';}"));
 assert(app.includes("if(['done','same','conflict','older'].includes(result.status))checkDataPackage();"));
 // Restore: listed, asked, then put back; the page then reads the server again.
 // Plain words (2026-11-12): the window says "Put back an earlier upload".
 assert(html.includes('<details id="serverRestore"><summary>Put back an earlier upload</summary>'));
 assert(html.includes('<button type="button" id="serverRestoreList">Show earlier uploads</button>'));
 assert(app.includes("if(!window.confirm(`Put this data back on the server?"));
 assert(app.includes("const result=await restoreServerData(backup.file,{currentId:list.current?.id||'',expectId:backup.pkg.id,newerIds:list.backups.slice(0,index).map(b=>b.pkg?.id).filter(Boolean)});"));
 assert(app.includes("if(result.status==='done')checkDataPackage();"));
 assert(css.includes('.import-warnings{')&&css.includes('.server-backup{'));
 // Plain words: no "steward", "catalogues" or "published" in what the page shows about server data.
 assert(!/Data published by the data steward|the catalogues and the owner decisions/.test(app));
 assert(app.includes("'Earlier data was put back on the server':'New data on the server'"));
 assert(app.includes(" · uploaded ${esc(pkg.publishedAt.slice(0,10))}"));
});

import {WHATS_NEW,updateNoticeDue,updateNoticeHTML} from '../public/whats-new.mjs';
test('V20: returning users are told once about the checks and the kept uploads, in plain words, with no version number',()=>{
 assert.notEqual(WHATS_NEW.id,'2026-11-02','V20 had its own notice; V21 has the next one');
 const seen=id=>{const map=new Map([['logistics-portfolio:update-seen',id]]);return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))};};
 assert.equal(updateNoticeDue(seen('2026-11-02')),true,'someone who closed the earlier notice of the same day sees this one');
 assert.equal(updateNoticeDue(seen(WHATS_NEW.id)),false);
 const html=updateNoticeHTML(s=>String(s));
 assert.match(html,/<li>Before you apply an import, the tool now names what looks wrong/);
 assert.match(html,/<li>Upload to server now protects the shared data\..*Put back an earlier upload\.<\/li>/);
 // 2026-11-12 policy: the new restriction supersedes the earlier ETAS notice.
 assert.match(html,/Only application process records starting with BBM PM are kept/);
 assert.doesNotMatch(html,/\bV\d|version|release|steward/i);
});

// Review of 2026-11-03 (independent reviewers, each finding checked by a second one).
import {packageAdds,replacesPageData} from '../public/data-package.mjs';

test('V20 review: a page that already holds the server data is never stuck; the same data counts as its start',async()=>{
 const bundled=workspaceData(data),server=readDataPackage(ours);
 // The server holds this page's own data (uploaded before V20, or the same export): nothing to add, so the page may
 // replace it after one more click; the page counts it as its start.
 assert.equal(packageAdds(bundled,server),false);
 const s=server_({[DATA_PACKAGE_FILE]:ours});
 const changed=dataPackageText({...data,apps:data.apps.map((a,i)=>i===2?{...a,Description:'One more change'}:a)},{publishedAt:'2026-11-03T08:00:00.000Z'});
 const first=await up(s,changed,{base:''});
 assert.equal(first.status,'conflict');assert.equal(first.pkg.id,server.id,'the server package comes back with the conflict');
 assert.equal((await up(s,changed,{base:first.pkg.id})).status,'done','with that start the next click uploads');
 // "same" gives the id, so the page records it as its start.
 const same=await up(server_({[DATA_PACKAGE_FILE]:ours}),ours);
 assert.deepEqual([same.status,same.id],['same',server.id]);
 // A page whose start is the server data needs no Import data entry for it (it may upload over it).
 assert.equal(packageDiffers({...bundled,serverBase:server.id},server),false);
});

test('V20 review: an upload that came in while the backups were written is not overwritten',async()=>{
 const other=at('20261103','2026-11-03T09:00:00.000Z',{apps:data.apps.slice(1)});
 const s=server_({[DATA_PACKAGE_FILE]:older});
 const request=async(url,init={})=>{const response=await s.request(url,init);if(init.method==='PUT'&&url===PREVIOUS_FILE)s.files[DATA_PACKAGE_FILE]=other;return response;};
 const result=await uploadToServer(ours,{request,protocol:'http:',base:idOf(older)});
 assert.equal(result.status,'conflict');assert.equal(s.files[DATA_PACKAGE_FILE],other,'the other upload stays');
 assert.equal(result.pkg.id,idOf(other));
});

test('V20 review: a retry after a failed upload leaves the backups as they are',async()=>{
 const files={[DATA_PACKAGE_FILE]:older,[PREVIOUS_FILE]:'backup 1',[BACKUP_FILES[1]]:'backup 2'};
 const s=server_(files);let fail=true;
 const request=async(url,init={})=>{if(fail&&init.method==='PUT'&&url===DATA_PACKAGE_FILE){fail=false;return {status:500,ok:false,text:async()=>''};}return s.request(url,init);};
 assert.deepEqual(await uploadToServer(ours,{request,protocol:'http:',base:idOf(older)}),{status:'http',code:500});
 assert.deepEqual([s.files[PREVIOUS_FILE],s.files[BACKUP_FILES[1]],s.files[BACKUP_FILES[2]]],[older,'backup 1','backup 2'],'moved once');
 assert.equal((await uploadToServer(ours,{request,protocol:'http:',base:idOf(older)})).status,'done');
 assert.deepEqual([s.files[PREVIOUS_FILE],s.files[BACKUP_FILES[1]],s.files[BACKUP_FILES[2]]],[older,'backup 1','backup 2'],'not moved again');
});

test('V20 review: putting back an upload further down undoes every upload after it; the chosen data must still be there',async()=>{
 const good=older,bad1=at('20261102','2026-11-02T09:00:00.000Z',{apps:data.apps.slice(0,40)}),bad2=at('20261102','2026-11-02T10:00:00.000Z',{apps:data.apps.slice(0,41)});
 const s=server_({[DATA_PACKAGE_FILE]:bad2,[PREVIOUS_FILE]:bad1,[BACKUP_FILES[1]]:good});
 const result=await restoreServerData(BACKUP_FILES[1],{request:s.request,protocol:'http:',currentId:idOf(bad2),expectId:idOf(good),newerIds:[idOf(bad1)],publishedAt:'2026-11-03T11:00:00.000Z'});
 assert.equal(result.status,'done');
 const now=readDataPackage(s.files[DATA_PACKAGE_FILE]);
 assert.deepEqual(now.replaces,[idOf(bad2),idOf(bad1)]);
 // A page that took the first bad upload is offered the restored data although it is older.
 const tookBad1=applyDataPackage(workspaceData(data),readDataPackage(bad1));
 assert.equal(replacesPageData(tookBad1,now),true);assert.equal(packageIsNew(tookBad1,now),true);
 // The backups moved since the list was read: the chosen data is no longer in that file, so nothing is restored.
 const moved=server_({[DATA_PACKAGE_FILE]:bad2,[PREVIOUS_FILE]:bad1,[BACKUP_FILES[1]]:at('20261001')});
 assert.equal((await restoreServerData(BACKUP_FILES[1],{request:moved.request,protocol:'http:',currentId:idOf(bad2),expectId:idOf(good)})).status,'changed');
});

test('V20 review: data put back over a page that took it, changed it and uploaded is offered to that page',()=>{
 const bundled=workspaceData(data),good=readDataPackage(older);
 const took=applyDataPackage(bundled,good),uploadedBad={...took,apps:took.apps.slice(1),serverBase:'0123456789abcdef'};
 const restored=readDataPackage(JSON.stringify({...JSON.parse(at('20261020','2026-11-03T12:00:00.000Z',{apps:data.apps.map(a=>a.Name==='AUTO-RACK'?{...a,Description:'Description uploaded by someone else on 20 October'}:a)})),replaces:['0123456789abcdef']}));
 assert.equal(uploadedBad.dataPackage.id,JSON.parse(older).id);
 const restoredGood=readDataPackage(JSON.stringify({...JSON.parse(older),publishedAt:'2026-11-03T12:00:00.000Z',replaces:['0123456789abcdef']}));
 assert.equal(packageIsNew(uploadedBad,restoredGood),true,'the package it took before is offered again when it was put back over its upload');
 assert.equal(packageIsNew(took,readDataPackage(older)),false,'otherwise the package a page took is not offered again');
 assert.ok(restored.replaces);
});

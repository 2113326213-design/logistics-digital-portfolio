// V18 "Upload to server" (owner 2026-10-23: "客户自己做完后覆盖然后在上传到服务器给大家看", "你直接写好我在安装进去"): the
// page sends logistics-data.json to the IIS server (WebDAV PUT, signed-in Windows users only, set up by the deploy
// script). The server's request is stood in for here; the deploy script itself is checked by deploy:sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uploadToServer,uploadMessage,canUpload,PREVIOUS_FILE,BACKUP_FILES} from '../public/server-upload.mjs';
import {DATA_PACKAGE_FILE,dataPackageText} from '../public/data-package.mjs';
import {deployScript} from '../scripts/deploy-script.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const ours=dataPackageText(data,{publishedAt:'2026-10-23T08:00:00.000Z'});
const older=dataPackageText({...data,source:'20261001_logistic_inventory.xlsx'},{publishedAt:'2026-10-01T08:00:00.000Z'});
const newer=dataPackageText({...data,source:'20261130_logistic_inventory.xlsx'},{publishedAt:'2026-11-30T08:00:00.000Z'});
// A stand-in server: files by name; PUT answers with putStatus; every request is recorded.
const server=({files={},putStatus=201,getStatus=null,keep=true}={})=>{
 const calls=[];
 const request=async(url,init={})=>{
  const method=init.method||'GET';calls.push([method,url]);
  if(method==='PUT'){if(putStatus<300&&keep)files[url]=init.body;return {status:putStatus,ok:putStatus<300,text:async()=>''};}
  if(getStatus)return {status:getStatus,ok:false,text:async()=>''};
  return url in files?{status:200,ok:true,text:async()=>files[url]}:{status:404,ok:false,text:async()=>''};
 };
 return {files,calls,request};
};

// V20: an upload replaces only the server data the page started from (base); the backups are read before they move.
const olderId=JSON.parse(older).id,backupReads=BACKUP_FILES.slice(0,-1).map(file=>['GET',file]);

test('V18: an upload keeps the server file as a backup, writes the new file and reads it back',async()=>{
 const s=server({files:{[DATA_PACKAGE_FILE]:older}});
 const result=await uploadToServer(ours,{request:s.request,protocol:'http:',base:olderId});
 assert.equal(result.status,'done');assert.equal(result.previous,true);
 // V20 review: the data file is read once more right before it is replaced (another upload may have come in).
 assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE],...backupReads,['PUT',PREVIOUS_FILE],['GET',DATA_PACKAGE_FILE],['PUT',DATA_PACKAGE_FILE],['GET',DATA_PACKAGE_FILE]]);
 assert.equal(s.files[PREVIOUS_FILE],older);assert.equal(s.files[DATA_PACKAGE_FILE],ours);
 assert.match(uploadMessage(result),/^Uploaded\. Everyone who opens the tool now gets this data .*kept as a backup \(the last five are kept\)\.$/);
 // The first upload to an empty server has nothing to keep.
 const empty=server();const first=await uploadToServer(ours,{request:empty.request,protocol:'https:'});
 assert.deepEqual([first.status,first.previous,empty.calls.map(c=>c[0])],['done',false,['GET','GET','PUT','GET']]);
});

test('V18: newer data on the server is never replaced, the same data is not sent again, and the offline file never uploads',async()=>{
 const s=server({files:{[DATA_PACKAGE_FILE]:newer}});
 const result=await uploadToServer(ours,{request:s.request,protocol:'http:'});
 assert.equal(result.status,'older');assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE]]);
 assert.match(uploadMessage(result),/newer data .*Nothing was uploaded/);
 const same=server({files:{[DATA_PACKAGE_FILE]:ours}});
 assert.equal((await uploadToServer(ours,{request:same.request,protocol:'http:'})).status,'same');
 assert.deepEqual(same.calls,[['GET',DATA_PACKAGE_FILE]]);
 const offline=server();
 assert.equal((await uploadToServer(ours,{request:offline.request,protocol:'file:'})).status,'offline');
 assert.deepEqual(offline.calls,[]);
 assert.deepEqual([canUpload('http:'),canUpload('https:'),canUpload('file:')],[true,true,false]);
});

test('V18: a server that refuses or is not set up gets a plain message, and nothing is written',async()=>{
 for(const [code,text] of [[401,/Windows sign-in/],[403,/may not upload/],[405,/does not take uploads yet.*the latest deploy-iis\.bat/],[501,/does not take uploads yet/],[500,/error 500/]]){
  const s=server({putStatus:code});const result=await uploadToServer(ours,{request:s.request,protocol:'http:'});
  assert.deepEqual(result,{status:'http',code});assert.match(uploadMessage(result),text);assert.match(uploadMessage(result),/Nothing was uploaded\./);
  assert.equal(s.files[DATA_PACKAGE_FILE],undefined);
 }
 // A failed copy of the previous file stops before the real file is replaced.
 const s=server({files:{[DATA_PACKAGE_FILE]:older},putStatus:403});
 await uploadToServer(ours,{request:s.request,protocol:'http:',base:olderId});
 assert.deepEqual(s.calls,[['GET',DATA_PACKAGE_FILE],...backupReads,['PUT',PREVIOUS_FILE]]);assert.equal(s.files[DATA_PACKAGE_FILE],older);
 const down=await uploadToServer(ours,{request:async()=>{throw new TypeError('Failed to fetch');},protocol:'http:'});
 assert.equal(down.status,'unreachable');assert.match(uploadMessage(down),/could not be reached/);
 // Sent, but not given back: said so.
 const lost=server({keep:false});const result=await uploadToServer(ours,{request:lost.request,protocol:'http:'});
 assert.equal(result.status,'not-confirmed');assert.match(uploadMessage(result),/did not give the same file back/);
 // A package that is not valid is never sent.
 await assert.rejects(()=>uploadToServer('{"x":1}',{request:server().request,protocol:'http:'}),/not a data package/);
});

test('V18: the deploy script lets only signed-in Windows users write only the data files, and the tool keeps working without it',()=>{
 const script=deployScript({html:Buffer.from('<html>test</html>'),version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 const block=script.slice(script.indexOf('rem ---- Upload to server (V18)'),script.indexOf('rem ---- [6/6]'));
 assert(block.length>0&&script.indexOf('echo [5/6] OK')<script.indexOf('rem ---- Upload to server (V18)'));
 assert.match(block,/call "%DISM%" \/online \/enable-feature \/featurename:IIS-WebDAV \/featurename:IIS-WindowsAuthentication \/featurename:IIS-URLAuthorization \/all \/norestart \/quiet/);
 assert.match(block,/^set "DISM=%SystemRoot%\\System32\\dism\.exe"\r$/m,'full path');
 assert.match(block,/^set "ICACLS=%SystemRoot%\\System32\\icacls\.exe"\r$/m,'full path');
 // Only the data files may be written, only by signed-in users; reading stays open to everyone. V20: one rule per file of
 // DATAFILES (the current data, five backups and the deploy's upload test file), written in one loop.
 assert.match(block,/^set "DATAFILES=logistics-data\.json logistics-data\.previous\.json logistics-data\.previous-2\.json logistics-data\.previous-3\.json logistics-data\.previous-4\.json logistics-data\.previous-5\.json logistics-data\.check\.json"\r$/m);
 assert.deepEqual([...block.matchAll(/authoringRules \/\+"\[users='\*',path='([^']+)',access='Read, Write'\]"/g)].map(m=>m[1]),['%%F']);
 assert.match(block,/for %%F in \(%DATAFILES%\) do \(\r\n  "%APPCMD%" set config "%SITE%" \/section:system\.webServer\/webdav\/authoringRules \/-/);
 assert.match(block,/authorization \/\+"\[accessType='Deny',users='\?',verbs='PUT,DELETE,MKCOL,COPY,MOVE,PROPPATCH,LOCK,UNLOCK'\]"/);
 assert.match(block,/windowsAuthentication \/enabled:true/);
 assert.doesNotMatch(block,/anonymousAuthentication/,'anonymous reading is not touched');
 // A failure only warns: no stop, no exit.
 assert.doesNotMatch(block,/goto :fail|exit \/b/);
 // Limits first, writing last (owner OK and peer review 2026-10-23): WebDAV writing is switched on after every limit,
 // and a failed limit switches it off.
 const on=block.indexOf('webdav/authoring /enabled:true');
 // V20: the folder-wide right is removed and each data file gets its own right (no (OI)(CI) right on the folder any more);
 // deleting or moving the data files is refused for everyone.
 for(const limit of ['windowsAuthentication /enabled:true',"authorization /+\"[accessType='Deny',users='?'","authorization /+\"[accessType='Deny',users='*',verbs='DELETE,","path='%%F',access='Read, Write'",'/remove:g "*S-1-5-11"','/grant "*S-1-5-11:M"'])assert(block.indexOf(limit)>0&&block.indexOf(limit)<on,limit);
 assert.doesNotMatch(block,/S-1-5-11:\(OI\)|\(CI\)M/);
 assert.match(block.slice(block.indexOf('\r\n:uploadoff\r\n')+2),/^:uploadoff\r\n"%APPCMD%" set config "%SITE%" \/section:system\.webServer\/webdav\/authoring \/enabled:false/);
 assert.equal((block.match(/goto :uploadoff/g)||[]).length,13,'every limit and the switch itself lead to the switch-off');
 // WebDAV is server-wide (V18 review): newly installed, it leaves the server-wide lists and is added to this site only,
 // before any limit; if it cannot leave them, the feature is removed again.
 const scope=[`config /section:system.webServer/handlers /-"[name='WebDAV']"`,`config /section:system.webServer/modules /-"[name='WebDAVModule']"`,`"%SITE%" /section:system.webServer/modules /+`,`"%SITE%" /section:system.webServer/handlers /+"[@start,name='WebDAV'`].map(s=>block.indexOf(s));
 assert(scope.every(i=>i>0)&&scope.every(i=>i<block.indexOf('windowsAuthentication /enabled:true')),JSON.stringify(scope));
 assert(block.indexOf('if "%WEBDAV_WAS_ON%"=="1" goto :webdavscoped')<scope[0],'an earlier WebDAV is left alone');
 assert.match(block,/:webdavglobal\r\ncall "%DISM%" \/online \/disable-feature \/featurename:IIS-WebDAV/);
 assert.match(block,/echo \[!\] Upload to server was NOT turned on: %UPLOADSTEP%\. Nobody can upload; the tool works as before\./);
});

test('V18: the page shows Upload to server only on the intranet page, in plain words (V19: without the download)',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/<summary>Share with everyone<\/summary>.*<button type="button" id="uploadToServer">Upload to server<\/button><p id="uploadToServerStatus" class="hint" role="status"><\/p><details id="serverRestore">/s);
 assert.doesNotMatch(html,/steward|data package/i);
 assert(app.includes("$('packagePublish').hidden=!canUpload();"));
 // V20: the upload says which server data the page started from, and a second click confirms the warnings.
 assert(app.includes("await uploadToServer(text,{base:data.serverBase||data.dataPackage?.id||'',confirmed:uploadConfirmedId===id})"));
});

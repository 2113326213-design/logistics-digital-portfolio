// Runs the generated IIS deploy script on this Windows PC without UAC and without IIS, in the situations below, and checks
// that every run ends with a readable message (owner report 2026-10-22: the window closed on the server). Windows only.
//
//   npm run deploy:sim
//
// Run it after npm run release:files and before publishing. It takes the HTML of the release ZIP in offline/ and the
// script that scripts/deploy-script.mjs generates for it from the current deploy-iis.template.bat (A group, 2026-11-02: a
// template change is simulated before it is packaged; after npm run release:files this is exactly offline/deploy-iis.bat
// and the release ZIP, and a note says when it is not, also in verification/deploy-sim-results.txt). It works in a new
// folder under %TEMP% and removes it afterwards.
// Nothing is installed, no UAC prompt appears and no IIS setting is touched: the UAC request and the new window are
// printed instead of opened, and appcmd is a stand-in (a copy of node.exe that runs small scripts) in a fake inetsrv folder.
//   1. not Administrator, UAC accepted  -> asks for the cmd /k Administrator window, copy in Downloads
//   2. not Administrator, UAC cancelled -> says so and waits for a key
//   3. already Administrator            -> continues in a new cmd /k window
//   4. Administrator window, new site, current-directory lookup disabled (NoDefaultCurrentDirectoryInExePath=1),
//      no web server                    -> steps 1-5 pass, the smoke test fails with a message and waits for a key
//   5. Administrator window, existing site, local web server -> [6/6] OK and === DONE ===
//   6. the zip only in Downloads, saved by the browser as "name (1).zip" -> found and verified
//   7. no zip of this release in Downloads, only another release -> says so, lists the zips found, waits
// One download (owner report 2026-10-22: twice only the separate script was downloaded): Downloads holds only the
// release ZIP and deploy-iis.bat is double-clicked inside it. Explorer runs it from a temporary folder (Temp1_<zip name>)
// and deletes that folder when it ends; the script first copies itself to Downloads, and that copy runs in the
// Administrator window.
//   8. the release ZIP                          -> the copy finds the ZIP, verifies the HTML, === DONE ===, and
//      index.html has the deploy time, not the release-date time stored in the ZIP (V13.2 review)
//   9. the release ZIP saved as "name (1).zip"  -> the same, from the "(1)" copy
//  10. a ZIP of that name with another HTML     -> SHA-256 mismatch, stops before [3/6], says why and waits
// Upload to server (V18): DISM is a stand-in; 4 has no IIS features (upload not turned on), 5, 8 and 9 turn it on.
//  11. the IIS features are there, but writing cannot be limited to signed-in users -> upload is NOT turned on,
//      WebDAV writing is switched off (never on), and the site is still deployed
//  12. WebDAV Publishing already installed   -> the server-wide lists are left alone, upload on
//  13. WebDAV cannot be limited to this site -> the feature is removed again (DISM /disable-feature), upload off
//  5b. WebDAV newly installed                -> taken out of the server-wide lists, added to this site only
// A group (owner 2026-11-02, make the shared server data safe): icacls is a stand-in that writes every call to the call
// log and then runs the real icacls on the folder under %TEMP%, so the file rights are also read back for real (as SDDL,
// where AU is Authenticated Users, S-1-5-11). The local web server stands in for IIS WebDAV: a PUT of a data file writes
// it only when the file is there (signed-in users can no longer create files), a GET reads it back. Every run with upload
// on (5, 8, 9, 12, 5b) now also passes the upload test at [6/6]; 11 and 13 (upload off) have none.
//  14. normal deploy after a V18-V19.3 deploy, on a folder that also inherits Modify for signed-in users from its drive
//      (as D:\ gives by default; V20 review) -> the 7 WebDAV rules, inheritance off, every right of signed-in users on the
//      folder and index.html is gone, the 7 data files are created empty and only they are changeable, the upload test passes
//  15. the data files are already there with data -> not overwritten, and still changeable by signed-in users
//  16. the upload test gets 401               -> the warning and what it means, === DONE ===, one pause at the very end
//  17. one data file cannot get its right     -> upload off with the reason, WebDAV writing off, the deploy goes on
//  18. DELETE and MOVE cannot be refused for everyone (V20) -> upload off with the reason before any file right, the
//      deploy goes on; 14 and 15 also check that the rule is set before writing is switched on
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,statSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RELEASE_VERSION,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,OFFLINE_FILE_NAME} from './release.mjs';
import {readZip,storedZip,deployScript,releaseZip} from './deploy-script.mjs';

if(process.platform!=='win32'){console.error('deploy:sim needs Windows (cmd.exe).');process.exit(2);}
const offline=path.resolve(process.cwd(),'..','offline'),packagedBat=path.join(offline,DEPLOY_SCRIPT_NAME),packagedZip=path.join(offline,RELEASE_ZIP_NAME),exported=path.resolve(process.cwd(),'outputs',OFFLINE_FILE_NAME);
// The HTML the script checks: the one in the release ZIP; before npm run release:files the one npm run export:offline
// wrote; before that (a new RELEASE_VERSION not built yet) a small stand-in page, which the steps simulated here do not
// look into. The note then says that the release itself still has to be simulated.
const zipped=existsSync(packagedZip)?[...readZip(readFileSync(packagedZip))].find(([name])=>/\.html$/i.test(name))?.[1]:null;
const html=zipped||(existsSync(exported)?readFileSync(exported):Buffer.from(`<!doctype html><title>deploy:sim stand-in for ${OFFLINE_FILE_NAME}</title>\n`));
const htmlFrom=zipped?'':existsSync(exported)?`the HTML of npm run export:offline (outputs/${OFFLINE_FILE_NAME})`:`a stand-in HTML (${RELEASE_VERSION} is not built yet)`;
const src=deployScript({html}),zipBytes=releaseZip(html,src),VERSION=RELEASE_VERSION.toUpperCase();
const packaged=!!zipped&&existsSync(packagedBat)&&readFileSync(packagedBat,'utf8')===src&&readFileSync(packagedZip).equals(zipBytes);
const note=packaged?'':`Note: simulated with the script of the current template${htmlFrom?` and ${htmlFrom}`:''}; offline/${DEPLOY_SCRIPT_NAME} and offline/${RELEASE_ZIP_NAME} do not hold it yet. Before publishing: npm run release:files (a release ZIP is never replaced: a changed script needs a new RELEASE_VERSION), then this simulation again.`;
if(note)console.log(note);
const swap=(text,pairs)=>{for(const [a,b] of pairs){if(text.split(a).length!==2)throw Error(`deploy:sim needs updating: "${a.slice(0,60)}" is not in ${DEPLOY_SCRIPT_NAME} exactly once.`);text=text.replace(a,()=>b);}return text;};
const UAC='Start-Process -FilePath cmd.exe -Verb RunAs -ErrorAction Stop -ArgumentList';
const START=`start "Logistics Tool ${VERSION} : IIS deploy" cmd.exe /k call`;
const asAdmin=text=>text.split('fltmc >nul 2>&1').join('ver >nul');

const dir=mkdtempSync(path.join(tmpdir(),'logistics-deploy-sim-')),home=path.join(dir,'home'),downloads=path.join(home,'Downloads'),target=path.join(dir,'target'),inetsrv=path.join(dir,'inetsrv');
for(const d of [downloads,target,inetsrv])mkdirSync(d,{recursive:true});
const zip=path.join(dir,RELEASE_ZIP_NAME);writeFileSync(zip,zipBytes);
copyFileSync(process.execPath,path.join(inetsrv,'appcmd.exe'));
const fake=siteExists=>{
 writeFileSync(path.join(inetsrv,'list'),`const a=process.argv.slice(2).join(' ');if(a.includes('/text:bindings')){console.log('http/*:8083:');process.exit(0);}if(a.includes('/name:'))process.exit(${siteExists?0:1});process.exit(0);\n`);
 for(const f of ['add','set','start'])writeFileSync(path.join(inetsrv,f),'process.exit(0);\n');
};
// The Administrator window: rights granted, and appcmd in the fake inetsrv folder.
// DISM is a stand-in too (V18): dism-ok.cmd turns the IIS features on, dism-fail.cmd cannot.
// Every DISM call is written to dism.log; dism-on.cmd answers that WebDAV Publishing is already installed.
const dismOk=path.join(dir,'dism-ok.cmd'),dismFail=path.join(dir,'dism-fail.cmd'),dismOn=path.join(dir,'dism-on.cmd'),dismLog=path.join(dir,'dism.log');
writeFileSync(dismOk,`@echo %*>>"${dismLog}"\r\n@exit /b 0\r\n`);writeFileSync(dismFail,'@exit /b 50\r\n');
writeFileSync(dismOn,`@echo %*>>"${dismLog}"\r\n@if /i "%3"=="/get-featureinfo" echo State : Enabled\r\n@exit /b 0\r\n`);
// icacls (A group): the stand-in writes "icacls <arguments>" to the call log, which the logging appcmd set stand-in also
// writes to (so the order of the steps can be checked), then runs the real icacls. icacls-fail.cmd fails for one file.
const setLog=path.join(dir,'appcmd-set.log'),realIcacls=path.join(process.env.SystemRoot||'C:\\Windows','System32','icacls.exe');
const icaclsStandIn=(name,failFor='')=>{const file=path.join(dir,name);writeFileSync(file,['@echo off',`>>"${setLog}" echo(icacls %*`,...(failFor?[`if /i "%~nx1"=="${failFor}" exit /b 5`]:[]),`"${realIcacls}" %*`,''].join('\r\n'));return file;};
const icaclsOk=icaclsStandIn('icacls-ok.cmd'),FAIL_FILE='logistics-data.previous-3.json',icaclsFail=icaclsStandIn('icacls-fail.cmd',FAIL_FILE);
const adminWindow=(text,dism=dismOk,icacls=icaclsOk)=>swap(asAdmin(text),[['set "INETSRV=%windir%\\system32\\inetsrv"',`set "INETSRV=${inetsrv}"`],['set "DISM=%SystemRoot%\\System32\\dism.exe"',`set "DISM=${dism}"`],['set "ICACLS=%SystemRoot%\\System32\\icacls.exe"',`set "ICACLS=${icacls}"`]]);
const write=(name,text)=>{const file=path.join(dir,name);writeFileSync(file,text);return file;};
// cmd /s /c "<line>" keeps the script path quoted, also when it holds spaces and brackets (Temp1_name (1).zip).
const quote=arg=>/[\s()&^]/.test(arg)?`"${arg}"`:arg;
const run=(file,args=[],env={})=>new Promise(resolve=>{
 const child=spawn('cmd.exe',['/d','/s','/c',`""${file}" ${args.map(quote).join(' ')}"`],{cwd:dir,env:{...process.env,USERPROFILE:home,...env},windowsVerbatimArguments:true});
 let out='';child.stdout.on('data',d=>out+=d.toString('latin1'));child.stderr.on('data',d=>out+=d.toString('latin1'));child.stdin.end();
 child.on('close',code=>resolve({code,out}));
});
const results=[],report=[];
const check=(name,{code,out},expected,exitCode,absent=[])=>{
 const missing=expected.filter(text=>!out.includes(text)),unexpected=absent.filter(text=>out.includes(text)),ok=!missing.length&&!unexpected.length&&code===exitCode;
 results.push(ok);report.push(`${ok?'PASS':'FAIL'}  ${name}`);console.log(`${ok?'PASS':'FAIL'}  ${name}${ok?'':`\n      exit ${code} (expected ${exitCode}); missing: ${missing.join(' | ')}${unexpected.length?`; unexpected: ${unexpected.join(' | ')}`:''}\n${out.split(/\r?\n/).filter(Boolean).slice(-12).map(l=>'      > '+l).join('\n')}`}`);
};
const ELEVATED=`/k call "${path.join(downloads,DEPLOY_SCRIPT_NAME)}" 8083 "D:\\logistics-tool" ELEVATED`;
// 8-10: Downloads holds only this ZIP, and deploy-iis.bat is double-clicked inside it. Step 1 runs the script found in
// the ZIP from Explorer's temporary folder (UAC and the new window printed, not opened), then that folder is deleted;
// step 2 runs the copy the script left in Downloads, as the Administrator window does.
const fromInsideZip=async(name,bytes=readFileSync(zip))=>{
 rmSync(downloads,{recursive:true,force:true});mkdirSync(downloads);writeFileSync(path.join(downloads,name),bytes);
 const inside=readZip(bytes).get(DEPLOY_SCRIPT_NAME),explorer=`Temp1_${name}`,copy=path.join(downloads,DEPLOY_SCRIPT_NAME);
 if(!inside)return {code:'-',out:`${DEPLOY_SCRIPT_NAME} is not inside ${name}`};
 mkdirSync(path.join(dir,explorer));
 const first=await run(write(path.join(explorer,DEPLOY_SCRIPT_NAME),swap(inside.toString('utf8'),[[UAC,'Write-Output -InputObject'],[START,'echo WOULD START cmd.exe /k call']])));
 rmSync(path.join(dir,explorer),{recursive:true,force:true});
 if(first.code!==0||!existsSync(copy))return {code:`step 1 exit ${first.code}`,out:`${first.out}${existsSync(copy)?'':'\nno copy of the script in Downloads'}`};
 writeFileSync(copy,adminWindow(readFileSync(copy,'utf8')));
 const second=await run(copy,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'});
 return {code:second.code,out:first.out+second.out};
};
// The local web server: GET / gives index.html. It stands in for IIS WebDAV for the data files (A group): a PUT writes a
// logistics-data*.json file only when it is there (403 otherwise, as signed-in users cannot create files in the folder),
// a GET reads it back (404 when missing). putStatus answers every PUT with that code instead (16: 401).
const requests=[],DATA_NAME=/^logistics-data[\w.-]*\.json$/;
const serve=async({putStatus=0}={})=>{
 const server=createServer((request,response)=>{
  const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname).slice(1),file=path.join(target,name);
  requests.push(`${request.method} /${name}`);
  if(request.method==='PUT'){
   const body=[];
   request.on('data',d=>body.push(d)).on('end',()=>{
    if(putStatus){response.statusCode=putStatus;return response.end();}
    if(!DATA_NAME.test(name)||!existsSync(file)){response.statusCode=403;return response.end();}
    writeFileSync(file,Buffer.concat(body));response.statusCode=204;response.end();
   });
   return;
  }
  if(DATA_NAME.test(name)){
   if(!existsSync(file)){response.statusCode=404;return response.end();}
   response.setHeader('Content-Type','application/json');return response.end(readFileSync(file));
  }
  response.end(readFileSync(path.join(target,'index.html')));
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(8083,'127.0.0.1',resolve));
 return server;
};
const UPLOAD_TEST='[6/6] OK  upload test: a signed-in PUT and read-back of logistics-data.check.json worked',UPLOAD_TEST_FAILED='[!] Upload test failed';
try{
 fake(false);
 check('1. not Administrator, UAC accepted',await run(write('s1.bat',swap(src,[[UAC,'Write-Output -InputObject']]))),['Not elevated',ELEVATED],0);
 if(!existsSync(path.join(downloads,DEPLOY_SCRIPT_NAME))){results.push(false);console.log('FAIL  1b. the stable copy in Downloads was not written');}
 check('2. not Administrator, UAC cancelled',await run(write('s2.bat',swap(src,[[UAC,"throw 'The operation was canceled by the user.'; Write-Output"]]))),['[X] Windows did not open the Administrator window','Run as administrator','Press any key to close this window...'],1);
 check('3. already Administrator',await run(write('s3.bat',swap(asAdmin(src),[[START,'echo WOULD START cmd.exe /k call']]))),[`WOULD START cmd.exe ${ELEVATED}`],0);
 const adminBat=write('s4.bat',adminWindow(src,dismFail)),upload='Upload to server: on',noUpload='[!] Upload to server was NOT turned on: the IIS features';
 check('4. Administrator window, new site, current-directory lookup disabled, no web server',await run(adminBat,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),[noUpload,'[1/6] OK  port 8083 is free','[2/6] OK  extracted and SHA-256 verified','[3/6] OK  index.html written','[5/6] OK','[!] Deployed, but the local test failed','*** Stopped. See the message above. ***','Press any key to close this window...'],1);
 fake(true);
 let server=await serve();
 try{check('5. Administrator window, existing site, web server answering',await run(write('s5.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),['redeploy mode',upload,'old index.html backed up','[6/6] OK  http://localhost:8083/ responds',UPLOAD_TEST,'=== DONE ===','Press any key to close this window...'],0);}
 finally{server.close();}
 // 6-7: the script in a folder without the zip, so only Downloads is searched.
 const other=path.join(dir,'other');mkdirSync(other);const elsewhere=write(path.join('other','s6.bat'),readFileSync(adminBat,'utf8'));
 const renamed=path.join(downloads,RELEASE_ZIP_NAME.replace(/\.zip$/,' (1).zip'));copyFileSync(zip,renamed);
 check('6. the zip in Downloads saved as "name (1).zip"',await run(elsewhere,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),[`[1/6] OK  zip: ${renamed}`,'[2/6] OK  extracted and SHA-256 verified'],1);
 rmSync(renamed);writeFileSync(path.join(downloads,'logistics-offline-20200101-v1.zip'),'not this release');
 check('7. only another release in Downloads',await run(elsewhere,['8083',target,'ELEVATED']),[`[X] ${RELEASE_ZIP_NAME} not found next to this script or in Downloads.`,'Release zips now in Downloads:','logistics-offline-20200101-v1.zip','Press any key to close this window...'],1);
 server=await serve();
 try{
  const done=['[2/6] OK  extracted and SHA-256 verified',upload,'[3/6] OK  index.html written','[6/6] OK  http://localhost:8083/ responds',UPLOAD_TEST,'=== DONE ===','Press any key to close this window...'];
  const started=Date.now()-2000,one=await fromInsideZip(RELEASE_ZIP_NAME),stale='index.html kept the time stored in the zip';
  if(statSync(path.join(target,'index.html')).mtimeMs<started)one.out+='\n'+stale;
  check('8. one download: deploy-iis.bat double-clicked inside the release zip in Downloads',one,[ELEVATED,`[1/6] OK  zip: ${path.join(downloads,RELEASE_ZIP_NAME)}`,...done],0,[stale]);
  const copy1=RELEASE_ZIP_NAME.replace(/\.zip$/,' (1).zip');
  check('9. one download saved as "name (1).zip", script double-clicked inside it',await fromInsideZip(copy1),[ELEVATED,`[1/6] OK  zip: ${path.join(downloads,copy1)}`,...done],0);
 }
 finally{server.close();}
 // 10: a zip of this name whose HTML is another build (the script inside is this release's).
 const entries=[...readZip(readFileSync(zip))],another=storedZip(entries.map(([name,data])=>[name,/\.html$/i.test(name)?Buffer.concat([data,Buffer.from('\n<!-- another build -->')]):data]));
 const index=path.join(target,'index.html'),before=readFileSync(index),mismatch=await fromInsideZip(RELEASE_ZIP_NAME,another);
 if(!readFileSync(index).equals(before))mismatch.out+='\nindex.html was changed';
 check('10. one download whose HTML does not match the SHA-256 in the script',mismatch,[ELEVATED,`[1/6] OK  zip: ${path.join(downloads,RELEASE_ZIP_NAME)}`,`[X] SHA-256 mismatch - the HTML in the zip named at [1/6] is not the expected ${VERSION} build`,'Delete that zip','*** Stopped. See the message above. ***','Press any key to close this window...'],1,['[3/6]','index.html was changed']);
 // 11 (V18): the limit for signed-in users cannot be set: upload stays off and WebDAV writing is switched off, never on.
 const fresh=()=>{for(const file of [setLog,dismLog])rmSync(file,{force:true});};
 const readLog=file=>existsSync(file)?readFileSync(file,'utf8'):'';
 fresh();
 writeFileSync(path.join(inetsrv,'set'),`const a=process.argv.slice(2).join(' ');require('fs').appendFileSync(${JSON.stringify(setLog)},a+'\\n');process.exit(a.includes('security/authorization')&&a.includes('/+')?1:0);\n`);
 server=await serve();
 try{
  const limited=await run(write('s11.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls=readLog(setLog);
  if(calls.includes('webdav/authoring /enabled:true'))limited.out+='\nWebDAV writing was switched on';
  if(!calls.includes('webdav/authoring /enabled:false'))limited.out+='\nWebDAV writing was not switched off';
  check('11. upload limits cannot be set: upload stays off, the site is still deployed',limited,['[!] Upload to server was NOT turned on: writing could not be limited to signed-in users','Nobody can upload; the tool works as before.','=== DONE ==='],0,['Upload to server: on','WebDAV writing was switched on','WebDAV writing was not switched off',UPLOAD_TEST,UPLOAD_TEST_FAILED]);
 }
 finally{server.close();fake(true);}
 // 12-13 (V18 review): WebDAV Publishing is server-wide. Not installed before: it is taken out of the server-wide lists
 // and added to this site only (5, 8, 9 and 11 run that way). 12: already installed: the server-wide lists are left alone.
 // 13: it cannot be taken out of the server-wide lists: the feature is removed again and upload stays off.
 const logged=fail=>writeFileSync(path.join(inetsrv,'set'),`const a=process.argv.slice(2).join(' ');require('fs').appendFileSync(${JSON.stringify(setLog)},a+'\\n');process.exit(${fail?"a.startsWith('config /section:system.webServer/handlers /-')":'false'}?1:0);\n`);
 server=await serve();
 try{
  fresh();logged(false);
  const already=await run(write('s12.bat',adminWindow(src,dismOn)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls12=readLog(setLog);
  if(/system\.webServer\/(handlers|modules) \/-/.test(calls12))already.out+='\nthe server-wide WebDAV entries were changed';
  check('12. WebDAV Publishing already installed: the server-wide lists are left alone, upload on',already,[upload,UPLOAD_TEST,'=== DONE ==='],0,['the server-wide WebDAV entries were changed','WebDAV is on for site']);
  fresh();logged(true);
  const global=await run(write('s13.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),dism13=readLog(dismLog),calls13=readLog(setLog);
  if(!dism13.includes('/disable-feature /featurename:IIS-WebDAV'))global.out+='\nWebDAV Publishing was not removed again';
  if(calls13.includes('webdav/authoring /enabled:true'))global.out+='\nWebDAV writing was switched on';
  check('13. WebDAV cannot be limited to this site: the feature is removed again, upload off, site deployed',global,['[!] Upload to server was NOT turned on: WebDAV could not be limited to this site, so it was removed again','=== DONE ==='],0,['Upload to server: on','WebDAV Publishing was not removed again','WebDAV writing was switched on',UPLOAD_TEST,UPLOAD_TEST_FAILED]);
  // 5, 8, 9 and 11 took WebDAV out of the server-wide lists and added it to this site.
  fresh();logged(false);
  const scoped=await run(write('s5b.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls5=readLog(setLog);
  // appcmd gets the arguments without their quotes.
  for(const step of ["config /section:system.webServer/handlers /-[name='WebDAV']","config /section:system.webServer/modules /-[name='WebDAVModule']",'config LogisticsTool /section:system.webServer/modules /+',"config LogisticsTool /section:system.webServer/handlers /+[@start,name='WebDAV'"])if(!calls5.includes(step))scoped.out+=`\nmissing appcmd step: ${step}`;
  check('5b. WebDAV newly installed: taken out of the server-wide lists and added to this site only',scoped,[upload,'WebDAV is on for site LogisticsTool only',UPLOAD_TEST,'=== DONE ==='],0,['missing appcmd step']);
 }
 finally{server.close();fake(true);}
 // 14-17 (A group, owner 2026-11-02): signed-in users may change only the 7 data files, never index.html or the folder.
 // The rights are read back with the real icacls as SDDL: (A;;0x1301bf;;;AU) is Modify for Authenticated Users on that
 // file itself (no ID: not inherited); any ";;;AU)" on the folder or index.html is a right they must not have.
 const DATA=['logistics-data.json','logistics-data.previous.json','logistics-data.previous-2.json','logistics-data.previous-3.json','logistics-data.previous-4.json','logistics-data.previous-5.json','logistics-data.check.json'];
 const AU_MODIFY='(A;;0x1301bf;;;AU)',CHECK_FILE='logistics-data.check.json',SHARED=DATA.filter(f=>f!==CHECK_FILE);
 const DENY_ALL="[accessType='Deny',users='*',verbs='DELETE,MKCOL,COPY,MOVE,PROPPATCH,LOCK,UNLOCK']";
 const aclOf=file=>{const out=path.join(dir,'acl.txt');rmSync(out,{force:true});spawnSync(realIcacls,[file,'/save',out]);return existsSync(out)?readFileSync(out,'utf16le').split(/\r?\n/)[1]||'':'';};
 // V18 to V19.3 left Modify for signed-in users on the whole folder; 14 and 15 start from there.
 const oldDeploy=()=>{spawnSync(realIcacls,[target,'/grant','*S-1-5-11:(OI)(CI)M']);return aclOf(path.join(target,'index.html')).includes(';;;AU)');};
 // V20 review: a new NTFS drive (D:\ by default) gives signed-in users Modify on every folder made on it, inherited. The
 // folder above the target stands in for the drive; earlier runs switched inheritance off, so it is switched on again.
 const driveDefault=()=>{spawnSync(realIcacls,[dir,'/grant','*S-1-5-11:(OI)(CI)(IO)M']);spawnSync(realIcacls,[target,'/inheritance:e']);return /ID;[^;]*;;;AU\)/.test(aclOf(path.join(target,'index.html')));};
 const driveDefaultOff=()=>spawnSync(realIcacls,[dir,'/remove:g','*S-1-5-11']);
 const icaclsLines=calls=>calls.split(/\r?\n/).filter(line=>line.startsWith('icacls '));
 // The rights and calls every run with upload on must show; each problem is added to the output as "problem: ...".
 const rightsProblems=calls=>{
  const problems=[],lines=icaclsLines(calls),on=calls.indexOf('webdav/authoring /enabled:true'),remove=calls.indexOf(`icacls "${target}" /remove:g "*S-1-5-11"`);
  if(remove<0)problems.push('the folder-wide right of signed-in users was not removed');
  const inherit=calls.indexOf(`icacls "${target}" /inheritance:d`);
  if(inherit<0||inherit>remove)problems.push('inheritance from the drive was not switched off before the removal');
  // The tool only GETs and PUTs: deleting, moving or locking the data files is refused for everyone, before writing is on.
  const deny=calls.indexOf(`authorization /+${DENY_ALL}`);
  if(!calls.includes(`authorization /-${DENY_ALL}`)||deny<0||(on>=0&&deny>on))problems.push('deleting and moving the data files is not refused for everyone before writing is switched on');
  for(const f of DATA){
   const file=path.join(target,f),grant=calls.indexOf(`icacls "${file}" /grant "*S-1-5-11:M"`);
   if(!calls.includes(`/-[users='*',path='${f}']`)||!calls.includes(`/+[users='*',path='${f}',access='Read, Write']`))problems.push(`no WebDAV rule for ${f}`);
   if(grant<0)problems.push(`no file right for ${f}`);
   else if(grant<remove||(on>=0&&grant>on))problems.push(`the right for ${f} is not given between the folder clean-up and switching writing on`);
   if(!aclOf(file).includes(AU_MODIFY))problems.push(`${f} cannot be changed by signed-in users`);
  }
  if(lines.some(line=>/index\.html|\(OI\)|\(CI\)/i.test(line)))problems.push(`an icacls call gives signed-in users more than the data files: ${lines.join(' / ')}`);
  for(const f of [target,path.join(target,'index.html')])if(aclOf(f).includes(';;;AU)'))problems.push(`signed-in users still have a right on ${path.basename(f)}`);
  return problems;
 };
 const problems=(result,list)=>{if(list.length)result.out+=list.map(p=>`\nproblem: ${p}`).join('');return result;};
 server=await serve();
 try{
  // 14: a normal deploy on a server that ran V18-V19.3 (the folder-wide right is there), no data files yet.
  fresh();logged(false);requests.length=0;for(const f of DATA)rmSync(path.join(target,f),{force:true});
  const hadDrive=driveDefault(),hadOld=oldDeploy();
  const normal=await run(write('s14.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls14=readLog(setLog),list14=rightsProblems(calls14);
  if(!hadOld)list14.push('the folder-wide right of V18-V19.3 could not be set up before the run');
  if(!hadDrive)list14.push('the inherited right of a new drive could not be set up before the run');
  for(const f of SHARED)if(!existsSync(path.join(target,f))||statSync(path.join(target,f)).size!==0)list14.push(`${f} was not created empty`);
  if(!/^\{"check":"[^"]+"\}$/.test(readLog(path.join(target,CHECK_FILE))))list14.push(`${CHECK_FILE} does not hold the upload test text`);
  if(!requests.join(' ').includes(`PUT /${CHECK_FILE} GET /${CHECK_FILE}`))list14.push(`no PUT and read-back of ${CHECK_FILE}: ${requests.join(' ')}`);
  check('14. normal deploy after V18-V19.3: 7 WebDAV rules, folder and index.html read-only, 7 empty data files changeable, upload test passes',problems(normal,list14),[upload,'Signed-in users may change only the logistics-data*.json files',UPLOAD_TEST,'=== DONE ===','To undo a bad upload: in the tool open Import data, then "Put back an earlier upload".','To stop uploads later:'],0,['problem:',UPLOAD_TEST_FAILED,'by hand copy']);
  // 15: the data files are already there with the shared data: never overwritten, and still changeable.
  fresh();logged(false);requests.length=0;
  const kept=Object.fromEntries(DATA.map(f=>[f,`{"kept":"${f}","note":"shared data, must not be replaced"}`]));
  for(const f of DATA)writeFileSync(path.join(target,f),kept[f]);
  const times=Object.fromEntries(SHARED.map(f=>[f,statSync(path.join(target,f)).mtimeMs]));
  driveDefault();oldDeploy();
  const existing=await run(write('s15.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),list15=rightsProblems(readLog(setLog));
  for(const f of SHARED){const file=path.join(target,f);if(readLog(file)!==kept[f]||statSync(file).mtimeMs!==times[f])list15.push(`${f} was changed`);}
  if(!/^\{"check":"[^"]+"\}$/.test(readLog(path.join(target,CHECK_FILE))))list15.push(`${CHECK_FILE} does not hold the upload test text`);
  check('15. data files already there with data: not overwritten, still changeable by signed-in users',problems(existing,list15),[upload,UPLOAD_TEST,'=== DONE ==='],0,['problem:',UPLOAD_TEST_FAILED]);
  driveDefaultOff();
 }
 finally{server.close();fake(true);}
 // 16: the upload test is refused with 401 (Windows sign-in not accepted): a warning only; DONE, and one pause at the end.
 server=await serve({putStatus:401});
 try{
  fresh();logged(false);
  const refused=await run(write('s16.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),list16=[];
  const pause='Press any key to close this window...',pauses=refused.out.split(pause).length-1;
  if(pauses!==1||refused.out.indexOf(pause)<refused.out.indexOf('=== DONE ==='))list16.push(`the window waits ${pauses} times, not once at the end`);
  check('16. the upload test gets 401: warned, the deploy still reaches DONE and pauses only at the end',problems(refused,list16),[upload,'[6/6] OK  http://localhost:8083/ responds','[!] Upload test failed: HTTP 401.','This usually means: Windows sign-in was not accepted for this account.','The site itself works, and the tool can still be used without Upload to server.','=== DONE ===',pause],0,['problem:','*** Stopped.',UPLOAD_TEST]);
 }
 finally{server.close();fake(true);}
 // 17: one data file cannot get its right: upload is turned off with the reason, writing is never on, the deploy goes on.
 server=await serve();
 try{
  fresh();logged(false);requests.length=0;
  const denied=await run(write('s17.bat',adminWindow(src,dismOk,icaclsFail)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls17=readLog(setLog),list17=[];
  if(calls17.includes('webdav/authoring /enabled:true'))list17.push('WebDAV writing was switched on');
  if(!calls17.includes('webdav/authoring /enabled:false'))list17.push('WebDAV writing was not switched off');
  if(requests.some(r=>r.startsWith('PUT')))list17.push('an upload test ran with upload off');
  check('17. one data file cannot get its right: upload off with the reason, the deploy goes on',problems(denied,list17),[`[!] Upload to server was NOT turned on: signed-in users could not be allowed to change ${path.join(target,FAIL_FILE)}. Nobody can upload; the tool works as before.`,'[6/6] OK  http://localhost:8083/ responds','=== DONE ===','Press any key to close this window...'],0,['problem:','Upload to server: on',UPLOAD_TEST,UPLOAD_TEST_FAILED,'To undo a bad upload','*** Stopped.']);
 }
 finally{server.close();fake(true);}
 // 18 (V20): the rule that refuses DELETE and MOVE for everyone cannot be set: upload is turned off with the reason before
 // any data file gets a right, writing is never on, the deploy goes on.
 server=await serve();
 try{
  fresh();requests.length=0;
  writeFileSync(path.join(inetsrv,'set'),`const a=process.argv.slice(2).join(' ');require('fs').appendFileSync(${JSON.stringify(setLog)},a+'\\n');process.exit(a.includes(${JSON.stringify(`authorization /+${DENY_ALL}`)})?1:0);\n`);
  const blocked=await run(write('s18.bat',adminWindow(src)),['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),calls18=readLog(setLog),list18=[];
  if(!calls18.includes(`authorization /+${DENY_ALL}`))list18.push('the rule was not tried');
  if(calls18.includes('webdav/authoring /enabled:true'))list18.push('WebDAV writing was switched on');
  if(!calls18.includes('webdav/authoring /enabled:false'))list18.push('WebDAV writing was not switched off');
  if(icaclsLines(calls18).some(line=>line.includes('/grant')))list18.push('a data file got a right although upload is off');
  if(requests.some(r=>r.startsWith('PUT')))list18.push('an upload test ran with upload off');
  check('18. deleting and moving cannot be refused: upload off with the reason, the deploy goes on',problems(blocked,list18),['[!] Upload to server was NOT turned on: deleting or moving the data files could not be blocked. Nobody can upload; the tool works as before.','[6/6] OK  http://localhost:8083/ responds','=== DONE ===','Press any key to close this window...'],0,['problem:','Upload to server: on',UPLOAD_TEST,UPLOAD_TEST_FAILED,'To undo a bad upload','*** Stopped.']);
 }
 finally{server.close();fake(true);}
}catch(error){results.push(false);console.error(error.message);}
finally{rmSync(dir,{recursive:true,force:true});}
const failed=results.filter(ok=>!ok).length,summary=failed?`${failed} of ${results.length} checks failed.`:`All ${results.length} checks passed for ${DEPLOY_SCRIPT_NAME} (${VERSION}).`;
console.log(summary);
if(note)console.log(note);
// The result is kept for the README seals and certificate (npm run readme:art).
writeFileSync(path.resolve(process.cwd(),'..','verification','deploy-sim-results.txt'),[`npm run deploy:sim · ${new Date().toLocaleDateString('sv-SE')} · ${DEPLOY_SCRIPT_NAME} ${VERSION}${packaged?'':' (current template, not packaged yet: see the note)'}`,...report,summary,...(note?[note]:[]),''].join('\n'));
process.exit(failed?1:0);

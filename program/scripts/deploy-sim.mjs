// Runs the generated IIS deploy script on this Windows PC without UAC and without IIS, in ten situations, and checks
// that every run ends with a readable message (owner report 2026-10-22: the window closed on the server). Windows only.
//
//   npm run deploy:sim
//
// Run it after npm run release:files and before publishing. It uses offline/deploy-iis.bat and the release ZIP of
// scripts/release.mjs (which holds the HTML and the same script), works in a new folder under %TEMP% and removes it
// afterwards. Nothing is installed, no UAC prompt appears and no IIS setting is touched: the UAC request and the new
// window are printed instead of opened, and appcmd is a stand-in (a copy of node.exe that runs small scripts) in a fake
// inetsrv folder.
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
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RELEASE_VERSION,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME} from './release.mjs';
import {readZip,storedZip} from './deploy-script.mjs';

if(process.platform!=='win32'){console.error('deploy:sim needs Windows (cmd.exe).');process.exit(2);}
const offline=path.resolve(process.cwd(),'..','offline'),bat=path.join(offline,DEPLOY_SCRIPT_NAME),zip=path.join(offline,RELEASE_ZIP_NAME);
for(const file of [bat,zip])if(!existsSync(file)){console.error(`Missing ${file}. Run npm run export:offline and npm run release:files first.`);process.exit(2);}
const src=readFileSync(bat,'utf8'),VERSION=RELEASE_VERSION.toUpperCase();
const swap=(text,pairs)=>{for(const [a,b] of pairs){if(text.split(a).length!==2)throw Error(`deploy:sim needs updating: "${a.slice(0,60)}" is not in ${DEPLOY_SCRIPT_NAME} exactly once.`);text=text.replace(a,()=>b);}return text;};
const UAC='Start-Process -FilePath cmd.exe -Verb RunAs -ErrorAction Stop -ArgumentList';
const START=`start "Logistics Tool ${VERSION} : IIS deploy" cmd.exe /k call`;
const asAdmin=text=>text.split('fltmc >nul 2>&1').join('ver >nul');

const dir=mkdtempSync(path.join(tmpdir(),'logistics-deploy-sim-')),home=path.join(dir,'home'),downloads=path.join(home,'Downloads'),target=path.join(dir,'target'),inetsrv=path.join(dir,'inetsrv');
for(const d of [downloads,target,inetsrv])mkdirSync(d,{recursive:true});
copyFileSync(zip,path.join(dir,RELEASE_ZIP_NAME));
copyFileSync(process.execPath,path.join(inetsrv,'appcmd.exe'));
const fake=siteExists=>{
 writeFileSync(path.join(inetsrv,'list'),`const a=process.argv.slice(2).join(' ');if(a.includes('/text:bindings')){console.log('http/*:8083:');process.exit(0);}if(a.includes('/name:'))process.exit(${siteExists?0:1});process.exit(0);\n`);
 for(const f of ['add','set','start'])writeFileSync(path.join(inetsrv,f),'process.exit(0);\n');
};
// The Administrator window: rights granted, and appcmd in the fake inetsrv folder.
const adminWindow=text=>swap(asAdmin(text),[['set "INETSRV=%windir%\\system32\\inetsrv"',`set "INETSRV=${inetsrv}"`]]);
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
try{
 fake(false);
 check('1. not Administrator, UAC accepted',await run(write('s1.bat',swap(src,[[UAC,'Write-Output -InputObject']]))),['Not elevated',ELEVATED],0);
 if(!existsSync(path.join(downloads,DEPLOY_SCRIPT_NAME))){results.push(false);console.log('FAIL  1b. the stable copy in Downloads was not written');}
 check('2. not Administrator, UAC cancelled',await run(write('s2.bat',swap(src,[[UAC,"throw 'The operation was canceled by the user.'; Write-Output"]]))),['[X] Windows did not open the Administrator window','Run as administrator','Press any key to close this window...'],1);
 check('3. already Administrator',await run(write('s3.bat',swap(asAdmin(src),[[START,'echo WOULD START cmd.exe /k call']]))),[`WOULD START cmd.exe ${ELEVATED}`],0);
 const adminBat=write('s4.bat',adminWindow(src));
 check('4. Administrator window, new site, current-directory lookup disabled, no web server',await run(adminBat,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),['[1/6] OK  port 8083 is free','[2/6] OK  extracted and SHA-256 verified','[3/6] OK  index.html written','[5/6] OK','[!] Deployed, but the local test failed','*** Stopped. See the message above. ***','Press any key to close this window...'],1);
 fake(true);
 const serve=async()=>{
  const server=createServer((request,response)=>response.end(readFileSync(path.join(target,'index.html'))));
  await new Promise((resolve,reject)=>server.once('error',reject).listen(8083,'127.0.0.1',resolve));
  return server;
 };
 let server=await serve();
 try{check('5. Administrator window, existing site, web server answering',await run(adminBat,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),['redeploy mode','old index.html backed up','[6/6] OK  http://localhost:8083/ responds','=== DONE ===','Press any key to close this window...'],0);}
 finally{server.close();}
 // 6-7: the script in a folder without the zip, so only Downloads is searched.
 const other=path.join(dir,'other');mkdirSync(other);const elsewhere=write(path.join('other','s6.bat'),readFileSync(adminBat,'utf8'));
 const renamed=path.join(downloads,RELEASE_ZIP_NAME.replace(/\.zip$/,' (1).zip'));copyFileSync(zip,renamed);
 check('6. the zip in Downloads saved as "name (1).zip"',await run(elsewhere,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),[`[1/6] OK  zip: ${renamed}`,'[2/6] OK  extracted and SHA-256 verified'],1);
 rmSync(renamed);writeFileSync(path.join(downloads,'logistics-offline-20200101-v1.zip'),'not this release');
 check('7. only another release in Downloads',await run(elsewhere,['8083',target,'ELEVATED']),[`[X] ${RELEASE_ZIP_NAME} not found next to this script or in Downloads.`,'Release zips now in Downloads:','logistics-offline-20200101-v1.zip','Press any key to close this window...'],1);
 server=await serve();
 try{
  const done=['[2/6] OK  extracted and SHA-256 verified','[3/6] OK  index.html written','[6/6] OK  http://localhost:8083/ responds','=== DONE ===','Press any key to close this window...'];
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
}catch(error){results.push(false);console.error(error.message);}
finally{rmSync(dir,{recursive:true,force:true});}
const failed=results.filter(ok=>!ok).length,summary=failed?`${failed} of ${results.length} checks failed.`:`All ${results.length} checks passed for ${DEPLOY_SCRIPT_NAME} (${VERSION}).`;
console.log(summary);
// The result is kept for the README seals and certificate (npm run readme:art).
writeFileSync(path.resolve(process.cwd(),'..','verification','deploy-sim-results.txt'),[`npm run deploy:sim · ${new Date().toLocaleDateString('sv-SE')} · ${DEPLOY_SCRIPT_NAME} ${VERSION}`,...report,summary,''].join('\n'));
process.exit(failed?1:0);

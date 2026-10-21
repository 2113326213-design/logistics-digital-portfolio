// Runs the generated IIS deploy script on this Windows PC without UAC and without IIS, in five situations, and checks
// that every run ends with a readable message (owner report 2026-10-22: the window closed on the server). Windows only.
//
//   npm run deploy:sim
//
// Run it after npm run release:files and before publishing. It uses offline/deploy-iis.bat and the release ZIP of
// scripts/release.mjs, works in a new folder under %TEMP% and removes it afterwards. Nothing is installed, no UAC prompt
// appears and no IIS setting is touched: the UAC request and the new window are printed instead of opened, and appcmd
// is a stand-in (a copy of node.exe that runs small scripts) in a fake inetsrv folder.
//   1. not Administrator, UAC accepted  -> asks for the cmd /k Administrator window, copy in Downloads
//   2. not Administrator, UAC cancelled -> says so and waits for a key
//   3. already Administrator            -> continues in a new cmd /k window
//   4. Administrator window, new site, current-directory lookup disabled (NoDefaultCurrentDirectoryInExePath=1),
//      no web server                    -> steps 1-5 pass, the smoke test fails with a message and waits for a key
//   5. Administrator window, existing site, local web server -> [6/6] OK and === DONE ===
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RELEASE_VERSION,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME} from './release.mjs';

if(process.platform!=='win32'){console.error('deploy:sim needs Windows (cmd.exe).');process.exit(2);}
const offline=path.resolve(process.cwd(),'..','offline'),bat=path.join(offline,DEPLOY_SCRIPT_NAME),zip=path.join(offline,RELEASE_ZIP_NAME);
for(const file of [bat,zip])if(!existsSync(file)){console.error(`Missing ${file}. Run npm run export:offline and npm run release:files first.`);process.exit(2);}
const src=readFileSync(bat,'utf8'),VERSION=RELEASE_VERSION.toUpperCase();
const swap=(text,pairs)=>{for(const [a,b] of pairs){if(text.split(a).length!==2)throw Error(`deploy:sim needs updating: "${a.slice(0,60)}" is not in ${DEPLOY_SCRIPT_NAME} exactly once.`);text=text.replace(a,()=>b);}return text;};
const UAC='Start-Process -FilePath cmd.exe -Verb RunAs -ErrorAction Stop -ArgumentList';
const START=`start "Logistics Tool ${VERSION} : IIS deploy" cmd.exe /k call`;
const asAdmin=text=>text.split('fltmc >nul 2>&1').join('ver >nul');

const dir=mkdtempSync(path.join(tmpdir(),'logistics-deploy-sim-')),home=path.join(dir,'home'),target=path.join(dir,'target'),inetsrv=path.join(dir,'inetsrv');
for(const d of [path.join(home,'Downloads'),target,inetsrv])mkdirSync(d,{recursive:true});
copyFileSync(zip,path.join(dir,RELEASE_ZIP_NAME));
copyFileSync(process.execPath,path.join(inetsrv,'appcmd.exe'));
const fake=siteExists=>{
 writeFileSync(path.join(inetsrv,'list'),`const a=process.argv.slice(2).join(' ');if(a.includes('/text:bindings')){console.log('http/*:8083:');process.exit(0);}if(a.includes('/name:'))process.exit(${siteExists?0:1});process.exit(0);\n`);
 for(const f of ['add','set','start'])writeFileSync(path.join(inetsrv,f),'process.exit(0);\n');
};
const write=(name,text)=>{const file=path.join(dir,name);writeFileSync(file,text);return file;};
const run=(file,args=[],env={})=>new Promise(resolve=>{
 const child=spawn('cmd.exe',['/d','/c',file,...args],{cwd:dir,env:{...process.env,USERPROFILE:home,...env},windowsVerbatimArguments:false});
 let out='';child.stdout.on('data',d=>out+=d.toString('latin1'));child.stderr.on('data',d=>out+=d.toString('latin1'));child.stdin.end();
 child.on('close',code=>resolve({code,out}));
});
const results=[];
const check=(name,{code,out},expected,exitCode)=>{
 const missing=expected.filter(text=>!out.includes(text)),ok=!missing.length&&code===exitCode;
 results.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${name}${ok?'':`\n      exit ${code} (expected ${exitCode}); missing: ${missing.join(' | ')}\n${out.split(/\r?\n/).filter(Boolean).slice(-12).map(l=>'      > '+l).join('\n')}`}`);
};
const ELEVATED=`/k call "${path.join(home,'Downloads',DEPLOY_SCRIPT_NAME)}" 8083 "D:\\logistics-tool" ELEVATED`;
try{
 fake(false);
 check('1. not Administrator, UAC accepted',await run(write('s1.bat',swap(src,[[UAC,'Write-Output -InputObject']]))),['Not elevated',ELEVATED],0);
 if(!existsSync(path.join(home,'Downloads',DEPLOY_SCRIPT_NAME))){results.push(false);console.log('FAIL  1b. the stable copy in Downloads was not written');}
 check('2. not Administrator, UAC cancelled',await run(write('s2.bat',swap(src,[[UAC,"throw 'The operation was canceled by the user.'; Write-Output"]]))),['[X] Windows did not open the Administrator window','Run as administrator','Press any key to close this window...'],1);
 check('3. already Administrator',await run(write('s3.bat',swap(asAdmin(src),[[START,'echo WOULD START cmd.exe /k call']]))),[`WOULD START cmd.exe ${ELEVATED}`],0);
 const adminBat=write('s4.bat',swap(asAdmin(src),[['set "INETSRV=%windir%\\system32\\inetsrv"',`set "INETSRV=${inetsrv}"`]]));
 check('4. Administrator window, new site, current-directory lookup disabled, no web server',await run(adminBat,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),['[1/6] OK  port 8083 is free','[2/6] OK  extracted and SHA-256 verified','[3/6] OK  index.html written','[5/6] OK','[!] Deployed, but the local test failed','*** Stopped. See the message above. ***','Press any key to close this window...'],1);
 fake(true);
 const server=createServer((request,response)=>response.end(readFileSync(path.join(target,'index.html'))));
 await new Promise((resolve,reject)=>server.once('error',reject).listen(8083,'127.0.0.1',resolve));
 try{check('5. Administrator window, existing site, web server answering',await run(adminBat,['8083',target,'ELEVATED'],{NoDefaultCurrentDirectoryInExePath:'1'}),['redeploy mode','old index.html backed up','[6/6] OK  http://localhost:8083/ responds','=== DONE ===','Press any key to close this window...'],0);}
 finally{server.close();}
}catch(error){results.push(false);console.error(error.message);}
finally{rmSync(dir,{recursive:true,force:true});}
const failed=results.filter(ok=>!ok).length;
console.log(failed?`${failed} of ${results.length} checks failed.`:`All ${results.length} checks passed for ${DEPLOY_SCRIPT_NAME} (${VERSION}).`);
process.exit(failed?1:0);

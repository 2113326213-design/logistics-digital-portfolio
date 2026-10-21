// The IIS deploy script follows every release automatically (owner request 2026-10-21). It is generated from
// scripts/deploy-iis.template.bat, the script tested on the IIS server for V9.15; npm run export:offline writes it next to
// the offline HTML and npm run release:files puts it into the package's offline/ folder with the release ZIP.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deployScript,storedZip,readZip,sha256,DEPLOY_TEMPLATE} from '../scripts/deploy-script.mjs';
import {RELEASE_VERSION,OFFLINE_FILE_NAME,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,DEPLOY_ZIP_NAME} from '../scripts/release.mjs';

const packageFile=name=>fileURLToPath(new URL(`../../offline/${name}`,import.meta.url));
const GENERATED_NOTE=/^rem  Generated for this release by program\/scripts\/deploy-script\.mjs .*\r\n/m;

// Steps [2/6] to the end are the V9.15 script tested on the server, with appcmd called by its full path (fix 2026-10-22).
const fromStep2=text=>text.slice(text.indexOf('rem ---- [2/6]'));
const fullPathAppcmd=text=>text.replace(/^(\s*(?:if errorlevel 1 )?)appcmd /gm,'$1"%APPCMD%" ').replace(`in ('appcmd list site`,`in ('call "%APPCMD%" list site`);

test('steps 2 to 6 are the V9.15 script tested on the server, with appcmd by full path and the clearer mismatch message',()=>{
 const handWritten=packageFile('deploy-iis-v9.15.bat'),html=packageFile('物流工具_最新版_离线单文件_20261020_v9.15.html');
 if(!existsSync(handWritten)||!existsSync(html))return;// a bare program/ checkout has no package folder
 const expected=readFileSync(handWritten,'utf8');
 const generated=deployScript({html:readFileSync(html),version:'v9.15',zipName:'logistics-offline-20261020-v9.15.zip',scriptName:'deploy-iis-v9.15.bat'});
 assert.equal(sha256(readFileSync(html)),'a1af36d4e87b6eb3cea4673cef29a9f1ba129241e4e9e296320242ee2b6a6658','the hash the V9.15 script checks');
 const clearer='echo [X] SHA-256 mismatch - the zip is not the expected V9.15 build ^(logistics-offline-20261020-v9.15.zip^). Download the zip and the script of the same release. Stopping.';
 assert.equal(fromStep2(generated).replace(clearer,'echo [X] SHA-256 mismatch - the zip is not the expected V9.15 build. Stopping.'),fullPathAppcmd(fromStep2(expected)));
 // The settings block and the header are unchanged apart from the generated note and APPCMD.
 const head=text=>text.slice(0,text.indexOf('rem ---- [1/6]'));
 assert.equal(head(generated).replace(GENERATED_NOTE,'').replace('set "APPCMD=%INETSRV%\\appcmd.exe"\r\n',''),head(expected));
});

test('owner report 2026-10-22 (the window closed on the server): every run stays in a window that waits, and appcmd never depends on the current directory',()=>{
 const script=deployScript({html:Buffer.from('<html>test</html>'),version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 // With current-directory lookup disabled (NoDefaultCurrentDirectoryInExePath), a bare "appcmd" is not found and cmd
 // ended the script right after "[1/6] OK zip" without a message (reproduced 2026-10-22).
 assert.match(script,/^set "APPCMD=%INETSRV%\\appcmd\.exe"\r$/m);
 assert.doesNotMatch(script,/^\s*(?:if [^\r\n]*?\s)?appcmd\s/m,'no bare appcmd call');
 assert.equal(script.match(/"%APPCMD%" /g).length,8);
 // Not Administrator: UAC opens a cmd /k window; a cancelled or blocked request is reported and waits for a key.
 assert.match(script,/Start-Process -FilePath cmd\.exe -Verb RunAs -ErrorAction Stop -ArgumentList \('\/k call \\"' \+ \$env:SELF/);
 assert.match(script,/if not errorlevel 1 exit \/b 0\r\necho \[X\] Windows did not open the Administrator window[^\r]*\r\necho [^\r]*Run as administrator[^\r]*\r\necho Press any key to close this window\.\.\.\r\npause >nul\r\nexit \/b 1\r\n/);
 // Already Administrator (Run as administrator): the deploy also continues in a cmd /k window.
 assert.match(script,/fltmc >nul 2>&1\r\nif errorlevel 1 goto :elevate\r\nstart "Logistics Tool V1\.2 : IIS deploy" cmd\.exe \/k call "%SELF%" %PORT% "%TARGET%" ELEVATED\r\nexit \/b 0\r\n/);
 // The window that runs the deploy checks the rights again before doing anything.
 assert.match(script,/:inwindow\r\nfltmc >nul 2>&1\r\nif not errorlevel 1 goto :isadmin\r\necho \[X\] Still not Administrator[^\r]*\r\ngoto :fail\r\n:isadmin\r\n/);
 // Every other end of the script waits for a key first.
 const lines=script.split('\r\n');
 lines.forEach((line,i)=>{if(/^exit \/b 1$/.test(line))assert(lines.slice(i-2,i).includes('pause >nul'),`line ${i+1}`);});
 assert.deepEqual(lines.flatMap((line,i)=>/^exit \/b 0$/.test(line)?[lines[i-1].split(' ').slice(0,2).join(' ')]:[]),['start "Logistics','endlocal']);
});

test('every placeholder is filled with the release values, and the script uses CRLF only',()=>{
 const html=Buffer.from('<html>test</html>'),script=deployScript({html,version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 assert.doesNotMatch(script,/\{\{|\}\}/);
 assert.match(script,/set "ZIPNAME=logistics-offline-20300101-v1\.2\.zip"\r\n/);
 assert.match(script,new RegExp(`set "EXPECT_SHA256=${sha256(html)}"\\r\\n`));
 assert.match(script,/echo === Logistics Tool V1\.2 : IIS deploy ===\r\n/);
 assert.match(script,/set "SELF=%USERPROFILE%\\Downloads\\deploy-iis\.bat"\r\n/);
 assert.match(script,/set "TMPX=%TEMP%\\logistics-v1\.2-extract"\r\n/);
 assert.doesNotMatch(script.replace(/\r\n/g,''),/[\r\n]/,'no bare CR or LF');
 assert.throws(()=>deployScript({html,template:'{{UNKNOWN}}'}),/Unknown placeholder \{\{UNKNOWN\}\}/);
 assert.match(readFileSync(DEPLOY_TEMPLATE,'utf8'),/\{\{SHA256\}\}/);
});

test('stored ZIPs are deterministic, read back exactly, and the reader also opens deflated ZIPs',()=>{
 const entries=[['deploy-iis.bat',Buffer.from('@echo off\r\n')],['物流.html',Buffer.from('<p>数据</p>')]];
 const zip=storedZip(entries,'2026-10-21');
 assert.deepEqual(zip,storedZip(entries,'2026-10-21'),'same input, same bytes');
 assert.deepEqual([...readZip(zip)],entries.map(([name,data])=>[name,data]));
 const old=packageFile('deploy-iis-v9.15-script.zip');
 if(existsSync(old))assert.deepEqual([...readZip(readFileSync(old)).keys()],['deploy-iis-v9.15.bat']);
});

test('npm run export:offline writes the deploy script and npm run release:files packages it',()=>{
 const exporter=readFileSync(new URL('../scripts/export-offline.mjs',import.meta.url),'utf8');
 assert(exporter.includes("for(const file of writeDeployFiles(path.join(root,'outputs'),Buffer.from(markup)))console.log(file);"));
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['release:files'],'node scripts/release-files.mjs');
 assert.deepEqual([DEPLOY_SCRIPT_NAME,DEPLOY_ZIP_NAME],['deploy-iis.bat','deploy-iis-script.zip'],'stable names, so the README link never changes');
});

test('a packaged release always has the deploy script for that exact build',()=>{
 const html=packageFile(OFFLINE_FILE_NAME);
 if(!existsSync(html))return;// not packaged yet: npm run release:files creates the files checked here
 const bytes=readFileSync(html),hint='Run npm run export:offline and npm run release:files.';
 assert(existsSync(packageFile(DEPLOY_SCRIPT_NAME)),`offline/${DEPLOY_SCRIPT_NAME} is missing. ${hint}`);
 assert.equal(readFileSync(packageFile(DEPLOY_SCRIPT_NAME),'utf8'),deployScript({html:bytes}),`offline/${DEPLOY_SCRIPT_NAME} is not the script for ${RELEASE_VERSION}. ${hint}`);
 assert.deepEqual([...readZip(readFileSync(packageFile(DEPLOY_ZIP_NAME)))].map(([name,data])=>[name,data.toString('utf8')]),[[DEPLOY_SCRIPT_NAME,deployScript({html:bytes})]],`offline/${DEPLOY_ZIP_NAME} is out of date. ${hint}`);
 const releaseHtml=[...readZip(readFileSync(packageFile(RELEASE_ZIP_NAME)))].filter(([name])=>/\.html$/i.test(name));
 assert.equal(releaseHtml.length,1);assert.equal(sha256(releaseHtml[0][1]),sha256(bytes),`offline/${RELEASE_ZIP_NAME} holds another build`);
});

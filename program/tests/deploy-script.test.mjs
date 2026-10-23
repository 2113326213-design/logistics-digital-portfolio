// The IIS deploy script follows every release automatically (owner request 2026-10-21). It is generated from
// scripts/deploy-iis.template.bat, the script tested on the IIS server for V9.15; npm run export:offline writes it next to
// the offline HTML and npm run release:files puts it into the package's offline/ folder. Since the owner report of
// 2026-10-22 (twice only the separate script ZIP was downloaded) it ships inside the release ZIP: one download.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployScript,storedZip,readZip,sha256,releaseZip,writeDeployFiles,DEPLOY_TEMPLATE} from '../scripts/deploy-script.mjs';
import {RELEASE_VERSION,OFFLINE_FILE_NAME,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,OLD_DEPLOY_ZIP_NAME} from '../scripts/release.mjs';

const packageFile=name=>fileURLToPath(new URL(`../../offline/${name}`,import.meta.url));
const GENERATED_NOTE=/^rem  Generated for this release by program\/scripts\/deploy-script\.mjs .*\r\n/m;

// Steps [2/6] to the end are the V9.15 script tested on the server, with appcmd called by its full path (fix 2026-10-22)
// and a mismatch message that names the one download (2026-10-22).
const fromStep2=text=>text.slice(text.indexOf('rem ---- [2/6]'));
// V13.2 review finding: every release of one date has the same file time in its zip, so index.html gets the deploy time.
const DEPLOY_TIME='rem Every release of one date has the same file time inside its zip, and IIS answers a browser\'s "changed since?"\r\n'+
 'rem check from that time: give index.html the deploy time, so a later deploy on the same day is never served from cache.\r\n'+
 'powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Item -LiteralPath ($env:TARGET + \'\\index.html\')).LastWriteTime = Get-Date"\r\n'+
 'if errorlevel 1 echo [!] Could not set the time of index.html; if a browser shows the previous version, press Ctrl+F5.\r\n';

test('V13.2 review: index.html gets the deploy time right after the copy, so a same-day redeploy is not served from cache',()=>{
 const script=deployScript({html:Buffer.from('<html>test</html>')});
 const copy=script.indexOf('copy /y "%SRC%" "%TARGET%\\index.html" >nul'),stamp=script.indexOf(DEPLOY_TIME),written=script.indexOf('echo [3/6] OK  index.html written');
 assert(copy>0&&stamp>copy&&written===stamp+DEPLOY_TIME.length,'the time is set after the copy succeeded and before [3/6] OK');
 assert.doesNotMatch(DEPLOY_TIME,/goto :fail/,'a failed time stamp only warns; the deploy itself succeeded');
});
const fullPathAppcmd=text=>text.replace(/^(\s*(?:if errorlevel 1 )?)appcmd /gm,'$1"%APPCMD%" ').replace(`in ('appcmd list site`,`in ('call "%APPCMD%" list site`);

test('steps 2 to 6 are the V9.15 script tested on the server, with appcmd by full path and the clearer mismatch message',()=>{
 const handWritten=packageFile('deploy-iis-v9.15.bat'),html=packageFile('物流工具_最新版_离线单文件_20261020_v9.15.html');
 if(!existsSync(handWritten)||!existsSync(html))return;// a bare program/ checkout has no package folder
 const expected=readFileSync(handWritten,'utf8');
 const generated=deployScript({html:readFileSync(html),version:'v9.15',zipName:'logistics-offline-20261020-v9.15.zip',scriptName:'deploy-iis-v9.15.bat'});
 assert.equal(sha256(readFileSync(html)),'a1af36d4e87b6eb3cea4673cef29a9f1ba129241e4e9e296320242ee2b6a6658','the hash the V9.15 script checks');
 const clearer='echo [X] SHA-256 mismatch - the HTML in the zip named at [1/6] is not the expected V9.15 build ^(logistics-offline-20261020-v9.15.zip^).\r\n'+
  '  echo     Delete that zip, save logistics-offline-20261020-v9.15.zip from the GitHub release in Downloads again, open it and double-click deploy-iis-v9.15.bat inside it. Stopping.';
 // The V18 upload block between [5/6] and [6/6] is new; the rest of steps 2 to 6 is unchanged.
 const upload=text=>text.slice(text.indexOf('rem ---- Upload to server (V18)'),text.indexOf('rem ---- [6/6]'));
 assert.equal(fromStep2(generated).replace(upload(generated),'').replace(clearer,'echo [X] SHA-256 mismatch - the zip is not the expected V9.15 build. Stopping.').replace(DEPLOY_TIME,''),fullPathAppcmd(fromStep2(expected)));
 // The settings block and the header are unchanged apart from the generated note, APPCMD and the one-download note.
 const head=text=>text.slice(0,text.indexOf('rem ---- [1/6]'));
 const oneDownload='rem  One download: logistics-offline-20261020-v9.15.zip holds the HTML and this script. Save it in\r\n'+
  'rem  %USERPROFILE%\\Downloads on the IIS server (Windows Server 2016+), open it\r\n'+
  'rem  and double-click deploy-iis-v9.15.bat; it asks for Administrator rights itself.\r\n';
 const before='rem  Run as Administrator on the IIS server (Windows Server 2016+).\r\nrem  The zip must be next to this script, or in %USERPROFILE%\\Downloads.\r\n';
 assert.equal(head(generated).replace(GENERATED_NOTE,'').replace('set "APPCMD=%INETSRV%\\appcmd.exe"\r\n','').replace(oneDownload,before),head(expected));
});

test('owner report 2026-10-22 (the window closed on the server): every run stays in a window that waits, and appcmd never depends on the current directory',()=>{
 const script=deployScript({html:Buffer.from('<html>test</html>'),version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 // With current-directory lookup disabled (NoDefaultCurrentDirectoryInExePath), a bare "appcmd" is not found and cmd
 // ended the script right after "[1/6] OK zip" without a message (reproduced 2026-10-22).
 assert.match(script,/^set "APPCMD=%INETSRV%\\appcmd\.exe"\r$/m);
 assert.doesNotMatch(script,/^\s*(?:if [^\r\n]*?\s)?appcmd\s/m,'no bare appcmd call');
 // 8 calls of the V9.15 steps and 13 in the V18 upload block.
 assert.equal(script.match(/"%APPCMD%" /g).length,21);
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
 assert.equal(DEPLOY_SCRIPT_NAME,'deploy-iis.bat','stable name: the copy in Downloads and the README use it');
});

test('owner report 2026-10-22 (twice only the script was downloaded): the release ZIP is one download with the HTML and the script that checks it',()=>{
 const html=Buffer.from('<html>test</html>'),script=deployScript({html,version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 const zip=releaseZip(html,script);
 assert.deepEqual([...readZip(zip)].map(([name,data])=>[name,data.toString('utf8')]),[[OFFLINE_FILE_NAME,'<html>test</html>'],[DEPLOY_SCRIPT_NAME,script]]);
 assert.deepEqual(zip,releaseZip(html,script),'same input, same bytes');
 // A script cannot hold the hash of the ZIP it is in: it checks the HTML next to it in the same ZIP.
 const entries=readZip(zip),shipped=entries.get(DEPLOY_SCRIPT_NAME).toString('utf8');
 assert.equal(shipped.match(/^set "EXPECT_SHA256=([0-9a-f]{64})"\r$/m)[1],sha256(entries.get(OFFLINE_FILE_NAME)));
 assert.deepEqual(releaseZip(html),releaseZip(html,deployScript({html})),'by default the script of this release');
 // The messages name the one download and say to run the script inside it; none asks for a second download.
 assert.match(script,/^rem  One download: logistics-offline-20300101-v1\.2\.zip holds the HTML and this script\. Save it in\r$/m);
 assert.match(script,/  echo \[X\] %ZIPNAME% not found next to this script or in Downloads\.\r\n  echo     This script deploys the HTML inside that zip\. Save %ZIPNAME% from the GitHub release\r\n  echo     in %USERPROFILE%\\Downloads, open it and double-click deploy-iis\.bat inside it\.\r\n  echo     Release zips now in Downloads:\r\n/);
 // A wrong HTML stops before anything is copied, says what to do, and the window waits (goto :fail pauses).
 assert.match(script,/Get-FileHash -Algorithm SHA256 -LiteralPath \$env:SRC\)\.Hash -ne \$env:EXPECT_SHA256\) \{ exit 1 \}"\r\nif errorlevel 1 \(\r\n  echo \[X\] SHA-256 mismatch - the HTML in the zip named at \[1\/6\] is not the expected V1\.2 build \^\(logistics-offline-20300101-v1\.2\.zip\^\)\.\r\n  echo     Delete that zip, save logistics-offline-20300101-v1\.2\.zip from the GitHub release in Downloads again, open it and double-click deploy-iis\.bat inside it\. Stopping\.\r\n  goto :fail\r\n\)\r\n/);
 assert(script.indexOf('SHA-256 mismatch')<script.indexOf('rem ---- [3/6]'),'checked before index.html is written');
 assert.doesNotMatch(script,/same GitHub release as this script|the zip and the script of the same release|deploy-iis-script/);
});

test('npm run export:offline writes the deploy script and the release ZIP, nothing else',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'deploy-files-'));
 try{
  const html=Buffer.from('<html>build</html>');
  assert.deepEqual(writeDeployFiles(dir,html),[path.join(dir,DEPLOY_SCRIPT_NAME),path.join(dir,RELEASE_ZIP_NAME)]);
  assert.deepEqual(readdirSync(dir).sort(),[DEPLOY_SCRIPT_NAME,RELEASE_ZIP_NAME].sort());
  assert.equal(readFileSync(path.join(dir,DEPLOY_SCRIPT_NAME),'utf8'),deployScript({html}));
  assert.deepEqual(readFileSync(path.join(dir,RELEASE_ZIP_NAME)),releaseZip(html));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('npm run release:files puts the script into the release ZIP, never replaces a release ZIP and removes the old script download',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'release-files-')),program=path.join(root,'program'),offline=path.join(root,'offline');
 const releaseFiles=fileURLToPath(new URL('../scripts/release-files.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,[releaseFiles],{cwd:program,encoding:'utf8'});
 try{
  mkdirSync(path.join(program,'outputs'),{recursive:true});mkdirSync(offline);
  const html=Buffer.from('<html>build</html>'),built=path.join(program,'outputs',OFFLINE_FILE_NAME);writeFileSync(built,html);
  // A new version: the release ZIP holds the HTML and its script; the old second download left by V13.1 is removed.
  writeFileSync(path.join(offline,OLD_DEPLOY_ZIP_NAME),storedZip([[DEPLOY_SCRIPT_NAME,'old script']]));
  let result=run();
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(readFileSync(path.join(offline,RELEASE_ZIP_NAME)),releaseZip(html));
  assert.equal(readFileSync(path.join(offline,DEPLOY_SCRIPT_NAME),'utf8'),deployScript({html}));
  assert.equal(existsSync(path.join(offline,OLD_DEPLOY_ZIP_NAME)),false,'the old second download is gone');
  assert.match(result.stdout,/removed offline\/deploy-iis-script\.zip/);
  // Run again: nothing to update.
  result=run();
  assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/removed/);
  // V13.2 (a published V13.1 ZIP had been rewritten locally): a release ZIP with the same HTML but another script inside
  // — here the HTML-only ZIP packaged until V13.1 — is never replaced, and nothing else is written.
  const published=storedZip([[OFFLINE_FILE_NAME,html]]);
  writeFileSync(path.join(offline,RELEASE_ZIP_NAME),published);rmSync(path.join(offline,DEPLOY_SCRIPT_NAME));
  result=run();
  assert.equal(result.status,1);assert.match(result.stderr,/already exists with another deploy script inside \(same HTML\)\. A release ZIP is never replaced: give the change a new RELEASE_VERSION/);
  assert.deepEqual(readFileSync(path.join(offline,RELEASE_ZIP_NAME)),published,'the release ZIP is left as it was');
  assert.equal(existsSync(path.join(offline,DEPLOY_SCRIPT_NAME)),false,'nothing is written when a check stops');
  // Another build under the same version still stops, for the HTML and for the release ZIP.
  writeFileSync(path.join(offline,RELEASE_ZIP_NAME),releaseZip(html));
  writeFileSync(built,'<html>another build</html>');
  result=run();
  assert.equal(result.status,1);assert.match(result.stderr,/already exists with different content\. A changed build needs a new RELEASE_VERSION/);
  rmSync(path.join(offline,OFFLINE_FILE_NAME));
  result=run();
  assert.equal(result.status,1);assert.match(result.stderr,/does not hold exactly this HTML\. A changed build needs a new RELEASE_VERSION/);
  assert.deepEqual(readFileSync(path.join(offline,RELEASE_ZIP_NAME)),releaseZip(html),'the release ZIP is left as it was');
  assert.equal(existsSync(path.join(offline,OFFLINE_FILE_NAME)),false,'nothing is written when a check stops');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('a packaged release always has the deploy script for that exact build, inside its release ZIP',()=>{
 const html=packageFile(OFFLINE_FILE_NAME);
 if(!existsSync(html))return;// not packaged yet: npm run release:files creates the files checked here
 const bytes=readFileSync(html),hint='Run npm run export:offline and npm run release:files.';
 assert(existsSync(packageFile(DEPLOY_SCRIPT_NAME)),`offline/${DEPLOY_SCRIPT_NAME} is missing. ${hint}`);
 assert.equal(readFileSync(packageFile(DEPLOY_SCRIPT_NAME),'utf8'),deployScript({html:bytes}),`offline/${DEPLOY_SCRIPT_NAME} is not the script for ${RELEASE_VERSION}. ${hint}`);
 const releaseHtml=[...readZip(readFileSync(packageFile(RELEASE_ZIP_NAME)))].filter(([name])=>/\.html$/i.test(name));
 assert.equal(releaseHtml.length,1);assert.equal(sha256(releaseHtml[0][1]),sha256(bytes),`offline/${RELEASE_ZIP_NAME} holds another build`);
 assert.deepEqual(readFileSync(packageFile(RELEASE_ZIP_NAME)),releaseZip(bytes),`offline/${RELEASE_ZIP_NAME} must hold this HTML and its ${DEPLOY_SCRIPT_NAME}. ${hint}`);
 assert.equal(existsSync(packageFile(OLD_DEPLOY_ZIP_NAME)),false,`offline/${OLD_DEPLOY_ZIP_NAME} is the old second download; the script is inside ${RELEASE_ZIP_NAME}. ${hint}`);
});

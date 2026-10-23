import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {RELEASE_DATE,RELEASE_VERSION,OFFLINE_FILE_NAME} from '../scripts/release.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const exporter=path.join(root,'scripts/export-offline.mjs');
test('release date is defined once and names the offline file',()=>{
 assert.match(RELEASE_DATE,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(new Date(RELEASE_DATE+'T00:00:00Z').toISOString().slice(0,10),RELEASE_DATE,'release date must be a real calendar date');
 assert.match(RELEASE_VERSION,/^v\d+(?:\.\d+)*$/);
 assert.equal(OFFLINE_FILE_NAME,`物流工具_最新版_离线单文件_${RELEASE_DATE.replaceAll('-','')}_${RELEASE_VERSION}.html`);
});
test('offline export embeds current inventory and assets without removed review workflows',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'logistics-export-'));
 try{
  await cp(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  execFileSync(process.execPath,[exporter],{cwd:dir,stdio:'pipe'});
  const html=await readFile(path.join(dir,'outputs',OFFLINE_FILE_NAME),'utf8');
  assert(html.includes(`<meta name="release" content="${RELEASE_VERSION.toUpperCase()} · ${RELEASE_DATE}">`),'the offline file must identify the same version as its filename (for support, not on the page)');
  const inventory=html.match(/<script type="application\/json" id="offlineInventory">([\s\S]*?)<\/script>/);
  assert(inventory,'bundled inventory must exist');
  assert.deepEqual(JSON.parse(inventory[1]),JSON.parse(await readFile(path.join(dir,'public/data.json'),'utf8')));
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src="(?!data:)/i);
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  // The offline runtime never saves to the network: the hosted save path (fetch through an injected default) is gone.
  assert.doesNotMatch(script,/\/api\//,'offline bundle must not contain the hosted API path');
  // V14 (data package): the only network request is a guarded GET of logistics-data.json on the intranet page.
  // Two fetch calls (V18): the guarded GET of the server data, and the Upload to server module (GET/PUT of the two data files).
  assert.equal((script.match(/\bfetch\b/g)||[]).length,2,'two fetch calls in the offline bundle');
  const guarded=script.match(/if\(!\/\^https\?:\$\/\.test\(location\.protocol\)\)return;let ([\w$]+);try\{\1=await fetch\(([\w$]+),\{cache:"no-store"\}\)\}/);
  assert(guarded,'the fetch runs only on an http/https page, as a plain GET with no-store');
  assert(new RegExp('\\b'+guarded[2].replace(/\$/g,'\\$')+'="logistics-data\\.json"').test(script),'and requests only logistics-data.json');
  assert.doesNotMatch(script,/XMLHttpRequest|sendBeacon|WebSocket|EventSource/,'no other network API');
  assert(script.includes('Offline edition: data is included in this file. No cloud connection.'),'offline save adapter is applied');
  assert.doesNotMatch(script,/location\.hostname/,'offline access setting replaces the hosted admin check');
  assert.doesNotMatch(html,/Relationship not established|Review assistant|Owner review|reviewSubmissions/i);
  for(const label of ['Original descriptions and shared words','Source records','How the score is calculated'])assert(html.includes(label),label);
  // Owner decision 2026-10-23 (V18.1): the page shows no version — the line at the top ("V… · date · Your changes are kept
  // in this browser…") is gone. The version is only in the meta tag; people hear about an update from the one-time notice.
  assert.equal(html.split(`${RELEASE_VERSION.toUpperCase()} · ${RELEASE_DATE}`).length-1,1,'the version and date appear once, in the meta tag');
  assert.doesNotMatch(html,/<aside id="releaseNotice"|data-offline-only|Your changes are kept in this browser on this computer/);
  assert.doesNotMatch(html,/currently deferred|No internet connection required|Reopening this HTML/);
  assert(html.includes('<div id="updateNotice" class="package-notice update-notice" role="status" hidden></div>'),'the update notice is in the page');
  assert(!html.includes('Admin preview')&&/location\.protocol===["']file:["']\?["']Offline edition["']:["']["']/.test(script),'the account label says Offline edition only for file://');
  assert.match(script,/try\{\(\w+\?history\.replaceState:history\.pushState\)\.call\(history,null,"",\w+\)\}catch\{\}/,'address bar updates cannot break file:// pages');
  assert.match(html,/src="data:image\/svg\+xml;base64,/,'SVG logo keeps its SVG type');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('offline export derives asset MIME types and stops when an anchor or asset type is missing',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'logistics-export-'));
 const run=()=>execFileSync(process.execPath,[exporter],{cwd:dir,stdio:'pipe'});
 const edit=async(file,change)=>{const target=path.join(dir,'public',file);await writeFile(target,change(await readFile(target,'utf8')));};
 try{
  await cp(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
  await writeFile(path.join(dir,'public/assets/test-pixel.png'),png);
  await edit('style.css',css=>css+'\n.test-pixel{background:url(assets/test-pixel.png)}.test-pixel-again{background:url("assets/test-pixel.png")}');
  await edit('index.html',html=>html.replace('<main','<img src="assets/test-pixel.png" alt=""><main'));
  run();
  const html=await readFile(path.join(dir,'outputs',OFFLINE_FILE_NAME),'utf8'),uri=`data:image/png;base64,${png.toString('base64')}`;
  assert.equal(html.split(`url("${uri}")`).length-1,2,'both CSS references embed the PNG as image/png');
  assert(html.includes(`src="${uri}"`),'HTML image embeds the PNG as image/png');
  assert.match(html,/url\("data:image\/svg\+xml;base64,/,'SVG background keeps its SVG type');
  assert.doesNotMatch(html,/url\((?!["']?data:)|src="assets\//,'no asset is left as a file reference');
  // Unknown asset types and every changed source anchor must stop export, rather than silently ship a broken file.
  const failures=[
   ['style.css',css=>css+'\n.notice{background:url(assets/tabler-icons-LICENSE.txt)}','no MIME type for asset assets/tabler-icons-LICENSE.txt'],
   ['index.html',html=>html.replace('<meta name="description"','<meta name="summary"'),'release meta tag'],
   ['app.js',source=>source.replace("'Admin preview'","'Local preview'"),'offline account label'],
   ['app.js',source=>source.replace("history.pushState).call(history,null,'',url);","history.pushState).call(history,null,'',url,true);"),'address bar update'],
   ['app.js',source=>source.replace("fetch('./data.json')","fetch('./renamed-data.json')"),'embedded data loader']
  ];
  for(const [file,change,label] of failures){
   const target=path.join(dir,'public',file),original=await readFile(target,'utf8');
   await writeFile(target,change(original));
   assert.throws(run,error=>String(error.stderr).includes(label),label);
   await writeFile(target,original);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

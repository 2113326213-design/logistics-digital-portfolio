// V19 (owner decision 2026-10-23: "这个提取的功能还有 leanix 抓数据的功能都删掉吧"): the LeanIX comparison in Import data
// (V15 process check, V16 catalogue check, V17 adding BBM PM processes), the "Download file for the server" button and the
// tools/leanix scripts are removed. A LeanIX process export selected in Import data is refused with a plain message.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {isLeanixProcessExport,LEANIX_PROCESS_EXPORT,inventoryFromSheets} from '../public/xlsx.mjs';
import {deployScript} from '../scripts/deploy-script.mjs';

const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const app=read('../public/app.js'),html=read('../public/index.html');
const KEYS=['id','type','name','displayName','description','processLifecycleStatus','relToParent','relProcessToApplication','fullName','updatedAt'];
const LABELS=['ID','Type','Name','Display Name','Description','Process Lifecycle Status','Parent','Applications','Full Name','Updated At'];
const processExport=(keys=KEYS)=>({'ReadMe':[['Created at: 2026-10-23 00:17:00 GMT']],'BBM PM process (Export 2026-10-23 08_17)':[keys,LABELS.slice(0,keys.length),
 ['aaaaaaaa-0000-0000-0000-000000000001','Process','BBM PM I2D Putaway L2','','','','','AUTO-RACK','',''].slice(0,keys.length)]});

test('V19: the LeanIX comparison is gone from Import data',()=>{
 assert(!existsSync(new URL('../public/leanix-process-check.mjs',import.meta.url)));
 for(const name of ['leanix-process-check','showProcessCheck','previewLocalLayer','compareProcessLinks','compareCatalogue','localProcessesFrom','processCheckCSV','exportProcessCheck','exportCatalogueCheck'])assert(!app.includes(name),name);
 assert(!/LeanIX process export with the Applications column|compared only/.test(html));
 assert(!read('../public/interface.css').includes('process-check'));
});

test('V19: a LeanIX process export is refused before it could be read as an inventory, with a plain message',()=>{
 // With and without the Applications column.
 assert.equal(isLeanixProcessExport(processExport()),true);
 assert.equal(isLeanixProcessExport(processExport(KEYS.filter(k=>k!=='relProcessToApplication'))),true);
 // An application inventory, a LeanIX application export (display names in row 1, Type Application) and a taxonomy are not.
 const inventory={'Logistic Apps':[['ID','Division','Entity','Name','Business Capabilities','Processes'],['a1','PS','RBCD','App','B.06.1 X','BBM PM I2D Putaway L2']]};
 const leanixApps={'Export':[['ID','Type','Name','Display Name','Business Capabilities','Processes'],['a1','Application','App','App','','']]};
 const technicalApps={'Export':[['id','type','name'],['a1','Application','App']]};
 for(const sheets of [inventory,leanixApps,technicalApps,{}])assert.equal(isLeanixProcessExport(sheets),false);
 assert.equal(inventoryFromSheets(inventory).length,1);
 assert.match(LEANIX_PROCESS_EXPORT,/^This is a LeanIX process export\. The tool no longer reads these files\./);
 const run=app.slice(app.indexOf("$('importRun').onclick="),app.indexOf("$('importApply').onclick="));
 const refused=run.indexOf('isLeanixProcessExport(sheets)))throw Error(LEANIX_PROCESS_EXPORT)');
 assert(refused>0&&refused<run.indexOf('inventoryFromSheets(inventorySheets)'),'refused first');
 // The refusal goes to the usual failure line, which says that nothing changed.
 assert(run.includes("'Import failed: '+english(error.message)+' Current data has not changed.'"));
});

test('V19: the download for the server is gone; the share section shows only where Upload to server works',()=>{
 assert(!/exportDataPackage|Download file for the server|give it to the server admin/.test(html+app));
 assert.match(html,/<details class="package-publish" id="packagePublish"><summary>Share this data with everyone<\/summary><p>[^<]*<\/p><button type="button" id="uploadToServer">Upload to server<\/button><p id="uploadToServerStatus" class="hint" role="status"><\/p><\/details>/);
 assert(app.includes("$('packagePublish').hidden=!canUpload();"));
 const script=deployScript({html:Buffer.from('<html>test</html>'),version:'v1.2',zipName:'logistics-offline-20300101-v1.2.zip',scriptName:'deploy-iis.bat'});
 assert(!script.includes('Download file for the server'));
});

test('V19: tools/leanix is gone; LeanIX exports stay out of GitHub',()=>{
 assert(!existsSync(new URL('../../tools/leanix',import.meta.url)));
 const ignore=read('../../.gitignore');
 assert(/^leanix_export\/$/m.test(ignore)&&/^leanix_processes\*\.csv$/m.test(ignore)&&!ignore.includes('tools/leanix'));
});

import {WHATS_NEW,updateNoticeDue,updateNoticeHTML} from '../public/whats-new.mjs';
test('V19: the one-time update notice is new and says in plain words what was removed, with no version number',()=>{
 // Someone who closed the first notice of 23 October sees this one once.
 assert.notEqual(WHATS_NEW.id,'2026-10-23');
 const storage=(()=>{const map=new Map([['logistics-portfolio:update-seen','2026-10-23']]);return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))};})();
 assert.equal(updateNoticeDue(storage),true);
 const html=updateNoticeHTML(s=>String(s));
 assert(html.includes('<li>Import data no longer compares LeanIX process exports. If you choose one, the tool says so and changes nothing.</li>'));
 assert(html.includes('<li>Share this data with everyone now has only Upload to server. The download for the server admin is gone.</li>'));
 // The first update's lines stay for browsers that skipped it.
 assert.match(html,/Data checks now list the same items as Issues to review/);
 assert.doesNotMatch(html,/\bV\d|version|release/i);
});

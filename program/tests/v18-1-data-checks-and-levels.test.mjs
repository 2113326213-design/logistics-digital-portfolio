// V18.1 (owner, 2026-10-23). Two fixed rules:
// 1. Data checks list exactly the issues of Issues to review, for every level ("Data checks 用和 Issues to review 同一份问题清单").
// 2. A level with no record is full (filled and matching) when a deeper level fully matches the standard
//    ("只要是最大级满分 小于他的子级全部满分", "这个是死规定"), for Process and Business Capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RECORDS_V916} from './records-v916.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {dataChecksForApp,dataChecksSummary,renderDataChecks} from '../public/data-checks.mjs';
import {processIssues,capabilityIssues} from '../public/process-issues.mjs';
import {ancestorCoverage} from '../public/review-issues.mjs';

const bundled=()=>buildModel(workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'))));
const legacy=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const records=JSON.parse(readFileSync(RECORDS_V916));
const toCheck=checks=>checks.checks.filter(row=>row.primary||row.tags.some(tag=>tag.label!=='Confirmed by owner as recorded'));
const NAME={cap:'Business Capability',process:'Process'};

test('Data checks list the same issues as Issues to review, for every application and both dimensions',()=>{
 for(const [label,model] of [['bundled data',bundled()],['V9.16 records',buildModel(records)],['legacy catalogue',buildModel({...records,capabilityRows:legacy.capabilityRows,taxonomySource:legacy.taxonomySource})]]){
  for(const app of model.apps){
   const checks=dataChecksForApp(model,app);
   for(const [dimension,issues] of [['cap',capabilityIssues(model,app)],['process',processIssues(model,app)]]){
    const rows=toCheck(checks).filter(row=>row.dimension===dimension);
    assert.equal(rows.length,issues.length,`${label} · ${app.Name} · ${dimension}: one Data checks line per issue`);
    for(const issue of issues){
     const words=issue.kind==='missing'&&!issue.raw&&issue.level===null?null:issue.label;
     const row=rows.find(row=>row.raw===issue.raw&&(words===null||row.primary===`${NAME[dimension]}: ${words}`||row.tags.some(tag=>tag.label===words)));
     assert(row,`${label} · ${app.Name}: "${issue.label}" ${issue.raw} is in Data checks`);
    }
   }
  }
 }
});

test('the owner\'s example: BMLP_Nexeed_IAS@WxP shows Level 2 and Level 3 missing in both places',()=>{
 const model=bundled(),app=model.apps.find(a=>a.Name==='BMLP_Nexeed_IAS@WxP'),checks=dataChecksForApp(model,app);
 assert.deepEqual(processIssues(model,app).map(i=>i.label),['Level 2 missing','Level 3 missing']);
 assert.deepEqual(toCheck(checks).map(row=>row.primary),['Process: Level 2 missing','Process: Level 3 missing']);
 assert.equal(dataChecksSummary(checks),'2 to check');
 // V19.1 union (owner 2026-10-23): "Process name differs between sources" is no longer produced, because the Signavio
 // name and the LeanIX name are both valid. Until V19 this record was listed with its sentence naming both names; now it
 // simply matches its code, the catalogue still knows both names, and neither list shows it.
 const szh5=model.apps.find(a=>a.Name==='RBAC_ME_Szh5 Intralogistics control system'),raw='BBM PM I2D Packaging Handling L2';
 const match=szh5.processMatches.find(m=>m.raw===raw);
 assert.equal(match?.id,'M.I2D.020.050','the record matches its Signavio code by name');
 const node=model.procs.get(match.id);
 assert.equal(node.nameStatus,'differs','the two sources still name it differently');
 assert.deepEqual([node.snapshotName,node.leanix.name],['Packaging Handling','Returnable Packaging Handling']);
 assert(!processIssues(model,szh5).some(i=>i.record===raw||i.label==='Process name differs between sources'),'not an issue in Issues to review');
 const szh5Checks=dataChecksForApp(model,szh5);
 assert.equal(szh5Checks.checks.find(r=>r.raw===raw),undefined,'not a line in Data checks');
 assert.doesNotMatch(renderDataChecks(szh5Checks,String),/Packaging Handling|differs between sources/);
});

const app=(ID,cap,process)=>({ID,Name:`App ${ID}`,Entity:'Plant A',Division:'PS','Main Business Capability':'','Business Capabilities':cap,Processes:process});
const fixture=apps=>({
 taxonomySource:'Business Capability Standard (capabilities); Process standard',
 capabilityRows:[['B.06 Logistics','B.06.1 Branch','B.06.1.1 Detail']],
 processRows:[['Test','L0','M.T','Test'],['Test','L1','M.T.010','Stage'],['Test','L2','M.T.010.010','Step'],['Test','L3','M.T.010.010.010','Detail']],
 apps
});
const level=(report,n)=>report.levels.find(l=>l.level===n);
const full=(report,id,n)=>level(report,n).filled.some(a=>a.id===id)&&level(report,n).valid.some(a=>a.id===id);
const missing=(report,id)=>report.issues.get(id).filter(i=>i.kind==='missing').map(i=>i.level);

test('fixed rule: the deepest matching level makes every level above it full, in Process',()=>{
 const model=buildModel(fixture([
  app('onlyL3','B.06.1.1 Detail','BBM PM T Detail L3'),
  app('L2noL1','B.06.1.1 Detail','BBM PM T Test L0;BBM PM T Step L2'),
  app('badL3','B.06.1.1 Detail','BBM PM T Unknown step L3'),
  app('badDirectL2','B.06.1.1 Detail','BBM PM T Unknown branch L2;BBM PM T Detail L3'),
  app('noLevel','B.06.1.1 Detail','BBM PM T Unknown step')
 ]));
 const report=maintenanceReport(model,{},'process'),byId=id=>model.apps.find(a=>a.id===id);
 // Level 3 matches: Levels 2, 1 and 0 are full, nothing is missing.
 for(const n of [0,1,2,3])assert(full(report,'onlyL3',n),`onlyL3 Level ${n}`);
 assert.deepEqual(report.issues.get('onlyL3'),[]);
 for(const n of [0,1,2])assert(!level(report,n).direct.some(a=>a.id==='onlyL3'),'no registration is created');
 // Level 1 missing and Level 2 matching: Level 1 is full; Level 3 has nothing deeper, so it stays missing.
 assert(full(report,'L2noL1',1));
 assert.deepEqual(missing(report,'L2noL1'),[3]);
 // V19.1 union (owner 2026-10-23): a process recorded with a level is in LeanIX, so an L3 that is not in the Signavio list
 // now matches and fills Levels 2, 1 and 0 like any matching L3 (until V19 it filled nothing). Its evidence names it as a
 // LeanIX record without a Signavio code or parent.
 assert.deepEqual(byId('badL3').inLeanix.map(x=>x.raw),['BBM PM T Unknown step L3']);
 for(const n of [0,1,2,3])assert(full(report,'badL3',n),`badL3 Level ${n}`);
 assert.deepEqual(report.issues.get('badL3'),[]);
 assert.deepEqual(ancestorCoverage(model,report,byId('badL3'),0),[{raw:'BBM PM T Unknown step L3',code:null,parent:null,inLeanix:true}]);
 // A record that does not match (now only one without a level) fills nothing: every level stays missing.
 assert.deepEqual(missing(report,'noLevel'),[0,1,2,3]);
 assert.deepEqual(report.issues.get('noLevel').filter(i=>i.kind==='record').map(i=>i.label),['Process level not specified']);
 // A recorded level is judged on its own records, never on deeper coverage. V19.1 union: the direct L2 outside the
 // Signavio list is in LeanIX and matches on its own (until V19 it was a Level 2 match issue); the Business Capability
 // test below keeps the case of a failing direct record that a matching deeper level must not hide.
 assert.deepEqual(ancestorCoverage(model,report,byId('badDirectL2'),2),[],'a level with its own records is not covered from deeper');
 assert(!report.issues.get('badDirectL2').some(i=>i.level===2),'the direct L2 is not an issue');
 assert.equal(report.records.get('badDirectL2').find(r=>r.raw==='BBM PM T Unknown branch L2').reason,'In LeanIX, not in the Signavio list');
 assert(full(report,'badDirectL2',2));
});

test('fixed rule: the same in Business Capability',()=>{
 const report=maintenanceReport(buildModel(fixture([
  app('onlyL3','B.06.1.1 Detail','BBM PM T Detail L3'),
  app('onlyL2','B.06.1 Branch','BBM PM T Detail L3'),
  app('badL3','B.06.1.9 Unknown','BBM PM T Detail L3'),
  app('badDirectL2','B.06.9 Unknown;B.06.1.1 Detail','BBM PM T Detail L3')
 ])),{},'cap');
 for(const n of [1,2,3])assert(full(report,'onlyL3',n),`onlyL3 Level ${n}`);
 assert.deepEqual(report.issues.get('onlyL3'),[]);
 assert(full(report,'onlyL2',1),'Level 1 missing and Level 2 matching: Level 1 full');
 assert.deepEqual(missing(report,'onlyL2'),[3]);
 assert.deepEqual(missing(report,'badL3'),[1,2]);
 // A recorded level is judged on its own records: a matching L3 never hides a bad direct L2. (V19.1 union: this case
 // moved here from the Process test, where a direct record with a level now always matches.)
 assert(report.issues.get('badDirectL2').some(i=>i.level===2&&i.kind==='match'));
 assert(!full(report,'badDirectL2',2));
});

test('fixed rule on the bundled data, and no code calls a covered level unfilled again',()=>{
 const model=bundled(),process=maintenanceReport(model,{},'process'),find=name=>model.apps.find(a=>a.Name===name);
 // RBCW Auto Warehouse Management System: its matching L2 (Material Consumption) makes L0 and L1 full; its L3 Transport
 // Material Intra Plant is in LeanIX, not in the Signavio list, so it matches (V19.1 union; until V19 it was confirmed as
 // recorded). RBAC_ME_i-Warehouse: its matching L1 makes L0 full; it records nothing at Levels 2 and 3.
 const rbcw=find('RBCW Auto Warehouse Management System');
 assert.deepEqual(processIssues(model,rbcw),[]);
 assert.equal(process.records.get(rbcw.id).find(r=>r.raw==='BBM PM I2D Transport Material Intra Plant L3').reason,'In LeanIX, not in the Signavio list');
 assert.deepEqual(processIssues(model,find('RBAC_ME_i-Warehouse')).filter(i=>i.kind==='missing').map(i=>i.label),['Level 2 missing','Level 3 missing']);
 // V19.1 union (owner 2026-10-23), until V19 [[0,73,73],[1,71,71],[2,67,67],[3,67,55]] and 21 to review:
 // - Levels 0 and 1 +2: RBCD WI management system and RBCW E-Queue system record only an L3 outside the Signavio list; it
 //   now matches, so Levels 2, 1 and 0 count as full. Level 2 +3: the same two and RBCD LOM Scrap Management Platform
 //   (its L3V records outside the Signavio list now cover its unrecorded Level 2).
 // - Level 3 matching +12: every application with an L3 outside the Signavio list now matches at Level 3 (the 9 that
 //   leave To review below, RBCD LOG Xone, which stays for its record without a level, and AUTO-RACK and RBCW Auto
 //   Warehouse, whose such record the owner had confirmed as recorded).
 // - To review -10: 9 applications whose only process issues were records with a level outside the Signavio list or the
 //   name difference (and the unrecorded levels those records now cover; VM-CN_WACOS_Szh5 had both kinds), and RBAC_ME_Szh5 Intralogistics control system, whose only issue was
 //   "Process name differs between sources" (no longer produced).
 assert.deepEqual(process.levels.map(l=>[l.level,l.filled.length,l.valid.length]),[[0,75,75],[1,73,73],[2,70,70],[3,67,67]]);
 const leftL3=['AUTO-RACK','RBCD LOG Xone','RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW Auto Warehouse Management System','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','VMCN_iSCMP: Intelligent Supply Chain management platform'];
 for(const name of leftL3)assert(find(name).inLeanix.some(x=>x.level===3)&&level(process,3).valid.some(a=>a.id===find(name).id),`${name}: an L3 outside the Signavio list now matches`);
 assert.equal(process.needsReview.length,11,'V19.1 union: 21 -> 11, see above');
 for(const name of ['RBAC_ME_Szh5 Intralogistics control system','RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','VMCN_iSCMP: Intelligent Supply Chain management platform'])
  assert(!process.needsReview.some(a=>a.id===find(name).id),`${name} is no longer to review`);
 assert(process.needsReview.some(a=>a.id===find('RBCD LOG Xone').id),'RBCD LOG Xone stays: its record without a level');
 for(const file of ['review-issues.mjs','overview.mjs']){
  const code=readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
  assert.doesNotMatch(code,/not counted as filled|does not change filled counts/,file);
 }
});

// Owner 2026-10-23: no version line on the page ("i dont want user seem it"; "整句删掉，哪里都不显示版本"), but "if we update
// a new version, let them know": a one-time notice in plain English for people who used the tool before.
import {WHATS_NEW,UPDATE_SEEN_KEY,updateNoticeDue,markUpdateSeen,updateNoticeHTML} from '../public/whats-new.mjs';
const memory=(entries={})=>{const map=new Map(Object.entries(entries));return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),map};};

test('the update notice shows once to people who used the tool before, and never to a first visit',()=>{
 const first=memory();
 assert.equal(updateNoticeDue(first),false,'a first visit sees no update notice');
 assert.equal(first.map.get(UPDATE_SEEN_KEY),WHATS_NEW.id,'and this update counts as seen');
 assert.equal(updateNoticeDue(first),false);
 for(const kept of [{'logistics-portfolio-view-v1':'{}'},{'logistics-portfolio:kept-workspace':'{}'},{[UPDATE_SEEN_KEY]:'2026-01-01'}]){
  const storage=memory(kept);
  assert.equal(updateNoticeDue(storage),true,JSON.stringify(kept));
  assert.equal(updateNoticeDue(storage),true,'until it is closed');
  assert.equal(markUpdateSeen(storage),true);
  assert.equal(updateNoticeDue(storage),false,'closed: not again for this update');
 }
 assert.equal(updateNoticeDue(memory({'other-site':'x'})),false,'other sites\' data does not count');
 const blocked={get length(){throw Error('blocked');},key(){throw Error('blocked');},getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(updateNoticeDue(blocked),false,'without storage closing could not be remembered, so nothing is shown');
 assert.equal(updateNoticeDue(null),false);
});

test('the update notice says what changed in plain words, with no version number',()=>{
 const html=updateNoticeHTML(s=>String(s));
 assert.match(html,/The tool was updated on 23 October 2026\./);
 assert.match(html,/Data checks now list the same items as Issues to review/);
 assert.match(html,/if Level 3 matches, Levels 2, 1 and 0 count as complete/);
 assert.match(html,/id="updateNoticeClose">Close</);
 assert.doesNotMatch(html,/\bV\d|version|release/i,'no version number or release word');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.indexOf('updateDue=updateNoticeDue(window.localStorage)')<app.indexOf("fetch('./data.json')"),'read before the page saves anything');
 assert(app.includes('checkDataPackage();showUpdateNotice(updateDue);'));
});

// V18.1 review: the same list for any data, not only the bundled one; and no version number in any page text.
import {keptWorkText} from '../public/offline-save.mjs';
import {uploadMessage} from '../public/server-upload.mjs';
test('Data checks stay the same as Issues to review for rare data shapes',()=>{
 const data=fixture([
  app('sameCodeTwice','B.06.9.9 Foo;B.06.9.9 Bar','BBM PM T Detail L3'),
  {...app('mainAndList','B.06.9 Y','BBM PM T Detail L3'),'Main Business Capability':'B.06.9 X'},
  app('otherArea','B.05.1.1 Foo','BBM PM T Detail L3')
 ]);
 data.capabilityRows.push(['B.05 Other area','B.05.1 Branch','B.05.1.1 Foo']);
 const model=buildModel(data);
 for(const a of model.apps){
  const checks=dataChecksForApp(model,a);
  for(const [dimension,issues] of [['cap',capabilityIssues(model,a)],['process',processIssues(model,a)]])
   assert.equal(toCheck(checks).filter(row=>row.dimension===dimension).length,issues.length,`${a.Name} · ${dimension}`);
 }
});
test('no page text names a version: the kept-work question, the upload message and the Overview notes',()=>{
 const kept={savedAt:'2026-10-22T03:15:00.000Z',release:'V18',source:'a.xlsx',data:{dataPackage:{id:'0123456789abcdef',publishedAt:'2026-11-05T09:00:00.000Z',dataAsOf:'2026-11-05'}}};
 const texts=[keptWorkText(kept,{release:'V18.1',source:'b.xlsx',dataAsOf:'2026-10-21'}),keptWorkText({...kept,data:{}},{release:'V18.1',source:'b.xlsx'}),keptWorkText({...kept,data:{}},{release:'V18',source:'a.xlsx'})].flatMap(r=>[r.text,r.warning]);
 for(const code of [401,403,404,405,500,501])texts.push(uploadMessage({status:'http',code}));
 for(const text of texts)assert.doesNotMatch(text,/\bV\d/,text);
 assert.match(texts[1],/^This file is another version of the tool\./);
 const overview=readFileSync(new URL('../public/overview.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(overview,/direct registrations only/);
});

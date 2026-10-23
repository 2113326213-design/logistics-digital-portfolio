// V16 (owner request 2026-10-22: "business CAPABILITY + PROCESS那个表格 和我拉出来的新的 … 一些缺少的？我要去补齐的"): the
// standard process catalogue (Business Capability + Process.xlsx, Data_RBW Process Structure) against the LeanIX process
// export, by the name rule the applications' records use; and the standard Process ID / Process Name next to every process
// of the per-application check. Synthetic exports in the layout of the saved view "BBM PM process" (screenshots
// 2026-10-22). The "review:" tests come from the V16 review and from one run on the owner's real export (owner approved,
// file deleted afterwards): other naming, application names with a release, and
// 10,230 other applications.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel,processLookup} from '../public/model.mjs';
import {split} from '../public/codes.mjs';
import {readProcessLinks,compareProcessLinks,compareCatalogue,catalogueCheckCSV,catalogueNote,processCheckCSV} from '../public/leanix-process-check.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')),model=buildModel(data),options={processRows:data.processRows};
const KEYS=['id','type','name','displayName','description','processLifecycleStatus','relToParent','relProcessToApplication','fullName','updatedAt'];
const LABELS=['ID','Type','Name','Display Name','Description','Process Lifecycle Status','Parent','Applications','Full Name','Updated At'];
const record=(id,name,apps='',{displayName=name,type='Process',parent=''}={})=>[id,type,name,displayName,'','',parent,apps,name,'2025-10-10'];
const links=records=>readProcessLinks({'BBM PM process (Export 2026-10-22 08_17)':[KEYS,LABELS,...records]});
const i2d=[...model.procs.values()].filter(n=>n.id.startsWith('M.I2D'));
const leanixName=n=>`BBM PM ${n.id.split('.')[1]} ${n.label.trim()} L${n.level}`;
// Names the catalogue gives to more than one I2D process of a level (Register Truck and the like).
const sharedNames=(()=>{const count=new Map();for(const n of i2d){const k=n.level+'|'+n.label;count.set(k,(count.get(k)||0)+1);}return new Set([...count].filter(([,c])=>c>1).map(([k])=>k));})();
const unique=i2d.filter(n=>!sharedNames.has(n.level+'|'+n.label)),shared=i2d.filter(n=>sharedNames.has(n.level+'|'+n.label));
const parentName=n=>leanixName(model.procs.get(n.parent));
const compare=records=>compareCatalogue(model,links(records),options);
const status=(result,id)=>result.rows.find(r=>r.id===id).status;

test('V16: one rule — processLookup finds for every recorded process what the model found',()=>{
 const lookup=processLookup(model.procs);let compared=0;
 for(const app of model.apps)for(const raw of app.rawProcess){
  const match=app.processMatches.find(m=>m.raw===raw);if(match?.via==='mapping')continue;
  const hit=lookup(raw);compared++;
  if(match)assert.deepEqual([hit.id,hit.via],[match.id,match.via],raw);
  else{
   assert.equal(hit.id,null,raw);
   // An unmatched record is an issue of that type, unless the owner confirmed it as recorded.
   const issue=model.issues.find(i=>i.appId===app.id&&i.value===raw);
   if(issue)assert.equal(issue.type,hit.type,raw);else assert(app.accepted.some(d=>d.raw===raw),raw);
  }
 }
 assert(compared>=360,`compared ${compared} records`);
});

test('V16: standard processes of a chain in the export that LeanIX lacks are listed with Process ID, Process Name and the expected LeanIX name',()=>{
 const [gone1,gone2]=unique.filter(n=>n.level===3).slice(0,2);
 const result=compare(i2d.filter(n=>n!==gone1&&n!==gone2).map((n,i)=>record('p'+i,leanixName(n),'',{parent:n.parent?parentName(n):''})));
 assert.deepEqual(result.missing.map(r=>[r.chain,r.level,r.id,r.name,r.expected]),[gone1,gone2].map(n=>['Intralogistics to Demand (I2D)','L3',n.id,n.label,leanixName(n)]));
 assert.deepEqual(result.counts,{standard:model.procs.size,compared:i2d.length,inLeanix:i2d.length-2,missing:2,possiblyMissing:0,notCompared:model.procs.size-i2d.length-1,ambiguous:1,notInCatalogue:0,otherNaming:0,local:0});
 const b2p=result.chains.find(c=>c.code==='B2P');assert.deepEqual([b2p.reached,b2p.inLeanix,b2p.missing,b2p.processes>100],[false,0,0,true]);
 assert.deepEqual(result.chains.filter(c=>c.reached).map(c=>[c.code,c.processes,c.inLeanix,c.missing]),[['I2D',i2d.length,i2d.length-2,2]]);
 assert.deepEqual(result.rows.map(r=>r.id),[...model.procs.keys()],'catalogue order');
});

test('V16: LeanIX processes outside the catalogue are listed with the reason; Display Name, L3V and HC',()=>{
 const records=[...i2d.map((n,i)=>record('p'+i,leanixName(n),'',{parent:n.parent?parentName(n):''})),
  record('x1','BBM PM I2D Invented step L3'),record('x3',`BBM PM XYZ ${unique[1].label} L${unique[1].level}`),
  record('x4','Receive to Store',undefined,{displayName:'BBM PM I2D Receive to Store L1'}),record('hc','HC.Other company process L3'),
  record('v1',`BBM PM I2D ${unique.find(n=>n.level===3).label} L3V`)];
 const result=compare(records);
 assert.equal(result.counts.missing,0);
 assert.deepEqual(result.notInCatalogue.map(r=>[r.id,r.reason]),[['x1','No standard process has this name at this level.'],['x3','The name is found only in another process chain.']]);
 assert(result.rows.find(r=>r.id==='M.I2D.010').leanix.some(x=>x.id==='x4'),'by Display Name when the Name finds nothing');
 const variant=result.rows.find(r=>r.leanix.some(x=>x.id==='v1'));assert.equal(variant.leanix.length,2);assert.match(catalogueNote(variant),/^2 LeanIX processes find this standard process\./);
 assert(!JSON.stringify(result).includes('"hc"'),'HC is left out');
});

test('V16 review: a shared catalogue name is decided by the LeanIX Parent; without it, fewer LeanIX processes than catalogue processes are possibly missing',()=>{
 const [truck1,truck2]=shared.filter(n=>n.label==='Register Truck');
 assert.deepEqual([truck1.id,truck2.id],['M.I2D.010.020.010','M.I2D.030.070.020']);
 const others=i2d.filter(n=>n.label!=='Register Truck').map((n,i)=>record('p'+i,leanixName(n),'',{parent:n.parent?parentName(n):''}));
 // The Parent decides: only the Register Truck under Dock and Yard Management is in LeanIX; the one under Loading is missing.
 const decided=compare([...others,record('t1','BBM PM I2D Register Truck L3','',{parent:parentName(truck1)})]);
 assert.deepEqual([status(decided,truck1.id),status(decided,truck2.id)],['in-leanix','missing']);
 assert.match(catalogueNote(decided.rows.find(r=>r.id===truck1.id)),/the LeanIX Parent decides which/);
 // No Parent: one LeanIX process for two catalogue processes — both possibly missing, listed with the reason.
 const open=compare([...others,record('t1','BBM PM I2D Register Truck L3')]);
 assert.deepEqual([status(open,truck1.id),status(open,truck2.id)],['possibly-missing','possibly-missing']);
 assert.equal(open.counts.possiblyMissing,2);assert(open.missing.some(r=>r.id===truck2.id));
 assert.match(catalogueNote(open.rows.find(r=>r.id===truck2.id)),/LeanIX has only 1 .*check whether this one is missing/);
 // Two LeanIX processes of that name and no Parent: both count.
 const both=compare([...others,record('t1','BBM PM I2D Register Truck L3'),record('t2','BBM PM I2D Register Truck L3')]);
 assert.deepEqual([status(both,truck1.id),status(both,truck2.id)],['in-leanix','in-leanix']);
});

test('V16 review: a chain is compared when the export names it, even if none of its names match',()=>{
 // ITM has only its Level 0 in the catalogue; LeanIX has ITM processes but not that one.
 const result=compare([record('i1','BBM PM ITM Manage IT Services L1'),record('i2','BBM PM ITM Run Service Desk L2')]);
 const itm=result.chains.find(c=>c.code==='ITM');
 assert.deepEqual([itm.reached,itm.missing,status(result,'M.ITM')],[true,1,'missing']);
 assert.deepEqual(result.notInCatalogue.map(r=>r.id),['i1','i2']);
 // A chain code the catalogue does not have (DM) reaches nothing.
 assert.equal(compare([record('d1','BBM PM XX Something L1')]).counts.compared,0);
});

test("V16 review: the owner's mappings count — a LeanIX name the owner mapped finds its standard process; the per-application Process ID follows the tool",()=>{
 const result=compare([record('m1','BBM PM DM Data Management L0'),record('m2','BBM PM I2D Request Packaging Kit L3V')]);
 const mdm=result.rows.find(r=>r.id==='M.MDM');
 assert.deepEqual([mdm.status,mdm.leanix.map(x=>[x.id,x.via])],['in-leanix',[['m1','mapping']]]);
 assert.match(catalogueNote(mdm),/owner's mapping/);
 const kit=result.rows.find(r=>r.id==='M.I2D.020.010.050');assert.equal(kit.status,'in-leanix');
 assert.deepEqual(result.notInCatalogue,[]);
 // Per application: RBAC_ME_Logistics Data Platform records 'BBM PM DM Data Management L0'; the tool maps it to M.MDM.
 const app=data.apps.find(a=>a.Name==='RBAC_ME_Logistics Data Platform');
 const check=compareProcessLinks(data,links(split(app.Processes).map((p,i)=>record('a'+i,p,app.Name))),{model});
 assert.deepEqual(check.rows.find(r=>r.name===app.Name).standard.get('BBM PM DM Data Management L0'),{id:'M.MDM',name:'Data Management'});
});

test('V16 review: the catalogue Process ID with two names, the Level 0 code and the expected name',()=>{
 const result=compare([record('q1','BBM PM Q2E Define Scope for "Production Process and Product Approval" L3'),record('q2','BBM PM Q2E Take Decision for Production Process and Product Approval L3'),
  record('c1','M.I2D Intralogistics to Demand'),record('c2','M.I2P.300 Something')]);
 assert.deepEqual(result.notInCatalogue.filter(r=>r.id.startsWith('q')).map(r=>r.reason),Array(2).fill('The catalogue gives this Process ID (M.Q2E.130.020.010) two names, so it is not compared.'));
 assert.equal(processLookup(model.procs)('M.I2D Intralogistics to Demand').id,'M.I2D');
 assert.equal(status(result,'M.I2D'),'in-leanix');
 // The catalogue writes ' Execute Maintenance' with a leading space; the expected LeanIX name has single spaces.
 assert.equal(result.rows.find(r=>r.id==='M.I2P.300.030').expected,'BBM PM I2P Execute Maintenance L2');
 // Nothing comparable: no compared process, so the page says so instead of "0 missing".
 assert.equal(compare([record('o1','BBM_PPM_PM Project Management')]).counts.compared,0);
 assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/no standard process could be compared/);
});

test('V16 review (real export): an L3V name outside the catalogue is listed like an L3 name (L3V is L3); other naming is counted and kept in the CSV',()=>{
 const result=compare([...i2d.map((n,i)=>record('p'+i,leanixName(n),'',{parent:n.parent?parentName(n):''})),
  record('v1','BBM PM D2M Confirm Component Development L3V','',{parent:'BBM PM D2M Process Sample Orders L2'}),record('o1','BBM_PPM_PM Project Management'),record('o2','PMT Plan release'),record('x1','BBM PM I2D Invented step L3')]);
 assert.deepEqual([result.counts.otherNaming,result.counts.notInCatalogue],[2,2]);
 const lines=catalogueCheckCSV(result,{file:'f.xlsx'}).slice(1).split('\r\n');
 assert(lines.some(l=>l.includes('"In LeanIX, not in the catalogue","","BBM PM D2M Confirm Component Development L3V","v1"')));
 assert(lines.some(l=>l.includes('"In LeanIX under other naming (no level L0–L3), not compared","","BBM_PPM_PM Project Management","o1"')));
 assert(lines.some(l=>l.includes('"In LeanIX, not in the catalogue","","BBM PM I2D Invented step L3","x1"')));
});

test('V16 review (real export): application names with a release match; other applications are counted, not listed; a name LeanIX does not link gets similar names',()=>{
 const agr=data.apps.find(a=>a.Name==='AGR w/ Camera'),procs=split(agr.Processes);
 const check=compareProcessLinks(data,links([record('a0',procs[0],'AGR w/ Camera 1.0;Other App;Another App 2'),...procs.slice(1).map((p,i)=>record('a'+(i+1),p,'AGR w/ Camera'))]),{model});
 const row=check.rows.find(r=>r.name==='AGR w/ Camera');
 assert.deepEqual([row.status,row.both.length,row.leanixNames],['matches',procs.length,['AGR w/ Camera 1.0']]);
 assert.equal(check.otherApplications,2);
 // A trailing word is not a release: 'AGR w/ Camera Pro' is another application.
 assert.equal(compareProcessLinks(data,links([record('b0',procs[0],'AGR w/ Camera Pro')])).otherApplications,1);
 // The tool's application LeanIX links nothing to, while LeanIX has a similar name.
 const odd=compareProcessLinks(data,links(procs.map((p,i)=>record('c'+i,p,'AGR w Camera (old)'))));
 assert.deepEqual(odd.rows.find(r=>r.name==='AGR w/ Camera').similar,['AGR w Camera (old)']);
});

test('V16: the catalogue CSV has the four columns of the catalogue sheet, every standard process in order, then the LeanIX processes outside it',()=>{
 const [gone]=unique.filter(n=>n.level===3),records=[...i2d.filter(n=>n!==gone).map((n,i)=>record('p'+i,leanixName(n),'',{parent:n.parent?parentName(n):''})),record('x1','BBM PM I2D Invented step L3')];
 const lines=catalogueCheckCSV(compare(records),{file:'f.xlsx'}).slice(1).split('\r\n');
 assert.equal(lines[0],'"RBW E2E Process Chain","Process Level","Process ID","Process Name","Result","Name expected in LeanIX","LeanIX name","LeanIX ID","Note","LeanIX export"');
 assert.equal(lines.length,1+model.procs.size+1);
 assert(lines.includes(`"Intralogistics to Demand (I2D)","L3","${gone.id}","${gone.label}","Missing in LeanIX","${leanixName(gone)}","","","","f.xlsx"`));
 assert(lines.some(l=>l.startsWith('"Budget to Perform (B2P)","L0","M.B2P","Budget to Perform","Not compared: this process chain is not in the export"')));
 assert(lines.some(l=>l.includes('"M.Q2E.130.020.010"')&&l.includes('Not compared: the catalogue gives this Process ID two names')));
 assert.equal(lines.at(-1),'"","","","","In LeanIX, not in the catalogue","","BBM PM I2D Invented step L3","x1","No standard process has this name at this level.","f.xlsx"');
});

test('V16: the per-application check names the standard Process ID and Process Name of each process',()=>{
 const app=model.apps.find(a=>a.Name==='AGR w/ Camera'),records=split(data.apps.find(a=>a.Name==='AGR w/ Camera').Processes).map((p,i)=>record('p'+i,p,'AGR w/ Camera'));
 const check=compareProcessLinks(data,links(records),{file:'f.xlsx',model}),row=check.rows.find(r=>r.name==='AGR w/ Camera');
 for(const m of app.processMatches)assert.deepEqual(row.standard.get(m.raw),{id:m.id,name:model.procs.get(m.id).label},m.raw);
 const lines=processCheckCSV(check).slice(1).split('\r\n');
 assert.equal(lines[0],'"Application ID","Application","Process","Process ID","Process Name","Result","LeanIX export"');
 assert(lines.includes(`"${app.ID}","AGR w/ Camera","BBM PM I2D Receive to Store L1","M.I2D.010","Receive to Store","In both","f.xlsx"`));
 // Without the model the columns stay empty (and nothing fails).
 assert(processCheckCSV(compareProcessLinks(data,links(records))).includes('"BBM PM I2D Receive to Store L1","","","In both"'));
});

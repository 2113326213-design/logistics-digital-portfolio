// LeanIX process export 2026-10-20 and the unified process checks (owner specification 2026-10-20).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport,l3MaintenanceMetrics} from '../public/overview.mjs';
import {parseLeanixProcessExport,applyLeanixExport,processCode,matchSource} from '../public/leanix-processes.mjs';
import {processMatchRows} from '../public/process-issues.mjs';

const bundled=()=>buildModel(workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)))));
const exportOf=rows=>({file:'x.xlsx',sheets:{'new (Export)':[['id','type','name','displayName','description'],['ID','Type','Name','Display Name','Description'],...rows],ReadMe:[['LeanIX inventory export created at: 2026-10-20 03:42:20 GMT'],['Column header','Type']]}});
const node=(id,label,level)=>[id,{id,label,level,children:[]}];

test('the real export: 26 records, two header rows and ReadMe are not data, codes keep their leading zeros',()=>{
 const parsed=parseLeanixProcessExport();
 assert.equal(parsed.records.length,26);assert.deepEqual(parsed.issues,[]);
 assert.equal(parsed.sheet,'new (Export 2026-10-20 11_42)');
 assert.equal(parsed.exportedAt,'2026-10-20 03:42:20');assert.equal(parsed.exportedAtBeijing,'2026-10-20 11:42:20');
 assert(parsed.records.every(r=>r.type==='Process'&&/^[0-9a-f-]{36}$/.test(r.factSheetId)&&r.code.startsWith('M.I2D')));
 assert.equal(new Set(parsed.records.map(r=>r.code)).size,26);assert.equal(new Set(parsed.records.map(r=>r.factSheetId)).size,26);
 assert(parsed.records.some(r=>r.code==='M.I2D.010.020'));assert(!parsed.records.some(r=>/\.10\.20$/.test(r.code)));
 assert.equal(processCode('M.I2D.010.020 Dock & Yard Management'),'M.I2D.010.020');
});

test('the real export over the snapshot: levels from the snapshot, other chains and Level 3 kept',()=>{
 const model=bundled(),lx=model.leanix;
 assert.deepEqual([0,1,2,3].map(l=>lx.covered.filter(c=>model.procs.get(c).level===l).length),[1,3,22,0]);
 assert.deepEqual(lx.scope,{chains:['M.I2D'],levels:[0,1,2]});
 assert(model.procs.has('M.O2C')&&[...model.procs.values()].some(n=>n.id.startsWith('M.I2D.')&&n.level===3),'other chains and Level 3 stay');
 assert.equal(model.procs.get('M.I2D.010.050.010').exportStatus,'level-not-covered','no Level 3 check is claimed');
 const fact=model.procs.get('M.I2D.010.020');
 assert.equal(fact.label,'Dock and Yard Management');assert.equal(fact.snapshotName,'Dock and Yard Management');
 assert.equal(fact.leanix.name,'Dock & Yard Management');assert.equal(fact.leanix.factSheetId,'11420c99-d651-4b51-8bba-f47c4d3a5a6b');
 assert.deepEqual(['M.I2D.010.020','M.I2D.010.030','M.I2D.010.040'].map(c=>model.procs.get(c).nameStatus),['equivalent','equivalent','equivalent']);
 const packaging=model.procs.get('M.I2D.020.050');
 assert.equal(packaging.nameStatus,'differs');assert.equal(packaging.label,'Packaging Handling');assert.equal(packaging.leanix.name,'Returnable Packaging Handling');
 assert.deepEqual(lx.notIncluded,['M.I2D.020.070','M.I2D.030.080']);
 for(const c of lx.notIncluded)assert.equal(model.procs.get(c).exportStatus,'not-included');
});

test('problems in an export are listed, never resolved by picking one record',()=>{
 const parsed=parseLeanixProcessExport(exportOf([['a','Process','M.X.010 One','M.X.010 One',''],['b','Process','M.X.010 Two','M.X.010 Two',''],['c','Process','No code here','No code here',''],['d','Process','M.X.020 A','M.X.030 A','']]));
 assert.deepEqual(parsed.issues.map(i=>i.type).sort(),['Duplicate process code','Duplicate process code','Name and Display Name codes differ','Process code not recognised']);
 const procs=new Map([node('M.X',"X",0),node('M.X.010','One',1),node('M.X.020','A',1)]);
 const applied=applyLeanixExport(procs,exportOf([['a','Process','M.X.010 One','M.X.010 One',''],['b','Process','M.X.010 Two','M.X.010 Two',''],['d','Process','M.X.020 A','M.X.030 A','']]));
 assert.equal(procs.get('M.X.010').leanix,undefined,'a duplicated code is not applied');assert.equal(procs.get('M.X.020').leanix,undefined,'conflicting codes are not applied');
 assert.deepEqual(applied.covered,[]);
});

const fixture=apps=>({capabilityRows:[['B.06 Logistics','B.06.1 Branch','B.06.1.1 Detail']],processRows:[['I2D','L0','M.I2D','Intralogistics to Demand'],['I2D','L1','M.I2D.020','Warehouse to Consume'],['I2D','L2','M.I2D.020.050','Packaging Handling'],['I2D','L3','M.I2D.020.050.010','Pack Detail'],['I2D','L2','M.I2D.020.010','Dock and Yard'],['I2D','L2','M.I2D.020.070','Foreign Trade'],['I2D','L1','M.I2D.030','Store to Ship'],['I2D','L2','M.I2D.030.010','Register Truck'],['I2D','L1','M.I2D.040','Other'],['I2D','L2','M.I2D.040.010','Register Truck']],
 leanixProcessExport:exportOf([['l0','Process','M.I2D Intralogistics to Demand','M.I2D Intralogistics to Demand',''],['l1','Process','M.I2D.020 Warehouse to Consume','M.I2D.020 Warehouse to Consume',''],['p','Process','M.I2D.020.050 Returnable Packaging Handling','M.I2D.020.050 Returnable Packaging Handling',''],['d','Process','M.I2D.020.010 Dock & Yard','M.I2D.020.010 Dock & Yard','']]),apps});
const app=(ID,Processes)=>({ID,Name:'App '+ID,Description:'d',Division:'PS',Entity:'P1','Lifecycle: Current Lifecycle':'active','Business Capabilities':'B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail',Processes});
const FULL='BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Warehouse to Consume L1;BBM PM I2D Packaging Handling L2;BBM PM I2D Pack Detail L3';

test('matching: and / & equivalent, a meaningful name difference kept, ambiguous names and missing codes not guessed',()=>{
 const model=buildModel(fixture([app('dock','BBM PM I2D Dock & Yard L2'),app('new','BBM PM I2D Returnable Packaging Handling L2'),app('truck','BBM PM I2D Register Truck L2'),app('load','BBM PM I2D Load Truck L2'),app('code','M.I2D.020.070 Foreign Trade'),app('old','BBM PM I2D Foreign Trade L2')]));
 const by=id=>model.apps.find(a=>a.id===id);
 assert.deepEqual(by('dock').processMatches,[{raw:'BBM PM I2D Dock & Yard L2',id:'M.I2D.020.010',via:'name'}]);
 assert.deepEqual(by('new').processMatches,[{raw:'BBM PM I2D Returnable Packaging Handling L2',id:'M.I2D.020.050',via:'leanix-name'}]);
 assert.deepEqual(matchSource(model,'M.I2D.020.050','leanix-name').sources,[model.leanix.label],'matched only by the LeanIX name');
 assert.deepEqual(by('truck').process,[],'one name, two codes: not resolved by order');
 assert.equal(model.issues.find(i=>i.appId==='truck').type,'流程名称对应多个编号');
 assert.deepEqual(by('load').process,[],'Load Truck is not mapped to Loading or a parent');
 assert.deepEqual(by('code').processMatches,[{raw:'M.I2D.020.070 Foreign Trade',id:'M.I2D.020.070',via:'code'}]);
 const old=processMatchRows(model,by('old'))[0];
 assert.deepEqual(old.sources,['Standard snapshot (Business Capability + Process.xlsx, 21.02.2025)'],'snapshot only, not shown as confirmed by LeanIX');
 assert.match(old.note,/Not included in this export\. This does not show that the process is retired/);
 const report=maintenanceReport(model,{},'process'),truck=report.issues.get('truck').find(i=>i.kind==='match');
 assert.match(truck.detail,/Candidates: M\.I2D\.030\.010 Register Truck \(Level 2\); M\.I2D\.040\.010 Register Truck \(Level 2\)/);assert.match(truck.detail,/Next: Confirm the business branch/);
 assert.match(report.issues.get('load').find(i=>i.kind==='match').detail,/Process code: not identified .*does not show that the process does not exist/);
});

test('To review: a passing Level 3 does not hide other issues; one application, all issues; a confirmed L3 covers L2, traced L0/L1 are not filled',()=>{
 const model=buildModel(fixture([app('ok',FULL),app('noLevel',FULL+';BBM PM I2D Something'),app('several','BBM PM I2D Pack Detail L3;BBM PM I2D Something')]));
 const report=maintenanceReport(model,{},'process'),l3=new Set(l3MaintenanceMetrics(report).quality.map(a=>a.id));
 assert(l3.has('noLevel'));assert(report.needsReview.some(a=>a.id==='noLevel'),'Level 3 passes, another record has no level: still To review');
 assert.deepEqual(report.issues.get('noLevel').map(i=>i.label),['Process level not specified','Process name differs between sources']);
 assert.equal(report.needsReview.filter(a=>a.id==='several').length,1);
 const several=report.issues.get('several');
 assert.deepEqual(several.map(i=>i.label),['Process level not specified'],'Levels 0–2 are covered by confirmed Level 3 (V9.5)');
 assert(several.filter(i=>i.kind==='missing').every(i=>i.traced&&/can be traced.*not counted as filled and is not a hierarchy error/.test(i.text)));
 assert.equal(report.levels.find(l=>l.level===2).filled.some(a=>a.id==='several'),false,'a traced parent is not counted as filled');
 // Show all levels changes columns only: the issue set and the count come from the same report.
 assert.deepEqual(maintenanceReport(model,{},'process').needsReview.map(a=>a.id),report.needsReview.map(a=>a.id));
});

test('bundled data: the name difference reaches To review with both names, equivalent spellings do not',()=>{
 const model=bundled(),report=maintenanceReport(model,{},'process');
 const lines=[...report.issues.values()].flat().filter(i=>i.label==='Process name differs between sources');
 assert(lines.length>=1&&lines.every(i=>/M\.I2D\.020\.050/.test(i.text)&&/Returnable Packaging Handling/.test(i.text)&&/"Packaging Handling"/.test(i.text)));
 assert(![...report.issues.values()].flat().some(i=>/Dock & Yard|Unloading & Check|Identification & Booking/.test(i.text)&&i.label==='Process name differs between sources'));
});

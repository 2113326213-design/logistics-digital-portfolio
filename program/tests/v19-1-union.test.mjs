// V19.1 (owner 2026-10-23: "其实没有标准表", "要并集的看", chose "应用登记的就算"): a process matches when it is in the
// Signavio process list or in LeanIX. The applications' processes come from LeanIX, so every process record with a level
// (L0–L3, L3V = L3) is in LeanIX and matches; only a record without a level and a missing level are process issues. The
// similarity check follows the union too ("也按并集"): such a record is not pending, like a confirmed one. Mappings and
// capabilities are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport,l3MaintenanceMetrics} from '../public/overview.mjs';
import {processIssues,capabilityIssues} from '../public/process-issues.mjs';
import {dataChecksForApp,dataChecksSummary} from '../public/data-checks.mjs';
import {toReviewRows} from '../public/to-review-export.mjs';
import {WHATS_NEW,updateNoticeHTML} from '../public/whats-new.mjs';
import {createWeightedSimilarity,portfolioCandidates} from '../public/weighted.mjs';
import {pairResultLabel} from '../public/pair-status.mjs';
import {comparisonReadiness} from '../public/similarity-readiness.mjs';

const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const bundled=()=>buildModel(workspaceData(JSON.parse(read('../public/data.json'))));
const byName=(model,name)=>model.apps.find(a=>a.Name===name);

test('V19.1: AUTO-RACK matches at Level 3 — no issue, no owner confirmation shown, nothing in Data checks to look at',()=>{
 const model=bundled(),app=byName(model,'AUTO-RACK'),report=maintenanceReport(model,{},'process');
 const record=report.records.get(app.id).find(r=>r.raw==='BBM PM I2D Putaway to Automated Warehouse L3V');
 assert.deepEqual([record.level,record.valid,record.accepted,record.reason],[3,true,null,'In LeanIX, not in the Signavio list']);
 assert.deepEqual(app.inLeanix.map(x=>x.raw),['BBM PM I2D Putaway to Automated Warehouse L3V']);
 assert.deepEqual(processIssues(model,app),[]);
 const checks=dataChecksForApp(model,app);
 assert.deepEqual(checks.checks,[],'the earlier orange "Confirmed by owner as recorded" row is gone');
 assert.equal(dataChecksSummary(checks),'0 to check · 1 mapped');
 const l3=l3MaintenanceMetrics(report);
 assert(l3.quality.includes(app)&&!l3.notPassing.includes(app)&&!l3.confirmed.includes(app));
 // The profile no longer shows the superseded confirmation.
 const appJs=read('../public/app.js');
 assert(appJs.includes("const confirmedShown=(a.accepted||[]).filter(d=>!(d.dimension==='process'&&(a.inLeanix||[]).some(x=>x.raw===d.raw)));"));
 assert(appJs.includes('${confirmedShown.length?`<p class="hint profile-confirmed">${confirmedShown.map('));
});

test('V19.1: on the bundled data every process with a level matches; only missing levels and records without a level are left',()=>{
 const model=bundled(),report=maintenanceReport(model,{},'process'),l3=l3MaintenanceMetrics(report);
 // 19 records with a level are not one Signavio process: 17 were issues, 2 were confirmed by the owner (AUTO-RACK, RBCW).
 // 2026-11-02 data (LeanIX export 20261102_025607_zApwu_inventory.xlsx): 19 -> 20. The export replaces
 // VMCN_iWPC_AKL_Szh5's L1/L2 records with "BBM PM Others L0", a Level 0 not in the Signavio list, so it is in LeanIX.
 // (EDCN AWS's 7 new ETAS.I2D records are not counted: by the ETAS rule they are the Signavio M.I2D processes.)
 assert.equal(model.apps.flatMap(a=>a.inLeanix).length,20);
 assert(model.apps.flatMap(a=>a.inLeanix).every(x=>/^BBM\s+PM\s/i.test(x.raw)&&/L[0-3]V?\s*$/i.test(x.raw)));
 // 2026-11-02 data (LeanIX export 20261102_025607_zApwu_inventory.xlsx): [11,67,67,8,0] -> [10,68,68,7,0]. CDR_EM recorded
 // only "BBM PM I2D Intralogistics to Demand L0"; the export gives it two P2F Level 3 processes, so it matches at Level 3
 // and leaves To review and the Level 3 card.
 assert.deepEqual([report.needsReview.length,l3.complete.length,l3.quality.length,l3.notPassing.length,l3.confirmed.length],[10,68,68,7,0],'To review 21 → 11 → 10 (2026-11-02 data); Level 3 matches 55 → 67 → 68');
 // 2026-11-02 data: Level 3 67 -> 68 (CDR_EM, as above). Levels 1 and 2 stay 73 and 70: CDR_EM joins them while
 // VMCN_iWPC_AKL_Szh5 (now only "BBM PM Others L0") leaves them.
 assert.deepEqual(report.levels.map(l=>[l.level,l.filled.length,l.valid.length]),[[0,75,75],[1,73,73],[2,70,70],[3,68,68]]);
 const labels=new Set(model.apps.flatMap(a=>report.issues.get(a.id).map(i=>i.label.replace(/\d/,'N'))));
 // V21: a record not in the standard form ("BBM_…", no level) is labelled "Process name not in the standard form". Every record without a level in the bundled data is written that way.
 assert.deepEqual([...labels].sort(),['Level N missing','Process name not in the standard form']);
 assert(!toReviewRows(model).some(r=>r.dimension==='Process'&&/match needs review|differs between sources/.test(r.issue)));
 // Load Truck, recorded by three applications, is no longer a question for the plants.
 for(const name of ['ShzP_DAVIS','RBCD WI management system'])assert(!processIssues(model,byName(model,name)).some(i=>i.raw==='BBM PM I2D Load Truck L3'),name);
});

test('V19.1: not found, several codes and another chain all match when the record has a level; without a level it is still an issue',()=>{
 const model=bundled(),report=maintenanceReport(model,{},'process');
 const valid=(app,raw)=>report.records.get(byName(model,app).id).find(r=>r.raw===raw);
 assert.deepEqual(byName(model,'RBCW E-Queue system').inLeanix.map(x=>x.type),['流程名称对应多个编号']);
 assert.equal(valid('RBCW E-Queue system','BBM PM I2D Register Truck L3').valid,true,'several Signavio codes');
 assert.equal(valid('VMCN_iSCMP: Intelligent Supply Chain management platform','BBM PM P2F Execute finite heuristic L3').valid,true,'not in the Signavio list');
 const noLevel=byName(model,'RBAC_ME_i-Warehouse');
 assert.deepEqual(processIssues(model,noLevel).map(i=>i.label),['Level 2 missing','Level 3 missing','Process name not in the standard form'],'the record without a level (V21: named for what it is), and the levels it cannot fill');
 assert.deepEqual(noLevel.inLeanix,[]);
});

test('V19.1: a matching record in LeanIX fills the levels above it (fixed rule 2026-10-23), with no Signavio code',()=>{
 const base=JSON.parse(read('../public/data.json'));
 const data={...base,apps:[{ID:'u1',Name:'Union only',Entity:'Plant A',Division:'PS','Business Capabilities':'',Processes:'BBM PM I2D Some Local Step L3'},{ID:'u2',Name:'No level',Entity:'Plant A',Division:'PS','Business Capabilities':'',Processes:'BBM PM I2D Some Local Step'}],corrections:[],acceptedRecords:[]};
 const model=buildModel(workspaceData(data)),report=maintenanceReport(model,{},'process');
 const [u1,u2]=model.apps;
 assert.deepEqual(processIssues(model,u1),[]);
 assert.deepEqual(report.coverage.get(u1.id).get(2),[{raw:'BBM PM I2D Some Local Step L3',code:null,parent:null,inLeanix:true}]);
 assert.deepEqual(report.levels.map(l=>l.valid.includes(u1)),[true,true,true,true]);
 assert.deepEqual(processIssues(model,u2).map(i=>i.label),['Level 0 missing','Level 1 missing','Level 2 missing','Level 3 missing','Process level not specified'],'without a level it fills nothing');
});

test('V19.1: the similarity check follows the union too ("也按并集"); mappings and capabilities are unchanged',()=>{
 const model=bundled(),data=workspaceData(JSON.parse(read('../public/data.json'))),threshold=data.similarityThreshold??50;
 // model.issues still holds the records without one Signavio code (mappings work on them as before) ...
 const issues=model.issues.filter(i=>i.type.startsWith('流程'));
 // 2026-11-02 data (LeanIX export 20261102_025607_zApwu_inventory.xlsx): 21 -> 26. VMCN_Packaging Data System gains four
 // BBM_PKG_* processes without a standard level, and VMCN_iWPC_AKL_Szh5 now records "BBM PM Others L0", a Level 0 not in
 // the Signavio list (in LeanIX, so it matches; it is still held here for mappings, like the other 19).
 assert.equal(issues.length,26);
 assert(issues.some(i=>i.app==='ShzP_DAVIS'&&i.value==='BBM PM I2D Load Truck L3'));
 assert.equal(byName(model,'AUTO-RACK').accepted.length,1,'the confirmation data is kept');
 // ... but the similarity check treats a process in LeanIX like a confirmed record: not pending, no evidence.
 const pairs=portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights)).pairs;
 const labels={};for(const p of pairs){const l=pairResultLabel(p,threshold);labels[l]=(labels[l]||0)+1;}
 // 2026-11-02 data (LeanIX export 20261102_025607_zApwu_inventory.xlsx): before {Below threshold 926, No shared
 // registrations 702, No complete score 250, More detail needed 62, Out of scope 564, Needs confirmation 258, Potential
 // overlap 13}. The 16 changed applications (mostly new Level 3 capabilities such as B.06.5.2, and new processes) move
 // pairs between labels; Potential overlap 13 -> 12 because CGQB_Logistic_system <-> Iris is now Below threshold (Iris
 // gained B.06.5.2, which CGQB_Logistic_system does not record, so its capability score falls from 1/3 to 1/5).
 assert.deepEqual(labels,{'Below threshold':876,'No shared registrations':691,'No complete score':251,'More detail needed':61,'Out of scope':564,'Needs confirmation':320,'Potential overlap':12},'until V19: Needs confirmation 726, Potential overlap 10');
 const readiness=comparisonReadiness(pairs,threshold),listed=readiness.apps.map(row=>row.app.Name).sort();
 // 2026-11-02 data: CDR_EM leaves (it was listed for its Level 0-only "BBM PM I2D Intralogistics to Demand L0"; it now
 // records two P2F Level 3 processes). VMCN_Packaging Data System joins for its four BBM_PKG_* processes without a level,
 // and VMCN_iWPC_AKL_Szh5 joins because it now records a process only at Level 0 ("BBM PM Others L0").
 assert.deepEqual(listed,['RBAC_ME_i-Warehouse','RBCC I4.0 Visualization (Davis)','RBCC Production Excution Support System(PESS)','RBCD LOG Xone','VMCN_Packaging Data System','VMCN_iWPC_AKL_Szh5']);
 const inLeanix=new Set(model.apps.flatMap(a=>a.inLeanix.map(x=>x.raw)));
 // 2026-11-02 data: expected [] -> the one record below. "BBM PM Others L0" (VMCN_iWPC_AKL_Szh5) is the first Level 0
 // record in LeanIX in the bundled data. It is not pending (not "Needs confirmation"), as the union rule requires; it is
 // listed only as "More detail needed" by the separate Level 0 rule, exactly as CDR_EM's Signavio L0 was until now.
 const listedInLeanix=readiness.apps.flatMap(row=>row.records.filter(r=>inLeanix.has(r.raw)).map(r=>[row.app.Name,r.dimension,r.kind,r.raw,r.reason]));
 assert.deepEqual(listedInLeanix,[['VMCN_iWPC_AKL_Szh5','process','More detail needed','BBM PM Others L0','This process chain is recorded only at Level 0; a Level 1 or deeper record is needed.']],'no process in LeanIX is listed to confirm');
 const overlap=pairs.filter(p=>pairResultLabel(p,threshold)==='Potential overlap').map(p=>[p.target.app.Name,p.peer.app.Name].sort().join(' <-> '));
 for(const pair of ['AUTO-RACK <-> Szh5_ASRS_WCS_WMS','RBCC E-Queue system(Karis) <-> RBCW E-Queue system','RBCW Auto Warehouse Management System <-> Szh5_ASRS_WCS_WMS'])assert(overlap.includes(pair),pair);
 // Capabilities: the same issues as before, e.g. a capability outside B.06.
 // 2026-11-02 data (LeanIX export 20261102_025607_zApwu_inventory.xlsx): ShzP_ALICE no longer records B.05.2 Material Field
 // Management (the export lists only B.06 capabilities for it), so the check uses the equivalent unchanged case:
 // CngP/MSE-Nbo Supplier SCM's B.05.3.7, also a capability outside B.06 and an issue before this data as well.
 assert(capabilityIssues(model,byName(model,'CngP/MSE-Nbo Supplier SCM')).some(i=>i.raw==='B.05.3.7 Supplier Collaboration Management'));
});

test('V19.1: the explanation and the one-time update notice say it in plain words, with no version number',()=>{
 const overview=read('../public/overview.mjs');
 assert(overview.includes('A process matches when it is in the Signavio process list or in LeanIX; every process recorded with a level (L0–L3) is in LeanIX, so only a process without a level does not match.'));
 // V19.3 (2026-11-02) gave the notice a new id; the V19.1 line stays in it.
 assert.notEqual(WHATS_NEW.id,'2026-10-23-2');
 const html=updateNoticeHTML(s=>String(s));
 assert(html.includes('<li>A process now counts as matching when it is in the Signavio list or in LeanIX. Every process recorded with a level (L0 to L3) is in LeanIX, so only processes without a level are still listed to review. The Similarity check no longer asks to confirm them.</li>'));
 assert.doesNotMatch(html,/\bV\d|version|release/i);
});

import {recordImport} from '../public/application-history.mjs';
import {columns} from '../public/model.mjs';
test('V19.1 review: an import does not log a process in LeanIX as an issue, and the landscape treats such processes alike',()=>{
 const base=workspaceData(JSON.parse(read('../public/data.json')));
 const app={ID:'u1',Name:'Union app',Entity:'Plant A',Division:'PS','Business Capabilities':'B.06.1.1 X',Processes:'BBM PM I2D Some Local Step'};
 const before={...base,apps:[...base.apps,app]},after={...base,apps:[...base.apps,{...app,Processes:'BBM PM I2D Some Local Step L3'}]};
 // Without a level the record was an issue; with a level it is in LeanIX: the import clears it and flags nothing.
 const event=recordImport(before,after,{inventoryFile:'x.xlsx',at:'2026-10-23T10:00:00.000Z'}).importHistory.at(-1);
 assert.deepEqual(event.issues.filter(i=>i.appId==='u1').map(i=>[i.kind,i.record]),[['cleared','BBM PM I2D Some Local Step']]);
 // Not classified (process landscape): an application is there for an unresolved record, not for a process in LeanIX.
 const model=bundled(),unmapped=columns(model,'process',new Set()).find(c=>c.id==='unmapped'),names=new Set(unmapped.apps.map(a=>a.Name));
 for(const name of ['ShzP_DAVIS','RBCW E-Queue system','AUTO-RACK','RBCW Auto Warehouse Management System'])assert(!names.has(name),name);
 for(const name of ['RBAC_ME_i-Warehouse','RBCC I4.0 Visualization (Davis)','RBCD LOG Xone'])assert(names.has(name),name+' (a record without a level)');
});

import {createSimilarity} from '../public/similarity.mjs';
test('V19.1 test audit: every level (L0–L3, L3V) and a name of another chain match through LeanIX; no level stays an issue',()=>{
 const base=workspaceData(JSON.parse(read('../public/data.json')));
 const records={'BBM PM I2D Local Root L0':[0,'流程未匹配层级表'],'BBM PM I2D Local Area L1':[1,'流程未匹配层级表'],'BBM PM I2D Local Group L2':[2,'流程未匹配层级表'],'BBM PM I2D Local Step L3':[3,'流程未匹配层级表'],'BBM PM I2D Local Variant L3V':[3,'流程未匹配层级表'],'BBM PM O2C Putaway L2':[2,'流程链编号存在差异']};
 const app={ID:'lv',Name:'Every level',Entity:'Plant A',Division:'PS','Business Capabilities':'B.06.1.1 X',Processes:[...Object.keys(records),'BBM PM I2D Local Thing'].join(';')};
 const model=buildModel(workspaceData({...base,apps:[...base.apps,app]})),a=byName(model,'Every level'),report=maintenanceReport(model,{},'process');
 assert.deepEqual(a.inLeanix.map(x=>[x.raw,x.level,x.type]),Object.entries(records).map(([raw,[level,type]])=>[raw,level,type]));
 for(const raw of Object.keys(records)){
  const r=report.records.get(a.id).find(x=>x.raw===raw);
  assert.deepEqual([r.valid,r.accepted,r.reason],[true,null,'In LeanIX, not in the Signavio list'],raw);
  assert(!processIssues(model,a).some(i=>i.raw===raw),raw);
  assert(!dataChecksForApp(model,a).checks.some(c=>c.raw===raw),raw);
 }
 assert.deepEqual(processIssues(model,a).map(i=>[i.label,i.raw]),[['Process level not specified','BBM PM I2D Local Thing']]);
 assert.deepEqual(report.levels.map(l=>l.valid.includes(a)),[true,true,true,true]);
 // The similarity check holds only the record without a level as pending.
 assert.deepEqual(createSimilarity(model,'process').scopes.get(a.id).pending.map(p=>p.value),['BBM PM I2D Local Thing']);
});

// V21 (owner 2026-11-12: "让别人一眼就能看出是什么问题", then "详细的对比展示", plan A + B): a process record whose level the
// tool cannot read from its name is called "Process name not in the standard form", shown part by part next to a
// standard record of the same application (A), and listed under Overview, Process, with what to change in LeanIX and a
// CSV for the plants (B). Issues to review, Data checks, the To review export and the Similarity notes use the same words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processIssues,renderProcessIssues} from '../public/process-issues.mjs';
import {dataChecksForApp} from '../public/data-checks.mjs';
import {processNameParts,checkProcessName,standardExample,noLevelRecord,nameComparison,renderNameComparison,nameProblems,NOT_STANDARD_LABEL,NO_LEVEL_LABEL,STANDARD_EXAMPLE} from '../public/process-record-kind.mjs';
import {nameFixRows,renderNameFixes,nameFixCSV,nameFixFileName} from '../public/process-name-fixes.mjs';
import {WHATS_NEW,updateNoticeDue,updateNoticeHTML} from '../public/whats-new.mjs';

const read=file=>readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
const data=JSON.parse(read('data.json')),model=buildModel(workspaceData(data)),esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const byName=name=>model.apps.find(a=>a.Name===name);
const PESS='RBCC Production Excution Support System(PESS)',OLD='BBM_P2S_LE_01 Production Replenishment',DAVIS='RBCC | Warehouse Delivery';
const EIGHT=[['RBAC_ME_i-Warehouse','BBM_P2S_LE Warehousing & Material Flow:Internal Warehousing'],['RBCC I4.0 Visualization (Davis)',DAVIS],[PESS,OLD],['RBCD LOG Xone','BBM_O2C_OM_01 Schedule Agreement for Goods'],['VMCN_Packaging Data System','BBM_PKG_PD_02 Develop, test and release packaging concept (O2C, P2S, P2P)'],['VMCN_Packaging Data System','BBM_PKG_PD_03 Master data maintenance for packaging material and packaging specification (O2C, P2S, P2P)'],['VMCN_Packaging Data System','BBM_PKG_PD_04 Change management for existing packaging material and packaging specification (O2C, P2S, P2P)'],['VMCN_Packaging Data System','BBM_PKG_PM Packaging Management (O2C, P2S, P2P)']];

test('V21: a recorded name is read as prefix, process chain, name and level; L3V is L3',()=>{
 assert.deepEqual(processNameParts(OLD),{prefix:'BBM_',chain:'P2S',name:'LE_01 Production Replenishment',level:''});
 assert.deepEqual(processNameParts('BBM PM I2D Request Packaging Kit L3'),{prefix:'BBM PM',chain:'I2D',name:'Request Packaging Kit',level:'L3'});
 assert.deepEqual(processNameParts('BBM PM I2D Putaway to Automated Warehouse L3V'),{prefix:'BBM PM',chain:'I2D',name:'Putaway to Automated Warehouse',level:'L3'});
 assert.deepEqual(processNameParts(DAVIS),{prefix:'',chain:'',name:DAVIS,level:''});
 assert.deepEqual(processNameParts('BBM PM I2D Block / Unblock Stock'),{prefix:'BBM PM',chain:'I2D',name:'Block / Unblock Stock',level:''});
});

test('V21: each part is checked against the standard form, with a short note on what is wrong',()=>{
 assert.deepEqual(checkProcessName(model,OLD).map(p=>[p.part,p.state,p.note]),[['Prefix','wrong','should be "BBM PM"'],['Process chain','wrong','not one of the 16 standard chains'],['Process name','check','not in the standard list'],['Level','wrong','no L0–L3 at the end']]);
 assert.deepEqual(checkProcessName(model,DAVIS).map(p=>[p.state,p.note]),[['wrong','missing (should be "BBM PM")'],['wrong','missing'],['check','not in the standard list'],['wrong','no L0–L3 at the end']]);
 assert.deepEqual(checkProcessName(model,'BBM PM I2D Request Packaging Kit L3').map(p=>p.state),['ok','ok','ok','ok']);
 // O2C is a standard chain: only the prefix, the name and the level are wrong.
 assert.deepEqual(checkProcessName(model,'BBM_O2C_OM_01 Schedule Agreement for Goods').map(p=>p.state),['wrong','ok','check','wrong']);
 assert.equal(nameProblems(model,OLD),'Prefix "BBM_": should be "BBM PM" · Process chain "P2S": not one of the 16 standard chains · Process name "LE_01 Production Replenishment": not in the standard list · Level: no L0–L3 at the end');
});

test('V21: what the record is, in plain words, with what to change in LeanIX',()=>{
 const old=noLevelRecord(model,OLD);
 assert.equal(old.label,NOT_STANDARD_LABEL);assert.equal(NOT_STANDARD_LABEL,'Process name not in the standard form');
 assert.equal(old.text,'The tool reads the level from the name. This name has no level (L0–L3) and is not in the standard process list, so the tool cannot place it. "P2S" is not one of the standard process chains.');
 assert.equal(old.next,'In LeanIX, replace it with a standard process (written "BBM PM <chain> <name> L1", "L2" or "L3"), or remove it if another process already covers it.');
 assert.doesNotMatch(noLevelRecord(model,DAVIS).text,/is not one of the standard process chains/,'no chain to name');
 assert.doesNotMatch(noLevelRecord(model,'BBM_O2C_OM_01 Schedule Agreement for Goods').text,/O2C/,'O2C is a standard chain');
 // A standard name without its level keeps the old label; when the name is one standard process, it is named with its level.
 const named=noLevelRecord(model,'BBM PM I2D Block / Unblock Stock');
 assert.deepEqual([named.label,named.text,named.next],[NO_LEVEL_LABEL,'The level (L0–L3) is missing at the end of the name. The name is the standard process M.I2D.020.060.040 (Level 3).','In LeanIX, choose "BBM PM I2D Block / Unblock Stock L3".']);
 const unknown=noLevelRecord(model,'BBM PM T Something');
 assert.deepEqual([unknown.label,unknown.next],[NO_LEVEL_LABEL,'Confirm which level (L0–L3) this process belongs to.']);
});

test('V21 (A): the comparison uses a standard record of the same application, Level 3 first, or an example',()=>{
 const pess=byName(PESS),comparison=nameComparison(model,pess,OLD);
 assert.equal(comparison.example.own,true);
 assert(pess.rawProcess.includes(comparison.example.raw)&&comparison.example.parts.level==='L3',comparison.example.raw);
 assert.deepEqual(comparison.recorded.map(p=>p.state),['wrong','wrong','check','wrong']);
 // An application whose only record is the old one compares with the example.
 const lonely=buildModel(workspaceData({...data,apps:[...data.apps,{...data.apps.find(a=>a.Name===PESS),ID:'lonely',Name:'Lonely',Processes:OLD}]}));
 const example=standardExample(lonely,lonely.apps.find(a=>a.id==='lonely'));
 assert.deepEqual(example,{raw:STANDARD_EXAMPLE,own:false});
 const html=renderNameComparison(comparison,esc);
 assert.match(html,/<span class="name-part is-wrong" role="cell">BBM_<small>should be &quot;BBM PM&quot;<\/small><\/span>/);
 assert.match(html,/<span class="name-part is-wrong" role="cell">none<small>no L0–L3 at the end<\/small><\/span>/);
 assert.match(html,/Standard form<small>a record of this application<\/small>/);
 assert.match(renderNameComparison(nameComparison(lonely,lonely.apps.find(a=>a.id==='lonely'),OLD),esc),/Standard form<small>an example<\/small>/);
 assert.equal(renderNameComparison(null,esc),'');
});

test('V21 (A): Issues to review, the application details and Data checks say the same',()=>{
 const pess=byName(PESS),issues=processIssues(model,pess);
 assert.equal(issues.length,1);
 assert.deepEqual([issues[0].label,issues[0].raw,issues[0].findings[0]],[NOT_STANDARD_LABEL,OLD,noLevelRecord(model,OLD).text]);
 assert.match(issues[0].findings[1],/Next: In LeanIX, replace it with a standard process/);
 assert.ok(issues[0].compare);
 const html=renderProcessIssues(issues,esc);
 // The record stays first in the item (the details find an issue by its record), then the label, the notes and the grid.
 assert.match(html,/<div class="profile-unlisted" data-issue-dimension="process" data-issue-record="BBM_P2S_LE_01 Production Replenishment" data-issue-kind="record"><span class="profile-source-label">BBM_P2S_LE_01 Production Replenishment<\/span><strong class="profile-issue-label">Process name not in the standard form<\/strong>/);
 assert.match(html,/<div class="name-compare" role="table"/);
 const tag=dataChecksForApp(model,pess).checks.find(r=>r.raw===OLD).tags[0];
 assert.equal(tag.label,NOT_STANDARD_LABEL);assert.match(tag.detail,/^The tool reads the level from the name\..* In LeanIX, replace it/);
 // The Similarity record notes use the same label.
 assert(read('comparison-records.mjs').includes("record.reason==='流程未标注标准层级'?noLevelRecord(model,value).label:english(record.reason)"));
 // Records with a level are not touched: Issues to review, Data checks and Level 3 for PESS are as before.
 const report=maintenanceReport(model,{},'process');
 assert(report.levels.every(l=>l.valid.includes(pess)),'PESS Level 0–3 still count as matching');
});

test('V21 (B): every such record of the Overview plants, with what is wrong and what to change, and the CSV for the plants',()=>{
 const report=maintenanceReport(model,{},'process'),rows=nameFixRows(model,report);
 assert.deepEqual(rows.map(r=>[r.application,r.record]),EIGHT,'8 records on 5 applications, by plant then application');
 assert.deepEqual([...new Set(rows.map(r=>r.plant))],['ME-CN','RBCC','RBCD','VM-CN']);
 assert(rows.every(r=>r.issue===NOT_STANDARD_LABEL&&r.next.startsWith('In LeanIX, replace it')));
 assert.deepEqual(nameFixRows(model,maintenanceReport(model,{entity:'RBCC'},'process')).map(r=>r.record),[DAVIS,OLD],'the Overview plant filter applies');
 assert.equal(nameFixRows(model,maintenanceReport(model,{entity:'RBWB'},'process')).length,0);
 const html=renderNameFixes(model,report,esc);
 assert.match(html,/<h3 id="nameFixesTitle">Process names to fix in LeanIX · 8<\/h3>/);
 assert(html.includes('<button type="button" id="overviewExportNameFixes">Export for plants (CSV)</button>'));
 assert(html.includes(`data-label-app="${byName(PESS).id}"`),'the application opens from the list');
 assert.equal(renderNameFixes(model,maintenanceReport(model,{entity:'RBWB'},'process'),esc),'','nothing to fix, no list');
 const csv=nameFixCSV(model,report,{source:data.source}),lines=csv.split('\r\n');
 assert(csv.startsWith('﻿"Plant","Business unit","Application ID","Application","Recorded in LeanIX","Issue","What is wrong","What to change","Data source"'));
 assert.equal(lines.length,9);
 assert(lines[3].includes(`"${OLD}","${NOT_STANDARD_LABEL}","Prefix ""BBM_"": should be ""BBM PM"" · `),'quotes doubled for Excel');
 assert(lines[5].includes('(O2C, P2S, P2P)"'),'commas inside a quoted field');
 assert.equal(nameFixFileName({entity:'VM-CN'},'2026-11-12'),'Process_names_to_fix_VM-CN_2026-11-12.csv');
 assert.equal(nameFixFileName({},'2026-11-12'),'Process_names_to_fix_all_plants_2026-11-12.csv');
 // Only under Process, and the export button is wired on the Overview.
 const overview=read('overview.mjs'),app=read('app.js');
 assert(overview.includes("${dimension==='process'?renderNameFixes(model,report,esc):''}"));
 assert(app.includes("if(!e.target.closest('#overviewExportNameFixes')||!model)return;")&&app.includes("nameFixCSV(model,maintenanceReport(model,filters,'process'),{source:data?.source||''}),nameFixFileName(filters)"));
 assert(read('interface.css').includes('.name-compare{')&&read('interface.css').includes('.name-fixes-table{'));
});

test('BBM_SWS records matched by code are not listed in Process names to fix in LeanIX',()=>{
 // 2026-11-12 export compatibility: both numbered records and a Level 0 chain can carry the BBM_SWS prefix.
 const raw=['BBM_SWS.P2F Plan to Fulfill','BBM_SWS.P2F.040.090.030 Monitoring Dashboards'];
 const updated=buildModel(workspaceData({...data,apps:[...data.apps,{ID:'bbm-sws-test',Name:'BBM SWS test',Entity:'Plant A',Division:'PS','Business Capabilities':'B.06.5.1 Inbound Management and Receiving',Processes:raw.join(';')}]}));
 const app=updated.apps.find(a=>a.id==='bbm-sws-test'),report=maintenanceReport(updated,{},'process');
 assert.deepEqual(app.processMatches.map(m=>[m.id,m.via]),[['M.P2F','code'],['M.P2F.040.090.030','code']]);
 assert.deepEqual(report.records.get(app.id).map(r=>[r.level,r.valid]),[[0,true],[3,true]]);
 assert(!processIssues(updated,app).some(i=>raw.includes(i.raw)));
 assert.deepEqual(nameFixRows(updated,report).map(r=>[r.application,r.record]),EIGHT,'the existing eight unresolved records stay; BBM_SWS adds none');
 for(const record of raw)assert(!nameFixCSV(updated,report).includes(record));
 assert.equal(noLevelRecord(updated,'BBM_SWS.P2F A different name').label,NO_LEVEL_LABEL,'an unmatched BBM_SWS name still has the standard code form');
});

test('V21: plain words only, and returning users are told once, with no version number',()=>{
 for(const file of ['process-record-kind.mjs','process-name-fixes.mjs'])assert.doesNotMatch(read(file).replace(/\/\/[^\n]*/g,''),/steward|catalogue|taxonomy/i,file);
 // 2026-11-12 data: the later data release has its own notice, including for users who dismissed V21 earlier that day.
 assert.equal(WHATS_NEW.id,'2026-11-12-2');
 const seen=id=>{const map=new Map([['logistics-portfolio:update-seen',id]]);return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))};};
 assert.equal(updateNoticeDue(seen('2026-11-02-2')),true,'someone who closed the V20 notice sees this one');
 assert.equal(updateNoticeDue(seen('2026-11-12')),true);
 assert.equal(updateNoticeDue(seen('2026-11-12-2')),false);
 const html=updateNoticeHTML(s=>String(s));
 assert.match(html,/The tool was updated on 12 November 2026\./);
 assert.match(html,/<li>A process name the tool cannot read is now called "Process name not in the standard form"\./);
 assert.match(html,/<li>The Import data window uses simpler words: "LeanIX file \(\.xlsx\)", "Share with everyone" and "Put back an earlier upload"\.<\/li>/);
 assert.doesNotMatch(html,/Share this data with everyone|Restore earlier server data/,'the current names of the buttons');
 assert.doesNotMatch(html,/\bV\d|version|release|steward/i);
});

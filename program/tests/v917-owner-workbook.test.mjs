// V9.17 (owner request 2026-10-21): the owner workbook 20261021_logistic_inventory.xlsx (sheets Logistic Apps_1021,
// Logistic Apps_0825, Parameter Score, Dimension score) is merged through Import data. Its scope column is named
// 'with score or not' and a new 'Status in Oct' column says whether each application is still active. Owner decision:
// applications without a score and applications whose status is not "still active" are not counted (cost totals, ROI
// payback, similarity check); their records stay in the list. ROI is shown as its payback period by the formula of
// 2026-10-20 (1 → > 2 years, 3 → > 1 year, 5 → < 1 year).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {opportunityEligibility} from '../public/scope.mjs';
import {scopeReason,opportunityCostLabel} from '../public/display.mjs';
import {roiPayback,roiPaybackNote} from '../public/roi.mjs';
import {costSummary} from '../public/costs.mjs';
import {mergeInventoryEvidence,previewImport} from '../public/import-review.mjs';
import {workspaceData,exportWorkspace,importWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';
import {renderSourceRecords} from '../public/source-records.mjs';
import {historyFieldLabel} from '../public/history-view.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {RECORDS_V916} from './records-v916.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const raw=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const data=workspaceData(raw),v916=workspaceData(JSON.parse(readFileSync(RECORDS_V916,'utf8')));
const named=name=>data.apps.find(app=>app.Name===name);
const tally=values=>values.reduce((t,v)=>(t[v]=(t[v]||0)+1,t),{});

// The header row of Logistic Apps_1021 in the real workbook (column J has no header).
const HEADER=['ID','Type','Status in Oct','with score or not','Division','Entity','Name','Display Name','Description','','Lifecycle: Current Lifecycle','Lifecycle: Active','Lifecycle: End of Life','IT Owner of the Application','Application Manager Organization','Responsible: Application Manager(IT)','Main Business Capability','Business Capabilities','Processes','User Groups','Provided Interfaces','Consumed Interfaces','Application Basis','Business Criticality','Design Scope Level','IT Components','Open Source Software (OSS) - Relevance','Open Source Software (OSS) - Status','Third-Party Software - Relevance','Third-Party Software - Status'];
const ownerRow=fields=>HEADER.map(h=>fields[h]??'');
const ownerWorkbook=(header=HEADER)=>({
 'Logistic Apps_1021':[header,
  ownerRow({ID:'A',Type:'Application','Status in Oct':'still active','with score or not':'with score',Division:'PS',Entity:'RBCD',Name:'Alpha','Business Capabilities':'B.06.5 Material Flow Orchestration'}),
  ownerRow({ID:'B',Type:'Application','Status in Oct':'phaseout','with score or not':'with score',Division:'PS',Entity:'RBCW',Name:'Beta'}),
  ownerRow({ID:'C',Type:'Application','Status in Oct':'still active','with score or not':'no score,not BBM',Division:'ME',Entity:'ME-CN',Name:'Gamma'})],
 // The August list stays in the workbook as the second sheet; the first inventory sheet is read.
 'Logistic Apps_0825':[['ID','Type','with score or not','Division','Entity','Name','Business Capabilities','Processes'],['Z','Application','with score','PS','RBHP','Old only','','']],
 'Parameter Score':[['LeanIX ID','App Name','App operation cost','ROI'],['A','Alpha','5','3'],['B','Beta','1','1']]
});

test('the owner workbook is read from its first inventory sheet, with scope and status found by header',()=>{
 const apps=inventoryFromSheets(ownerWorkbook());
 assert.deepEqual(apps.map(app=>[app.ID,app.statusNote,app.statusSource,app.scopeNote,app.scopeSource,app.operationCostScore,app.roiScore]),[
  ['A','still active','Logistic Apps_1021!C2 (Status in Oct)','with score','Logistic Apps_1021!D2',5,3],
  ['B','phaseout','Logistic Apps_1021!C3 (Status in Oct)','with score','Logistic Apps_1021!D3',1,1],
  ['C','still active','Logistic Apps_1021!C4 (Status in Oct)','no score,not BBM','Logistic Apps_1021!D4',null,null]
 ]);
 // Another month in the header is the same column.
 const november=inventoryFromSheets(ownerWorkbook(HEADER.map(h=>h==='Status in Oct'?'Status in Nov':h)));
 assert.equal(november[1].statusSource,'Logistic Apps_1021!C3 (Status in Nov)');
 // The August layout and a LeanIX export have no status column: no status is recorded.
 const august=inventoryFromSheets({'Logistic Apps':[['ID','Type',null,'Division','Entity','Name','Business Capabilities','Processes'],['A','Application','with score','PS','RBCD','Alpha','','']]});
 assert.deepEqual([august[0].scopeSource,Object.hasOwn(august[0],'statusNote')],['Logistic Apps!C2',false]);
});

test('an application whose status is not "still active" is not counted; a blank or absent status excludes nothing',()=>{
 for(const statusNote of ['still active',' Still  Active ','',undefined])assert.equal(opportunityEligibility({scopeNote:'with score',statusNote}).eligible,true,String(statusNote));
 for(const statusNote of ['phaseout','endoflife','owner changed to central']){
  const app={scopeNote:'with score',statusNote,roiScore:5,operationCostScore:5};
  assert.deepEqual(opportunityEligibility(app),{eligible:false,reason:`Status "${statusNote}" in the source inventory (not still active)`});
  assert.equal(scopeReason(app),`Not still active (${statusNote})`);
  assert.equal(opportunityCostLabel(app),'Out of scope');
  assert.deepEqual([roiPayback(app).kind,roiPayback(app).text],['not-scored','Not scored']);
  assert.match(roiPaybackNote(app),/^Not scored: Status ".+" in the source inventory \(not still active\)\. Source ROI score 5 \/ 5\.$/);
 }
 // A no-score marker is named first.
 assert.equal(opportunityEligibility({scopeNote:'no score,not an application',statusNote:'phaseout'}).reason,'Marked as not an application in the source inventory');
});

test('imports keep a recorded status when the column is absent, and the preview names the applications no longer counted',()=>{
 const merged=mergeInventoryEvidence([{ID:'A',Name:'Alpha',statusNote:'phaseout',statusSource:'Logistic Apps_1021!C2 (Status in Oct)'}],[{ID:'A',Name:'Alpha'}]);
 assert.deepEqual([merged[0].statusNote,merged[0].statusSource],['phaseout','Logistic Apps_1021!C2 (Status in Oct)']);
 assert.equal(mergeInventoryEvidence([{ID:'A',statusNote:'phaseout'}],[{ID:'A',statusNote:'still active'}])[0].statusNote,'still active','a supplied value replaces it');
 const incoming={...v916,apps:v916.apps.map(app=>({...app,statusNote:app.Name==='RBCW LOM Dashboard'?'phaseout':'still active',statusSource:'Logistic Apps_1021!C2 (Status in Oct)'}))};
 const preview=previewImport(v916,incoming,incoming);
 assert.deepEqual(preview.scopeExclusionsAdded.map(app=>app.Name),['RBCW LOM Dashboard']);
 assert.equal(preview.updated.length,76,'every application gains its status');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes("no longer counted (no score, or status not still active): ${preview.scopeExclusionsAdded.map(a=>esc(a.Name)).join(', ')}. They stay in the list and are left out of cost totals, ROI and the similarity check."));
});

test('the status survives a workspace round trip, comes into an older saved workspace, and shows in source records and history',()=>{
 const again=importWorkspace(exportWorkspace(data));
 assert.deepEqual(again.apps.map(app=>[app.statusNote,app.statusSource]),data.apps.map(app=>[app.statusNote,app.statusSource]));
 const saved={...data,apps:data.apps.map(({statusNote,statusSource,...app})=>app)};
 const result=mergeBundledCorrections(saved,raw);
 assert.equal(result.changed,true);
 assert.deepEqual(result.data.apps.map(app=>app.statusNote),data.apps.map(app=>app.statusNote));
 const dashboard=renderSourceRecords(named('RBCW LOM Dashboard'),esc),live=renderSourceRecords(named('AGR w/ Camera'),esc);
 assert.match(dashboard,/Status in source inventory[\s\S]*Logistic Apps_1021!C52 \(Status in Oct\) · Not still active: not counted in cost totals, ROI or the similarity check\.[\s\S]*phaseout/);
 assert.match(live,/Status in source inventory[\s\S]*still active/);assert.doesNotMatch(live,/Not still active/);
 assert.equal(historyFieldLabel('statusNote'),'Status in source inventory');
});

test('bundled data V9.17: the owner workbook of 2026-10-21 replaced the list; one application left it and the history keeps both imports',()=>{
 assert.equal(data.source,'20261021_logistic_inventory.xlsx');
 assert.equal(data.apps.length,75);
 assert.equal(Object.hasOwn(raw,'inventoryExport'),false,'a full workbook clears the LeanIX export record of V9.16');
 const [exportEvent,event]=raw.importHistory.slice(-2);
 assert.equal(exportEvent.inventoryFile,'20261020_083736_UKj4Y_inventory.xlsx');
 assert.equal(event.inventoryFile,'20261021_logistic_inventory.xlsx');
 // CGQB_Logistic_system_Q is in Logistic Apps_0825 but not in Logistic Apps_1021.
 assert.deepEqual([event.removedIds,event.addedIds],[['fab13598-0672-4301-97ca-67583a04806b'],[]]);
 assert.equal(data.apps.some(app=>app.ID==='fab13598-0672-4301-97ca-67583a04806b'),false);
 assert.deepEqual(event.decisions.map(d=>d.note),["Owner decision applied: removed 'Manufacturing' from BMLP_Nexeed_IAS@WxP processes"]);
 assert.equal(named('BMLP_Nexeed_IAS@WxP').Processes,'BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Receive to Store L1');
 assert.deepEqual(tally(event.changes.map(c=>c.field)),{statusNote:75,operationCostScore:14,roiScore:9,'Business Capabilities':3,'Lifecycle: Current Lifecycle':2,Name:1});
 const change=(name,field)=>{const app=v916.apps.find(a=>a.Name===name)||named(name);const c=event.changes.find(c=>c.appId===app.ID&&c.field===field);return [c.before,c.after];};
 assert.deepEqual(change('RBCW LOM Dashboard','Lifecycle: Current Lifecycle'),['active','phaseOut']);
 assert.deepEqual(change('VM/LOG-Szh2_DAVIS','Lifecycle: Current Lifecycle'),['active','endOfLife']);
 assert.deepEqual(change('VM/LOG-Szh2_DAVIS','Name'),['VM/LOG-Szh2_DAVIS','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)']);
 // The re-scored applications, read off the Parameter Score sheets of 20260825 and 20261021 by LeanIX ID (App operation cost, ROI).
 const scores=field=>Object.fromEntries(event.changes.filter(c=>c.field===field).map(c=>[v916.apps.find(a=>a.ID===c.appId).Name,`${c.before}->${c.after}`]));
 assert.deepEqual(scores('operationCostScore'),{'ARS':'5->4','CDR_EM':'1->5','EDCN AWS':'3->5','Iris':'4->2','RBCC I-PFEP':'1->5','RBCC I4.0 Visualization (Davis)':'5->1','RBCC LOG Control Tower V2':'3->5','RBCC Production Excution Support System(PESS)':'5->1','RBCC Supplier Logistics Management Platform':'1->5','RBCC_CDP':'1->5','RBCC_IDPS_Intelligent document print system':'1->5','RBCC_VNA task management':'2->4','RBCW E-Queue system':'1->5','RCS-2000':'1->5'});
 assert.deepEqual(scores('roiScore'),{'EDCN AWS':'1->5','PMS (Package Management System)':'5->1','RBCC E-Queue system(Karis)':'5->1','RBCC LOG Control Tower V2':'1->5','RBCC Supplier Logistics Management Platform':'1->5','RBCC_CDP':'1->5','RBCC_VNA task management':'5->1','RBCW E-Queue system':'1->3','RCS-2000':'1->5'});
});

test('bundled data V9.17: eight applications are not counted; the 67 counted ones total ¥2,890,000 and all have a payback period',()=>{
 assert.deepEqual(tally(data.apps.map(app=>app.statusNote)),{'still active':72,'phaseout':1,'endoflife':1,'owner changed to central':1});
 const excluded=data.apps.filter(app=>!opportunityEligibility(app).eligible).map(app=>app.Name).sort();
 assert.deepEqual(excluded,['360° Supplier dashboard','CngP/MSE-Nbo Supplier SCM','RBAC_ME_Szh5 Intralogistics control system','RBCE Auto Warehouse Management System','RBCW LOM Dashboard','VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15)','VMCN_CONNEX','Wuj HK AGV (recovered 2025-06-26 03:31:37)']);
 const counted=data.apps.filter(app=>opportunityEligibility(app).eligible);
 // ¥3,110,000 over every scored application (tests/costs.test.mjs) less the three not still active: RBCW LOM Dashboard (5, ¥10,000),
 // VM/LOG-Szh2_DAVIS (1, ¥200,000) and 360° Supplier dashboard (5, ¥10,000). The no-score applications have no cost score.
 assert.deepEqual(costSummary(counted),{total:67,scored:67,missing:0,distribution:{1:4,2:9,3:13,4:13,5:28},annualTotal:2890000,currency:'CNY',openEndedCount:0,scenario20:578000});
 // The payback formula applies to every counted application: no blank, no score outside 1 / 3 / 5.
 assert(counted.every(app=>roiPayback(app).kind==='payback'));
 assert.deepEqual(tally(counted.map(app=>roiPayback(app).text)),{'> 2 years':11,'> 1 year':33,'< 1 year':23});
 const model=buildModel(data),summary=portfolioAtThreshold(portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights||DEFAULT_WEIGHTS)),data.similarityThreshold??50);
 assert.deepEqual([summary.totalApps,summary.eligibleApps],[75,67]);
 assert.deepEqual(summary.excludedApps.map(row=>row.app.Name).sort(),excluded);
 const dashboard=named('RBCW LOM Dashboard').ID,pairs=portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights||DEFAULT_WEIGHTS)).pairs.filter(pair=>[pair.target.app.id,pair.peer.app.id].includes(dashboard));
 assert.equal(pairs.length,74);assert(pairs.every(pair=>pair.status==='excluded'&&/not still active/.test(pair.reason)));
});

test('bundled data V9.17: the mapping of RBCW LOM Dashboard is carried over, because its process record did not change',()=>{
 const states=correctionStates(data);
 assert.equal(states.filter(s=>s.state==='Needs review').length,0);
 const carried=states.filter(s=>s.state==='Applied'&&s.appId===named('RBCW LOM Dashboard').ID);
 assert.deepEqual(carried.map(s=>[s.raw,s.targetId,s.reviewer]),[['BBM PM I2D Execute Standard Report using BI / Power BI / Dali (OE) L3V','M.I2D.020.110.030','Owner decision carried over · import 2026-10-21']]);
 assert.match(carried[0].reason,/unchanged in the owner workbook 20261021_logistic_inventory\.xlsx \(Logistic Apps_1021\)/);
 assert.equal(named('RBCW LOM Dashboard').Processes,v916.apps.find(a=>a.Name==='RBCW LOM Dashboard').Processes);
});

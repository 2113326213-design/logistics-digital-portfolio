import {RECORDS_V916} from './records-v916.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {buildModel} from '../public/model.mjs';
import {maintenanceGapReasons,maintenanceReport,l3MaintenanceMetrics} from '../public/overview.mjs';
// Data checks cover the Level 3 gaps of Overview; since 2026-10-20 the general To review covers every level, so these
// tests use the Level 3 metric directly.
const l3Gap=report=>l3MaintenanceMetrics(report).notPassing;
import {displayMaintenanceGapReason} from '../public/maintenance-labels.mjs';
import {dataChecksForApp,dataChecksSummary,renderDataChecks,nameDifferenceRows} from '../public/data-checks.mjs';
import {capabilityCatalogueNotice} from '../public/display.mjs';

const data=JSON.parse(fs.readFileSync(RECORDS_V916));
// Legacy catalogue (before 2026-10-16) with outdated and truncated names: keeps the meaning, missing-code and name-difference checks covered with real legacy names.
const old=JSON.parse(fs.readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const checked=source=>{const model=buildModel(source),reports={cap:maintenanceReport(model,{},'cap'),process:maintenanceReport(model,{},'process')},all=model.apps.map(app=>[app,dataChecksForApp(model,app,reports)]);return {model,reports,all,find:name=>all.find(([app])=>app.Name.startsWith(name))};};
const coversEveryGap=(model,reports)=>{
 for(const [dimension,label] of [['cap','Business Capability'],['process','Process']]){
  const report=reports[dimension];
  for(const app of l3Gap(report)){
   const reason=maintenanceGapReasons(report,report,app,[3])[0];
   const expected=`${label}: ${displayMaintenanceGapReason(reason)}`;
   assert(dataChecksForApp(model,app,reports).checks.some(row=>row.primary===expected),`${app.Name} must show ${expected}`);
  }
 }
};
// L3V is Level 3 (owner decision 2026-10-19). Of the 13 L3V records, these 7 have neither a Signavio L3 of the same name
// nor an applied mapping. Until V19 they were ordinary unmatched process records ('No confirmed standard match' checks).
// V19.1 union (owner 2026-10-23): like every process recorded with a level they are in LeanIX, so they match and are no
// data check; each is listed in its application's inLeanix. They still have no Signavio code (model.issues, similarity
// and mappings unchanged), see the block below the totals.
const unmatchedL3V=[
 ['AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V'],
 ['RBCD LOM Scrap Management Platform','BBM PM B2P Manage Fixed Assets Scrapping L3V'],
 ['RBCD LOM Scrap Management Platform','BBM PM I2P Disposal due to Scrapping L3V'],
 ['Szh5_ASRS_WCS_WMS','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Move Material Production to Production L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Return from Production L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Round quantity in material request and picking L3V']];
// Until V19, AUTO-RACK and RBCD LOM Scrap Management Platform otherwise passed Level 3, so their unmatched L3V records added two
// Process needs-review applications (18 + 2 = 20 since 2026-10-21: VMCN_CONNEX left the Process gap with the export, 19 + 2 = 21
// before), and Szh5_ASRS_WCS_WMS's Level 3 gap was its L3V row instead of a separate 'Level 3 missing' row (one check fewer).
// V19.1 union: all three pass Level 3 through these records, and Szh5_ASRS_WCS_WMS still has no 'Level 3 missing' row.
// The per-record results are asserted in the test at the end of this file.
const l3vGapApps=['AUTO-RACK','RBCD LOM Scrap Management Platform'],l3vMovedRowApp='Szh5_ASRS_WCS_WMS';
// V19.1 union (owner 2026-10-23): the 12 applications that left the Process Level 3 gap (20 → 8 with both catalogues) because
// their Level 3 records outside the Signavio list (the 7 unmatched L3V records and 12 L3 records) are in LeanIX and match.
const unionLevel3Apps=['AUTO-RACK','RBCD LOG Xone','RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW Auto Warehouse Management System','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS','VMCN_iSCMP: Intelligent Supply Chain management platform'];
const leftLevel3GapThroughLeanIX=(model,reports)=>{
 for(const name of unionLevel3Apps){
  const app=model.apps.find(a=>a.Name===name);
  assert(app.inLeanix.some(x=>x.level===3),`${name} has a Level 3 record in LeanIX only`);
  assert(!l3Gap(reports.process).includes(app),`${name} passes Level 3 (V19.1 union)`);
 }
};
const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
const l3vRows=all=>all.flatMap(([app,checks])=>checks.checks.filter(row=>/\sL3V$/.test(row.raw)).map(row=>[app.Name,row.raw,row.tags]));
// Until V19 l3vRows gave one 'No confirmed standard match' row per unmatched L3V record; since V19.1 it gives none, and the
// records are listed in inLeanix instead.
const l3vInLeanix=model=>unmatchedL3V.filter(([name,raw])=>model.apps.find(a=>a.Name===name).inLeanix.some(x=>x.raw===raw&&x.level===3));
// 2026-10-21 (V9.16): the LeanIX export of 2026-10-20 re-registered VMCN_CONNEX (HC.06.01.01 / HC.06.01.05 → B.06.2.3 / B.06.2.6,
// empty process list → 'BBM PM P2F Prepare demand forecasting L3') and VMCN_Digital Dynamic Supermarket (B.06.4.4 → B.06.4), so no
// current record has an HC.06 code, lacks a process or is outside the standard. Their registrations as recorded before the export
// stay here as a fixture, so the Missing process, HC.06 and 'Not in standard' checks keep a case (data.json itself is unchanged).
const preExport=source=>({...source,apps:source.apps.map(app=>app.Name==='VMCN_CONNEX'?{...app,'Business Capabilities':'HC.06.01.01 Demand Planning;HC.06.01.05 Detailed Production Scheduling',Processes:''}:app.Name==='VMCN_Digital Dynamic Supermarket'?{...app,'Business Capabilities':'B.06 Logistics Management;B.06.4.4 Physical Inventory Management;B.06.5 Material Flow Orchestration;B.06.5.2 Material Flow and Storage Management'}:app)});
const {model,reports,all,find}=checked({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});

assert.equal(model.apps.length,76);
// 2026-10-21 (V9.16 export): Capability 38 → 43 (joined: Control Tower, D-sample tracking system, Dolly call off program, Physical
// Logistics Management System with Level 2 only, VM-CN Auto labeling printing system and VMCN_iWPC_AKL_Szh5 with B.06.5.7, which the
// legacy catalogue lacks; left: VMCN_CONNEX), Process 21 → 20 (left: VMCN_CONNEX).
assert.equal(l3Gap(reports.cap).length,43);
// V19.1 union (owner 2026-10-23): Process 20 → 8, the 12 applications of unionLevel3Apps pass Level 3 through LeanIX.
assert.equal(l3Gap(reports.process).length,8,'V19.1 union: 12 applications whose Level 3 records outside the Signavio list are in LeanIX left the gap');
leftLevel3GapThroughLeanIX(model,reports);
assert(l3vGapApps.every(name=>!l3Gap(reports.process).some(app=>app.Name===name)),'V19.1 union: their unmatched L3V records match through LeanIX');
assert.equal(all.reduce((sum,[,checks])=>sum+checks.m,0),12);
// The legacy catalogue is not the business capability standard: its name differences stay provenance only
// (no 'Name differs from standard' checks) and missing codes keep the neutral 'Verify in LeanIX' wording.
assert.equal(model.standardCatalogue,false);
// 113 checks in all: 111 outside Szh5_ASRS_WCS_WMS plus its 2 (2026-10-21: 109 - 3 VMCN_CONNEX - 1 Material Requistion Digitalization
// B.06.4 meaning + 4 'Level 3 missing' + 2 B.06.5.7 'Verify in LeanIX' + 1 B.06.4 meaning each for BMLP_Nexeed_IAS@WxP and
// VMCN_Digital Dynamic Supermarket; RBCW Auto Warehouse Management System swapped 'Level 3 missing' for an unmatched L3 record).
// V18.1 (owner decision 2026-10-23): Data checks list every Issues to review item, not only Level 3: +16 checks →
// 127 + 2 = 129. 14 missing Level 0–2 without a matching deeper level (BMLP_Nexeed_IAS@WxP L2; CDR_EM L1, L2;
// RBAC_ME_i-Warehouse L2; RBCD LOM Scrap Management Platform L2; RBCD WI management system L0–L2; RBCW E-Queue system L0–L2;
// VMCN_Packaging Data System L2; 360° Supplier dashboard L1, L2) and 2 'Process name differs between sources'
// (RBAC_ME_Szh5 Intralogistics control system, VM-CN_WACOS_Szh5). Five capability L2 records keep their tag and gain
// the 'Level 2 match needs review' line of Issues to review (same count).
// V19.1 union (owner 2026-10-23): −28 process checks → 101: the 19 'Level 3 match needs review' rows of records with a level
// outside the Signavio list (the 7 unmatched L3V records and 12 L3 records), the 7 missing Level 0–2 rows those records now
// cover (RBCD LOM Scrap Management Platform L2; RBCD WI management system L0–L2; RBCW E-Queue system L0–L2) and the 2
// 'Process name differs between sources' rows (no longer produced). 100 outside Szh5_ASRS_WCS_WMS plus its 1 (its L3V row is gone).
assert.equal(all.filter(([app])=>app.Name!==l3vMovedRowApp).reduce((sum,[,checks])=>sum+checks.n,0),100);
assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),101);
assert.deepEqual(l3vRows(all),[],'V19.1 union: no L3V record is a check (until V19 the 7 unmatched ones were)');
assert.deepEqual(l3vInLeanix(model),unmatchedL3V,'the 7 unmatched L3V records are in LeanIX at Level 3');
assert(!all.some(([,checks])=>checks.checks.some(row=>/Process name differs between sources/.test(row.primary))),'V19.1: no name-difference process check');
assert(!all.some(([,checks])=>checks.checks.some(row=>row.tags.some(tag=>tag.label.startsWith('L3V')))),'no L3V-specific tag remains');
{
 // An L3V record whose name is unique in the standard is matched by name like L3, even without its applied mapping;
 // the six applied L3V mappings point at exactly these codes.
 const unmapped=buildModel({...data,corrections:[]});
 const byName=[
  ['AUTO-RACK','BBM PM I2D Putaway of Automated Goods Receipt (AGR) L3V','M.I2D.010.050.010'],
  ['RBCD LOP Digital Dashboard','BBM PM M2S Report process data production L3V','M.M2S.030.030.020'],
  ['RBCW LOM Dashboard','BBM PM I2D Execute Standard Report using BI / Power BI / Dali (OE) L3V','M.I2D.020.110.030'],
  ['RBCW LOM PSTU Management System','BBM PM I2D Request Packaging Kit L3V','M.I2D.020.010.050'],
  ['RBHP_LOG AGV Performance Tracking System','BBM PM I2D Monitor and Control Warehouse Processes L3V','M.I2D.020.100.030'],
  ['RBHP_LOG AGV Performance Tracking System','BBM PM I2D Optimize Warehouse L3V','M.I2D.020.100.020']];
 for(const [name,raw,code] of byName){
  const app=unmapped.apps.find(a=>a.Name===name);
  assert(app.rawProcess.includes(raw),`${name} records ${raw}`);
  assert(app.process.includes(code),`${raw} matches ${code} by name`);
  assert.equal(unmapped.procs.get(code).level,3);
  assert(!unmapped.issues.some(i=>i.appId===app.id&&i.value===raw));
 }
 assert.deepEqual(sorted(model.correctionLog.filter(c=>c.state==='Applied'&&/\sL3V$/.test(c.raw)).map(c=>[model.apps.find(a=>a.id===c.appId).Name,c.raw,c.targetId])),sorted(byName));
 assert.deepEqual(sorted(unmapped.issues.filter(i=>/\sL3V$/.test(i.value)).map(i=>[i.app,i.value,i.type])),sorted(unmatchedL3V.map(([name,raw])=>[name,raw,'流程未匹配层级表'])));
}
// 2026-10-21 (V9.16 export): 70 rows / 55 apps → 89 / 67: the parent codes the export added (B.06.2, B.06.5, B.06.8) and VMCN_CONNEX's
// B.06.2.3 / B.06.2.6 have differing legacy names; 18 applications gained 19 rows net, 12 of them had no name difference before.
assert.equal(all.reduce((sum,[,checks])=>sum+checks.k,0),89);
assert(!all.some(([,checks])=>checks.standard||checks.checks.some(row=>row.tags.some(tag=>['Name differs from standard','Not in standard'].includes(tag.label)))));
assert.equal(all.filter(([,checks])=>checks.k>0).length,67);
coversEveryGap(model,reports);

{
 const [app,checks]=find('CDR_EM');
 assert(checks.checks.some(row=>row.primary==='Business Capability: Level 3 match needs review'&&row.raw.includes('B.01.01.2')&&row.tags.some(tag=>tag.label==='Outside B.06 review scope')));
 assert(checks.checks.some(row=>row.primary==='Process: Level 3 missing'));
 assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
 assert.equal(checks.k,1);
}
{
 // 2026-10-21 (V9.16 export): VMCN_CONNEX now registers B.06.2.3 / B.06.2.6 and 'BBM PM P2F Prepare demand forecasting L3', so it has
 // no check and is in neither gap; the HC.06 and Missing process cases below use its pre-export registration (preExport).
 const [current,currentChecks]=find('VMCN_CONNEX');
 assert.deepEqual([current.rawCap,current.rawProcess,currentChecks.n],[['B.06.2.3 Demand Planning','B.06.2.6 Procurement Planning'],['BBM PM P2F Prepare demand forecasting L3'],0]);
 assert(!l3Gap(reports.cap).includes(current)&&!l3Gap(reports.process).includes(current),'VMCN_CONNEX left both gaps with the export');
 const [app,checks]=checked(preExport({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource})).find('VMCN_CONNEX');
 // An empty Processes field is one issue in Issues to review ('Processes'), so one line here: 'Missing process' (V18.1;
 // before, the same line also carried 'Process: Level 3 missing').
 assert.equal(checks.checks.filter(row=>row.primary==='Process: Level 3 missing').length,0);
 assert.deepEqual(checks.checks.filter(row=>row.dimension==='process').map(row=>row.tags.map(tag=>tag.label)),[['Missing process']]);
 // HC records belong to another company (owner decision 2026-10-22; on 2026-10-19 they still got an Outside B.06 review
 // scope row): no data-check row at all, and the application lists them as not used.
 assert.deepEqual(checks.checks.filter(row=>row.raw.startsWith('HC.')),[]);
 assert.deepEqual(app.otherCompany,['HC.06.01.01 Demand Planning','HC.06.01.05 Detailed Production Scheduling']);
 assert(app['Business Capabilities'].includes('HC.06.01.01'),'the source field keeps them');
}
assert(!all.some(([,checks])=>checks.checks.some(row=>row.tags.some(tag=>tag.label==='Possibly B.06'))),'no record is tagged Possibly B.06');
{
 // Its only Level 3 record is an unmatched L3V record. Until V19 it was a normal unmatched process record that needed review
 // ('Level 3 match needs review'). V19.1 union (owner 2026-10-23): it is in LeanIX, so it matches: no process check, no
 // separate 'Level 3 missing' row, and its Level 3 passes.
 const [app,checks]=find('Szh5_ASRS_WCS_WMS');
 assert.deepEqual(checks.checks.filter(row=>row.dimension==='process'),[]);
 assert.deepEqual(app.inLeanix.map(x=>[x.raw,x.level]),[['BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V',3]]);
 assert(!l3Gap(reports.process).includes(app));
 assert(reports.process.levels.find(level=>level.level===3).valid.includes(app),'its Level 3 matches through LeanIX');
}
{
 const [app,checks]=find('VM/LOG-Szh2_DAVIS');
 assert.equal(checks.k,2);
 // V19.1 union (owner 2026-10-23): its three L3 records are not one Signavio process (Load Truck and Stage Packed Goods not
 // found, Stage Packaging Kits matching 2 codes), but they are in LeanIX, so they match and are no checks. Until V19 each was a
 // 'Process: Level 3 match needs review' row tagged 'No confirmed standard match' or 'Matches 2 standard codes'.
 assert.deepEqual(checks.checks.filter(row=>row.dimension==='process'),[]);
 assert.deepEqual(app.inLeanix.map(x=>[x.raw,x.level,x.type,x.candidates.length]),[['BBM PM I2D Load Truck L3',3,'流程未匹配层级表',0],['BBM PM I2D Stage Packaging Kits L3',3,'流程名称对应多个编号',2],['BBM PM I2D Stage Packed Goods L3',3,'流程未匹配层级表',0]]);
 assert(checks.checks.some(row=>row.raw.startsWith('B.06.4 ')&&row.tags.some(tag=>tag.label==='Meaning needs confirmation')));
 assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
}
{
 const [app,checks]=find('RBCC Supplier Logistics Management Platform');
 assert(checks.checks.filter(row=>row.raw.startsWith('B.06.9')&&row.tags.some(tag=>tag.label==='Verify in LeanIX'&&tag.detail==='Not found in the current catalogue. Verify the code and catalogue coverage; no error is confirmed.')).length===2);
 assert.equal(checks.m,1);
 assert.equal(checks.mappings[0].reviewer,'Business owner');
 assert.equal(checks.mappings[0].optionalUpdate,true,'a DM mapping keeps the optional LeanIX note');
}
{
 // L3V is Level 3, so an L3V mapping is not a source error: no optional LeanIX note.
 const [app,checks]=find('AUTO-RACK');
 assert.deepEqual(checks.mappings.map(row=>[row.raw,row.optionalUpdate]),[['BBM PM I2D Putaway of Automated Goods Receipt (AGR) L3V',false]]);
 assert(!renderDataChecks(checks,value=>String(value)).includes('Optional: update the source entry in LeanIX.'));
}
{
 const [app,checks]=find('RBCW LOM Dashboard');
 assert.equal(checks.m,1);
 assert.equal(checks.k,3);
 assert.equal(checks.n,0,'with the legacy catalogue name differences are provenance, not checks');
 const html=renderDataChecks(checks,value=>String(value));
 assert(html.includes('Original and standard names for the same code. Highlighted words differ; confirm the business meaning before changing either entry.')&&!html.includes('Each is listed above as a check'),'legacy guide text');
 assert(!checks.checks.some(row=>row.primary==='Process: Level 3 missing'));
 assert.equal(checks.mappings[0].reviewer,'Taxonomy audit');
 assert.equal(dataChecksSummary(checks),'0 to check · 1 mapped');
}

// Current portfolio with the business capability standard (standard+name.xlsx, 2026-10-16) without its HC entries,
// which belong to another department (owner decision 2026-10-19).
// Rows (2026-10-21, V9.16 export): 113 - 23 meaning holds - 9 missing-code rows (7 B.06.9 / B.06.9.1, 2 B.06.5.7) = 81 source checks,
// plus the 2 'Name differs from standard' rows of 360° Supplier dashboard = 83 (owner decision 2026-10-19); 81 outside Szh5_ASRS_WCS_WMS
// plus its 2. The total is unchanged by the export: its 4 'Level 3 missing' rows replace VMCN_CONNEX's 3 rows and VMCN_Digital Dynamic
// Supermarket's B.06.4.4 row (before: 109 - 22 - 7 + 1 B.06.4.4 row = 81).
// (since 2026-10-22 HC records belong to another company and get no row at all; before, they kept an Outside B.06 row).
// Needs review: legacy 43 - RBCC and RBHP_LOG SupplierManager (B.06.9.x catalogued) - VM-CN Auto labeling printing system and
// VMCN_iWPC_AKL_Szh5 (B.06.5.7 catalogued) = 39 (2026-10-21: 37 + Control Tower, D-sample tracking system, Dolly call off program,
// Physical Logistics Management System - VMCN_CONNEX - VMCN_Digital Dynamic Supermarket).
{
 const {model,reports,all,find}=checked(data),rows=all.flatMap(([app,checks])=>checks.checks.map(row=>[app,row]));
 assert.equal(model.apps.length,76);
 assert.deepEqual([...model.caps.values()].filter(node=>node.reference&&node.id.startsWith('HC.')).map(node=>node.id),[],'no HC entry in the capability catalogue');
 assert.equal(l3Gap(reports.cap).length,39);
 // V19.1 union (owner 2026-10-23): Process 20 → 8, the same 12 applications as with the legacy catalogue.
 assert.equal(l3Gap(reports.process).length,8,'V19.1 union: 12 applications whose Level 3 records outside the Signavio list are in LeanIX left the gap');
 leftLevel3GapThroughLeanIX(model,reports);
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.m,0),12);
 assert.equal(model.standardCatalogue,true,'the bundled catalogue is the business capability standard');
 // V18.1: the same 14 missing Level 0–2 and 2 'Process name differs between sources' lines as with the legacy catalogue
 // above (+16): 97 + 2 = 99. ShzP_ALICE's B.05.2 row gains the 'Level 2 match needs review' line of Issues to review.
 // V19.1 union: the same 28 process lines as with the legacy catalogue are gone: 99 − 28 = 71, 70 outside Szh5_ASRS_WCS_WMS plus its 1.
 assert.equal(all.filter(([app])=>app.Name!==l3vMovedRowApp).reduce((sum,[,checks])=>sum+checks.n,0),70);
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),71);
 assert.deepEqual(l3vRows(all),[],'the capability catalogue does not change the L3V process result (V19.1: no L3V check)');
 assert.deepEqual(l3vInLeanix(model),unmatchedL3V);
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.k,0),2);
 // The coverage note in the detail panel agrees with the 'Not in standard' check.
 assert.equal(capabilityCatalogueNotice('B.06.4.4 Physical Inventory Management',model.standardCatalogue),'Not in the business capability standard — correct the record in LeanIX.');
 assert.equal(capabilityCatalogueNotice('B.06.4.4 Physical Inventory Management'),'Not found in the current catalogue — verify the code and catalogue coverage. No error is confirmed.');
 {
  const [dashboard,checks]=find('360'+String.fromCharCode(176)+' Supplier dashboard');
  // V18.1: plus its Process 'Level 1 missing' and 'Level 2 missing', listed in Issues to review too.
  assert.equal(dataChecksSummary(checks),'5 to check');
  assert(renderDataChecks(checks,value=>String(value)).includes('Each is listed above as a check: correct the record in LeanIX.'));
  // A capability mapping applied to a record resolves it: no name-difference check remains for that record.
  const mapped={...model,correctionLog:[...model.correctionLog,{state:'Applied',appId:dashboard.id,dimension:'cap',raw:'B.06.8.2 Supply Chain (Logistics) Visualization and Tracking Mgmt.',targetId:'B.06.8.2',reviewer:'Test'}]};
  assert.deepEqual(nameDifferenceRows(mapped,dashboard).map(row=>row.code),['B.06.8.1']);
  assert.deepEqual(dataChecksForApp(mapped,dashboard).checks.filter(row=>row.tags.some(tag=>tag.label==='Name differs from standard')).map(row=>row.raw),['B.06.8.1 Supply Chain (Logistics) Standard Reporting Mgmt.']);
 }
 assert.deepEqual(rows.filter(([,row])=>row.tags.some(tag=>tag.label==='Name differs from standard')).map(([app,row])=>[app.Name,row.raw,row.tags.find(tag=>tag.label==='Name differs from standard').detail]),[
  ['360'+String.fromCharCode(176)+' Supplier dashboard','B.06.8.1 Supply Chain (Logistics) Standard Reporting Mgmt.','Standard name: "Supply Chain (Logistics) Standard Reporting". Correct the record in LeanIX; it is not changed automatically.'],
  ['360'+String.fromCharCode(176)+' Supplier dashboard','B.06.8.2 Supply Chain (Logistics) Visualization and Tracking Mgmt.','Standard name: "Supply Chain (Logistics) Monitoring and Dashboarding". Correct the record in LeanIX; it is not changed automatically.']]);
 assert.deepEqual(all.filter(([,checks])=>checks.k>0).map(([app,checks])=>[app.Name,checks.nameDifferences.map(row=>row.code)]),[['360'+String.fromCharCode(176)+' Supplier dashboard',['B.06.8.1','B.06.8.2']]]);
 assert(!rows.some(([,row])=>row.tags.some(tag=>tag.label==='Meaning needs confirmation')),'the standard names match every held source meaning');
 // 2026-10-21 (V9.16 export): VMCN_Digital Dynamic Supermarket registers B.06.4 instead of B.06.4.4, so no current record is outside
 // the standard; the B.06.4.4 case is asserted below with its pre-export registration (preExport).
 assert.deepEqual(rows.filter(([,row])=>row.tags.some(tag=>tag.label==='Not in standard')).map(([app,row])=>[app.Name,row.raw,row.primary]),[]);
 {
  const [app,checks]=find('VMCN_Digital Dynamic Supermarket');
  assert.deepEqual([app.rawCap,checks.n,checks.m,l3Gap(reports.cap).includes(app)],[['B.06.4 Inventory Management','B.06.5 Material Flow Orchestration','B.06.5.2 Material Flow and Storage Management'],0,1,false]);
  const pre=checked(preExport(data));
  assert.deepEqual(pre.all.flatMap(([app,checks])=>checks.checks.filter(row=>row.tags.some(tag=>tag.label==='Not in standard')).map(row=>[app.Name,row.raw,row.primary])),[['VMCN_Digital Dynamic Supermarket','B.06.4.4 Physical Inventory Management','Business Capability: Level 3 match needs review']]);
  assert(l3Gap(pre.reports.cap).includes(pre.find('VMCN_Digital Dynamic Supermarket')[0]),'a record outside the standard is a Level 3 gap');
 }
 coversEveryGap(model,reports);
 {
  const [app,checks]=find('CDR_EM');
  assert(checks.checks.some(row=>row.primary==='Business Capability: Level 3 match needs review'&&row.raw.includes('B.01.01.2')&&row.tags.some(tag=>tag.label==='Outside B.06 review scope')));
  assert(checks.checks.some(row=>row.primary==='Process: Level 3 missing'));
  assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
  assert.equal(checks.k,0);
 }
 {
  // HC entries are not in the catalogue, and since 2026-10-22 VMCN_CONNEX's own HC.06.01.01 and HC.06.01.05 records (another
  // company) are left out of the analysis: the source field keeps them, they get no row, and without them the application has
  // no capability of its own left, so it is an L3 gap.
  // 2026-10-21 (V9.16 export): the current record is B.06.2.3 / B.06.2.6 with a process (no check, no gap), so the HC case
  // uses VMCN_CONNEX's pre-export registration (preExport).
  const [current,currentChecks]=find('VMCN_CONNEX');
  assert.deepEqual([current.rawCap,currentChecks.n,currentChecks.k,l3Gap(reports.cap).includes(current),l3Gap(reports.process).includes(current)],[['B.06.2.3 Demand Planning','B.06.2.6 Procurement Planning'],0,0,false,false]);
  const pre=checked(preExport(data)),[app,checks]=pre.find('VMCN_CONNEX');
  assert(app['Business Capabilities'].includes('HC.06.01.01 Demand Planning')&&app['Business Capabilities'].includes('HC.06.01.05 Detailed Production Scheduling'),'source HC records are untouched');
  assert.deepEqual([app.rawCap,app.otherCompany],[[],['HC.06.01.01 Demand Planning','HC.06.01.05 Detailed Production Scheduling']]);
  // Its empty Processes field is one line, as in Issues to review (V18.1; before, it also carried 'Process: Level 3 missing').
  assert.deepEqual(checks.checks.filter(row=>row.dimension==='process').map(row=>[row.primary,row.tags.map(tag=>tag.label)]),[['',['Missing process']]]);
  assert.deepEqual(checks.checks.filter(row=>row.raw.startsWith('HC.')),[],'no row for another company\'s records');
  assert(l3Gap(pre.reports.cap).includes(app));
  assert.equal(checks.k,0,'an HC record has no standard name to compare');
 }
 {
  // Wuj HK AGV's own HC.02.04.05 record (never catalogued; another company since 2026-10-22) stays in its source field
  // and gets no row; its B.06.5 (Level 2) leaves it an L3 gap, shown as "Level 3 missing".
  const [app,checks]=find('Wuj HK AGV');
  assert(app['Business Capabilities'].includes('HC.02.04.05 Transportation Management'),'source HC record is untouched');
  assert.deepEqual(app.otherCompany,['HC.02.04.05 Transportation Management']);
  assert.deepEqual(checks.checks.filter(row=>row.raw.startsWith('HC.')),[]);
  assert(checks.checks.some(row=>row.dimension==='cap'&&row.raw===''&&row.primary==='Business Capability: Level 3 missing'));
  assert(l3Gap(reports.cap).includes(app));
 }
 assert(!rows.some(([,row])=>row.tags.some(tag=>tag.label==='Possibly B.06')),'no record is tagged Possibly B.06');
 {
  const [app,checks]=find('VM/LOG-Szh2_DAVIS');
  assert.equal(checks.k,0);
  // V19.1 union (owner 2026-10-23): its three L3 records are in LeanIX and match (until V19 each was a 'Process: Level 3 match
  // needs review' check), as with the legacy catalogue.
  assert.deepEqual(checks.checks.filter(row=>row.dimension==='process'),[]);
  assert.deepEqual(app.inLeanix.map(x=>x.raw),['BBM PM I2D Load Truck L3','BBM PM I2D Stage Packaging Kits L3','BBM PM I2D Stage Packed Goods L3']);
  assert(!checks.checks.some(row=>row.raw.startsWith('B.06.4 ')));
  assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
 }
 {
  const [app,checks]=find('RBCC Supplier Logistics Management Platform');
  assert(!checks.checks.some(row=>row.raw.startsWith('B.06.9')));
  assert(!l3Gap(reports.cap).includes(app));
  assert.equal(checks.m,1);
  assert.equal(checks.mappings[0].reviewer,'Business owner');
 }
 {
  const [app,checks]=find('RBCW LOM Dashboard');
  assert.equal(checks.m,1);
  assert.equal(checks.k,0);
  assert.equal(checks.n,0);
  assert.equal(dataChecksSummary(checks),'0 to check · 1 mapped');
 }
}
assert.equal(dataChecksSummary({n:0,m:0,k:0}),'');
assert.equal(dataChecksSummary({n:0,m:0,k:2}),'0 to check');
const escaped=renderDataChecks({checks:[{dimension:'cap',raw:'A<&',primary:'Business Capability: Level 3 missing',tags:[{label:'Verify in LeanIX',detail:'Check <record>'}]}],mappings:[],nameDifferences:[],n:1,m:0,k:0},value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
assert.match(escaped,/A&lt;&amp;/);
assert.match(escaped,/Check &lt;record&gt;/);
console.log('PASS: v3 Data checks use the corrected model, cover every Overview L3 gap (and since V18.1 every Issues to review item), preserve 12 mappings, match the legacy 89-row/67-app name-difference baseline, and with the standard show the 2 name-difference checks and (pre-export registration) B.06.4.4 marked Not in standard; HC records are only tagged Outside B.06 review scope; L3V records are matched by name like L3, and since V19.1 every process recorded with a level (the 7 unmatched L3V records included) is in LeanIX, matches and is no check.');

// L3V is Level 3 (owner decision 2026-10-19). Until V19 an unmatched L3V record was a Level 3 gap with both catalogues
// ('Process: Level 3 match needs review').
// 2026-10-21 (V9.16 export): legacy total 109 → 113 (see above; the standard total stays 83), Process gap 21 → 20 (VMCN_CONNEX left).
// V18.1: Data checks list every Issues to review item: legacy 113 → 129, standard 83 → 99 (see above).
// V19.1 union (owner 2026-10-23): like every process recorded with a level, an unmatched L3V record is in LeanIX, so it matches
// with both catalogues and is no data check: legacy 129 → 101, standard 99 → 71, Process gap 20 → 8 (see above).
test('Unmatched L3V records match through LeanIX and are not Data checks (V19.1 union)',()=>{
 for(const [source,total] of [[{...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource},101],[data,71]]){
  const {model,reports,all,find}=checked(source);
  assert.equal(l3Gap(reports.process).length,8);
  for(const name of new Set(unmatchedL3V.map(([name])=>name)))assert(!l3Gap(reports.process).some(app=>app.Name===name),`${name} passes Level 3`);
  for(const [name,raw] of unmatchedL3V){
   const [app,checks]=all.find(([app])=>app.Name===name);
   assert(!checks.checks.some(row=>row.raw===raw),`${raw} is no data check`);
   assert.deepEqual(reports.process.records.get(app.id).filter(r=>r.raw===raw).map(r=>[r.level,r.valid,r.accepted,r.reason]),[[3,true,null,'In LeanIX, not in the Signavio list']],raw);
   assert(model.issues.some(i=>i.appId===app.id&&i.value===raw&&i.type==='流程未匹配层级表'),`${raw} still has no Signavio code`);
  }
  const [,szh5]=find(l3vMovedRowApp);
  assert.equal(szh5.checks.filter(row=>row.primary==='Process: Level 3 missing').length,0,'Szh5_ASRS_WCS_WMS registers Level 3 through its L3V record');
  assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),total);
 }
});

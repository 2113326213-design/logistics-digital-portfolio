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

const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
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
// L3V is Level 3 (owner decision 2026-10-19). Of the 13 L3V records, these 7 have neither a standard L3 of the same name
// nor an applied mapping, so they are ordinary unmatched process records ('No confirmed standard match').
const unmatchedL3V=[
 ['AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V'],
 ['RBCD LOM Scrap Management Platform','BBM PM B2P Manage Fixed Assets Scrapping L3V'],
 ['RBCD LOM Scrap Management Platform','BBM PM I2P Disposal due to Scrapping L3V'],
 ['Szh5_ASRS_WCS_WMS','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Move Material Production to Production L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Return from Production L3V'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Round quantity in material request and picking L3V']];
// AUTO-RACK and RBCD LOM Scrap Management Platform otherwise pass Level 3, so their unmatched L3V records add two Process
// needs-review applications (19 + 2 = 21), and Szh5_ASRS_WCS_WMS's Level 3 gap becomes its L3V row instead of a separate
// 'Level 3 missing' row (one check fewer). The per-record Level 3 labels are asserted in the test at the end of this file.
const l3vGapApps=['AUTO-RACK','RBCD LOM Scrap Management Platform'],l3vMovedRowApp='Szh5_ASRS_WCS_WMS';
const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
const l3vRows=all=>all.flatMap(([app,checks])=>checks.checks.filter(row=>/\sL3V$/.test(row.raw)).map(row=>[app.Name,row.raw,row.tags]));
const unmatchedL3VRows=unmatchedL3V.map(([name,raw])=>[name,raw,[{label:'No confirmed standard match',detail:`Source: ${raw}. Check naming, level and catalogue coverage before changing the record.`}]]);
const {model,reports,all,find}=checked({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});

assert.equal(model.apps.length,76);
assert.equal(l3Gap(reports.cap).length,38);
assert.equal(l3Gap(reports.process).length,21);
assert(l3vGapApps.every(name=>l3Gap(reports.process).some(app=>app.Name===name)));
assert.equal(all.reduce((sum,[,checks])=>sum+checks.m,0),12);
// The legacy catalogue is not the business capability standard: its name differences stay provenance only
// (no 'Name differs from standard' checks) and missing codes keep the neutral 'Verify in LeanIX' wording.
assert.equal(model.standardCatalogue,false);
// 109 checks in all: 107 outside Szh5_ASRS_WCS_WMS plus its 2.
assert.equal(all.filter(([app])=>app.Name!==l3vMovedRowApp).reduce((sum,[,checks])=>sum+checks.n,0),107);
assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),109);
assert.deepEqual(sorted(l3vRows(all)),sorted(unmatchedL3VRows),'only the 7 unmatched L3V records are checks, each tagged like any unmatched process record');
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
assert.equal(all.reduce((sum,[,checks])=>sum+checks.k,0),70);
assert(!all.some(([,checks])=>checks.standard||checks.checks.some(row=>row.tags.some(tag=>['Name differs from standard','Not in standard'].includes(tag.label)))));
assert.equal(all.filter(([,checks])=>checks.k>0).length,55);
coversEveryGap(model,reports);

{
 const [app,checks]=find('CDR_EM');
 assert(checks.checks.some(row=>row.primary==='Business Capability: Level 3 match needs review'&&row.raw.includes('B.01.01.2')&&row.tags.some(tag=>tag.label==='Outside B.06 review scope')));
 assert(checks.checks.some(row=>row.primary==='Process: Level 3 missing'));
 assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
 assert.equal(checks.k,1);
}
{
 const [app,checks]=find('VMCN_CONNEX');
 assert.equal(checks.checks.filter(row=>row.primary==='Process: Level 3 missing').length,1);
 assert(checks.checks.some(row=>row.dimension==='process'&&row.tags.some(tag=>tag.label==='Missing process')));
 const hc=checks.checks.filter(row=>row.raw.startsWith('HC.06.'));
 assert.equal(hc.length,2);
 assert(hc.every(row=>row.primary==='Business Capability: Level 3 match needs review'));
 // HC belongs to another department (owner decision 2026-10-19): only the Outside B.06 review scope tag, never Possibly B.06.
 assert.deepEqual(hc.map(row=>row.tags.map(tag=>tag.label)),[['Outside B.06 review scope'],['Outside B.06 review scope']]);
 assert(!hc.some(row=>row.tags.some(tag=>tag.label==='Possibly B.06')));
}
assert(!all.some(([,checks])=>checks.checks.some(row=>row.tags.some(tag=>tag.label==='Possibly B.06'))),'no record is tagged Possibly B.06');
{
 // Its only Level 3 record is an unmatched L3V record: a normal unmatched process record that needs review
 // with the 'Level 3 match needs review' label, and no separate 'Level 3 missing' row.
 const [app,checks]=find('Szh5_ASRS_WCS_WMS');
 assert.deepEqual(checks.checks.filter(row=>row.dimension==='process').map(row=>[row.raw,row.primary,row.tags.map(tag=>tag.label)]),[['BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V','Process: Level 3 match needs review',['No confirmed standard match']]]);
 assert(l3Gap(reports.process).includes(app));
}
{
 const [app,checks]=find('VM/LOG-Szh2_DAVIS');
 assert.equal(checks.k,2);
 assert(checks.checks.some(row=>row.raw.includes('Load Truck')&&row.tags.some(tag=>tag.label==='No confirmed standard match')));
 assert(checks.checks.some(row=>row.raw.includes('Stage Packed Goods')&&row.tags.some(tag=>tag.label==='No confirmed standard match')));
 assert(checks.checks.some(row=>row.raw.includes('Stage Packaging Kits')&&row.tags.some(tag=>tag.label==='Matches 2 standard codes')));
 for(const phrase of ['Load Truck','Stage Packaging Kits','Stage Packed Goods'])assert(checks.checks.some(row=>row.raw.includes(phrase)&&row.primary==='Process: Level 3 match needs review'),`${phrase} needs its L3 primary label`);
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
// Rows: 109 - 22 meaning holds - 7 B.06.9 / B.06.9.1 missing-code rows + 1 B.06.4.4 row = 81 source checks,
// plus the 2 'Name differs from standard' rows of 360° Supplier dashboard = 83 (owner decision 2026-10-19);
// 81 outside Szh5_ASRS_WCS_WMS plus its 2.
// (the HC records keep their Outside B.06 review scope row whether or not HC is catalogued).
// Needs review: legacy 38 - RBCC and RBHP_LOG SupplierManager (B.06.9.x now catalogued) + VMCN_Digital Dynamic Supermarket (B.06.4.4) = 37.
{
 const {model,reports,all,find}=checked(data),rows=all.flatMap(([app,checks])=>checks.checks.map(row=>[app,row]));
 assert.equal(model.apps.length,76);
 assert.deepEqual([...model.caps.values()].filter(node=>node.reference&&node.id.startsWith('HC.')).map(node=>node.id),[],'no HC entry in the capability catalogue');
 assert.equal(l3Gap(reports.cap).length,37);
 assert.equal(l3Gap(reports.process).length,21);
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.m,0),12);
 assert.equal(model.standardCatalogue,true,'the bundled catalogue is the business capability standard');
 assert.equal(all.filter(([app])=>app.Name!==l3vMovedRowApp).reduce((sum,[,checks])=>sum+checks.n,0),81);
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),83);
 assert.deepEqual(sorted(l3vRows(all)),sorted(unmatchedL3VRows),'the capability catalogue does not change the L3V process checks');
 assert.equal(all.reduce((sum,[,checks])=>sum+checks.k,0),2);
 // The coverage note in the detail panel agrees with the 'Not in standard' check.
 assert.equal(capabilityCatalogueNotice('B.06.4.4 Physical Inventory Management',model.standardCatalogue),'Not in the business capability standard — correct the record in LeanIX.');
 assert.equal(capabilityCatalogueNotice('B.06.4.4 Physical Inventory Management'),'Not found in the current catalogue — verify the code and catalogue coverage. No error is confirmed.');
 assert(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').includes('capabilityCatalogueNotice(raw||code,model.standardCatalogue)'),'the detail panel passes the catalogue kind');
 {
  const [dashboard,checks]=find('360'+String.fromCharCode(176)+' Supplier dashboard');
  assert.equal(dataChecksSummary(checks),'3 to check');
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
 assert.deepEqual(rows.filter(([,row])=>row.tags.some(tag=>tag.label==='Not in standard')).map(([app,row])=>[app.Name,row.raw,row.primary]),[['VMCN_Digital Dynamic Supermarket','B.06.4.4 Physical Inventory Management','Business Capability: Level 3 match needs review']]);
 coversEveryGap(model,reports);
 {
  const [app,checks]=find('CDR_EM');
  assert(checks.checks.some(row=>row.primary==='Business Capability: Level 3 match needs review'&&row.raw.includes('B.01.01.2')&&row.tags.some(tag=>tag.label==='Outside B.06 review scope')));
  assert(checks.checks.some(row=>row.primary==='Process: Level 3 missing'));
  assert(checks.checks.some(row=>row.tags.some(tag=>tag.label==='Cost score 1')));
  assert.equal(checks.k,0);
 }
 {
  // HC entries are not in the catalogue: VMCN_CONNEX's own HC.06.01.01 and HC.06.01.05 records are kept as recorded,
  // stay outside B.06 review scope (no Possibly B.06 tag) and are an L3 gap again, as with the legacy catalogue.
  const [app,checks]=find('VMCN_CONNEX');
  assert(app.rawCap.includes('HC.06.01.01 Demand Planning')&&app.rawCap.includes('HC.06.01.05 Detailed Production Scheduling'),'source HC records are untouched');
  assert.equal(checks.checks.filter(row=>row.primary==='Process: Level 3 missing').length,1);
  const hc=checks.checks.filter(row=>row.raw.startsWith('HC.06.'));
  assert.deepEqual(hc.map(row=>row.raw),['HC.06.01.01 Demand Planning','HC.06.01.05 Detailed Production Scheduling']);
  assert(hc.every(row=>row.primary==='Business Capability: Level 3 match needs review'));
  assert.deepEqual(hc.map(row=>row.tags.map(tag=>tag.label)),[['Outside B.06 review scope'],['Outside B.06 review scope']]);
  assert(l3Gap(reports.cap).includes(app));
  assert.equal(checks.k,0,'an uncatalogued HC record has no standard name to compare');
 }
 {
  // Wuj HK AGV's own HC.02.04.05 record (never catalogued) is unchanged: outside B.06 review scope and an L3 gap.
  const [app,checks]=find('Wuj HK AGV');
  assert(app.rawCap.includes('HC.02.04.05 Transportation Management'),'source HC record is untouched');
  assert.deepEqual(checks.checks.filter(row=>row.raw.startsWith('HC.')).map(row=>[row.raw,row.primary,row.tags.map(tag=>tag.label)]),[['HC.02.04.05 Transportation Management','Business Capability: Level 3 match needs review',['Outside B.06 review scope']]]);
  assert(l3Gap(reports.cap).includes(app));
 }
 assert(!rows.some(([,row])=>row.tags.some(tag=>tag.label==='Possibly B.06')),'no record is tagged Possibly B.06');
 {
  const [app,checks]=find('VM/LOG-Szh2_DAVIS');
  assert.equal(checks.k,0);
  for(const phrase of ['Load Truck','Stage Packaging Kits','Stage Packed Goods'])assert(checks.checks.some(row=>row.raw.includes(phrase)&&row.primary==='Process: Level 3 match needs review'),`${phrase} needs its L3 primary label`);
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
console.log('PASS: v3 Data checks use the corrected model, cover every Overview L3 gap, preserve 12 mappings, match the legacy 70-row/55-app name-difference baseline, and with the standard show the 2 name-difference checks and B.06.4.4 marked Not in standard; HC records are only tagged Outside B.06 review scope; L3V records are matched by name like L3 and the 7 unmatched ones are ordinary No confirmed standard match checks.');

// L3V is Level 3 (owner decision 2026-10-19): an unmatched L3V record is a Level 3 gap with both catalogues.
test('Unmatched L3V records are Level 3 gaps in Data checks',()=>{
 for(const [source,total] of [[{...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource},109],[data,83]]){
  const {reports,all,find}=checked(source);
  assert.equal(l3Gap(reports.process).length,21);
  for(const name of new Set(unmatchedL3V.map(([name])=>name)))assert(l3Gap(reports.process).some(app=>app.Name===name),`${name} needs Level 3 review`);
  for(const [name,raw] of unmatchedL3V){
   const [,checks]=all.find(([app])=>app.Name===name);
   assert.equal(checks.checks.find(row=>row.raw===raw).primary,'Process: Level 3 match needs review',`${raw} is an unrecognized Level 3 registration`);
  }
  const [,szh5]=find(l3vMovedRowApp);
  assert.equal(szh5.checks.filter(row=>row.primary==='Process: Level 3 missing').length,0,'Szh5_ASRS_WCS_WMS registers Level 3 through its L3V record');
  assert.equal(all.reduce((sum,[,checks])=>sum+checks.n,0),total);
 }
});

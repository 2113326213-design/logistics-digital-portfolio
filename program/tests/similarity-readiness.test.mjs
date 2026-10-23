import {RECORDS_V916} from './records-v916.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {createWeightedSimilarity} from '../public/weighted.mjs';
import {comparisonReadiness} from '../public/similarity-readiness.mjs';

const capabilityRows=[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Task','B.14.1 Outside']];
const processRows=[
 ['T','L0','M.T','Root'],['T','L1','M.T.1','Stage'],['T','L2','M.T.1.1','Area'],['T','L3','M.T.1.1.1','Task'],
 ['U','L0','M.U','Other root'],['U','L1','M.U.1','Other stage']
];
const app=(ID,extra={})=>({ID,Name:`Warehouse ${ID}`,Description:'manage warehouse stock',
 'Business Capabilities':'B.06.1.1 Task',Processes:'BBM PM T Task L3',...extra});
const index=(apps,weights,rows=processRows)=>createWeightedSimilarity(buildModel({apps,capabilityRows,processRows:rows}),weights);
const names=result=>result.apps.map(row=>row.app.Name);
// The synthetic unresolved process record has no level ("BBM PM T Unknown", Process level not specified), so it stays
// pending: since V19.1 (owner 2026-10-23, "也按并集") a record with a level, such as the earlier "BBM PM T Unknown L3",
// is in LeanIX and is no longer pending (pinned in the last test of this file). Both go through the same issue path.

// 2026-10-21: expectations re-derived from the V9.16 data (LeanIX export 2026-10-20 merged by application ID).
// ShzP_Pad system, RBCW Auto Warehouse Management System and Szh5_ASRS_WCS_WMS now register B.06.5 instead of the
// B.06 root and VMCN_Digital Dynamic Supermarket no longer registers B.06.4.4, so two applications left the queue
// (none joined; RBCW AWMS stays because its new "Transport Material Intra Plant L3" record needs confirmation).
// 17 queued applications × 70 affected pairs − C(17,2) shared pairs = 1054 (was 19 × 70 − C(19,2) = 1159).
// V19.1 union (owner 2026-10-23, "也按并集"): a process record with a level (L0–L3, L3V = L3) that is not exactly one
// Signavio process is in LeanIX (app.inLeanix) and is no longer pending in the similarity check. 11 of the 17 queued
// applications were queued only for such records and left the queue: AUTO-RACK, RBCD LOM Scrap Management Platform,
// RBCD WI management system, RBCW Auto Warehouse Management System, RBCW E-Queue system, RBHP_LOG_QualManager,
// ShzP_DAVIS, Szh5_ASRS_WCS_WMS, VM-CN_WACOS_Szh5, VM/LOG-Szh2_DAVIS and VMCN_iSCMP. RBCD LOG Xone stays for its record
// without a level only; none joined. 6 queued applications × 70 − C(6,2) = 405 (was 1054). Recounted with node on
// tests/data-v9.16.json: emptying every app.inLeanix gives back the old 1054 / 17 (15 Needs confirmation, 2 More detail needed).
const LEVEL=/\bL[0-3]V?\s*$/i;
test('bundled portfolio: 405 affected pairs reduce to 6 source applications with no unexplained pair',()=>{
 const data=workspaceData(JSON.parse(readFileSync(RECORDS_V916)));
 const model=buildModel(data),pairs=createWeightedSimilarity(model,data.similarityWeights).pairs();
 const before=JSON.stringify({apps:data.apps,labels:pairs.map(pair=>[pair.status,pair.coverage])});
 const result=comparisonReadiness(pairs);
 assert.equal(result.pairCount,405);// was 1054
 assert.equal(result.apps.length,6);// was 17
 assert.equal(result.unattributedPairCount,0);
 assert.equal(result.apps.filter(row=>row.kinds.includes('Needs confirmation')).length,4);// was 15
 assert.equal(result.apps.filter(row=>row.kinds.includes('More detail needed')).length,2,
  'only the two Level-0-only process applications remain coarse; 4 + 2 = 6, no application carries both kinds');
 assert.equal(new Set(result.apps.map(row=>row.app.id)).size,6);
 assert.deepEqual(new Set(names(result)),new Set(['360° Supplier dashboard','CDR_EM','RBAC_ME_i-Warehouse',
  'RBCC I4.0 Visualization (Davis)','RBCC Production Excution Support System(PESS)','RBCD LOG Xone']));
 assert(result.apps.every(row=>row.pairCount===70));
 assert(!names(result).includes('CGQB_Logistic_system'));
 // Every record left to confirm has no level; the More detail needed records are matched Level 0 processes.
 for(const row of result.apps)for(const record of row.records){
  assert.equal(record.dimension,'process',row.app.Name);
  assert.equal(LEVEL.test(record.raw),record.kind==='More detail needed',row.app.Name+': '+record.raw);
 }
 // ShzP_DAVIS was queued (70 pairs) for "BBM PM I2D Load Truck L3" alone: in LeanIX, so not pending any more, although
 // the record is still in model.issues.
 const shzp=model.apps.find(app=>app.Name==='ShzP_DAVIS');
 assert(!names(result).includes('ShzP_DAVIS'));
 assert.deepEqual(shzp.inLeanix.map(x=>x.raw),['BBM PM I2D Load Truck L3']);
 assert(model.issues.some(issue=>issue.appId===shzp.id&&issue.value==='BBM PM I2D Load Truck L3'));
 // RBCD LOM Scrap Management Platform had two pending L3V records; both are in LeanIX now.
 assert(!names(result).includes('RBCD LOM Scrap Management Platform'));
 assert.equal(model.apps.find(app=>app.Name==='RBCD LOM Scrap Management Platform').inLeanix.length,2);
 // RBCD LOG Xone had two pending records: the one with a level left, the one without a level stays.
 const xone=result.apps.find(row=>row.app.Name==='RBCD LOG Xone');
 assert.deepEqual(xone.records.map(record=>record.raw),['BBM_O2C_OM_01 Schedule Agreement for Goods']);
 assert.deepEqual(xone.app.inLeanix.map(x=>x.raw),['BBM PM P2F Transmit Material and Sales Master Data L3']);
 assert.equal(JSON.stringify({apps:data.apps,labels:pairs.map(pair=>[pair.status,pair.coverage])}),before);
});

test('only the app with an unresolved record is queued, once across directions, repeated pairs and peers',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown'}),app('B'),app('C')]);
 const result=comparisonReadiness([...i.pairs(),i.pair('A','B'),i.pair('B','A')]);
 assert.equal(result.pairCount,2);
 assert.equal(result.unattributedPairCount,0);
 assert.deepEqual(names(result),['Warehouse A']);
 assert.equal(result.apps[0].pairCount,2);
 assert.equal(result.apps[0].records.length,1);
});

test('a zero-weight dimension contributes no readiness work while another weighted problem still does',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown'}),app('B',{Description:''}),app('C')],
  {name:.1,description:.2,cap:.7,process:0});
 const result=comparisonReadiness(i.pairs());
 assert.deepEqual(names(result),['Warehouse B']);
 assert.equal(result.pairCount,2);
 assert.deepEqual(result.apps[0].records.map(record=>record.dimension),['description']);
 assert.deepEqual(comparisonReadiness(index([app('A',{Processes:'BBM PM T Unknown'}),app('C')],
  {name:.1,description:.2,cap:.7,process:0}).pairs()),{apps:[],pairCount:0,unattributedPairCount:0});
});

test('empty fields and text with no comparable words belong only to their own application',()=>{
 const model=buildModel({apps:[app('A'),app('B'),app('C',{Description:''}),app('D',{Name:'Z'})],capabilityRows,processRows});
 // Imports require names, but the helper can still diagnose an empty name from an external model.
 model.apps[0].Name='';
 const result=comparisonReadiness(createWeightedSimilarity(model).pairs());
 assert.deepEqual(new Set(names(result)),new Set(['','Warehouse C','Z']));
 assert.equal(result.apps.find(row=>row.app.id==='A').records[0].kind,'Data missing');
 assert.equal(result.apps.find(row=>row.app.id==='C').records[0].dimension,'description');
 assert.deepEqual(result.apps.find(row=>row.app.id==='D').records.map(record=>[record.dimension,record.kind]),
  [['name','Needs confirmation']]);
 assert.equal(result.apps.find(row=>row.app.id==='D').pairCount,3);
});

test('empty capability and process registrations are attributed independently',()=>{
 const result=comparisonReadiness(index([
  app('A',{'Business Capabilities':''}),app('B',{Processes:''}),app('C')
 ]).pairs());
 assert.deepEqual(names(result),['Warehouse A','Warehouse B']);
 assert.equal(result.pairCount,3);
 assert.deepEqual(result.apps.map(row=>row.records.map(record=>[record.dimension,record.kind,record.raw])),
  [[['cap','Data missing','']],[['process','Data missing','']]]);
});

test('application order uses affected pair count before name and only the supplied pairs count',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown'}),app('Z',{Processes:'BBM PM T Unknown'}),app('B'),app('C')]);
 const result=comparisonReadiness([i.pair('A','B'),i.pair('Z','C'),i.pair('Z','B')]);
 assert.deepEqual(result.apps.map(row=>[row.app.Name,row.pairCount]),[['Warehouse Z',2],['Warehouse A',1]]);
 const tied=comparisonReadiness([i.pair('Z','B'),i.pair('A','B')]);
 assert.deepEqual(names(tied),['Warehouse A','Warehouse Z']);
});

test('root-only and mixed-chain L0 evidence is assigned to the coarse app, not a detailed peer',()=>{
 const only=index([app('A',{Processes:'BBM PM T Root L0'}),app('B')]);
 const result=comparisonReadiness(only.pairs());
 assert.deepEqual(names(result),['Warehouse A']);
 assert.deepEqual(result.apps[0].kinds,['More detail needed']);
 assert.equal(result.apps[0].records[0].raw,'BBM PM T Root L0');
 const mixed=index([app('A',{Processes:'BBM PM T Task L3;BBM PM U Other root L0'}),
  app('B',{Processes:'BBM PM T Task L3;BBM PM U Other stage L1'})]);
 const mixedResult=comparisonReadiness(mixed.pairs());
 assert.deepEqual(names(mixedResult),['Warehouse A']);
 assert.deepEqual(mixedResult.apps[0].records.map(record=>record.raw),['BBM PM U Other root L0']);
});

test('root-only capabilities and outside-only capabilities have different actionable reasons',()=>{
 const i=index([app('A',{'Business Capabilities':'B.06 Logistics'}),app('B',{'Business Capabilities':'B.14.1 Outside'}),app('C')]);
 const result=comparisonReadiness(i.pairs());
 assert.deepEqual(new Set(names(result)),new Set(['Warehouse A','Warehouse B']));
 assert.deepEqual(result.apps.find(row=>row.app.id==='A').kinds,['More detail needed']);
 const outside=result.apps.find(row=>row.app.id==='B');
 assert.deepEqual(outside.kinds,['Needs confirmation']);
 assert.match(outside.records[0].reason,/comparison scope/);
 assert.match(outside.records[0].reason,/does not establish a record error/);
});

test('missing taxonomy ancestors are attributed by projection side in either pair direction',()=>{
 const i=index([app('A'),app('B',{Processes:'BBM PM T Stage L1'})],undefined,processRows.filter(row=>row[1]!=='L2'));
 for(const pair of [i.pair('A','B'),i.pair('B','A')]){
  const result=comparisonReadiness([pair]);
  assert.deepEqual(names(result),['Warehouse A']);
  assert.equal(result.apps[0].records.length,1);
  assert.equal(result.apps[0].records[0].raw,'BBM PM T Task L3');
  assert.match(result.apps[0].records[0].reason,/ancestor/);
 }
});

test('excluded apps and complete-score/investigation pairs do not enter the data queue',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown',scopeNote:'No score,not go-live'}),app('B'),app('C')]);
 assert.deepEqual(comparisonReadiness(i.pairs()),{apps:[],pairCount:0,unattributedPairCount:0});
 const noText=index([app('A',{Name:'Iris',Description:'oranges'}),app('B',{Name:'Conveyor',Description:'apples'})]);
 assert.equal(noText.pairs()[0].status,'investigation');
 assert.deepEqual(comparisonReadiness(noText.pairs()),{apps:[],pairCount:0,unattributedPairCount:0});
});

test('unexplained unavailable evidence is counted without blaming either application',()=>{
 const i=index([app('A'),app('B')]),original=i.pairs()[0];
 const direction=result=>({...result,coverage:null,components:result.components.map(component=>
  component.key==='process'?{...component,score:null,result:null}:component)});
 const pair={...original,status:'incomplete',coverage:null,forward:direction(original.forward),reverse:direction(original.reverse)};
 assert.deepEqual(comparisonReadiness([pair]),{apps:[],pairCount:1,unattributedPairCount:1,unattributedPairs:[pair]},
  'preserve the comparison for inspection without assigning the problem to either application');
});

// V19.1 union (owner 2026-10-23, "也按并集"): a process record with a level that is not in the Signavio list is in
// LeanIX; like a record the owner confirmed it is not pending, and it adds no comparison evidence. The record without a
// level beside it is still queued.
test('a process record with a level outside the Signavio list is not queued; one without a level still is',()=>{
 const i=index([app('A',{Processes:'BBM PM T Task L3;BBM PM T Unknown L3'}),app('B',{Processes:'BBM PM T Task L3;BBM PM T Unknown'}),app('C')]);
 const model=buildModel({apps:[app('A',{Processes:'BBM PM T Task L3;BBM PM T Unknown L3'})],capabilityRows,processRows});
 assert.deepEqual(model.apps[0].inLeanix.map(x=>x.raw),['BBM PM T Unknown L3']);
 assert(model.issues.some(issue=>issue.value==='BBM PM T Unknown L3'),'the record is still a model issue');
 assert.equal(i.pair('A','C').status,'confirmed','A ↔ C gets a normal score');
 assert.equal(i.pair('A','C').coverage,index([app('A'),app('C')]).pair('A','C').coverage,'and the record adds no comparison evidence');
 const result=comparisonReadiness(i.pairs());
 assert.deepEqual(names(result),['Warehouse B']);
 assert.deepEqual(result.apps[0].records.map(record=>record.raw),['BBM PM T Unknown']);
 assert.equal(result.pairCount,2);
});

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

test('bundled portfolio: 1159 affected pairs reduce to 19 source applications with no unexplained pair',()=>{
 const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
 const model=buildModel(data),pairs=createWeightedSimilarity(model,data.similarityWeights).pairs();
 const before=JSON.stringify({apps:data.apps,labels:pairs.map(pair=>[pair.status,pair.coverage])});
 const result=comparisonReadiness(pairs);
 assert.equal(result.pairCount,1159);
 assert.equal(result.apps.length,19);
 assert.equal(result.unattributedPairCount,0);
 assert.equal(result.apps.filter(row=>row.kinds.includes('Needs confirmation')).length,15);
 assert.equal(result.apps.filter(row=>row.kinds.includes('More detail needed')).length,5,
  'one coarse-capability application also has an unresolved process and remains a single application');
 assert.equal(new Set(result.apps.map(row=>row.app.id)).size,19);
 assert(!names(result).includes('CGQB_Logistic_system'));
 const shzp=result.apps.find(row=>row.app.Name==='ShzP_DAVIS');
 assert.equal(shzp.pairCount,70);
 assert.equal(shzp.records.length,1);
 assert.equal(shzp.records[0].raw,'BBM PM I2D Load Truck L3');
 assert.equal(result.apps.find(row=>row.app.Name==='RBCD LOM Scrap Management Platform').records.length,3,
  'two pending processes and one outside-only capability are distinct reasons for the same application');
 assert.equal(JSON.stringify({apps:data.apps,labels:pairs.map(pair=>[pair.status,pair.coverage])}),before);
});

test('only the app with an unresolved record is queued, once across directions, repeated pairs and peers',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown L3'}),app('B'),app('C')]);
 const result=comparisonReadiness([...i.pairs(),i.pair('A','B'),i.pair('B','A')]);
 assert.equal(result.pairCount,2);
 assert.equal(result.unattributedPairCount,0);
 assert.deepEqual(names(result),['Warehouse A']);
 assert.equal(result.apps[0].pairCount,2);
 assert.equal(result.apps[0].records.length,1);
});

test('a zero-weight dimension contributes no readiness work while another weighted problem still does',()=>{
 const i=index([app('A',{Processes:'BBM PM T Unknown L3'}),app('B',{Description:''}),app('C')],
  {name:.1,description:.2,cap:.7,process:0});
 const result=comparisonReadiness(i.pairs());
 assert.deepEqual(names(result),['Warehouse B']);
 assert.equal(result.pairCount,2);
 assert.deepEqual(result.apps[0].records.map(record=>record.dimension),['description']);
 assert.deepEqual(comparisonReadiness(index([app('A',{Processes:'BBM PM T Unknown L3'}),app('C')],
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
 const i=index([app('A',{Processes:'BBM PM T Unknown L3'}),app('Z',{Processes:'BBM PM T Unknown L3'}),app('B'),app('C')]);
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
 const i=index([app('A',{Processes:'BBM PM T Unknown L3',scopeNote:'No score,not go-live'}),app('B'),app('C')]);
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

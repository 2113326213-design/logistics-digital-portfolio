import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';

const caps=[['B.06 Logistics','B.06.1 Planning','B.06.2 Storage'],['B.06.1.1 First task','B.06.1.2 Second task','B.06.2.1 Other task']];
const app=(ID,cap,Processes='')=>({ID,Name:ID,'Business Capabilities':cap.map(id=>id+' Source').join(';'),Processes});
const index=(a,b,capabilityRows=caps)=>createSimilarity(buildModel({apps:[app('A',a),app('B',b)],capabilityRows,processRows:[]}),'cap');

test('L3 against L2 uses L2 both ways, deduplicates projected children and preserves source scopes',()=>{
 const i=index(['B.06.1.1','B.06.1.2'],['B.06.1']),before=JSON.stringify([...i.scopes]);
 for(const [a,b] of [['A','B'],['B','A']]){
  const r=i.compare(a,b);assert.equal(r.coverage,1);assert.equal(r.targetCount,1);assert.deepEqual(r.comparisonLevels,[2]);assert.deepEqual(r.deferredLevels,[3]);assert.equal(r.depthAdjusted,true);
 }
 assert.equal(JSON.stringify([...i.scopes]),before);
 const r=i.compare('A','B');assert.deepEqual(r.comparedTarget[0].sources.map(s=>s.id),['B.06.1.1','B.06.1.2']);assert.equal(r.deferredTarget.length,2);assert.equal(r.deferredPeer.length,0);
});

test('both L3 retain detail and distinct L3 leaves remain a valid zero',()=>{
 const r=index(['B.06.1.1'],['B.06.1.2']).compare('A','B');assert.equal(r.coverage,0);assert.deepEqual(r.comparisonLevels,[3]);assert.equal(r.depthAdjusted,false);assert.deepEqual(r.deferredTarget,[]);
});

test('mixed branches lower only where needed and never drop unmatched branches',()=>{
 const i=index(['B.06.1.1','B.06.2.1'],['B.06.1']);assert.equal(i.compare('A','B').coverage,.5);assert.equal(i.compare('B','A').coverage,1);
 const mixed=index(['B.06.1.1','B.06.2.1'],['B.06.1','B.06.2.1']).compare('A','B');assert.equal(mixed.coverage,1);assert.deepEqual(mixed.comparisonLevels,[2,3]);assert.deepEqual(mixed.deferredTarget.map(s=>s.id),['B.06.1.1']);
 // Owner decision 2026-10-16 (option A): an unrelated branch keeps its own registered level.
 const unrelated=index(['B.06.1.1'],['B.06.2']).compare('A','B');assert.equal(unrelated.coverage,0);assert.deepEqual(unrelated.comparisonLevels,[3]);assert.equal(unrelated.depthAdjusted,false);
});

test('a peer record elsewhere never changes how an unrelated target branch is counted',()=>{
 const rows=[['B.06 Logistics','B.06.1 Planning','B.06.2 Storage','B.06.3 Transport'],['B.06.1.1 First task','B.06.1.2 Second task','B.06.2.1 Other task','B.06.3.1 Move']];
 const target=['B.06.1.1','B.06.1.2','B.06.2.1'];
 const l2Only=index(target,['B.06.2'],rows).compare('A','B'),withL3Elsewhere=index(target,['B.06.2','B.06.3.1'],rows).compare('A','B'),exactMatch=index(target,['B.06.2','B.06.1.1'],rows).compare('A','B');
 assert.equal(l2Only.coverage,1/3);assert.equal(l2Only.targetCount,3);
 assert.equal(withL3Elsewhere.coverage,1/3,'an unrelated peer L3 record leaves the denominator unchanged');
 assert.equal(exactMatch.coverage,2/3,'an additional exact peer match can only raise coverage');
 assert.deepEqual(l2Only.comparisonLevels,[2,3]);assert.deepEqual(l2Only.deferredTarget.map(s=>s.id),['B.06.2.1']);
});

test('process chains follow option A too: an unrelated chain keeps its L3 records in the denominator',()=>{
 const rows=[['T','L0','M.T','Root'],['T','L1','M.T.1','Stage'],['T','L2','M.T.1.1','Area'],['T','L3','M.T.1.1.1','Task one'],['T','L3','M.T.1.1.2','Task two'],['U','L0','M.U','Other root'],['U','L1','M.U.1','Other stage'],['U','L2','M.U.1.1','Other area'],['U','L3','M.U.1.1.1','Other task one'],['U','L3','M.U.1.1.2','Other task two']];
 const make=(left,right)=>createSimilarity(buildModel({apps:[app('A',[],left),app('B',[],right)],capabilityRows:[],processRows:rows}),'process');
 const r=make('BBM PM T Task one L3;BBM PM T Task two L3;BBM PM U Other task one L3;BBM PM U Other task two L3','BBM PM T Area L2').compare('A','B');
 assert.equal(r.targetCount,3,'two T tasks count once at the peer level; both U tasks stay at L3');assert.equal(r.coverage,1/3);
 assert.deepEqual(r.comparisonLevels,[2,3]);assert.deepEqual(r.comparedTarget.filter(n=>n.level===3).map(n=>n.id),['M.U.1.1.1','M.U.1.1.2']);
 assert.deepEqual(r.deferredTarget.map(s=>s.id),['M.T.1.1.1','M.T.1.1.2']);
});

test('unknown codes and inferred-only capability ancestors cannot become known common-level matches',()=>{
 assert.equal(index(['B.06.99.1'],['B.06.1']).compare('A','B').coverage,null);
 // An unrelated peer does not require a projection, so the record is compared as registered and matches nothing.
 const i=index(['B.06.1.1'],['B.06.2'],[['B.06 Logistics','B.06.1.1 Task','B.06.2 Storage']]);
 for(const [a,b] of [['A','B'],['B','A']]){const r=i.compare(a,b);assert.equal(r.coverage,0);assert.equal(r.commonCount,0);assert.deepEqual(r.projectionIssues,[]);}
 // A projection that is needed still requires a real taxonomy parent (see the process missing-parent case below).
 assert.equal(index(['B.06'],['B.06']).compare('A','B').coverage,null);
});

test('process L2/L3 aligns through real parents while L0 and missing parents stay unavailable',()=>{
 const rows=[['T','L0','M.T','Root'],['T','L1','M.T.1','Stage'],['T','L2','M.T.1.1','Area'],['T','L3','M.T.1.1.1','Task']];
 const make=(left,right,processRows=rows)=>createSimilarity(buildModel({apps:[app('A',[],left),app('B',[],right)],capabilityRows:[],processRows}),'process');
 const aligned=make('BBM PM T Task L3','BBM PM T Area L2');for(const [a,b] of [['A','B'],['B','A']]){const r=aligned.compare(a,b);assert.equal(r.coverage,1);assert.deepEqual(r.comparisonLevels,[2]);}
 const root=make('BBM PM T Root L0','BBM PM T Task L3');assert.equal(root.compare('A','B').coverage,null);assert.equal(root.compare('B','A').coverage,null);assert.equal(root.compare('A','B').depthAdjusted,false,'L0 does not create a shared L1 comparison');
 const missing=make('BBM PM T Task L3','BBM PM T Stage L1',rows.filter(row=>row[1]!=='L2'));assert.equal(missing.compare('A','B').coverage,null);assert(missing.compare('A','B').projectionIssues.length);
});

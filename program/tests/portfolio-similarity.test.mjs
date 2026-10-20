import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold} from '../public/weighted.mjs';
import {formatAnnualCost} from '../public/costs.mjs';

test('threshold counts each application once and each unordered eligible pair once',()=>{
 const apps=['A','B','C','D'].map(id=>({id,Name:id,Entity:'Plant '+id})),byId=new Map(apps.map(app=>[app.id,app]));
 const pair=(a,b,forward,reverse,status='confirmed')=>({
  key:[a,b].sort().join('::'),target:{app:byId.get(a)},peer:{app:byId.get(b)},
  coverage:forward===null||reverse===null?null:Math.min(forward,reverse),status,
  forward:{coverage:forward},reverse:{coverage:reverse}
 });
 const pairs=[pair('A','B',.62,.52),pair('A','C',.91,null,'incomplete'),pair('B','C',.7,.7,'investigation'),pair('C','D',.34,.4),pair('A','D',.48,.49),pair('B','D',.95,.95,'excluded')];
 const candidates=portfolioCandidates({scopes:new Map(apps.map(app=>[app.id,{app}])),pairs:()=>pairs});
 const at30=portfolioAtThreshold(candidates,30),at50=portfolioAtThreshold(candidates,50),at60=portfolioAtThreshold(candidates,60);
 assert.deepEqual([at30.confirmedCount,at50.confirmedCount,at60.confirmedCount],[4,2,0]);
 assert.deepEqual([at30.pairCount,at50.pairCount,at60.pairCount],[3,1,0]);
 assert.deepEqual(at50.confirmed.map(row=>[row.app.id,row.peer.id,row.score]),[['A','B',.52],['B','A',.52]]);
 assert.deepEqual(at50.confirmedPairs.map(row=>row.key),['A::B']);
 assert.deepEqual([at50.incompletePairs.length,at50.investigationPairs.length,at50.excludedPairs.length],[1,1,1]);
 assert.throws(()=>portfolioAtThreshold(candidates,101),/0 to 100/);
});

test('real portfolio counts and displayed rows use only fully evidenced in-scope pairs',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
 const index=createWeightedSimilarity(buildModel(data)),candidates=portfolioCandidates(index);
 assert.equal(candidates.apps.length,data.apps.length);
 assert.equal(candidates.pairs.length,data.apps.length*(data.apps.length-1)/2);
 const summary=portfolioAtThreshold(candidates,50);
 for(const threshold of [30,50,60]){
  const expected=candidates.pairs.filter(pair=>pair.status==='confirmed'&&Math.min(pair.forward.coverage,pair.reverse.coverage)>=threshold/100);
  const result=portfolioAtThreshold(candidates,threshold);
  assert.equal(result.pairCount,expected.length);
  assert.equal(result.confirmedCount,new Set(expected.flatMap(pair=>[pair.target.app.id,pair.peer.app.id])).size);
 }
 const thresholds=[30,50,60].map(value=>portfolioAtThreshold(candidates,value));
 assert(thresholds[0].pairCount>=thresholds[1].pairCount&&thresholds[1].pairCount>=thresholds[2].pairCount);
 assert.equal(summary.confirmedCount,summary.confirmed.length);
 assert.equal(summary.pairCount,summary.confirmedPairs.length);
 assert.equal(new Set(summary.confirmed.map(row=>row.app.id)).size,summary.confirmedCount);
 assert.equal(new Set(summary.confirmedPairs.map(row=>row.key)).size,summary.pairCount);
 assert(summary.confirmed.every(row=>row.score>=.5&&row.result.status==='confirmed'));
 assert(summary.confirmedPairs.every(row=>row.forward.coverage!==null&&row.reverse.coverage!==null&&row.coverage===Math.min(row.forward.coverage,row.reverse.coverage)));
 assert(summary.incompletePairs.every(row=>row.coverage===null));
 assert(summary.investigationPairs.every(row=>row.zeroText));
 assert(summary.confirmed.every(row=>/^¥[\d,]+\+?$|Not recorded$/.test(formatAnnualCost(row.app))));
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {buildModel} from '../public/model.mjs';
import {belowThresholdConfirmedPairs,createWeightedSimilarity,portfolioCandidates} from '../public/weighted.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));

test('threshold-below confirmed pairs join the existing Not similar diagnostic count',()=>{
 const candidates=portfolioCandidates(createWeightedSimilarity(buildModel(data)));
 const below=belowThresholdConfirmedPairs(candidates.pairs,50);
 const notSimilarInvestigations=candidates.pairs.filter(pair=>pair.status==='investigation'&&[pair.forward,pair.reverse].every(result=>result.components.filter(component=>['cap','process'].includes(component.key)).every(component=>component.score!==null&&component.result.commonCount===0)));
 assert(below.length>0,'real portfolio includes valid scores below the threshold');
 assert(below.every(pair=>pair.status==='confirmed'&&pair.coverage<.5));
 assert.deepEqual(new Set(below.map(pair=>pair.key)),new Set(candidates.pairs.filter(pair=>pair.status==='confirmed'&&pair.coverage<.5).map(pair=>pair.key)));
 assert(notSimilarInvestigations.every(pair=>pair.coverage===null&&pair.zeroText));
 assert.equal(new Set([...below,...notSimilarInvestigations].map(pair=>pair.key)).size,below.length+notSimilarInvestigations.length,'valid low scores and investigation records cannot be double counted');
 assert(belowThresholdConfirmedPairs(candidates.pairs,60).length>=below.length);
 const fixture=[{key:'low',status:'confirmed',coverage:.2},{key:'edge',status:'confirmed',coverage:.5},{key:'missing',status:'incomplete',coverage:null},{key:'text-zero',status:'investigation',coverage:null}];
 assert.deepEqual(belowThresholdConfirmedPairs(fixture,50).map(pair=>pair.key),['low']);
 assert.throws(()=>belowThresholdConfirmedPairs(candidates.pairs,-1),/threshold from 0 to 100/);
});

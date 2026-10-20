import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity} from '../public/weighted.mjs';
import {pairResultLabel,missingPairEvidence,comparisonLevelText,pairStatusReason} from '../public/pair-status.mjs';
import {comparisonRecordEvidence} from '../public/comparison-records.mjs';

const capabilityRows=[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Stock']];
const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['T','L2','M.T.1.1','Detail'],['T','L3','M.T.1.1.1','Fine']];
const app=(ID,overrides={})=>({ID,Name:'Shared '+ID,Description:'shared warehouse','Business Capabilities':'B.06.1 Planning',Processes:'BBM PM T One L1',...overrides});
function fixture(a={},b={}){
 const model=buildModel({apps:[app('A',a),app('B',b)],capabilityRows,processRows});
 return {model,pair:createWeightedSimilarity(model).pair('A','B')};
}

// Owner request 2026-10-20: the investigation label formerly 'Review needed' is now 'No complete score'. These fixtures
// share capability B.06.1 and process M.T.1 (common codes > 0), so they are not 'No shared registrations'.
test('zero text overlap with complete shared codes is No complete score, not Data missing',()=>{
 const {pair}=fixture({Name:'Alpha',Description:'orchard'},{Name:'Beta',Description:'tunnel'});
 assert.equal(pair.status,'investigation');assert.equal(pair.forward.missingWeight,0);
 assert.deepEqual(missingPairEvidence(pair),[]);assert.equal(pairResultLabel(pair),'No complete score');
});

test('blank source description is Data missing while an unknown capability Needs confirmation',()=>{
 assert.equal(pairResultLabel(fixture({Description:''}).pair),'Data missing');
 const pair=fixture({'Business Capabilities':'B.06.99 Unknown'}).pair;
 assert.equal(pairResultLabel(pair),'Needs confirmation');
 assert(missingPairEvidence(pair).some(item=>item.kind==='Needs confirmation'&&item.label==='Capability'));
});

test('confirmed root-only registrations need detail, not correction or a fabricated zero',()=>{
 const process=fixture({Processes:'BBM PM T Root L0'}).pair;
 assert.equal(pairResultLabel(process),'More detail needed');
 assert(missingPairEvidence(process).some(item=>item.reason.includes('Level 0')));
 const capability=fixture({'Business Capabilities':'B.06 Logistics'}).pair;
 assert.equal(pairResultLabel(capability),'More detail needed');
 assert(missingPairEvidence(capability).some(item=>item.reason.includes('B.06 root')));
 assert.equal(capability.forward.components.find(item=>item.key==='cap').score,null);
});

test('capability and process show their own comparison levels and preserve original descendant evidence',()=>{
 const {model,pair}=fixture({'Business Capabilities':'B.06.1.1 Stock'});
 const cap=pair.forward.components.find(item=>item.key==='cap').result;
 const capBack=pair.reverse.components.find(item=>item.key==='cap').result;
 const process=pair.forward.components.find(item=>item.key==='process').result;
 assert.equal(comparisonLevelText(cap),'Compared at Level 2; Level 3 detail deferred');
 assert.equal(comparisonLevelText(process),'Compared at Level 1');
 assert.equal(cap.coverage,1);assert.equal(capBack.coverage,1);
 const records=comparisonRecordEvidence(model,cap,capBack);
 assert.equal(records.exact.length,0,'a shared parent is not an identical original registration');
 assert.equal(records.shared.length,1);assert.equal(records.shared[0].node.id,'B.06.1');
 assert.deepEqual(records.shared[0].targetSources.map(node=>node.id),['B.06.1.1']);
 assert.deepEqual(records.shared[0].peerSources.map(node=>node.id),['B.06.1']);
 assert.deepEqual(cap.target.app.rawCap,['B.06.1.1 Stock']);
 assert.deepEqual(cap.deferredTarget.map(node=>node.id),['B.06.1.1']);
});


// Owner decision 2026-10-19 (a): only name/description fields with weight above zero can hold a pair back, and the
// reason names only those fields. In these fixtures capability B.06.1 and process M.T.1 are shared 1/1 in both
// directions, so the code evidence (c) is the normalized capability + process weight.
const ZERO_A={Name:'Alpha',Description:'orchard'},ZERO_B={Name:'Beta',Description:'tunnel'};
const weighted=(weights,a,b)=>createWeightedSimilarity(buildModel({apps:[app('A',a),app('B',b)],capabilityRows,processRows}),weights).pair('A','B');
// Round 2 (2026-10-19): the code evidence sentence names only the code fields that carry weight.
const sentence=(fields,points,codes='capabilities and processes')=>`No shared words in ${fields}; compare the recorded functions. Code evidence ${points} / 100 from ${codes}; not a pair score.`;

test('the zero-overlap reason names only the text fields that carry weight',()=>{
 // Default weights: both text fields weighted and 0; code evidence 0.3 + 0.4 = 70.
 const both=weighted(undefined,ZERO_A,ZERO_B);
 assert.equal(pairStatusReason(both),sentence('names or descriptions','70'));
 assert.match(both.reason,/^Name and description both have zero overlap; /);
 // Name .2 / capability .4 / process .4 (description 0): only the name holds it back; code evidence 0.4 + 0.4 = 80.
 const name=weighted({name:.2,description:0,cap:.4,process:.4},ZERO_A,ZERO_B);
 assert.equal(pairStatusReason(name),sentence('names','80'));assert.match(name.reason,/^Name has zero overlap; /);
 // Description .2 / capability .3 / process .5 (name 0): only the description; code evidence 0.3 + 0.5 = 80.
 const description=weighted({name:0,description:.2,cap:.3,process:.5},ZERO_A,ZERO_B);
 assert.equal(pairStatusReason(description),sentence('descriptions','80'));assert.match(description.reason,/^Description has zero overlap; /);
});

test('a text field without weight cannot hold a pair back, and without a weighted text field the gate never applies',()=>{
 // "Shared Alpha" vs "Shared Beta" share "shared" (name Jaccard 1/3) but the name carries no weight; the weighted
 // description shares nothing → held back as No complete score.
 const p=weighted({name:0,description:.2,cap:.3,process:.5},{Name:'Shared Alpha',Description:'orchard'},{Name:'Shared Beta',Description:'tunnel'});
 assert.equal(p.forward.components.find(c=>c.key==='name').score,1/3);
 assert.equal(p.status,'investigation');assert.equal(pairResultLabel(p),'No complete score');
 // No weighted text field: names and descriptions both 0 but weightless → confirmed at capability 1 × .5 + process 1 × .5 = 1.
 const q=weighted({name:0,description:0,cap:.5,process:.5},ZERO_A,ZERO_B);
 assert.equal(q.status,'confirmed');assert.equal(q.coverage,1);assert.equal(pairResultLabel(q),'Potential overlap');
});

test('the code evidence sentence names only the code fields that carry weight',()=>{
 // Default weights: capability .3 and process .4 both weighted → "from capabilities and processes", 0.3 + 0.4 = 70.
 assert.equal(pairStatusReason(weighted(undefined,ZERO_A,ZERO_B)),sentence('names or descriptions','70'));
 // Name .1 / description .1 / capability .8 / process 0 (sum 1): capability 1/1 both ways → 0.8 × 1 = 80, from capabilities.
 assert.equal(pairStatusReason(weighted({name:.1,description:.1,cap:.8,process:0},ZERO_A,ZERO_B)),sentence('names or descriptions','80','capabilities'));
 // Name .1 / description .4 / capability 0 / process .5 (sum 1): process 1/1 both ways → 0.5 × 1 = 50, from processes.
 assert.equal(pairStatusReason(weighted({name:.1,description:.4,cap:0,process:.5},ZERO_A,ZERO_B)),sentence('names or descriptions','50','processes'));
 // Both rules together: only the weighted description and only the weighted process are named;
 // description .25 / process .75 → 0.75 × 1 = 75.
 assert.equal(pairStatusReason(weighted({name:0,description:.25,cap:0,process:.75},ZERO_A,ZERO_B)),sentence('descriptions','75','processes'));
});

test('a lone letter or a "(recovered …)" suffix is not a shared name word',()=>{
 // camelCase splitting gives {qin, p, alpha} and {wx, p, beta}: the shared "p" used to make the names overlap (1/5).
 // Without single letters the names share nothing → No complete score with code evidence 70 (0.3 + 0.4).
 const plant=weighted(undefined,{Name:'QinP Alpha',Description:'orchard'},{Name:'WxP Beta',Description:'tunnel'});
 assert.equal(pairResultLabel(plant),'No complete score');assert.equal(pairStatusReason(plant),sentence('names or descriptions','70'));
 // The LeanIX suffix used to add "recovered", "2025" and "19" as shared words (3/13).
 const recovered=weighted(undefined,{Name:'Alpha (recovered 2025-12-19 10:03:06)',Description:'orchard'},{Name:'Beta (recovered 2025-11-19 08:20:28)',Description:'tunnel'});
 assert.equal(pairResultLabel(recovered),'No complete score');assert.equal(pairStatusReason(recovered),sentence('names or descriptions','70'));
 // A real word is still shared: {qin, label} vs {wx, label} = 1/3 → confirmed, 0.1 × 1/3 + 0.3 + 0.4.
 const word=weighted(undefined,{Name:'QinP Label',Description:'orchard'},{Name:'WxP Label',Description:'tunnel'});
 assert.equal(word.status,'confirmed');assert(Math.abs(word.coverage-(0.1/3+0.7))<1e-12,String(word.coverage));
});

test('a single digit or a single Chinese character is still a name word; a full-width or spaced "(recovered …)" suffix is not',()=>{
 // Round 2 (2026-10-19): only single LETTERS are ignored. Codes are shared 1/1 both ways and the descriptions share
 // nothing, so a shared name word gives a confirmed 0.1 × name Jaccard + 0.3 + 0.4.
 const confirmed=(pair,jaccard,message)=>{assert.equal(pair.status,'confirmed',message);assert(Math.abs(pair.coverage-(0.1*jaccard+0.7))<1e-12,`${message}: ${pair.coverage}`);};
 // {alpha, 7} vs {beta, 7} → 1/3 (round 1 dropped the "7" and held the pair back as Review needed, now labelled No complete score).
 confirmed(weighted(undefined,{Name:'Alpha 7',Description:'orchard'},{Name:'Beta 7',Description:'tunnel'}),1/3,'shared digit');
 // {alpha, 仓} vs {beta, 仓} → 1/3 (U+4ED3, a one-character Chinese word).
 const han=String.fromCharCode(0x4ED3);
 confirmed(weighted(undefined,{Name:'Alpha '+han,Description:'orchard'},{Name:'Beta '+han,Description:'tunnel'}),1/3,'shared Chinese character');
 // A single letter next to them is still ignored: {alpha, 7} vs {beta, 7}, the "x" on both sides does not count → 1/3.
 confirmed(weighted(undefined,{Name:'Alpha x 7',Description:'orchard'},{Name:'Beta x 7',Description:'tunnel'}),1/3,'letter beside a digit');
 // Full-width brackets (U+FF08 / U+FF09) are NFKC-normalized before the suffix is removed. Round 1 kept the suffix
 // here and shared {recovered, 2025, 12, 19} of 12 words → confirmed 0.1 × 1/3 + 0.7; now nothing is shared.
 const [open,shut]=[0xFF08,0xFF09].map(code=>String.fromCharCode(code));
 const fullWidth=weighted(undefined,{Name:`Alpha ${open}recovered 2025-12-19 10:03:06${shut}`,Description:'orchard'},{Name:`Beta ${open}recovered 2025-12-19 08:20:28${shut}`,Description:'tunnel'});
 assert.equal(pairResultLabel(fullWidth),'No complete score');assert.equal(pairStatusReason(fullWidth),sentence('names or descriptions','70'));
 // Spaces after the bracket and any letter case: round 1 shared {recovered, 2025, 19} of 7 words (3/7); now nothing.
 const spaced=weighted(undefined,{Name:'Alpha ( recovered 2025-12-19 )',Description:'orchard'},{Name:'Beta (  Recovered 2025-11-19)',Description:'tunnel'});
 assert.equal(pairResultLabel(spaced),'No complete score');assert.equal(pairStatusReason(spaced),sentence('names or descriptions','70'));
});

test('mixed branch depths describe only some deeper records as deferred',()=>{
 assert.equal(comparisonLevelText({comparisonLevels:[2,3],deferredLevels:[3]}),'Compared at Level 2 / Level 3; Some Level 3 detail deferred');
 assert.equal(comparisonLevelText({comparisonLevels:[2],deferredLevels:[3]}),'Compared at Level 2; Level 3 detail deferred');
});

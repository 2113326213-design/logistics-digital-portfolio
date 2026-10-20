import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {workspaceData,importWorkspace,exportWorkspace} from '../public/workspace.mjs';
import {DEFAULT_WEIGHTS,createWeightedSimilarity} from '../public/weighted.mjs';
import {inspectWeightAllocation,weightPercentages} from '../public/weight-controls.mjs';
import {buildModel} from '../public/model.mjs';

// Round 3 of the 2026-10-19 Similarity review (owner decision (a)): saved and imported weights are used as the weight
// panel shows them, in 0.1% steps, so a field shown as 0% has weight 0 and never counts as weighted (for example in the
// zero-text gate). Tests and blocks marked "guard" pin behaviour that round 3 must not change; every other assertion
// fails against the code before round 3.

const bundled=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const keys=['name','description','cap','process'];
const weights=(name,description,cap,process)=>({name,description,cap,process});
// The panel applies a shown percentage p as p / 100 (inspectWeightAllocation), so p / 100 is the expected loaded number.
const applied=(name,description,cap,process)=>weights(name/100,description/100,cap/100,process/100);
// Two applications with the same capability (B.06.1) and process (M.T.1) records, so each code field covers the other
// fully (score 1 in both directions), while the names (alpha store / beta yard) and the descriptions (inbound pallets /
// outbound parcels) share no word (score 0).
const app=(ID,Name,Description)=>({ID,Name,Description,'Business Capabilities':'B.06.1 Planning',Processes:'BBM PM T One L1'});
const fixture=(similarityWeights,extra={similarityWeightsVersion:2})=>({source:'Round 3 weight fixture',apps:[app('A','Alpha Store','inbound pallets'),app('B','Beta Yard','outbound parcels')],capabilityRows:[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Stock']],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','One']],similarityWeights,...extra});
const loaded=(stored,extra)=>workspaceData(fixture(stored,extra)).similarityWeights;
const workspaceFile=(data,version=6)=>JSON.stringify({format:'logistics-portfolio-workspace',version,data});
const pairOf=data=>{const clean=workspaceData(data);return createWeightedSimilarity(buildModel(clean),clean.similarityWeights).pair('A','B');};
const NAME_GATE='Name has zero overlap; investigate the underlying function before treating this as an opportunity.';
const CONFIRMED='The opportunity score is the lower of the two confirmed directional totals.';

test('a saved weight that the panel shows as 0% loads as weight 0',()=>{
 // .0004 / 0 / .5 / .4996 adds up to 1. In 0.1% steps that is 0.4 / 0 / 500 / 499.6; the panel shows the whole steps
 // 0 / 0 / 500 / 499 and gives the one step left to the largest remainder (process .6 beats name .4):
 // Name 0% · Description 0% · Capability 50% · Process 50%, so the loaded weights are 0 / 0 / .5 / .5.
 const stored=weights(.0004,0,.5,.4996);
 assert.deepEqual(weightPercentages(stored),{name:0,description:0,cap:50,process:50},'premise (guard): the panel shows Name 0%');
 assert.deepEqual(loaded(stored),weights(0,0,.5,.5));
 assert.deepEqual(loaded(stored,{}),weights(0,0,.5,.5),'without similarityWeightsVersion (not the legacy set)');
 assert.deepEqual(loaded(stored,{similarityWeightsVersion:1}),weights(0,0,.5,.5));
 // A hidden description weight: 0 / .0002 / .6 / .3998 → 0 / 0.2 / 600 / 399.8 steps → 0 / 0 / 600 / 399, and the step
 // left goes to process (.8 beats .2) → 0 / 0 / 60% / 40%.
 assert.deepEqual(loaded(weights(0,.0002,.6,.3998)),weights(0,0,.6,.4));
 // A tiny weight the panel rounds UP stays weighted, at the step it shows: .0006 / 0 / .5 / .4994 → 0.6 / 0 / 500 / 499.4
 // steps → 0 / 0 / 500 / 499, and the step left goes to name (.6 beats .4) → 0.1% / 0 / 50% / 49.9%.
 assert.deepEqual(loaded(weights(.0006,0,.5,.4994)),applied(.1,0,50,49.9));
 // importWorkspace follows the same rule for a current (6) and an older (1) document version.
 assert.deepEqual(importWorkspace(workspaceFile(fixture(stored))).similarityWeights,weights(0,0,.5,.5));
 assert.deepEqual(importWorkspace(workspaceFile(fixture(stored,{}),1)).similarityWeights,weights(0,0,.5,.5));
});

test('weights already on the 0.1% grid load unchanged',()=>{
 // Guard: whole steps adding to 1,000 keep their exact numbers (p / 100 is the same double as the literal here).
 for(const stored of [weights(.1,.2,.3,.4),weights(.25,.25,.25,.25),weights(.2,.2,.5,.1),weights(1,0,0,0),weights(0,0,0,1),weights(0,.5,0,.5),weights(.001,0,.5,.499)]){
  assert.deepEqual(loaded(stored),stored,JSON.stringify(stored));
 }
 // Guard: every two-field split the panel can apply (k / 10 % and (1000 − k) / 10 % for k = 0 … 1000, in three field
 // pairs) loads back as exactly the numbers the panel applied.
 for(let k=0;k<=1000;k++){
  for(const draft of [{name:k/10,description:(1000-k)/10,cap:0,process:0},{name:0,description:0,cap:k/10,process:(1000-k)/10},{name:k/10,description:0,cap:0,process:(1000-k)/10}]){
   const state=inspectWeightAllocation(Object.fromEntries(keys.map(key=>[key,draft[key].toFixed(1)])));
   assert.equal(state.valid,true,JSON.stringify(draft));
   assert.deepEqual(loaded(state.weights),state.weights,JSON.stringify(draft));
  }
 }
 // .333 / .333 / .334 / 0 is shown as 33.3 / 33.3 / 33.4 / 0 and keeps those steps (guard: the shown steps and the values
 // to 1e-15 are as before). The loaded numbers are what the panel applies for those steps: 33.3 / 100 =
 // 0.33299999999999996, the double next to .333 (difference under 1e-16), so pressing Apply on what the panel shows gives
 // back exactly the loaded weights.
 const thirds=loaded(weights(.333,.333,.334,0));
 assert.deepEqual(weightPercentages(thirds),{name:33.3,description:33.3,cap:33.4,process:0});
 for(const [key,value] of Object.entries(weights(.333,.333,.334,0)))assert(Math.abs(thirds[key]-value)<1e-15,`${key}: ${thirds[key]} ≈ ${value}`);
 // Round 3: the exact numbers.
 assert.deepEqual(thirds,applied(33.3,33.3,33.4,0));
 assert.deepEqual(inspectWeightAllocation(weightPercentages(thirds)).weights,thirds);
});

test('weights between steps load as the steps the panel shows',()=>{
 // 1/3, 1/3, 1/3, 0: each is 333⅓ steps → 333 each, one step left; the remainders tie, so the first field (name) gets it:
 // 33.4% / 33.3% / 33.3% / 0%. The same ratios written as 1 / 1 / 1 / 0 load the same (weights are normalised first).
 assert.deepEqual(loaded(weights(1/3,1/3,1/3,0)),applied(33.4,33.3,33.3,0));
 assert.deepEqual(loaded(weights(1,1,1,0)),applied(33.4,33.3,33.3,0));
 // .5 in every field normalises to a quarter each.
 assert.deepEqual(loaded(weights(.5,.5,.5,.5)),weights(.25,.25,.25,.25));
 // 1/7, 2/7, 3/7, 1/7: 142.857… / 285.714… / 428.571… / 142.857… steps → 142 / 285 / 428 / 142 = 997, three steps left
 // for the largest remainders: name and process (.857, tie → field order), then description (.714) → 14.3 / 28.6 / 42.8 / 14.3.
 assert.deepEqual(loaded(weights(1/7,2/7,3/7,1/7)),applied(14.3,28.6,42.8,14.3));
 // Sweep i/7 (i = 0 … 7) in every field, 4,095 allocations with at least one above zero: the loaded weights are whole
 // 0.1% steps adding to 1,000 steps and pressing Apply on what the panel shows gives exactly the loaded weights. Guards:
 // the panel shows the same percentages as for the stored weights, it accepts them, and loading a second time changes
 // nothing (otherwise a re-imported workspace would read as changed).
 const ratios=[0,1,2,3,4,5,6,7].map(i=>i/7);
 for(const name of ratios)for(const description of ratios)for(const cap of ratios)for(const process of ratios){
  if(!name&&!description&&!cap&&!process)continue;
  const stored=weights(name,description,cap,process),next=loaded(stored),label=JSON.stringify(stored);
  const steps=keys.map(key=>next[key]*1000);
  for(const step of steps)assert(Math.abs(step-Math.round(step))<1e-9,`${label}: ${step} is a whole step`);
  assert.equal(steps.reduce((sum,step)=>sum+Math.round(step),0),1000,label);
  const state=inspectWeightAllocation(weightPercentages(next));
  assert.deepEqual(state.weights,next,label);
  assert.deepEqual(weightPercentages(next),weightPercentages(stored),label);// guard
  assert.equal(state.valid,true,label);// guard
  assert.deepEqual(loaded(next),next,label);// guard
 }
});

test('a field shown as 0% never counts as weighted, so it cannot hold a pair back',()=>{
 // Values from far below half a step (1e-12, 1e-7, .0004) to visible steps (.0006 rounds up to 0.1%, .001, .2, 1) in
 // every field: 4,095 allocations. A loaded weight is above zero exactly when the panel shows the stored weight above 0%.
 // With the fixture (names and descriptions share no word, codes match fully) a pair is held back exactly when the panel
 // shows name or description above 0%; otherwise it is confirmed at 0 + 0 + capability + process = 1 in both directions.
 const model=buildModel(workspaceData(fixture(DEFAULT_WEIGHTS)));
 const values=[0,1e-12,1e-7,.0004,.0006,.001,.2,1];
 let released=0;
 for(const name of values)for(const description of values)for(const cap of values)for(const process of values){
  if(!name&&!description&&!cap&&!process)continue;
  const stored=weights(name,description,cap,process),shown=weightPercentages(stored),next=loaded(stored),label=JSON.stringify(stored);
  for(const key of keys)assert.equal(next[key]>0,shown[key]>0,`${label}: ${key} loads as ${next[key]} but shows ${shown[key]}%`);
  const pair=createWeightedSimilarity(model,next).pair('A','B'),heldBack=shown.name>0||shown.description>0;
  assert.equal(pair.status,heldBack?'investigation':'confirmed',label);
  if(heldBack)continue;
  assert(Math.abs(pair.coverage-1)<1e-12,`${label}: ${pair.coverage}`);
  if(name>0||description>0)released++;
 }
 // Guard against a vacuous sweep: some allocations have a positive but hidden text weight (these were held back before).
 assert(released>0,'some allocations have a hidden text weight');
});

test('zero-text gate: a pair held back only by a hidden name weight is no longer held back',()=>{
 // Stored .0004 / 0 / .5 / .4996 → loaded 0 / 0 / .5 / .5 (first test). The names share no word, but no text field carries
 // weight any more, so nothing can hold the pair back; both directions are 0 × 0 + 0 × 0 + .5 × 1 + .5 × 1 = 1.
 const data=fixture(weights(.0004,0,.5,.4996)),clean=workspaceData(data);
 const index=createWeightedSimilarity(buildModel(clean),clean.similarityWeights),pair=index.pair('A','B');
 assert.equal(pair.status,'confirmed');assert.equal(pair.zeroText,false);assert.equal(pair.reason,CONFIRMED);
 assert.equal(pair.forward.components.find(c=>c.key==='name').weight,0);
 assert.equal(pair.forward.coverage,1);assert.equal(pair.reverse.coverage,1);assert.equal(pair.coverage,1);
 assert.equal(index.pair('B','A').status,'confirmed');
 // Guard (premise): the raw stored numbers, which were used as they were before round 3, hold the same pair back.
 assert.equal(createWeightedSimilarity(buildModel(clean),data.similarityWeights).pair('A','B').reason,NAME_GATE);
 // The same through export → import, and through an older (version 1) document without similarityWeightsVersion.
 for(const text of [exportWorkspace(data),workspaceFile(fixture(data.similarityWeights,{}),1)]){
  const next=importWorkspace(text);
  assert.equal(createWeightedSimilarity(buildModel(next),next.similarityWeights).pair('A','B').status,'confirmed');
 }
 // A hidden description weight beside a visible name weight: .5 / .0004 / .4996 / 0 → 500 / 0.4 / 499.6 / 0 steps →
 // 500 / 0 / 499 / 0 plus the step left for capability (.6 beats .4) → 50% / 0% / 50% / 0%. Only the name gates the pair,
 // so the reason names the name alone (before round 3: "Name and description both have zero overlap; …").
 const named=workspaceData(fixture(weights(.5,.0004,.4996,0)));
 assert.deepEqual(named.similarityWeights,weights(.5,0,.5,0));
 const namedPair=createWeightedSimilarity(buildModel(named),named.similarityWeights).pair('A','B');
 assert.equal(namedPair.reason,NAME_GATE);
 assert.equal(namedPair.status,'investigation');// guard: still held back, by the visible name
 // A tiny name weight the panel rounds up to 0.1% is visible, so it still holds the pair back (guard: status unchanged).
 assert.equal(pairOf(fixture(weights(.0006,0,.5,.4994))).reason,NAME_GATE);
 // Guard: a name weight saved as 0 never held the pair back.
 assert.equal(pairOf(fixture(weights(0,0,.5,.5))).status,'confirmed');
});

test('guard: legacy weights without version 2 still migrate to the confirmed defaults',()=>{
 // The former defaults 10 / 40 / 40 / 10 saved without similarityWeightsVersion: 2 become the meeting weights
 // 10 / 20 / 30 / 40; with version 2 they are a newly chosen allocation and stay.
 const legacy=weights(.1,.4,.4,.1);
 assert.deepEqual(loaded(legacy,{}),weights(.1,.2,.3,.4));
 assert.deepEqual(loaded(legacy,{}),{...DEFAULT_WEIGHTS});
 assert.deepEqual(loaded(legacy,{similarityWeightsVersion:1}),weights(.1,.2,.3,.4));
 assert.deepEqual(loaded(legacy),legacy);
 assert.equal(workspaceData(fixture(legacy,{})).similarityWeightsVersion,2);
 assert.deepEqual(importWorkspace(workspaceFile(fixture(legacy,{}),1)).similarityWeights,weights(.1,.2,.3,.4));
 // The migrated workspace is written as version 2, so loading it again keeps the meeting weights.
 const text=exportWorkspace(fixture(legacy,{}));
 assert.equal(JSON.parse(text).data.similarityWeightsVersion,2);
 assert.deepEqual(importWorkspace(text).similarityWeights,weights(.1,.2,.3,.4));
});

test('guard: only the exact legacy numbers migrate; near-legacy weights and version 2 keep their own steps',()=>{
 // Gap from the round-3 mutation review (unchanged by round 4). The migration compares the stored numbers exactly with
 // .1 / .4 / .4 / .1, field by field, before any snapping, and only when similarityWeightsVersion is not 2.
 // Each near-legacy set below differs in one field by 1e-7 and is shown as 10 / 40 / 40 / 10, so it loads as those steps
 // (.1 / .4 / .4 / .1), not as the meeting weights 10 / 20 / 30 / 40. Derivation for .1 / .4 / .4 / .1000001: the sum is
 // 1.0000001, so in 0.1% steps 99.99999 / 399.99996 / 399.99996 / 100.00009 → 99 / 399 / 399 / 100 = 997, and the three
 // steps left go to the largest remainders (.99999, .99996, .99996): 100 / 400 / 400 / 100. Raising name, description or
 // cap instead, or lowering process to .0999999, ends at the same steps the same way.
 const nearLegacy=[weights(.1,.4,.4,.1000001),weights(.1000001,.4,.4,.1),weights(.1,.4000001,.4,.1),weights(.1,.4,.4000001,.1),weights(.1,.4,.4,.0999999)];
 for(const stored of nearLegacy){
  const label=JSON.stringify(stored);
  assert.deepEqual(weightPercentages(stored),{name:10,description:40,cap:40,process:10},label);// premise: shown as legacy
  for(const extra of [{},{similarityWeightsVersion:1},{similarityWeightsVersion:2}]){
   const next=loaded(stored,extra);
   assert.deepEqual(next,applied(10,40,40,10),`${label} ${JSON.stringify(extra)}`);
   assert.notDeepEqual(next,{...DEFAULT_WEIGHTS},`${label} ${JSON.stringify(extra)}`);
  }
  // The same through an older (version 1) document without similarityWeightsVersion; the file written back is version 2
  // with the shown steps, and loading it again keeps them.
  const imported=importWorkspace(workspaceFile(fixture(stored,{}),1));
  assert.deepEqual(imported.similarityWeights,weights(.1,.4,.4,.1),label);
  assert.equal(imported.similarityWeightsVersion,2,label);
  const text=exportWorkspace(fixture(stored,{}));
  assert.deepEqual(JSON.parse(text).data.similarityWeights,weights(.1,.4,.4,.1),label);
  assert.deepEqual(importWorkspace(text).similarityWeights,weights(.1,.4,.4,.1),label);
 }
 // The exact legacy numbers with similarityWeightsVersion 2 are a chosen allocation and stay as stored, however they
 // arrive: workspaceData, a current (6) or an older (1) document, and export → import.
 const legacy=weights(.1,.4,.4,.1);
 assert.deepEqual(loaded(legacy,{similarityWeightsVersion:2}),legacy);
 assert.deepEqual(importWorkspace(workspaceFile(fixture(legacy))).similarityWeights,legacy);
 assert.deepEqual(importWorkspace(workspaceFile(fixture(legacy),1)).similarityWeights,legacy);
 assert.deepEqual(importWorkspace(exportWorkspace(fixture(legacy))).similarityWeights,legacy);
 // Without version 2 (missing or 1; here in a version-6 document, the version-1 document is in the test above) the exact
 // numbers still migrate.
 for(const extra of [{},{similarityWeightsVersion:1}]){
  assert.deepEqual(loaded(legacy,extra),{...DEFAULT_WEIGHTS},JSON.stringify(extra));
  assert.deepEqual(importWorkspace(workspaceFile(fixture(legacy,extra))).similarityWeights,{...DEFAULT_WEIGHTS},JSON.stringify(extra));
 }
});

test('guard: the bundled data.json weights are unchanged',()=>{
 // data.json stores no weights, so the defaults 10 / 20 / 30 / 40 apply; they are whole steps (100 / 200 / 300 / 400).
 assert.equal(bundled.similarityWeights,undefined);
 const clean=workspaceData(bundled);
 assert.deepEqual(clean.similarityWeights,weights(.1,.2,.3,.4));
 assert.deepEqual(clean.similarityWeights,{...DEFAULT_WEIGHTS});
 assert.equal(clean.similarityWeightsVersion,2);
 assert.deepEqual(weightPercentages(clean.similarityWeights),{name:10,description:20,cap:30,process:40});
 assert.deepEqual(importWorkspace(exportWorkspace(bundled)).similarityWeights,weights(.1,.2,.3,.4));
});

test('export → import round trip keeps the shown steps and is stable',()=>{
 // Expected file contents, derived in the tests above: hidden name → 0 / 0 / .5 / .5; thirds → 33.4 / 33.3 / 33.3 / 0;
 // sevenths → 14.3 / 28.6 / 42.8 / 14.3; .0006 → 0.1 / 0 / 50 / 49.9 (all as the panel applies them, p / 100).
 const cases=[
  [weights(.0004,0,.5,.4996),weights(0,0,.5,.5)],
  [weights(1/3,1/3,1/3,0),applied(33.4,33.3,33.3,0)],
  [weights(1/7,2/7,3/7,1/7),applied(14.3,28.6,42.8,14.3)],
  [weights(.0006,0,.5,.4994),applied(.1,0,50,49.9)],
  [weights(0,.0002,.6,.3998),weights(0,0,.6,.4)],
 ];
 for(const [stored,expected] of cases){
  const data=fixture(stored),text=exportWorkspace(data),saved=JSON.parse(text).data,label=JSON.stringify(stored);
  assert.deepEqual(saved.similarityWeights,expected,label);
  // Guards: the file is version 2 and the round trip is stable (it also was before round 3, with the raw numbers).
  assert.equal(saved.similarityWeightsVersion,2,label);
  const back=importWorkspace(text);
  assert.deepEqual(back,workspaceData(data),label);
  assert.equal(exportWorkspace(back),text,`${label}: export → import → export is identical`);
 }
 // Guard: weights already on the grid (including the defaults) survive the round trip exactly.
 for(const stored of [weights(.1,.2,.3,.4),weights(.25,.25,.25,.25),weights(.1,.4,.4,.1)]){
  const text=exportWorkspace(fixture(stored));
  assert.deepEqual(importWorkspace(text).similarityWeights,stored);
  assert.equal(exportWorkspace(importWorkspace(text)),text);
 }
});

test('Apply gives exactly the weights that export → import loads for the same shown values (round 4)',()=>{
 // Round 4 (2026-10-19): Apply snaps to the 0.1% step it shows, as loading does, so the weights in use right after Apply
 // are the weights a saved or exported workspace brings back. Before round 4 Apply used value / 100, which differs from the
 // loaded step for a value accepted just off the grid. Each case gives the draft typed into the panel and the steps it
 // shows (p %, loaded as p / 100):
 const draft=(name,description,cap,process)=>({name,description,cap,process});
 const cases=[
  // '0.09999999999' is 1e-10 steps below 0.1% and '49.90000000001' 1e-10 steps above 49.9%.
  // Before round 4: Apply 0.0009999999999000002 / 0 / .5 / 0.49900000000010003, loaded .001 / 0 / .5 / .499.
  [draft('0.09999999999','0','50','49.90000000001'),applied(.1,0,50,49.9)],
  // 0.1 + 0.2 = 0.30000000000000004 → 0.3%. Before round 4: Apply 0.0030000000000000005, loaded .003.
  [draft(0.1+0.2,'20','30','49.7'),applied(.3,20,30,49.7)],
  // 5e-10 steps off the grid: 12.3 / 20 / 30 / 37.7. Before round 4: Apply 0.1230000000005 / … / 0.3769999999995.
  [draft('12.30000000005','20','30','37.69999999995'),applied(12.3,20,30,37.7)],
  // 4e-10 steps off: 33.3 / 33.3 / 33.4 / 0.
  [draft('33.30000000004','33.29999999996','33.4','0'),applied(33.3,33.3,33.4,0)],
  // Guards (on the grid, identical before round 4): 33.3 → 33.3 / 100 = 0.33299999999999996; 0.1 → .001.
  [draft('33.3','33.3','33.4','0'),applied(33.3,33.3,33.4,0)],
  [draft('0.1','0','50','49.9'),applied(.1,0,50,49.9)],
 ];
 for(const [value,expected] of cases){
  const label=JSON.stringify(value),state=inspectWeightAllocation(value);
  assert.equal(state.valid,true,label);// guard
  assert.deepEqual(state.weights,expected,label);
  // The panel shows the applied weights as the same steps (guard), and loading them changes nothing.
  assert.deepEqual(weightPercentages(state.weights),weightPercentages(expected),label);
  assert.deepEqual(loaded(state.weights),state.weights,label);
  // Export → import: the file holds exactly the applied numbers, and they load back unchanged.
  const text=exportWorkspace(fixture(state.weights));
  assert.deepEqual(JSON.parse(text).data.similarityWeights,state.weights,label);
  assert.deepEqual(importWorkspace(text).similarityWeights,state.weights,label);
  assert.equal(exportWorkspace(importWorkspace(text)),text,label);// guard: stable
 }
 // Weights saved elsewhere that the panel shows as the same steps load as the weights Apply gives for those steps:
 // .0006 / 0 / .5 / .4994 shows 0.1 / 0 / 50 / 49.9 (first test) and loads as what Apply gives for '0.09999999999' /
 // '0' / '50' / '49.90000000001'; 1/3, 1/3, 1/3, 0 shows 33.4 / 33.3 / 33.3 / 0 and loads as Apply of '33.40000000004' /
 // '33.29999999996' / '33.3' / '0'.
 assert.deepEqual(inspectWeightAllocation(draft('0.09999999999','0','50','49.90000000001')).weights,loaded(weights(.0006,0,.5,.4994)));
 assert.deepEqual(inspectWeightAllocation(draft('33.40000000004','33.29999999996','33.3','0')).weights,importWorkspace(exportWorkspace(fixture(weights(1/3,1/3,1/3,0)))).similarityWeights);
 // Applying what the panel shows after loading gives the loaded weights back, also when the shown percentages pick up
 // float noise on the way (4e-10 steps here): sevenths 1/7, 2/7, 3/7, 1/7 → 14.3 / 28.6 / 42.8 / 14.3.
 const sevenths=loaded(weights(1/7,2/7,3/7,1/7)),shown=weightPercentages(sevenths);
 assert.deepEqual(sevenths,applied(14.3,28.6,42.8,14.3));// guard (round 3)
 const noisy=draft(shown.name+4e-11,shown.description-4e-11,shown.cap+4e-11,shown.process-4e-11);
 assert.deepEqual(inspectWeightAllocation(noisy).weights,sevenths);
});

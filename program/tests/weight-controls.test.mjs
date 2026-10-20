import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectWeightAllocation,weightPercentages} from '../public/weight-controls.mjs';
import {DEFAULT_WEIGHTS,createWeightedSimilarity} from '../public/weighted.mjs';
import {buildModel} from '../public/model.mjs';

const RANGE='Enter a number from 0 to 100 for each field.',STEP='Use steps of 0.1%.';
const draft=(name,description,cap,process)=>({name,description,cap,process});
const close=(actual,expected,message='')=>assert(typeof actual==='number'&&Math.abs(actual-expected)<1e-12,`${message} ${actual} ≈ ${expected}`);

test('percent editor applies only a complete 100% allocation',()=>{
 assert.deepEqual(weightPercentages(DEFAULT_WEIGHTS),{name:10,description:20,cap:30,process:40});
 const over=inspectWeightAllocation({name:'20',description:'40',cap:'40',process:'10'});
 assert.equal(over.valid,false);
 assert.match(over.message,/10% over/);
 const ready=inspectWeightAllocation({name:'20',description:'40',cap:'30',process:'10'});
 assert.equal(ready.valid,true);
 assert.deepEqual(ready.weights,{name:.2,description:.4,cap:.3,process:.1});
 assert.equal(inspectWeightAllocation({name:'100',description:'0',cap:'0',process:'0'}).valid,true);
 assert.equal(inspectWeightAllocation({name:'0',description:'0',cap:'0',process:'0'}).valid,false);
});

test('legacy ratios display as percentages that add to exactly 100',()=>{
 const display=weightPercentages({name:1,description:1,cap:1,process:0});
 assert.ok(Math.abs(Object.values(display).reduce((sum,n)=>sum+n,0)-100)<1e-9);
 assert.equal(inspectWeightAllocation(display).valid,true);
});

// Round 2 of the 2026-10-19 Similarity review: the inputs step by 0.1%, and a finer value is rejected, because it would
// display as 0% (or as a rounded percentage) yet still count as weighted, for example in the zero-text gate.
test('a weight that is not a multiple of 0.1% is rejected with "Use steps of 0.1%."',()=>{
 const offGrid=[
  draft('0.05','99.95','0','0'),// adds up to exactly 100, but 0.05 is half a step
  draft('10.05','19.95','30','40'),// 100 again; 10.05 and 19.95 are off the grid
  draft('33.33','33.33','33.34','0'),// 100 with two decimals
  draft('0.01','20','30','49.99'),
  draft('20','40','30','10.0001'),// 100.0001: the grid rule, not the total, is reported
 ];
 for(const value of offGrid){
  const state=inspectWeightAllocation(value);
  assert.deepEqual(state,{valid:false,total:null,message:STEP,weights:null},JSON.stringify(value));
 }
 // The step rule comes before the total: 0.05 + 50 = 50.05 would otherwise read "49.95% left to assign.".
 assert.equal(inspectWeightAllocation(draft('0.05','50','0','0')).message,STEP);
 assert.equal(inspectWeightAllocation(draft('0.05','100','0','0')).message,STEP,'not "0.05% over the limit."');
 // Numbers (not only input strings) follow the same rule.
 assert.equal(inspectWeightAllocation(draft(0.05,99.95,0,0)).message,STEP);
});

test('values on the 0.1% grid stay valid, including 33.3, 0.1 and 99.9',()=>{
 // 33.3 + 33.3 + 33.4 = 100 → weights 0.333 / 0.333 / 0.334 / 0.
 const thirds=inspectWeightAllocation(draft('33.3','33.3','33.4','0'));
 assert.equal(thirds.valid,true);assert.equal(thirds.message,'Ready to apply. Scores will update after you select Apply.');
 close(thirds.weights.name,.333);close(thirds.weights.description,.333);close(thirds.weights.cap,.334);assert.equal(thirds.weights.process,0);
 for(const value of [draft('0.1','99.9','0','0'),draft('99.9','0.1','0','0'),draft('0.1','0.2','0.3','99.4'),draft('12.3','45.6','7.8','34.3'),draft(0.3,0.3,0.3,99.1)]){
  const state=inspectWeightAllocation(value);assert.equal(state.valid,true,JSON.stringify(value));assert.equal(state.total,100);
 }
 // Every one-decimal split of 100% between two fields: k / 10 and (1000 − k) / 10 for k = 0 … 1000.
 for(let k=0;k<=1000;k++){
  const value=draft((k/10).toFixed(1),((1000-k)/10).toFixed(1),'0','0'),state=inspectWeightAllocation(value);
  assert.equal(state.valid,true,JSON.stringify(value));close(state.weights.name,k/1000,JSON.stringify(value));
 }
});

test('weightPercentages output is always accepted by the 0.1% rule',()=>{
 // Saved or legacy ratios i / 7 for i = 0 … 7 in every field (4,095 allocations, at least one above zero): the display
 // is whole tenths of a percent adding to 100, so applying it unchanged must never fail the new step rule.
 const ratios=[0,1,2,3,4,5,6,7].map(i=>i/7);
 for(const name of ratios)for(const description of ratios)for(const cap of ratios)for(const process of ratios){
  if(!name&&!description&&!cap&&!process)continue;
  const display=weightPercentages({name,description,cap,process});
  for(const value of Object.values(display))assert(Math.abs(value*10-Math.round(value*10))<1e-9,`${value} is a whole tenth`);
  const state=inspectWeightAllocation(display);
  assert.equal(state.valid,true,JSON.stringify({ratios:[name,description,cap,process],display,message:state.message}));
 }
});

test('empty, negative, over-100 and total messages are unchanged and take precedence as before',()=>{
 // Range problems are reported before the step rule, even when the bad value is also off the grid.
 for(const value of [draft('','0.05','50','49.95'),draft('-0.05','50','0','50.05'),draft('100.05','0','0','0'),draft('abc','0.05','50','49.95'),draft(null,'50','0','50'),draft(undefined,'50','0','50'),draft('-1','50','1','50'),draft('101','0','0','0')]){
  assert.deepEqual(inspectWeightAllocation(value),{valid:false,total:null,message:RANGE,weights:null},JSON.stringify(value));
 }
 // On-grid totals keep their messages: 100.1 → 0.1% over; 99.9 → 0.1% left; 0 → 100% left.
 const over=inspectWeightAllocation(draft('10.1','20','30','40'));
 assert.equal(over.valid,false);assert.equal(over.message,'0.1% over the limit. Lower another field.');close(over.total,100.1);
 const under=inspectWeightAllocation(draft('10','20','30','39.9'));
 assert.equal(under.valid,false);assert.equal(under.message,'0.1% left to assign.');close(under.total,99.9);
 assert.equal(inspectWeightAllocation(draft('0','0','0','0')).message,'100% left to assign.');
});

// Round 3 of the 2026-10-19 Similarity review: a value is accepted only within 1e-9 of a 0.1% step, and a positive value
// that rounds to 0 steps is rejected, so nothing the panel accepts can show as 0% yet count as weighted (zero-text gate).
// Saved and imported weights follow the same steps: tests/weight-loading.test.mjs.
test('a weight too small to show must not count as weighted',()=>{
 // In 0.1% steps (value × 10), each value below is positive but rounds to step 0, so the panel would show it as 0%:
 //  0.00000001 → 1e-7 steps: 1e-7 away from step 0 (more than 1e-9) and 0 steps → rejected by both rules;
 //  0.0000001  → 1e-6 steps: the same (the former 1e-6 tolerance let it through);
 //  1e-10      → 1e-9 steps: not more than the 1e-9 tolerance, so only the "positive but 0 steps" rule rejects it;
 //  1e-11      → 1e-10 steps: the same.
 // Next to 50 + 50 the total is 100 + value, inside the 1e-6 total tolerance, so before round 3 each allocation was valid
 // and the tiny field was shown as 0% while still carrying weight. Every field is checked, as strings and as numbers.
 for(const tiny of ['0.00000001','0.0000001','1e-10','1e-11',1e-8,1e-7,1e-10]){
  for(const value of [draft(tiny,'0','50','50'),draft('0',tiny,'50','50'),draft('50','0',tiny,'50'),draft('50','50','0',tiny),draft(tiny,'0','50','49.9')]){
   assert.deepEqual(inspectWeightAllocation(value),{valid:false,total:null,message:STEP,weights:null},JSON.stringify(value));
  }
 }
 // 10.00000005 → 100.0000005 steps and 39.99999995 → 399.9999995 steps: 5e-7 off a non-zero step, so only the 1e-9
 // tolerance rejects them (the total is exactly 100 and the former 1e-6 tolerance accepted both).
 assert.equal(inspectWeightAllocation(draft('10.00000005','20','30','39.99999995')).message,STEP);
 // The step rule still comes before the total. Without it: 1e-8 + 0 + 50 + 40 = 90.00000001 → "10% left to assign.";
 // 1e-8 + 0 + 60 + 50 = 110.00000001 → "10% over the limit. Lower another field."; 1e-10 alone → "100% left to assign.".
 assert.equal(inspectWeightAllocation(draft('0.00000001','0','50','40')).message,STEP);
 assert.equal(inspectWeightAllocation(draft('0.00000001','0','60','50')).message,STEP);
 assert.equal(inspectWeightAllocation(draft('1e-10','0','0','0')).message,STEP);
 // Range and empty problems still come first, also beside (or as) a tiny value: unchanged by round 3.
 for(const value of [draft('','0.00000001','50','50'),draft('0.00000001','','50','50'),draft('-0.00000001','0','50','50'),draft('-1e-10','0','50','50'),draft('100.00000001','0','0','0'),draft('1e-10','abc','50','50'),draft('1e-10',null,'50','50'),draft(undefined,'1e-10','50','50'),draft('1e-10','0','50','')]){
  assert.deepEqual(inspectWeightAllocation(value),{valid:false,total:null,message:RANGE,weights:null},JSON.stringify(value));
 }
 // Accepted, unchanged by round 3: the smallest step 0.1, thirds 33.3 and the largest step below 100, 99.9.
 const smallest=inspectWeightAllocation(draft('0.1','0','50','49.9'));
 assert.equal(smallest.valid,true);close(smallest.weights.name,.001);assert.equal(smallest.weights.description,0);close(smallest.weights.cap,.5);close(smallest.weights.process,.499);
 // 0.1 / 0 / 50 / 49.9 are already whole steps adding to 1,000, so the panel shows them unchanged (Name 0.1%, not 0%).
 assert.deepEqual(weightPercentages(smallest.weights),{name:.1,description:0,cap:50,process:49.9});
 for(const value of [draft('33.3','33.3','33.4','0'),draft('99.9','0.1','0','0'),draft('0','0.1','0','99.9'),draft(0.1,0,99.9,0),draft(33.3,33.3,33.3,0.1)]){
  const state=inspectWeightAllocation(value);assert.equal(state.valid,true,JSON.stringify(value));assert.equal(state.total,100);
 }
 // Unchanged by round 3: floating-point noise far inside 1e-9 steps is still accepted (0.1 + 0.2 = 0.30000000000000004
 // is 4e-16 steps off 3).
 assert.equal(inspectWeightAllocation(draft(0.1+0.2,'20','30','49.7')).valid,true);
 // Whatever the panel accepts shows every positive field as at least 0.1%. Candidates from far below half a step to just
 // above one step, each with name = value and process = 50 − value so the total is (about) 100.
 let accepted=0;
 for(const value of ['1e-12','1e-10','0.00000001','0.0000001','0.0000005','0.000001','0.00001','0.0001','0.001','0.01','0.04','0.05','0.06','0.0999999999','0.1','0.1000000001','0.10000005','0.2']){
  const allocation=draft(value,'0','50',String(50-Number(value))),state=inspectWeightAllocation(allocation);
  if(!state.valid)continue;
  accepted++;
  const shown=weightPercentages(state.weights);
  for(const key of Object.keys(allocation))if(Number(allocation[key])>0)assert(shown[key]>0,`${JSON.stringify(allocation)} is accepted but shows ${key} as ${shown[key]}%`);
 }
 assert(accepted>=2,'the loop is not vacuous: at least 0.1 / 49.9 and 0.2 / 49.8 are accepted');
 // Unchanged by round 3: the smallest accepted name weight, 0.1%, is visible and does hold back a pair whose names share no
 // word ("Alpha" / "Beta"; the description field is 0%), while a name entered as 0 does not.
 const app=(ID,Name)=>({ID,Name,Description:'shared warehouse','Business Capabilities':'B.06.1 Planning',Processes:'BBM PM T One L1'});
 const model=buildModel({apps:[app('A','Alpha'),app('B','Beta')],capabilityRows:[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Stock']],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','One']]});
 assert.equal(createWeightedSimilarity(model,smallest.weights).pair('A','B').reason,'Name has zero overlap; investigate the underlying function before treating this as an opportunity.');
 assert.equal(createWeightedSimilarity(model,inspectWeightAllocation(draft('0','0','50','50')).weights).pair('A','B').status,'confirmed');
});

test('the 1e-9 step tolerance holds from both sides: 5e-10 steps off is accepted, 2e-9 steps off is rejected',()=>{
 // Gap from the round-3 mutation review (accept/reject decisions unchanged by round 4). A value is accepted when value × 10
 // is within 1e-9 of a whole step, above or below it. Each draft adds up to 100 (to well within the 1e-6 total
 // tolerance), so the step rule alone decides. The distance from the step is in 0.1% steps (value × 10):
 //  0.10000000005 → 1.0000000005 (5e-10 above step 1)    0.09999999995 → 0.9999999995 (5e-10 below step 1)
 //  49.89999999995 → 498.9999999995 (5e-10 below 499)    49.90000000005 → 499.0000000005 (5e-10 above 499)
 //  12.30000000005 → 123.0000000005 (5e-10 above 123)    37.69999999995 → 376.9999999995 (5e-10 below 377)
 //  33.30000000004 → 333.0000000004 (4e-10 above 333)    33.29999999996 → 332.9999999996 (4e-10 below 333)
 const inside=[
  draft('0.10000000005','0','50','49.89999999995'),
  draft('0.09999999995','0','50','49.90000000005'),
  draft('12.30000000005','20','30','37.69999999995'),
  draft('33.30000000004','33.29999999996','33.4','0'),
  draft(0.10000000005,0,50,49.89999999995),
 ];
 for(const value of inside){
  const state=inspectWeightAllocation(value);
  assert.equal(state.valid,true,JSON.stringify(value));assert.equal(state.total,100,JSON.stringify(value));
  assert.equal(state.message,'Ready to apply. Scores will update after you select Apply.',JSON.stringify(value));
 }
 //  0.1000000002 → 1.000000002 (2e-9 above step 1)      0.0999999998 → 0.999999998 (2e-9 below step 1)
 //  49.8999999998 → 498.999999998 (2e-9 below 499)     49.9000000002 → 499.000000002 (2e-9 above 499)
 //  12.2999999998 → 122.999999998 (2e-9 below 123)     37.7000000002 → 377.000000002 (2e-9 above 377)
 // Each field is off by 2e-9 steps on its own as well (the other fields on the grid, total 100 + 2e-10).
 const outside=[
  draft('0.1000000002','0','50','49.8999999998'),
  draft('0.0999999998','0','50','49.9000000002'),
  draft('12.2999999998','20','30','37.7000000002'),
  draft(0.1000000002,0,50,49.8999999998),
  draft('0.1000000002','0','50','49.9'),
  draft('0.1','0.0999999998','50','49.8'),
  draft('0.1','0','50.0000000002','49.9'),
  draft('0.1','0','50','49.8999999998'),
 ];
 for(const value of outside){
  assert.deepEqual(inspectWeightAllocation(value),{valid:false,total:null,message:STEP,weights:null},JSON.stringify(value));
 }
});

test('Apply snaps each value to the 0.1% step it shows (round 4)',()=>{
 // Round 4 (2026-10-19): Apply gives Math.round(value × 10) / 10 / 100, so the applied weight is the shown step p as p / 100
 // (the number loading gives for the same step, tests/weight-loading.test.mjs). Before round 4 Apply gave value / 100, so
 // an accepted value just off a step was applied off the grid. p / 100 with p written as a literal is the same double as
 // Math.round(value × 10) / 10 / 100, because the literal and the quotient are both the double nearest to p.
 const applied=(name,description,cap,process)=>({name:name/100,description:description/100,cap:cap/100,process:process/100});
 // '0.09999999999' is 0.9999999999 steps (1e-10 below step 1) and '49.90000000001' is 499.0000000001 steps: shown as 0.1% and
 // 49.9%, applied as 0.001 and 0.499. Before round 4: 0.0009999999999000002 and 0.49900000000010003.
 const nearOne=inspectWeightAllocation(draft('0.09999999999','0','50','49.90000000001'));
 assert.equal(nearOne.valid,true);// guard
 assert.deepEqual(nearOne.weights,applied(.1,0,50,49.9));
 assert.equal(nearOne.weights.name,.001);assert.equal(nearOne.weights.process,.499);
 assert.deepEqual(weightPercentages(nearOne.weights),{name:.1,description:0,cap:50,process:49.9});// guard: the shown steps
 // 0.1 + 0.2 = 0.30000000000000004 (a number, 4e-16 steps off step 3) is applied as 0.3 / 100 = 0.003.
 // Before round 4: 0.0030000000000000005.
 const sum=inspectWeightAllocation(draft(0.1+0.2,'20','30','49.7'));
 assert.deepEqual(sum.weights,applied(.3,20,30,49.7));
 assert.equal(sum.weights.name,.003);
 // 5e-10 steps from the grid on both sides: 0.1 / 0 / 50 / 49.9 and 12.3 / 20 / 30 / 37.7.
 // Before round 4: 0.0010000000005 / 0.49899999999949995, 0.0009999999995 / 0.4990000000005 and 0.1230000000005 /
 // 0.3769999999995.
 assert.deepEqual(inspectWeightAllocation(draft('0.10000000005','0','50','49.89999999995')).weights,applied(.1,0,50,49.9));
 assert.deepEqual(inspectWeightAllocation(draft('0.09999999995','0','50','49.90000000005')).weights,applied(.1,0,50,49.9));
 assert.deepEqual(inspectWeightAllocation(draft('12.30000000005','20','30','37.69999999995')).weights,applied(12.3,20,30,37.7));
 // Guard (identical before round 4): values already on the grid are applied as p / 100. 33.3 / 100 = 0.33299999999999996
 // and 33.4 / 100 = 0.33399999999999996, the doubles next to .333 and .334.
 const thirds=inspectWeightAllocation(draft('33.3','33.3','33.4','0'));
 assert.deepEqual(thirds.weights,applied(33.3,33.3,33.4,0));
 assert.equal(thirds.weights.name,0.33299999999999996);assert.equal(thirds.weights.cap,0.33399999999999996);
 assert.deepEqual(inspectWeightAllocation(draft('100','0','0','0')).weights,{name:1,description:0,cap:0,process:0});
 // Every one-decimal split k / 10 and (1000 − k) / 10 for k = 0 … 1000, with 4e-10 steps of noise (4e-11 %) added to one
 // field and taken from the other (the total stays 100; none at k = 0 and 1000, where it would make a field negative or a
 // positive 0 step): Apply gives exactly k / 10 / 100 and (1000 − k) / 10 / 100, which the panel shows as k / 10 % and
 // (1000 − k) / 10 %. Before round 4 the noise reached the weights (k = 1 … 999 fail).
 for(let k=0;k<=1000;k++){
  const noise=k>0&&k<1000?(k%2?4e-11:-4e-11):0,name=k/10+noise,description=(1000-k)/10-noise;
  const state=inspectWeightAllocation(draft(name,description,0,0)),label=`${name} / ${description}`;
  assert.equal(state.valid,true,label);// guard
  assert.deepEqual(state.weights,applied(k/10,(1000-k)/10,0,0),label);
 }
});

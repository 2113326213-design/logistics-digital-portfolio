import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,normalizeWeights,textOverlap,textEvidence,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {similarityCSV} from '../public/exports.mjs';
const base={apps:[{ID:'A',Name:'Warehouse Camera',Description:'Track stock','Business Capabilities':'B.06.1 One;B.06.2 Two',Processes:'BBM PM T One L1'},{ID:'B',Name:'Warehouse Camera',Description:'Track stock','Business Capabilities':'B.06.1 One',Processes:'BBM PM T One L1'},{ID:'C',Name:'Other Tool',Description:'Manage packaging','Business Capabilities':'B.06.1 One;B.06.2 Two',Processes:'BBM PM T One L1'}],capabilityRows:[['B.06 Logistics','B.06.1 One','B.06.2 Two']],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','One']]};
test('four components use 10/20/30/40; a pair uses the lower complete direction',()=>{
 const model=buildModel(base),index=createWeightedSimilarity(model),r=index.compare('A','B');
 assert.ok(Math.abs(r.coverage-.85)<1e-10);assert.equal(index.compare('B','A').coverage,1);
 assert.equal(index.peers('A')[0].peer.app.id,'B');
 assert.ok(Math.abs(index.pair('A','B').coverage-.85)<1e-10);
 assert.ok(Math.abs(index.pair('B','A').coverage-.85)<1e-10);
 assert.equal(index.pair('A','B').status,'confirmed');
 const capOnly=createWeightedSimilarity(model,{name:0,description:0,cap:1,process:0});
 assert.equal(capOnly.compare('A','C').coverage,1);
 // Owner decision 2026-10-19 (a): only text fields with weight > 0 can hold a pair back. Here name and description
 // both weigh 0, so their zero overlap ("Warehouse Camera"/"Other Tool", "Track stock"/"Manage packaging") is ignored.
 // A and C both record B.06.1 and B.06.2: capability covers 2/2 = 1 in each direction, and with capability weight 1
 // each directional total is 1*1 = 1, so the pair is confirmed with min(1, 1) = 1 (it used to be investigation/null).
 assert.equal(capOnly.compare('C','A').coverage,1);
 assert.equal(capOnly.pair('A','C').status,'confirmed');
 assert.equal(capOnly.pair('A','C').zeroText,false);
 assert.equal(capOnly.pair('A','C').coverage,1);
 assert.equal(capOnly.pair('A','C').directionalMinimum,1);
 assert.deepEqual(r.components.map(c=>c.weight),[.1,.2,.3,.4]);
});
test('unknown remains N/A; zero weight excludes it without mutating source or resolving an unmatched L3V record',()=>{
 const data=structuredClone(base);data.apps[0].Processes='BBM PM T One L3V';data.apps[0].Description='';const before=JSON.stringify(data),model=buildModel(data);
 assert.equal(createWeightedSimilarity(model).compare('A','B').coverage,null);
 assert.equal(createWeightedSimilarity(model,{name:1,description:0,cap:0,process:0}).compare('A','B').coverage,1);
 assert.ok(model.issues.length);assert.equal(JSON.stringify(data),before);
});
test('a verified common lower level supplies a full weighted pair score without inventing unknown data',()=>{
 const data=structuredClone(base);data.apps=data.apps.slice(0,2);
 data.capabilityRows.push(['B.06.1.1 Detailed task']);
 data.apps[0]['Business Capabilities']='B.06.1.1 Detailed task';
 const before=JSON.stringify(data),index=createWeightedSimilarity(buildModel(data)),pair=index.pair('A','B');
 assert.equal(pair.status,'confirmed');assert.equal(pair.coverage,1);
 assert.equal(index.pair('B','A').coverage,1);
 const cap=pair.forward.components.find(c=>c.key==='cap');
 assert.equal(cap.score,1);assert.deepEqual(cap.result.comparisonLevels,[2]);assert.deepEqual(cap.result.deferredLevels,[3]);
 assert.equal(JSON.stringify(data),before);
 data.apps[0]['Business Capabilities']='B.06.99.1 Unknown';
 const unknown=createWeightedSimilarity(buildModel(data)).pair('A','B');assert.equal(unknown.coverage,null);assert.equal(unknown.status,'incomplete');
});
test('text overlap is deterministic; weights validate and normalize',()=>{
 assert.equal(textOverlap('Stock_Tracking','stock tracking'),1);assert.equal(textOverlap('stock tracking','stock monitoring'),1/3);assert.equal(textOverlap('','stock'),null);assert.equal(textOverlap('stock','packaging'),0);
 assert.deepEqual(textEvidence('stock tracking','stock monitoring'),{score:1/3,shared:['stock'],unionCount:3,targetOnly:['tracking'],peerOnly:['monitoring']});
 assert.deepEqual(textEvidence('','stock').score,null);
 assert.deepEqual(normalizeWeights({name:1,description:1,cap:1,process:1}),{name:.25,description:.25,cap:.25,process:.25});
 for(const bad of [-1,NaN,2])assert.throws(()=>normalizeWeights({...DEFAULT_WEIGHTS,name:bad}));assert.throws(()=>normalizeWeights({name:0,description:0,cap:0,process:0}));
});
test('description ignores English filler words while names retain domain tokens',()=>{
 assert.deepEqual(textEvidence('the E-Queue is here','an E Queue and there',{description:true}).shared,['e','queue']);
 assert.equal(textEvidence('the and is','an of',{description:true}).score,null);
 assert.ok(textEvidence('IT CAN AGV Karis','IT CAN AGV Karis',{description:true}).shared.includes('agv'));
 assert.ok(textEvidence('IT CAN TO','IT CAN TO',{description:true}).shared.includes('to'));
 assert.equal(textEvidence('to connect https://bosch.com/app','to compare https://bosch.com/other',{description:true}).shared.length,0);
 assert.ok(textEvidence('The Process and System','A Process of System',{description:true}).score===1);
 assert.ok(textEvidence('the E-Queue','the E-Queue').shared.includes('the'));
});
test('incomplete directions show known points and missing weight without a normalized estimate',()=>{
 // Legacy catalogue (before 2026-10-16) had no B.06.9, so ShzP_Karis' only capability record was unconfirmed.
 const current=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url))),old=JSON.parse(fs.readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
 const data={...current,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource};
 const model=buildModel(data),target=model.apps.find(a=>a.Name==='RBCC E-Queue system(Karis)');
 const index=createWeightedSimilarity(model),rbcw=model.apps.find(a=>a.Name==='RBCW E-Queue system'),shzp=model.apps.find(a=>a.Name==='ShzP_Karis');
 const confirmed=index.compare(target.id,rbcw.id),estimate=index.compare(target.id,shzp.id);
 assert.equal(confirmed.components.find(c=>c.key==='process').score,1);
 // Name (owner decision 2026-10-19 (b): a single letter is not a name word; round 2 keeps single digits and single
 // Han characters, and neither name has one): "RBCC E-Queue system(Karis)" ->
 // rbcc, queue, system, karis; "RBCW E-Queue system" -> rbcw, queue, system. Shared queue+system of 5 distinct = 2/5
 // (it was 3/6 while the "e" of E-Queue counted). Description: identical text = 1. Capability: B.06.5 vs B.06.3 = 0.
 // Directional total = .1*2/5 + .2*1 + .3*0 + .4*1 = .64 (was .1*3/6 + .2 + .4 = .65).
 assert.deepEqual(confirmed.components.map(c=>c.score),[2/5,1,0,1]);
 assert.ok(Math.abs(confirmed.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);
 assert.equal(estimate.coverage,null);
 assert.ok(estimate.knownPoints>0&&estimate.knownPoints<1);
 assert.ok(Math.abs(estimate.evidenceWeight-.7)<1e-10);
 assert.ok(Math.abs(estimate.missingWeight-.3)<1e-10);
 assert.equal(Object.hasOwn(estimate,'provisionalScore'),false);
 const p=index.pair(target.id,rbcw.id),q=index.pair(target.id,shzp.id);
 assert.equal(p.status,'incomplete');assert.equal(p.coverage,null);
 // Forward total .1*2/5 + .2 + .4 = .64, derived above.
 assert.ok(Math.abs(p.forward.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);assert.equal(p.reverse.coverage,null);
 const csv=similarityCSV([p,q],'weighted',data);
 assert.match(csv,/Confirmed pair similarity \(out of 100\)/);
 assert.match(csv,/A to B known weighted points/);
 assert.match(csv,/B to A missing weight/);
 assert.match(csv,/min\(A to B, B to A\)/);
 assert.doesNotMatch(csv,/Provisional estimate/);
 const noEvidence=createWeightedSimilarity(model,{name:0,description:0,cap:1,process:0}).compare(target.id,shzp.id);
 assert.equal(noEvidence.coverage,null);
 assert.equal(noEvidence.knownPoints,0);
 assert.equal(noEvidence.missingWeight,1);
 assert.equal(noEvidence.evidenceWeight,0);
});
test('with the business capability standard the Karis estimate is complete and the RBCW reverse direction stays incomplete',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
 const model=buildModel(data),find=name=>model.apps.find(a=>a.Name===name),target=find('RBCC E-Queue system(Karis)'),rbcw=find('RBCW E-Queue system'),shzp=find('ShzP_Karis');
 const index=createWeightedSimilarity(model),estimate=index.compare(target.id,shzp.id);
 // Name (owner decision 2026-10-19 (b): single letters are not name words; round 2 keeps single digits and single Han
 // characters, and neither name has one): "RBCC E-Queue system(Karis)" ->
 // rbcc, queue, system, karis; "ShzP_Karis" -> camelCase split "Shz P", so shz, karis once the single "p" is dropped.
 // Shared karis of 5 distinct words = 1/5 (it was 1/7 with "e" and "p"). Description 1/37 ("delivery"; descriptions
 // keep single characters and are unchanged), capability B.06.5 vs B.06.9 = 0, identical processes = 1.
 assert.deepEqual(estimate.components.map(c=>c.score),[1/5,1/37,0,1]);
 assert.ok(Math.abs(estimate.coverage-(.1/5+.2/37+.4))<1e-10);
 assert.equal(estimate.knownPoints,estimate.coverage);assert.equal(estimate.missingWeight,0);assert.ok(Math.abs(estimate.evidenceWeight-1)<1e-10);
 // The name score 1/5 is above zero, so the zero-text gate does not apply: confirmed with min of the two directions;
 // the reverse direction has the same Jaccard name/description scores and capability 0, process 1, so both are equal.
 const q=index.pair(target.id,shzp.id);assert.equal(q.status,'confirmed');assert.ok(Math.abs(q.coverage-(.1/5+.2/37+.4))<1e-10);
 // RBCW records "Register Truck L3", which matches two standard process codes: process stays unknown in that direction.
 // Forward: name 2/5 (rbcc/queue/system/karis vs rbcw/queue/system), description 1, capability 0, process 1 = .64.
 const p=index.pair(target.id,rbcw.id);assert.equal(p.status,'incomplete');assert.equal(p.coverage,null);assert.ok(Math.abs(p.forward.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);
 assert.equal(p.reverse.coverage,null);assert.equal(p.reverse.components.find(c=>c.key==='process').score,null);
 // Reverse known points: name Jaccard is symmetric (2/5, was 3/6 = .5), description 1, capability B.06.3 vs B.06.5 = 0.
 assert.ok(Math.abs(p.reverse.knownPoints-(.1*2/5+.2*1+.3*0))<1e-10);assert.ok(Math.abs(p.reverse.evidenceWeight-.6)<1e-10);assert.ok(Math.abs(p.reverse.missingWeight-.4)<1e-10);
 assert.equal(Object.hasOwn(p.reverse,'provisionalScore'),false);
 const noEvidence=createWeightedSimilarity(model,{name:0,description:0,cap:1,process:0}).compare(target.id,shzp.id);
 assert.equal(noEvidence.coverage,0);assert.equal(noEvidence.knownPoints,0);assert.equal(noEvidence.missingWeight,0);assert.equal(noEvidence.evidenceWeight,1);
 const csv=similarityCSV([p,q],'weighted',data);
 assert.match(csv,/B to A missing weight/);assert.doesNotMatch(csv,/Provisional estimate/);
});
test('weights survive workspace export/import and CSV includes reproducible contributions',()=>{
 const old=workspaceData(base);assert.deepEqual(old.similarityWeights,DEFAULT_WEIGHTS);
 const data={...old,similarityWeights:{name:1,description:0,cap:0,process:0}};
 assert.deepEqual(importWorkspace(exportWorkspace(data)).similarityWeights,data.similarityWeights);
 const pair=createWeightedSimilarity(buildModel(data),data.similarityWeights).pair('A','B');const csv=similarityCSV([pair],'weighted',data);
 assert.match(csv,/Name weight/);assert.match(csv,/100.0000/);assert.match(csv,/Excluded/);assert.match(csv,/distinct-word Jaccard/);
});

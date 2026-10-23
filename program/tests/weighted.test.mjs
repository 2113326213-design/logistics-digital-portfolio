import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,normalizeWeights,textOverlap,textEvidence,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {similarityCSV} from '../public/exports.mjs';
import {pairResultLabel} from '../public/pair-status.mjs';
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
 // V19.1 union (owner 2026-10-23, "也按并集"): RBCW E-Queue system records "BBM PM I2D Register Truck L3", which matches two
 // standard process codes. It has a level, so it is in LeanIX and no longer pending (until V19 it left RBCW's process
 // unknown, so this pair was incomplete with no reverse total). RBCW's other record, Manage Time-Windows L3
 // (M.I2D.010.020.030), is one of Karis' codes: process 1/1 from RBCW. The reverse total is .1*2/5 + .2*1 + .3*0 + .4*1 = .64
 // like the forward one (capability B.06.3 vs B.06.5 = 0 in this catalogue too), so the pair is confirmed at .64.
 assert.equal(p.status,'confirmed');assert.ok(Math.abs(p.coverage-.64)<1e-10);
 assert.ok(Math.abs(p.forward.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);assert.ok(Math.abs(p.reverse.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);
 assert.deepEqual(p.reverse.components.map(c=>c.score),[2/5,1,0,1]);assert.equal(p.reverse.missingWeight,0);
 // The incomplete pair in the CSV is Karis | ShzP_Karis: from Karis the capability weight .3 is missing (shown above), and from
 // ShzP_Karis, whose only capability record is unconfirmed in this catalogue, the same .3.
 assert.equal(q.status,'incomplete');assert.equal(q.coverage,null);assert.equal(q.reverse.coverage,null);assert.ok(Math.abs(q.reverse.missingWeight-.3)<1e-10);
 const csv=similarityCSV([p,q],'weighted',data);
 assert.match(csv,/Confirmed pair similarity \(out of 100\)/);
 assert.match(csv,/A to B known weighted points/);
 assert.match(csv,/B to A missing weight/);
 assert.match(csv,/min\(A to B, B to A\)/);
 assert.doesNotMatch(csv,/Provisional estimate/);
 const rows=csv.replace(String.fromCharCode(0xFEFF),'').split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1])),cell=(row,name)=>row[rows[0].indexOf(name)];
 assert.deepEqual(rows.slice(1).map(row=>[cell(row,'Application B'),cell(row,'Status'),cell(row,'A to B missing weight (%)'),cell(row,'B to A missing weight (%)')]),[['RBCW E-Queue system','Potential overlap','0.0000','0.0000'],['ShzP_Karis','Needs confirmation','30.0000','30.0000']]);
 const noEvidence=createWeightedSimilarity(model,{name:0,description:0,cap:1,process:0}).compare(target.id,shzp.id);
 assert.equal(noEvidence.coverage,null);
 assert.equal(noEvidence.knownPoints,0);
 assert.equal(noEvidence.missingWeight,1);
 assert.equal(noEvidence.evidenceWeight,0);
});
test('with the business capability standard the Karis estimate is complete; since V19.1 the RBCW reverse direction is complete too, and a record without a level still leaves it incomplete',()=>{
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
 // RBCW records "Register Truck L3", which matches two standard process codes.
 // V19.1 union (owner 2026-10-23, "也按并集"): the record has a level, so it is in LeanIX and no longer pending; until V19 it
 // left RBCW's process unknown and this direction incomplete. It adds no code, so RBCW's process codes are those of its
 // other record, Manage Time-Windows L3 (M.I2D.010.020.030), one of Karis' codes: process 1/1 from RBCW.
 // Both directions: name 2/5 (rbcc/queue/system/karis vs rbcw/queue/system), description 1, capability B.06.5 vs B.06.3 = 0,
 // process 1 = .64. The pair is confirmed at .64: a Potential overlap at 50, new with V19.1.
 assert.deepEqual(rbcw.inLeanix.map(x=>[x.raw,x.type,x.candidates.map(n=>n.id)]),[['BBM PM I2D Register Truck L3','流程名称对应多个编号',['M.I2D.010.020.010','M.I2D.030.070.020']]]);
 assert.deepEqual(rbcw.process,['M.I2D.010.020.030']);
 const p=index.pair(target.id,rbcw.id);assert.equal(p.status,'confirmed');assert.ok(Math.abs(p.coverage-.64)<1e-10);assert.equal(pairResultLabel(p,50),'Potential overlap');
 for(const direction of [p.forward,p.reverse]){assert.deepEqual(direction.components.map(c=>c.score),[2/5,1,0,1]);assert.ok(Math.abs(direction.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);assert.equal(direction.missingWeight,0);}
 // An incomplete direction still shows known points and missing weight: the same record without a level ("BBM PM I2D
 // Register Truck", Process level not specified) is still pending, so RBCW's process is unknown in that direction, as the
 // levelled record left it until V19.
 const unlevelled=structuredClone(data),record=unlevelled.apps.find(a=>a.Name==='RBCW E-Queue system');
 assert.equal(record.Processes,'BBM PM I2D Manage Time-Windows L3;BBM PM I2D Register Truck L3');record.Processes='BBM PM I2D Manage Time-Windows L3;BBM PM I2D Register Truck';
 const pendingModel=buildModel(unlevelled),pendingIndex=createWeightedSimilarity(pendingModel),id=name=>pendingModel.apps.find(a=>a.Name===name).id;
 const pending=pendingIndex.pair(id('RBCC E-Queue system(Karis)'),id('RBCW E-Queue system'));
 assert.equal(pending.status,'incomplete');assert.equal(pending.coverage,null);assert.ok(Math.abs(pending.forward.coverage-(.1*2/5+.2*1+.3*0+.4*1))<1e-10);
 assert.equal(pending.reverse.coverage,null);assert.equal(pending.reverse.components.find(c=>c.key==='process').score,null);
 // Reverse known points: name Jaccard is symmetric (2/5, was 3/6 = .5), description 1, capability B.06.3 vs B.06.5 = 0.
 assert.ok(Math.abs(pending.reverse.knownPoints-(.1*2/5+.2*1+.3*0))<1e-10);assert.ok(Math.abs(pending.reverse.evidenceWeight-.6)<1e-10);assert.ok(Math.abs(pending.reverse.missingWeight-.4)<1e-10);
 assert.equal(Object.hasOwn(pending.reverse,'provisionalScore'),false);
 const noEvidence=createWeightedSimilarity(model,{name:0,description:0,cap:1,process:0}).compare(target.id,shzp.id);
 assert.equal(noEvidence.coverage,0);assert.equal(noEvidence.knownPoints,0);assert.equal(noEvidence.missingWeight,0);assert.equal(noEvidence.evidenceWeight,1);
 const csv=similarityCSV([pending,p,q],'weighted',data);
 assert.match(csv,/B to A missing weight/);assert.doesNotMatch(csv,/Provisional estimate/);
 const rows=csv.replace(String.fromCharCode(0xFEFF),'').split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1])),cell=(row,name)=>row[rows[0].indexOf(name)];
 assert.deepEqual(rows.slice(1).map(row=>[cell(row,'Status'),cell(row,'B to A known weighted points (out of 100)'),cell(row,'B to A missing weight (%)')]),[['Needs confirmation','24.0000','40.0000'],['Potential overlap','64.0000','0.0000'],['Below threshold','42.5405','0.0000']]);
});
test('weights survive workspace export/import and CSV includes reproducible contributions',()=>{
 const old=workspaceData(base);assert.deepEqual(old.similarityWeights,DEFAULT_WEIGHTS);
 const data={...old,similarityWeights:{name:1,description:0,cap:0,process:0}};
 assert.deepEqual(importWorkspace(exportWorkspace(data)).similarityWeights,data.similarityWeights);
 const pair=createWeightedSimilarity(buildModel(data),data.similarityWeights).pair('A','B');const csv=similarityCSV([pair],'weighted',data);
 assert.match(csv,/Name weight/);assert.match(csv,/100.0000/);assert.match(csv,/Excluded/);assert.match(csv,/distinct-word Jaccard/);
});

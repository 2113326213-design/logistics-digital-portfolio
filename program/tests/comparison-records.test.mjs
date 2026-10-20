import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {comparisonRecordEvidence,renderComparisonRecords} from '../public/comparison-records.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
const model=buildModel(data);
// Catalogue in use until 2026-10-16; its outdated names still exercise the semantic hold with real records.
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const {importHistory,applicationEvents,...previous}=data,legacyData={...previous,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource},legacy=buildModel(legacyData);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function pair(model,a,b){
 const capIndex=createSimilarity(model,'cap'),processIndex=createSimilarity(model,'process');
 return {model,cap:capIndex.compare(a,b),capBack:capIndex.compare(b,a),process:processIndex.compare(a,b),processBack:processIndex.compare(b,a),escape:esc};
}
const id=name=>model.apps.find(app=>app.Name===name).id;

test('exact shared codes stay distinct from a parent-level match and do not invent missing Level 3',()=>{
 const arsIris=pair(model,id('ARS'),id('Iris'));
 const exact=comparisonRecordEvidence(model,arsIris.cap,arsIris.capBack);
 assert.deepEqual(exact.exact.map(node=>node.id),['B.06.5']);
 assert.deepEqual(exact.broader,[]);assert.deepEqual(exact.gaps,[]);
 const html=renderComparisonRecords(arsIris);
 assert.match(html,/Shared codes at compared level \(1\)/);assert.match(html,/B\.6\.5|B\.06\.5/);
 assert.doesNotMatch(html,/Level 3 missing|Shared codes cannot be fully confirmed/);
 const parent=pair(model,id('ARS'),id('AGR w/ Camera'));
 const broad=comparisonRecordEvidence(model,parent.cap,parent.capBack);
 assert.equal(broad.exact.length,0);assert.equal(broad.broader[0].node.id,'B.06.5');
 assert(broad.broader[0].details.some(node=>node.id==='B.06.5.1'));
 assert.match(renderComparisonRecords(parent),/Compared at Level 2; Level 3 detail deferred/);
 assert.match(renderComparisonRecords(parent),/Application B recorded/);
 assert.match(renderComparisonRecords(parent),/Deferred detail · not used in the score/);
 assert.equal(broad.gaps.length,0);
});

test('unconfirmed capability labels use the selected application source, not another application label',()=>{
 const apps=[{ID:'A',Name:'A','Business Capabilities':'B.06.99 My source <tag>',Processes:'BBM PM T Unknown <img> L1'},
 {ID:'B',Name:'B','Business Capabilities':'B.06.99 Another source label',Processes:''}];
 const fixture=buildModel({apps,capabilityRows:[],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','Known']]});
 const args=pair(fixture,'A','B');
 const evidence=comparisonRecordEvidence(fixture,args.cap,args.capBack);
 assert.equal(evidence.sides[0].unconfirmed[0].raw,'B.06.99 My source <tag>');
 assert.equal(evidence.sides[1].unconfirmed[0].raw,'B.06.99 Another source label');
 const html=renderComparisonRecords(args);
 assert.match(html,/Original record/);assert.match(html,/Reason:/);
 assert.match(html,/My source &lt;tag&gt;/);assert.match(html,/Unknown &lt;img&gt;/);
 assert.match(html,/No confirmed match in the current process catalogue/);
 assert.doesNotMatch(html,/<tag>|<img>|[\u4e00-\u9fff]/);
});

test('L0 detail gaps, out-of-scope capabilities and unmatched L3V records have specific neutral evidence',()=>{
 const apps=[{ID:'A',Name:'A','Business Capabilities':'B.05.2 Material Field Management',Processes:'BBM PM T Root L0;BBM PM T Variant L3V'},
 {ID:'B',Name:'B','Business Capabilities':'B.05.2 Material Field Management',Processes:'BBM PM T Root L0'}];
 const fixture=buildModel({apps,capabilityRows:[['B.05.2 Material Field Management']],processRows:[['T','L0','M.T','Root']]});
 const args=pair(fixture,'A','B'),evidence=comparisonRecordEvidence(fixture,args.process,args.processBack);
 assert.equal(evidence.exact.length,0);assert.equal(evidence.gaps.length,2);
 // L3V is Level 3 (owner decision 2026-10-19): with no standard L3 of that name the record is pending, like an unmatched L3.
 assert.deepEqual(evidence.sides[0].unconfirmed,[{raw:'BBM PM T Variant L3V',reason:'No confirmed match in the current process catalogue',candidates:[]}]);
 assert.deepEqual(evidence.sides[0].excluded,[]);assert.deepEqual(evidence.sides[1].unconfirmed,[]);
 assert.equal(args.process.status,'needs-review');assert.equal(args.process.coverage,null);
 const html=renderComparisonRecords(args);
 assert.match(html,/BBM PM T Variant L3V/);assert.match(html,/Records not yet confirmed \(1\)/);assert.match(html,/No confirmed match in the current process catalogue/);
 assert.doesNotMatch(html,/excluded from this L0–L3 comparison|L3V variant/);
 assert.match(html,/B\.05\.2 Material Field Management/);assert.match(html,/does not mean the code is incorrect/);
 assert.match(html,/More detail needed/);assert.match(html,/L0 process chain/);
 // With a standard L3 of the same name in its chain, the same L3V record is a confirmed Level 3 code.
 const named=buildModel({apps,capabilityRows:[['B.05.2 Material Field Management']],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.010','Stage'],['T','L2','M.T.010.010','Group'],['T','L3','M.T.010.010.010','Variant']]});
 const matched=pair(named,'A','B'),confirmed=comparisonRecordEvidence(named,matched.process,matched.processBack);
 assert.deepEqual(matched.process.target.known.map(node=>[node.id,node.level]),[['M.T.010.010.010',3]]);
 assert.deepEqual(confirmed.sides[0].unconfirmed,[]);
 assert.doesNotMatch(renderComparisonRecords(matched),/Records not yet confirmed \([1-9]/);
});

test('semantic pending records remain visible even when other confirmed codes match',()=>{
 const a=legacy.apps.find(app=>app.Name==='AR Stock Taking');
 const b=legacy.apps.find(app=>app.id!==a.id&&app.capLeaf.includes('B.06.1.4'));
 const args=pair(legacy,a.id,b.id),evidence=comparisonRecordEvidence(legacy,args.cap,args.capBack);
 assert(evidence.sides[0].unconfirmed.some(record=>record.raw.includes('B.06.4')&&record.reason.includes('business confirmation')));
 assert.equal(args.cap.coverage,null);
 const html=renderComparisonRecords(args);
 assert.match(html,/Inventory Management/);assert.match(html,/Storage Management/);
 assert.match(html,/Records not yet confirmed/);
 assert.doesNotMatch(html,/contributed|contribution|points earned/);
 // Business capability standard: B.06.4 is Inventory Management, so the record is confirmed and scored.
 const current=pair(model,a.id,b.id),confirmed=comparisonRecordEvidence(model,current.cap,current.capBack);
 assert.equal(b.Name,'AUTO-RACK');assert.deepEqual(confirmed.sides[0].unconfirmed,[]);
 assert.deepEqual(current.cap.target.known.map(node=>node.id),['B.06.1.4','B.06.4']);
 assert.equal(current.cap.coverage,0.5,'AUTO-RACK shares B.06.1.4, one of the two confirmed codes');
 assert.doesNotMatch(renderComparisonRecords(current),/business confirmation is pending/);
});

test('a capability code outside the standard stays an unconfirmed original record and is not credited to its parent',()=>{
 const args=pair(model,id('VMCN_Digital Dynamic Supermarket'),id('AR Stock Taking')),evidence=comparisonRecordEvidence(model,args.cap,args.capBack);
 assert.equal(model.caps.get('B.06.4.4').reference,undefined);assert.equal(model.caps.get('B.06.4').reference,'B.06.4 Inventory Management');
 assert.deepEqual(evidence.sides[0].unconfirmed,[{raw:'B.06.4.4 Physical Inventory Management',reason:'No confirmed standard code in the taxonomy',candidates:[]}]);
 assert(!evidence.shared.some(match=>match.node.id==='B.06.4')&&!evidence.broader.some(match=>match.node.id==='B.06.4'),'AR Stock Taking records B.06.4, but the unconfirmed child must not match it');
 assert.equal(args.cap.coverage,null);
 const html=renderComparisonRecords(args);
 assert.match(html,/Records not yet confirmed \(1\)/);assert.match(html,/B\.06\.4\.4 Physical Inventory Management/);
 const before=pair(legacy,id('VMCN_Digital Dynamic Supermarket'),id('AR Stock Taking'));
 assert(!comparisonRecordEvidence(legacy,before.cap,before.capBack).sides[0].unconfirmed.some(record=>record.raw.startsWith('B.06.4.4')),'the former catalogue listed B.06.4.4');
});

test('a missing taxonomy parent cannot be presented as a broader-level match',()=>{
 const fixture=buildModel({apps:[{ID:'A',Name:'A',Processes:'BBM PM T Broad L1'},
 {ID:'B',Name:'B',Processes:'BBM PM T Deep L3'}],capabilityRows:[],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','Broad'],['T','L3','M.T.1.1.1','Deep']]});
 const args=pair(fixture,'A','B');
 assert.equal(args.process.branches[0].common.length,0);
 assert.deepEqual(comparisonRecordEvidence(fixture,args.process,args.processBack).broader,[]);
});

test('a semantic concern stays attached only to the original name requiring confirmation',()=>{
 const a=structuredClone(legacyData.apps.find(app=>app.Name==='AR Stock Taking'));
 a['Business Capabilities']+=';B.06.4 Storage Management';
 const fixture=buildModel({...legacyData,apps:[a,{...structuredClone(a),ID:'Other',Name:'Other'}]});
 const args=pair(fixture,a.ID,'Other');
 const records=comparisonRecordEvidence(fixture,args.cap,args.capBack).sides[0].unconfirmed;
 assert(records.some(record=>record.raw.includes('Inventory Management')));
 assert(!records.some(record=>record.raw==='B.06.4 Storage Management'));
 // With the standard neither name is one of the seven held source names; the former catalogue name is only a label difference.
 const current=buildModel({...data,apps:[a,{...structuredClone(a),ID:'Other',Name:'Other'}]}),now=pair(current,a.ID,'Other');
 assert.deepEqual(comparisonRecordEvidence(current,now.cap,now.capBack).sides[0].unconfirmed,[]);
});

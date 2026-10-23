import {RECORDS_V916} from './records-v916.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {comparisonRecordEvidence,renderComparisonRecords,renderDeferredEvidence} from '../public/comparison-records.mjs';

const data=JSON.parse(readFileSync(RECORDS_V916));
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
 assert.match(renderComparisonRecords(parent),/<p class="comparison-level-note">Compared at Level 2<\/p>/);
 assert.match(renderComparisonRecords(parent),/Application B recorded/);
 // V9.15: the deferred detail is listed in How the score is calculated, not in the records box.
 assert.doesNotMatch(renderComparisonRecords(parent),/Deferred detail|detail deferred|not scored yet/);
 assert.match(renderDeferredEvidence(parent),/Deferred detail · not used in the score \(1\)[\s\S]*Capability · Compared at Level 2; Level 3 detail deferred/);
 assert.equal(broad.gaps.length,0);
});

test('unconfirmed capability labels use the selected application source, not another application label',()=>{
 // V19.1 union (owner 2026-10-23, "\u4e5f\u6309\u5e76\u96c6"): a process record with a level is in LeanIX and no longer pending, so the
 // unconfirmed process record is recorded without a level (it was "BBM PM T Unknown <img> L1").
 const apps=[{ID:'A',Name:'A','Business Capabilities':'B.06.99 My source <tag>',Processes:'BBM PM T Unknown <img>'},
 {ID:'B',Name:'B','Business Capabilities':'B.06.99 Another source label',Processes:''}];
 const fixture=buildModel({apps,capabilityRows:[],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','Known']]});
 const args=pair(fixture,'A','B');
 const evidence=comparisonRecordEvidence(fixture,args.cap,args.capBack);
 assert.equal(evidence.sides[0].unconfirmed[0].raw,'B.06.99 My source <tag>');
 assert.equal(evidence.sides[1].unconfirmed[0].raw,'B.06.99 Another source label');
 assert.deepEqual(comparisonRecordEvidence(fixture,args.process,args.processBack).sides[0].unconfirmed.map(record=>record.raw),['BBM PM T Unknown <img>']);
 const html=renderComparisonRecords(args);
 assert.match(html,/Original record/);assert.match(html,/Reason:/);
 assert.match(html,/My source &lt;tag&gt;/);assert.match(html,/Unknown &lt;img&gt;/);
 assert.match(html,/Process level not specified/);
 assert.doesNotMatch(html,/<tag>|<img>|[\u4e00-\u9fff]/);
});

test('L0 detail gaps, out-of-scope capabilities and unmatched L3V records have specific neutral evidence',()=>{
 const apps=[{ID:'A',Name:'A','Business Capabilities':'B.05.2 Material Field Management',Processes:'BBM PM T Root L0;BBM PM T Variant L3V'},
 {ID:'B',Name:'B','Business Capabilities':'B.05.2 Material Field Management',Processes:'BBM PM T Root L0'}];
 const fixture=buildModel({apps,capabilityRows:[['B.05.2 Material Field Management']],processRows:[['T','L0','M.T','Root']]});
 const args=pair(fixture,'A','B'),evidence=comparisonRecordEvidence(fixture,args.process,args.processBack);
 assert.equal(evidence.exact.length,0);assert.equal(evidence.gaps.length,2);
 // L3V is Level 3 (owner decision 2026-10-19): with no standard L3 of that name the record is unmatched, like an L3.
 // V19.1 union (owner 2026-10-23, "也按并集"): a record with a level is in LeanIX, so it is no longer pending in the
 // comparison (it was "Records not yet confirmed (1)" with status needs-review). It adds no code, so both directions rest
 // on the shared L0 chain alone: "More detail needed", not "Needs confirmation".
 assert.deepEqual(fixture.apps.find(app=>app.id==='A').inLeanix.map(record=>[record.raw,record.level]),[['BBM PM T Variant L3V',3]]);
 assert.deepEqual(evidence.sides[0].unconfirmed,[]);
 assert.deepEqual(evidence.sides[0].excluded,[]);assert.deepEqual(evidence.sides[1].unconfirmed,[]);
 assert.equal(args.process.status,'insufficient-depth');assert.equal(args.process.coverage,null);
 const html=renderComparisonRecords(args);
 assert.doesNotMatch(html,/BBM PM T Variant L3V|Records not yet confirmed/);
 assert.doesNotMatch(html,/excluded from this L0–L3 comparison|L3V variant/);
 assert.match(html,/B\.05\.2 Material Field Management/);assert.match(html,/does not mean the code is incorrect/);
 assert.match(html,/More detail needed/);assert.match(html,/L0 process chain/);
 // L3V is L3 here too: the same record marked L3 gives the same evidence and status.
 const asL3=apps.map(app=>({...app,Processes:app.Processes.replace('Variant L3V','Variant L3')}));
 const l3Fixture=buildModel({apps:asL3,capabilityRows:[['B.05.2 Material Field Management']],processRows:[['T','L0','M.T','Root']]}),l3Args=pair(l3Fixture,'A','B');
 assert.deepEqual(comparisonRecordEvidence(l3Fixture,l3Args.process,l3Args.processBack).sides.map(side=>side.unconfirmed),[[],[]]);
 assert.equal(l3Args.process.status,args.process.status);
 // Recorded without a level the same name is still pending, with its own neutral reason.
 const noLevel=apps.map(app=>({...app,Processes:app.Processes.replace('Variant L3V','Variant')}));
 const pendingFixture=buildModel({apps:noLevel,capabilityRows:[['B.05.2 Material Field Management']],processRows:[['T','L0','M.T','Root']]}),pendingArgs=pair(pendingFixture,'A','B');
 assert.deepEqual(comparisonRecordEvidence(pendingFixture,pendingArgs.process,pendingArgs.processBack).sides[0].unconfirmed,[{raw:'BBM PM T Variant',reason:'Process level not specified',candidates:[]}]);
 assert.equal(pendingArgs.process.status,'needs-review');assert.equal(pendingArgs.process.coverage,null);
 assert.match(renderComparisonRecords(pendingArgs),/Records not yet confirmed \(1\)[\s\S]*BBM PM T Variant[\s\S]*Process level not specified/);
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
 // Re-derived 2026-10-21: the LeanIX export of 2026-10-20 replaced B.06.4.4 with the standard B.06.4 in VMCN_Digital Dynamic Supermarket, and no current application
 // records an outside code under a standard parent, so the fixture is the current data with that application carrying its former record (2026-08-25 export) again.
 const former='B.06.4.4 Physical Inventory Management',apps=data.apps.map(app=>app.Name==='VMCN_Digital Dynamic Supermarket'?{...app,'Business Capabilities':app['Business Capabilities'].replace('B.06.4 Inventory Management',former)}:app);
 assert.equal(model.caps.get('B.06.4.4'),undefined,'the current export no longer records B.06.4.4');
 const fixture=buildModel({...data,apps}),args=pair(fixture,id('VMCN_Digital Dynamic Supermarket'),id('AR Stock Taking')),evidence=comparisonRecordEvidence(fixture,args.cap,args.capBack);
 assert.equal(fixture.caps.get('B.06.4.4').reference,undefined);assert.equal(fixture.caps.get('B.06.4').reference,'B.06.4 Inventory Management');
 assert.deepEqual(evidence.sides[0].unconfirmed,[{raw:'B.06.4.4 Physical Inventory Management',reason:'No confirmed standard code in the taxonomy',candidates:[]}]);
 assert(!evidence.shared.some(match=>match.node.id==='B.06.4')&&!evidence.broader.some(match=>match.node.id==='B.06.4'),'AR Stock Taking records B.06.4, but the unconfirmed child must not match it');
 assert.equal(args.cap.coverage,null);
 const html=renderComparisonRecords(args);
 assert.match(html,/Records not yet confirmed \(1\)/);assert.match(html,/B\.06\.4\.4 Physical Inventory Management/);
 const formerCatalogue=buildModel({...legacyData,apps}),before=pair(formerCatalogue,id('VMCN_Digital Dynamic Supermarket'),id('AR Stock Taking'));
 assert(!comparisonRecordEvidence(formerCatalogue,before.cap,before.capBack).sides[0].unconfirmed.some(record=>record.raw.startsWith('B.06.4.4')),'the former catalogue listed B.06.4.4');
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

test('fully confirmed pairs do not render empty unconfirmed panels',()=>{
 const args=pair(model,id('CGQB_Logistic_system'),id('CGQB_Logistic_system_Q'));
 for(const dimension of [comparisonRecordEvidence(model,args.cap,args.capBack),comparisonRecordEvidence(model,args.process,args.processBack)]){
  assert.equal(dimension.sides.reduce((sum,side)=>sum+side.unconfirmed.length,0),0);
 }
 const html=renderComparisonRecords(args);
 assert.doesNotMatch(html,/Records not yet confirmed|No unconfirmed records|pending-record-columns/);
 assert.match(html,/<h5>Capability<\/h5>/);assert.match(html,/<h5>Process<\/h5>/);
 assert.match(html,/Shared codes at compared level/);
});

test('missing source registrations remain explicit when there are no pending records',()=>{
 const fixture=buildModel({apps:[{ID:'A',Name:'No registrations'},{ID:'B',Name:'Also empty'}],capabilityRows:[],processRows:[]});
 const html=renderComparisonRecords(pair(fixture,'A','B'));
 assert.equal((html.match(/No business capability records supplied/g)||[]).length,2);
 assert.equal((html.match(/No process records supplied/g)||[]).length,2);
 assert.equal((html.match(/This comparison has missing data/g)||[]).length,4);
 assert.doesNotMatch(html,/Records not yet confirmed|No unconfirmed records|No recorded differences|Nothing open/);
});

test('pending evidence is collapsed with a count and preserves original records, reasons and ownership',()=>{
 const fixture=buildModel({apps:[
  {ID:'A',Name:'App <A>','Business Capabilities':'B.06.99 Original <source>'},
  {ID:'B',Name:'App B','Business Capabilities':'B.06.1 Known'}
 ],capabilityRows:[['B.06.1 Known']],processRows:[]});
 const args=pair(fixture,'A','B'),html=renderComparisonRecords(args);
 assert.match(html,/<details class="comparison-record-disclosure unconfirmed-records" id="focusRecordsCapabilityPending" ><summary>Records not yet confirmed \(1\)/);
 assert.match(html,/Application A · App &lt;A&gt; \(1\)/);
 assert.match(html,/B\.06\.99 Original &lt;source&gt;/);
 assert.match(html,/No confirmed standard code in the taxonomy/);
 assert.match(html,/pending-record-columns has-one-side/);
 assert.doesNotMatch(html,/No unconfirmed records/);
 const reopened=renderComparisonRecords({...args,opened:new Set(['focusRecordsCapabilityPending'])});
 assert.match(reopened,/id="focusRecordsCapabilityPending" open>/);
});

test('long shared lists show five records first and retain every remaining record in a disclosure',()=>{
 const values=Array.from({length:7},(_,i)=>`B.06.${i+1} Capability ${i+1}`);
 const fixture=buildModel({apps:[
  {ID:'A',Name:'A','Business Capabilities':values.join(';')},
  {ID:'B',Name:'B','Business Capabilities':values.join(';')}
 ],capabilityRows:values.map(value=>[value]),processRows:[]});
 const args=pair(fixture,'A','B'),snapshot=JSON.stringify(args),html=renderComparisonRecords(args);
 assert.equal(comparisonRecordEvidence(fixture,args.cap,args.capBack).shared.length,7);
 const initial=html.match(/Shared codes at compared level \(7\)<\/h6><ul class="comparison-code-list">([\s\S]*?)<\/ul>/)?.[1];
 assert(initial);assert.equal((initial.match(/<li>/g)||[]).length,5);
 const overflow=html.match(/<details class="comparison-record-disclosure comparison-record-more" id="focusRecordsCapabilityMoreShared" ><summary>Show 2 more shared codes<\/summary>([\s\S]*?)<\/details>/)?.[1];
 assert(overflow);assert.equal((overflow.match(/<li>/g)||[]).length,2);
 assert.match(overflow,/Capability 6/);assert.match(overflow,/Capability 7/);
 assert.equal(JSON.stringify(args),snapshot,'rendering must not mutate scores, evidence or model data');
 const reopened=renderComparisonRecords({...args,opened:new Set(['focusRecordsCapabilityMoreShared'])});
 assert.match(reopened,/id="focusRecordsCapabilityMoreShared" open>/);
});

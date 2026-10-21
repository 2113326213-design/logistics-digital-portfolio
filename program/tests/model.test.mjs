import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildModel,columns} from '../public/model.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
const m=buildModel(data);
assert.equal(m.apps.length,76);
for(const view of ['cap','process'])for(const expanded of [new Set(),new Set((view==='cap'?m.caps:m.procs).keys())]){
 const cs=columns(m,view,expanded);
 assert.equal(new Set(cs.flatMap(c=>c.apps.map(a=>a.id))).size,76);
}
const broad={ID:'a',Name:'Same name', 'Business Capabilities':'B.06.2 Planning',Processes:''};
const fine={ID:'b',Name:'Same name', 'Business Capabilities':'B.06.2 Planning;B.06.2.1 Detail',Processes:'Unmatched custom step'};
const fixture=buildModel({apps:[broad,fine],capabilityRows:[],processRows:[]});
const cs=columns(fixture,'cap',new Set(['B.06.2']));
assert.deepEqual(cs.find(c=>c.direct).apps.map(a=>a.id),['a']);
assert.deepEqual(cs.find(c=>c.id==='B.06.2.1').apps.map(a=>a.id),['b']);
assert.deepEqual(fixture.issues.map(i=>i.appId),['b']);
assert.throws(()=>buildModel({apps:[broad,broad],capabilityRows:[],processRows:[]}),/ID 重复/);
// 2026-10-21 (V9.16 export): VMCN_CONNEX's HC records were replaced by B.06.2.3/B.06.2.6, so the only HC code left is Wuj HK AGV's HC.02.4.5.
assert.ok(m.caps.has('HC.02.4.5'));
assert.ok(!m.issues.some(i=>i.type.startsWith('业务能力')));
assert.equal(m.caps.get('B.06.8.2').label,m.caps.get('B.06.8.2').reference);
assert.equal(m.caps.get('B.06.8.2').labels.length,2);
// Legacy catalogue (before 2026-10-16) had outdated and truncated names: 24 codes differed from the application records.
// 2026-10-21 (V9.16 export): 23 — RBCD LOG Xone no longer registers B.06.1.5, the only record whose name differed from the legacy entry.
const old=JSON.parse(fs.readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url))),legacy=buildModel({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});
assert.equal(legacy.conflicts.length,23);assert.ok(!legacy.conflicts.some(c=>c.id==='B.06.1.5'),'B.06.1.5 is no longer registered by any application');
for(const n of legacy.caps.values())if(n.reference)assert.equal(n.label,n.reference);
assert.equal(legacy.caps.get('B.06.5').label,'B.06.5 Intra Logistics Management');assert.equal(legacy.caps.get('HC.02.4.5').reference,undefined);
// Business capability standard: only 360° Supplier dashboard's two "... Mgmt." records still differ (B.06.8.1, B.06.8.2).
assert.equal(m.conflicts.length,2);assert.deepEqual(m.conflicts.map(c=>c.id).sort(),['B.06.8.1','B.06.8.2']);
assert.equal(m.caps.get('B.06.5').label,'B.06.5 Material Flow Orchestration');
// HC capabilities belong to another department (owner decision 2026-10-19): the catalogue has no HC entry, so
// an HC code exists only through an application's own record, with no reference name, and the applications' HC records are kept.
// 2026-10-21 (V9.16 export): re-derived on HC.02.4.5 (Wuj HK AGV); VMCN_CONNEX's HC.06.01.01/HC.06.01.05 were replaced by B.06.2.3/B.06.2.6
// in the export (import event 2026-10-21), so HC.06.1.1 is now a removed entry that no application records.
assert.deepEqual(data.capabilityRows.flat().filter(cell=>cell&&/^HC\./.test(cell)),[],'no HC entry in the capability rows');
assert.deepEqual([...m.caps.values()].filter(n=>n.reference&&n.id.startsWith('HC.')).map(n=>n.id),[]);
assert.equal(m.caps.get('HC.02.4.5').reference,undefined);assert.deepEqual(m.caps.get('HC.02.4.5').labels,['HC.02.04.05 Transportation Management']);assert.equal(m.caps.get('HC.02.4.5').label,'HC.02.04.05 Transportation Management');
assert.ok(!m.caps.has('HC.06.2.1'),'a removed HC entry that no application records does not appear');
assert.ok(!m.caps.has('HC.06.1.1')&&!m.caps.has('HC.06.1.5'),'VMCN_CONNEX\'s former HC records are gone with the export');
assert.deepEqual(m.apps.find(a=>a.Name==='VMCN_CONNEX').rawCap,['B.06.2.3 Demand Planning','B.06.2.6 Procurement Planning']);
assert.deepEqual(m.apps.find(a=>a.Name==='VMCN_CONNEX').rawCap.filter(raw=>raw.startsWith('HC.')),[]);
assert.deepEqual(m.apps.find(a=>a.Name.startsWith('Wuj HK AGV')).rawCap.filter(raw=>raw.startsWith('HC.')),['HC.02.04.05 Transportation Management']);
for(const n of m.caps.values())if(n.reference)assert.equal(n.label,n.reference);
assert.ok(m.procs.get('M.Q2E.130.020.010').ambiguous);
const autoRack=m.apps.find(a=>a.Name==='AUTO-RACK');
assert.ok(autoRack.process.includes('M.I2D.010.050.010'),'reviewed exact L3V mapping is applied');
assert.ok(autoRack.rawProcess.includes('BBM PM I2D Putaway of Automated Goods Receipt (AGR) L3V'),'source evidence remains unchanged');
assert.ok(m.issues.some(i=>i.value==='BBM PM I2D Putaway to Automated Warehouse L3V'),'an L3V record with no standard L3 of that name stays unmatched');
const supermarket=m.apps.find(a=>a.Name==='VMCN_Digital Dynamic Supermarket');
const planning=m.apps.find(a=>a.Name==='VMCN_iSCMP: Intelligent Supply Chain management platform');
assert.ok(supermarket.process.includes('M.M2S.020.010.010'));
assert.ok(planning.process.includes('M.P2F.010.040.090'));
assert.ok(supermarket.rawProcess.includes('BBM PM M2S Check feasibility production schedule L3'));
assert.ok(planning.rawProcess.includes('BBM PM P2F Handling the unconstrained demand plan L3'));
console.log('PASS: application preservation, mixed depth, namespace separation, duplicate IDs, label conflicts (23 legacy, 2 standard), no HC catalogue entries with application HC records kept, reviewed mappings and unmatched L3V records.');

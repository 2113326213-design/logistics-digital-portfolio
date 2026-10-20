// Comparison records box for an application whose capabilities are all outside B.06 (2026-10-20): its pairs show the
// outside-scope reason, as the pair status does, and never "More detail needed"; real depth gaps keep that heading.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {comparisonRecordEvidence,renderComparisonRecords} from '../public/comparison-records.mjs';
import {pairResultLabel,pairStatusReason} from '../public/pair-status.mjs';
import {scopeReason} from '../public/display.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),cap=createSimilarity(model,'cap'),process=createSimilarity(model,'process');
const weighted=createWeightedSimilarity(model,data.similarityWeights||DEFAULT_WEIGHTS);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const app=name=>model.apps.find(a=>a.Name===name);
const render=(a,b)=>renderComparisonRecords({model,cap:cap.compare(a.id,b.id),capBack:cap.compare(b.id,a.id),process:process.compare(a.id,b.id),processBack:process.compare(b.id,a.id),escape:esc});
const capabilityPart=html=>html.split('<h5>Process</h5>')[0];
const scrap=app('RBCD LOM Scrap Management Platform');

test('the only in-scope application with capabilities only outside B.06 is RBCD LOM Scrap Management Platform (B.14.09.1)',()=>{
 const outside=model.apps.filter(a=>!scopeReason(a)&&a.cap.length&&a.cap.every(id=>!(id==='B.06'||id.startsWith('B.06.'))));
 assert.deepEqual(outside.map(a=>a.Name),['RBCD LOM Scrap Management Platform']);
 assert.deepEqual(scrap.rawCap,['B.14.09.1 Waste Management']);
});

test('its pairs show "Not compared · outside the B.06 scope" with the pair-status reason, never "Peer records are not detailed enough"',()=>{
 const peers=weighted.pairPeers(scrap.id).filter(pair=>!scopeReason(pair.peer.app)),rootOnly=[];
 assert(peers.length>=70);
 for(const pair of peers){
  const html=capabilityPart(render(scrap,pair.peer.app)),name=pair.peer.app.Name;
  assert.doesNotMatch(html,/Peer records are not detailed enough/,name);
  const evidence=comparisonRecordEvidence(model,cap.compare(scrap.id,pair.peer.app.id),cap.compare(pair.peer.app.id,scrap.id));
  // A remaining gap is the other application's own registration (only the B.06 root), never the Scrap platform's.
  assert(evidence.gaps.every(gap=>/records only the B\.06 root/.test(gap.reason)),name);
  if(!evidence.gaps.length)assert.doesNotMatch(html,/More detail needed/,name);else rootOnly.push(name);
  if(evidence.notCompared.length&&!evidence.gaps.length){
   assert.match(html,/Not compared · outside the B\.06 scope \(\d+\)/,name);
   const reason='RBCD LOM Scrap Management Platform records capabilities only outside the B.06 comparison scope (B.14.09.1 Waste Management). This does not mean the code is incorrect.';
   assert(evidence.notCompared.every(gap=>gap.reason===reason),name);
   // Unconfirmed records take precedence in the pair status (existing rule), e.g. VMCN_Digital Dynamic Supermarket.
   if(evidence.sides.some(side=>side.unconfirmed.length))assert.match(pairStatusReason(pair,50,scopeReason),/^Capability needs confirmation\./,name);
   else assert(pairStatusReason(pair,50,scopeReason).includes(reason),`${name}: the pair status gives the same reason`);
  }
  // The Scrap platform's own outside record is always listed; the peer may add outside records of its own.
  assert.match(html,/Records outside this comparison \(\d+\)<\/summary>[\s\S]*B\.14\.09\.1 Waste Management/,name);
 }
});

test('the example pair: Scrap platform vs CGQB_Logistic_system names the outside record and lists the B.06 codes that were not compared',()=>{
 const other=app('CGQB_Logistic_system'),evidence=comparisonRecordEvidence(model,cap.compare(scrap.id,other.id),cap.compare(other.id,scrap.id));
 assert.deepEqual(evidence.notCompared.map(gap=>[gap.side,gap.items.map(node=>node.id)]),[[1,['B.06.4.1','B.06.4.2']],[1,['B.06.5.1','B.06.5.2','B.06.5.3']]]);
 const html=capabilityPart(render(scrap,other));
 assert.match(html,/<summary>Not compared · outside the B\.06 scope \(2\)<\/summary>/);
 assert.match(html,/B\.14\.09\.1 Waste Management/);
});

test('a real depth gap still says "More detail needed", and scores and labels do not change',()=>{
 let found=null;
 for(const a of model.apps){if(scopeReason(a))continue;for(const pair of weighted.pairPeers(a.id)){const b=pair.peer.app;if(scopeReason(b))continue;const evidence=comparisonRecordEvidence(model,cap.compare(a.id,b.id),cap.compare(b.id,a.id));if(evidence.gaps.length){found={a,b,evidence};break;}}if(found)break;}
 assert(found,'the bundled data has a pair with a real depth gap');
 assert.match(capabilityPart(render(found.a,found.b)),/More detail needed for this comparison/);
 assert.deepEqual(found.evidence.notCompared,[]);
 const pair=weighted.pairPeers(scrap.id).find(p=>p.peer.app.Name==='CGQB_Logistic_system');
 assert.equal(pairResultLabel(pair,50),'Needs confirmation');assert.equal(pair.coverage,null);
});

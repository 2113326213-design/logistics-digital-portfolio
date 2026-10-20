// Owner decision 2026-10-19 (c): a pair labelled Review needed (every weighted name/description field shares no word,
// capability and process evidence complete in both directions, at least one shared code) also shows its code evidence:
// the lower of the two directional weighted totals, which then holds only capability and process points (out of 100).
// The label does not change and there is still no pair score.
// Round 2 (2026-10-19): the reason sentence names only the weighted code fields ("from capabilities and processes" /
// "from capabilities" / "from processes"), and the compare-dialog pair row shows the evidence as
// <small class="compare-pair-code">Code evidence N / 100</small> inside its <strong> instead of " · Code evidence".
// Expected values are derived by hand from the fixtures below or, for the bundled data, from the capability/process
// coverage engine (createSimilarity) and an independent recount that re-implements the name/description tokenizer and
// the zero-text gate; they are never read back from codeEvidenceScore.
// Owner request 2026-10-20 (one status rule everywhere): Review needed is now labelled No complete score; a confirmed
// pair below the threshold is Below threshold (was Not similar); an investigation pair whose weighted code components
// are all complete with zero common codes is No shared registrations (was Not similar). The CSV code evidence column
// is renamed 'No complete score: code evidence (out of 100)'; a pair without a complete score shows "—" instead of
// Unavailable in the score box. Code evidence values are unchanged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold} from '../public/weighted.mjs';
import * as pairStatus from '../public/pair-status.mjs';
import {similarityCSV} from '../public/exports.mjs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {scopeReason} from '../public/display.mjs';

// Namespace import: without the change the two new exports are missing, and each test then fails on its own
// instead of the whole file failing to load.
const {pairResultLabel,pairStatusReason}=pairStatus;
const codeEvidenceScore=pair=>pairStatus.codeEvidenceScore(pair);
const formatCodeEvidence=value=>pairStatus.formatCodeEvidence(value);
const close=(actual,expected,message='')=>assert(typeof actual==='number'&&Math.abs(actual-expected)<1e-12,`${message} ${actual} ≈ ${expected}`);
const PREFIX='No shared words in names or descriptions; compare the recorded functions.';
const withCode=(points,prefix=PREFIX,codes='capabilities and processes')=>`${prefix} Code evidence ${points} / 100 from ${codes}; not a pair score.`;
const CODE_COLUMN='No complete score: code evidence (out of 100)';// was 'Review needed code evidence (out of 100)'
const GATE_COLUMN='Zero overlap in all weighted name/description fields';
const pairCode=points=>`No complete score<small class="compare-pair-code">Code evidence ${points} / 100</small>`;
// Score box of a pair without a complete score (2026-10-20: "—" replaces Unavailable), as a regex source.
const NO_SCORE='<strong><span class="comparison-no-score" title="No complete score">—<\\/span><\\/strong>';
// A also records process M.U.1, which B does not (used by the asymmetric fixtures below).
const EXTRA_PROCESS={Processes:'BBM PM T One L1;BBM PM U Other one L1'};
const PROCESS_ONLY={name:.2,description:.2,cap:0,process:.6};// sums to 1, so the normalized weights are the same

// Synthetic fixture: both applications record capability B.06.1 and process M.T.1 unless a case overrides them.
const capabilityRows=[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Stock'],['B.06 Logistics','B.06.2 Transport','B.06.2.1 Truck']];
const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['U','L0','M.U','Other'],['U','L1','M.U.1','Other one']];
const fixtureApp=(ID,overrides={})=>({ID,Name:'Shared '+ID,Description:'shared warehouse','Business Capabilities':'B.06.1 Planning',Processes:'BBM PM T One L1',...overrides});
const ZERO_A={Name:'Alpha',Description:'orchard'},ZERO_B={Name:'Beta',Description:'tunnel'};// no shared name or description word
const OTHER_CODES={'Business Capabilities':'B.06.2 Transport',Processes:'BBM PM U Other one L1'};// shares no code with the default
const fixtureModel=(a={},b={})=>buildModel({apps:[fixtureApp('A',a),fixtureApp('B',b)],capabilityRows,processRows});
const fixture=(a={},b={},weights)=>createWeightedSimilarity(fixtureModel(a,b),weights).pair('A','B');
const FIXTURE_DATA={source:'fixture',taxonomySource:'fixture'};
function records(csv){
 const rows=csv.slice(1).split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
 assert(rows.slice(1).every(row=>row.length===rows[0].length),'every exported row must align with its header');
 return {header:rows[0],rows:rows.slice(1).map(row=>Object.fromEntries(rows[0].map((header,i)=>[header,row[i]])))};
}

test('code evidence is the lower directional total of a No complete score pair and holds only capability and process points',()=>{
 // Capability 1/1 and process 1/1 in both directions, name and description 0:
 // each direction is 0.1 × 0 + 0.2 × 0 + 0.3 × 1 + 0.4 × 1 = 0.7.
 const same=fixture(ZERO_A,ZERO_B);
 assert.equal(pairResultLabel(same),'No complete score');close(codeEvidenceScore(same),0.7);
 // A also records M.U.1, which B does not: A→B process 1/2 → 0.3 × 1 + 0.4 × 1/2 = 0.5; B→A process 1/1 → 0.7.
 // The code evidence is the lower direction, A→B.
 const extra={...ZERO_A,Processes:'BBM PM T One L1;BBM PM U Other one L1'};
 const lower=fixture(extra,ZERO_B);
 assert.equal(pairResultLabel(lower),'No complete score');
 close(lower.forward.coverage,0.5);close(lower.reverse.coverage,0.7);
 close(codeEvidenceScore(lower),0.5);
 const parts=Object.fromEntries(lower.forward.components.map(c=>[c.key,c.contribution]));
 assert.equal(parts.name,0);assert.equal(parts.description,0);close(parts.cap,0.3);close(parts.process,0.2);
 close(codeEvidenceScore(lower),parts.cap+parts.process,'capability + process contributions of the lower direction');
 // The same pair taken the other way round has the same code evidence.
 close(codeEvidenceScore(createWeightedSimilarity(fixtureModel(extra,ZERO_B)).pair('B','A')),0.5);
});

test('only No complete score has code evidence: every other label gives null',()=>{
 const cases=[
  // Names "Shared A"/"Shared B" → {shared} each (single letters ignored) = 1, description 1, codes 1 → confirmed 1.0.
  ['Potential overlap',fixture()],
  // Name {alpha,gamma} vs {beta,gamma} = 1/3, description 0, no shared code → 0.1/3 ≈ 3.3, confirmed below 50
  // (2026-10-20: Below threshold, was Not similar).
  ['Below threshold',fixture({Name:'Alpha Gamma',Description:'orchard'},{Name:'Beta Gamma',Description:'tunnel',...OTHER_CODES}),'confirmed'],
  // Zero text and no shared capability or process → investigation with every code count 0
  // (2026-10-20: No shared registrations, was Not similar).
  ['No shared registrations',fixture(ZERO_A,{...ZERO_B,...OTHER_CODES}),'investigation'],
  ['Needs confirmation',fixture(ZERO_A,{...ZERO_B,'Business Capabilities':'B.06.99 Unknown'}),'investigation'],
  ['More detail needed',fixture({...ZERO_A,Processes:'BBM PM T Root L0'},ZERO_B),'investigation'],
  ['Data missing',fixture({...ZERO_A,Description:''},ZERO_B),'incomplete'],
  // Out of scope although its directional totals (0.7) are complete.
  ['Out of scope',fixture({...ZERO_A,scopeNote:'no score, not an application'},ZERO_B),'excluded'],
 ];
 for(const [label,pair,status] of cases){
  assert.equal(pairResultLabel(pair),label);if(status)assert.equal(pair.status,status,label);
  assert.equal(codeEvidenceScore(pair),null,`${label} (${pair.status}) has no code evidence`);
 }
 // Even where the lower directional total exists (confirmed 1/30, zero-code 0, out of scope 0.7), it is not code evidence.
 close(cases[1][1].directionalMinimum,0.1/3);assert.equal(cases[2][1].directionalMinimum,0);close(cases[6][1].directionalMinimum,0.7);
 // And the one No complete score fixture is not null (0.7, as derived above).
 close(codeEvidenceScore(fixture(ZERO_A,ZERO_B)),0.7);
});

test('no code evidence when neither capability nor process carries weight; one weighted code field is enough',()=>{
 // Weights name .5, description .5: both 0, so the pair is held back. No weighted code field can show it has No shared
 // registrations, so it is No complete score, but it has no capability or process points: its lower directional total is 0.
 const textOnly=fixture(ZERO_A,ZERO_B,{name:.5,description:.5,cap:0,process:0});
 assert.equal(textOnly.status,'investigation');assert.equal(pairResultLabel(textOnly),'No complete score');
 assert.equal(textOnly.directionalMinimum,0);assert.equal(codeEvidenceScore(textOnly),null);
 assert.equal(pairStatusReason(textOnly),PREFIX,'no code evidence sentence');
 // Weights name 0, description .2, capability .5, process 0 normalize to 0 / 2/7 / 5/7 / 0. Capability 1/1 both ways
 // → code evidence 5/7 = 0.714285… The weightless name does not take part in the gate.
 const capabilityOnly=fixture(ZERO_A,ZERO_B,{name:0,description:.2,cap:.5,process:0});
 assert.equal(pairResultLabel(capabilityOnly),'No complete score');close(codeEvidenceScore(capabilityOnly),5/7);
});

test('a process-only code weight (capability 0) still gives code evidence: the lower process total',()=>{
 // Weights name .2 / description .2 / capability 0 / process .6. A also records M.U.1:
 // A→B process 1/2 → 0.6 × 1/2 = 0.3; B→A process 1/1 → 0.6. Capability is shared but weightless (contribution 0).
 const pair=fixture({...ZERO_A,...EXTRA_PROCESS},ZERO_B,PROCESS_ONLY);
 assert.equal(pair.status,'investigation');assert.equal(pairResultLabel(pair),'No complete score');
 close(pair.forward.coverage,0.3);close(pair.reverse.coverage,0.6);
 const cap=pair.forward.components.find(c=>c.key==='cap');assert.equal(cap.weight,0);assert.equal(cap.contribution,0);
 close(codeEvidenceScore(pair),0.3);assert.equal(formatCodeEvidence(codeEvidenceScore(pair)),'30 / 100');
 // Symmetric process 1/1 both ways → 0.6.
 close(codeEvidenceScore(fixture(ZERO_A,ZERO_B,PROCESS_ONLY)),0.6);
});

test('formatCodeEvidence shows settled points out of 100 with at most one decimal',()=>{
 // value × 100, settled to 1e-7 point, then en-US with at most one decimal.
 assert.equal(formatCodeEvidence(0.3),'30 / 100');
 assert.equal(formatCodeEvidence(5/7),'71.4 / 100');// 71.428571…
 assert.equal(formatCodeEvidence(0.47500000000000003),'47.5 / 100');
 assert.equal(formatCodeEvidence(0.075),'7.5 / 100');
 assert.equal(formatCodeEvidence(0.7),'70 / 100');
 assert.equal(formatCodeEvidence(0.05),'5 / 100');
 assert.equal(formatCodeEvidence(1),'100 / 100');
 assert.equal(formatCodeEvidence(0),'0 / 100');
 assert.equal(formatCodeEvidence(0.30869565217391304),'30.9 / 100');
 assert.equal(formatCodeEvidence(0.5124999999999999),'51.3 / 100','.x5 rounds the same way as the scores');
});

test('pairStatusReason quotes the code evidence for No complete score and nowhere else',()=>{
 assert.equal(pairStatusReason(fixture(ZERO_A,ZERO_B)),withCode('70'));// 0.3 + 0.4, see above
 assert.equal(pairStatusReason(fixture({...ZERO_A,Processes:'BBM PM T One L1;BBM PM U Other one L1'},ZERO_B)),withCode('50'));// lower direction 0.3 + 0.2
 // Only the weighted description can hold the pair back (name weight 0), and the reason names only it; 5/7 → 71.4.
 // Round 2: only the capability carries code weight (process 0), so the sentence says "from capabilities".
 assert.equal(pairStatusReason(fixture(ZERO_A,ZERO_B,{name:0,description:.2,cap:.5,process:0})),withCode('71.4','No shared words in descriptions; compare the recorded functions.','capabilities'));
 // Capability weight 0: "from processes"; lower direction A→B 0.6 × 1/2 = 30 (see the process-only test above).
 assert.equal(pairStatusReason(fixture({...ZERO_A,...EXTRA_PROCESS},ZERO_B,PROCESS_ONLY)),withCode('30',PREFIX,'processes'));
 // Both code fields weighted (default and any other split): "from capabilities and processes";
 // name .1 / description .1 / capability .4 / process .4 → 0.4 + 0.4 = 80.
 assert.equal(pairStatusReason(fixture(ZERO_A,ZERO_B,{name:.1,description:.1,cap:.4,process:.4})),withCode('80',PREFIX,'capabilities and processes'));
 assert.equal(pairStatusReason(fixture(ZERO_A,ZERO_B,{name:.5,description:.5,cap:0,process:0})),PREFIX);
 // No shared registrations (2026-10-20): the reason names the weighted text fields (name .1 and description .2 → "names or
 // descriptions") and the weighted code fields (capability .3 and process .4 → "capabilities or processes");
 // before 2026-10-20 it was the fixed text 'No shared capabilities or processes'.
 assert.equal(pairStatusReason(fixture(ZERO_A,{...ZERO_B,...OTHER_CODES})),'No shared words in names or descriptions and no shared capabilities or processes.');
 assert.equal(pairStatusReason(fixture({...ZERO_A,Processes:'BBM PM T Root L0'},ZERO_B)),'Process is recorded only at Level 0.');
 assert.equal(pairStatusReason(fixture()),'The opportunity score is the lower of the two confirmed directional totals.');
});

test('the label, the status and the missing pair score do not change, whatever the code evidence',()=>{
 const model=fixtureModel(ZERO_A,ZERO_B),index=createWeightedSimilarity(model),pair=index.pair('A','B');
 close(codeEvidenceScore(pair),0.7);// 70 is above the default threshold of 50 ...
 for(const threshold of [0,50,70,100])assert.equal(pairResultLabel(pair,threshold),'No complete score',`threshold ${threshold}`);
 assert.equal(pair.status,'investigation');assert.equal(pair.coverage,null);assert.equal(pair.eligible,false);
 const summary=portfolioAtThreshold(portfolioCandidates(index),0);// ... and it is still not a scored pair at threshold 0.
 assert.equal(summary.pairCount,0);assert.deepEqual(summary.investigationPairs.map(p=>p.key),[pair.key]);
});

test('the weighted CSV fills the code evidence column right after Status reason, only for No complete score pairs',()=>{
 const defaults=[fixture(ZERO_A,ZERO_B),fixture(),fixture(ZERO_A,{...ZERO_B,...OTHER_CODES})];
 const {header,rows:[review,overlap,zeroCodes]}=records(similarityCSV(defaults,'weighted',FIXTURE_DATA));
 assert.equal(header[header.indexOf('Status reason')+1],CODE_COLUMN);
 // 0.7 → scorePoints(0.7).toFixed(4); the confirmed score column stays N/A.
 assert.equal(review.Status,'No complete score');assert.equal(review[CODE_COLUMN],'70.0000');assert.equal(review['Status reason'],withCode('70'));
 assert.equal(review['Confirmed pair similarity (out of 100)'],'N/A');
 assert.equal(overlap.Status,'Potential overlap');assert.equal(overlap[CODE_COLUMN],'');
 // Zero text, zero shared codes (investigation): No shared registrations since 2026-10-20 (was Not similar).
 assert.equal(zeroCodes.Status,'No shared registrations');assert.equal(zeroCodes[CODE_COLUMN],'');
 // 5/7 × 100 = 71.428571… → '71.4286'.
 const [capabilityOnly]=records(similarityCSV([fixture(ZERO_A,ZERO_B,{name:0,description:.2,cap:.5,process:0})],'weighted',FIXTURE_DATA)).rows;
 assert.equal(capabilityOnly[CODE_COLUMN],'71.4286');
 assert.equal(capabilityOnly['Status reason'],withCode('71.4','No shared words in descriptions; compare the recorded functions.','capabilities'));
 // Process only: lower direction 0.6 × 1/2 = 0.3 → '30.0000', "from processes".
 const [processOnly]=records(similarityCSV([fixture({...ZERO_A,...EXTRA_PROCESS},ZERO_B,PROCESS_ONLY)],'weighted',FIXTURE_DATA)).rows;
 assert.equal(processOnly.Status,'No complete score');assert.equal(processOnly[CODE_COLUMN],'30.0000');assert.equal(processOnly['Status reason'],withCode('30',PREFIX,'processes'));
 const [textOnly]=records(similarityCSV([fixture(ZERO_A,ZERO_B,{name:.5,description:.5,cap:0,process:0})],'weighted',FIXTURE_DATA)).rows;
 assert.equal(textOnly.Status,'No complete score');assert.equal(textOnly[CODE_COLUMN],'','no weighted code field, no code evidence');
 // Round 2: the gate column that follows is named for what it reports (r.zeroText, the weighted-field gate).
 assert.equal(header[header.indexOf(CODE_COLUMN)+1],GATE_COLUMN);
 assert(!header.includes('Zero name and description overlap'));
 assert.equal(review[GATE_COLUMN],'Yes');assert.equal(overlap[GATE_COLUMN],'No');
});

test('the weighted CSV Method column states the round-2 pair-score, code-evidence and name rules',()=>{
 const {rows}=records(similarityCSV([fixture(ZERO_A,ZERO_B),fixture()],'weighted',FIXTURE_DATA));
 const ellipsis=String.fromCharCode(0x2026);
 const pairRule='Pair opportunity score = min(A to B, B to A) only when both directions are complete and eligible and, if Name or Description carries weight above zero, at least one of those weighted fields has a shared word; for No complete score pairs, when Capability or Process carries weight, that minimum (capability and process points only) is reported as code evidence, not as a pair score.';
 const nameRule=`Name and Description use distinct-word Jaccard (names ignore single letters and the "(recovered ${ellipsis})" suffix);`;
 for(const row of rows){
  assert(row.Method.includes(pairRule),row.Method);
  assert(row.Method.includes(nameRule),row.Method);
  assert(!row.Method.includes('single characters'),'round 1 wording is gone');
  assert(!row.Method.includes('do not all score zero'),'round 1 pair rule is gone');
 }
 // Both rows (No complete score and Potential overlap) carry the same method text.
 assert.equal(rows[0].Method,rows[1].Method);
});

// ---- Bundled data ----
const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),index=createWeightedSimilarity(model),cap=createSimilarity(model,'cap'),processSimilarity=createSimilarity(model,'process');
const app=name=>{const found=model.apps.find(a=>a.Name===name);assert(found,`bundled data includes ${name}`);return found;};
const coverage=(similarity,a,b)=>{const r=similarity.compare(a.id,b.id);return [r.commonCount,r.targetCount];};
// The code evidence re-derived from the coverage engine with the default weights (capability .3, process .4).
const codeOnly=pair=>Math.min(...[[pair.target.app,pair.peer.app],[pair.peer.app,pair.target.app]].map(([a,b])=>0.3*cap.compare(a.id,b.id).coverage+0.4*processSimilarity.compare(a.id,b.id).coverage));

test('bundled data: Iris | RBCD B308 AGV Traffic Control System is No complete score with code evidence 70',()=>{
 const iris=app('Iris'),agv=app('RBCD B308 AGV Traffic Control System'),pair=index.pair(iris.id,agv.id);
 // Capability 1/1 and process 1/1 in both directions, no shared name or description word:
 // 0.3 × 1 + 0.4 × 1 = 0.7 per direction.
 for(const [a,b] of [[iris,agv],[agv,iris]]){assert.deepEqual(coverage(cap,a,b),[1,1]);assert.deepEqual(coverage(processSimilarity,a,b),[1,1]);}
 for(const direction of [pair.forward,pair.reverse])for(const key of ['name','description'])assert.equal(direction.components.find(c=>c.key===key).score,0,key);
 assert.equal(pair.status,'investigation');assert.equal(pair.coverage,null);assert.equal(pairResultLabel(pair),'No complete score');
 close(codeEvidenceScore(pair),0.7);assert.equal(formatCodeEvidence(codeEvidenceScore(pair)),'70 / 100');
 assert.equal(pairStatusReason(pair,50,scopeReason),withCode('70'));
});

test('bundled data: Iris–RCS-2000 code evidence is the 30.0 subtotal confirmed in the 2026-10-15 handoff',()=>{
 const iris=app('Iris'),rcs=app('RCS-2000'),pair=index.pair(iris.id,rcs.id);
 // Capability 1/1 both ways, process 0/1 both ways: 0.3 × 1 + 0.4 × 0 = 0.3.
 for(const [a,b] of [[iris,rcs],[rcs,iris]]){assert.deepEqual(coverage(cap,a,b),[1,1]);assert.deepEqual(coverage(processSimilarity,a,b),[0,1]);}
 assert.equal(pairResultLabel(pair),'No complete score');close(codeEvidenceScore(pair),0.3);assert.equal(formatCodeEvidence(codeEvidenceScore(pair)),'30 / 100');
});

test('bundled data: BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management is now No complete score with code evidence 47.5',()=>{
 const bmlp=app('BMLP_Nexeed_IAS@WxP'),qinp=app('QinP FG Smart Label Management'),pair=index.pair(bmlp.id,qinp.id);
 // Before 2026-10-19 the lone "p" split from WxP and QinP was the names' only shared word (1/10), which made the pair a
 // confirmed min(0.475 + 0.1 × 0.1, 0.5 + 0.01) = 48.5. Now the names share nothing. BMLP→QinP: capability 1/4,
 // process 1/1 → 0.3 × 1/4 + 0.4 × 1 = 0.475; QinP→BMLP: capability 1/1, process 1/2 → 0.3 + 0.2 = 0.5. Lower: 0.475.
 assert.deepEqual(coverage(cap,bmlp,qinp),[1,4]);assert.deepEqual(coverage(processSimilarity,bmlp,qinp),[1,1]);
 assert.deepEqual(coverage(cap,qinp,bmlp),[1,1]);assert.deepEqual(coverage(processSimilarity,qinp,bmlp),[1,2]);
 assert.equal(pair.status,'investigation');assert.equal(pairResultLabel(pair),'No complete score');
 close(codeEvidenceScore(pair),0.475);assert.equal(formatCodeEvidence(codeEvidenceScore(pair)),'47.5 / 100');
});

test('bundled data: all 139 No complete score pairs have code evidence, equal to their lower capability + process total',()=>{
 // 2026-10-20: the 139 pairs once labelled Review needed are exactly the No complete score pairs (owner request).
 const pairs=portfolioCandidates(index).pairs,review=pairs.filter(p=>pairResultLabel(p,50)==='No complete score');
 // 139 comes from an independent recount over the 2,850 pairs: both applications in scope, name and description
 // distinct-word Jaccard both exactly 0 (own tokenizer: names NFKC-normalized, "( recovered …)" removed, single
 // letters dropped while single digits and Chinese characters stay), all four directional capability/process
 // coverages known, and at least one shared code. The round-1 rule (every single character dropped) gives the same
 // 139 pairs; the old rule without name filtering gives the documented 138; the added pair is
 // BMLP_Nexeed_IAS@WxP | QinP FG Smart Label Management.
 assert.equal(review.length,139);
 for(const pair of review)close(codeEvidenceScore(pair),codeOnly(pair),pair.key);
 for(const pair of pairs)if(pairResultLabel(pair,50)!=='No complete score')assert.equal(codeEvidenceScore(pair),null,pair.key);
 // The recount's range: highest 0.7 (only Iris | RBCD B308 AGV Traffic Control System), lowest 0.05 — never 0.
 const values=review.map(codeEvidenceScore),top=review.filter(p=>Math.abs(codeEvidenceScore(p)-0.7)<1e-12);
 assert.deepEqual(top.map(p=>[p.target.app.Name,p.peer.app.Name].sort()),[['Iris','RBCD B308 AGV Traffic Control System']]);
 close(Math.max(...values),0.7);close(Math.min(...values),0.05);
});

// ---- Rendered UI (stub document, as in tests/handoff-rules.test.mjs) ----
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,listener){this.listeners??=new Map();if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},fire(type,event){for(const listener of this.listeners?.get(type)||[])listener(event);},setAttribute(){},querySelectorAll(){return [];},querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},append(){}});
 return {body:node(),createElement(){return {click(){},remove(){}};},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function withUI(run,{model:uiModel=model,data:uiData=data}={}){
 const old=globalThis.document,document=stubDocument();globalThis.document=document;
 try{run(createComparisonUI({getModel:()=>uiModel,getData:()=>uiData,escape:esc,isSignedIn:()=>true}),document);}finally{globalThis.document=old;}
}
const rankRows=html=>new Map([...html.matchAll(/<button class="focus-rank[^"]*" data-focus-peer="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].map(m=>[m[1],m[2]]));
const pairRows=html=>new Map([...html.matchAll(/<button class="compare-pair-row" data-cell-target="([^"]*)" data-cell-peer="([^"]*)">([\s\S]*?)<\/button>/g)].map(m=>[[m[1],m[2]].sort().join('::'),{inner:m[3],strong:m[3].match(/<strong>([\s\S]*)<\/strong>$/)?.[1]}]));
const rowKey=(a,b)=>[esc(a.id),esc(b.id)].sort().join('::');

test('the single-pair score box shows Unavailable, No complete score and the code evidence for Iris–RCS-2000',()=>withUI((ui,document)=>{
 ui.restoreState({focusAppId:app('Iris').id,focusPeerId:app('RCS-2000').id});
 const html=document.getElementById('focusResult').innerHTML;
 // 0.3 (capability 1/1 × 0.3, process 0/1) → '30 / 100'.
 assert.match(html,/<div class="comparison-score"><span>Score<\/span><strong>Unavailable<\/strong><em class="comparison-status">No complete score<\/em><small class="comparison-code-evidence">Code evidence 30 \/ 100<\/small><\/div>/);
 // A confirmed pair keeps its score and gets no code evidence; so does a Needs confirmation pair.
 ui.restoreState({focusAppId:app('ARS').id,focusPeerId:app('AGR w/ Camera').id});
 const confirmed=document.getElementById('focusResult').innerHTML;
 assert.match(confirmed,/30\.9<small> \/ 100<\/small><\/strong><em class="comparison-status">Below threshold<\/em><\/div>/);assert.doesNotMatch(confirmed,/comparison-code-evidence/);
 ui.restoreState({focusAppId:app('Iris').id,focusPeerId:app('AUTO-RACK').id});
 const pending=document.getElementById('focusResult').innerHTML;
 assert.match(pending,/<strong>Unavailable<\/strong><em class="comparison-status">Needs confirmation<\/em><\/div>/);assert.doesNotMatch(pending,/comparison-code-evidence/);
}));

test('the candidate ranking shows code evidence on No complete score rows only',()=>withUI((ui,document)=>{
 const iris=app('Iris');
 ui.restoreState({focusAppId:iris.id,focusPeerId:app('RCS-2000').id});
 const html=document.getElementById('focusResult').innerHTML,rows=rankRows(html),row=name=>{const found=rows.get(esc(app(name).id));assert(found,'ranking lists '+name);return found;};
 const code=points=>`<small class="focus-rank-code">Code evidence ${points} / 100</small>`;
 // Iris's six No complete score peers (independent recount), each min(0.3 × capability + 0.4 × process) over both directions:
 // RCS-2000, D-sample tracking system, RBCC_IDPS…, RBCC_VNA task management: capability 1/1, process 0/1 → 30;
 // RBCD B308 AGV Traffic Control System: capability and process 1/1 → 70;
 // BMLP_Nexeed_IAS@WxP: BMLP→Iris capability 1/4, process 0/1 → 0.3 × 1/4 = 7.5.
 assert(row('RCS-2000').includes(`<small class="focus-rank-status">No complete score</small>${code('30')}`));
 for(const name of ['D-sample tracking system','RBCC_IDPS_Intelligent document print system','RBCC_VNA task management'])assert(row(name).includes(code('30')),name);
 assert(row('RBCD B308 AGV Traffic Control System').includes(code('70')));
 assert(row('BMLP_Nexeed_IAS@WxP').includes(code('7.5')));
 assert.equal((html.match(/class="focus-rank-code"/g)||[]).length,6,'one code evidence per No complete score peer');
 // Confirmed (Potential overlap and Below threshold), Needs confirmation, More detail needed, No shared registrations and
 // Out of scope rows have none.
 assert.match(row('CGQB_Logistic_system_Q'),/<strong>Score: [\d.]+<\/strong>/);
 assert.match(row('ARS'),/<strong>Score: 31\.3<\/strong>/);
 assert(row('AUTO-RACK').includes('<small class="focus-rank-status">Needs confirmation</small>'));
 assert(row('RBCW Auto Warehouse Management System').includes('<small class="focus-rank-status">More detail needed</small>'));
 assert(row('AR Stock Taking').includes('<small class="focus-rank-status">No shared registrations</small>'));
 assert(row('VMCN_CONNEX').includes('<small class="focus-rank-status">Out of scope</small>'));
 for(const name of ['CGQB_Logistic_system_Q','ARS','AUTO-RACK','RBCW Auto Warehouse Management System','AR Stock Taking','VMCN_CONNEX'])assert(!row(name).includes('focus-rank-code'),name);
}));

test('the compare-dialog pair row shows No complete score with the code evidence in its own small line',()=>withUI((ui,document)=>{
 const [iris,rcs,agv,ars,rack]=['Iris','RCS-2000','RBCD B308 AGV Traffic Control System','ARS','AUTO-RACK'].map(app);
 ui.open({poolIds:[iris,rcs,agv,ars,rack].map(a=>a.id),contextLabel:'Code evidence'});
 const html=document.getElementById('comparisonMatrix').innerHTML,rows=pairRows(html);
 assert.equal(rows.size,10);
 // Round 2 markup: <strong>No complete score<small class="compare-pair-code">Code evidence N / 100</small></strong>.
 assert.equal(rows.get(rowKey(iris,rcs)).strong,pairCode('30'));// 0.3 × 1 + 0.4 × 0
 assert.equal(rows.get(rowKey(iris,agv)).strong,pairCode('70'));// 0.3 × 1 + 0.4 × 1
 assert(!html.includes(' · Code evidence'),'the round-1 inline separator is gone');
 assert.equal((html.match(/<small class="compare-pair-code">/g)||[]).length,2,'one code evidence line per No complete score row');
 assert.equal(rows.get(rowKey(ars,iris)).strong,'31.3 / 100','a confirmed pair shows its score only');
 assert.equal(rows.get(rowKey(ars,rcs)).strong,'32.1 / 100');
 // Code evidence appears on No complete score rows and on no other row.
 for(const [key,{strong}] of rows)assert.equal(/Code evidence/.test(strong),strong.startsWith('No complete score'),key+': '+strong);
}));

test('code evidence keeps names HTML-escaped, and disappears when no code field carries weight',()=>{
 // Names without a shared word ({img, src, onerror, alert, 1, alpha, co} vs {beta, quote, apos}: the single letters
 // x and i are ignored, and the digit 1 is only in A) and markup in names and plants; codes shared 1/1 both ways
 // → 0.3 + 0.4 = 70 with the default weights.
 const hostile=buildModel({apps:[fixtureApp('A',{Name:'<img src=x onerror=alert(1)> Alpha & Co',Description:'orchard',Entity:'<P1>'}),fixtureApp('B',{Name:'Beta "Quote" \'Apos\' <i>',Description:'tunnel',Entity:'P&2'})],capabilityRows,processRows});
 const [a,b]=hostile.apps;
 const render=weights=>{let focus,matrix;withUI((ui,document)=>{
  ui.restoreState({focusAppId:'A',focusPeerId:'B'});focus=document.getElementById('focusResult').innerHTML;
  ui.open({poolIds:['A','B'],contextLabel:'Escaping'});matrix=document.getElementById('comparisonMatrix').innerHTML;
 },{model:hostile,data:{...FIXTURE_DATA,similarityWeights:weights}});return {focus,matrix};};
 const {focus,matrix}=render(undefined);
 assert(focus.includes('<small class="comparison-code-evidence">Code evidence 70 / 100</small>'));
 const rank=rankRows(focus).get('B');assert(rank,'ranking lists B');
 assert(rank.includes(esc(b.Name))&&rank.includes('<small class="focus-rank-code">Code evidence 70 / 100</small>'),rank);
 const row=pairRows(matrix).get('A::B');
 assert.equal(row.strong,pairCode('70'));
 assert(row.inner.startsWith(`<span>${esc(a.Name)} ↔ ${esc(b.Name)}<small>${esc('<P1>')} · ${esc('P&2')}</small></span>`),row.inner);
 for(const html of [focus,matrix]){assert(!html.includes('<img'),'no raw image tag');assert(!html.includes('<i>'),'no raw italic tag');assert(!html.includes('<P1>'),'no raw plant markup');}
 // Weights name .5 / description .5: still No complete score, but no capability or process points to show.
 const textOnly=render({name:.5,description:.5,cap:0,process:0});
 assert.match(textOnly.focus,/<strong>Unavailable<\/strong><em class="comparison-status">No complete score<\/em><\/div>/);
 assert(!textOnly.focus.includes('comparison-code-evidence')&&!textOnly.focus.includes('focus-rank-code'));
 assert.equal(pairRows(textOnly.matrix).get('A::B').strong,'No complete score');
});

// ---- Asymmetric No complete score pair on the bundled data (mutation review, 2026-10-19 round 2) ----
// Iris | BMLP_Nexeed_IAS@WxP, derived by hand from the two source records in public/data.json:
// - Names {iris} vs {bmlp, nexeed, ias, wx} (the lone P of WxP is a single letter) and descriptions share no word, and
//   both text fields are weighted → held back, No complete score.
// - Capability: Iris records B.06.5; BMLP records B.06 (root, not compared), B.06.3, B.06.4.1, B.06.4.2 and B.06.5.
//   Iris→BMLP: B.06.5 shared → 1/1. BMLP→Iris: B.06.3 (L2), B.06.4.1 and B.06.4.2 (L3, a branch Iris does not record,
//   so they keep their level) and B.06.5 → 1 shared of 4.
// - Process: Iris records M.I2D (L0) and the M.I2D.020 chain down to L3 (Warehouse to Consume → Internal Transport →
//   Manage Internal Transport); BMLP records M.I2D (L0) and M.I2D.010 Receive to Store (L1). The shared I2D branch is
//   compared at BMLP's L1: M.I2D.020 vs M.I2D.010 → 0/1 both ways.
// - Iris→BMLP = 0.3 × 1 + 0.4 × 0 = 0.30; BMLP→Iris = 0.3 × 1/4 + 0.4 × 0 = 0.075. The code evidence is the lower
//   direction, 7.5 / 100, whichever application is the target; 30 / 100 (the higher direction) must not appear.
test('an asymmetric No complete score pair shows its lower direction everywhere: Iris | BMLP_Nexeed_IAS@WxP is 7.5, never 30',()=>{
 const iris=app('Iris'),bmlp=app('BMLP_Nexeed_IAS@WxP');
 // The coverage engine agrees with the hand derivation.
 assert.deepEqual(coverage(cap,iris,bmlp),[1,1]);assert.deepEqual(coverage(cap,bmlp,iris),[1,4]);
 assert.deepEqual(coverage(processSimilarity,iris,bmlp),[0,1]);assert.deepEqual(coverage(processSimilarity,bmlp,iris),[0,1]);
 const fromIris=index.pair(iris.id,bmlp.id),fromBmlp=index.pair(bmlp.id,iris.id);
 close(fromIris.forward.coverage,0.3);close(fromIris.reverse.coverage,0.075);
 close(fromBmlp.forward.coverage,0.075);close(fromBmlp.reverse.coverage,0.3);
 for(const pair of [fromIris,fromBmlp]){
  assert.equal(pair.status,'investigation');assert.equal(pairResultLabel(pair),'No complete score');
  close(codeEvidenceScore(pair),0.075);assert.equal(pairStatusReason(pair,50,scopeReason),withCode('7.5'));
  // 0.075 × 100 = 7.5 → '7.5000' in the CSV column.
  assert.equal(records(similarityCSV([pair],'weighted',data)).rows[0][CODE_COLUMN],'7.5000');
 }
 const box=/<div class="comparison-score"><span>Score<\/span><strong>Unavailable<\/strong><em class="comparison-status">No complete score<\/em><small class="comparison-code-evidence">Code evidence 7\.5 \/ 100<\/small><\/div>/;
 const rankCode='<small class="focus-rank-status">No complete score</small><small class="focus-rank-code">Code evidence 7.5 / 100</small>';
 for(const [focus,peer] of [[iris,bmlp],[bmlp,iris]])withUI((ui,document)=>{
  // Single-pair score box, with either application as the focus (its direction is the forward one).
  ui.restoreState({focusAppId:focus.id,focusPeerId:peer.id});
  const html=document.getElementById('focusResult').innerHTML;
  assert.match(html,box,focus.Name+' first');
  // The box holds the only score-box code evidence (other No complete score peers of Iris in the ranking do show 30).
  assert.equal((html.match(/class="comparison-code-evidence"/g)||[]).length,1,focus.Name+' first');
  // Ranking row of the peer in the focus application's candidate list.
  const row=rankRows(html).get(esc(peer.id));assert(row,'ranking lists '+peer.Name);
  assert(row.includes(rankCode),row);
  // Compare-dialog pair row, with either application first in the pool (so it is the row target).
  ui.open({poolIds:[focus.id,peer.id],contextLabel:'Asymmetric'});
  const matrix=document.getElementById('comparisonMatrix').innerHTML;
  assert.match(matrix,new RegExp(`<button class="compare-pair-row" data-cell-target="${esc(focus.id)}" data-cell-peer="${esc(peer.id)}">`),'row target follows the pool order');
  assert.equal(pairRows(matrix).get(rowKey(iris,bmlp)).strong,pairCode('7.5'));
  assert(!matrix.includes('Code evidence 30 / 100'));
 });
});

test('the code evidence lines have their own styles: own line in the pair row, no wrapping in the ranking',()=>{
 const layout=readFileSync(new URL('../public/similarity-layout.css',import.meta.url),'utf8');
 const customer=readFileSync(new URL('../public/customer.css',import.meta.url),'utf8');
 // Any <small> in a compare-pair row is a block, so the code evidence sits under the label; round 2 gives it its colour.
 assert.match(customer,/\.compare-pair-row small\{display:block/);
 assert.match(layout,/\.compare-pair-row strong \.compare-pair-code \{[^}]*color: #456675;[^}]*\}/);
 // The provisional ranking caps its <small> notes at 112px and lets them wrap; the code evidence line is exempt.
 assert.match(layout,/\.focus-rank\.is-provisional \.focus-rank-score small \{[^}]*max-width: 112px;/);
 assert.match(layout,/\.focus-rank\.is-provisional \.focus-rank-score \.focus-rank-code \{ max-width: none; white-space: nowrap; \}/);
});

// ---- Style rules, read with a small CSS reader (comments and quoted strings skipped, nested @media blocks kept) ----
// Each rule is {media, block, selector, declarations, order}: media is the chain of @media conditions with spaces removed
// ('' outside any @media), block numbers the @media block the rule sits in, order is the source position.
function cssRules(text){
 const src=text.replace(/\/\*[\s\S]*?\*\//g,''),rules=[];let blocks=0;
 // Index of the first of the stop characters at the top level of src[from..] (outside quotes and parentheses).
 const scan=(from,stops)=>{let quote=null,depth=0;for(let i=from;i<src.length;i++){const ch=src[i];if(quote){if(ch==='\\')i++;else if(ch===quote)quote=null;}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='(')depth++;else if(ch===')')depth--;else if(!depth&&stops.includes(ch))return i;}return src.length;};
 const splitTop=(value,separator)=>{const parts=[];let quote=null,depth=0,start=0;for(let i=0;i<value.length;i++){const ch=value[i];if(quote){if(ch==='\\')i++;else if(ch===quote)quote=null;}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='(')depth++;else if(ch===')')depth--;else if(!depth&&ch===separator){parts.push(value.slice(start,i));start=i+1;}}parts.push(value.slice(start));return parts.map(part=>part.trim()).filter(Boolean);};
 const read=(from,media,block)=>{
  let i=from;
  while(i<src.length){
   const stop=scan(i,'{};');
   if(stop>=src.length||src[stop]==='}')return stop+1;
   const prelude=src.slice(i,stop).trim().replace(/\s+/g,' ');
   if(src[stop]===';'){i=stop+1;continue;}
   // Grouping at-rules (@media, @supports, ...) hold rules: read them, keeping the condition chain.
   if(/^@(?:media|supports|container|layer)\b/i.test(prelude)){i=read(stop+1,[...media,prelude.replace(/\s+/g,'')],++blocks);continue;}
   // Any other at-rule block (such as @keyframes) is skipped whole, nested braces included.
   if(prelude.startsWith('@')){let depth=1,j=stop+1;while(j<src.length&&depth){const next=scan(j,'{}');depth+=src[next]==='{'?1:-1;j=next+1;}i=j;continue;}
   const end=scan(stop+1,'}');
   const declarations=Object.fromEntries(splitTop(src.slice(stop+1,end),';').map(item=>{const colon=item.indexOf(':');return [item.slice(0,colon).trim(),item.slice(colon+1).trim().replace(/\s+/g,' ')];}));
   for(const selector of splitTop(prelude,','))rules.push({media:media.join(' '),block,selector,declarations,order:rules.length});
   i=end+1;
  }
  return i;
 };
 read(0,[],0);
 return rules;
}

test('every code evidence style rule is present: own lines, one colour, right-aligned pair label, phone wrapping',()=>{
 // Round 2 added the code evidence classes; round 3 (2026-10-19) right-aligns the pair row label and lets both code
 // evidence lines wrap at 7.5em on phones (max-width 600px); round 4 aligns the phone pair-row line with the label.
 const layout=cssRules(readFileSync(new URL('../public/similarity-layout.css',import.meta.url),'utf8'));
 const find=(selector,media='')=>layout.filter(rule=>rule.selector===selector&&rule.media===media);
 const only=(selector,media='')=>{const found=find(selector,media);assert.equal(found.length,1,`${selector} ${media||'(no @media)'}: ${found.length} rules`);return found[0];};
 const PHONE='@media(max-width:600px)';
 const SCORE_BOX='.readable-comparison .comparison-score .comparison-code-evidence';
 const RANK='.focus-rank-score .focus-rank-code',RANK_PROVISIONAL='.focus-rank.is-provisional .focus-rank-score .focus-rank-code';
 const PAIR_CODE='.compare-pair-row strong .compare-pair-code',PAIR_LABEL='.compare-pair-row strong';
 // Round 2 rules (unchanged by round 3).
 // Score box: the code evidence is a block, so it sits on its own line under the status.
 assert.deepEqual(only(SCORE_BOX).declarations,{display:'block','margin-top':'3px','font-size':'12px','font-weight':'600',color:'#456675'});
 // Ranking: the code evidence line, and in a provisional row it is exempt from the 112px wrapping of the other notes.
 assert.deepEqual(only(RANK).declarations,{color:'#456675','font-size':'12px'});
 assert.deepEqual(only(RANK_PROVISIONAL).declarations,{'max-width':'none','white-space':'nowrap'});
 assert.equal(only('.focus-rank.is-provisional .focus-rank-score small').declarations['max-width'],'112px');
 // Pair row: the code evidence line under the label.
 assert.deepEqual(only(PAIR_CODE).declarations,{'margin-top':'2px',color:'#456675','font-weight':'600'});
 // The three code evidence lines share one colour.
 assert.deepEqual([SCORE_BOX,RANK,PAIR_CODE].map(selector=>only(selector).declarations.color),['#456675','#456675','#456675']);
 // Round 3: the pair row label (score, or No complete score with its code evidence line) is right-aligned.
 assert.deepEqual(only(PAIR_LABEL).declarations,{'text-align':'right'});                        // before round 3: no rule
 // Round 3: one phone block holds exactly the two wrapping rules.
 const phoneRank=only(RANK_PROVISIONAL,PHONE),phonePair=only(PAIR_CODE,PHONE);                  // before round 3: none
 assert.deepEqual(phoneRank.declarations,{'max-width':'7.5em','white-space':'normal'});
 // Round 4: the phone code evidence line is a block (customer.css) capped at 7.5em inside the right-aligned label, so
 // text-align only moves its text; margin-left: auto moves the line itself to the right edge, under the label.
 // Before round 4: the same rule without margin-left.
 assert.deepEqual(phonePair.declarations,{'font-size':'11px','white-space':'normal','max-width':'7.5em','margin-left':'auto'});
 // Guard: the wide-screen rule has no cap and so needs no auto margin (pinned exactly above: margin-top, color,
 // font-weight).
 assert.equal('margin-left' in only(PAIR_CODE).declarations,false);
 assert.equal(phoneRank.block,phonePair.block,'both rules sit in the same @media block');
 assert.deepEqual(layout.filter(rule=>rule.block===phoneRank.block).map(rule=>rule.selector),[RANK_PROVISIONAL,PAIR_CODE]);
 // Same selectors, so the same specificity: the phone rules win because they come after the round-2 rules, and no later
 // rule in the file targets these selectors again.
 assert.ok(phoneRank.order>only(RANK_PROVISIONAL).order&&phonePair.order>only(PAIR_CODE).order);
 for(const selector of [RANK_PROVISIONAL,PAIR_CODE])assert.equal(layout.filter(rule=>rule.selector===selector).at(-1).media,PHONE,selector);
 // customer.css is loaded after similarity-layout.css. It makes every <small> of a pair row a block and keeps the label
 // on one line (white-space: nowrap, inherited by the code evidence line, which is why the phone rule sets normal), and
 // never targets the code evidence classes or the label's alignment.
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('href="similarity-layout.css"')>=0&&html.indexOf('href="similarity-layout.css"')<html.indexOf('href="customer.css"'));
 const customer=cssRules(readFileSync(new URL('../public/customer.css',import.meta.url),'utf8'));
 assert.equal(customer.find(rule=>rule.selector==='.compare-pair-row small'&&rule.media==='').declarations.display,'block');
 assert.equal(customer.find(rule=>rule.selector===PAIR_LABEL&&rule.media==='').declarations['white-space'],'nowrap');
 assert.deepEqual(customer.filter(rule=>/comparison-code-evidence|focus-rank-code|compare-pair-code/.test(rule.selector)),[]);
 assert.deepEqual(customer.filter(rule=>rule.selector.endsWith('.compare-pair-row strong')&&'text-align' in rule.declarations),[]);
});

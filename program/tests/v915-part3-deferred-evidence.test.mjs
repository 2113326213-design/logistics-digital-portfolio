// V9.15 part 3 (owner request 2026-10-20): the comparison records box states only the levels actually compared; the
// deferred detail, its source records and the "Compared under" projection are listed in How the score is calculated.
// Evidence, level alignment, scores and CSV are unchanged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {comparisonRecordEvidence,renderComparisonRecords,renderDeferredEvidence} from '../public/comparison-records.mjs';
import {comparedLevelText,comparisonLevelText} from '../public/pair-status.mjs';
import {displayCode} from '../public/display.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),app=name=>model.apps.find(item=>item.Name===name);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const capIndex=createSimilarity(model,'cap'),processIndex=createSimilarity(model,'process');
const pairArgs=(a,b)=>({model,cap:capIndex.compare(a,b),capBack:capIndex.compare(b,a),process:processIndex.compare(a,b),processBack:processIndex.compare(b,a),escape:esc});

// The small DOM double used by the other similarity flow tests.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},
  fire(type,event){for(const listener of this.listeners.get(type)||[])listener(event);},setAttribute(){},
  querySelectorAll(selector){return selector==='details'?this.details:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,Object.assign(node(),{id}));return nodes.get(id);}};
}
function withUI(run){
 const previous=globalThis.document,document=stubDocument();globalThis.document=document;
 try{const ui=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true});ui.showPortfolio();run(ui,document);}
 finally{globalThis.document=previous;}
}
const click=(host,dataset)=>host.fire('click',{target:{closest:()=>({dataset,hasAttribute:()=>false})}});
// Parts of the single-pair page: the records box, and How the score is calculated up to its full-calculation disclosure.
const between=(html,start,end)=>{const from=html.indexOf(start),to=html.indexOf(end,from);assert(from>=0&&to>from,`${start} … ${end}`);return html.slice(from,to);};
const recordsBox=html=>between(html,'<section class="shared-comparison">','id="focusSources"');
const scoreCalculation=html=>between(html,'id="focusEvidence"','id="focusDirections"');
function openPair(document,a,b){click(document.getElementById('similarityReview'),{portfolioApp:a,portfolioPeer:b});return document.getElementById('focusResult').innerHTML;}

test('ARS ↔ AGR w/ Camera: the records box states the compared levels only; the deferred detail is in How the score is calculated',()=>withUI((ui,document)=>{
 const ars=app('ARS'),agr=app('AGR w/ Camera'),html=openPair(document,ars.id,agr.id);
 assert.match(html,/<strong>30\.9<small> \/ 100<\/small><\/strong>/,'score unchanged');
 const records=recordsBox(html);
 assert.match(records,/<h5>Capability<\/h5><p class="comparison-level-note">Compared at Level 2<\/p>/);
 assert.match(records,/<h5>Process<\/h5><p class="comparison-level-note">Compared at Level 3<\/p>/);
 assert.doesNotMatch(records,/Deferred detail|detail deferred|not used in the score|not scored yet|Compared under|These source records are retained/);
 // The shared-code source mapping and the other record disclosures are not part of this move.
 assert.match(records,/Application B recorded:<\/strong> <code>B\.06\.5\.1<\/code>/);
 const calculation=scoreCalculation(html);
 assert.match(calculation,/<details class="similarity-secondary comparison-deferred-evidence" id="focusDeferred" ><summary>Deferred detail · not used in the score \(1\)<\/summary>/);
 assert.match(calculation,/These source records are retained\. Detailed comparison resumes when both applications have confirmed records at that level\./);
 assert.match(calculation,/<h5>Capability · Compared at Level 2; Level 3 detail deferred<\/h5><p><strong>Application B · AGR w\/ Camera<\/strong><\/p>/);
 assert.match(calculation,/<code>B\.06\.5\.1<\/code> <span>[^<]+<\/span> <small>Level 3<\/small><br><span>Compared under <code>B\.06\.5<\/code> · Level 2<\/span>/);
 assert.doesNotMatch(calculation,/<h5>Process ·/,'process is compared at Level 3 with nothing deferred');
 assert.equal((html.match(/Deferred detail · not used in the score/g)||[]).length,1,'listed once on the page');
 // The underlying evidence and the level texts used elsewhere are unchanged.
 const evidence=comparisonRecordEvidence(model,capIndex.compare(ars.id,agr.id),capIndex.compare(agr.id,ars.id));
 assert.deepEqual(evidence.deferred.map(items=>items.map(node=>[node.id,node.comparedId,node.comparedLevel])),[[],[['B.06.5.1','B.06.5',2]]]);
 assert.equal(evidence.levelText,'Compared at Level 2; Level 3 detail deferred');assert.equal(evidence.comparedText,'Compared at Level 2');
 const pair=createWeightedSimilarity(model,DEFAULT_WEIGHTS).pair(ars.id,agr.id);
 assert.equal(pair.status,'confirmed');assert.equal(Math.round(pair.coverage*1000)/10,30.9);
 assert.match(between(html,'id="focusDirections"','id="focusCosts"'),/Compared at Level 2; Level 3 detail deferred/,'the full calculation keeps its level basis');
}));

test('a pair compared at different levels per branch states both levels and keeps "Some … deferred" in the calculation',()=>withUI((ui,document)=>{
 const stock=app('AR Stock Taking'),nexeed=app('BMLP_Nexeed_IAS@WxP'),cap=capIndex.compare(stock.id,nexeed.id);
 assert.deepEqual(cap.comparisonLevels,[2,3]);
 const html=openPair(document,stock.id,nexeed.id),records=recordsBox(html);
 assert.match(records,/<h5>Capability<\/h5><p class="comparison-level-note">Compared at Level 2 \/ Level 3<\/p>/);
 assert.match(records,/<h5>Process<\/h5><p class="comparison-level-note">Compared at Level 1 \/ Level 3<\/p>/);
 assert.doesNotMatch(records,/Deferred detail|detail deferred|Compared under/);
 const calculation=scoreCalculation(html);
 assert.match(calculation,/Deferred detail · not used in the score \(2\)/);
 assert.match(calculation,/<h5>Capability · Compared at Level 2 \/ Level 3; Some Level 3 detail deferred<\/h5><p><strong>Application B · BMLP_Nexeed_IAS@WxP<\/strong><\/p>/);
 // Levels differing by direction are also both stated: AGR w/ Camera is compared at Level 3, DEMOS#CGD at Level 2.
 const agr=app('AGR w/ Camera'),demos=app('DEMOS#CGD');
 assert.deepEqual([capIndex.compare(agr.id,demos.id).comparisonLevels,capIndex.compare(demos.id,agr.id).comparisonLevels],[[3],[2]]);
 assert.match(renderComparisonRecords(pairArgs(agr.id,demos.id)),/<h5>Capability<\/h5><p class="comparison-level-note">Compared at Level 2 \/ Level 3<\/p>/);
 assert.equal(comparedLevelText({comparisonLevels:[2,3],deferredLevels:[3]}),'Compared at Level 2 / Level 3');
 assert.equal(comparedLevelText({comparisonLevels:[]}),'');
 assert.equal(comparisonLevelText({comparisonLevels:[2,3],deferredLevels:[3]}),'Compared at Level 2 / Level 3; Some Level 3 detail deferred','calculation text unchanged');
}));

test('every deferred record is listed once with its projection, and pairs without deferred detail add nothing',()=>{
 const wacos=app('VM-CN_WACOS_Szh5'),labels=app('VM-CN Auto labeling printing system'),args=pairArgs(wacos.id,labels.id);
 const snapshot=JSON.stringify(args),html=renderDeferredEvidence(args);
 const evidence=comparisonRecordEvidence(model,args.process,args.processBack),items=evidence.deferred.flat();
 assert.equal(items.length,15);
 assert.match(html,/Deferred detail · not used in the score \(15\)/);
 assert.equal((html.match(/<li>/g)||[]).length,15);
 for(const node of items)assert(html.includes(`<code>${displayCode(node.id)}</code>`)&&html.includes(`Compared under <code>${esc(displayCode(node.comparedId))}</code> · Level ${node.comparedLevel}`),node.id);
 assert.equal(JSON.stringify(args),snapshot,'rendering must not change evidence or scores');
 assert.doesNotMatch(renderComparisonRecords(args),/Deferred detail|detail deferred|Compared under/);
 assert.equal(renderDeferredEvidence(pairArgs(app('ARS').id,app('Iris').id)),'','ARS ↔ Iris compares exact codes; no deferred disclosure');
 assert.match(renderDeferredEvidence({...args,opened:new Set(['focusDeferred'])}),/id="focusDeferred" open>/,'an opened disclosure stays open on re-render');
 assert.match(renderDeferredEvidence({...args,id:'comparisonDeferred'}),/id="comparisonDeferred" >/);
});

test('the multi-application panel lists the same deferred detail inside How is this calculated?',()=>withUI((ui,document)=>{
 const ars=app('ARS'),agr=app('AGR w/ Camera');
 ui.open({poolIds:[ars.id,agr.id]});
 const html=document.getElementById('comparisonEvidence').innerHTML;
 assert.match(html,/30\.9<span class="score-denominator"> \/ 100<\/span>/,'score unchanged');
 const calculation=html.slice(html.indexOf('<summary>How is this calculated?</summary>'));
 assert(calculation.length>0);
 assert.match(calculation,/<details class="similarity-secondary comparison-deferred-evidence" id="comparisonDeferred" ><summary>Deferred detail · not used in the score \(1\)<\/summary>/);
 assert.match(calculation,/Compared under <code>B\.06\.5<\/code> · Level 2/);
 assert.equal((html.match(/Deferred detail/g)||[]).length,1);
 assert.doesNotMatch(html.slice(0,html.indexOf('<summary>How is this calculated?</summary>')),/Deferred detail|Compared under/);
}));

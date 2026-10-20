import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),app=name=>model.apps.find(app=>app.Name===name);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// State transitions use a small DOM double; browser layout and focus are checked separately.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},
  fire(type,event){for(const listener of this.listeners.get(type)||[])listener(event);},setAttribute(){},
  querySelectorAll(selector){return selector==='details'?this.details:selector==='[data-cell-target]'?this.cellButtons||[]:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function click(host,dataset={},attributes=[]){const button={dataset,hasAttribute:name=>attributes.includes(name)};host.fire('click',{target:{closest:()=>button}});}
function withUI(run,uiData=data){const previous=globalThis.document,document=stubDocument();globalThis.document=document;try{const ui=createComparisonUI({getModel:()=>model,getData:()=>uiData,escape:esc,isSignedIn:()=>true});ui.showPortfolio();run(ui,document);}finally{globalThis.document=previous;}}

test('choosing an application stops at candidates; choosing a peer preserves the search',()=>withUI((ui,doc)=>{
 doc.getElementById('browseApplications').onclick();
 click(doc.getElementById('similarityReview'),{startApp:app('Iris').id});
 assert.equal(ui.getState().focusPeerId,null);
 assert.match(doc.getElementById('focusResult').innerHTML,/Selected application/);
 assert.match(doc.getElementById('focusResult').innerHTML,/Comparison candidates/);
 assert.doesNotMatch(doc.getElementById('focusResult').innerHTML,/class="comparison-score"/);
 ui.restoreState({...ui.getState(),peerSearch:'RBCD B308'});
 assert.match(doc.getElementById('focusResult').innerHTML,/RBCD B308 AGV Traffic Control System/);
 assert.match(doc.getElementById('focusResult').innerHTML,/Code evidence · no complete score/);
 click(doc.getElementById('similarityReview'),{focusPeer:app('RBCD B308 AGV Traffic Control System').id});
 assert.equal(ui.getState().peerSearch,'RBCD B308');
 assert.match(doc.getElementById('focusResult').innerHTML,/<strong>Unavailable<\/strong>/);
 assert.match(doc.getElementById('focusResult').innerHTML,/Code evidence 70 \/ 100/);
 assert.equal(doc.getElementById('focusCandidates').open,false);
}));

test('selected chips remain visible across searches, can be filtered and individually removed',()=>withUI((ui,doc)=>{
 const ids=['ARS','Iris','RCS-2000'].map(name=>app(name).id);
 ui.open({poolIds:ids});
 doc.getElementById('selectionSearch').value='Iris';doc.getElementById('selectionSearch').oninput();
 for(const name of ['ARS','Iris','RCS-2000'])assert.ok(doc.getElementById('selectedApplications').innerHTML.includes(name));
 assert.match(doc.getElementById('comparisonMatrix').innerHTML,/Comparing 3 applications · 3 pairs/);
 doc.getElementById('showSelectedApplications').onclick();
 assert.equal(ui.getState().showSelectedOnly,true);assert.equal(doc.getElementById('selectionSearch').value,'');
 click(doc.getElementById('compareDialog'),{removeSelected:ids[1]});
 assert.deepEqual(ui.getState().selected,[ids[0],ids[2]]);
 assert.match(doc.getElementById('comparisonMatrix').innerHTML,/Comparing 2 applications · 1 pair/);
 click(doc.getElementById('compareDialog'),{removeSelected:ids[0]});
 assert.equal(ui.getState().cell,null);assert.match(doc.getElementById('comparisonMatrix').innerHTML,/Select at least two applications/);
 doc.getElementById('clearSelectedApplications').onclick();
 assert.equal(ui.getState().selected.length,0);assert.equal(ui.getState().showSelectedOnly,false);
}));

test('switching dimensions keeps the selected pair and reopens its weighted status group',()=>withUI((ui,doc)=>{
 const ids=['Control Tower','Physical Logistics','RBCC_CDP'].map(name=>app(name)?.id).filter(Boolean);
 // The stable fixture Iris–RCS-2000 has no full score and belongs to a folded group.
 const a=app('Iris').id,b=app('RCS-2000').id;ui.open({poolIds:[a,b,...ids]});
 click(doc.getElementById('compareDialog'),{cellTarget:a,cellPeer:b});
 for(const dim of ['cap','process','weighted']){click(doc.getElementById('compareDialog'),{matrixDim:dim});assert.deepEqual(ui.getState().cell,[a,b]);}
 assert.match(doc.getElementById('comparisonMatrix').innerHTML,/<details id="matrixPairGroup-0" open><summary>Code evidence · No complete score/);
}));

test('returning from a pair restores the multi-selection search, dimension, pair, expanded details and scroll',()=>withUI((ui,doc)=>{
 const ids=['ARS','Iris','RCS-2000'].map(name=>app(name).id);ui.open({poolIds:ids});
 const dialog=doc.getElementById('compareDialog'),details=[{id:'compareSelection',open:true},{id:'matrixPairGroup-0',open:true},{id:'',open:false}];dialog.details=details;
 doc.getElementById('selectionSearch').value='Iris';dialog.scrollTop=275;doc.getElementById('applicationChoices').scrollTop=42;
 click(dialog,{cellTarget:ids[1],cellPeer:ids[2]});
 click(dialog,{openSimilarityTarget:ids[1],openSimilarityPeer:ids[2]});
 assert.equal(dialog.open,false);assert.match(doc.getElementById('backToPairs').textContent,/selected applications/);
 details[1].open=false;dialog.scrollTop=0;doc.getElementById('selectionSearch').value='changed';
 doc.getElementById('backToPairs').onclick();
 assert.equal(dialog.open,true);assert.deepEqual(ui.getState().selected,ids);assert.deepEqual(ui.getState().cell,[ids[1],ids[2]]);
 assert.equal(ui.getState().dimension,'weighted');assert.equal(doc.getElementById('selectionSearch').value,'Iris');
 assert.equal(details[1].open,true);assert.equal(dialog.scrollTop,275);assert.equal(doc.getElementById('applicationChoices').scrollTop,42);
}));

test('returning from a portfolio pair restores its original page position and expanded results',()=>{
 const previous={scrollY:globalThis.scrollY,scrollTo:globalThis.scrollTo};let restored;
 globalThis.scrollY=624;globalThis.scrollTo=value=>{restored=value.top;};
 try{withUI((ui,doc)=>{
  const details=[{id:'portfolioOther',open:true}];doc.getElementById('similarityOverview').details=details;
  click(doc.getElementById('similarityReview'),{portfolioApp:app('ARS').id,portfolioPeer:app('Iris').id});
  details[0].open=false;doc.getElementById('backToPairs').onclick();assert.equal(restored,624);assert.equal(details[0].open,true);
 });}finally{globalThis.scrollY=previous.scrollY;globalThis.scrollTo=previous.scrollTo;}
});

test('legacy or damaged return state cannot select an invalid dimension or pair',()=>withUI((ui,doc)=>{
 ui.restoreState({...ui.getState(),focusAppId:app('ARS').id,focusPeerId:app('Iris').id,returnTo:{kind:'multi',state:{pool:['missing'],selected:['missing'],dimension:'unknown',cell:'wrong',details:{bad:true},search:null}}});
 assert.doesNotThrow(()=>doc.getElementById('backToPairs').onclick());
 assert.equal(ui.getState().dimension,'weighted');assert.equal(ui.getState().cell,null);assert.equal(ui.getState().pool.length,model.apps.length);
}));


test('no code evidence is claimed when both code weights are zero',()=>withUI((ui,doc)=>{
 const a=app('Iris').id,b=app('RCS-2000').id;
 ui.open({poolIds:[a,b]});
 assert.match(doc.getElementById('comparisonMatrix').innerHTML,/<summary>No complete score · 1<\/summary>/);
 assert.doesNotMatch(doc.getElementById('comparisonMatrix').innerHTML,/Code evidence/);
 ui.restoreState({...ui.getState(),focusAppId:a,focusPeerId:b});
 assert.doesNotMatch(doc.getElementById('focusResult').innerHTML,/shared codes remain/);
 assert.match(doc.getElementById('focusResult').innerHTML,/No shared words in the weighted text fields. A complete similarity score is unavailable./);
},{...data,similarityWeights:{name:.5,description:.5,cap:0,process:0}}));

test('weighted pair highlighting is symmetric while capability and process highlighting stays directional',()=>withUI((ui,doc)=>{
 const a=app('Iris').id,b=app('RCS-2000').id;ui.open({poolIds:[a,b]});
 const makeButton=(target,peer)=>({dataset:{cellTarget:target,cellPeer:peer},attributes:{},setAttribute(key,value){this.attributes[key]=value;}});
 const forward=makeButton(a,b),reverse=makeButton(b,a),dialog=doc.getElementById('compareDialog');dialog.cellButtons=[forward,reverse];
 click(dialog,{cellTarget:b,cellPeer:a});assert.equal(forward.attributes['aria-pressed'],'true');assert.equal(reverse.attributes['aria-pressed'],'true');
 for(const dimension of ['cap','process']){click(dialog,{matrixDim:dimension});assert.equal(forward.attributes['aria-pressed'],'false');assert.equal(reverse.attributes['aria-pressed'],'true');}
 click(dialog,{matrixDim:'weighted'});assert.equal(forward.attributes['aria-pressed'],'true');
}));

test('candidate groups show three first to leave other evidence groups discoverable; search reveals all matches',()=>withUI((ui,doc)=>{
 ui.restoreState({...ui.getState(),focusAppId:app('Iris').id,focusPeerId:null});
 let html=doc.getElementById('focusResult').innerHTML;
 const firstGroup=html.slice(html.indexOf('id="focusCandidates-complete"'),html.indexOf('id="focusCandidates-complete-more"'));
 assert.equal((firstGroup.match(/data-focus-peer=/g)||[]).length,3);
 assert.match(html,/<summary>Show \d+ more<\/summary>/);
 ui.restoreState({...ui.getState(),peerSearch:'R'});html=doc.getElementById('focusResult').innerHTML;
 assert.doesNotMatch(html,/<summary>Show \d+ more<\/summary>/);
}));

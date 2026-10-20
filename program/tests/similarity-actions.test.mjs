import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI,renderComparisonReadiness} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {createWeightedSimilarity} from '../public/weighted.mjs';
import {comparisonReadiness} from '../public/similarity-readiness.mjs';

const bundled=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const chosenNames=['AR Stock Taking','AUTO-RACK','Control Tower','Dolly call off program','Physical Logistics Management System'];
const chosen={...bundled,apps:bundled.apps.filter(app=>chosenNames.includes(app.Name))};
assert.equal(chosen.apps.length,5,'the walkthrough uses five real applications from the source inventory');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// State and delegated clicks use the same small DOM double as the comparison-flow tests.
// Native modal stacking, focus and responsive layout are checked separately in the browser.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],
  classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},
  fire(type,event){for(const listener of this.listeners.get(type)||[])listener(event);},setAttribute(){},
  querySelectorAll(selector){return selector==='details'?this.details:selector==='[data-cell-target]'?this.cellButtons||[]:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},
  showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function click(host,dataset={},attributes=[]){
 const button={dataset,hasAttribute:name=>attributes.includes(name)};
 host.fire('click',{target:{closest:()=>button}});
}
function withUI(run,data=chosen){
 const previous=globalThis.document,document=stubDocument(),model=buildModel(data),opened=[];
 globalThis.document=document;
 try{
  const ui=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true,
   onApp:id=>{opened.push(id);document.getElementById('detail').showModal();}});
  ui.showPortfolio();ui.open({poolIds:model.apps.map(app=>app.id)});
  run({ui,document,model,opened,html:()=>document.getElementById('comparisonMatrix').innerHTML});
 }finally{globalThis.document=previous;}
}
const readinessIds=html=>[...html.matchAll(/data-readiness-app="([^"]+)"/g)].map(match=>match[1]);
const pairButtons=html=>[...html.matchAll(/<button\b[^>]*data-cell-target="([^"]+)"[^>]*data-cell-peer="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];
const appByName=(model,name)=>model.apps.find(app=>app.Name===name);
const capabilityRows=[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Task']];
const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','Stage'],['T','L2','M.T.1.1','Area'],['T','L3','M.T.1.1.1','Task']];
const app=(ID,extra={})=>({ID,Name:`Warehouse ${ID}`,Description:'manage warehouse stock',
 'Business Capabilities':'B.06.1.1 Task',Processes:'BBM PM T Task L3',...extra});
const fixture=apps=>workspaceData({apps,capabilityRows,processRows});

test('five-application example turns four AUTO-RACK comparisons into one direct record-check entry',()=>withUI(({model,html})=>{
 const auto=appByName(model,'AUTO-RACK'),markup=html(),rows=pairButtons(markup);
 assert.match(markup,/Comparing 5 applications · 10 pairs/);
 assert.match(markup,/Check application records/);
 assert.deepEqual(readinessIds(markup),[auto.id]);
 assert.equal(rows.length,6,'all six comparisons among the four healthy applications remain accessible');
 assert(rows.every(row=>row[1]!==auto.id&&row[2]!==auto.id),'blocked AUTO-RACK comparisons are not repeated as normal pair buttons');
 const direct=markup.match(new RegExp(`<button\\b[^>]*data-readiness-app="${auto.id}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0]||'';
 assert.match(direct,/View details/);
 assert.match(direct,/1 Process record/i);
 assert.match(direct,/affects 4 comparisons/i);
 assert.doesNotMatch(markup,/Putaway to Automated Warehouse/,'record details stay inside View details');
}));

test('the four code-evidence comparisons remain grouped and each opens its own evidence',()=>withUI(({ui,document,model,html})=>{
 const markup=html(),codeGroup=markup.match(/<details\b[^>]*><summary>[^<]*Shared business classifications[^<]*<\/summary>([\s\S]*?)<\/details>/)?.[0]||'';
 assert.match(codeGroup,/compare actual uses/);
 assert.match(codeGroup,/4 pairs/);
 assert.equal(pairButtons(codeGroup).length,4);
 assert.equal((codeGroup.match(/data-open-similarity-target=/g)||[]).length,4,
  'each code-evidence pair has a direct action to its complete comparison');
 const a=appByName(model,'AR Stock Taking'),b=appByName(model,'Control Tower');
 click(document.getElementById('compareDialog'),{cellTarget:a.id,cellPeer:b.id,openSimilarityTarget:a.id,openSimilarityPeer:b.id});
 assert.deepEqual(ui.getState().cell,[a.id,b.id]);
 assert.equal(document.getElementById('compareDialog').open,false);
 assert.equal(ui.getState().focusAppId,a.id);
 assert.equal(ui.getState().focusPeerId,b.id);
 const evidence=document.getElementById('focusResult').innerHTML;
 assert(evidence.includes(esc(a.Name))&&evidence.includes(esc(b.Name)));
 document.getElementById('backToPairs').onclick();
 assert.equal(document.getElementById('compareDialog').open,true);
 assert.equal(ui.getState().selected.length,5);
 assert.deepEqual(ui.getState().cell,[a.id,b.id]);
}));

test('zero Process weight removes AUTO-RACK record work without changing the selected applications',()=>withUI(({ui,html})=>{
 assert.equal(ui.getState().selected.length,5);
 assert.deepEqual(readinessIds(html()),[]);
 assert.doesNotMatch(html(),/Check application records/);
 assert.equal(pairButtons(html()).length,10);
},{...chosen,similarityWeights:{name:.2,description:.3,cap:.5,process:0}}));

test('a pair with two unresolved sources lists each bad app once and never adds the healthy peer',()=>{
 const data=fixture([app('A',{Processes:'BBM PM T Unknown one L3'}),app('B',{Processes:'BBM PM T Unknown two L3'}),app('C')]);
 withUI(({html})=>{
  assert.deepEqual(new Set(readinessIds(html())),new Set(['A','B']));
  assert.equal(readinessIds(html()).length,2);
  assert.equal(pairButtons(html()).length,0,'the three blocked pairs are replaced by their two responsible apps');
 },data);
});

test('missing data and root-only evidence use the same application-level action instead of repeated pair rows',()=>{
 const data=fixture([app('A',{Description:''}),app('B',{Processes:'BBM PM T Root L0'}),app('C')]);
 withUI(({html})=>{
  assert.deepEqual(new Set(readinessIds(html())),new Set(['A','B']));
  assert.equal(readinessIds(html()).length,2);
  assert.equal(pairButtons(html()).length,0);
 },data);
});

test('opening record details preserves selected apps, search, pair, dialog state and scroll',()=>withUI(({ui,document,model,opened})=>{
 const dialog=document.getElementById('compareDialog'),a=appByName(model,'AR Stock Taking'),b=appByName(model,'Dolly call off program'),auto=appByName(model,'AUTO-RACK');
 click(dialog,{cellTarget:a.id,cellPeer:b.id});
 document.getElementById('selectionSearch').value='AUTO-RACK';document.getElementById('selectionSearch').oninput();
 dialog.scrollTop=238;document.getElementById('applicationChoices').scrollTop=47;
 const before=ui.getState(),matrix=document.getElementById('comparisonMatrix').innerHTML;
 click(dialog,{readinessApp:auto.id});
 assert.deepEqual(opened,[auto.id]);
 assert.equal(document.getElementById('detail').open,true);
 assert.equal(dialog.open,true,'the selection dialog remains underneath the application detail');
 document.getElementById('detail').close();
 assert.deepEqual(ui.getState(),before);
 assert.equal(document.getElementById('comparisonMatrix').innerHTML,matrix);
 assert.equal(dialog.scrollTop,238);
 assert.equal(document.getElementById('applicationChoices').scrollTop,47);
}));

test('refreshes do not duplicate the delegated details action',()=>withUI(({ui,document,model,opened})=>{
 const auto=appByName(model,'AUTO-RACK'),dialog=document.getElementById('compareDialog');
 ui.refresh();ui.refresh();ui.refresh();
 click(dialog,{readinessApp:auto.id});
 assert.deepEqual(opened,[auto.id]);
 document.getElementById('detail').close();
 click(dialog,{readinessApp:auto.id});
 assert.deepEqual(opened,[auto.id,auto.id]);
}));

test('excluded applications retain scope comparison outcomes instead of entering the record-check queue',()=>{
 const data=fixture([app('A',{Processes:'BBM PM T Unknown L3',scopeNote:'No score,not go-live'}),app('B'),app('C')]);
 withUI(({html})=>{
  assert.deepEqual(readinessIds(html()),[]);
  assert.equal(pairButtons(html()).length,3);
  assert.match(html(),/Out of scope/);
 },data);
});

test('unattributed comparison evidence remains accessible instead of silently disappearing',()=>{
 const model=buildModel(fixture([app('A'),app('B')])),original=createWeightedSimilarity(model).pair('A','B');
 const unknown=direction=>({...direction,coverage:null,components:direction.components.map(component=>
  component.key==='process'?{...component,score:null,result:null}:component)});
 const pair={...original,status:'incomplete',coverage:null,forward:unknown(original.forward),reverse:unknown(original.reverse)};
 const readiness=comparisonReadiness([pair]);
 assert.equal(readiness.pairCount,1);
 assert.equal(readiness.unattributedPairCount,1);
 assert.deepEqual(readiness.apps,[]);
 assert.deepEqual(readiness.unattributedPairs,[pair]);
 const markup=renderComparisonReadiness(readiness,esc);
 assert.match(markup,/Check comparison details/);
 const fallback=[...markup.matchAll(/<button\b[^>]*data-open-similarity-target="([^"]+)"[^>]*data-open-similarity-peer="([^"]+)"[^>]*>/g)];
 assert.deepEqual(fallback.map(match=>[match[1],match[2]]),[['A','B']]);
 assert.deepEqual(readinessIds(markup),[]);
 assert.match(markup,/Warehouse A/);
 assert.match(markup,/Warehouse B/);
});

test('record summaries count unique source entries when one entry has several reasons',()=>{
 const source=app('A'),entry={app:{...source,id:source.ID},pairCount:4,kinds:['Needs confirmation'],records:[
  {dimension:'process',kind:'Needs confirmation',raw:'BBM PM T Unknown L3',reason:'Source name needs confirmation.'},
  {dimension:'process',kind:'Needs confirmation',raw:'BBM PM T Unknown L3',reason:'The catalogue relationship needs confirmation.'}
 ]};
 const markup=renderComparisonReadiness({apps:[entry],pairCount:4,unattributedPairCount:0},esc);
 assert.match(markup,/1 process record to check/i);
 assert.doesNotMatch(markup,/2 process records/i);
 assert.match(markup,/affects 4 comparisons/);
 assert.deepEqual(readinessIds(markup),['A']);
 assert.doesNotMatch(markup,/BBM PM T Unknown L3/,'source details still require the explicit details action');
});

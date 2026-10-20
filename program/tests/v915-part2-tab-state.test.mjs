// V9.15 part 2 (owner request 2026-10-20): switching between Overview, Application landscape and Similarity check keeps
// the current comparison. Before V9.15 the Similarity check tab called Back to results and cleared both applications.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {tabFromSearch} from '../public/view-route.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),app=name=>model.apps.find(candidate=>candidate.Name===name);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split('\n');
const appLine=start=>{const line=appSource.find(text=>text.trim().startsWith(start));assert(line,`app.js still has ${start}`);return line;};

// DOM double. Unlike the shared one, setting innerHTML re-creates the <details> nodes and scroll lists it contains, as
// a browser does, so a test can tell whether open disclosures and scroll positions survive a re-render.
// Layout, focus and native history scrolling are checked in the browser.
const LISTS=['.customer-pairs','.focus-app-list','.diagnostic-pairs','.readiness-app-list'];
function stubDocument(){
 const nodes=new Map(),lists=new Map();
 const node=()=>({html:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],listeners:new Map(),
  get innerHTML(){return this.html;},
  set innerHTML(value){
   this.html=String(value);this.children=new Map();
   this.details=[...this.html.matchAll(/<details\b([^>]*)>/g)].map(match=>{
    const attributes=match[1].replace(/"[^"]*"/g,'""'),detail=node();
    detail.id=match[1].match(/\bid="([^"]*)"/)?.[1]||'';detail.open=/(^|\s)open(\s|$)/.test(attributes);
    if(detail.id)nodes.set(detail.id,detail);
    return detail;
   });
   for(const selector of LISTS)if(this.html.includes(selector.slice(1)))lists.set(selector,node());
  },
  classList:{toggle(){},add(){},remove(){}},
  addEventListener(type,listener,options){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({listener,once:!!options?.once});},
  fire(type,event){const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(item=>!item.once));for(const item of list)item.listener(event);},
  setAttribute(){},
  querySelectorAll(selector){
   if(selector==='details')return this.details;
   if(selector==='details[open][id]')return this.details.filter(detail=>detail.open&&detail.id);
   if(LISTS.includes(selector))return lists.has(selector)?[lists.get(selector)]:[];
   return [];
  },
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML=this.html+html;},scrollIntoView(){},focus(){},setSelectionRange(){},
  showModal(){this.open=true;},close(){this.open=false;this.fire('close',{});}});
 return {body:node(),list:selector=>lists.get(selector),getElementById(id){if(!nodes.has(id))nodes.set(id,Object.assign(node(),{id}));return nodes.get(id);}};
}
function click(host,dataset={},attributes=[]){const button={dataset,hasAttribute:name=>attributes.includes(name),focus(){}};host.fire('click',{target:{closest:()=>button}});}

// Runs the real app.js tab routing (tab buttons, showTab and the popstate handler) against the comparison UI.
function withApp(run){
 const previous={document:globalThis.document,scrollY:globalThis.scrollY,scrollTo:globalThis.scrollTo};
 const doc=stubDocument(),scrolls=[],handlers={};
 globalThis.document=doc;globalThis.scrollY=0;globalThis.scrollTo=({top})=>{scrolls.push(top);globalThis.scrollY=top;};
 try{
  const ui=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true,onApp(){}});
  const context={comparison:ui,model,document:doc,$:id=>doc.getElementById(id),tabFromSearch,location:{search:'?tab=opportunities'},
   window:{addEventListener(type,listener){handlers[type]=listener;}},overview:{refresh(){}},saveView(){},updateMatrixEdges(){},scrollActiveTab(){},handlingPopstate:false,lastNavTab:null};
  runInNewContext(['function activeTab(','function showOverview(','function showLandscape(','function showTab(',"window.addEventListener('popstate'","$('overviewTab').onclick","$('landscapeTab').onclick"].map(appLine).join('\n'),context);
  doc.getElementById('overviewWorkspace').hidden=true;doc.getElementById('landscapeWorkspace').hidden=true;
  ui.showPortfolio();
  const browser={back(search){context.location.search=search;handlers.popstate();},tab:()=>context.activeTab()};
  run({ui,doc,scrolls,browser,review:doc.getElementById('similarityReview')});
 }finally{
  globalThis.document=previous.document;
  if(previous.scrollY===undefined)delete globalThis.scrollY;else globalThis.scrollY=previous.scrollY;
  if(previous.scrollTo===undefined)delete globalThis.scrollTo;else globalThis.scrollTo=previous.scrollTo;
 }
}

const openKeys=root=>root.details.map((detail,index)=>detail.open?detail.id||'#'+index:null).filter(Boolean);
const focusDetail=(doc,matches)=>doc.getElementById('focusResult').details.find(matches);

// AR Stock Taking ↔ AUTO-RACK with a peer search, open disclosures (with and without ids), the chooser list scrolled
// and the page scrolled to 900.
function openArAutoRack({doc,review}){
 doc.getElementById('browseApplications').onclick();
 click(review,{startApp:app('AR Stock Taking').id});
 const search=doc.getElementById('focusPeerSearch');search.value='auto';search.selectionStart=4;
 review.fire('input',{target:search});
 click(review,{focusPeer:app('AUTO-RACK').id});
 const unnamed=doc.getElementById('focusResult').details.findIndex(detail=>!detail.id);
 assert(unnamed>=0,'the comparison has disclosures without an id');
 for(const id of ['focusCandidates','focusEvidence','focusDirections'])doc.getElementById(id).open=true;
 doc.getElementById('focusResult').details[unnamed].open=true;
 doc.getElementById('focusResult').querySelector('.focus-rank-list').scrollTop=130;
 globalThis.scrollY=900;
 return {opened:openKeys(doc.getElementById('focusResult'))};
}
const snapshot=(ui,doc)=>{const state=ui.getState();return {
 focusAppId:state.focusAppId,focusPeerId:state.focusPeerId,peerSearch:state.peerSearch,choosingApp:state.choosingApp,
 heading:doc.getElementById('focusHeading').textContent,opened:openKeys(doc.getElementById('focusResult')),
 peerList:doc.getElementById('focusResult').querySelector('.focus-rank-list').scrollTop,scrollY:globalThis.scrollY,
 similarityHidden:doc.getElementById('similarityReview').hidden};};

test('switching to Overview and back keeps both applications, the peer search, open details and scroll',()=>withApp(({ui,doc,scrolls,browser,review})=>{
 const {opened}=openArAutoRack({doc,review});
 doc.getElementById('overviewTab').onclick();
 assert.equal(browser.tab(),'overview');assert.equal(review.hidden,true);
 globalThis.scrollY=0;
 doc.getElementById('similarityTab').onclick();
 assert.equal(browser.tab(),'opportunities');
 assert.deepEqual(snapshot(ui,doc),{focusAppId:app('AR Stock Taking').id,focusPeerId:app('AUTO-RACK').id,peerSearch:'auto',choosingApp:false,
  heading:'3. View comparison evidence',opened,peerList:130,scrollY:900,similarityHidden:false});
 assert.match(doc.getElementById('focusResult').innerHTML,/value="auto"/);
 assert.match(doc.getElementById('focusResult').innerHTML,/AUTO-RACK/);
 assert.equal(scrolls.at(-1),900);
}));

test('browser back and forward restore the same comparison as the page tabs, for Overview and Application landscape',()=>withApp(({ui,doc,browser,review})=>{
 openArAutoRack({doc,review});
 const expected=snapshot(ui,doc);
 doc.getElementById('landscapeTab').onclick();
 assert.equal(browser.tab(),'landscape');globalThis.scrollY=40;
 doc.getElementById('similarityTab').onclick();
 const inPage=snapshot(ui,doc);
 browser.back('');
 assert.equal(browser.tab(),'overview');assert.equal(review.hidden,true);globalThis.scrollY=0;
 browser.back('?tab=opportunities');
 const history=snapshot(ui,doc);
 assert.deepEqual(inPage,expected);
 assert.deepEqual(history,expected);
 browser.back('?tab=landscape');assert.equal(browser.tab(),'landscape');
 browser.back('?tab=similarity');
 assert.deepEqual(snapshot(ui,doc),expected,'the older similarity tab name restores the same state');
}));

test('the Similarity check tab no longer returns to the results; Back to results still does',()=>withApp(({ui,doc,scrolls,review})=>{
 const overviewDetails=[{id:'',open:true}];doc.getElementById('similarityOverview').details=overviewDetails;
 globalThis.scrollY=624;
 click(review,{portfolioApp:app('ARS').id,portfolioPeer:app('Iris').id});
 globalThis.scrollY=300;overviewDetails[0].open=false;
 const html=doc.getElementById('focusResult').innerHTML;
 doc.getElementById('similarityTab').onclick();
 assert.equal(ui.getState().focusAppId,app('ARS').id,'clicking the current tab keeps the comparison');
 assert.equal(doc.getElementById('focusResult').innerHTML,html,'and does not rebuild it');
 doc.getElementById('overviewTab').onclick();doc.getElementById('similarityTab').onclick();
 assert.equal(ui.getState().focusPeerId,app('Iris').id);assert.equal(globalThis.scrollY,300);
 assert.match(doc.getElementById('backToPairs').textContent,/Back to results/);
 doc.getElementById('backToPairs').onclick();
 assert.equal(ui.getState().focusAppId,null);assert.equal(ui.getState().focusPeerId,null);
 assert.equal(doc.getElementById('similarityOverview').hidden,false);
 assert.equal(scrolls.at(-1),624,'Back to results returns to the original list position');
 assert.equal(overviewDetails[0].open,true);
}));

test('a comparison opened from the multi-application window still returns there after a page switch',()=>withApp(({ui,doc,review})=>{
 const ids=['ARS','Iris','RCS-2000','AR Stock Taking'].map(name=>app(name).id),dialog=doc.getElementById('compareDialog');
 ui.open({poolIds:ids,contextLabel:'Selected category'});
 doc.getElementById('selectionSearch').value='Iris';doc.getElementById('selectionSearch').oninput();
 click(dialog,{matrixDim:'process'});click(dialog,{cellTarget:ids[1],cellPeer:ids[2]});
 dialog.scrollTop=275;doc.getElementById('applicationChoices').scrollTop=42;
 click(dialog,{openSimilarityTarget:ids[1],openSimilarityPeer:ids[2]});
 assert.equal(dialog.open,false);
 doc.getElementById('overviewTab').onclick();doc.getElementById('similarityTab').onclick();
 assert.equal(ui.getState().focusAppId,ids[1]);assert.equal(ui.getState().focusPeerId,ids[2]);
 assert.equal(ui.getState().returnTo?.kind,'multi');
 assert.match(doc.getElementById('backToPairs').textContent,/Back to selected applications/);
 dialog.scrollTop=0;doc.getElementById('selectionSearch').value='changed';
 doc.getElementById('backToPairs').onclick();
 assert.equal(dialog.open,true);
 const state=ui.getState();
 assert.deepEqual([state.selected,state.dimension,state.cell,state.context,state.selectionSearch],[ids,'process',[ids[1],ids[2]],'Selected category','Iris']);
 assert.equal(dialog.scrollTop,275);assert.equal(doc.getElementById('applicationChoices').scrollTop,42);
 assert.equal(state.focusAppId,null);
}));

test('an open multi-application window survives browser back and forward with its selection, search, dimension and pair',()=>withApp(({ui,doc,browser,review})=>{
 const dialog=doc.getElementById('compareDialog'),ids=['AR Stock Taking','AUTO-RACK','Control Tower'].map(name=>app(name).id);
 doc.getElementById('compareMultipleApplications').onclick();
 for(const id of ids)dialog.fire('change',{target:{dataset:{selectApp:id},checked:true}});
 doc.getElementById('selectionSearch').value='Control';doc.getElementById('selectionSearch').oninput();
 click(dialog,{matrixDim:'cap'});click(dialog,{cellTarget:ids[0],cellPeer:ids[2]});
 doc.getElementById('compareSelection').open=false;dialog.scrollTop=180;doc.getElementById('applicationChoices').scrollTop=33;
 const before=ui.getState();
 browser.back('');
 assert.equal(browser.tab(),'overview');assert.equal(dialog.open,false,'going back to Overview does not leave the window over it');
 dialog.scrollTop=0;doc.getElementById('selectionSearch').value='';doc.getElementById('compareSelection').open=true;
 browser.back('?tab=opportunities');
 assert.equal(dialog.open,true);
 const after=ui.getState();
 for(const key of ['selected','dimension','cell','selectionSearch','pool','context'])assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(after.selected,ids);assert.equal(after.dimension,'cap');assert.deepEqual(after.cell,[ids[0],ids[2]]);
 assert.equal(dialog.scrollTop,180);assert.equal(doc.getElementById('applicationChoices').scrollTop,33);
 assert.equal(doc.getElementById('compareSelection').open,false);
}));

test('after a page switch, Change selected application changes the first application and Change comparison application the second',()=>withApp(({ui,doc,review})=>{
 openArAutoRack({doc,review});
 doc.getElementById('overviewTab').onclick();doc.getElementById('similarityTab').onclick();
 click(review,{focusPeer:app('Control Tower').id});
 assert.deepEqual([ui.getState().focusAppId,ui.getState().focusPeerId],[app('AR Stock Taking').id,app('Control Tower').id]);
 doc.getElementById('changeFocusApp').onclick();
 assert.equal(ui.getState().choosingApp,true);assert.equal(ui.getState().focusAppId,null);
 assert.equal(doc.getElementById('focusHeading').textContent,'1. Choose an application');
 click(review,{startApp:app('AUTO-RACK').id});
 assert.equal(ui.getState().focusAppId,app('AUTO-RACK').id);assert.equal(ui.getState().focusPeerId,null);
}));

test('the results page and the first step keep their lists, search and scroll after a page switch',()=>withApp(({ui,doc,review})=>{
 doc.getElementById('similarityOverview').details=[{id:'',open:true},{id:'',open:false}];
 doc.list('.customer-pairs').scrollTop=80;globalThis.scrollY=410;
 doc.getElementById('overviewTab').onclick();globalThis.scrollY=0;doc.getElementById('similarityTab').onclick();
 assert.equal(doc.list('.customer-pairs').scrollTop,80,'the rebuilt candidate list returns to the same position');
 assert.equal(globalThis.scrollY,410);
 assert.deepEqual(doc.getElementById('similarityOverview').details.map(detail=>detail.open),[true,false]);
 doc.getElementById('browseApplications').onclick();
 doc.getElementById('focusAppSearch').value='Logistic';doc.getElementById('focusAppSearch').oninput();
 doc.list('.focus-app-list').scrollTop=55;globalThis.scrollY=220;
 doc.getElementById('landscapeTab').onclick();globalThis.scrollY=0;doc.getElementById('similarityTab').onclick();
 assert.equal(ui.getState().choosingApp,true);assert.equal(ui.getState().focusAppSearch,'Logistic');
 assert.match(doc.getElementById('focusResult').innerHTML,/Logistic/);
 assert.equal(doc.list('.focus-app-list').scrollTop,55);assert.equal(globalThis.scrollY,220);
}));

test('leaving twice keeps the first position, and a first visit opens Similarity check as before',()=>withApp(({ui,doc,scrolls,review})=>{
 review.hidden=true;scrolls.length=0;
 doc.getElementById('similarityTab').onclick();
 assert.equal(review.hidden,false);assert.equal(ui.getState().focusAppId,null);
 assert.deepEqual(scrolls,[],'nothing was recorded, so the page position is left alone');
 globalThis.scrollY=350;
 doc.getElementById('overviewTab').onclick();
 const state=ui.getState();globalThis.scrollY=999;
 ui.leave();doc.getElementById('landscapeTab').onclick();
 assert.deepEqual(ui.getState(),state,'leaving a hidden Similarity check changes nothing');
 doc.getElementById('similarityTab').onclick();
 assert.equal(globalThis.scrollY,350);
}));

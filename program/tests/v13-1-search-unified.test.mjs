// V13.1 (owner choice 2026-10-22): every application search box has the same name ('Find applications'), the same
// hint and the same rule — each word typed must appear in the application's name, ID, plant or business unit. The
// Application landscape also keeps its category search. The comparison window has one Clear selection, not two.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {matchesApplication,searchApplications,APP_SEARCH_LABEL,APP_SEARCH_PLACEHOLDER} from '../public/app-search.mjs';
import {filterOverviewApplications} from '../public/overview.mjs';
import {filterLandscape} from '../public/landscape.mjs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';

const model=buildModel(workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'))));
const app=name=>model.apps.find(a=>a.Name===name);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const source=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');

// Small DOM double, as in similarity-flow-v9: state and rendered markup, not browser layout.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},
  fire(type,event){for(const listener of this.listeners.get(type)||[])listener(event);},setAttribute(){},
  querySelectorAll(selector){return selector==='details'?this.details:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},setSelectionRange(){},showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,Object.assign(node(),{id}));return nodes.get(id);}};
}
function click(host,dataset={}){const button={dataset,hasAttribute:()=>false};host.fire('click',{target:{closest:()=>button}});}
function withUI(run){const previous=globalThis.document,document=stubDocument();globalThis.document=document;try{const ui=createComparisonUI({getModel:()=>model,getData:()=>model,escape:esc,isSignedIn:()=>true});ui.showPortfolio();run(ui,document);}finally{globalThis.document=previous;}}

test('one rule: every word must appear in the name, plant or business unit, or begin the ID',()=>{
 const a={Name:'RBCW LOM Dashboard',id:'88f9245b-a883',Entity:'RBCW',Division:'PS'};
 for(const query of ['dashboard','LOM dash','88F9245B','88f9245b-a883','8','rbcw','ps','rbcw ps dash','  Dashboard   RBCW ','ＲＢＣＷ ｄａｓｈ',''])assert.equal(matchesApplication(a,query),true,query);
 for(const query of ['rbcw em','dashboards','B.06.3','a883','245b','-'])assert.equal(matchesApplication(a,query),false,query);
 assert.equal(matchesApplication({Name:'X',ID:'LEANIX-1'},'leanix-1'),true,'the ID column of a workbook row counts too');
 // Review finding (V13.1): IDs are generated codes, so a fragment from the middle must not match. Before this, 'de'
 // in a comparison picker listed AUTO-RACK (ID b97561de-…) and Select visible selected it.
 const rack=app('AUTO-RACK');assert.equal(matchesApplication(rack,'de'),false);assert.equal(matchesApplication(rack,'b97561de'),true);
 assert.equal(matchesApplication({Name:null},'x'),false);
 assert.deepEqual([APP_SEARCH_LABEL,APP_SEARCH_PLACEHOLDER],['Find applications','Name, ID, plant or business unit']);
});

test('the title search, the landscape, the Overview list and the three comparison pickers find the same applications',()=>{
 const target=app('RBCW LOM Dashboard'),other=app('AUTO-RACK');
 const queries=['RBCW LOM Dashboard','lom dash',target.id.slice(0,8),'RBCW PS dashboard','ＲＢＣＷ ｌｏｍ ｄａｓｈ'];
 for(const query of queries){
  assert(searchApplications(model.apps,query,100).includes(target),`title search: ${query}`);
  assert(filterOverviewApplications(model.apps,{query}).includes(target),`Overview list: ${query}`);
  assert(filterLandscape(model,'cap',{query}).apps.includes(target),`landscape: ${query}`);
  assert(!filterOverviewApplications(model.apps,{query}).includes(other),`not AUTO-RACK: ${query}`);
 }
 // By business unit everywhere (the comparison pickers could not search by ID before V13.1, nor by business unit
 // in the multiple-application window).
 const ps=model.apps.filter(a=>a.Division==='PS').length;
 assert.equal(filterOverviewApplications(model.apps,{query:'ps'}).filter(a=>a.Division==='PS').length,ps);
 withUI((ui,doc)=>{
  doc.getElementById('compareMultipleApplications').onclick();
  const choices=query=>{const input=doc.getElementById('selectionSearch');input.value=query;input.oninput();return doc.getElementById('applicationChoices').innerHTML;};
  for(const query of queries){const html=choices(query);assert(html.includes(esc(target.Name)),`compare multiple: ${query}`);assert(!html.includes('>AUTO-RACK<'),`compare multiple, not AUTO-RACK: ${query}`);}
  doc.getElementById('compareDialog').close();
  doc.getElementById('browseApplications').onclick();
  const first=query=>{const input=doc.getElementById('focusAppSearch');input.value=query;input.oninput();return doc.getElementById('focusResult').innerHTML;};
  for(const query of queries){const html=first(query);assert(html.includes(esc(target.Name)),`compare an application, step 1: ${query}`);assert(!html.includes('AUTO-RACK'),`step 1, not AUTO-RACK: ${query}`);}
  first('');click(doc.getElementById('similarityReview'),{startApp:app('Iris').id});
  const peers=query=>{const input=doc.getElementById('focusPeerSearch');input.value=query;input.selectionStart=query.length;doc.getElementById('similarityReview').fire('input',{target:input});return doc.getElementById('focusResult').innerHTML;};
  for(const query of queries){const html=peers(query);assert(html.includes(esc(target.Name)),`compare an application, step 2: ${query}`);assert(!html.includes('AUTO-RACK'),`step 2, not AUTO-RACK: ${query}`);}
 });
});

test('the landscape keeps its category search on top of the common rule',()=>{
 const names=filterLandscape(model,'cap',{query:'transport management'}).apps.map(a=>a.Name);
 assert(names.includes('RBCW E-Queue system'),'found through its Transport Management category');
 assert.equal(filterLandscape(model,'process',{query:'M.I2D.10'}).apps.length,20,'displayed process codes still work');
 // Review finding (V13.1): categories are matched as one phrase, as before, so a name or plant search finds the same
 // applications as the other boxes. Word by word, 'RBCD LOG' had matched 12 applications through 'Logistics …' labels.
 for(const view of ['cap','process'])for(const query of ['RBCD LOG','AR Stock','Supply Chain Management System','rbcw ps']){
  const ids=list=>list.map(a=>a.id).sort();
  assert.deepEqual(ids(filterLandscape(model,view,{query}).apps),ids(filterOverviewApplications(model.apps,{query})),`${view}: ${query}`);
 }
 assert.deepEqual(filterLandscape(model,'cap',{query:'RBCD LOG'}).apps.map(a=>a.Name).sort(),['Physical Logistics Management System','RBCD LOG Xone']);
});

test('a short ID fragment no longer lists unrelated applications in the comparison window',()=>withUI((ui,doc)=>{
 doc.getElementById('compareMultipleApplications').onclick();
 const input=doc.getElementById('selectionSearch');input.value='de';input.oninput();
 const html=doc.getElementById('applicationChoices').innerHTML;
 assert(html.includes('DEMOS#CGD'));assert(!html.includes('>AUTO-RACK<'),'AUTO-RACK only has "de" inside its ID');
 doc.getElementById('selectVisible').onclick();
 assert.deepEqual(ui.getState().selected.map(id=>model.apps.find(a=>a.id===id).Name),['DEMOS#CGD']);
}));

test('all six boxes are called Find applications and show the same hint; no old wording remains',()=>{
 const html=source('index.html');
 assert(html.includes(`aria-label="${APP_SEARCH_LABEL}" aria-keyshortcuts="/" placeholder="${APP_SEARCH_PLACEHOLDER}"`),'title search');
 assert(html.includes('<kbd class="app-search-key" aria-hidden="true" title="Press / to search">/</kbd>'));
 assert(html.includes(`<label>${APP_SEARCH_LABEL}<input id="landscapeSearch" type="search" placeholder="Name, ID, plant, business unit or category"`),'landscape names its extra search');
 assert(source('overview.mjs').includes(`'+APP_SEARCH_LABEL+'<input id="overviewDetailSearch" type="search" placeholder="'+APP_SEARCH_PLACEHOLDER+'"`),'Overview list');
 withUI((ui,doc)=>{
  doc.getElementById('compareMultipleApplications').onclick();
  assert(doc.getElementById('compareDialog').innerHTML.includes(`<label>${APP_SEARCH_LABEL}<input id="selectionSearch" type="search" placeholder="${APP_SEARCH_PLACEHOLDER}"`),'compare multiple');
  assert(doc.getElementById('similarityReview').innerHTML.includes(`for="focusAppSearch">${APP_SEARCH_LABEL}<input id="focusAppSearch" type="search" placeholder="${APP_SEARCH_PLACEHOLDER}"`),'step 1');
  doc.getElementById('compareDialog').close();doc.getElementById('browseApplications').onclick();click(doc.getElementById('similarityReview'),{startApp:app('Iris').id});
  assert(doc.getElementById('focusResult').innerHTML.includes(`<label class="focus-peer-search">${APP_SEARCH_LABEL}<input id="focusPeerSearch" type="search" placeholder="${APP_SEARCH_PLACEHOLDER}"`),'step 2');
 });
 const files=readdirSync(new URL('../public/',import.meta.url)).filter(f=>/\.(html|js|mjs)$/.test(f));
 for(const old of ['Search applications','>Find application<','Find application<input','Find an application','Name or plant','Name, plant or business unit','Application name, ID or plant','classification code'])
  for(const file of files)assert(!source(file).includes(old),`${file} still says "${old}"`);
});

test('the comparison window has one Clear selection, next to the selected count, and it clears the selection',()=>withUI((ui,doc)=>{
 const ids=model.apps.slice(0,3).map(a=>a.id);
 ui.open({poolIds:ids,contextLabel:'Three'});
 const html=doc.getElementById('compareDialog').innerHTML;
 assert.equal((html.match(/>Clear selection<\/button>/g)||[]).length,1);
 assert.match(html,/<div class="selected-applications-head"><strong id="selectedApplicationsCount" role="status"><\/strong><button id="showSelectedApplications" aria-pressed="false">View selected<\/button><button id="clearSelectedApplications">Clear selection<\/button><\/div>/);
 assert(!source('similarity-ui.mjs').includes("'clearSelection'")&&!html.includes('id="clearSelection"'));
 for(const id of ids)doc.getElementById('compareDialog').fire('change',{target:{dataset:{selectApp:id},checked:true}});
 assert.equal(ui.getState().selected.length,3);
 doc.getElementById('clearSelectedApplications').onclick();
 assert.equal(ui.getState().selected.length,0);
}));

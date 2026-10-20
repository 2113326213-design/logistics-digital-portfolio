import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI,comparisonIdentities} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {scopeReason} from '../public/display.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initial=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));

// Minimal DOM double exercises rendering/state transitions, not browser layout.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,listener){this.listeners??=new Map();if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},fire(type,event){for(const listener of this.listeners?.get(type)||[])listener(event);},setAttribute(){},querySelectorAll(){return [];},querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}

test('comparison identities stay outside collapsed details and escape source text',()=>{
 const html=comparisonIdentities({Name:'A <script>',Entity:'Plant A',Division:'PS'},{Name:'B & partner'},esc);
 assert.match(html,/Application A/);assert.match(html,/A &lt;script&gt;/);assert.match(html,/Application B/);assert.match(html,/B &amp; partner/);
 assert.match(html,/Plant not recorded/);assert.doesNotMatch(html,/<details|<script>/);
});

test('comparison rendering handles a single-app workspace and a removed selected app',()=>{
 const oldDocument=globalThis.document;const document=stubDocument();globalThis.document=document;
 try{
  let data=initial,model=buildModel(data);
  const candidates=model.apps.filter(app=>!scopeReason(app)),a=candidates[0],b=candidates[1];
  const ui=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true});
  ui.restoreState({focusAppId:a.id,focusPeerId:b.id});
  const detail=document.getElementById('focusResult').innerHTML;
  assert.match(detail,/comparison-identities/);assert.ok(detail.includes(esc(a.Name)));assert.ok(detail.includes(esc(b.Name)));
  data={...initial,apps:initial.apps.filter(app=>app.ID===a.id)};model=buildModel(data);ui.refresh();
  assert.match(document.getElementById('focusResult').innerHTML,/No other applications are available to compare/);
  assert.equal(ui.getState().focusPeerId,null);
  data={...initial,apps:initial.apps.filter(app=>app.ID===b.id)};model=buildModel(data);ui.refresh();
  assert.equal(ui.getState().focusAppId,null);
  assert.doesNotMatch(document.getElementById('focusResult').innerHTML,/comparison-identities/);
 }finally{globalThis.document=oldDocument;}
});

test('legacy review URL migration tolerates restricted file-browser history',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {searchForTab}=await import('../public/view-route.mjs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const migration=app.split('\n').find(line=>line.startsWith("if(new URLSearchParams(location.search).get('tab')==='review')"));
 assert.ok(migration);
 assert.doesNotThrow(()=>runInNewContext(migration,{URL,URLSearchParams,searchForTab,location:{search:'?tab=review',href:'file:///offline.html?tab=review'},history:{replaceState(){throw new Error('URL updates restricted');}}}));
});

test('replacing workspace closes stale application details before rerender',async()=>{
 const {runInNewContext}=await import('node:vm');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const useData=app.split('\n').find(line=>line.trim().startsWith('function useData('));
 const sequence=[];const detail={open:true,close(){sequence.push('close');this.open=false;}};
 runInNewContext(`${useData}; useData({apps:[]});`,{workspaceData:value=>value,buildModel:value=>value,expanded:{clear(){}},$:()=>detail,render(){sequence.push('render');}});
 assert.deepEqual(sequence,['close','render']);
});


test('multi-application entry expands selection to all categories and compares each selected pair',()=>{
 const oldDocument=globalThis.document,document=stubDocument();globalThis.document=document;
 try{
  const model=buildModel(initial),ars=model.apps.find(app=>app.Name==='ARS'),iris=model.apps.find(app=>app.Name==='Iris');
  const other=model.apps.find(app=>!scopeReason(app)&&app.id!==ars.id&&app.id!==iris.id&&!app.capLeaf.some(code=>ars.capLeaf.includes(code)));
  assert(other,'fixture includes a different category');
  const ui=createComparisonUI({getModel:()=>model,getData:()=>initial,escape:esc,isSignedIn:()=>true});
  ui.open({poolIds:[ars.id,iris.id],contextLabel:'Selected category'});
  assert.equal(ui.getState().pool.length,2);
  document.getElementById('selectionSearch').value='old category search';
  document.getElementById('compareMultipleApplications').onclick();
  assert.equal(document.getElementById('compareDialog').open,true);
  assert.equal(document.getElementById('compareSelection').open,true);
  assert.equal(ui.getState().pool.length,model.apps.length);
  assert.equal(ui.getState().context,'All applications');
  assert.equal(document.getElementById('selectionSearch').value,'');
  assert(document.getElementById('applicationChoices').innerHTML.includes(esc(other.Name)));
  assert.equal(ui.getState().selected.length,2,'existing choices are retained, not all applications selected');
  document.getElementById('compareDialog').fire('change',{target:{dataset:{selectApp:other.id},checked:true}});
  assert.equal(ui.getState().selected.length,3);
  assert.match(document.getElementById('comparisonMatrix').innerHTML,/Comparing 3 applications · 3 pairs/);
  assert.equal((document.getElementById('comparisonMatrix').innerHTML.match(/data-cell-target=/g)||[]).length,3);
  document.getElementById('selectionSearch').value=other.Name;
  document.getElementById('selectionSearch').oninput();
  assert.equal(ui.getState().selected.length,3,'search does not discard selected applications in other categories');
  document.getElementById('clearSelection').onclick();
  assert.equal(ui.getState().selected.length,0);
  assert.equal(document.getElementById('exportSelection').disabled,true);
  assert.match(document.getElementById('comparisonMatrix').innerHTML,/Select at least two applications/);
 }finally{globalThis.document=oldDocument;}
});

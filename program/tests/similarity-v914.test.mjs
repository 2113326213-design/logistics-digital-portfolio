// V9.14 (owner request 2026-10-20, "小问题修改一下"): the screening outcomes hidden in V9.11 are no longer built, and
// closing application details opened from "Check application records" returns focus to the entry that opened them.
import {RECORDS_V916} from './records-v916.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';

const data=workspaceData(JSON.parse(readFileSync(RECORDS_V916)));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// A small DOM double; unlike the shared one, close() dispatches 'close' as a native dialog does.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],entries:[],
  classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener,options){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({listener,once:!!options?.once});},
  fire(type,event){const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(item=>!item.once));for(const item of list)item.listener(event);},
  setAttribute(){},
  querySelectorAll(selector){return selector==='details'?this.details:selector==='[data-readiness-app]'?this.entries:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},
  showModal(){this.open=true;},close(){this.open=false;this.fire('close',{});}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function withUI(run){
 const previous=globalThis.document,document=stubDocument(),model=buildModel(data),opened=[];
 globalThis.document=document;
 try{
  const ui=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true,onApp:id=>{opened.push(id);document.getElementById('detail').showModal();}});
  ui.showPortfolio();
  run({ui,document,model,opened});
 }finally{globalThis.document=previous;}
}
const entry=(id,log)=>({dataset:{readinessApp:id},hasAttribute:()=>false,focus(options){log.push([id,options]);}});
const clickOn=(host,button)=>host.fire('click',{target:{closest:()=>button}});

test('the hidden screening outcomes are not built; record checks and their affected pairs remain',()=>withUI(({document,model})=>{
 const html=document.getElementById('portfolioProvisional').innerHTML;
 assert.doesNotMatch(html,/portfolioOtherOutcomes|View other comparison results|<summary>(Below threshold|No shared registrations|No complete score|Out of scope) · /);
 // 2026-10-21 (V9.16, LeanIX export 20261020_083736_UKj4Y_inventory.xlsx merged by ID): counts re-derived from public/data.json with
 // comparisonReadiness/pairResultLabel. ShzP_Pad system (B.06 root → B.06.5) and VMCN_Digital Dynamic Supermarket (lost the uncatalogued
 // B.06.4.4) left the record checks: 19 → 17 applications, 1,159 → 1,054 pairs (More detail needed 214 → 109, Needs confirmation still 945);
 // the hidden screening outcomes are 635+201+582+365 = 1,783 pairs (were 1,684).
 // V19.1 union (owner 2026-10-23, "也按并集"): a process record with a level is in LeanIX and no longer pending in the
 // similarity check. Re-derived with comparisonReadiness/pairResultLabel at the default threshold of 50: the 11 applications
 // whose only records to check were such processes left the record checks (AUTO-RACK, RBCD LOM Scrap Management Platform,
 // RBCD WI management system, RBCW Auto Warehouse Management System, RBCW E-Queue system, RBHP_LOG_QualManager, ShzP_DAVIS,
 // Szh5_ASRS_WCS_WMS, VM-CN_WACOS_Szh5, VM/LOG-Szh2_DAVIS, VMCN_iSCMP); 6 remain (the two L0 chains and four records without
 // a level), each in 70 pairs: 6 × 70 − 15 shared = 405 pairs (were 17 × 70 − 136 = 1,054). Needs confirmation 945 → 274;
 // the 671 pairs now have a normal result (369 Below threshold, 180 No shared registrations, 96 No complete score,
 // 22 More detail needed, 4 Potential overlap), so More detail needed is 109 → 131 and the hidden screening outcomes are
 // 1,004+297+762+365 = 2,428 pairs.
 assert.match(html,/Check application records · 6 applications/);
 assert.match(html,/View affected comparisons · 405 pairs/);
 const buttons=(html.match(/<button\b/g)||[]).length;
 assert.equal(buttons,6+405,'6 application entries and the 405 affected pairs; the 2,428 hidden pair buttons are gone');
 const listed=name=>html.includes(`data-readiness-app="${esc(model.apps.find(a=>a.Name===name).id)}"`);
 assert(!listed('AUTO-RACK'),'a process in LeanIX is no record to check');
 assert(listed('RBCC I4.0 Visualization (Davis)'),'a process record without a level still is');
}));

// V19.1 union (owner 2026-10-23, "也按并集"): AUTO-RACK's only record to check (a process with a level, in LeanIX) is no
// longer one, so it has no entry; the entry used is RBCC I4.0 Visualization (Davis), still listed for a process record
// without a level.
const listedApp=model=>model.apps.find(a=>a.Name==='RBCC I4.0 Visualization (Davis)');
test('closing the details returns focus to the entry that opened them',()=>withUI(({document,model,opened})=>{
 const review=document.getElementById('similarityReview'),auto=listedApp(model),log=[];
 assert(document.getElementById('portfolioProvisional').innerHTML.includes(`data-readiness-app="${esc(auto.id)}"`),'the application has an entry');
 const button=entry(auto.id,log);
 clickOn(review,button);
 assert.deepEqual(opened,[auto.id]);assert.equal(document.getElementById('detail').open,true);
 assert.deepEqual(log,[],'no focus change while the details are open');
 document.getElementById('detail').close();
 assert.deepEqual(log,[[auto.id,{preventScroll:true}]]);
 document.getElementById('detail').close();
 assert.equal(log.length,1,'the listener runs once');
}));

test('after a refresh, focus goes to the re-rendered entry for the same application',()=>withUI(({document,model})=>{
 const review=document.getElementById('similarityReview'),auto=listedApp(model);
 const originalLog=[],rerenderedLog=[],otherLog=[];
 const original=entry(auto.id,originalLog),rerendered=entry(auto.id,rerenderedLog),other=entry('someone-else',otherLog);
 clickOn(review,original);
 review.entries=[other,rerendered];
 document.getElementById('detail').close();
 assert.deepEqual([originalLog.length,rerenderedLog.length,otherLog.length],[0,1,0]);
}));

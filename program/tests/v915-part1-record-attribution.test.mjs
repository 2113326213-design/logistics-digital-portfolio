// V9.15 part 1 (owner request 2026-10-20): in the single-pair comparison each record problem is shown once, attributed to
// the application that has to be checked, with View details leading to that application's issue. A branch held back by
// the other application's unconfirmed records is not "More detail needed"; a real too-coarse registration still is.
import {RECORDS_V916} from './records-v916.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComparisonUI,renderPairReadiness,renderComparisonReadiness,readinessRecordSummary} from '../public/similarity-ui.mjs';
import {comparisonRecordEvidence,renderComparisonRecords,branchGapCause} from '../public/comparison-records.mjs';
import {comparisonReadiness} from '../public/similarity-readiness.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {pairResultLabel} from '../public/pair-status.mjs';
import {processIssues,capabilityIssues,renderProcessIssues,renderCapabilityIssues,focusApplicationIssue} from '../public/process-issues.mjs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';

const data=workspaceData(JSON.parse(readFileSync(RECORDS_V916)));
const model=buildModel(data),app=name=>model.apps.find(item=>item.Name===name);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cap=createSimilarity(model,'cap'),process=createSimilarity(model,'process'),weighted=createWeightedSimilarity(model,DEFAULT_WEIGHTS);
const args=(a,b)=>({model,cap:cap.compare(a.id,b.id),capBack:cap.compare(b.id,a.id),process:process.compare(a.id,b.id),processBack:process.compare(b.id,a.id),escape:esc});
const evidence=(index,a,b)=>comparisonRecordEvidence(model,index.compare(a.id,b.id),index.compare(b.id,a.id));
// The comparison page above How the score is calculated (the full calculation keeps every branch reason).
const mainArea=html=>html.split('id="focusEvidence"')[0];
const capabilityPart=html=>html.split('<h5>Process</h5>')[0],processPart=html=>html.split('<h5>Process</h5>')[1].split('id="focusUnique"')[0];
const putaway='BBM PM I2D Putaway to Automated Warehouse L3V';
// The same helpers for another dataset.
function context(d){
 const m=buildModel(d),c=createSimilarity(m,'cap'),p=createSimilarity(m,'process');
 return {data:d,model:m,app:name=>m.apps.find(item=>item.Name===name),cap:c,process:p,weighted:createWeightedSimilarity(m,DEFAULT_WEIGHTS),
  evidence:(index,a,b)=>comparisonRecordEvidence(m,index.compare(a.id,b.id),index.compare(b.id,a.id)),
  args:(a,b)=>({model:m,cap:c.compare(a.id,b.id),capBack:c.compare(b.id,a.id),process:p.compare(a.id,b.id),processBack:p.compare(b.id,a.id),escape:esc})};
}
// Registrations as recorded before the LeanIX export of 2026-10-20 (V9.16, 2026-10-21). The import event keeps each changed
// field's previous value. Since that export no bundled application records a capability only at the B.06 root (RBCW Auto
// Warehouse Management System, ShzP_Pad system and Szh5_ASRS_WCS_WMS now record B.06.5) and none has an empty Processes
// field (VMCN_CONNEX gained a record), so those cases are checked on these earlier, real records.
const exportEvent=data.importHistory.find(event=>event.inventoryFile==='20261020_083736_UKj4Y_inventory.xlsx');
function recordedBefore(fields){
 const wanted=fields.map(([name,field])=>{const id=app(name).id,change=exportEvent.changes.find(c=>c.appId===id&&c.field===field);assert(change&&!change.truncated,`${name} ${field}`);return change;});
 return workspaceData({...data,apps:data.apps.map(a=>{let next=a;for(const c of wanted)if(c.appId===String(a.ID).trim())next={...next,[c.field]:c.before};return next;})});
}
const earlier=context(recordedBefore([['RBCW Auto Warehouse Management System','Business Capabilities'],['ShzP_Pad system','Business Capabilities'],['Szh5_ASRS_WCS_WMS','Business Capabilities'],['VMCN_CONNEX','Processes']]));

// A small DOM double (as in similarity-v914): close() dispatches 'close' like a native dialog.
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},scrollTop:0,scrollLeft:0,details:[],entries:[],
  classList:{toggle(){},add(){},remove(){}},listeners:new Map(),
  addEventListener(type,listener,options){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({listener,once:!!options?.once});},
  fire(type,event){const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(item=>!item.once));for(const item of list)item.listener(event);},
  setAttribute(){},setSelectionRange(){},
  querySelectorAll(selector){return selector==='details'?this.details:selector==='[data-readiness-app]'?this.entries:[];},
  querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},
  insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},focus(){},
  showModal(){this.open=true;},close(){this.open=false;this.fire('close',{});}});
 return {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function withUI(run,on={model,data}){
 const previous=globalThis.document,document=stubDocument(),opened=[];
 globalThis.document=document;
 try{
  const ui=createComparisonUI({getModel:()=>on.model,getData:()=>on.data,escape:esc,isSignedIn:()=>true,onApp:(...call)=>{opened.push(call);document.getElementById('detail').showModal();}});
  ui.showPortfolio();
  const showPair=(a,b,extra={})=>{ui.restoreState({...ui.getState(),focusAppId:a.id,focusPeerId:b.id,...extra});return document.getElementById('focusResult').innerHTML;};
  run({ui,document,opened,showPair});
 }finally{globalThis.document=previous;}
}
const pairRows=html=>[...html.matchAll(/<button class="readiness-app-action" data-readiness-app="([^"]+)" data-readiness-scope="pair"><span><strong>([^<]+)<\/strong> · ([^<]+)<\/span><span>View details →<\/span><\/button>/g)].map(match=>[match[1],match[2],match[3]]);
const click=(host,button)=>host.fire('click',{target:{closest:()=>button}});
const entry=(dataset,log=[])=>({dataset,hasAttribute:()=>false,focus(options){log.push([dataset.readinessApp,dataset.readinessScope,options]);}});

test('AR Stock Taking ↔ AUTO-RACK: one AUTO-RACK process record to check, never also "More detail needed"',()=>withUI(({showPair})=>{
 const ar=app('AR Stock Taking'),rack=app('AUTO-RACK'),pair=weighted.pair(ar.id,rack.id);
 // Scores, labels and branches are unchanged; only the presentation of the held-back branch changes.
 assert.equal(pairResultLabel(pair,50),'Needs confirmation');assert.equal(pair.coverage,null);
 const forward=process.compare(ar.id,rack.id),held=forward.branches.find(branch=>branch.coverage===null);
 assert.equal(held.reason,'对方在此分支仍有未确认的分类。');
 assert.deepEqual(branchGapCause('process',forward,held),{cause:'unconfirmed',owner:'peer'});
 const records=evidence(process,ar,rack);
 assert.deepEqual(records.gaps,[],'the branch held back by AUTO-RACK\'s unconfirmed record is not missing detail');
 assert.deepEqual(records.sides[1].unconfirmed.map(record=>record.raw),[putaway]);
 const html=showPair(ar,rack);
 assert.deepEqual(pairRows(html),[[rack.id,'AUTO-RACK','1 process record to check']],'only AUTO-RACK, once');
 assert.doesNotMatch(mainArea(html),/More detail needed|Peer classifications in this branch are not yet confirmed/);
 assert.match(html,/<em class="comparison-status">Needs confirmation<\/em>/);
 // Shown once (V9.15 integration): neither the status note nor Records not yet confirmed repeats AUTO-RACK's record;
 // the original record and its reason stay in the evidence and in AUTO-RACK's details.
 assert.doesNotMatch(processPart(html),/Records not yet confirmed/);
 assert.doesNotMatch(mainArea(html),/<p class="comparison-note">Process needs confirmation\./);
 assert.match(renderComparisonRecords(args(ar,rack)),/Records not yet confirmed \(1\)[\s\S]*BBM PM I2D Putaway to Automated Warehouse L3V[\s\S]*No confirmed match in the current process catalogue/);
 // The held-back branch is still explained in the full calculation.
 assert.match(html,/id="focusEvidence"[\s\S]*Peer classifications in this branch are not yet confirmed\./);
 // No removed workflow comes back.
 assert.doesNotMatch(html,/What each application does|Your review|View other comparison results/);
}));

// The three capability cases use the records from before the 2026-10-20 export (see earlier above).
test('a real too-coarse registration still says more detail is needed, once per application and record',()=>withUI(({showPair})=>{
 const {app,cap,process,evidence}=earlier,ar=app('AR Stock Taking');
 for(const name of ['RBCW Auto Warehouse Management System','ShzP_Pad system','Szh5_ASRS_WCS_WMS']){
  const coarse=app(name);
  assert.deepEqual(cap.scopes.get(coarse.id).known.map(node=>node.id),['B.06'],name);
  const records=evidence(cap,coarse,ar);
  // Three branches cannot be scored (the B.06 root, and AR Stock Taking's two codes against it): one cause, one entry.
  assert.deepEqual(records.gaps.map(gap=>[gap.side,gap.items.map(node=>node.id),gap.peerItems.map(node=>node.id)]),[[0,['B.06'],['B.06.1.4','B.06.4']]],name);
  assert.match(records.gaps[0].reason,/records only the B\.06 root; an L2 or deeper capability is needed/,name);
  const html=showPair(coarse,ar);
  assert.match(capabilityPart(html),/<summary>More detail needed for this comparison \(1\)<\/summary>/,name);
  const row=pairRows(html).find(item=>item[0]===coarse.id);
  assert(row,name);assert.match(row[2],/1 capability record/,name);
  assert.doesNotMatch(mainArea(html),/Peer records are not detailed enough/,name);
 }
 // A process chain registered only at Level 0.
 const dashboard=app('360° Supplier dashboard'),records=evidence(process,dashboard,ar);
 assert.deepEqual(records.gaps.map(gap=>[gap.side,gap.items.map(node=>node.id)]),[[0,['M.I2D']]]);
 assert.match(records.gaps[0].reason,/only this L0 process chain; an L1 or deeper record is needed/);
 const html=showPair(dashboard,ar);
 assert.match(processPart(html),/More detail needed for this comparison \(1\)/);
 assert.deepEqual(pairRows(html),[[dashboard.id,'360° Supplier dashboard','1 process record to check']]);
 assert.match(html,/<em class="comparison-status">More detail needed<\/em>/);
},earlier));

test('every too-coarse record that the record check counts keeps its "More detail needed" entry (bundled data)',()=>{
 // The two Level 0 process chains are in the bundled data; the three B.06-root capabilities in the records from before
 // the 2026-10-20 export (2026-10-21).
 const real={model,app,cap,process,weighted,evidence};
 let checked=0;
 for(const [on,names] of [[real,['360° Supplier dashboard','CDR_EM']],[earlier,['RBCW Auto Warehouse Management System','ShzP_Pad system','Szh5_ASRS_WCS_WMS']]])for(const coarse of names.map(on.app))for(const peer of on.model.apps){
  if(peer.id===coarse.id)continue;
  const readiness=comparisonReadiness([on.weighted.pair(coarse.id,peer.id)],50);
  for(const row of readiness.apps)for(const record of row.records.filter(item=>item.kind==='More detail needed')){
   const side=row.app.id===coarse.id?0:1,gaps=on.evidence(record.dimension==='cap'?on.cap:on.process,coarse,peer).gaps;
   assert(gaps.some(gap=>gap.side===side),`${coarse.Name} ↔ ${peer.Name}: ${row.app.Name} ${record.raw}`);
   checked++;
  }
 }
 assert(checked>=300,`${checked} coarse records checked`);
});

test('no branch held back by an unconfirmed or missing record is listed as missing detail, and each entry is listed once (bundled data)',()=>{
 for(const index of [cap,process])for(const a of model.apps)for(const b of model.apps){
  if(a.id>=b.id)continue;
  const records=evidence(index,a,b),keys=records.gaps.map(gap=>JSON.stringify([gap.side,gap.items.map(node=>node.id).sort()]));
  assert.equal(new Set(keys).size,keys.length,`${a.Name} ↔ ${b.Name}`);
  for(const gap of records.gaps)assert.doesNotMatch(gap.reason,/not yet confirmed/,`${a.Name} ↔ ${b.Name}`);
 }
 // Missing records keep their own message instead of a detail gap. VMCN_CONNEX had no process record until the
 // 2026-10-20 export, so this is checked on the records from before it (2026-10-21).
 const connex=earlier.app('VMCN_CONNEX'),ar=earlier.app('AR Stock Taking'),records=earlier.evidence(earlier.process,ar,connex);
 assert.deepEqual(records.gaps,[]);assert.equal(records.sides[1].empty,true);
 assert.match(renderComparisonRecords(earlier.args(ar,connex)),/<strong>Application B · VMCN_CONNEX:<\/strong> No process records supplied\. This comparison has missing data\./);
});

// Szh5_ASRS_WCS_WMS with its capability at the B.06 root, as recorded before the 2026-10-20 export (2026-10-21).
test('when both applications have problems, each is listed separately, Application A first',()=>withUI(({showPair})=>{
 const {app,args}=earlier,szh5=app('Szh5_ASRS_WCS_WMS'),rack=app('AUTO-RACK');
 const html=showPair(szh5,rack);
 assert.deepEqual(pairRows(html),[[szh5.id,'Szh5_ASRS_WCS_WMS','1 capability record + 1 process record to check'],[rack.id,'AUTO-RACK','1 process record to check']]);
 // Szh5's root-only capability is still more detail; the process records are unconfirmed on both sides, not detail.
 assert.match(capabilityPart(html),/More detail needed for this comparison \(1\)/);
 assert.doesNotMatch(processPart(html),/More detail needed/);
 // Both applications' process records are named in their rows, so they are not repeated in Records not yet confirmed.
 assert.doesNotMatch(processPart(html),/Records not yet confirmed/);
 assert.match(renderComparisonRecords(args(szh5,rack)),/Records not yet confirmed \(2\)/);
 // The reversed pair keeps the same two rows with the new Application A first.
 assert.deepEqual(pairRows(showPair(rack,szh5)).map(row=>row[1]),['AUTO-RACK','Szh5_ASRS_WCS_WMS']);
 // Different records of different applications are never merged.
 const fixture=buildModel(workspaceData({capabilityRows:[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Task']],processRows:[['T','L0','M.T','Root'],['T','L1','M.T.1','Stage'],['T','L2','M.T.1.1','Area'],['T','L3','M.T.1.1.1','Task']],
  apps:[{ID:'A',Name:'Warehouse A',Description:'manage warehouse stock','Business Capabilities':'B.06.1.1 Task',Processes:'BBM PM T Unknown one L3'},
   {ID:'B',Name:'Warehouse B',Description:'manage warehouse stock','Business Capabilities':'B.06.1.1 Task',Processes:'BBM PM T Unknown two L3'}]}));
 const readiness=comparisonReadiness([createWeightedSimilarity(fixture).pair('A','B')]);
 const markup=renderPairReadiness(readiness,esc,['B','A']);
 assert.deepEqual(pairRows(markup),[['B','Warehouse B','1 process record to check'],['A','Warehouse A','1 process record to check']]);
 assert.doesNotMatch(markup,/Unknown (one|two)/,'source details stay in View details');
},earlier));

test('the single pair and the multi-application comparison count and word records the same way',()=>{
 const szh5=app('Szh5_ASRS_WCS_WMS'),rack=app('AUTO-RACK'),readiness=comparisonReadiness([weighted.pair(szh5.id,rack.id)],50);
 const multi=renderComparisonReadiness(readiness,esc),single=renderPairReadiness(readiness,esc);
 for(const row of readiness.apps){
  const summary=readinessRecordSummary(row.records);
  assert(multi.includes(`<strong>${esc(row.app.Name)}</strong><small>${esc(summary)} · affects 1 comparison</small>`),row.app.Name);
  assert(single.includes(`<strong>${esc(row.app.Name)}</strong> · ${esc(summary)}</span>`),row.app.Name);
 }
 assert.equal(renderPairReadiness({apps:[],pairCount:0,unattributedPairCount:0},esc),'');
 // A healthy pair has no record-check row.
 assert.equal(renderPairReadiness(comparisonReadiness([weighted.pair(app('ARS').id,app('AGR w/ Camera').id)],50),esc),'');
});

test('View details calls onApp with the application and the record; closing keeps both applications, the search and the page',()=>withUI(({ui,document,opened,showPair})=>{
 const ar=app('AR Stock Taking'),rack=app('AUTO-RACK'),review=document.getElementById('similarityReview');
 showPair(ar,rack,{peerSearch:'AUTO',focusAppSearch:'AR Stock'});
 const before=ui.getState(),html=document.getElementById('focusResult').innerHTML,log=[];
 const portfolioEntry=entry({readinessApp:rack.id},log),pairEntry=entry({readinessApp:rack.id,readinessScope:'pair'},log);
 review.entries=[portfolioEntry,pairEntry];
 click(review,pairEntry);
 assert.deepEqual(opened,[[rack.id,{dimension:'process',record:putaway,kind:'Needs confirmation',records:[{dimension:'process',kind:'Needs confirmation',raw:putaway}]}]]);
 assert.equal(document.getElementById('detail').open,true);
 document.getElementById('detail').close();
 assert.deepEqual(ui.getState(),before,'both applications, the search and the return position are unchanged');
 assert.equal(document.getElementById('focusResult').innerHTML,html,'the comparison is not re-rendered');
 assert.equal(ui.getState().focusAppId,ar.id);assert.equal(ui.getState().focusPeerId,rack.id);assert.equal(ui.getState().peerSearch,'AUTO');
 assert.deepEqual(log,[[rack.id,'pair',{preventScroll:true}]],'focus returns to the pair entry, not to the hidden portfolio entry');
 // Two applications with problems: each entry opens its own application with its own records. Szh5_ASRS_WCS_WMS with its
 // capability at the B.06 root, as recorded before the 2026-10-20 export (2026-10-21).
 withUI(({document,opened,showPair})=>{
  const szh5=earlier.app('Szh5_ASRS_WCS_WMS');showPair(szh5,earlier.app('AUTO-RACK'));opened.length=0;
  click(document.getElementById('similarityReview'),entry({readinessApp:szh5.id,readinessScope:'pair'}));
  const [[id,focus]]=opened;
  assert.equal(id,szh5.id);assert.deepEqual([focus.dimension,focus.record,focus.kind],['cap','B.06 Logistics Management','More detail needed']);
  assert.deepEqual(focus.records.map(record=>[record.dimension,record.raw]),[['cap','B.06 Logistics Management'],['process','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V']]);
  document.getElementById('detail').close();
 },earlier);
 // And in the bundled data, where Szh5_ASRS_WCS_WMS records B.06.5: only its unconfirmed process record is left.
 const szh5=app('Szh5_ASRS_WCS_WMS');showPair(szh5,rack);opened.length=0;
 click(review,entry({readinessApp:szh5.id,readinessScope:'pair'}));
 assert.deepEqual(opened.map(([id,focus])=>[id,focus.dimension,focus.record,focus.kind,focus.records.length]),[[szh5.id,'process','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V','Needs confirmation',1]]);
 document.getElementById('detail').close();
 // The portfolio list and the multi-application dialog lead to the same record.
 opened.length=0;click(review,entry({readinessApp:rack.id}));
 assert.deepEqual(opened[0][1].records,[{dimension:'process',kind:'Needs confirmation',raw:putaway}]);
 document.getElementById('detail').close();
 ui.open({poolIds:[ar.id,rack.id,app('Control Tower').id]});opened.length=0;
 click(document.getElementById('compareDialog'),entry({readinessApp:rack.id}));
 assert.equal(opened[0][0],rack.id);assert.equal(opened[0][1].record,putaway);
}));

// The application details as the profile renders them, with the attributes the focus helper reads.
function profileRoot(target,on=model){
 const html=renderCapabilityIssues(capabilityIssues(on,target),esc)+renderProcessIssues(processIssues(on,target),esc);
 const unescape=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const items=[...html.matchAll(/<div class="profile-unlisted" data-issue-dimension="([^"]*)" data-issue-record="([^"]*)" data-issue-kind="([^"]*)"><span class="profile-source-label">([^<]*)<\/span>/g)].map(match=>({
  dataset:{issueDimension:match[1],issueRecord:unescape(match[2]),issueKind:match[3]},label:unescape(match[4]),marks:[],scrolled:0,
  classList:{add(name){this.owner.marks.push(name);}},scrollIntoView(){this.scrolled++;globalThis.scrollY=900;}}));
 for(const item of items)item.classList.owner=item;
 return {html,items,querySelectorAll:selector=>selector==='[data-issue-record]'?items:[]};
}

test('the application details mark the issue for that source record and keep the page behind them in place',()=>{
 const previous={scrollX:globalThis.scrollX,scrollY:globalThis.scrollY,scrollTo:globalThis.scrollTo},restored=[];
 globalThis.scrollX=0;globalThis.scrollY=120;globalThis.scrollTo=(x,y)=>{restored.push([x,y]);globalThis.scrollY=y;};
 try{
  const rack=profileRoot(app('AUTO-RACK'));
  const marked=focusApplicationIssue(rack,{dimension:'process',record:putaway,kind:'Needs confirmation'});
  assert.deepEqual(marked.map(item=>item.dataset.issueRecord),[putaway]);
  assert.deepEqual(marked[0].marks,['is-focused-issue']);assert.equal(marked[0].scrolled,1);
  assert.deepEqual(restored,[[0,120]],'the comparison page behind the details does not move');
  // A root-only capability is listed in the profile as the missing level below it (RBCW's capability as recorded before
  // the 2026-10-20 export; it records B.06.5 since then, 2026-10-21).
  const rbcw=profileRoot(earlier.app('RBCW Auto Warehouse Management System'),earlier.model);
  assert.deepEqual(focusApplicationIssue(rbcw,{dimension:'cap',record:'B.06 Logistics Management',kind:'More detail needed'}).map(item=>item.label),['Level 2 missing']);
  // Several records of one application are all marked; the first one is brought into view.
  const wacos=profileRoot(app('VM-CN_WACOS_Szh5')),row=comparisonReadiness(weighted.pairPeers(app('VM-CN_WACOS_Szh5').id),50).apps.find(item=>item.app.Name==='VM-CN_WACOS_Szh5');
  const all=focusApplicationIssue(wacos,{dimension:'process',record:row.records[0].raw,kind:row.records[0].kind,records:row.records});
  assert.equal(all.length,4);assert.equal(all.filter(item=>item.scrolled).length,1);
  // Nothing to do without a focus; an unknown record marks nothing.
  assert.deepEqual(focusApplicationIssue(rack,undefined),[]);
  assert.deepEqual(focusApplicationIssue(profileRoot(app('AUTO-RACK')),{dimension:'process',record:'Not a record'}),[]);
  assert.match(rack.html,/data-issue-record="BBM PM I2D Putaway to Automated Warehouse L3V"/);
 }finally{Object.assign(globalThis,previous);}
});

test('every record the record check counts can be found in that application\'s details (bundled data)',()=>{
 const readiness=comparisonReadiness(weighted.pairs(),50);
 // 19 → 17 with the LeanIX export of 2026-10-20 (2026-10-21): ShzP_Pad system no longer records its capability only at the
 // B.06 root, and VMCN_Digital Dynamic Supermarket no longer records the unconfirmed B.06.4.4.
 assert.equal(readiness.apps.length,17);
 assert(!readiness.apps.some(row=>['ShzP_Pad system','VMCN_Digital Dynamic Supermarket'].includes(row.app.Name)));
 for(const row of readiness.apps){
  const root=profileRoot(row.app);
  for(const record of row.records){
   const marked=focusApplicationIssue(root,{dimension:record.dimension,record:record.raw,kind:record.kind});
   assert.equal(marked.length,1,`${row.app.Name}: ${record.raw}`);
  }
 }
});

test('app.js passes the record to the existing application details and keeps the issue lists',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(source.includes('function showApp(id,focus){'));
 assert(source.includes("if(focus)focusApplicationIssue($('detailBody'),focus);"));
 assert(source.includes('onApp:showApp'));
 const css=readFileSync(new URL('../public/interface.css',import.meta.url),'utf8');
 assert.match(css,/\.profile-unlisted\.is-focused-issue\{/);
});

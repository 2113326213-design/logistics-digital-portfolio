// Overview → Application maintenance → To review, its list and the application profile (owner specification
// 2026-10-20): every applicable level, every open issue, one result for counts, list and profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport,l3MaintenanceMetrics,createOverviewUI} from '../public/overview.mjs';
import {reviewIssues,issueLine,REVIEW_TEXT} from '../public/review-issues.mjs';
import {processIssues,capabilityIssues,renderProcessIssues,renderCapabilityIssues} from '../public/process-issues.mjs';
import {createCorrection,revokeCorrection,correctionStates} from '../public/corrections.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FULL='BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Step L2;BBM PM T Detail L3';
const app=(ID,Processes,cap='B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail',Entity='P1',Division='PS')=>({ID,Name:'App '+ID,Description:'d',Division,Entity,'Lifecycle: Current Lifecycle':'active','Business Capabilities':cap,Processes});
const fixture=apps=>({capabilityRows:[['B.06 Logistics','B.06.1 Branch','B.06.1.1 Detail','B.06.1.2 Second']],processRows:[['Test','L0','M.T','Test'],['Test','L1','M.T.010','Stage'],['Test','L2','M.T.010.010','Step'],['Test','L3','M.T.010.010.010','Detail'],['Test','L3','M.T.010.010.020','Other']],apps});
const labels=(report,id)=>report.issues.get(id).map(i=>i.record?`${i.label}: ${i.record}`:i.label);
const toReview=report=>report.needsReview.map(a=>a.id);

test('scenarios: missing levels, a bad record beside a good one, several issues counted once, a record without a level',()=>{
 const data=fixture([app('full',FULL),app('noL2','BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Detail L3'),app('mixed',FULL+';BBM PM T Unknown L3'),app('several','BBM PM T Test L0;BBM PM T Detail L3;BBM PM T Unknown L3'),app('noLevel',FULL+';BBM PM T Something')]);
 const model=buildModel(data),report=maintenanceReport(model,{},'process');
 // L3 passes but L2 has no record: To review with Level 2 missing.
 assert.deepEqual(labels(report,'noL2'),['Level 2 missing']);
 assert(l3MaintenanceMetrics(report).quality.some(a=>a.id==='noL2'),'its Level 3 passes');
 // One good and one bad record at the same level: the bad record is the issue.
 assert.deepEqual(labels(report,'mixed'),['Level 3 match needs review: BBM PM T Unknown L3']);
 // Several issues: listed once, all reasons kept, the missing levels do not hide each other.
 assert.deepEqual(labels(report,'several'),['Level 1 missing','Level 2 missing','Level 3 match needs review: BBM PM T Unknown L3']);
 // Every level fine, plus one record without a level.
 assert.deepEqual(labels(report,'noLevel'),['Process level not specified: BBM PM T Something']);
 assert.deepEqual(toReview(report),['noL2','mixed','several','noLevel']);
 assert.equal(report.needsReview.length,new Set(toReview(report)).size,'each application once');
 assert.deepEqual(labels(report,'full'),[]);
 // A missing level is never also reported as a mismatch.
 for(const [id,list] of report.issues)for(const level of [0,1,2,3])assert(!(list.some(i=>i.level===level&&i.kind==='missing')&&list.some(i=>i.level===level&&i.kind==='match')),id);
});

test('scenarios: fixing one issue keeps the application; fixing all removes it',()=>{
 const step=processes=>{const report=maintenanceReport(buildModel(fixture([app('a',processes)])),{},'process');return [toReview(report),labels(report,'a')];};
 assert.deepEqual(step('BBM PM T Test L0;BBM PM T Detail L3;BBM PM T Unknown L3'),[['a'],['Level 1 missing','Level 2 missing','Level 3 match needs review: BBM PM T Unknown L3']]);
 assert.deepEqual(step('BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Detail L3;BBM PM T Unknown L3'),[['a'],['Level 2 missing','Level 3 match needs review: BBM PM T Unknown L3']]);
 assert.deepEqual(step(FULL+';BBM PM T Unknown L3'),[['a'],['Level 3 match needs review: BBM PM T Unknown L3']]);
 assert.deepEqual(step(FULL),[[],[]]);
});

test('Business Capability: L1–L3 from the records actually registered; parents are not inferred',()=>{
 const data=fixture([app('leafOnly',FULL,'B.06.1.1 Detail'),app('ok',FULL),app('outside',FULL,'B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail;B.06.7.9 Unknown'),app('empty',FULL,'')]);
 const report=maintenanceReport(buildModel(data),{},'cap');
 assert.deepEqual(labels(report,'leafOnly'),['Level 1 missing','Level 2 missing'],'B.06 and B.06.1 are not inferred from B.06.1.1');
 assert.deepEqual(labels(report,'ok'),[]);
 assert.deepEqual(labels(report,'outside'),['Level 3 match needs review: B.06.7.9 Unknown']);
 assert.equal(report.issues.get('outside')[0].text,REVIEW_TEXT.notInCatalogue,'a catalogue gap is a question, not a confirmed error');
 // An empty field is one issue in the owner's wording.
 assert.deepEqual(report.issues.get('empty').map(i=>[i.label,i.text]),[['Business capabilities','No capability information recorded.']]);
 assert(report.needsReview.some(a=>a.id==='empty'));
 const processReport=maintenanceReport(buildModel(fixture([app('noProcess','')])),{},'process');
 assert.deepEqual(processReport.issues.get('noProcess').map(issueLine),['Processes — No process information recorded.']);
 assert.equal(renderProcessIssues(processIssues(buildModel(fixture([app('noProcess','')])),{id:'noProcess'}),esc).match(/<h4>Process issues · <span>(\d+)<\/span>/)[1],'1');
});

test('Show all levels does not change To review; the Total and plant rows match their lists',()=>{
 const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
 const model=buildModel(data);
 const nodes=new Map(),node=()=>({innerHTML:'',value:'',hidden:false,open:false,disabled:false,dataset:{},style:{},textContent:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},querySelector(){return node();},querySelectorAll(){return [];},insertAdjacentHTML(){},scrollIntoView(){},focus(){},showModal(){},close(){}});
 const old=globalThis.document;globalThis.document={body:node(),createElement(){return node();},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 try{
  const ui=createOverviewUI({getModel:()=>model,escape:esc,onApp(){}});
  const totals={};
  for(const dimension of ['cap','process'])for(const showAllLevels of [false,true]){
   ui.restoreState({dimension,showAllLevels});
   const html=nodes.get('overviewPanels').innerHTML,total=html.match(/class="maintenance-total"[\s\S]*?class="plant-review has-issues"[^>]*>(\d+)<\/button>/)?.[1];
   totals[dimension+showAllLevels]=Number(total);
  }
  assert.equal(totals.capfalse,totals.captrue);assert.equal(totals.processfalse,totals.processtrue);
  assert.equal(totals.capfalse,maintenanceReport(model,{},'cap').needsReview.length);
  assert.equal(totals.processfalse,maintenanceReport(model,{},'process').needsReview.length);
 }finally{globalThis.document=old;}
 for(const dimension of ['cap','process']){
  const all=maintenanceReport(model,{},dimension);
  for(const row of all.plants){
   const filtered=maintenanceReport(model,{entity:row.plant},dimension);
   assert.deepEqual(filtered.needsReview.map(a=>a.id),row.needsReview.map(a=>a.id),`${dimension} ${row.plant}`);
   for(const a of row.needsReview)assert.deepEqual(filtered.issues.get(a.id),all.issues.get(a.id));
  }
  assert.equal(all.plants.reduce((n,p)=>n+p.needsReview.length,0),all.needsReview.length,'plants add up to the Total, no application counted twice');
  for(const division of new Set(model.apps.map(a=>a.Division||'Not provided'))){const r=maintenanceReport(model,{division},dimension);assert(r.needsReview.every(a=>(a.Division||'Not provided')===division));}
  // Level 3 metric keeps its Level 3 meaning and is part of To review.
  assert(l3MaintenanceMetrics(all).notPassing.every(a=>all.needsReview.includes(a)));
 }
});

test('bundled data: To review counts and the profile shows exactly the same issues',()=>{
 const model=buildModel(workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)))));
 const cap=maintenanceReport(model,{},'cap'),process=maintenanceReport(model,{},'process');
 assert.deepEqual([cap.needsReview.length,process.needsReview.length],[53,46],'Process 45 -> 46 (2026-10-20): one more application uses M.I2D.020.050, whose LeanIX name differs from the snapshot');
 assert.deepEqual([l3MaintenanceMetrics(cap).notPassing.length,l3MaintenanceMetrics(process).notPassing.length],[37,21],'Level 3 metrics unchanged');
 for(const a of model.apps){
  assert.deepEqual(capabilityIssues(model,a).map(i=>[i.raw||i.label,i.findings[0]]),cap.issues.get(a.id).map(i=>[i.record||i.label,i.text]),a.Name);
  assert.deepEqual(processIssues(model,a).map(i=>[i.raw||i.label,i.findings[0]]),process.issues.get(a.id).map(i=>[i.record||i.label,i.text]),a.Name);
  assert.equal(cap.needsReview.includes(a),cap.issues.get(a.id).length>0);assert.equal(process.needsReview.includes(a),process.issues.get(a.id).length>0);
 }
 const davis=model.apps.find(a=>a.Name==='ShzP_DAVIS');
 assert.deepEqual(process.issues.get(davis.id).map(issueLine),['Level 3 match needs review: BBM PM I2D Load Truck L3 — '+REVIEW_TEXT.notMatched]);
 const dashboard=model.apps.find(a=>a.Name.startsWith('360'));
 assert.deepEqual(cap.issues.get(dashboard.id).map(i=>i.label),['Level 2 missing','Name differs from standard','Name differs from standard']);
});

test('profile rendering: title with the issue count, one line per issue, escaping, none',()=>{
 const issues=[{raw:'',label:'Level 2 missing',findings:['No Level 2 process recorded.']},{raw:'<b>X</b> L3',label:'Level 3 match needs review',findings:[REVIEW_TEXT.notMatched]}];
 const html=renderProcessIssues(issues,esc);
 assert.match(html,/<h4>Process issues · <span>2<\/span><\/h4>/);
 assert.match(html,/<span class="profile-source-label">Level 2 missing<\/span><small class="profile-catalogue-note">No Level 2 process recorded\.<\/small>/);
 assert.match(html,/&lt;b&gt;X&lt;\/b&gt; L3/);assert.doesNotMatch(html,/<b>X/);
 assert.equal(renderProcessIssues([],esc),'<h4>Process issues</h4><p class="profile-empty profile-no-issues">No process issues detected.</p>');
 assert.match(renderCapabilityIssues([],esc),/No capability issues detected\./);
 for(const text of Object.values(REVIEW_TEXT))assert(!/\berror\b/i.test(text)||/no error is confirmed/i.test(text),text);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes('const processIssueList=processIssues(model,a),capabilityIssueList=capabilityIssues(model,a);'));
 assert(app.includes('${renderCapabilityIssues(capabilityIssueList,esc)}')&&app.includes('${renderProcessIssues(processIssueList,esc)}'));
});

test('To review never changes application data',()=>{
 const data=fixture([app('a','BBM PM T Detail L3;BBM PM T Unknown L3')]),before=JSON.stringify(data.apps);
 const model=buildModel(data);maintenanceReport(model,{},'process');reviewIssues(model,maintenanceReport(model,{},'cap'),model.apps[0]);
 assert.equal(JSON.stringify(data.apps),before);
});

// Profile and To review cases kept from the former tests/process-issues.test.mjs (removed 2026-10-20).
const profileRaw=(model,id)=>processIssues(model,model.apps.find(a=>a.id===id)).map(i=>i.raw||i.label);

test('a process record listed twice in the source is shown once',()=>{
 const model=buildModel(fixture([app('twice',FULL+';BBM PM T Unknown L3;BBM PM T Something;BBM PM T Unknown L3;BBM PM T Detail L3;BBM PM T Something')]));
 const report=maintenanceReport(model,{},'process');
 assert.deepEqual(labels(report,'twice'),['Level 3 match needs review: BBM PM T Unknown L3','Process level not specified: BBM PM T Something']);
 assert.deepEqual(profileRaw(model,'twice'),['BBM PM T Unknown L3','BBM PM T Something']);
 assert.equal(renderProcessIssues(processIssues(model,model.apps[0]),esc).match(/<h4>Process issues · <span>(\d+)<\/span>/)[1],'2');
 assert.deepEqual(toReview(report),['twice']);
});

test('issues follow the order of the source records (level by level, as To review lists them)',()=>{
 const source=['BBM PM T Zeta L3','BBM PM T Zulu','BBM PM T Test L0','BBM PM T Alpha L3','BBM PM T Stage L1','BBM PM T Bad Step L2','BBM PM T Detail L3','BBM PM T Alpha','BBM PM T Mid L3'];
 const model=buildModel(fixture([app('forward',source.join(';')),app('reversed',source.toReversed().join(';'))])),report=maintenanceReport(model,{},'process');
 const l3=['Zeta','Alpha','Mid'].map(n=>`Level 3 match needs review: BBM PM T ${n} L3`),noLevel=['Zulu','Alpha'].map(n=>`Process level not specified: BBM PM T ${n}`);
 const l2='Level 2 match needs review: BBM PM T Bad Step L2';
 // Not sorted by name: within a level, and among records without a level, the source order is kept.
 assert.deepEqual(labels(report,'forward'),[l2,...l3,...noLevel]);
 assert.deepEqual(labels(report,'reversed'),[l2,...l3.toReversed(),...noLevel.toReversed()]);
 // The profile lists the same issues in the same order.
 for(const id of ['forward','reversed'])assert.deepEqual(profileRaw(model,id),report.issues.get(id).map(i=>i.record||i.label),id);
});

test('a record resolved by an applied mapping is not listed; revoking or invalidating the mapping lists it again',()=>{
 const raw='BBM PM T Unknown L3',data=fixture([app('a',FULL+';'+raw),app('b',FULL+';'+raw)]);
 const state=d=>{const model=buildModel(d),report=maintenanceReport(model,{},'process');return {toReview:toReview(report),a:labels(report,'a'),profile:profileRaw(model,'a'),b:labels(report,'b')};};
 const open={toReview:['a','b'],a:['Level 3 match needs review: '+raw],profile:[raw],b:['Level 3 match needs review: '+raw]};
 assert.deepEqual(state(data),open);
 const mapping=createCorrection(data,{appId:'a',dimension:'process',raw,targetId:'M.T.010.010.020',reviewer:'Reviewer',reason:'Business confirmed the standard process'});
 const mapped={...data,corrections:[mapping]};
 assert.deepEqual(correctionStates(mapped).map(c=>c.state),['Applied']);
 // Resolved for this application only: not in its To review list or profile; the same record elsewhere stays open.
 assert.deepEqual(state(mapped),{toReview:['b'],a:[],profile:[],b:['Level 3 match needs review: '+raw]});
 const revoked=revokeCorrection(mapped,mapping.id);
 assert.deepEqual(correctionStates(revoked).map(c=>c.state),['Revoked']);
 assert.deepEqual(state(revoked),open,'revoked');
 for(const [name,mutate] of [['target renamed in the catalogue',d=>{d.processRows.at(-1)[3]='Renamed';}],['source application changed',d=>{d.apps[0].Description='Changed';}]]){
  const invalid=structuredClone(mapped);mutate(invalid);
  assert.deepEqual(correctionStates(invalid).map(c=>c.state),['Needs review'],name);
  assert.deepEqual(state(invalid),open,name);
 }
});

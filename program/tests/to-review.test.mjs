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
 // V19.1 union (owner 2026-10-23): a process recorded with a level is in LeanIX, so an L3 record outside the Signavio list
 // ('BBM PM T Unknown L3') matches and is no issue any more ('mixed', 'unionL3'). The bad record beside a good one is now a
 // capability outside the catalogue ('mixed', capability view), and 'several' gets its record issue from a process without a level.
 const data=fixture([app('full',FULL),app('noL2','BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Detail L3'),app('mixed',FULL+';BBM PM T Unknown L3','B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail;B.06.1.9 Unknown'),app('several','BBM PM T Test L0;BBM PM T Unknown'),app('unionL3','BBM PM T Test L0;BBM PM T Detail L3;BBM PM T Unknown L3'),app('noLevel',FULL+';BBM PM T Something')]);
 const model=buildModel(data),report=maintenanceReport(model,{},'process'),capReport=maintenanceReport(model,{},'cap');
 // L3 passes and its catalogue L2 parent exists: L2 is covered, nothing to review (owner decision 2026-10-20, V9.2).
 assert.deepEqual(labels(report,'noL2'),[]);
 assert(l3MaintenanceMetrics(report).quality.some(a=>a.id==='noL2'),'its Level 3 passes');
 // V19.1 union: the L3 record outside the Signavio list is listed in inLeanix and matches beside the good one.
 assert.deepEqual(model.apps.find(a=>a.id==='mixed').inLeanix.map(x=>x.raw),['BBM PM T Unknown L3']);
 assert.deepEqual(labels(report,'mixed'),[]);
 assert(report.records.get('mixed').every(r=>r.valid),'every process record of mixed matches');
 // One good and one bad record at the same level: the bad record is the issue.
 assert.deepEqual(labels(capReport,'mixed'),['Level 3 match needs review: B.06.1.9 Unknown']);
 // Several issues: listed once, all reasons kept, the missing levels do not hide each other.
 assert.deepEqual(labels(report,'several'),['Level 1 missing','Level 2 missing','Level 3 missing','Process level not specified: BBM PM T Unknown']);
 // V19.1 union: the records 'several' had until V19 (L0, a Signavio L3 and an L3 only in LeanIX) leave nothing to review:
 // both L3 records match, so Levels 1 and 2 are full (the LeanIX record is evidence without a Signavio code).
 assert.deepEqual(labels(report,'unionL3'),[]);
 assert.deepEqual(report.coverage.get('unionL3').get(1),[{raw:'BBM PM T Detail L3',code:'M.T.010.010.010',parent:'M.T.010'},{raw:'BBM PM T Unknown L3',code:null,parent:null,inLeanix:true}]);
 // Every level fine, plus one record without a level.
 assert.deepEqual(labels(report,'noLevel'),['Process level not specified: BBM PM T Something']);
 assert.deepEqual(toReview(report),['several','noLevel']);
 assert.deepEqual(toReview(capReport),['mixed']);
 assert.equal(report.needsReview.length,new Set(toReview(report)).size,'each application once');
 assert.deepEqual(labels(report,'full'),[]);
 // A missing level is never also reported as a mismatch.
 for(const r of [report,capReport])for(const [id,list] of r.issues)for(const level of [0,1,2,3])assert(!(list.some(i=>i.level===level&&i.kind==='missing')&&list.some(i=>i.level===level&&i.kind==='match')),id);
});

test('scenarios: fixing one issue keeps the application; fixing all removes it',()=>{
 // V19.1 union (owner 2026-10-23): an L3 record outside the Signavio list is no issue any more, so the record to fix is a
 // process without a level ('BBM PM T Unknown'); each step fixes one issue.
 const step=processes=>{const report=maintenanceReport(buildModel(fixture([app('a',processes)])),{},'process');return [toReview(report),labels(report,'a')];};
 assert.deepEqual(step('BBM PM T Test L0;BBM PM T Unknown'),[['a'],['Level 1 missing','Level 2 missing','Level 3 missing','Process level not specified: BBM PM T Unknown']]);
 assert.deepEqual(step('BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Unknown'),[['a'],['Level 2 missing','Level 3 missing','Process level not specified: BBM PM T Unknown']]);
 assert.deepEqual(step('BBM PM T Test L0;BBM PM T Stage L1;BBM PM T Step L2;BBM PM T Unknown'),[['a'],['Level 3 missing','Process level not specified: BBM PM T Unknown']]);
 assert.deepEqual(step(FULL+';BBM PM T Unknown'),[['a'],['Process level not specified: BBM PM T Unknown']]);
 assert.deepEqual(step(FULL),[[],[]]);
});

test('Business Capability: a matching L3 makes the levels above it full; a recorded bad L3 stays an issue',()=>{
 const data=fixture([app('leafOnly',FULL,'B.06.1.1 Detail'),app('ok',FULL),app('outside',FULL,'B.06 Logistics;B.06.1 Branch;B.06.1.1 Detail;B.06.7.9 Unknown'),app('empty',FULL,'')]);
 const report=maintenanceReport(buildModel(data),{},'cap');
 assert.deepEqual(labels(report,'leafOnly'),[],'its matching L3 makes L2 and L1 full (fixed rule 2026-10-23)');
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
 // Re-derived 2026-10-21 from the V9.16 data (LeanIX export 2026-10-20 merged by ID): Capability 38 → 40 (Control Tower, D-sample tracking system,
 // Dolly call off program, Physical Logistics Management System now register an L2 only; VMCN_CONNEX and VMCN_Digital Dynamic Supermarket resolved),
 // Process 24 → 23 (VMCN_CONNEX gained a confirmed L3). Level 3 metrics move with the same applications: 37 → 39, 21 → 20.
 // V9.17 (owner workbook 2026-10-21): 360° Supplier dashboard now records the standard names B.06.8 / B.06.8.1 / B.06.8.2, so its three
 // capability issues (Level 2 missing, two names differing from the standard) are gone: Capability 40 → 39. Processes are unchanged.
 // V9.18 (owner decision 2026-10-22): AUTO-RACK's L3V record and RBCW Auto Warehouse Management System's Transport Material Intra
 // Plant L3 are confirmed as recorded. AUTO-RACK had no other process issue and leaves Process To review (23 → 22); RBCW Auto
 // Warehouse Management System keeps its traceable Level 0 / Level 1 entries. Both leave 'Level 3 to review' (20 → 18) and are
 // counted as confirmed; they still do not match the standard (Level 3 matches standard unchanged).
 // V18.1 (fixed rule 2026-10-23): RBCW Auto Warehouse Management System's matching L2 (Material Consumption) makes its L0
 // and L1 full, so it has no process issue left and leaves Process To review (22 → 21).
 // V19.1 union (owner decision 2026-10-23): a process matches when it is in the Signavio list or in LeanIX, and every process
 // recorded with a level is in LeanIX; 'Process name differs between sources' is no longer produced. Process To review
 // 21 → 11: 9 applications whose only process issues were records with a level outside the Signavio list or the name
 // difference (and the missing levels those records now cover; VM-CN_WACOS_Szh5 had both kinds) and RBAC_ME_Szh5 Intralogistics control system,
 // whose only issue was the name difference.
 // Level 3 to review 18 → 8: the same 9 and RBCD LOG Xone (its Transmit Material and Sales Master Data L3 matches; it stays in
 // Process To review for its process without a level). AUTO-RACK and RBCW Auto Warehouse Management System are no longer
 // counted as confirmed: their confirmed records are in LeanIX and simply match.
 assert.deepEqual([cap.needsReview.length,process.needsReview.length],[39,11],'V9.17: Capability −1 (360° Supplier dashboard); V9.18: Process −1 (AUTO-RACK confirmed); V18.1: Process −1 (RBCW Auto Warehouse Management System); V19.1 union: Process −10');
 assert.deepEqual([l3MaintenanceMetrics(cap).notPassing.length,l3MaintenanceMetrics(process).notPassing.length],[39,8],'Level 3 metrics follow the same applications (V19.1 union: Process Level 3 −10)');
 const unionLeft=['RBCD LOM Scrap Management Platform','RBCD WI management system','RBCW E-Queue system','RBHP_LOG_QualManager','ShzP_DAVIS','Szh5_ASRS_WCS_WMS','VM-CN_WACOS_Szh5','VM/LOG-Szh2_DAVIS','VMCN_iSCMP'];
 for(const name of unionLeft){const a=model.apps.find(x=>x.Name.startsWith(name));assert(a.inLeanix.length>0,`${name} has records with a level outside the Signavio list`);assert.deepEqual(process.issues.get(a.id),[],`${name} left Process To review (V19.1 union)`);assert(!l3MaintenanceMetrics(process).notPassing.includes(a),name);}
 const nameOnly=model.apps.find(a=>a.Name==='RBAC_ME_Szh5 Intralogistics control system');
 assert.deepEqual([nameOnly.inLeanix,process.issues.get(nameOnly.id)],[[],[]],'V19.1: the Signavio and the LeanIX name are both valid, no name-difference issue');
 const xone=model.apps.find(a=>a.Name==='RBCD LOG Xone');
 assert.deepEqual([xone.inLeanix.map(x=>x.raw),process.issues.get(xone.id).map(i=>i.label)],[['BBM PM P2F Transmit Material and Sales Master Data L3'],['Process level not specified']]);
 assert(!l3MaintenanceMetrics(process).notPassing.includes(xone),'its Level 3 matches (V19.1 union)');
 // V19.1 union: the owner confirmations of 2026-10-22 are superseded; the records match and are not shown as confirmed.
 assert.deepEqual(l3MaintenanceMetrics(process).confirmed,[]);
 for(const [name,raw] of [['AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V'],['RBCW Auto Warehouse Management System','BBM PM I2D Transport Material Intra Plant L3']]){
  const a=model.apps.find(x=>x.Name===name),record=process.records.get(a.id).find(r=>r.raw===raw);
  assert.deepEqual([record.valid,record.accepted,a.inLeanix.some(x=>x.raw===raw),process.issues.get(a.id)],[true,null,true,[]],name);
 }
 for(const a of model.apps){
  assert.deepEqual(capabilityIssues(model,a).map(i=>[i.raw||i.label,i.findings[0]]),cap.issues.get(a.id).map(i=>[i.record||i.label,i.text]),a.Name);
  assert.deepEqual(processIssues(model,a).map(i=>[i.raw||i.label,i.findings[0]]),process.issues.get(a.id).map(i=>[i.record||i.label,i.text]),a.Name);
  assert.equal(cap.needsReview.includes(a),cap.issues.get(a.id).length>0);assert.equal(process.needsReview.includes(a),process.issues.get(a.id).length>0);
 }
 // V19.1 union (owner 2026-10-23): ShzP_DAVIS's Load Truck L3 is not in the Signavio list but is in LeanIX, so it matches;
 // until V19 it was 'Level 3 match needs review: BBM PM I2D Load Truck L3 — No confirmed match in the current process catalogue.'
 const davis=model.apps.find(a=>a.Name==='ShzP_DAVIS');
 assert.deepEqual(process.issues.get(davis.id).map(issueLine),[]);
 assert.deepEqual(davis.inLeanix.map(x=>[x.raw,x.level,x.type]),[['BBM PM I2D Load Truck L3',3,'流程未匹配层级表']]);
 assert(model.issues.some(i=>i.appId===davis.id&&i.value==='BBM PM I2D Load Truck L3'),'it still has no Signavio code (similarity and mappings unchanged)');
 const dashboard=model.apps.find(a=>a.Name.startsWith('360'));
 assert.deepEqual(cap.issues.get(dashboard.id).map(i=>i.label),[],'V9.17: the standard names leave no capability issue');
});

test('profile rendering: title with the issue count, one line per issue, escaping, none',()=>{
 const issues=[{raw:'',label:'Level 2 missing',findings:['No Level 2 process recorded.']},{raw:'<b>X</b> L3',label:'Level 3 match needs review',findings:[REVIEW_TEXT.notMatched]}];
 const html=renderProcessIssues(issues,esc);
 assert.match(html,/<h4>Process issues · <span>2<\/span><\/h4>/);
 assert.match(html,/<span class="profile-source-label">Level 2 missing<\/span><small class="profile-catalogue-note">No Level 2 process recorded\.<\/small>/);
 assert.match(html,/&lt;b&gt;X&lt;\/b&gt; L3/);assert.doesNotMatch(html,/<b>X/);
 assert.equal(renderProcessIssues([],esc),'');
 assert.equal(renderCapabilityIssues([],esc),'');
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
 // V19.1 union (owner 2026-10-23): an L3 record outside the Signavio list is no issue any more, so both duplicated issue
 // records are processes without a level; the duplicated L3 record outside the list is one matching record.
 const model=buildModel(fixture([app('twice',FULL+';BBM PM T Unknown;BBM PM T Something;BBM PM T Unknown;BBM PM T Detail L3;BBM PM T Something;BBM PM T Elsewhere L3;BBM PM T Elsewhere L3')]));
 const report=maintenanceReport(model,{},'process');
 assert.deepEqual(labels(report,'twice'),['Process level not specified: BBM PM T Unknown','Process level not specified: BBM PM T Something']);
 assert.deepEqual(report.records.get('twice').filter(r=>r.raw==='BBM PM T Elsewhere L3').map(r=>r.valid),[true],'listed twice, one matching record');
 assert.deepEqual(profileRaw(model,'twice'),['BBM PM T Unknown','BBM PM T Something']);
 assert.equal(renderProcessIssues(processIssues(model,model.apps[0]),esc).match(/<h4>Process issues · <span>(\d+)<\/span>/)[1],'2');
 assert.deepEqual(toReview(report),['twice']);
});

test('issues follow the order of the source records (level by level, as To review lists them)',()=>{
 const source=['BBM PM T Zeta L3','BBM PM T Zulu','BBM PM T Test L0','BBM PM T Alpha L3','BBM PM T Stage L1','BBM PM T Bad Step L2','BBM PM T Detail L3','BBM PM T Alpha','BBM PM T Mid L3'];
 // V19.1 union (owner 2026-10-23): the L2 and L3 records outside the Signavio list are in LeanIX and match, so the process
 // issues are the records without a level; several issue records at one level are now checked on capabilities below.
 const capSource=['B.06.1.9 Zeta','Zulu','B.06 Logistics','B.06.1.8 Alpha','B.06.1 Branch','B.06.7 Bad Branch','B.06.1.1 Detail','Alpha','B.06.1.7 Mid'];
 const model=buildModel(fixture([app('forward',source.join(';'),capSource.join(';')),app('reversed',source.toReversed().join(';'),capSource.toReversed().join(';'))]));
 const report=maintenanceReport(model,{},'process'),capReport=maintenanceReport(model,{},'cap');
 const noLevel=['Zulu','Alpha'].map(n=>`Process level not specified: BBM PM T ${n}`);
 assert.deepEqual(model.apps.find(a=>a.id==='forward').inLeanix.map(x=>x.raw),['BBM PM T Zeta L3','BBM PM T Alpha L3','BBM PM T Bad Step L2','BBM PM T Mid L3']);
 // Not sorted by name: among records without a level, the source order is kept.
 assert.deepEqual(labels(report,'forward'),noLevel);
 assert.deepEqual(labels(report,'reversed'),noLevel.toReversed());
 const l3=['9 Zeta','8 Alpha','7 Mid'].map(n=>`Level 3 match needs review: B.06.1.${n}`),capNoLevel=['Zulu','Alpha'].map(n=>`Capability needs review: ${n}`);
 const l2='Level 2 match needs review: B.06.7 Bad Branch';
 // Level by level; within a level, and among records without a level, the source order is kept.
 assert.deepEqual(labels(capReport,'forward'),[l2,...l3,...capNoLevel]);
 assert.deepEqual(labels(capReport,'reversed'),[l2,...l3.toReversed(),...capNoLevel.toReversed()]);
 // The profile lists the same issues in the same order.
 for(const id of ['forward','reversed']){
  assert.deepEqual(profileRaw(model,id),report.issues.get(id).map(i=>i.record||i.label),id);
  assert.deepEqual(capabilityIssues(model,model.apps.find(a=>a.id===id)).map(i=>i.raw||i.label),capReport.issues.get(id).map(i=>i.record||i.label),id);
 }
});

test('a record resolved by an applied mapping is not listed; revoking or invalidating the mapping lists it again',()=>{
 // V19.1 union (owner 2026-10-23): an L3 record outside the Signavio list is no issue any more, so the mapped record is a
 // process without a level ('Process level not specified').
 const raw='BBM PM T Unknown',data=fixture([app('a',FULL+';'+raw),app('b',FULL+';'+raw)]);
 const state=d=>{const model=buildModel(d),report=maintenanceReport(model,{},'process');return {toReview:toReview(report),a:labels(report,'a'),profile:profileRaw(model,'a'),b:labels(report,'b')};};
 const open={toReview:['a','b'],a:['Process level not specified: '+raw],profile:[raw],b:['Process level not specified: '+raw]};
 assert.deepEqual(state(data),open);
 const mapping=createCorrection(data,{appId:'a',dimension:'process',raw,targetId:'M.T.010.010.020',reviewer:'Reviewer',reason:'Business confirmed the standard process'});
 const mapped={...data,corrections:[mapping]};
 assert.deepEqual(correctionStates(mapped).map(c=>c.state),['Applied']);
 // Resolved for this application only: not in its To review list or profile; the same record elsewhere stays open.
 assert.deepEqual(state(mapped),{toReview:['b'],a:[],profile:[],b:['Process level not specified: '+raw]});
 const revoked=revokeCorrection(mapped,mapping.id);
 assert.deepEqual(correctionStates(revoked).map(c=>c.state),['Revoked']);
 assert.deepEqual(state(revoked),open,'revoked');
 for(const [name,mutate] of [['target renamed in the catalogue',d=>{d.processRows.at(-1)[3]='Renamed';}],['source application changed',d=>{d.apps[0].Description='Changed';}]]){
  const invalid=structuredClone(mapped);mutate(invalid);
  assert.deepEqual(correctionStates(invalid).map(c=>c.state),['Needs review'],name);
  assert.deepEqual(state(invalid),open,name);
 }
});

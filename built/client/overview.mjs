import {formatROIPayback,roiPaybackNote,ROI_PAYBACK_RULE} from './roi.mjs';
import {annualLabel,scopeReason} from './display.mjs';
import {capCode,norm,split,PROCESS_LEVEL,compareNatural,otherCompanyRecord} from './codes.mjs';
import {reviewIssues,processAncestorCoverage,level2Coverage as coverageAtLevel2} from './review-issues.mjs';
import {annualCost,costSummary,formatAnnualCost,formatRMB} from './costs.mjs';
import {matchesApplication,APP_SEARCH_LABEL,APP_SEARCH_PLACEHOLDER} from './app-search.mjs';
// Overview reports presence and taxonomy alignment separately. It does not score similarity.
export const maintenanceFields=[
 ['ID','Application ID'],['Name','Name'],['Description','Description'],
 ['Division','Business unit'],['Entity','Plant'],
 ['Lifecycle: Current Lifecycle','Lifecycle'],['Business Capabilities','Business Capability'],['Processes','Process']
];
const filled=(app,key)=>String(app[key]??'').trim().length>0;
const inB06=id=>id==='B.06'||id.startsWith('B.06.');
// Search stays inside the supplied drill cohort; it never expands to the portfolio.
export function filterOverviewApplications(apps,{entity='',query=''}={}){
 return apps.filter(a=>(!entity||(a.Entity||'Not provided')===entity)&&matchesApplication(a,query));
}
export function overviewStats(model,filters={}){
 const apps=model.apps.filter(a=>(!filters.division||(a.Division||'Not provided')===filters.division)&&(!filters.entity||(a.Entity||'Not provided')===filters.entity));
 const fields=maintenanceFields.map(([key,label])=>({key,label,filled:apps.filter(a=>filled(a,key)),missing:apps.filter(a=>!filled(a,key))}));
 const complete=apps.filter(a=>maintenanceFields.every(([key])=>filled(a,key)));
 const maintenance={fields,complete,incomplete:apps.filter(a=>!complete.includes(a))};
 function dimension(dim){
  const isCap=dim==='cap',map=isCap?model.caps:model.procs,raw=isCap?'rawCap':'rawProcess';
  const issues=a=>model.issues.filter(i=>i.appId===a.id&&i.type.startsWith(isCap?'业务能力':'流程'));
  const recognized=a=>a[dim].filter(id=>isCap?!!map.get(id)?.reference:!!map.get(id)&&!map.get(id).ambiguous);
  const registered=apps.filter(a=>isCap?a[raw].length||a[dim].length:a.rawProcess.length||a.process.length);
  const matched=registered.filter(a=>recognized(a).length===a[dim].length&&a[dim].length>0&&!issues(a).length&&!(a.accepted||[]).some(d=>d.dimension===dim));
  const pending=registered.filter(a=>!matched.includes(a)),missing=apps.filter(a=>!registered.includes(a));
  const scoped=a=>recognized(a).filter(id=>!isCap||inB06(id));
  const deepest=a=>scoped(a).length?Math.max(...scoped(a).map(id=>map.get(id).level)):null;
  const first=isCap?1:0,highest=Math.max(3,...apps.map(a=>deepest(a)??0));
  const levels=Array.from({length:highest-first+1},(_,i)=>({label:'L'+(i+first),apps:apps.filter(a=>deepest(a)===i+first)}));
  levels.push({label:isCap?'No B.06 match':'No matched level',apps:apps.filter(a=>deepest(a)===null)});
  const nodes=[...map.values()].filter(n=>isCap?!!n.reference&&inB06(n.id):true);
  const covered=nodes.filter(n=>apps.some(a=>scoped(a).some(id=>model.ancestor(n.id,id))));
  const branches=nodes.filter(n=>isCap?n.parent==='B.06':n.level===0).map(n=>({id:n.id,label:isCap?n.label.replace(/^\S+\s*/, ''):n.label,apps:apps.filter(a=>scoped(a).some(id=>model.ancestor(n.id,id)))})).sort((a,b)=>b.apps.length-a.apps.length||compareNatural(a.id,b.id));
  return {registered,matched,pending,missing,levels,covered:covered.length,taxonomyTotal:nodes.length,branches};
 }
 return {apps,maintenance,cap:dimension('cap'),process:dimension('process')};
}

// Use the workbook's explicit levels: Capability L1–L3, Process L0–L3.
// Filled/missing describe explicit registration. Capability and Process L2 quality also accept coverage by confirmed L3
// entries and their standard parents (owner decision 2026-10-20). L3V counts as Level 3 (2026-10-19).
export function maintenanceReport(model,filters={},dimension='cap'){
 const apps=model.apps.filter(a=>(!filters.division||(a.Division||'Not provided')===filters.division)&&(!filters.entity||(a.Entity||'Not provided')===filters.entity)),isCap=dimension==='cap';
 const levels=isCap?[1,2,3]:[0,1,2,3],map=isCap?model.caps:model.procs;
 const records=new Map(apps.map(a=>{
  const rawCapabilities=[...split(a['Main Business Capability']).filter(raw=>!otherCompanyRecord(raw)),...a.rawCap];
  const seen=new Set(),uniqueCapabilities=rawCapabilities.filter(raw=>{const key=capCode(raw)||norm(raw);if(seen.has(key))return false;seen.add(key);return true;});
  // A process record listed twice in the source is one record (one issue at most), as for capabilities.
  const source=isCap?uniqueCapabilities:[...new Set(a.rawProcess)];
  const corrections=model.correctionLog.filter(c=>c.state==='Applied'&&c.appId===a.id&&c.dimension===dimension);
  // A mapping for an empty assignment remains effective when a separate main
  // capability supplies L1. Preserve both records in the maintenance report.
  const values=corrections.some(c=>c.raw==='')?[...source,'']:source;
  return [a.id,values.map(raw=>{
   const mapped=corrections.find(c=>c.raw===raw),id=mapped?.targetId||(isCap?capCode(raw):null);
   const issue=model.issues.find(i=>i.appId===a.id&&i.value===raw&&i.type.startsWith(isCap?'业务能力':'流程'));
   const level=mapped?map.get(id)?.level:isCap?(id?id.split('.').length-1:null):PROCESS_LEVEL.exec(raw)?.[1];
   // A record the owner confirmed as recorded is not an issue, but it has no catalogue code: it never matches the standard.
   const accepted=!mapped&&(a.accepted||[]).find(d=>d.dimension===dimension&&d.raw===raw)||null;
   const valid=!accepted&&(!!mapped||(isCap?!!id&&!!map.get(id)?.reference:level!==undefined&&level!==null&&!issue));
   return {raw,level:level===undefined||level===null?null:Number(level),valid,accepted,reason:accepted?'Confirmed by owner as recorded':issue?.type||(!valid?'Not matched to the current taxonomy':'')};
  })];
 }));
 const level2Coverage=new Map(apps.map(a=>[a.id,coverageAtLevel2(model,{records,dimension},a)]));
 // Every open issue of every applicable level, per application: one result for the To review counts, the To review
 // list and the application detail (owner specification 2026-10-20).
 const issues=new Map(apps.map(a=>[a.id,reviewIssues(model,{records,levelsAvailable:levels,dimension,level2Coverage},a)]));
 function summarize(group){
  const inScope=a=>records.get(a.id);
  const registered=group.filter(a=>inScope(a).length);
  const quality=registered.filter(a=>inScope(a).every(r=>r.valid));
  const pending=registered.filter(a=>!quality.includes(a)),missing=group.filter(a=>!registered.includes(a));
  const levelRows=levels.map(level=>{
   const filled=group.filter(a=>inScope(a).some(r=>r.level===level));
   const directValid=filled.filter(a=>inScope(a).filter(r=>r.level===level).every(r=>r.valid));
   const inferred=level===2?group.filter(a=>level2Coverage.get(a.id).length):dimension==='process'&&level<2?group.filter(a=>processAncestorCoverage(model,{records,dimension},a,level).length):[];
   const valid=group.filter(a=>directValid.includes(a)||inferred.includes(a));
   const covered=group.filter(a=>filled.includes(a)||inferred.includes(a));
   return {level,filled,directValid,inferred,covered,valid,invalid:filled.filter(a=>!directValid.includes(a)),missing:group.filter(a=>!filled.includes(a)),uncovered:group.filter(a=>!covered.includes(a))};
  });
  // To review: applications with at least one open issue in this dimension, at any level (not only Level 3).
  const needsReview=group.filter(a=>issues.get(a.id).length);
  return {apps:group,registered,quality,pending,missing,needsReview,levels:levelRows};
 }
 const plants=[...new Set(apps.map(a=>a.Entity||'Not provided'))].sort().map(plant=>({plant,...summarize(apps.filter(a=>(a.Entity||'Not provided')===plant))}));
 return {...summarize(apps),plants,levelsAvailable:levels,records,issues,dimension,level2Coverage,unknown:apps.filter(a=>records.get(a.id).some(r=>r.level===null))};
}

// The percentage uses every application as its denominator, so the drill must
// include both invalid registrations and applications with no record at this level.
export function applicationsNotPassingLevelQuality(group,level){
 const passed=new Set(level.valid.map(a=>a.id));
 return group.apps.filter(a=>!passed.has(a.id));
}

export function maintenanceGapReasons(report,group,app,onlyLevels=null){
 const levels=onlyLevels?new Set(onlyLevels):null;
 return group.levels.filter(l=>!levels||levels.has(l.level)).flatMap(l=>{
  if(l.valid.some(a=>a.id===app.id))return [];
  if(l.missing.some(a=>a.id===app.id))return [`L${l.level} · No explicit registration`];
  if(!l.invalid.some(a=>a.id===app.id))return [];
  const failing=report.records.get(app.id)?.filter(r=>r.level===l.level&&!r.valid)||[],raw=failing.filter(r=>!r.accepted).map(r=>r.raw).filter(Boolean),confirmed=failing.filter(r=>r.accepted).map(r=>r.raw);
  return [...(raw.length||!confirmed.length?[`L${l.level} · Unrecognized registration${raw.length?': '+raw.join(' / '):''}`]:[]),...(confirmed.length?[`L${l.level} · Confirmed by owner as recorded (not in the catalogue): ${confirmed.join(' / ')}`]:[])];
 });
}

export function l3MaintenanceMetrics(report){
 const level=report.levels.find(l=>l.level===3);
 // Applications whose only Level 3 records outside the standard were confirmed by the owner as recorded (V9.18) are
 // not 'to review'; they still do not match the standard.
 const failing=app=>(report.records.get(app.id)||[]).filter(r=>r.level===3&&!r.valid);
 const confirmed=level.invalid.filter(app=>failing(app).length&&failing(app).every(r=>r.accepted));
 return {complete:level.filled,quality:level.valid,notPassing:applicationsNotPassingLevelQuality(report,level).filter(app=>!confirmed.includes(app)),confirmed,missing:level.missing};
}

export function createOverviewUI({getModel,escape:esc,onApp,onStateChange=()=>{}}){
 const host=document.getElementById('overviewWorkspace'),dialog=document.getElementById('overviewDetail');
 let filters={division:'',entity:''},dimension='cap',report,drills=new Map(),lastModel,currentDrill,visibleDrillApps=[],showAllLevels=false;
 const percent=(n,total)=>total?new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n/total*100)+'%':'—';
 const width=(n,total)=>total?n/total*100:0;
 const title=()=>dimension==='cap'?'Business Capability':'Process';
 const el=id=>document.getElementById(id);
 host.innerHTML=`<div class="overview-toolbar"><div><h2>Application maintenance</h2><p id="overviewScope" role="status"></p></div><div class="overview-filters"><label>Business unit<select id="overviewGB"></select></label><button id="overviewReset">Clear filters</button><button id="overviewExportReview" type="button">Export To review (CSV)</button></div></div><div id="overviewSummary"></div><section class="overview-plant-finder" aria-labelledby="overviewPlantTitle"><div class="plant-finder-heading"><h3 id="overviewPlantTitle">Find your plant</h3><label class="plant-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="overviewPlantSearch" type="search" aria-label="Search plants" placeholder="Search plants" autocomplete="off"></label></div><div id="overviewPlantChoices" class="overview-plant-choices" role="group" aria-label="Choose a plant"></div></section><div class="overview-dimension-row"><div class="segments" aria-label="Overview dimension"><button data-overview-dim="cap" class="active" aria-pressed="true">Business Capability</button><button data-overview-dim="process" aria-pressed="false">Process</button></div></div><div id="overviewPanels"></div>`;
 dialog.innerHTML='<div class="overview-detail-header"><button class="close" id="overviewDetailClose" aria-label="Close overview details">×</button><p id="overviewDetailContext" role="status" aria-live="polite"></p><h2 id="overviewDetailTitle"></h2><p id="overviewDetailNote"></p></div><div class="overview-detail-toolbar"><label class="overview-detail-search">'+APP_SEARCH_LABEL+'<input id="overviewDetailSearch" type="search" placeholder="'+APP_SEARCH_PLACEHOLDER+'" autocomplete="off"></label><label>Plant<select id="overviewDetailPlant"></select></label><button id="overviewDetailReset">Clear filters</button></div><div id="overviewDetailBody"></div>';
 function plantScope(){return getModel().apps.filter(a=>!filters.division||(a.Division||'Not provided')===filters.division);}
 function renderPlantChoices(){
  const apps=plantScope(),query=el('overviewPlantSearch').value.trim().toLocaleLowerCase();
  const plants=[...new Set(apps.map(a=>a.Entity||'Not provided'))].sort();
  const matches=plants.filter(p=>p.toLocaleLowerCase().includes(query));
  const choice=(plant,count,label=plant)=>`<button class="plant-choice ${filters.entity===plant?'is-selected':''}" data-overview-plant="${esc(plant)}" aria-pressed="${filters.entity===plant}" aria-label="${esc(label)}: ${count} ${count===1?'application':'applications'}"><span>${esc(label)}</span><span class="plant-choice-count">${count}</span>${filters.entity===plant?'<span class="plant-choice-check" aria-hidden="true">✓</span>':''}</button>`;
  el('overviewPlantChoices').innerHTML=choice('',apps.length,'All plants')+matches.map(p=>choice(p,apps.filter(a=>(a.Entity||'Not provided')===p).length)).join('')+(matches.length?'':'<span class="plant-search-empty" role="status">No plants found. Try another name.</span>');
 }
 function selectPlant(plant){filters.entity=plant;el('overviewPlantSearch').value='';refresh();onStateChange();host.querySelectorAll('[data-overview-plant]').forEach(b=>{if(b.dataset.overviewPlant===plant)b.focus({preventScroll:true});});}
 function drill(key,label,apps,note='',review=false,gap=null){drills.set(key,{label,apps,note,review,gap});return `data-overview-drill="${esc(key)}"`;}
 function cell(key,label,apps,total,tone,detailApps=apps,detailLabel=label,detailNote='',gap=null){
  const complete=total>0&&apps.length===total,body=`<strong>${percent(apps.length,total)}${complete?' <small>✓</small>':''}</strong><span class="overview-bar"><span style="width:${width(apps.length,total)}%"></span></span>`;
  const tooltip=esc(`${label}: ${apps.length} / ${total}`);
  return complete?`<span class="maintenance-cell ${tone}" title="${tooltip}">${body}</span>`:`<button class="maintenance-cell ${tone}" ${drill(key,detailLabel,detailApps,detailNote,false,gap)} title="${tooltip}" aria-label="${tooltip}">${body}</button>`;
 }
 function plantTable(){
  const cols=showAllLevels?report.levelsAvailable:[3];
  function costCell(apps,key,label){
   const outside=apps.filter(a=>scopeReason(a)),included=apps.filter(a=>!scopeReason(a)),cost=costSummary(included),amount=included.length?formatRMB(cost.annualTotal):'Out of scope';
   const suffix=outside.length&&included.length?`<small> · ${outside.length} out of scope</small>`:'';
   const costDrill=drill(key+'cost',label+' · Annual cost',apps);drills.get(key+'cost').costDetail=true;
   return `<td data-label="Annual cost" class="operation-cost"><button class="plant-cost-link" ${costDrill}><strong>${esc(amount)}</strong>${suffix}</button></td>`;
  }
  function row(r,key,label,isTotal=false){
   const appDrill=drill(key+'apps',label+' · Applications',r.apps);
   const levels=r.levels.filter(l=>cols.includes(l.level)).map(l=>{
    const notPassing=applicationsNotPassingLevelQuality(r,l),note=(l.level===2||(dimension==='process'&&l.level<2))?`Check unresolved Level ${l.level} records and catalogue coverage. A separate Level ${l.level} entry is not required when all registered Level 3 records are confirmed and their Level ${l.level} parents match the standard.`:`Check Level ${l.level} records and catalogue coverage; add missing details or update confirmed errors.`;
    return `<td data-label="Level ${l.level} filled">${cell(key+'l'+l.level+'c',label+' · Level '+l.level+' filled',l.filled,r.apps.length,'completion')}</td><td data-label="Level ${l.level} matches standard">${cell(key+'l'+l.level+'q',label+' · Level '+l.level+' matches standard',l.valid,r.apps.length,'quality',notPassing,label+' · To review',note,{group:r,levels:[l.level]})}</td>`;
   }).join('');
   return `<tr ${isTotal?'class="maintenance-total"':''}><th scope="row">${isTotal?esc(label):`<button class="plant-table-link" ${appDrill}>${esc(label)} <span aria-hidden="true">↗</span></button>`}</th><td data-label="Applications"><button class="plant-number" ${appDrill}>${r.apps.length}</button></td>${levels}<td data-label="To review">${r.needsReview.length?`<button class="plant-review has-issues" ${drill(key+'review',label+' · To review',r.needsReview,`Applications with at least one open issue at any level: ${r.needsReview.length} ${r.needsReview.length===1?'application':'applications'}, ${r.needsReview.reduce((n,a)=>n+report.issues.get(a.id).length,0)} issues in total (issue count, not applications). Each application is listed once. Select View details to see its issues.`,true,{issues:true})}>${r.needsReview.length}</button>`:'<span class="plant-complete">✓</span>'}</td>${costCell(r.apps,key,label)}</tr>`;
  }
  return `<section class="overview-card plant-maintenance"><div class="overview-card-title"><h3>Maintenance by plant</h3><label class="all-levels"><input id="showAllLevels" type="checkbox" ${showAllLevels?'checked':''}> Show all levels</label></div><div class="maintenance-table-scroll" role="region" aria-label="${title()} maintenance by plant"><table class="maintenance-table ${showAllLevels?'all-levels-table':''}"><thead><tr><th scope="col">Plant</th><th scope="col">Applications</th>${cols.map(l=>`<th scope="col">Level ${l} filled</th><th scope="col">Level ${l} matches standard</th>`).join('')}<th scope="col">To review</th><th scope="col">Annual cost<span class="cost-column-unit">/ year</span></th></tr></thead><tbody>${report.plants.map((p,i)=>row(p,'plant'+i,p.plant)).join('')||`<tr><td colspan="${cols.length*2+4}">No matching applications. <button data-reset-overview>Reset filters</button></td></tr>`}</tbody><tfoot>${row(report,'total','Total',true)}</tfoot></table></div>${dimension==='cap'&&showAllLevels?'<p class="hint">Level 2 filled counts direct registrations only. Level 2 matches standard also includes confirmed parents of fully matched Level 3 records; these applications do not need a separate Level 2 entry.</p>':''}</section>`;
 }
 function summaryCards(){
  const total=report.apps.length,l3=l3MaintenanceMetrics(report);
  return `<div class="overview-summary-cards"><section class="overview-card summary-card summary-inventory"><h3>Applications</h3><button class="summary-value" ${drill('all','Applications',report.apps)} aria-label="View all ${total} applications">${total}</button><p>${report.plants.length} ${report.plants.length===1?'plant':'plants'}</p></section><section class="overview-card summary-card summary-rate is-quality"><div class="customer-quality"><div><h3>Level 3 matches standard</h3><button class="summary-value" ${drill('l3quality','Level 3 matches standard',l3.quality)} aria-label="View ${l3.quality.length} applications matching the standard">${percent(l3.quality.length,total)}</button><p>${l3.quality.length} of ${total} applications</p></div><span class="summary-ring" style="--rate:${width(l3.quality.length,total)}%" aria-hidden="true"></span></div><div class="customer-kpi-actions"><button class="summary-status is-attention" ${drill('l3notpassing','Level 3 · To review',l3.notPassing,'Check Level 3 records and catalogue coverage; add missing details or update confirmed errors.',true,{group:report,levels:[3]})}>${l3.notPassing.length} Level 3 to review →${l3.confirmed.length?` <small>· ${l3.confirmed.length} confirmed as recorded</small>`:''}</button><button class="filled-link" ${drill('l3complete','Level 3 filled',l3.complete)} title="${percent(l3.complete.length,total)}">${l3.complete.length} of ${total} filled</button></div></section></div>`;
 }
 function refresh(){
  const model=getModel();if(!model)return;
  for(const [id,key,field,all]of[['overviewGB','division','Division','All business units']]){
   const values=[...new Set(model.apps.map(a=>a[field]||'Not provided'))].sort();if(!values.includes(filters[key]))filters[key]='';
   el(id).innerHTML=`<option value="">${all}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');el(id).value=filters[key];
  }
  if(filters.entity&&!plantScope().some(a=>(a.Entity||'Not provided')===filters.entity))filters.entity='';
  renderPlantChoices();
  if(model!==lastModel&&dialog.open)dialog.close();lastModel=model;
  report=maintenanceReport(model,filters,dimension);drills=new Map();const total=report.apps.length;
  el('overviewScope').textContent=`${total} of ${model.apps.length} applications · ${filters.division||'All business units'} · ${filters.entity||'All plants'}`;
  host.querySelectorAll('[data-overview-dim]').forEach(b=>{b.classList.toggle('active',b.dataset.overviewDim===dimension);b.setAttribute('aria-pressed',String(b.dataset.overviewDim===dimension));});
  el('overviewSummary').innerHTML=summaryCards();
  el('overviewPanels').innerHTML=`${plantTable()}<details class="overview-definitions"><summary>How is this calculated?</summary><p>For each level, filled counts applications with directly recorded entries; matches standard counts applications whose entries match the current standard list. Both use all ${total} applications. Matching the standard does not confirm business suitability.</p><p>For Level 2, matches standard also accepts confirmed Level 2 parents from registered Level 3 records, when all those records match the standard and have no unresolved name or meaning issues. These applications do not need a separate Level 2 entry and are not flagged as Level 2 missing. Directly recorded Level 2 mismatches remain issues. This rule applies to Business Capability and Process and does not change filled counts or source records.</p><p>To review counts applications with at least one open issue at any level of this view (a missing level, a record that does not match the standard, a record without a level, or a name or meaning to confirm). It does not depend on Show all levels.</p><p>Annual cost bands: 5 → ¥10,000; 4 → ¥20,000; 3 → ¥50,000; 2 → ¥100,000; 1 → ¥200,000 / year.</p><p>Out-of-scope applications are not included in cost totals.</p></details>`;
  el('showAllLevels').onchange=e=>{showAllLevels=e.target.checked;refresh();onStateChange();};

 }
 function renderDrill(){
  if(!currentDrill)return;
  visibleDrillApps=filterOverviewApplications(currentDrill.apps,{entity:el('overviewDetailPlant').value,query:el('overviewDetailSearch').value});
  const plants=[...new Set(visibleDrillApps.map(a=>a.Entity||'Not provided'))].sort();
  const searching=!!el('overviewDetailSearch').value.trim(),plantQualifier=el('overviewDetailPlant').value||filters.entity,qualifiers=[filters.division?`BU ${filters.division}`:'',plantQualifier?`Plant ${plantQualifier}`:''].filter(Boolean);
  el('overviewDetailContext').textContent=`${title()} · ${searching?`${visibleDrillApps.length} of ${currentDrill.apps.length} applications`:`${visibleDrillApps.length} applications`} · ${plants.length} ${plants.length===1?'plant':'plants'}${qualifiers.length?' · '+qualifiers.join(' · '):''}`;
  el('overviewDetailBody').innerHTML=plants.map((plant,i)=>{
   const apps=visibleDrillApps.filter(a=>(a.Entity||'Not provided')===plant).sort((a,b)=>(a.Name||'').localeCompare(b.Name||''));
   return `<section class="overview-plant-group" aria-labelledby="overviewPlantGroup${i}"><h3 id="overviewPlantGroup${i}"><span>${esc(plant)}</span><span>${apps.length} ${apps.length===1?'application':'applications'}</span></h3><ul class="overview-app-list">${apps.map(a=>`<li><button data-overview-app="${esc(a.id)}"><span><b>${esc(a.Name||'Unnamed application')}</b><span>${esc(a.Division||'Business unit not recorded')}</span><span class="overview-cost-score">${scopeReason(a)?'Out of scope · '+esc(scopeReason(a)):esc(annualLabel(a))}</span></span><span class="overview-open-label">View details →</span></button></li>`).join('')}</ul></section>`;
  }).join('')||`<div class="overview-empty"><strong>${currentDrill.apps.length?'No matching applications':'No applications in this group'}</strong>${currentDrill.apps.length?'<p>Try another name or clear your filters.</p><button data-overview-clear-drill>Clear filters</button>':''}</div>`;
  if(currentDrill.costDetail){
   const cost=costSummary(visibleDrillApps.filter(a=>!scopeReason(a)));
   el('overviewDetailBody').innerHTML=`<div class="cost-detail-scroll"><table class="cost-detail-table"><thead><tr><th>Application</th><th>Annual cost / year</th><th>ROI (payback period)</th></tr></thead><tbody>${visibleDrillApps.map(a=>`<tr><td><button data-overview-app="${esc(a.id)}">${esc(a.Name)}</button></td><td><strong>${scopeReason(a)?'Out of scope':esc(annualLabel(a))}</strong></td><td title="${esc(roiPaybackNote(a))}">${esc(formatROIPayback(a))}</td></tr>`).join('')||'<tr><td colspan="3">No applications match these filters.</td></tr>'}</tbody><tfoot><tr><th>Total</th><td>${visibleDrillApps.length&&!visibleDrillApps.some(a=>!scopeReason(a))?'Out of scope':formatRMB(cost.annualTotal,{openEnded:cost.openEndedCount>0})}</td><td>—</td></tr></tfoot></table><p>ROI (payback period) is shown from the source 1–5 ROI score: ${esc(ROI_PAYBACK_RULE)}. Other scores need confirmation. It is not a monetary amount.</p></div>`;
  }
  el('overviewDetailBody').scrollTop=0;
  el('overviewDetailReset').disabled=!el('overviewDetailPlant').value&&!el('overviewDetailSearch').value;
 }
 function resetDrillFilters(){el('overviewDetailPlant').value='';el('overviewDetailSearch').value='';renderDrill();}
 function openDrill(key){
  const d=drills.get(key);if(!d)return;currentDrill={...d,scopeLabel:filters.entity||filters.division};
  el('overviewDetailTitle').textContent=d.label;
  el('overviewDetailContext').textContent='';
  el('overviewDetailNote').textContent=d.note;el('overviewDetailNote').hidden=!d.note;
  const plants=[...new Set(d.apps.map(a=>a.Entity||'Not provided'))].sort();
  el('overviewDetailPlant').innerHTML='<option value="">All plants in this list</option>'+plants.map(p=>`<option value="${esc(p)}">${esc(p)} (${d.apps.filter(a=>(a.Entity||'Not provided')===p).length})</option>`).join('');
  resetDrillFilters();dialog.showModal();el('overviewDetailSearch').focus({preventScroll:true});
 }
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-reset-overview')){filters={division:'',entity:''};refresh();}if(b.dataset.overviewPlant!==undefined)selectPlant(b.dataset.overviewPlant);if(b.dataset.overviewDrill)openDrill(b.dataset.overviewDrill);if(b.dataset.labelApp)onApp(b.dataset.labelApp);if(b.dataset.overviewDim){dimension=b.dataset.overviewDim;refresh();onStateChange();}});
 dialog.addEventListener('click',e=>{
  const b=e.target.closest('[data-overview-app]');if(!b)return;
  dialog.close();onApp(b.dataset.overviewApp);
  el('detail').addEventListener('close',()=>{dialog.showModal();b.focus({preventScroll:true});},{once:true});
 });
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-overview-clear-drill]')){resetDrillFilters();el('overviewDetailSearch').focus();}});
 el('overviewDetailSearch').oninput=renderDrill;el('overviewDetailPlant').onchange=renderDrill;el('overviewDetailReset').onclick=resetDrillFilters;
 el('overviewDetailClose').onclick=()=>dialog.close();
 el('overviewPlantSearch').oninput=renderPlantChoices;
 el('overviewGB').onchange=e=>{filters.division=e.target.value;el('overviewPlantSearch').value='';refresh();onStateChange();};
 el('overviewReset').onclick=()=>{filters={division:'',entity:''};el('overviewPlantSearch').value='';refresh();onStateChange();};
 return {refresh,getState:()=>({...filters,dimension,showAllLevels}),restoreState:s=>{filters={division:String(s?.division||''),entity:String(s?.entity||'')};dimension=s?.dimension==='process'?'process':'cap';showAllLevels=!!s?.showAllLevels;refresh();}};
}

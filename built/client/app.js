import {formatROIPayback,roiPaybackNote} from './roi.mjs';
import {displayName,opportunityCostLabel,scopeReason} from './display.mjs';
import {formatCostScore,formatAnnualCost,annualCost} from './costs.mjs';
import {opportunityEligibility} from './scope.mjs';
import {createOverviewUI,maintenanceReport} from './overview.mjs';
import {previewImport,mergeInventoryEvidence,catalogueNotice,importAppliedStatus} from './import-review.mjs';
import {filterLandscape,landscapeColumns,landscapeHeaderCell,openOneLevel,closeCategory,expandAll,openedGroupRows,openedGroupCell,OPENED_ROW_HEIGHT,categoryOptions} from './landscape.mjs';
import {processIssues,renderProcessIssues,capabilityIssues,renderCapabilityIssues,focusApplicationIssue} from './process-issues.mjs';
import {english} from './english.mjs';
import {buildModel,columns} from './model.mjs';
import {readXlsx,inventoryFromSheets,taxonomyFromSheets,taxonomySourceName,processTaxonomySource} from './xlsx.mjs';
import {createComparisonUI} from './similarity-ui.mjs';
import {exportWorkspace,importWorkspace,mergeBundledCorrections,workspaceData} from './workspace.mjs';
import {createAutosave,readView,writeView,viewForDatasetRestore} from './autosave.mjs';
import {applicationTimeline,applicationTimelineCSV,cleanApplicationEvents,importEvents,recordImport} from './application-history.mjs';
import {dataChecksForApp,dataChecksSummary,renderDataChecks} from './data-checks.mjs';
import {renderSourceRecords} from './source-records.mjs';
import {chronologicalEvents,renderHistoryRecords} from './history-view.mjs';
import {tabFromSearch,searchForTab} from './view-route.mjs';
import './fullscreen.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep the supplied taxonomy text intact; tidy repeated ellipses in menu labels only.
const menuLabel=s=>String(s??'').replace(/(?:\s*…\s*){2,}/g,' … ').replace(/\s+/g,' ').trim();
const localAdmin=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('admin')==='1';
let autosave;
const isAdmin=()=>localAdmin||!!autosave?.isSignedIn();
if(new URLSearchParams(location.search).get('tab')==='review'){const url=new URL(location.href);url.search=searchForTab(url.search,'overview');try{history.replaceState(null,'',url);}catch{/* Some file: browsers restrict URL changes; normal tab routing still applies. */}}
let startupView=null,startupRenderedView=null,handlingPopstate=false,lastNavTab=null;
let importGeneration=0,pendingImport,importUndo,data,model,landscapeModel,visibleColumns=[],filters={query:'',division:'',entity:'',branch:''},initialData,initializing=true,viewTimer,view='cap',group='Division',expanded=new Set();
const comparison=createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,onApp:showApp,isSignedIn:isAdmin,onStateChange:saveView,onPairReview:(key,review)=>{data={...data,pairReviews:{...(data.pairReviews||{}),[key]:review}};if(isAdmin())autosave.schedule();},onWeightsChange:weights=>{if(!isAdmin())return;data={...data,similarityWeights:weights,similarityWeightsVersion:2};autosave.schedule();},onThresholdChange:storeThreshold});
const overview=createOverviewUI({getModel:()=>model,escape:esc,onApp:showApp,onStateChange:saveView});


autosave=createAutosave({getData:()=>data,onRestore:next=>{const state=model?viewForDatasetRestore(startupView,startupRenderedView,captureView()):null;startupView=null;const merged=mergeBundledCorrections(next,initialData);useData(merged.data);if(state)restoreView(state);if(merged.changed)autosave.schedule();const notice=catalogueNotice(merged.data,initialData);if(notice)$('sessionStatus').textContent=notice;},onRecovery:showRecovery,onStatus:({message,kind})=>{$('autosaveStatus').textContent=message;$('saveBar').dataset.kind=kind;$('saveSignIn').hidden=kind!=='signin';$('saveRetry').hidden=!['error','conflict'].includes(kind);$('saveRetry').textContent=kind==='conflict'?'Review recovery':'Retry';syncAdmin(kind,message);}});
function syncAdmin(kind='',message=''){
 // Sign-in expiry behaviour is unchanged: the owner deferred the session-expiry notice/backup proposal (2026-10-13).
 const admin=isAdmin();document.body.classList.toggle('admin-view',admin);
 for(const id of ['importOpen','exportOpen'])$(id).hidden=!admin;
 $('saveBar').hidden=!admin||!['error','conflict','warning'].includes(kind);
 $('headerSignIn').hidden=admin;
 $('accountStatus').textContent=admin?(localAdmin?'Admin preview':kind==='saving'?'Saving…':['saved','warning'].includes(kind)?'Saved':'Not saved'):kind==='error'?'Unavailable':'';
 $('accountStatus').title=admin?message:'';
 $('accountRetry').hidden=admin||kind!=='error';
 if(model)comparison.refresh();
}
$('accountRetry').onclick=()=>autosave.retry();
$('saveRetry').onclick=()=>autosave.retry();
let recoveryRemote=null;
function showRecovery(remote){recoveryRemote=remote;$('recoverySummary').innerHTML=[['My changes',data],['Saved workspace',remote.data]].map(([title,d])=>`<section><h3>${title}</h3><p>${esc(d.source)}</p><b>${d.apps.length} applications</b></section>`).join('');$('recoveryStatus').textContent='';if(!$('saveRecovery').open)$('saveRecovery').showModal();}
$('recoveryClose').onclick=()=>$('saveRecovery').close();
$('recoveryExport').onclick=()=>$('exportOpen').click();
$('recoveryExportSaved').onclick=()=>{if(recoveryRemote)downloadWorkspace(recoveryRemote.data,'logistics-workspace-saved-version-');};
for(const [id,choice] of [['recoveryLocal','local'],['recoverySaved','saved']])$(id).onclick=async()=>{$(id).disabled=true;try{if(await autosave.resolveRecovery(choice))$('saveRecovery').close();}catch(error){$('recoveryStatus').textContent=english(error.message);}finally{$(id).disabled=false;}};
function rebuildModels(){model=buildModel(data);}
function filterOptions(){
 const option=(id,values,all,current)=>{const select=$(id),item=([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`,groups=[...new Set(values.map(v=>v[2]).filter(Boolean))];select.innerHTML=`<option value="">${all}</option>`+(groups.length?groups.map(group=>`<optgroup label="${esc(group)}">${values.filter(v=>v[2]===group).map(item).join('')}</optgroup>`).join(''):values.map(item).join(''));select.value=current;if(select.selectedIndex<0)select.value='';return select.value;};
 filters.division=option('landscapeGB',[...new Set(model.apps.map(a=>a.Division||'Not provided'))].sort().map(v=>[v,v]),'All business units',filters.division);
 filters.entity=option('landscapeEntity',[...new Set(model.apps.filter(a=>!filters.division||(a.Division||'Not provided')===filters.division).map(a=>a.Entity||'Not provided'))].sort().map(v=>[v,v]),'All plants',filters.entity);
 const map=view==='cap'?model.caps:model.procs;
 filters.branch=option('landscapeBranch',categoryOptions(model,view),'All categories',filters.branch);
 $('landscapeSearch').value=filters.query;
}
function clearFilters(){expanded.clear();filters={query:'',division:'',entity:'',branch:''};render();saveView();}
$('clearLandscape').onclick=clearFilters;
for(const [id,key] of [['landscapeSearch','query'],['landscapeGB','division'],['landscapeEntity','entity'],['landscapeBranch','branch']])$(id).addEventListener(id==='landscapeSearch'?'input':'change',e=>{filters[key]=e.target.value;if(key==='division')filters.entity='';if(key==='branch'){expanded.clear();if(filters.branch)openOneLevel(expanded,filters.branch);}render();});
const colors={PS:'#438879',EM:'#357cb1',VM:'#928276',ME:'#88983d',MA:'#9165aa'};
function render(){
 filterOptions();landscapeModel=filterLandscape(model,view,filters);
 const groups=new Set(landscapeModel.apps.map(a=>a.Division||'Not provided')).size;
 $('metrics').innerHTML=[['Applications shown',landscapeModel.apps.length],['Business units',groups]].map(([label,n])=>`<div class="metric"><span>${label}</span><strong>${n}</strong></div>`).join('');
 $('sampleNotice').hidden=!data.isAcceptanceSample;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 $('viewLabel').textContent=view==='cap'?'Business Capability':'Process';
 const cols=landscapeColumns(landscapeModel,view,expanded,filters.branch,columns),map=view==='cap'?model.caps:model.procs;
 visibleColumns=cols;$('landscapeCount').textContent=`${landscapeModel.apps.length} of ${model.apps.length} applications shown`;
 $('columnCount').textContent=`${cols.length} ${cols.length===1?'category':'categories'}`;
 const grouped=[...new Set(landscapeModel.apps.map(a=>a[group]||'Not provided'))].sort((a,b)=>{const order=['PS','EM','VM','ME','MA'];return group==='Division'?(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b)):a.localeCompare(b);});
 const openedRows=openedGroupRows(cols),headTop=openedRows.length*OPENED_ROW_HEIGHT;
 const header=cols.map(c=>{
  const children=(c.children||[]).filter(id=>landscapeModel.apps.some(a=>a[view+'Leaf'].some(leaf=>model.ancestor(id,leaf))));
  const label=c.id==='unmapped'?'Not classified':c.direct?'Only at this level':displayName(view==='cap'&&!c.reference?{id:c.id,label:c.id}:c);
  return landscapeHeaderCell(c,{label,subCategories:children.length,escape:esc,top:headTop});
 }).join('');
 const openedHeader=openedRows.map((row,level)=>`<tr class="opened-row"><th scope="col" class="opened-corner" style="top:${level*OPENED_ROW_HEIGHT}px">${level===0?'<span>Opened</span>':''}</th>${row.map(cell=>openedGroupCell(cell,{node:map.get(cell.id),level,escape:esc})).join('')}</tr>`).join('');
 const body=grouped.map(g=>{const apps=landscapeModel.apps.filter(a=>(a[group]||'Not provided')===g),color=group==='Division'?colors[g]||'#0071a8':'#0071a8';return `<tr style="--group:${color}"><th scope="row"><span class="rowname" style="color:${color}">${esc(g)}</span><span class="rowtotal">${apps.length} ${apps.length===1?'app':'apps'}</span></th>${cols.map(c=>{const items=c.apps.filter(a=>(a[group]||'Not provided')===g);return `<td>${items.length?`<span class="cell-count">${items.length} ${items.length===1?'app':'apps'}</span>`+items.map(a=>`<button class="app" data-app="${esc(a.id)}">${esc(a.Name)}<small>${esc(a.Entity||'Plant not provided')} · ${esc(a.Division||'Business unit not recorded')}</small></button>`).join(''):'<span class="empty">—</span>'}</td>`;}).join('')}</tr>`;}).join('');
 $('matrix').innerHTML=`<table style="width:${136+cols.length*262}px"><thead>${openedHeader}<tr><th scope="col"${headTop?` style="top:${headTop}px"`:''}>${group==='Division'?'Business unit':'Plant'}</th>${header}</tr></thead><tbody>${body}</tbody></table>`;
 if(!landscapeModel.apps.length)$('matrix').innerHTML='<div class="landscape-empty"><h3>No applications match these filters.</h3><button id="resetEmptyFilters">Clear filters</button></div>';
 $('resetEmptyFilters')?.addEventListener('click',clearFilters);
 updateMatrixEdges();comparison.refresh();
 overview.refresh();
}
function updateMatrixEdges(){const m=$('matrix'),shell=m.parentElement;shell.classList.toggle('has-left',m.scrollLeft>1);shell.classList.toggle('has-right',m.scrollLeft+m.clientWidth<m.scrollWidth-1);$('matrixLeft').hidden=m.scrollWidth<=m.clientWidth;$('matrixRight').hidden=m.scrollWidth<=m.clientWidth;}
$('matrixLeft').onclick=()=>$('matrix').scrollBy({left:-500,behavior:'smooth'});
$('matrixRight').onclick=()=>$('matrix').scrollBy({left:500,behavior:'smooth'});
$('matrix').addEventListener('scroll',updateMatrixEdges,{passive:true});window.addEventListener('resize',updateMatrixEdges);
function showApp(id,focus){
 const a=model.apps.find(a=>a.id===id);if(!a)return;
 const events=chronologicalEvents(applicationTimeline(data,a.id));
 const manualCreation=chronologicalEvents(cleanApplicationEvents(data.applicationEvents).filter(e=>e.appId===a.id&&e.kind==='created').map(e=>({...e,at:e.happenedAt})))[0];
 const imported=chronologicalEvents(importEvents(data.importHistory).filter(e=>e.kind==='import'&&e.appIds.includes(a.id)));
 const dataChecks=dataChecksForApp(model,a),checksSummary=dataChecksSummary(dataChecks),checks=renderDataChecks(dataChecks,esc);
 const history=`<section class="app-history" aria-label="Application history">${renderHistoryRecords(events,{creation:manualCreation,firstImport:imported[0]},esc)}</section>`;
 const processIssueList=processIssues(model,a),capabilityIssueList=capabilityIssues(model,a);
 const issueSections=[capabilityIssueList.length?`<div>${renderCapabilityIssues(capabilityIssueList,esc)}</div>`:'',processIssueList.length?`<div>${renderProcessIssues(processIssueList,esc)}</div>`:''].filter(Boolean);
 const issuePanel=issueSections.length?`<section class="profile-coverage"><div class="profile-section-title"><h3>Issues to review</h3></div><div class="profile-coverage-grid${issueSections.length===1?' single-dimension':''}">${issueSections.join('')}</div></section>`:'';
 const descriptionLines=String(a.Description||'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
 const purposeLines=descriptionLines.filter(line=>!/^oneIDM name is\b/i.test(line));
 const eligibility=opportunityEligibility(a);
 const disclosure=(id,label,meta,content)=>`<details class="profile-disclosure" id="${id}"><summary><span>${label}</span><small>${esc(meta)}</small><span class="profile-chevron" aria-hidden="true"></span></summary><div class="profile-disclosure-body">${content}</div></details>`;
 $('detailBody').innerHTML=`<div class="profile-heading"><div class="profile-identity"><h2 id="detailTitle">${esc(a.Name)}</h2><p>${esc(a.Division||'Business unit not recorded')}<span> / </span>${esc(a.Entity||'Plant not provided')}<span> · </span>${esc(a['Lifecycle: Current Lifecycle']||'Status not provided')}</p></div><div class="profile-cost"><span>Annual cost</span><strong>${esc(opportunityCostLabel(a))}</strong><span>ROI (payback period)</span><strong title="${esc(roiPaybackNote(a))}">${esc(formatROIPayback(a))}</strong></div></div><section class="profile-purpose"><h3>Purpose</h3><p>${esc(purposeLines.join('\n\n')||'No description provided.')}</p>${a['Lifecycle: Active']?`<small>Active since ${esc(a['Lifecycle: Active'])}</small>`:''}</section>${issuePanel}${!eligibility.eligible?`<p class="scope-banner">Not in similarity check – ${esc(scopeReason(a))}</p>`:''}${isAdmin()?`<div class="profile-support">${checksSummary?disclosure('appProfileChecks','Data checks',checksSummary,checks):''}${disclosure('appProfileHistory','History',`${events.length} ${events.length===1?'event':'events'}`,history)}${disclosure('appProfileSources','Source records','',renderSourceRecords(a,esc))}</div>`:''}`;
 if(!$('detail').open)$('detail').showModal();
 // Opened from a comparison record check: go to the issue for that source record (V9.15).
 if(focus)focusApplicationIssue($('detailBody'),focus);
 if($('exportAppHistory'))$('exportAppHistory').onclick=()=>{const csv=applicationTimelineCSV(a,events,data.source),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='Application_History_'+a.id+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view){view=b.dataset.view;filters.branch='';expanded.clear();render();}if(b.dataset.expand){openOneLevel(expanded,b.dataset.expand);render();}if(b.dataset.collapse){closeCategory(expanded,b.dataset.collapse,model.ancestor);render();}if(b.dataset.app)showApp(b.dataset.app);if(b.dataset.compareColumn){const c=visibleColumns.find(c=>c.key===b.dataset.compareColumn);if(c)comparison.open({poolIds:c.apps.map(a=>a.id),contextLabel:c.id==='unmapped'?'Not classified':displayName(c)});}});
$('group').onchange=e=>{group=e.target.value;render();};$('collapse').onclick=()=>{expanded.clear();render();};$('expandAll').onclick=()=>{expandAll(filterLandscape(model,view,filters),view,expanded,filters.branch,columns);render();};
$('detailClose').onclick=()=>$('detail').close();$('importOpen').onclick=()=>{if(initializing)return;$('inventoryFile').value='';$('taxonomyFile').value='';resetImportPreview();$('importStatus').textContent='';$('importDialog').showModal();};$('importClose').onclick=()=>$('importDialog').close();
 function useData(next){const clean=workspaceData(next),nextModel=buildModel(clean);data=clean;model=nextModel;expanded.clear();if($('detail').open)$('detail').close();render();}
 $('restoreData').onclick=()=>{if(initializing||!initialData||!data?.isAcceptanceSample)return;const previous=importUndo;if($('compareDialog').open)$('compareDialog').close();useData(previous?recordImport(data,previous.data,{kind:'restore'}):initialData);if(previous)restoreView(previous.view);importUndo=null;$('importUndoNotice').hidden=true;autosave.schedule();$('sessionStatus').textContent='Returned to the application inventory.';};
 function downloadWorkspace(workspace,prefix){try{const text=exportWorkspace(workspace),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=prefix+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);$('sessionStatus').textContent='Export started. Check your downloads for '+a.download+'.';return true;}catch(e){$('sessionStatus').textContent='Export failed: '+english(e.message);}}
 // The backup carries the minimum score in use; a started download is not proof that the file was saved.
 $('exportOpen').onclick=()=>{if(!data)return;if(downloadWorkspace({...data,similarityThreshold:comparison.getState().similarityThreshold},'logistics-workspace-'))autosave.exportStarted?.();};
 function storeThreshold(threshold){if(!isAdmin()||data?.similarityThreshold===threshold)return;data={...data,similarityThreshold:threshold};autosave.schedule();}
for(const id of ['detail','importDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
function resetImportPreview(){importGeneration++;pendingImport=null;$('importRun').disabled=false;$('importStatus').textContent='';$('importPreview').hidden=true;$('importPreview').innerHTML='';$('importApply').hidden=true;}
for(const id of ['inventoryFile','taxonomyFile'])$(id).onchange=resetImportPreview;
$('importDialog').addEventListener('close',resetImportPreview);
$('importRun').onclick=async()=>{
 const inventory=$('inventoryFile').files[0],taxonomy=$('taxonomyFile').files[0];resetImportPreview();
 if(!inventory&&!taxonomy){$('importStatus').textContent='Select an inventory, saved workspace or taxonomy.';return;}
 const button=$('importRun'),base=data,generation=importGeneration;button.disabled=true;$('importStatus').textContent='Reading and validating data…';
 try{
  let next=base,raw;
  if(inventory){if(inventory.size>30*1024*1024)throw Error('File exceeds 30 MB');if(/\.json$/i.test(inventory.name)){const text=await inventory.text();next=importWorkspace(text);raw=JSON.parse(text).data;}else next={...base,apps:mergeInventoryEvidence(base.apps,inventoryFromSheets(await readXlsx(inventory))),source:inventory.name,isAcceptanceSample:false};}
  if(taxonomy){if(taxonomy.size>30*1024*1024)throw Error('File exceeds 30 MB');const rows=taxonomyFromSheets(await readXlsx(taxonomy));next={...next,...rows,taxonomySource:rows.processRows?taxonomy.name:taxonomySourceName(processTaxonomySource(next.taxonomySource),taxonomy.name)};}
  if(generation!==importGeneration)return;
  const preview=previewImport(base,next,raw||next);pendingImport={...preview,base,inventoryFile:inventory?.name||'',taxonomyFile:taxonomy?.name||''};
  const list=(title,apps)=>apps.length?`<details><summary>${title} · ${apps.length}</summary><ul>${apps.map(a=>`<li>${esc(a.Name)} · ${esc(a.ID)}</li>`).join('')}</ul></details>`:'';
  $('importPreview').innerHTML=`<div class="import-summary"><h3>Import preview</h3><div class="import-counts">${[['Added',preview.added.length],['Updated',preview.updated.length],['Removed',preview.removed.length],['Unchanged',preview.unchanged]].map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('')}</div><dl class="source-records"><dt>Inventory</dt><dd>${esc(preview.next.source)}</dd><dt>Taxonomy</dt><dd>${esc(preview.next.taxonomySource)} · ${preview.taxonomyChanged?'Changed':'Unchanged'}</dd>${preview.capabilityChanges.total?`<dt>Capabilities</dt><dd>${preview.capabilityChanges.renamed} renamed · ${preview.capabilityChanges.added} added · ${preview.capabilityChanges.removed} removed</dd>`:''}<dt>Pair reviews</dt><dd>${preview.pairReviews.added} added · ${preview.pairReviews.updated} updated · ${preview.pairReviews.removed} removed · ${preview.pairReviews.count} in this file</dd><dt>Review notes</dt><dd>${preview.reviewNotes}</dd><dt>Mappings</dt><dd>${preview.appliedMappings} applied · ${preview.staleMappings} need review</dd><dt>Activity log</dt><dd>${preview.activityRecords} records</dd></dl>${preview.pairReviews.removed?`<p class="review-reason">${preview.pairReviews.removed} pair ${preview.pairReviews.removed===1?'review in the current workspace is':'reviews in the current workspace are'} absent from this import and would be removed. Export the current workspace before applying.</p>`:''}${preview.activityRemoved?`<p class="review-reason">${preview.activityRemoved} existing activity records are absent from this import. Export the current workspace before applying.</p>`:''}${preview.capabilityChanges.total?`<p class="review-reason">This taxonomy changes the capability catalogue: ${preview.capabilityChanges.renamed} names, ${preview.capabilityChanges.added} added and ${preview.capabilityChanges.removed} removed codes. Similarity results follow the new catalogue; application records are not changed.</p>`:''}${preview.costScoresRemoved||preview.scopeExclusionsRemoved?`<p class="review-reason">This import clears ${preview.costScoresRemoved} recorded cost scores and removes ${preview.scopeExclusionsRemoved} opportunity scope exclusions. Review the supplied blank values before applying.</p>`:''}${preview.descriptionsCleared||preview.lifecycleValuesCleared?`<p class="review-reason">This import clears ${preview.descriptionsCleared} existing descriptions and ${preview.lifecycleValuesCleared} lifecycle values with blank cells. Review the supplied blank values before applying.</p>`:''}${preview.ownerDecisions.length?`<p class="hint">${preview.ownerDecisions.map(d=>esc(d.note)+(preview.hasChanges?'. The original source value is recorded with this import.':'. This is already reflected in the current workspace; nothing will be recorded.')).join('<br>')}</p>`:''}<p class="hint">For Excel imports, optional columns or the cost sheet omitted from the file retain existing evidence by application ID. Blank values in a supplied column or sheet replace the previous value.</p>${list('Added applications',preview.added)}${list('Updated applications',preview.updated)}${list('Removed applications',preview.removed)}</div>`;
  $('importPreview').hidden=false;$('importApply').hidden=!preview.hasChanges;$('importStatus').textContent=preview.hasChanges?'Preview ready. Current data has not changed.':'No changes found. The current workspace and application history were kept.';
 }catch(error){if(generation===importGeneration)$('importStatus').textContent='Import failed: '+english(error.message)+' Current data has not changed.';}finally{if(generation===importGeneration)button.disabled=false;}
};
$('importApply').onclick=()=>{
 if(!pendingImport?.hasChanges)return;
 if(data!==pendingImport.base){resetImportPreview();$('importStatus').textContent='The workspace changed. Preview this import again.';return;}
 const previous={data,view:captureView()};
 try{useData(recordImport(previous.data,pendingImport.next,{inventoryFile:pendingImport.inventoryFile,taxonomyFile:pendingImport.taxonomyFile,decisions:pendingImport.ownerDecisions}));importUndo=previous;$('importUndoNotice').hidden=false;autosave.schedule();$('sessionStatus').textContent=importAppliedStatus(pendingImport,model.apps.length);resetImportPreview();$('importDialog').close();}catch(error){$('importStatus').textContent=english(error.message);}
};
$('undoImport').onclick=()=>{if(!importUndo)return;$('undoImportSummary').innerHTML=[['Current workspace',data],['Previous workspace',importUndo.data]].map(([title,d])=>`<section><h3>${title}</h3><p>${esc(d.source)}</p><b>${d.apps.length} applications</b></section>`).join('');$('undoImportDialog').showModal();};
$('undoImportClose').onclick=()=>$('undoImportDialog').close();$('undoImportExport').onclick=()=>$('exportOpen').click();
$('undoImportApply').onclick=()=>{if(!importUndo)return;const previous=importUndo;useData(recordImport(data,previous.data,{kind:'restore'}));restoreView(previous.view);importUndo=null;$('importUndoNotice').hidden=true;$('undoImportDialog').close();autosave.schedule();$('sessionStatus').textContent='Previous workspace restored.';};
function captureView(){return {view,group,filters:{...filters},expanded:[...expanded],overview:overview.getState(),active:activeTab(),comparison:comparison.getState(),scrollLeft:$('matrix').scrollLeft,scrollTop:$('matrix').scrollTop};}
function savedViewState(){const current=captureView(),state=viewForDatasetRestore(startupView,startupRenderedView,current);if(state===current)startupView=null;return state;}
function activeTab(){return !$('overviewWorkspace').hidden?'overview':!$('similarityReview').hidden?(comparison.getState().mode==='portfolio'?'opportunities':'similarity'):'landscape';}
function scrollActiveTab(){const tab=$({overview:'overviewTab',landscape:'landscapeTab',opportunities:'similarityTab',similarity:'similarityTab'}[activeTab()]);if(tab&&window.innerWidth<=800){const nav=$('workspaceNav'),rect=nav.getBoundingClientRect();if(rect.bottom>0&&rect.top<window.innerHeight)tab.scrollIntoView({inline:'nearest',block:'nearest'});}}
function syncTabURL(){const tab=activeTab();if(tab!==lastNavTab){lastNavTab=tab;scrollActiveTab();}if(handlingPopstate||tabFromSearch(location.search)===tab)return;const url=new URL(location.href),alias=new URLSearchParams(url.search).get('tab')==='similarity'&&tab==='opportunities';url.search=searchForTab(url.search,tab);(alias?history.replaceState:history.pushState).call(history,null,'',url);}
function saveView(){if(initializing||!model)return;syncTabURL();if(data?.isAcceptanceSample)return;clearTimeout(viewTimer);viewTimer=setTimeout(()=>{try{writeView(localStorage,savedViewState());}catch{}},100);}
function showOverview(){if(!model)return;document.body.classList.remove('is-similarity');document.body.classList.add('is-overview');for(const id of ['similarityReview','landscapeWorkspace','metrics'])$(id).hidden=true;$('overviewWorkspace').hidden=false;for(const id of ['overviewTab','landscapeTab','similarityTab']){$(id).classList.toggle('active',id==='overviewTab');$(id).setAttribute('aria-pressed',String(id==='overviewTab'));}overview.refresh();saveView();}
function showLandscape(){if(!model)return;document.body.classList.remove('is-overview','is-similarity');for(const id of ['overviewWorkspace','similarityReview'])$(id).hidden=true;$('landscapeWorkspace').hidden=false;$('metrics').hidden=false;updateMatrixEdges();for(const id of ['overviewTab','landscapeTab','similarityTab']){$(id).classList.toggle('active',id==='landscapeTab');$(id).setAttribute('aria-pressed',String(id==='landscapeTab'));}saveView();}
function showTab(tab){if(tab==='opportunities'||tab==='similarity'){comparison.resume();return;}comparison.leave();if(tab==='landscape')showLandscape();else showOverview();}
function restoreView(saved){if(!saved||typeof saved!=='object'){showTab(tabFromSearch(location.search));return;}view=['cap','process'].includes(saved.view)?saved.view:'cap';group=['Division','Entity'].includes(saved.group)?saved.group:'Division';$('group').value=group;filters={query:String(saved.filters?.query||''),division:String(saved.filters?.division||''),entity:String(saved.filters?.entity||''),branch:String(saved.filters?.branch||'')};const map=view==='cap'?model.caps:model.procs;expanded=new Set(Array.isArray(saved.expanded)?saved.expanded.filter(id=>map.has(id)):[]);render();comparison.restoreState(saved.comparison);overview.restoreState(saved.overview);showTab(tabFromSearch(location.search));requestAnimationFrame(()=>{$('matrix').scrollLeft=Number(saved.scrollLeft)||0;$('matrix').scrollTop=Number(saved.scrollTop)||0;});}
window.addEventListener('popstate',()=>{if(!model)return;handlingPopstate=true;try{showTab(tabFromSearch(location.search));lastNavTab=activeTab();scrollActiveTab();}finally{handlingPopstate=false;}});
$('overviewTab').onclick=()=>showTab('overview');
$('landscapeTab').onclick=()=>showTab('landscape');
for(const event of ['click','input','change'])document.addEventListener(event,saveView);
$('matrix').addEventListener('scroll',saveView,{passive:true});
window.addEventListener('pagehide',()=>{if(!initializing&&model&&!data.isAcceptanceSample)try{writeView(localStorage,savedViewState());}catch{}});
window.addEventListener('beforeunload',event=>{if(autosave.hasUnsaved()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosave.flush();});
try{const response=await fetch('./data.json');if(!response.ok)throw Error('Application data is unavailable.');initialData=workspaceData(await response.json());useData(initialData);let saved;try{saved=readView(localStorage);}catch{}restoreView(saved);startupView=saved;startupRenderedView=captureView();initializing=false;lastNavTab=activeTab();scrollActiveTab();await autosave.load();}catch(e){initializing=false;$('matrix').innerHTML=`<p class="fatal">${esc(english(e.message))}. Refresh the page and try again.</p>`;$('overviewWorkspace').innerHTML=$('matrix').innerHTML;}

if(model&&document.modelContext?.registerTool){const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'set_portfolio_view',title:'Switch landscape view',description:'Switch between capability and process views, group by GB or plant, and expand or collapse the hierarchy.',inputSchema:{type:'object',properties:{dimension:{type:'string',enum:['cap','process']},groupBy:{type:'string',enum:['Division','Entity']},expandAll:{type:'boolean'}},required:['dimension','groupBy','expandAll'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||!['cap','process'].includes(input.dimension)||!['Division','Entity'].includes(input.groupBy)||typeof input.expandAll!=='boolean')throw Error('Invalid view options');view=input.dimension;group=input.groupBy;filters={query:'',division:'',entity:'',branch:''};$('group').value=group;expanded=input.expandAll?new Set((view==='cap'?model.caps:model.procs).keys()):new Set();render();return{dimension:view,groupBy:group,applications:model.apps.length,columns:columns(model,view,expanded).length};}},{signal:controller.signal})).catch(()=>{});}catch{}}

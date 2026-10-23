import {formatROIPayback,roiPaybackNote} from './roi.mjs';
import {displayName,opportunityCostLabel,scopeReason} from './display.mjs';
import {formatCostScore,formatAnnualCost,annualCost} from './costs.mjs';
import {opportunityEligibility} from './scope.mjs';
import {acceptedText} from './accepted-records.mjs';
import {createOverviewUI,maintenanceReport} from './overview.mjs';
import {previewImport,applyInventory,catalogueNotice,importAppliedStatus,importChangesCSV} from './import-review.mjs';
import {renderImportChanges} from './import-changes-view.mjs';
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
import {tabFromSearch,searchForTab,appFromSearch,searchWithApp,appLink} from './view-route.mjs';
import {toReviewCSV,toReviewFileName} from './to-review-export.mjs';
import {dataAsOf,dataAsOfText} from './data-as-of.mjs';
import {DATA_PACKAGE_FILE,readDataPackage,applyDataPackage,packageIsNew,packageNotOlder,dataPackageText} from './data-package.mjs';
import {createAppSearch} from './app-search.mjs';
import {isLeanixProcessLinks,processExportWithoutLinks,readProcessLinks,compareProcessLinks,processCheckCSV,compareCatalogue,catalogueCheckCSV,catalogueNote,localProcessesFrom,NO_APPLICATIONS_COLUMN} from './leanix-process-check.mjs';
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
// Find applications from any page (V13; the same search rule as every other search box since V13.1).
createAppSearch({input:$('appSearch'),list:$('appSearchResults'),getApps:()=>model?.apps||[],onOpen:showApp,escape:esc});
// A text file download (CSV exports).
function downloadText(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
// To review as CSV for the current Overview filter (V11).
$('overviewExportReview').onclick=()=>{if(!model)return;const state=overview.getState(),filters={division:state.division,entity:state.entity};downloadText(toReviewCSV(model,filters,{source:data?.source||''}),toReviewFileName(filters),'text/csv;charset=utf-8');};
// Direct link to an application (V11): the address bar carries ?app=<ID> while its details are open.
function setAppParam(id){try{history.replaceState(history.state,'',location.pathname+searchWithApp(location.search,id)+location.hash);}catch{/* file: pages may restrict URL changes */}}


autosave=createAutosave({getData:()=>data,onRestore:next=>{const state=model?viewForDatasetRestore(startupView,startupRenderedView,captureView()):null;startupView=null;const merged=mergeBundledCorrections(next,initialData);useData(merged.data);if(state)restoreView(state);if(merged.changed)autosave.schedule();const fromPackage=packageNotOlder(merged.data.dataPackage,dataAsOf(initialData)?.date||'');const notice=fromPackage?'':catalogueNotice(merged.data,initialData);if(notice)$('sessionStatus').textContent=notice;},onRecovery:showRecovery,onStatus:({message,kind})=>{$('autosaveStatus').textContent=message;$('saveBar').dataset.kind=kind;$('saveSignIn').hidden=kind!=='signin';$('saveRetry').hidden=!['error','conflict'].includes(kind);$('saveRetry').textContent=kind==='conflict'?'Review recovery':'Retry';syncAdmin(kind,message);}});
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
 $('detailBody').innerHTML=`<div class="profile-heading"><div class="profile-identity"><h2 id="detailTitle">${esc(a.Name)}</h2><p>${esc(a.Division||'Business unit not recorded')}<span> / </span>${esc(a.Entity||'Plant not provided')}<span> · </span>${esc(a['Lifecycle: Current Lifecycle']||'Status not provided')}</p>${a.notInExport?`<p class="profile-caution">Not included in the LeanIX export of ${esc(a.notInExport.exportedAt||a.notInExport.file)}; kept with its last known records. This does not show that the application is retired.</p>`:''}<p class="profile-link"><button type="button" id="copyAppLink">Copy link to this application</button><span id="copyAppLinkStatus" role="status"></span></p></div><div class="profile-cost"><span>Annual cost</span><strong>${esc(opportunityCostLabel(a))}</strong><span>ROI (payback period)</span><strong title="${esc(roiPaybackNote(a))}">${esc(formatROIPayback(a))}</strong></div></div><section class="profile-purpose"><h3>Purpose</h3><p>${esc(purposeLines.join('\n\n')||'No description provided.')}</p>${a['Lifecycle: Active']?`<small>Active since ${esc(a['Lifecycle: Active'])}</small>`:''}</section>${issuePanel}${(a.accepted||[]).length?`<p class="hint profile-confirmed">${a.accepted.map(d=>esc(`${d.dimension==='cap'?'Business Capability':'Process'} · ${d.raw} — ${acceptedText(d)}`)).join('<br>')}</p>`:''}${!eligibility.eligible?`<p class="scope-banner">Not in similarity check – ${esc(scopeReason(a))}</p>`:''}${isAdmin()?`<div class="profile-support">${checksSummary?disclosure('appProfileChecks','Data checks',checksSummary,checks):''}${disclosure('appProfileHistory','History',`${events.length} ${events.length===1?'event':'events'}`,history)}${disclosure('appProfileSources','Source records','',renderSourceRecords(a,esc))}</div>`:''}`;
 if(!$('detail').open)$('detail').showModal();setAppParam(a.id);
 $('copyAppLink').onclick=async()=>{const link=appLink(location.href,a.id);try{await navigator.clipboard.writeText(link);$('copyAppLinkStatus').textContent=location.protocol==='file:'?' Link copied. It opens this file on this computer.':' Link copied.';}catch{window.prompt('Copy this link to the application:',link);}};
 // Opened from a comparison record check: go to the issue for that source record (V9.15).
 if(focus)focusApplicationIssue($('detailBody'),focus);
 if($('exportAppHistory'))$('exportAppHistory').onclick=()=>{const csv=applicationTimelineCSV(a,events,data.source),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='Application_History_'+a.id+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view){view=b.dataset.view;filters.branch='';expanded.clear();render();}if(b.dataset.expand){openOneLevel(expanded,b.dataset.expand);render();}if(b.dataset.collapse){closeCategory(expanded,b.dataset.collapse,model.ancestor);render();}if(b.dataset.app)showApp(b.dataset.app);if(b.dataset.compareColumn){const c=visibleColumns.find(c=>c.key===b.dataset.compareColumn);if(c)comparison.open({poolIds:c.apps.map(a=>a.id),contextLabel:c.id==='unmapped'?'Not classified':displayName(c)});}});
$('group').onchange=e=>{group=e.target.value;render();};$('collapse').onclick=()=>{expanded.clear();render();};$('expandAll').onclick=()=>{expandAll(filterLandscape(model,view,filters),view,expanded,filters.branch,columns);render();};
$('detailClose').onclick=()=>$('detail').close();$('detail').addEventListener('close',()=>setAppParam(''));$('importOpen').onclick=()=>{if(initializing)return;$('inventoryFile').value='';$('taxonomyFile').value='';resetImportPreview();$('importStatus').textContent='';$('importDialog').showModal();};$('importClose').onclick=()=>$('importDialog').close();
 function useData(next){const clean=workspaceData(next),nextModel=buildModel(clean);data=clean;model=nextModel;$('dataAsOf').textContent=dataAsOfText(clean);expanded.clear();if($('detail').open)$('detail').close();render();showPackageNotice();}
 $('restoreData').onclick=()=>{if(initializing||!initialData||!data?.isAcceptanceSample)return;const previous=importUndo;if($('compareDialog').open)$('compareDialog').close();useData(previous?recordImport(data,previous.data,{kind:'restore'}):initialData);if(previous)restoreView(previous.view);importUndo=null;$('importUndoNotice').hidden=true;autosave.schedule();$('sessionStatus').textContent='Returned to the application inventory.';};
 function downloadWorkspace(workspace,prefix){try{const text=exportWorkspace(workspace),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=prefix+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);$('sessionStatus').textContent='Export started. Check your downloads for '+a.download+'.';return true;}catch(e){$('sessionStatus').textContent='Export failed: '+english(e.message);}}
 // The backup carries the minimum score in use; a started download is not proof that the file was saved.
 $('exportOpen').onclick=()=>{if(!data)return;if(downloadWorkspace({...data,similarityThreshold:comparison.getState().similarityThreshold},'logistics-workspace-'))autosave.exportStarted?.();};
 function storeThreshold(threshold){if(!isAdmin()||data?.similarityThreshold===threshold)return;data={...data,similarityThreshold:threshold};autosave.schedule();}
for(const id of ['detail','importDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
function resetImportPreview(){importGeneration++;pendingImport=null;$('importRun').disabled=false;$('importStatus').textContent='';$('importPreview').hidden=true;$('importPreview').innerHTML='';$('importApply').hidden=true;}
for(const id of ['inventoryFile','taxonomyFile'])$(id).onchange=resetImportPreview;
$('importDialog').addEventListener('close',resetImportPreview);
// The import preview for a file import or the server data package (V14: one display, one Apply).
function showImportPreview(preview,{inventoryFile='',taxonomyFile='',inventorySheet=null,note=''}={}){
 const list=(title,apps)=>apps.length?`<details><summary>${title} · ${apps.length}</summary><ul>${apps.map(a=>`<li>${esc(a.Name)} · ${esc(a.ID)}</li>`).join('')}</ul></details>`:'';
 $('importPreview').innerHTML=`<div class="import-summary"><h3>Import preview</h3>${note?`<p class="hint">${esc(note)}</p>`:''}<div class="import-counts">${[['Added',preview.added.length],['Updated',preview.updated.length],['Removed',preview.removed.length],['Unchanged',preview.unchanged],...(preview.keptNotInExport?[['Not in this export · kept',preview.keptNotInExport]]:[])].map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('')}</div><dl class="source-records"><dt>Inventory</dt><dd>${esc(preview.next.source)}${inventorySheet?.name?` · sheet ${esc(inventorySheet.name)}`:''}</dd><dt>Taxonomy</dt><dd>${esc(preview.next.taxonomySource)} · ${preview.taxonomyChanged?'Changed':'Unchanged'}</dd>${preview.capabilityChanges.total?`<dt>Capabilities</dt><dd>${preview.capabilityChanges.renamed} renamed · ${preview.capabilityChanges.added} added · ${preview.capabilityChanges.removed} removed</dd>`:''}<dt>Pair reviews</dt><dd>${preview.pairReviews.added} added · ${preview.pairReviews.updated} updated · ${preview.pairReviews.removed} removed · ${preview.pairReviews.count} in this file</dd><dt>Review notes</dt><dd>${preview.reviewNotes}</dd><dt>Mappings</dt><dd>${preview.appliedMappings} applied · ${preview.staleMappings} need review</dd><dt>Activity log</dt><dd>${preview.activityRecords} records</dd></dl>${inventorySheet?.all?.length>1?`<p class="hint">This workbook has ${inventorySheet.all.length} inventory sheets (${inventorySheet.all.map(esc).join(', ')}); ${inventorySheet.rule==='newest'?`the newest, ${esc(inventorySheet.name)}, was read`:inventorySheet.rule==='exact'?`the sheet named ${esc(inventorySheet.name)} was read`:`the first, ${esc(inventorySheet.name)}, was read (no dates in the sheet names)`}.</p>`:''}${preview.pairReviews.removed?`<p class="review-reason">${preview.pairReviews.removed} pair ${preview.pairReviews.removed===1?'review in the current workspace is':'reviews in the current workspace are'} absent from this import and would be removed. Export the current workspace before applying.</p>`:''}${preview.activityRemoved?`<p class="review-reason">${preview.activityRemoved} existing activity records are absent from this import. Export the current workspace before applying.</p>`:''}${preview.capabilityChanges.total?`<p class="review-reason">This taxonomy changes the capability catalogue: ${preview.capabilityChanges.renamed} names, ${preview.capabilityChanges.added} added and ${preview.capabilityChanges.removed} removed codes. Similarity results follow the new catalogue; application records are not changed.</p>`:''}${preview.costScoresRemoved||preview.scopeExclusionsRemoved?`<p class="review-reason">This import clears ${preview.costScoresRemoved} recorded cost scores and removes ${preview.scopeExclusionsRemoved} opportunity scope exclusions. Review the supplied blank values before applying.</p>`:''}${preview.descriptionsCleared||preview.lifecycleValuesCleared?`<p class="review-reason">This import clears ${preview.descriptionsCleared} existing descriptions and ${preview.lifecycleValuesCleared} lifecycle values with blank cells. Review the supplied blank values before applying.</p>`:''}${preview.ownerDecisions.length?`<p class="hint">${preview.ownerDecisions.map(d=>esc(d.note)+(preview.hasChanges?'. The original source value is recorded with this import.':'. This is already reflected in the current workspace; nothing will be recorded.')).join('<br>')}</p>`:''}${preview.scopeExclusionsAdded.length?`<p class="hint">${preview.scopeExclusionsAdded.length} ${preview.scopeExclusionsAdded.length===1?'application is':'applications are'} no longer counted (no score, or status not still active): ${preview.scopeExclusionsAdded.map(a=>esc(a.Name)).join(', ')}. They stay in the list and are left out of cost totals, ROI and the similarity check.</p>`:''}<p class="hint">For Excel imports, optional columns or the cost sheet omitted from the file retain existing evidence by application ID. Blank values in a supplied column or sheet replace the previous value.</p>${renderImportChanges(preview,esc)}${list('Added applications',preview.added)}${list('Updated applications',preview.updated)}${list('Removed applications',preview.removed)}</div>`;
 // Change details as CSV (V9.20): the same rows as the table, plus added and removed applications.
 if($('exportImportChanges'))$('exportImportChanges').onclick=()=>{const csv=importChangesCSV(preview,{inventoryFile,taxonomyFile}),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='Import_changes_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 $('importPreview').hidden=false;$('importApply').hidden=!preview.hasChanges;$('importStatus').textContent=preview.hasChanges?'Preview ready. Current data has not changed.':'No changes found. The current workspace and application history were kept.';
}
// Data package on the intranet server (V14, data-package.mjs): offered under the title when it holds newer shared data
// than this browser uses. Only the intranet page looks for it; the offline file never does.
const PACKAGE_DISMISSED_KEY='logistics-portfolio:data-package-dismissed';
const packageOptions=()=>({releaseIds:(initialData?.corrections||[]).map(c=>c.id)});
let serverPackage=null;
async function checkDataPackage(){
 if(!/^https?:$/.test(location.protocol))return;
 let response;try{response=await fetch(DATA_PACKAGE_FILE,{cache:'no-store'});}catch{return;}
 if(!response.ok)return;
 try{serverPackage=readDataPackage(await response.text());}
 catch(error){$('packageNotice').innerHTML=`<span>The data package on the server could not be read: ${esc(english(error.message))} The page keeps its current data.</span>`;$('packageNotice').hidden=false;return;}
 showPackageNotice();
}
function showPackageNotice(){
 const pkg=serverPackage,notice=$('packageNotice');if(!pkg)return;
 let dismissed='';try{dismissed=localStorage.getItem(PACKAGE_DISMISSED_KEY)||'';}catch{}
 const offered=!!data&&packageIsNew(data,pkg,packageOptions()),label=`New data on the server${pkg.dataAsOf?` · as of ${esc(pkg.dataAsOf)}`:''} · published ${esc(pkg.publishedAt.slice(0,10))}`;
 // V14 review: hiding the notice is not the only way back to the data — the Import data dialog keeps an entry for it.
 $('serverPackageEntry').hidden=!offered;$('serverPackageText').innerHTML=offered?label:'';
 if(!offered||dismissed===pkg.id){notice.hidden=true;notice.innerHTML='';return;}
 notice.innerHTML=`<span>${label}</span><button type="button" id="packagePreview">Preview changes</button><button type="button" id="packageLater">Hide this update</button>`;
 notice.hidden=false;
 $('packagePreview').onclick=previewDataPackage;
 $('packageLater').onclick=()=>{try{localStorage.setItem(PACKAGE_DISMISSED_KEY,pkg.id);}catch{}notice.hidden=true;};
}
function previewDataPackage(){
 const pkg=serverPackage;if(!pkg||!data)return;
 if(!$('importDialog').open)$('importDialog').showModal();
 resetImportPreview();
 const base=data,preview=previewImport(base,applyDataPackage(base,pkg,packageOptions())),file=`${DATA_PACKAGE_FILE} (published ${pkg.publishedAt.slice(0,10)})`;
 pendingImport={...preview,base,inventoryFile:file,taxonomyFile:''};
 showImportPreview(preview,{inventoryFile:file,note:'Data published by the data steward on the intranet server. Applying it replaces the application inventory, the catalogues and the owner decisions (mappings, including those the steward revoked, and records confirmed as recorded); your review notes, pair reviews, score settings and own mappings are kept.'});
}
$('serverPackagePreview').onclick=previewDataPackage;
// The steward's export: the shared data of this workspace as logistics-data.json for the IIS server.
$('exportDataPackage').onclick=()=>{if(!data)return;try{const text=dataPackageText(data),pkg=JSON.parse(text);downloadText(text,DATA_PACKAGE_FILE,'application/json');$('exportDataPackageStatus').textContent=`Downloaded ${DATA_PACKAGE_FILE} (${pkg.applications} applications${pkg.dataAsOf?`, data from ${pkg.dataAsOf}`:''}). Put it on the server next to index.html.`;}catch(error){$('exportDataPackageStatus').textContent='Download failed: '+english(error.message);}};
// LeanIX process check (V15, owner decision 2026-10-22: compare only). V16 puts the standard catalogue first: the
// catalogue's processes LeanIX lacks, with Process ID, Process Name and the name expected in LeanIX, so the owner can
// fill them in. Then the applications: those that differ come first and are open. There is nothing to apply, so the
// Apply button stays hidden and the current data is never changed.
// V17: the LeanIX local process layer of the selected export as an import preview; Apply records it like any import.
function previewLocalLayer(local,file){
 const base=data;if(!base||!local)return;
 const next={...base,localProcesses:local.added};delete next.dataPackage;
 resetImportPreview();
 const preview=previewImport(base,next),name=file+' (BBM PM processes not in the standard list)',n=local.added.length;
 pendingImport={...preview,base,inventoryFile:name,taxonomyFile:''};
 showImportPreview(preview,{inventoryFile:name,note:`Adds ${n} BBM PM ${n===1?'process':'processes'} from LeanIX that ${n===1?'is':'are'} not in the standard list, each under its parent process in LeanIX. The standard list does not change. Applications that use ${n===1?'this process':'these processes'} are no longer shown as not matched.`});
}
function showProcessCheck(check,catalogue,{catalogueSource='',local=null,currentLocal=0}={}){
 const items=(list,r)=>list.length?`<ul>${list.map(p=>{const id=r.standard?.get(p)?.id;return `<li>${esc(p)}${id?` <span class="process-id">${esc(id)}</span>`:''}</li>`;}).join('')}</ul>`:'<p class="hint">None</p>';
 const counts=tiles=>`<div class="import-counts">${tiles.map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('')}</div>`;
 const table=(heads,rows)=>`<div class="import-changes-scroll"><table class="import-changes-table"><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const c=catalogue.counts,reached=catalogue.chains.filter(x=>x.reached),notReached=catalogue.chains.filter(x=>!x.reached),plural=(n,one,many)=>`${n} ${n===1?one:many}`;
 const source=esc(catalogueSource||'the process taxonomy');
 const catalogueHtml=`<h4 class="process-check-heading">Standard catalogue against LeanIX</h4>${c.compared?`<p class="hint">The standard processes (Process ID and Process Name from ${source}) of the process chains this export names, found by the name rule the applications use: “BBM PM &lt;chain&gt; &lt;name&gt; L&lt;level&gt;”. Fill in the missing ones in LeanIX, or correct the LeanIX names that are not in the catalogue.</p>`:`<p class="review-reason">No standard process could be compared: no LeanIX name in this export matches the process catalogue (${source}).</p>`}${counts([['Compared',c.compared],['In LeanIX',c.inLeanix],['Missing in LeanIX',c.missing],['In LeanIX, not in the catalogue',c.notInCatalogue]])}<dl class="source-records"><dt>Chains compared</dt><dd>${reached.map(x=>`${esc(x.code)}: ${x.missing} of ${x.inLeanix+x.missing} missing`).join(' · ')||'None'}</dd><dt>Not in this export</dt><dd>${notReached.length?`${notReached.map(x=>`${esc(x.code)} (${x.processes})`).join(' · ')} — not compared`:'None'}</dd>${c.otherNaming?`<dt>Not compared</dt><dd>${plural(c.otherNaming,'process named otherwise (no level L0–L3)','processes named otherwise (no level L0–L3)')} — not part of the catalogue; listed in the CSV</dd>`:''}</dl>${c.possiblyMissing?`<p class="hint">${plural(c.possiblyMissing,'process is','processes are')} possibly missing: the catalogue uses ${c.possiblyMissing===1?'its name':'their names'} more than once, LeanIX has fewer processes of that name and their Parent does not tell which.</p>`:''}${c.ambiguous?`<p class="hint">${plural(c.ambiguous,'Process ID has','Process IDs have')} two names in the catalogue and ${c.ambiguous===1?'is':'are'} not compared.</p>`:''}${catalogue.missing.length?`<details class="import-changes" open><summary>Missing in LeanIX · ${catalogue.missing.length}</summary>${table(['Process chain','Level','Process ID','Process Name','Name expected in LeanIX','Note'],catalogue.missing.map(r=>[r.chain,r.level,r.id,r.name,r.expected,r.status==='possibly-missing'?'Possibly missing: '+catalogueNote(r):'']))}</details>`:''}${catalogue.notInCatalogue.length?`<details class="import-changes"><summary>In LeanIX, not in the catalogue · ${catalogue.notInCatalogue.length}</summary>${table(['LeanIX name','Why'],catalogue.notInCatalogue.map(r=>[r.name,r.reason+(r.candidates.length?' Candidates: '+r.candidates.map(x=>`${x.id} ${x.label}`).join('; '):'')]))}</details>`:''}<p><button type="button" id="exportCatalogueCheck">Download catalogue check (CSV)</button></p>`;
 const localHtml=local?`<h4 class="process-check-heading">BBM PM processes not in the standard list</h4><p class="hint">These BBM PM processes are in LeanIX but not in the standard list. You can add them to the tool, each under its parent process in LeanIX. Nothing changes until you check the preview and click Apply.</p>${counts([['Can be added',local.added.length],['Cannot be added',local.skipped.length],['Already in the tool',currentLocal]])}${local.skipped.length?`<details class="import-changes"><summary>Cannot be added · ${local.skipped.length}</summary>${table(['LeanIX name','Why'],local.skipped.map(r=>[r.name,r.reason]))}</details>`:''}<p><button type="button" id="previewLocalLayer"${local.added.length||currentLocal?'':' disabled'}>Preview adding them</button></p>`:'';
 const app=r=>`<details class="process-check-app"><summary><strong>${esc(r.name)}</strong> · ${r.both.length} in both · ${r.onlyLeanix.length} only in LeanIX · ${r.onlyTool.length} only in the tool${r.leanixNames.length?` · in LeanIX as ${r.leanixNames.map(n=>`“${esc(n)}”`).join(', ')}`:''}${r.sameName>1?` · <span class="review-reason">${r.sameName} applications in the tool have this name</span>`:''}</summary><div class="process-check-lists"><section><h4>Only in LeanIX · ${r.onlyLeanix.length}</h4>${items(r.onlyLeanix,r)}</section><section><h4>Only in the tool · ${r.onlyTool.length}</h4>${items(r.onlyTool,r)}</section><section><h4>In both · ${r.both.length}</h4>${items(r.both,r)}</section></div>${r.similar.length?`<p class="review-reason">LeanIX links no process to this name. Similar LeanIX names: ${r.similar.map(n=>`“${esc(n)}”`).join(', ')}.</p>`:''}${r.notInExport.length?`<p class="hint">Recorded in the tool but not in this export (not compared): ${r.notInExport.map(esc).join('; ')}</p>`:''}</details>`;
 const by=status=>check.rows.filter(r=>r.status===status);
 const group=(title,rows,open)=>rows.length?`<details class="import-changes"${open?' open':''}><summary>${title} · ${rows.length}</summary>${rows.map(app).join('')}</details>`:'';
 const none=by('not-in-export');
 $('importPreview').innerHTML=`<div class="import-summary"><h3>LeanIX process check</h3><p class="hint">Compared only: the standard process catalogue and the applications' processes against this LeanIX export. Nothing is changed and there is nothing to apply.</p><dl class="source-records"><dt>LeanIX export</dt><dd>${esc(check.file)} · sheet ${esc(check.sheet)}${check.exportedAt?` · exported ${esc(check.exportedAt)}`:''}</dd><dt>Processes</dt><dd>${check.processes} in this export · linked to ${check.linkedApplications} applications by name</dd></dl></div>${catalogueHtml}${localHtml}<h4 class="process-check-heading">Applications against LeanIX</h4><p class="hint">For each application, the processes LeanIX links to it and the processes recorded in the tool, with the standard Process ID of each.${check.otherApplications?` LeanIX also links these processes to ${plural(check.otherApplications,'application that is','applications that are')} not in the tool's inventory; they are not compared.`:''}</p>${counts([['Applications',check.counts.applications],['Differ',check.counts.differs],['Match',check.counts.matches],['No processes in this export',check.counts.notInExport]])}${group('Applications that differ',by('differs'),true)}${group('Applications that match',by('matches'),false)}${none.length?`<details class="import-changes"><summary>No processes in this export · ${none.length}</summary><ul>${none.map(r=>`<li>${esc(r.name)}${r.notInExport.length?` · ${r.notInExport.length} recorded ${r.notInExport.length===1?'process':'processes'} outside this export`:''}</li>`).join('')}</ul></details>`:''}<p><button type="button" id="exportProcessCheck">Download check (CSV)</button></p>`;
 $('exportProcessCheck').onclick=()=>downloadText(processCheckCSV(check),'LeanIX_process_check_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
 $('exportCatalogueCheck').onclick=()=>downloadText(catalogueCheckCSV(catalogue,{file:check.file}),'LeanIX_catalogue_check_'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');
 if($('previewLocalLayer'))$('previewLocalLayer').onclick=()=>previewLocalLayer(local,check.file);
 $('importPreview').hidden=false;$('importApply').hidden=true;
 $('importStatus').textContent=`Process check ready: ${c.compared?`${c.missing} standard ${c.missing===1?'process is':'processes are'} missing in LeanIX`:'no standard process could be compared'}; ${check.counts.differs} of ${check.counts.applications} applications differ. Nothing was changed.`;
}
$('importRun').onclick=async()=>{
 const inventory=$('inventoryFile').files[0],taxonomy=$('taxonomyFile').files[0];resetImportPreview();
 if(!inventory&&!taxonomy){$('importStatus').textContent='Select an inventory, saved workspace or taxonomy.';return;}
 const button=$('importRun'),base=data,generation=importGeneration;button.disabled=true;$('importStatus').textContent='Reading and validating data…';
 try{
  for(const file of [inventory,taxonomy])if(file&&file.size>30*1024*1024)throw Error('File exceeds 30 MB');
  const inventorySheets=inventory&&!/\.json$/i.test(inventory.name)?await readXlsx(inventory):null,taxonomySheets=taxonomy?await readXlsx(taxonomy):null;
  // A LeanIX process export with the Applications column (V15) is only compared with the current data.
  const linksFile=[[inventory,inventorySheets],[taxonomy,taxonomySheets]].find(([,sheets])=>sheets&&isLeanixProcessLinks(sheets));
  if(linksFile){
   if(inventory&&taxonomy)throw Error('A LeanIX process export is only compared with the current data. Select it on its own, without a second file.');
   const links=readProcessLinks(linksFile[1]),current=buildModel(base);
   const check=compareProcessLinks(base,links,{file:linksFile[0].name,model:current}),catalogue=compareCatalogue(current,links,{processRows:base.processRows}),local=localProcessesFrom(base,links);
   if(generation===importGeneration)showProcessCheck(check,catalogue,{catalogueSource:processTaxonomySource(base.taxonomySource),local,currentLocal:(base.localProcesses||[]).length});
   return;
  }
  if([inventorySheets,taxonomySheets].some(sheets=>sheets&&processExportWithoutLinks(sheets)))throw Error(NO_APPLICATIONS_COLUMN);
  let next=base,raw;
  let inventorySheet=null;if(inventory){if(/\.json$/i.test(inventory.name)){const text=await inventory.text();next=importWorkspace(text);raw=JSON.parse(text).data;}else{const read=inventoryFromSheets(inventorySheets);inventorySheet=read.inventorySheet||null;next=applyInventory(base,read,inventory.name);}}
  if(taxonomy){const rows=taxonomyFromSheets(taxonomySheets);next={...next,...rows,taxonomySource:rows.processRows?taxonomy.name:taxonomySourceName(processTaxonomySource(next.taxonomySource),taxonomy.name)};delete next.dataPackage;}
  if(generation!==importGeneration)return;
  const preview=previewImport(base,next,raw||next);pendingImport={...preview,base,inventoryFile:inventory?.name||'',taxonomyFile:taxonomy?.name||''};
  showImportPreview(preview,{inventoryFile:inventory?.name||'',taxonomyFile:taxonomy?.name||'',inventorySheet});
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
try{const response=await fetch('./data.json');if(!response.ok)throw Error('Application data is unavailable.');initialData=workspaceData(await response.json());useData(initialData);let saved;try{saved=readView(localStorage);}catch{}restoreView(saved);startupView=saved;startupRenderedView=captureView();initializing=false;lastNavTab=activeTab();scrollActiveTab();await autosave.load();checkDataPackage();const linked=appFromSearch(location.search);if(linked){if(model.apps.some(a=>a.id===linked))showApp(linked);else{$('sessionStatus').textContent=`The linked application (${linked}) is not in this data.`;setAppParam('');}}}catch(e){initializing=false;$('matrix').innerHTML=`<p class="fatal">${esc(english(e.message))}. Refresh the page and try again.</p>`;$('overviewWorkspace').innerHTML=$('matrix').innerHTML;}

if(model&&document.modelContext?.registerTool){const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'set_portfolio_view',title:'Switch landscape view',description:'Switch between capability and process views, group by GB or plant, and expand or collapse the hierarchy.',inputSchema:{type:'object',properties:{dimension:{type:'string',enum:['cap','process']},groupBy:{type:'string',enum:['Division','Entity']},expandAll:{type:'boolean'}},required:['dimension','groupBy','expandAll'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||!['cap','process'].includes(input.dimension)||!['Division','Entity'].includes(input.groupBy)||typeof input.expandAll!=='boolean')throw Error('Invalid view options');view=input.dimension;group=input.groupBy;filters={query:'',division:'',entity:'',branch:''};$('group').value=group;expanded=input.expandAll?new Set((view==='cap'?model.caps:model.procs).keys()):new Set();render();return{dimension:view,groupBy:group,applications:model.apps.length,columns:columns(model,view,expanded).length};}},{signal:controller.signal})).catch(()=>{});}catch{}}

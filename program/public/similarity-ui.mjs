import {compareNatural} from './codes.mjs';
import {pairResultLabel,pairStatusReason,comparisonLevelText,codeEvidenceScore,formatCodeEvidence,PAIR_STATES,DATA_TO_CONFIRM} from './pair-status.mjs';
import {renderComparisonRecords} from './comparison-records.mjs';
import {displayName,displayCode,displayRecordLabel,annualLabel,opportunityCostLabel,scopeReason} from './display.mjs';
import {createWeightedSimilarity,cleanWeights,normalizeWeights,DEFAULT_WEIGHTS,WEIGHT_LABELS,portfolioCandidates,portfolioAtThreshold} from './weighted.mjs';
import {inspectWeightAllocation,weightPercentages} from './weight-controls.mjs';
import {comparisonReadiness} from './similarity-readiness.mjs';
import {similarityCSV} from './exports.mjs';
import {english} from './english.mjs';
import {createSimilarity} from './similarity.mjs';
import {explainResult,quickDifference} from './explanations.mjs';
import {costSummary,formatCostScore,formatAnnualCost} from './costs.mjs';
import {settledScore,scorePoints} from './score-values.mjs';

export function highlightSharedDescription(description,shared,esc){
 const counted=new Set(shared);
 return String(description).split(/((?:https?:\/\/|www\.)\S+|[\p{L}\p{N}]+)/gu).map(part=>{
  if(/^(?:https?:\/\/|www\.)/i.test(part))return esc(part);
  return part.split(/(?<=[a-z])(?=[A-Z])/u).map(word=>counted.has(word.normalize('NFKC').toLowerCase())?`<mark class="description-shared-word" title="Shared word counted in the description match">${esc(word)}</mark>`:esc(word)).join('');
 }).join('');
}

export function comparisonIdentities(source,peer,esc){
 return `<div class="comparison-identities">${[[source,'Application A'],[peer,'Application B']].map(([app,label])=>`<section><span>${label}</span><h4>${esc(app.Name)}</h4><p>${esc(app.Entity||'Plant not recorded')} · ${esc(app.Division||'Business unit not recorded')}</p></section>`).join('')}</div>`;
}

export const escapedSourceCaption=(caption,esc)=>esc(caption);
export const escapedCodeEvidenceSummary=(label,esc)=>`${esc(label)} · Code evidence`;

const sharedClassificationAction='Shared business classifications — compare actual uses';
const sharedClassificationHelp='Read the application descriptions and compare what they do. Shared capability or process registrations are a clue, not proof of duplicate functions. Code evidence points are not a complete similarity score.';

export function renderComparisonReadiness(readiness,esc){
 if(!readiness.pairCount)return '';
 const recordSummary=records=>{
  const unique=new Map(records.map(record=>[JSON.stringify([record.dimension,record.raw||record.reason]),record]));
  const labels={name:'name',description:'description',cap:'capability',process:'process'};
  return Object.entries(labels).map(([dimension,label])=>{
   const count=[...unique.values()].filter(record=>record.dimension===dimension).length;
   return count?`${count} ${label} ${count===1?'record':'records'}`:'';
  }).filter(Boolean).join(' + ')+' to check';
 };
 const rows=readiness.apps.map(row=>`<button class="readiness-app-action" data-readiness-app="${esc(row.app.id)}"><span><strong>${esc(row.app.Name)}</strong><small>${esc(recordSummary(row.records))} · affects ${row.pairCount} ${row.pairCount===1?'comparison':'comparisons'}</small></span><span>View details →</span></button>`).join('');
 const fallback=readiness.unattributedPairCount?`<details class="comparison-specific-checks"><summary>Check comparison details · ${readiness.unattributedPairCount} ${readiness.unattributedPairCount===1?'pair':'pairs'}</summary><p>These checks cannot yet be assigned to one application. Open the comparison to inspect its catalogue evidence.</p>${(readiness.unattributedPairs||[]).map(pair=>`<button class="compare-pair-row" data-open-similarity-target="${esc(pair.target.app.id)}" data-open-similarity-peer="${esc(pair.peer.app.id)}"><span>${esc(pair.target.app.Name)} ↔ ${esc(pair.peer.app.Name)}</span><span>View comparison →</span></button>`).join('')}</details>`:'';
 return `<section class="comparison-record-actions" aria-label="Application records to check"><h4>Check application records${readiness.apps.length?' · '+readiness.apps.length+' '+(readiness.apps.length===1?'application':'applications'):''}</h4><p>Confirm the records in View details before relying on these comparisons. Each application is listed once; ${readiness.pairCount} ${readiness.pairCount===1?'comparison is':'comparisons are'} affected.</p>${rows}${fallback}</section>`;
}

export function createComparisonUI({getModel,getData,escape:esc,onApp,isSignedIn=()=>false,onStateChange=()=>{},onWeightsChange=()=>{},onPairReview=()=>{}}){
 const el=id=>document.getElementById(id),dialog=el('compareDialog'),review=el('similarityReview');
 let lastModel,indexes={},pool=[],selected=new Set(),dimension='weighted',context='All applications',cell=null;
 let lastProvisional=null,weights={...DEFAULT_WEIGHTS},similarityThreshold=50,focusAppId=null,focusPeerId=null,peerSearch='',portfolioRows=[],mode='portfolio',choosingApp=false;
 let showSelectedOnly=false,returnTo=null,portfolioPosition=null,peerListScroll=0;
 const detailState=root=>[...root.querySelectorAll('details')].map((node,index)=>({id:node.id||null,index,open:node.open}));
 const restoreDetails=(root,state)=>{const nodes=[...root.querySelectorAll('details')];for(const item of Array.isArray(state)?state:[]){if(!item||typeof item!=='object')continue;const node=item.id?nodes.find(node=>node.id===item.id):nodes[item.index];if(node)node.open=item.open;}};
 const afterPaint=fn=>typeof globalThis.requestAnimationFrame==='function'?globalThis.requestAnimationFrame(fn):fn();
 const pagePosition=()=>({scrollY:globalThis.scrollY||0,details:detailState(el('similarityOverview'))});
 function restorePagePosition(position){if(!position)return;restoreDetails(el('similarityOverview'),position.details);afterPaint(()=>globalThis.scrollTo?.({top:position.scrollY||0,behavior:'instant'}));}
 function multiPosition(){return {pool:[...pool],selected:[...selected],dimension,context,cell:cell&&[...cell],search:el('selectionSearch').value,showSelectedOnly,details:detailState(dialog),scrollTop:dialog.scrollTop||0,choicesScroll:el('applicationChoices').scrollTop||0,matrixScroll:el('comparisonMatrix').querySelector('.directional-scroll')?.scrollLeft||0};}
 function restoreMultiPosition(state){pool=(Array.isArray(state.pool)?state.pool:[]).filter(id=>indexes.cap.scopes.has(id));if(!pool.length)pool=getModel().apps.map(app=>app.id);selected=new Set((Array.isArray(state.selected)?state.selected:[]).filter(id=>pool.includes(id)));dimension=['weighted','cap','process'].includes(state.dimension)?state.dimension:'weighted';context=typeof state.context==='string'?state.context:'All applications';cell=Array.isArray(state.cell)&&state.cell.length===2&&state.cell[0]!==state.cell[1]&&state.cell.every(id=>selected.has(id))?[...state.cell]:null;showSelectedOnly=state.showSelectedOnly===true;el('selectionSearch').value=typeof state.search==='string'?state.search:'';renderChoices();renderMatrix();restoreDetails(dialog,state.details);if(!dialog.open)dialog.showModal();afterPaint(()=>{dialog.scrollTop=Number.isFinite(state.scrollTop)?state.scrollTop:0;el('applicationChoices').scrollTop=Number.isFinite(state.choicesScroll)?state.choicesScroll:0;const matrix=el('comparisonMatrix').querySelector('.directional-scroll');if(matrix)matrix.scrollLeft=Number.isFinite(state.matrixScroll)?state.matrixScroll:0;});}
 const pct=n=>n===null?'N/A':new Intl.NumberFormat('en-US',{maximumFractionDigits:1,style:'percent'}).format(settledScore(n));
 const scoreNumber=n=>n===null?'N/A':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(scorePoints(n));
 const scoreText=n=>n===null?'N/A':scoreNumber(n)+' / 100';
 const scoreMarkup=n=>n===null?'N/A':scoreNumber(n)+'<span class="score-denominator"> / 100</span>';
 const title=dim=>dim==='weighted'?'Weighted similarity':dim==='cap'?'Capability match only':'Process match only';
 const depth=s=>s.levels.length?s.levels.map(n=>'L'+n).join(' / '):'Unknown';
 const matches=(a,q)=>[a.Name,a.Entity,a.Division].join(' ').toLowerCase().includes(q.toLowerCase());
 dialog.innerHTML=`<button class="close" id="compareClose" aria-label="Close comparison">×</button><h2 id="compareTitle">Application comparison</h2><p id="compareScope" class="comparison-context"></p><details id="compareSelection" class="compare-selection" open><summary>1. Select applications<span id="selectionCount" role="status"></span></summary><div class="selection-toolbar"><label>Find applications<input id="selectionSearch" type="search" placeholder="Name or plant"></label><button id="selectVisible">Select visible</button><button id="clearSelection">Clear selection</button></div><div id="applicationChoices" class="application-choices"></div></details><div class="selected-applications" aria-label="Selected applications"><div class="selected-applications-head"><strong id="selectedApplicationsCount" role="status"></strong><button id="showSelectedApplications" aria-pressed="false">View selected</button><button id="clearSelectedApplications">Clear selection</button></div><div id="selectedApplications" class="selected-app-chips"></div></div><h3 class="comparison-step-heading">2. Choose a pair</h3><div class="matrix-toolbar"><div class="segments" aria-label="Matrix dimension"><button data-matrix-dim="weighted" class="active" aria-pressed="true">Weighted similarity</button><button data-matrix-dim="cap" aria-pressed="false">Capability match only</button><button data-matrix-dim="process" aria-pressed="false">Process match only</button></div><span id="coverageScope" class="scope-pill"></span><button id="exportSelection">Export selection</button></div><div id="comparisonMatrix"></div><div id="comparisonEvidence" aria-live="polite"></div>`;

 function weightPanel(opened){return `<details class="weight-panel" ${opened?'open':''}><summary><span>Weights:</span><span class="weight-summary-note" data-weight-note></span><span class="weight-edit">Edit</span><small data-weight-save></small></summary><p class="weight-intro">Divide 100% across four fields. A higher percentage has more influence on the similarity score.</p><div class="weight-allocation"><strong data-weight-total>100% / 100% allocated</strong><div class="weight-allocation-bar" aria-hidden="true">${Object.keys(WEIGHT_LABELS).map(key=>`<span data-weight-bar="${key}"></span>`).join('')}</div></div><div class="weight-inputs">${Object.entries(WEIGHT_LABELS).map(([key,label])=>`<label class="weight-card"><span class="weight-name">${label}</span><span class="weight-card-values"><input type="number" aria-label="${label} weight in percent" data-weight="${key}" min="0" max="100" step="0.1" inputmode="decimal" value="${weights[key]*100}"><span class="weight-unit">%</span></span></label>`).join('')}</div><div class="weight-actions"><span data-weight-status role="status" aria-live="polite"></span><div class="weight-buttons"><button data-reset-weights>Restore defaults</button><button data-apply-weights disabled>Apply weights</button></div></div></details>`;}

 review.innerHTML=`
  <div id="similarityOverview">
   <details class="similarity-secondary" id="similaritySettings"><summary><span class="score-settings-label"><strong>Score settings</strong><small>Adjust weights and minimum score</small></span><span class="score-settings-action" aria-hidden="true"><span class="settings-open-label">Edit settings</span><span class="settings-close-label">Close settings</span><span class="settings-chevron">⌄</span></span></summary>${weightPanel(false)}<form id="portfolioThresholdForm"><label for="portfolioThreshold">Minimum score for potential overlap</label><div><input id="portfolioThreshold" type="number" min="0" max="100" step="1" value="50" required><button type="submit">Apply</button></div></form></details>
   <details class="similarity-secondary" id="codeReview" open><summary>Score</summary>
   <section id="portfolioIntro" class="portfolio-intro" aria-label="Similarity opportunities"><div><h2>Potential overlap</h2><p>Choose a pair to compare its purpose and records.</p></div></section>
   <div id="portfolioStats" role="status"></div>
   <section id="portfolioOverview" class="portfolio-overview" aria-label="Portfolio similarity overview"><div id="portfolioResults"></div></section>
   <div class="portfolio-actions"><button id="browseApplications">Compare an application</button><button id="compareMultipleApplications">Compare multiple applications</button></div>
   <section id="portfolioOther"><div id="portfolioProvisional"></div></section>
   </details>
  </div>
  <section class="focus-analyzer similarity-flow" id="focusAnalyzer" aria-label="Application similarity explorer" hidden>
   <div class="focus-controls"><div class="focus-title"><button id="backToPairs" class="back-to-portfolio">← Back to results</button><h2 id="focusHeading">1. Choose an application</h2><p id="focusHelp" class="focus-entry-help"></p><button id="changeFocusApp" class="back-to-portfolio" hidden>Change selected application</button></div><div class="focus-filters"><label id="focusSearchPicker" for="focusAppSearch">Find application<input id="focusAppSearch" type="search" placeholder="Name, plant or business unit" autocomplete="off"></label><label id="focusAppPicker" for="focusApp" hidden>Application<select id="focusApp"><option value="">Select an application</option></select></label></div></div>
   <p id="focusAppSearchStatus" class="focus-search-status" role="status"></p><p id="focusStatus" class="focus-status" role="status" aria-live="polite"></p><div id="focusResult"></div>
  </section>`;
 const weightsPanel=review.querySelector('.weight-panel');
 function draftFrom(){return Object.fromEntries([...weightsPanel.querySelectorAll('[data-weight]')].map(input=>[input.dataset.weight,input.value]));}
 function previewWeights(){
  const draft=draftFrom(),state=inspectWeightAllocation(draft),total=weightsPanel.querySelector('[data-weight-total]');
  total.textContent=state.total===null?'Enter four percentages':`${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(state.total)}% / 100% allocated`;
  total.dataset.valid=String(state.valid);
  const barTotal=state.total>0?state.total:0;
  weightsPanel.querySelectorAll('[data-weight-bar]').forEach(bar=>{const amount=Number(draft[bar.dataset.weightBar]);bar.style.width=barTotal&&Number.isFinite(amount)&&amount>0?`${amount/barTotal*100}%`:'0%';});
  weightsPanel.querySelector('[data-apply-weights]').disabled=!state.valid||weightsPanel.dataset.dirty!=='true';
  weightsPanel.querySelector('[data-weight-status]').textContent=weightsPanel.dataset.dirty==='true'?state.message:'';
  return state;
 }
 function syncWeights(){const effective=normalizeWeights(weights),display=weightPercentages(weights);weightsPanel.querySelectorAll('[data-weight]').forEach(input=>input.value=display[input.dataset.weight]);weightsPanel.querySelector('[data-weight-note]').textContent=`Name ${pct(effective.name)} · Description ${pct(effective.description)} · Capability ${pct(effective.cap)} · Process ${pct(effective.process)}`;weightsPanel.dataset.dirty='false';weightsPanel.querySelector('[data-weight-save]').textContent=isSignedIn()?'':'Not saved – resets on reload';previewWeights();}
 function updateWeights(value){weights=cleanWeights(value);indexes.weighted=createWeightedSimilarity(getModel(),weights);portfolioRows=portfolioCandidates(indexes.weighted);syncWeights();weightsPanel.querySelector('[data-weight-status]').textContent='Scores updated.';onWeightsChange({...weights});if(!review.hidden)renderReview();if(dialog.open)renderMatrix();}
 syncWeights();

 function pairStatus(pair){return pairResultLabel(pair,similarityThreshold);}
 function statusHelp(pair){
  const status=pairStatus(pair);
  if(pair.status==='confirmed')return status==='Potential overlap'?`At or above the current threshold of ${similarityThreshold}. This is text and code overlap, not confirmed duplicate functionality.`:`Below the current threshold of ${similarityThreshold}. This does not establish that the applications have different functions.`;
  if(status==='No complete score')return codeEvidenceScore(pair)===null?'No shared words in the weighted text fields. A complete similarity score is unavailable.':'No shared words in the weighted text fields, but shared codes remain. Code evidence is not a complete similarity score.';
  if(status==='No shared registrations')return 'No complete similarity score and no shared confirmed codes in the weighted capability/process fields. This does not establish that the applications have different functions.';
  if(status==='Out of scope')return pairHint(pair);
  return 'A complete similarity score is unavailable. Unavailable does not mean zero.';
 }
 function orderedPeers(id){
  return indexes.weighted.pairPeers(id).sort((a,b)=>compareNatural(a.peer.app.Name,b.peer.app.Name)||a.peer.app.id.localeCompare(b.peer.app.id));
 }
 function pairHint(pair){
  if(pair.status==='confirmed'){
   const r=pair.reverse.coverage<pair.forward.coverage?pair.reverse:pair.forward,c=r.components.find(c=>c.key==='cap'&&c.weight>0)?.result.commonCount||0,p=r.components.find(c=>c.key==='process'&&c.weight>0)?.result.commonCount||0;
   if(!r.components.some(c=>['cap','process'].includes(c.key)&&c.weight>0))return '';
   if(c+p<=2)return `Based on ${c?c+' capability'+(p?' + ':''):''}${p?p+' process':''}${c+p?' code'+((p||c)===1?'':'s'):'0 shared codes'}`;
   return '';
  }
  return pairStatusReason(pair,similarityThreshold,scopeReason);
 }
 function componentFormula(c){
  if(c.weight===0)return `<span class="score-formula"><span>Weight <b>0%</b> · Excluded</span><span aria-hidden="true">→</span><b class="formula-result">0 / 100</b></span>`;
  return `<span class="score-formula"><span>Match <b>${scoreText(c.score)}</b></span><span aria-hidden="true">×</span><span>Weight <b>${pct(c.weight)}</b></span><span aria-hidden="true">→</span><b class="formula-result">${scoreText(c.contribution)}</b></span>`;
 }
 function scoreDisplay(score,dim){return `<strong class="hundred-score">${scoreMarkup(score)}</strong>`;}
 function scoreSummary(score,dim){return `${dim==='weighted'?'Weighted total':title(dim)+' score'} ${scoreText(score)}`;}
 function totalDisplay(r){return `<div class="total-result"><span>${r.coverage!==null?'Directional weighted total':'Incomplete directional evidence'}</span><strong class="${r.coverage===null?'unavailable':''}">${r.coverage===null?'N/A':scoreMarkup(r.coverage)}</strong>${r.coverage===null?`<p>${scoreText(r.knownPoints)} known weighted points · ${pct(r.missingWeight)} missing weight. ${esc(r.reason)}</p>`:''}</div>`;}

 function componentBasis(c){
  if(c.text){if(c.score===null)return c.reason;return `${c.text.shared.length} shared distinct word${c.text.shared.length===1?'':'s'} / ${c.text.unionCount} distinct words across both fields${c.text.shared.length?` · Shared: ${c.text.shared.slice(0,8).join(', ')}${c.text.shared.length>8?'…':''}`:''}`;}
  if(c.score===null)return c.reason;
  return `${c.result.commonCount} shared confirmed code${c.result.commonCount===1?'':'s'} / ${c.result.targetCount} target code${c.result.targetCount===1?'':'s'} (target → peer)${comparisonLevelText(c.result)?' · '+comparisonLevelText(c.result):''}`;
 }
 function calculationDetails(r){return `<section class="calculation-details"><h4>${esc(r.target.app.Name)} → ${esc(r.peer.app.Name)} calculation</h4><p class="score-scale-note">Each component contributes match × weight. ${r.coverage===null?`The known contributions total ${scoreText(r.knownPoints)}, with ${pct(r.missingWeight)} weight missing. This is not a full score.`:`All selected evidence is available, totaling ${scoreText(r.coverage)}.`}</p><div class="formula-list">${r.components.map(c=>`<div class="formula-item"><h4>${esc(c.label)}</h4>${componentFormula(c)}<p>${esc(componentBasis(c))}</p></div>`).join('')}</div><p class="formula-sum">Name uses shared distinct words, ignoring single letters and the "(recovered …)" suffix; Description excludes common English filler words and URLs first. Capability and Process compare confirmed codes branch by branch: where one application records a branch at a broader level, the other's detail is compared at that level, deferred and counted once; unrelated branches keep their recorded level. Common codes / target codes gives directional coverage. This is text and code overlap, not AI semantic similarity.</p></section>`;}

 function sourceFields(app,caption){
  const list=(items,label)=>`<section class="source-field"><h5>${label} <small>(${items.length})</small></h5>${items.length?`<ul>${items.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'<p>Not recorded</p>'}</section>`;
  return `<div class="focus-source"><span class="focus-source-label">${escapedSourceCaption(caption,esc)}</span><h4>${esc(app.Name)}</h4>${list(app.rawCap||[],'Business capabilities')}${list(app.rawProcess||[],'Processes')}</div>`;
 }
 function purposeCard(app,shared){return `<article class="purpose-card"><h5>${esc(app.Name)}</h5><span class="purpose-meta">${esc(app.Entity||'Plant not recorded')} · ${esc(app.Division||'Business unit not recorded')}</span><p class="purpose-label">Original description</p><p class="purpose-description">${highlightSharedDescription(app.Description?.trim()||'Description not recorded.',shared,esc)}</p></article>`;}
 function contributionTable(result,pair){
  return `<p class="comparison-note">${pair.status==='confirmed'?'The score measures text and code overlap. It does not measure how much functionality is duplicated.':'A full pair score is unavailable. Known contributions below are not a complete similarity score.'}</p><table class="score-contribution-table"><thead><tr><th scope="col">Field</th><th scope="col">Match</th><th scope="col">Weight</th><th scope="col">Points</th></tr></thead><tbody>${result.components.map(c=>`<tr><th scope="row">${esc(c.key==='cap'?'Capability':c.label)}</th><td>${c.weight===0?'Not used':c.score===null?'Unavailable':pct(c.score)}</td><td>${pct(c.weight)}</td><td>${c.weight===0?'0':c.contribution===null?'—':scoreNumber(c.contribution)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row" colspan="3">${pair.status==='confirmed'?'Similarity score':'Known points only'}</th><td>${scoreNumber(pair.status==='confirmed'?pair.coverage:result.knownPoints)}</td></tr></tfoot></table><p class="comparison-note">Shown from ${esc(result.target.app.Name)} to ${esc(result.peer.app.Name)}. The pair score uses the lower complete total from the two directions.</p>`;
 }
 function syncFocusOptions(model){
  const selector=el('focusApp'),query=el('focusAppSearch').value.trim().toLowerCase();
  const matches=model.apps.filter(a=>!query||matchesApplication(a,query));
  const selected=model.apps.find(a=>a.id===focusAppId);
  const selectedOutsideSearch=selected&&!matches.some(a=>a.id===selected.id)?selected:null;
  const ordered=[...matches].sort((a,b)=>Number(!!scopeReason(a))-Number(!!scopeReason(b))||a.Name.localeCompare(b.Name));
  selector.innerHTML='<option value="">Select an application</option>'+ordered.map(a=>`<option value="${esc(a.id)}">${esc(a.Name)}${scopeReason(a)?' · Not in scope':''}</option>`).join('')+(selectedOutsideSearch?`<option value="${esc(selected.id)}">${esc(selected.Name)}</option>`:'');
  selector.value=focusAppId||'';el('focusAppSearchStatus').textContent='';

 }
 function matchesApplication(a,q){return [a.Name,a.Entity,a.Division].some(value=>String(value||'').toLowerCase().includes(q));}
 function renderPortfolio(){
  const summary=portfolioAtThreshold(portfolioRows,similarityThreshold);
  el('portfolioThreshold').value=String(similarityThreshold);
  el('portfolioStats').innerHTML=`<h3>${summary.pairCount} ${summary.pairCount===1?'pair':'pairs'} to review · Score ${similarityThreshold} or above</h3>`;
  el('portfolioResults').innerHTML=summary.confirmedPairs.length?`<div class="customer-pairs">${summary.confirmedPairs.map(pair=>`<button class="customer-pair" data-portfolio-app="${esc(pair.target.app.id)}" data-portfolio-peer="${esc(pair.peer.app.id)}"><span class="customer-pair-apps"><strong>${esc(pair.target.app.Name)} ↔ ${esc(pair.peer.app.Name)}</strong><span>${esc(pair.target.app.Entity)} ↔ ${esc(pair.peer.app.Entity)}</span><small class="pair-open-label">View comparison →</small></span><span class="customer-pair-score"><strong>${scoreNumber(pair.coverage)}</strong><small>/ 100</small>${pairHint(pair)?`<small class="shared-hint">${esc(pairHint(pair))}</small>`:''}</span></button>`).join('')}</div>`:'<div class="portfolio-empty">No pairs meet this score. <button data-reset-threshold>Reset threshold</button></div>';
  el('portfolioResults').insertAdjacentHTML('beforeend','<aside class="overlap-guidance"><strong>Shared codes do not confirm duplicate functionality.</strong><p>Compare original descriptions and registered capabilities and processes.</p></aside>');
  el('portfolioProvisional').hidden=!isSignedIn();el('portfolioOther').hidden=!isSignedIn();
  const provisionalKey=[portfolioRows,similarityThreshold,isSignedIn()];
  if(lastProvisional&&provisionalKey.every((value,i)=>value===lastProvisional[i]))return;
  lastProvisional=provisionalKey;
  if(!isSignedIn()){el('portfolioProvisional').innerHTML='';return;}
  const groups=new Map(PAIR_STATES.map(status=>[status,[]]));
  for(const pair of portfolioRows.pairs)groups.get(pairStatus(pair)).push(pair);
  const readiness=comparisonReadiness(portfolioRows.pairs,similarityThreshold);
  const explanations={
   'Needs confirmation':'At least one application has a record or catalogue relationship that needs confirmation.',
   'More detail needed':'At least one application is registered too broadly for a functional comparison.',
   'Data missing':'At least one weighted field is missing or has no recorded comparison data.'
  };
  // Only the pairs that need record checks are listed. The screening outcomes (Below threshold, No shared registrations,
  // No complete score, Out of scope) were hidden at the owner's request in V9.11 and are not built at all since V9.14.
  const pairGroup=(status,attention=false)=>{const pairs=groups.get(status);return pairs.length?`<details class="result-category${attention?' attention':''}"><summary>${esc(status)} · ${pairs.length} ${pairs.length===1?'pair':'pairs'}</summary><p class="result-category-note">${esc(explanations[status])}</p><div class="diagnostic-pairs">${pairs.map(p=>`<button data-portfolio-app="${esc(p.target.app.id)}" data-portfolio-peer="${esc(p.peer.app.id)}">${esc(p.target.app.Name)} ↔ ${esc(p.peer.app.Name)}<small>${esc(pairHint(p))}</small></button>`).join('')}</div></details>`:'';};
  el('portfolioProvisional').innerHTML=`${readiness.pairCount?`<section class="record-readiness"><h3>Check application records · ${readiness.apps.length} ${readiness.apps.length===1?'application':'applications'}</h3><p>Start with each application once. These records affect ${readiness.pairCount.toLocaleString('en-US')} pairs; you do not need to fix each pair separately.</p>${readiness.apps.length?`<details class="readiness-apps"><summary>View ${readiness.apps.length} applications</summary><div class="readiness-app-list">${readiness.apps.map(({app})=>`<button data-readiness-app="${esc(app.id)}"><span><strong>${esc(app.Name)}</strong><small>${esc(app.Entity||'Plant not recorded')} · ${esc(app.Division||'Business unit not recorded')}</small></span><span>View details →</span></button>`).join('')}</div></details>`:''}${readiness.unattributedPairCount?`<p>${readiness.unattributedPairCount} pairs also require comparison-specific catalogue checks; see the affected comparisons below.</p>`:''}<details class="readiness-pairs"><summary>View affected comparisons · ${readiness.pairCount.toLocaleString('en-US')} pairs</summary>${DATA_TO_CONFIRM.map(status=>pairGroup(status,true)).join('')}</details></section>`:''}`;

 }
 function renderFocus(){
  const model=getModel();if(!model?.apps?.length)return;
  if(focusAppId&&!indexes.weighted.scopes.has(focusAppId))focusAppId=null;
  syncFocusOptions(model);
  el('similarityOverview').hidden=!!focusAppId||choosingApp;el('focusAnalyzer').hidden=!focusAppId&&!choosingApp;
  el('focusAppPicker').hidden=true;el('changeFocusApp').hidden=!focusAppId;el('focusSearchPicker').hidden=!!focusAppId;review.querySelector('.focus-filters').hidden=!!focusAppId;
  el('focusHeading').textContent=focusAppId?(focusPeerId?'3. View comparison evidence':'2. Choose another application'):'1. Choose an application';el('focusHeading').hidden=false;el('focusHelp').textContent=focusAppId?'':'Find an application, then choose one to compare with it.';el('focusStatus').textContent='';el('backToPairs').textContent=returnTo?.kind==='multi'?'← Back to selected applications':'← Back to results';
  if(!focusAppId){
   const query=el('focusAppSearch').value.trim().toLowerCase(),apps=model.apps.filter(a=>!query||matchesApplication(a,query)).sort((a,b)=>Number(!!scopeReason(a))-Number(!!scopeReason(b))||compareNatural(a.Name,b.Name));
   el('focusResult').innerHTML=`<section class="focus-app-options" aria-label="Choose an application"><p>${apps.length} ${apps.length===1?'application':'applications'}</p><div class="focus-app-list">${apps.map(a=>{return `<button data-start-app="${esc(a.id)}"><strong>${esc(a.Name)}</strong><span>${esc(a.Entity||'Plant not recorded')} · ${scopeReason(a)?'Out of scope':'Application'}</span></button>`;}).join('')||'<p>No matching applications. <button data-clear-app-search>Clear search</button></p>'}</div></section>`;return;
  }
  const source=indexes.weighted.scopes.get(focusAppId).app;
  const sourceIdentity=`<div class="focus-selected-app"><span>Selected application</span><strong>${esc(source.Name)}</strong><small>${esc(source.Entity||'Plant not recorded')} · ${esc(source.Division||'Business unit not recorded')}</small></div>`;
  if(scopeReason(source)){el('focusResult').innerHTML=sourceIdentity+`<p class="scope-banner">Not in similarity check – ${esc(scopeReason(source))}</p>`;return;}
  const opened=new Set([...el('focusResult').querySelectorAll('details[open][id]')].map(d=>d.id));
  const all=orderedPeers(focusAppId),q=peerSearch.trim().toLowerCase(),filtered=all.filter(r=>!q||matchesApplication(r.peer.app,q));
  if(!all.some(r=>r.peer.app.id===focusPeerId))focusPeerId=null;
  const active=all.find(r=>r.peer.app.id===focusPeerId);
  const restoreListScroll=()=>{const list=el('focusResult').querySelector('.focus-rank-list');if(list)list.scrollTop=peerListScroll;};
  const row=r=>`<button class="focus-rank ${r.peer.app.id===focusPeerId?'is-active':''}" data-focus-peer="${esc(r.peer.app.id)}" aria-pressed="${r.peer.app.id===focusPeerId}"><span class="focus-rank-top"><span class="focus-rank-name"><span class="focus-rank-label" title="${esc(r.peer.app.Name)}">${esc(r.peer.app.Name)}</span><small>${esc(r.peer.app.Entity||'Plant not recorded')} · ${esc(r.peer.app.Division||'Business unit not recorded')}</small></span></span></button>`;
  const ranking=`<section class="focus-panel focus-ranking"><div class="focus-panel-head"><h3>Applications</h3><span>${filtered.length} ${filtered.length===1?'application':'applications'}</span></div><label class="focus-peer-search">Search applications<input id="focusPeerSearch" type="search" placeholder="Name, plant or business unit" value="${esc(peerSearch)}" autocomplete="off"></label><div class="focus-rank-list">${filtered.map(row).join('')}${!filtered.length?'<p class="focus-empty">No matching applications. <button data-clear-peer-search>Clear search</button></p>':''}</div></section>`;
  if(!active){el('focusResult').innerHTML=sourceIdentity+(all.length?ranking:'<section class="focus-panel"><p class="focus-empty">No other applications are available to compare. Add another application to this workspace to compare descriptions and codes.</p></section>');restoreListScroll();return;}
  const peer=active.peer.app,forward=active.forward,reverse=active.reverse,id=peer.id;
  const cap=indexes.cap.compare(focusAppId,id),capBack=indexes.cap.compare(id,focusAppId),process=indexes.process.compare(focusAppId,id),processBack=indexes.process.compare(id,focusAppId);
  const direction=(reverse.coverage??reverse.knownPoints)<(forward.coverage??forward.knownPoints)?reverse:forward;
  const records=isSignedIn()?`<details class="similarity-secondary" id="focusSources" ${opened.has('focusSources')?'open':''}><summary>Source records</summary><div class="focus-source-grid">${sourceFields(source,'Application A')}${sourceFields(peer,'Application B')}</div></details>`:'';
  const evidence=`<details class="similarity-secondary" id="focusEvidence" ${opened.has('focusEvidence')?'open':''}><summary>How the score is calculated</summary>${contributionTable(direction,active)}<details class="similarity-secondary" id="focusDirections" ${opened.has('focusDirections')?'open':''}><summary>Full calculation and code evidence</summary>${calculationDetails(forward)}${calculationDetails(reverse)}${branchEvidence(cap,'Capability · '+source.Name,false)}${branchEvidence(capBack,'Capability · '+peer.Name,false)}${branchEvidence(process,'Process · '+source.Name,false)}${branchEvidence(processBack,'Process · '+peer.Name,false)}</details></details>`;
  const costs=`<details class="similarity-secondary" id="focusCosts" ${opened.has('focusCosts')?'open':''}><summary>Annual costs</summary><div class="pair-costs"><p><span>${esc(source.Name)}</span><strong>${esc(opportunityCostLabel(source))}</strong></p><p><span>${esc(peer.Name)}</span><strong>${esc(opportunityCostLabel(peer))}</strong></p></div></details>`;
  const descriptionComponent=direction.components.find(c=>c.key==='description');
  const sharedDescriptionWords=descriptionComponent?.weight>0?descriptionComponent.text?.shared||[]:[];
  const originalDescriptions=`<section class="purpose-comparison"><h4>Original descriptions</h4>${sharedDescriptionWords.length?'<p class="description-match-key"><mark class="description-shared-word">Highlighted words</mark> show text overlap, not proof of the same function. Repeated words count once.</p>':''}<div class="purpose-grid">${purposeCard(source,sharedDescriptionWords)}${purposeCard(peer,sharedDescriptionWords)}</div></section>`;
  const detail=`<section class="focus-panel focus-detail readable-comparison" tabindex="-1">
   <div class="comparison-overview"><div><h3>Compare applications</h3></div><div class="comparison-score"><span>Score</span><strong>${active.status==='confirmed'?`${scoreNumber(active.coverage)}<small> / 100</small>`:'Unavailable'}</strong><em class="comparison-status">${esc(pairStatus(active))}</em>${codeEvidenceScore(active)===null?'':`<small class="comparison-code-evidence">Code evidence ${formatCodeEvidence(codeEvidenceScore(active))}</small>`}</div></div>
   ${comparisonIdentities(source,peer,esc)}
   <p class="comparison-guidance">${esc(statusHelp(active))}</p>
   ${active.status!=='confirmed'&&pairHint(active)?`<p class="comparison-note">${esc(pairHint(active))}</p>`:''}
   ${`<details class="similarity-secondary" id="focusOriginalDescriptions" ${opened.has('focusOriginalDescriptions')?'open':''}><summary>Original descriptions and shared words</summary>${originalDescriptions}</details>`}
   ${renderComparisonRecords({model:getModel(),cap,capBack,process,processBack,opened,escape:esc})}
   ${records}${evidence}${costs}
  </section>`;
  el('focusResult').innerHTML=`<details class="similarity-secondary" id="focusCandidates" ${opened.has('focusCandidates')?'open':''}><summary>Change comparison application</summary>${sourceIdentity}${ranking}</details>${detail}`;
  restoreListScroll();

 }

 function refresh(){
  const model=getModel();if(!model)return;
  el('exportSelection').hidden=!isSignedIn();el('portfolioProvisional').hidden=!isSignedIn();el('portfolioOther').hidden=!isSignedIn();weightsPanel.querySelector('[data-weight-save]').textContent=isSignedIn()?'':'Not saved – resets on reload';
  if(model!==lastModel){lastModel=model;weights=cleanWeights(getData().similarityWeights);indexes={cap:createSimilarity(model,'cap'),process:createSimilarity(model,'process'),weighted:createWeightedSimilarity(model,weights)};portfolioRows=portfolioCandidates(indexes.weighted);syncWeights();pool=model.apps.map(a=>a.id);selected=new Set();context='All applications';cell=null;el('focusApp').innerHTML='';}
  if(!review.hidden)renderReview();
  if(dialog.open){renderChoices();renderMatrix();}
 }
 function activateTab(id){for(const name of ['overviewTab','landscapeTab','similarityTab']){const tab=el(name);tab.classList.toggle('active',name===id);tab.setAttribute('aria-pressed',String(name===id));}}
 function showSimilarity(){if(!getModel())return;mode='portfolio';document.body.classList.remove('is-overview');document.body.classList.add('is-similarity');el('overviewWorkspace').hidden=true;el('metrics').hidden=true;el('landscapeWorkspace').hidden=true;review.hidden=false;weightsPanel.hidden=false;activateTab('similarityTab');refresh();onStateChange();}
 function showPortfolio(){showSimilarity();}
 function showReview(){showSimilarity();}
 function renderReview(){renderPortfolio();renderFocus();}
 function open({poolIds,contextLabel,seedId,targetId,peerId,dimension:dim}={}){
  refresh();const model=getModel();if(!model)return;
  pool=poolIds?.length?[...new Set(poolIds)].filter(id=>indexes.cap.scopes.has(id)):model.apps.map(a=>a.id);
  context=contextLabel||'All applications';dimension=dim||'weighted';el('selectionSearch').value='';showSelectedOnly=false;
  if(targetId&&peerId){selected=new Set([targetId,peerId]);cell=[targetId,peerId];}
  else if(poolIds){selected=new Set(dimension==='weighted'?pool:pool.slice(0,2));cell=selected.size===2?[...selected]:null;}
  else {selected=new Set([...selected].filter(id=>pool.includes(id)));if(seedId)selected.add(seedId);cell=null;}
  el('compareSelection').open=selected.size<2;
  renderChoices();renderMatrix();if(!dialog.open)dialog.showModal();
 }
 function visibleChoices(){const q=el('selectionSearch').value.trim();return pool.map(id=>indexes.cap.scopes.get(id)?.app).filter(Boolean).filter(a=>(!showSelectedOnly||selected.has(a.id))&&matches(a,q)).sort((a,b)=>compareNatural(a.Name,b.Name));}
 function renderChoices(){
  el('compareScope').textContent=`Candidate group: ${context} · ${pool.length} applications`;
  const apps=visibleChoices();
  el('selectionCount').textContent=`${selected.size} selected · ${apps.length} shown`;
  el('selectedApplicationsCount').textContent=`${selected.size} selected`;
  el('selectedApplications').innerHTML=[...selected].map(id=>indexes.cap.scopes.get(id)?.app).filter(Boolean).map(a=>`<span class="selected-app-chip"><span>${esc(a.Name)}</span><button data-remove-selected="${esc(a.id)}" aria-label="Remove ${esc(a.Name)} from selection">×</button></span>`).join('')||'<span class="selection-empty">Select applications above to begin.</span>';
  el('showSelectedApplications').textContent=showSelectedOnly?'Show all applications':'View selected';el('showSelectedApplications').setAttribute('aria-pressed',String(showSelectedOnly));el('showSelectedApplications').disabled=!selected.size&&!showSelectedOnly;
  el('clearSelectedApplications').disabled=!selected.size;el('clearSelection').disabled=!selected.size;el('selectVisible').disabled=!apps.length;
  el('applicationChoices').innerHTML=apps.map(a=>`<label class="application-choice"><input type="checkbox" data-select-app="${esc(a.id)}" ${selected.has(a.id)?'checked':''}><span>${esc(a.Name)}<small>${esc(a.Entity||'Plant not provided')} · ${esc(a.Division||'Business unit not recorded')}</small></span></label>`).join('')||(showSelectedOnly&&!selected.size?'<p class="hint">No applications selected. <button data-show-all-applications>Show all applications</button></p>':'<p class="hint">No applications found. <button data-clear-selection-search>Clear search and filters</button></p>');
 }
 function renderMatrix(){
  el('coverageScope').textContent='';
  dialog.querySelectorAll('[data-matrix-dim]').forEach(b=>{const active=b.dataset.matrixDim===dimension;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  if(cell&&!cell.every(id=>selected.has(id)))cell=null;
  const matrixOpened=new Set([...el('comparisonMatrix').querySelectorAll('details[open][id]')].map(node=>node.id));
  const apps=[...selected].map(id=>indexes[dimension].scopes.get(id)?.app).filter(Boolean),index=indexes[dimension];
  el('exportSelection').disabled=apps.length<2;
  if(apps.length<2){el('comparisonMatrix').innerHTML='<p class="compare-placeholder">Select at least two applications to compare.</p>';el('comparisonEvidence').innerHTML='';return;}
  if(dimension==='weighted'){
   const pairs=apps.flatMap((a,i)=>apps.slice(i+1).map(b=>index.pair(a.id,b.id))),scored=pairs.filter(p=>p.status==='confirmed').sort((a,b)=>b.coverage-a.coverage);
   const label=pairStatus;
   const pairRow=p=>{const code=codeEvidenceScore(p);return `<button class="compare-pair-row" data-cell-target="${esc(p.target.app.id)}" data-cell-peer="${esc(p.peer.app.id)}"${code===null?'':` data-open-similarity-target="${esc(p.target.app.id)}" data-open-similarity-peer="${esc(p.peer.app.id)}"`}><span>${esc(p.target.app.Name)} ↔ ${esc(p.peer.app.Name)}<small>${esc(p.target.app.Entity)} · ${esc(p.peer.app.Entity)}</small>${code===null?'':'<small class="pair-next-action">Compare actual uses →</small>'}</span><strong>${p.status==='confirmed'?scoreText(p.coverage):label(p)+(code===null?'':'<small class="compare-pair-code">Code evidence '+formatCodeEvidence(code)+'</small>')}</strong></button>`;};
   const readiness=comparisonReadiness(pairs,similarityThreshold);
   const groups=['No complete score','Data missing','Needs confirmation','More detail needed','No shared registrations','Out of scope'].map((group,i)=>{
    if(DATA_TO_CONFIRM.includes(group))return '';
    const rest=pairs.filter(p=>p.status!=='confirmed'&&label(p)===group),id='matrixPairGroup-'+i,active=cell&&rest.some(pair=>[pair.target.app.id,pair.peer.app.id].every(appId=>cell.includes(appId)));
    if(!rest.length)return '';
    const shared=group==='No complete score'&&rest.some(pair=>codeEvidenceScore(pair)!==null);
    return `<details id="${id}" ${matrixOpened.has(id)||active?'open':''}><summary>${shared?sharedClassificationAction:group} · ${rest.length} ${rest.length===1?'pair':'pairs'}</summary>${shared?`<p class="comparison-action-help">${sharedClassificationHelp}</p>`:''}${rest.map(pairRow).join('')}</details>`;
   }).join('');
   el('comparisonMatrix').innerHTML=`<p class="comparison-context">Comparing ${apps.length} applications · ${pairs.length} ${pairs.length===1?'pair':'pairs'}</p><div class="compare-pair-list">${scored.length?scored.map(pairRow).join(''):'<p>No scored pairs among the selected applications.</p>'}${groups}</div>${renderComparisonReadiness(readiness,esc)}`;
   let active=cell&&cell.every(id=>selected.has(id))&&index.pair(...cell);
   if(active&&DATA_TO_CONFIRM.includes(label(active))){active=null;cell=null;}
   if(active||scored[0]){const p=active||scored[0];renderEvidence(p.target.app.id,p.peer.app.id);}else{cell=null;el('comparisonEvidence').innerHTML='';}
   return;
  }
  el('comparisonMatrix').innerHTML=`<div class="directional-scroll" tabindex="0" aria-label="Horizontally scrollable comparison matrix"><table class="directional-matrix"><thead><tr><th>${dimension==='weighted'?'Pair ↓ / →':'Target ↓ / Covered by →'}</th>${apps.map(a=>`<th>${esc(a.Name)}<small>${esc(a.Entity)}</small></th>`).join('')}</tr></thead><tbody>${apps.map(a=>`<tr><th>${esc(a.Name)}<small>${esc(a.Entity)}</small></th>${apps.map(b=>{if(a.id===b.id)return '<td class="matrix-self">—</td>';const r=index.compare(a.id,b.id),value=r.coverage;const status=scopeReason(a)||scopeReason(b)?'Out of scope':'';return `<td><button class="matrix-score ${value===null?'is-unavailable':''}" style="--coverage:${value??0}" data-cell-target="${esc(a.id)}" data-cell-peer="${esc(b.id)}" title="${esc(status?'Not in similarity check – '+[...new Set([scopeReason(a),scopeReason(b)].filter(Boolean))].join('; '):english(r.reason)||explainResult(r))}" aria-label="${esc(a.Name)} ${dimension==='weighted'?'paired with':'covered by'} ${esc(b.Name)}: ${status?status+' · ':''}${scoreSummary(value,dimension)}; View evidence">${scoreDisplay(value,dimension)}${status?`<small>${status}</small>`:''}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  if(cell&&cell.every(id=>selected.has(id)))renderEvidence(...cell);else el('comparisonEvidence').innerHTML='';
 }
 function recordList(items){return items.length?'<ul class="record-list">'+items.map(n=>`<li><b>${esc(displayCode(n.id))}</b><span title="${esc(n.label)}">${esc(displayName(n))}</span>${n.sources?`<small>Source: ${esc(n.sources.map(s=>s.id).join(', '))}</small>`:''}</li>`).join('')+'</ul>':'<p class="compare-empty">No records.</p>';}
 function branchEvidence(r,label,opened){return `<details class="direction-evidence" ${opened?'open':''}><summary>${escapedCodeEvidenceSummary(label,esc)}</summary>${r.reason?`<p class="score-note">${esc(english(r.reason))}</p>`:''}${isSignedIn()&&r.target.pending.length?`<ul class="record-list">${r.target.pending.map(p=>`<li><b>${esc(english(p.value))}</b><span>${esc(english(p.reason))}</span></li>`).join('')}</ul>`:''}${r.branches.map(b=>`<details class="branch-evidence"><summary><span>${esc(displayCode(b.id))} · Level ${b.level} · ${b.items.length} target records</span><strong>${b.coverage===null?'N/A':b.common.length+' / '+b.items.length}</strong></summary><p class="branch-label">${esc(displayName({id:b.id,label:b.label}))}</p>${b.reason?`<p class="score-note">${esc(english(b.reason))}</p>`:''}<div class="comparison-lists"><section><h4>Shared records</h4>${recordList(b.common)}</section><section><h4>Target-only records</h4>${recordList(b.onlyTarget)}</section><section><h4>Peer records at this level</h4>${recordList(b.peerItems)}</section></div></details>`).join('')}</details>`;}
 function renderEvidence(targetId,peerId){
  cell=[targetId,peerId];dialog.querySelectorAll('[data-cell-target]').forEach(button=>button.setAttribute('aria-pressed',String(dimension==='weighted'?[button.dataset.cellTarget,button.dataset.cellPeer].every(id=>cell.includes(id)):button.dataset.cellTarget===targetId&&button.dataset.cellPeer===peerId)));const index=indexes[dimension],a=index.compare(targetId,peerId),b=index.compare(peerId,targetId);
  if(dimension==='weighted'){renderWeightedEvidence(index.pair(targetId,peerId));return;}
  const card=(r,label)=>`<div class="coverage-card"><span>${label}</span><div class="selected-component"><h4>${esc(title(dimension))} score</h4>${scoreDisplay(r.coverage,dimension)}</div><p>${esc(depth(r.target))} · ${r.comparableBranches} / ${r.branches.length} comparable branches</p>${r.coverage!==null?`<p class="score-fraction">Shared ${r.commonCount} / Target ${r.targetCount}</p>`:`<p class="score-note">${esc(explainResult(r))}</p>`}</div>`;
  const diff=quickDifference(a,b),labels=nodes=>nodes.length?nodes.slice(0,4).map(displayRecordLabel).join('; ')+(nodes.length>4?'; '+(nodes.length-4)+' more':''):(diff.partial?'None among confirmed records':'None');
  const quick=`<div class="quick-difference"><h3>${diff.partial?'Confirmed overlap and differences':'Overlap and differences'}</h3><div class="difference-grid"><section><h4>Shared records</h4><p>${esc(labels(diff.common))}</p></section><section><h4>Row target only</h4><p>${esc(labels(diff.targetOnly))}</p></section><section><h4>Column application only</h4><p>${esc(labels(diff.peerOnly))}</p></section></div></div>`;
  const appCard=(app,label)=>`<article><span class="pair-letter">${label}</span><h3>${esc(app.Name)}</h3><p class="pair-meta">${esc(app.Entity)} · ${esc(app.Division)}</p><details><summary>Source description</summary><p class="description">${esc(app.Description||'Not provided')}</p></details></article>`;
  const outOfScope=[...new Set([scopeReason(a.target.app),scopeReason(a.peer.app)].filter(Boolean))];
  el('comparisonEvidence').innerHTML=`<section class="selected-evidence"><div class="pair-summary">${appCard(a.target.app,'Row target')}${appCard(a.peer.app,'Column application')}</div>${outOfScope.length?`<p class="scope-banner">Out of scope · Not in similarity check – ${esc(outOfScope.join('; '))}</p>`:''}<div class="coverage-grid">${card(a,'Row target covered by column')}${card(b,'Column covered by row target')}</div>${quick}${branchEvidence(a,'Row target',true)}${branchEvidence(b,'Column application',false)}</section>`;
 }
 function renderWeightedEvidence(pair){
  el('comparisonEvidence').innerHTML=`<section class="selected-evidence"><h3>3. View comparison evidence</h3><h4>${esc(pair.target.app.Name)} ↔ ${esc(pair.peer.app.Name)}</h4><div class="total-result"><span>${pairStatus(pair)}</span>${pair.status==='confirmed'?`<strong>${scoreMarkup(pair.coverage)}</strong>`:''}<p>${esc(statusHelp(pair))}</p>${pairHint(pair)?`<p>${esc(pairHint(pair))}</p>`:''}</div><p>${esc(pair.target.app.Name)} ${esc(opportunityCostLabel(pair.target.app))} · ${esc(pair.peer.app.Name)} ${esc(opportunityCostLabel(pair.peer.app))}</p><button data-open-similarity-target="${esc(pair.target.app.id)}" data-open-similarity-peer="${esc(pair.peer.app.id)}">View comparison</button><details><summary>How is this calculated?</summary>${calculationDetails(pair.forward)}${calculationDetails(pair.reverse)}</details></section>`;
 }

 function exportRows(rows,dim,name){
  const url=URL.createObjectURL(new Blob([similarityCSV(rows,dim,getData(),{threshold:similarityThreshold})],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name+'-'+dim+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }

 function revealResult(){const panel=el('focusAnalyzer');panel.scrollIntoView({block:'start',behavior:'smooth'});}
 function startReview(){if(!focusAppId&&!choosingApp){portfolioPosition=pagePosition();returnTo=null;}choosingApp=true;focusAppId=null;focusPeerId=null;peerSearch='';peerListScroll=0;el('focusResult').innerHTML='';showReview();revealResult();}
 function backToResults(){const destination=returnTo;returnTo=null;choosingApp=false;focusAppId=null;focusPeerId=null;peerSearch='';peerListScroll=0;el('focusResult').innerHTML='';showPortfolio();if(destination?.kind==='multi'){restorePagePosition(destination.page);restoreMultiPosition(destination.state);}else restorePagePosition(portfolioPosition);onStateChange();}
 el('similarityTab').onclick=()=>{returnTo=null;backToResults();};el('backToPairs').onclick=backToResults;el('changeFocusApp').onclick=startReview;el('browseApplications').onclick=startReview;
 el('compareMultipleApplications').onclick=()=>{open();el('compareSelection').open=true;onStateChange();};

 el('portfolioThresholdForm').onsubmit=e=>{e.preventDefault();try{similarityThreshold=Number(el('portfolioThreshold').value);renderReview();onStateChange();}catch(error){el('portfolioStats').textContent=error.message;}};
 el('focusAppSearch').oninput=()=>{if(focusAppId)syncFocusOptions(getModel());else renderFocus();};
 el('focusApp').onchange=e=>{focusAppId=e.target.value||null;focusPeerId=null;peerSearch='';peerListScroll=0;el('focusResult').innerHTML='';renderFocus();onStateChange();};
 review.addEventListener('input',e=>{if(e.target.id!=='focusPeerSearch')return;peerSearch=e.target.value;peerListScroll=0;const caret=e.target.selectionStart;renderFocus();const search=el('focusPeerSearch');search.focus({preventScroll:true});search.setSelectionRange(caret,caret);});
 review.addEventListener('toggle',e=>{if(e.target.id==='focusCandidates'&&e.target.open){const list=e.target.querySelector('.focus-rank-list');if(list)list.scrollTop=peerListScroll;}},true);
 weightsPanel.addEventListener('toggle',onStateChange);
 el('selectionSearch').oninput=()=>{renderChoices();onStateChange();};
 el('selectVisible').onclick=()=>{visibleChoices().forEach(a=>selected.add(a.id));renderChoices();renderMatrix();onStateChange();};
 el('clearSelection').onclick=el('clearSelectedApplications').onclick=()=>{selected.clear();cell=null;showSelectedOnly=false;renderChoices();renderMatrix();onStateChange();};
 el('showSelectedApplications').onclick=()=>{showSelectedOnly=!showSelectedOnly;el('selectionSearch').value='';el('compareSelection').open=true;renderChoices();el('applicationChoices').scrollTop=0;onStateChange();};
 el('compareClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',onStateChange);
 el('exportSelection').onclick=()=>{const ids=[...selected];const rows=dimension==='weighted'?ids.flatMap((a,i)=>ids.slice(i+1).map(b=>indexes.weighted.pair(a,b))):ids.flatMap(a=>ids.filter(b=>b!==a).map(b=>indexes[dimension].compare(a,b)));exportRows(rows,dimension,'logistics-comparison');};
 dialog.addEventListener('change',e=>{const id=e.target.dataset.selectApp;if(id){if(e.target.checked)selected.add(id);else selected.delete(id);renderChoices();renderMatrix();onStateChange();}});
 weightsPanel.addEventListener('input',e=>{if(e.target.hasAttribute('data-weight')){weightsPanel.dataset.dirty='true';previewWeights();}});
 weightsPanel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-apply-weights')){try{const state=previewWeights();if(state.valid)updateWeights(state.weights);}catch(error){weightsPanel.querySelector('[data-weight-status]').textContent=error.message;}}
  if(b.hasAttribute('data-reset-weights'))updateWeights(DEFAULT_WEIGHTS);
 });

 for(const host of [review,dialog])host.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-reset-threshold')){similarityThreshold=50;renderReview();onStateChange();}
  if(b.hasAttribute('data-clear-app-search')){el('focusAppSearch').value='';renderFocus();}
  if(b.hasAttribute('data-clear-peer-search')){peerSearch='';peerListScroll=0;renderFocus();}
  if(b.hasAttribute('data-clear-selection-search')||b.hasAttribute('data-show-all-applications')){el('selectionSearch').value='';showSelectedOnly=false;renderChoices();onStateChange();}
  if(b.dataset.removeSelected){selected.delete(b.dataset.removeSelected);if(!selected.size)showSelectedOnly=false;renderChoices();renderMatrix();onStateChange();}
  // Closing the application details returns keyboard focus to the entry that opened them (V9.14).
  if(b.dataset.readinessApp){const id=b.dataset.readinessApp;onApp(id);document.getElementById('detail')?.addEventListener?.('close',()=>{const entry=[...host.querySelectorAll('[data-readiness-app]')].find(item=>item.dataset.readinessApp===id)||b;entry.focus?.({preventScroll:true});},{once:true});}
  if(b.dataset.startApp){choosingApp=false;el('focusResult').innerHTML='';focusAppId=b.dataset.startApp;focusPeerId=null;peerSearch='';peerListScroll=0;showReview();revealResult();}
  if(b.dataset.portfolioApp){portfolioPosition=pagePosition();returnTo=null;choosingApp=false;el('focusResult').innerHTML='';focusAppId=b.dataset.portfolioApp;focusPeerId=b.dataset.portfolioPeer;peerSearch='';peerListScroll=0;el('focusAppSearch').value='';showReview();revealResult();}
  if(b.dataset.matrixDim){dimension=b.dataset.matrixDim;renderMatrix();onStateChange();}
  if(b.dataset.cellTarget){renderEvidence(b.dataset.cellTarget,b.dataset.cellPeer);onStateChange();}
  if(b.dataset.openSimilarityTarget){cell=[b.dataset.openSimilarityTarget,b.dataset.openSimilarityPeer];returnTo={kind:'multi',state:multiPosition(),page:pagePosition()};choosingApp=false;el('focusResult').innerHTML='';focusAppId=b.dataset.openSimilarityTarget;focusPeerId=b.dataset.openSimilarityPeer;peerSearch='';peerListScroll=0;el('focusAppSearch').value='';dialog.close();showReview();revealResult();}
  if(b.dataset.focusPeer){peerListScroll=el('focusResult').querySelector('.focus-rank-list')?.scrollTop||0;focusPeerId=b.dataset.focusPeer;renderFocus();el('focusCandidates').open=false;el('focusResult').querySelector('.focus-detail')?.focus?.({preventScroll:true});revealResult();onStateChange();}
 });
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 function getState(){return {customerViewVersion:1,weightsOpen:weightsPanel.open,similarityThreshold,dimension,mode,choosingApp,focusAppId,focusPeerId,focusAppSearch:el('focusAppSearch').value,peerSearch,selected:[...selected],pool,context,selectionSearch:el('selectionSearch').value,cell:cell&&[...cell],showSelectedOnly,returnTo,portfolioPosition};}
 function restoreState(state){
  if(!state||typeof state!=='object')return;
  refresh();
  similarityThreshold=state.customerViewVersion===1&&typeof state.similarityThreshold==='number'&&Number.isFinite(state.similarityThreshold)&&state.similarityThreshold>=0&&state.similarityThreshold<=100?state.similarityThreshold:50;
  dimension=['weighted','cap','process'].includes(state.dimension)?state.dimension:'weighted';
  focusAppId=indexes.weighted.scopes.has(state.focusAppId)?state.focusAppId:null;
  focusPeerId=indexes.weighted.scopes.has(state.focusPeerId)?state.focusPeerId:null;
  el('focusAppSearch').value=String(state.focusAppSearch||'');peerSearch=String(state.peerSearch||'');
  mode='portfolio';choosingApp=!focusAppId&&state.choosingApp===true;
  weightsPanel.open=state.weightsOpen===true;
  el('similaritySettings').open=weightsPanel.open;
  pool=Array.isArray(state.pool)?state.pool.filter(id=>indexes.cap.scopes.has(id)):getModel().apps.map(a=>a.id);
  if(!pool.length)pool=getModel().apps.map(a=>a.id);
  selected=new Set(Array.isArray(state.selected)?state.selected.filter(id=>pool.includes(id)):[]);
  context=english(state.context||'All applications');
  el('selectionSearch').value=String(state.selectionSearch||'');
  cell=Array.isArray(state.cell)&&state.cell.length===2&&state.cell[0]!==state.cell[1]&&state.cell.every(id=>selected.has(id))?[...state.cell]:null;showSelectedOnly=state.showSelectedOnly===true;
  returnTo=state.returnTo?.kind==='multi'&&Array.isArray(state.returnTo.state?.pool)&&Array.isArray(state.returnTo.state?.selected)?state.returnTo:null;portfolioPosition=state.portfolioPosition||null;
  if(!review.hidden)renderReview();
  if(dialog.open){renderChoices();renderMatrix();}
 }
 return {open,refresh,showPortfolio,showReview,getState,restoreState};
}

import {english} from './english.mjs';
import {roiScoreText} from './roi.mjs';

const timestamp=value=>value?Date.parse(value):NaN;
// Internal field keys shown as readable headings in the History panel and its CSV.
const fieldLabels={Division:'Business unit',Entity:'Plant',operationCostScore:'Operation cost score',roiScore:'ROI (payback period)',scopeNote:'Scope note',statusNote:'Status in source inventory'};
export const historyFieldLabel=field=>Object.hasOwn(fieldLabels,field)?fieldLabels[field]:String(field??'');
// Values as shown in history: an ROI score appears as its payback period with the score it comes from.
export const historyFieldValue=(field,value)=>field==='roiScore'?roiScoreText(value):value;
export function chronologicalEvents(events){
 return [...events].sort((a,b)=>{
  const left=timestamp(a.at),right=timestamp(b.at);
  if(!Number.isFinite(left))return Number.isFinite(right)?1:0;
  if(!Number.isFinite(right))return -1;
  return left-right;
 });
}

function eventTitle(event){
 if(event.source==='review')return {mapping:`${event.mapping?.dimension==='cap'?'Capability':'Process'} mapping applied`,revoke:'Mapping revoked',note:'Review updated',snapshot:'Saved review snapshot'}[event.kind]||'Review recorded';
 return {created:'Application creation recorded',issue:'Issue reported',fixed:'Resolution reported',updated:'Application update recorded',uploaded:'Upload recorded',note:'Milestone recorded',import:'Inventory imported',taxonomy:'Taxonomy updated',restore:'Workspace restored',decision:'Owner decision applied',flagged:'Issue detected',cleared:'Issue no longer detected'}[event.kind]||'Event recorded';
}

export function renderHistoryRecords(events,{creation,firstImport},esc){
 const date=value=>{
  if(!Number.isFinite(timestamp(value)))return 'Date not recorded';
  return `<time datetime="${esc(value)}">${esc(new Date(value).toLocaleString('en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}))}</time>`;
 };
 const text=value=>String(value??'').length?esc(value):'<span class="app-event-empty">Not recorded</span>';
 const field=(label,content,className='')=>`<div class="app-event-field ${className}"><dt>${esc(label)}</dt><dd>${content}</dd></div>`;
 const change=(label,before,after,truncated=false)=>`<section class="app-event-change"><h5>${esc(label)}</h5><dl class="app-event-comparison">${field('Before',String(before??'').length?esc(before):'<span class="app-event-empty">Not provided</span>','app-event-before')}${field('After',String(after??'').length?esc(after):'<span class="app-event-empty">Not provided</span>','app-event-after')}</dl>${truncated?'<p class="app-event-note">Saved field preview shortened; the full historical value is not available here.</p>':''}</section>`;
 const body=event=>{
  if(event.mapping){
   const mapping=event.mapping;
   return `<dl class="app-event-fields">${field('Source entry',text(mapping.raw))}${field(event.kind==='revoke'?'Revoked standard target':'Mapped to',`<code>${esc(mapping.targetId)}</code>${mapping.targetName?`<span class="app-event-target-name">${esc(mapping.targetName)}</span>`:''}`,event.kind==='revoke'?'':'app-event-after')}${field('Reason',text(mapping.reason))}</dl>`;
  }
  if(event.review){
   const review=event.review;
   if(event.kind==='snapshot')return `<dl class="app-event-fields">${review.raw?field('Source entry',esc(review.raw)):''}${field('Saved status',text(english(review.status||'')))}${field('Saved result',text(review.result))}</dl><p class="app-event-note">Earlier edits were not recorded.</p>`;
   const changes=[];
   if(review.previousStatus!==review.status)changes.push(change('Review status',english(review.previousStatus||''),english(review.status||'')));
   if(review.previousResult!==review.result)changes.push(change('Review result',review.previousResult,review.result));
   return `${review.raw?`<dl class="app-event-fields">${field('Source entry',esc(review.raw))}</dl>`:''}${changes.length?`<div class="app-event-changes">${changes.join('')}</div>`:`<dl class="app-event-fields">${field('Review status',text(english(review.status||'')))}${field('Review result',text(review.result))}</dl>`}`;
  }
  return `<dl class="app-event-fields">${field(event.details?.length?'Import record':'Details',text(event.description))}</dl>${event.details?.length?`<div class="app-event-changes"><p class="app-event-change-count">${event.details.length} ${event.details.length===1?'field changed':'fields changed'}</p>${event.details.map(item=>change(historyFieldLabel(item.field),historyFieldValue(item.field,item.before),historyFieldValue(item.field,item.after),item.truncated)).join('')}</div>`:''}`;
 };
 const byline=event=>{
  const role=event.source==='review'?'Reviewer':event.source==='manual'?'Recorded by':'Changed by';
  return `<dl class="app-event-meta">${field(role,event.source==='system'?text(''):text(event.actor))}${event.source==='system'?field('Recorded by system',text(event.actor)):''}${event.source==='manual'&&event.recordedAt?field('Entered on',date(event.recordedAt)):''}${event.inventoryFile?field('Inventory file',esc(event.inventoryFile)):''}${event.taxonomyFile?field('Taxonomy file',esc(event.taxonomyFile)):''}</dl>`;
 };
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local time';
 return `<div class="app-history-heading"><p class="app-history-order">Oldest → Newest <span>Times in ${esc(zone)}</span></p><div class="app-history-actions"><button id="exportAppHistory" type="button">Export CSV</button></div></div>
  <p class="app-history-guide">Events recorded in this workspace.</p>
  <dl class="app-history-context"><div><dt>Creation date</dt><dd>${creation?`${date(creation.happenedAt)}<span>Recorded by ${esc(creation.recorder)}</span>`:'Not recorded'}</dd></div><div><dt>First recorded import</dt><dd>${firstImport?date(firstImport.at):'Not recorded'}</dd></div></dl>
  <ol class="app-timeline" role="list">${events.map(event=>`<li class="app-event"><article class="app-event-card"><div class="app-event-top"><div class="app-event-time"><span>Event time</span>${date(event.at)}</div><span class="app-event-kind ${['issue','flagged','revoke'].includes(event.kind)?'attention':''}">${esc(eventTitle(event))}</span></div><div class="app-event-body"><h4>What changed</h4>${body(event)}</div>${byline(event)}</article></li>`).join('')||'<li class="app-history-empty">No history recorded for this application.</li>'}</ol>`;
}

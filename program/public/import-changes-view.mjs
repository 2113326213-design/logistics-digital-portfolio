import {historyFieldLabel,historyFieldValue} from './history-view.mjs';
import {LIST_FIELDS,listDifference} from './import-review.mjs';

// The change details of an import preview (owner request 2026-10-22, V9.20): every changed field of every application,
// old value → new value, shown before Apply. The button exports the same details (importChangesCSV in import-review.mjs).
export function renderImportChanges(preview,esc){
 const changes=preview.fieldChanges||[],apps=new Set(changes.map(c=>c.appId)).size;
 if(!changes.length&&!preview.added.length&&!preview.removed.length)return '<p class="hint import-changes-none">No application fields change with this import.</p>';
 const blank='<span class="import-change-blank">(blank)</span>',none='<span class="import-change-blank">—</span>';
 const value=(field,text)=>String(text??'').trim()?esc(historyFieldValue(field,text)):blank;
 const entries=(items,sign,cls)=>items.length?items.map(item=>`<span class="${cls}">${sign} ${esc(item)}</span>`).join('<br>'):none;
 const cells=c=>{
  if(!LIST_FIELDS.has(c.field))return `<td>${value(c.field,c.before)}</td><td>${value(c.field,c.after)}</td>`;
  const d=listDifference(c.before,c.after);
  return `<td>${entries(d.removed,'−','import-change-removed')}</td><td>${entries(d.added,'+','import-change-added')}</td>`;
 };
 const extra=[preview.added.length?`${preview.added.length} added`:'',preview.removed.length?`${preview.removed.length} removed`:''].filter(Boolean);
 // An application can be 'updated' only in where its values come from (sheet, row); say so, so the counts agree.
 const changed=new Set(changes.map(c=>c.appId)),referencesOnly=(preview.updated||[]).filter(a=>!changed.has(String(a.ID).trim())).length;
 const referencesNote=referencesOnly?` ${referencesOnly} updated ${referencesOnly===1?'application changes':'applications change'} only in source references (the sheet and row a value comes from), which are not listed.`:'';
 return `<details class="import-changes" open><summary>Change details · ${changes.length} ${changes.length===1?'field':'fields'} in ${apps} ${apps===1?'application':'applications'}${extra.length?' · '+extra.join(' · '):''}</summary>
<p class="hint">Old value → new value for each application, before anything is applied. For Business Capabilities and Processes only the entries removed (−) and added (+) are shown. Added and removed applications are listed below.${referencesNote}</p>
<p><button type="button" id="exportImportChanges">Export change details (CSV)</button></p>
${changes.length?`<div class="import-changes-scroll" tabindex="0" aria-label="Change details"><table class="import-changes-table"><thead><tr><th scope="col">Application</th><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>${changes.map(c=>`<tr><th scope="row">${esc(c.name)}</th><td>${esc(historyFieldLabel(c.field))}</td>${cells(c)}</tr>`).join('')}</tbody></table></div>`:''}
</details>`;
}

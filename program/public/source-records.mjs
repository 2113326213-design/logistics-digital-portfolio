import {formatROIPayback,roiPayback,ROI_PAYBACK_RULE} from './roi.mjs';
export function renderSourceRecords(app,esc){
 const entries=value=>String(value??'').split(';').filter(entry=>entry.trim());
 const notes=String(app.Description??'').split(/\r?\n/).filter(line=>/^oneIDM name is\b/i.test(line.trim()));
 const fields=[
  {name:'ROI (payback period)',values:[formatROIPayback(app)],note:`Source ROI score: ${roiPayback(app).score??'not provided'}${roiPayback(app).score!==null?' / 5':''} · ${app.roiSource||'No ROI source recorded'} · Shown as a payback period: ${ROI_PAYBACK_RULE}.`},
  ...(String(app.statusNote??'').trim()?[{name:'Status in source inventory',values:[String(app.statusNote).trim()],note:`${app.statusSource||'No source recorded'}${String(app.statusNote).trim().toLowerCase().replace(/\s+/g,' ')==='still active'?'':' · Not still active: not counted in cost totals, ROI or the similarity check.'}`}]:[]),
  {name:'Business Capabilities',values:entries(app['Business Capabilities'])},
  {name:'Processes',values:entries(app.Processes)},
  ...(notes.length?[{name:'Description',values:notes,note:'Source notes from Description'}]:[])
 ];
 return `<p class="app-source-guide">Current inventory values, grouped by field. Entries are shown in source order.</p>
  <dl class="app-source-fields">${fields.map(field=>`<div class="app-source-field">
   <dt><span>${esc(field.name)}</span><small>${field.values.length} ${field.values.length===1?'entry':'entries'}</small></dt>
   <dd>${field.note?`<p class="app-source-note">${esc(field.note)}</p>`:''}${field.values.length?`<ol class="app-source-entries" role="list">${field.values.map((value,index)=>`<li><span class="app-source-index" aria-hidden="true">${index+1}</span><span class="app-source-value">${esc(value)}</span></li>`).join('')}</ol>`:'<p class="app-source-empty">Not provided</p>'}</dd>
  </div>`).join('')}</dl>`;
}

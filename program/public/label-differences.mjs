import {capCode,norm,compareNatural} from './codes.mjs';
import {semanticConcerns} from './semantic-review.mjs';
export function labelDifferenceRows(model,apps=model.apps){
 const rows=[];
 for(const app of apps){
  const pending=new Set(semanticConcerns(app,model.correctionLog,model.caps).map(item=>item.raw));
  for(const raw of app.rawCap){
  const code=capCode(raw),standard=model.caps.get(code)?.reference;
  if(!standard)continue;
  const sourceName=raw.replace(/^\S+\s*/,''),standardName=standard.replace(/^\S+\s*/,'');
  if(norm(sourceName)===norm(standardName))continue;
  rows.push({plant:app.Entity||'Not provided',appId:app.id,appName:app.Name,code,sourceName,standardName,semanticStatus:pending.has(raw)?'pending':null});
  }
 }
 return rows.sort((a,b)=>a.plant.localeCompare(b.plant)||a.appName.localeCompare(b.appName)||compareNatural(a.code,b.code));
}
export function renderLabelDifferences(model,apps,esc){
 const rows=labelDifferenceRows(model,apps),plants=[...new Set(rows.map(row=>row.plant))];
 if(!rows.length)return '<p>No source label differences in this scope.</p>';
 const pending=rows.filter(row=>row.semanticStatus==='pending').length;
 return `<p class="hint">${rows.length} source registrations in ${new Set(rows.map(row=>row.appId)).size} applications have a different label. ${pending} registrations in the seven suspect code groups await business confirmation. Taxonomy headings use standard names. Similarity withholds these pending capability records until a verified mapping is applied.</p>`+plants.map(plant=>`<section class="label-difference-plant"><h4>${esc(plant)}</h4><div class="label-difference-scroll"><table class="label-difference-table"><thead><tr><th>Application</th><th>Code</th><th>LeanIX maintenance</th><th>Standard name</th><th>Semantic review</th></tr></thead><tbody>${rows.filter(row=>row.plant===plant).map(row=>`<tr class="${row.semanticStatus==='pending'?'is-semantic-pending':''}"><td><button class="text-button" data-label-app="${esc(row.appId)}">${esc(row.appName)}</button></td><td>${esc(row.code)}</td><td>${esc(row.sourceName)}</td><td>${esc(row.standardName)}</td><td>${row.semanticStatus==='pending'?'<span class="review-status">Pending business confirmation</span>':'—'}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
}

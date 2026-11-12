import {compareNatural} from './codes.mjs';
import {noLevelRecord,nameProblems,NOT_STANDARD_LABEL,NO_LEVEL_LABEL} from './process-record-kind.mjs';

// B (V21, owner 2026-11-12, plan A + B): every process record of the Overview's plants whose level the tool cannot read
// from its name — names not in the standard form, and standard names without their level — with what is wrong and
// what to change in LeanIX, in one list under Overview, Process, and as a CSV to send to the plants. The rows are the
// Issues to review records (report.issues), so the list, the To review counts and the application details agree.
export function nameFixRows(model,report){
 const rows=[];
 for(const app of report.apps)for(const issue of report.issues.get(app.id)||[]){
  if(issue.dimension!=='process'||issue.kind!=='record'||issue.level!==null||![NOT_STANDARD_LABEL,NO_LEVEL_LABEL].includes(issue.label))continue;
  const kind=noLevelRecord(model,issue.record);
  rows.push({plant:app.Entity||'Not provided',businessUnit:app.Division||'Not provided',appId:app.id,application:app.Name,record:issue.record,issue:kind.label,problems:nameProblems(model,issue.record),next:kind.next});
 }
 return rows.sort((a,b)=>compareNatural(a.plant,b.plant)||compareNatural(a.application,b.application)||compareNatural(a.record,b.record));
}

export function renderNameFixes(model,report,esc){
 const rows=nameFixRows(model,report);if(!rows.length)return '';
 return `<section class="overview-card name-fixes" aria-labelledby="nameFixesTitle"><div class="name-fixes-head"><div><h3 id="nameFixesTitle">Process names to fix in LeanIX · ${rows.length}</h3><p>The tool reads a process's level from its name. These names have no level (L0–L3), so the tool cannot place them. Open an application to see its name next to the standard form.</p></div><button type="button" id="overviewExportNameFixes">Export for plants (CSV)</button></div><div class="name-fixes-scroll"><table class="name-fixes-table"><thead><tr><th scope="col">Plant</th><th scope="col">Application</th><th scope="col">Recorded in LeanIX</th><th scope="col">What is wrong</th><th scope="col">What to change</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.plant)}</td><td><button type="button" class="name-fixes-app" data-label-app="${esc(r.appId)}">${esc(r.application)}</button></td><td><code>${esc(r.record)}</code></td><td>${esc(r.problems)}</td><td>${esc(r.next)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

const quote=x=>'"'+String(x??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
export function nameFixCSV(model,report,{source=''}={}){
 const rows=[['Plant','Business unit','Application ID','Application','Recorded in LeanIX','Issue','What is wrong','What to change','Data source'],
  ...nameFixRows(model,report).map(r=>[r.plant,r.businessUnit,r.appId,r.application,r.record,r.issue,r.problems,r.next,source])];
 return '﻿'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
// Process_names_to_fix_<plant, business unit or all plants>_<date>.csv
export const nameFixFileName=(filters={},date=new Date().toISOString().slice(0,10))=>`Process_names_to_fix_${String(filters.entity||filters.division||'all plants').trim().replace(/[^A-Za-z0-9._-]+/g,'_')}_${date}.csv`;

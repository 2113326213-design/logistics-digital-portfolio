import {maintenanceReport} from './overview.mjs';
import {compareNatural} from './codes.mjs';

// The To review list as CSV for Excel (owner request 2026-10-22, V11): every open issue of every application in the
// current Overview filter (business unit, plant), for both dimensions, one row per issue, so each plant can correct
// its records in LeanIX. The rows are the issues the Overview and the application details show.
export function toReviewRows(model,filters={}){
 const rows=[];
 for(const dimension of ['cap','process']){
  const report=maintenanceReport(model,filters,dimension);
  const apps=[...report.needsReview].sort((a,b)=>compareNatural(a.Entity||'',b.Entity||'')||compareNatural(a.Name,b.Name));
  for(const app of apps)for(const issue of report.issues.get(app.id)||[])rows.push({
   plant:app.Entity||'',businessUnit:app.Division||'',appId:app.id,application:app.Name,
   dimension:dimension==='cap'?'Business Capability':'Process',level:issue.level===null||issue.level===undefined?'':`Level ${issue.level}`,
   issue:issue.label,record:issue.record||'',check:issue.text||'',details:issue.detail||''
  });
 }
 return rows;
}
const quote=x=>'"'+String(x??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
export function toReviewCSV(model,filters={},{source=''}={}){
 const rows=[['Plant','Business unit','Application ID','Application','Dimension','Level','Issue','Source record','What to check','Details','Data source'],
  ...toReviewRows(model,filters).map(r=>[r.plant,r.businessUnit,r.appId,r.application,r.dimension,r.level,r.issue,r.record,r.check,r.details,source])];
 return '﻿'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
// To_review_<plant, business unit or all plants>_<date>.csv
export const toReviewFileName=(filters={},date=new Date().toISOString().slice(0,10))=>`To_review_${String(filters.entity||filters.division||'all plants').trim().replace(/[^A-Za-z0-9._-]+/g,'_')}_${date}.csv`;

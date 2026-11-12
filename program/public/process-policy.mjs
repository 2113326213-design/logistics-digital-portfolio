// Owner decision, 12 November 2026: keep only application process records beginning with BBM PM.
// The standard process tables and historical records remain unchanged.
export const PROCESS_POLICY='bbm-pm-only-v1';
export const allowedProcess=record=>/^BBM\s+PM(?:\s|$)/i.test(String(record??'').trim());
export function processPolicyChanges(data){
 if(data?.processPolicy!==PROCESS_POLICY)return [];
 return (data.apps||[]).flatMap(app=>{
  const before=String(app.Processes??''),records=before.split(';').map(s=>s.trim()).filter(Boolean);
  const removed=records.filter(record=>!allowedProcess(record));
  if(!removed.length)return [];
  return [{appId:String(app.ID).trim(),field:'Processes',before,after:records.filter(allowedProcess).join(';'),removed,note:'Owner decision applied: only process records starting with BBM PM are kept.'}];
 });
}
export function processPolicyApps(data){
 const changes=new Map(processPolicyChanges(data).map(change=>[change.appId,change.after]));
 return data.apps.map(app=>changes.has(String(app.ID).trim())?{...app,Processes:changes.get(String(app.ID).trim())}:app);
}

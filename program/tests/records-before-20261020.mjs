// Test helper (not a test file): the bundled data as it was before the LeanIX application export of 2026-10-20 was merged
// (V9.16, 2026-10-21). The import event keeps every changed field's previous value, and the owner mappings that were
// carried over at that import are restored to their original entries. Tests that pin examples the owner confirmed on the
// earlier records (handoff 2026-10-15, decisions 2026-10-16 to 2026-10-20) use this instead of the current records.
export const EXPORT_FILE='20261020_083736_UKj4Y_inventory.xlsx';
export const CARRIED_OVER=/^Owner decision carried over · import 2026-10-21$/;
export function recordsBefore20261020(data){
 const event=(data.importHistory||[]).find(e=>e.inventoryFile===EXPORT_FILE);
 if(!event)throw Error(`no import event for ${EXPORT_FILE}`);
 const apps=data.apps.map(app=>{
  let next=app;
  for(const change of event.changes)if(change.appId===String(app.ID).trim()){
   if(change.truncated)throw Error(`the previous ${change.field} of ${change.appId} was truncated in the import event`);
   next={...next,[change.field]:change.before};
  }
  return next;
 });
 const key=c=>JSON.stringify([c.appId,c.dimension,c.raw,c.targetId]);
 const carried=(data.corrections||[]).filter(c=>CARRIED_OVER.test(c.reviewer)),carriedKeys=new Set(carried.map(key));
 const corrections=(data.corrections||[]).filter(c=>!carried.includes(c)).map(c=>c.revokedAt&&carriedKeys.has(key(c))?{...c,revokedAt:''}:c);
 const previousSource=[...(data.importHistory||[])].reverse().find(e=>e!==event&&e.source)?.source||data.source;
 const {inventoryExport,...rest}=data;
 return {...rest,apps,corrections,source:previousSource,importHistory:(data.importHistory||[]).filter(e=>e!==event)};
}

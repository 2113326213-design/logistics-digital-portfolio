// Owner decisions that a source record is correct as recorded although the catalogue has no match for it (first used
// 2026-10-22: RBCW Auto Warehouse Management System "BBM PM I2D Transport Material Intra Plant L3" and AUTO-RACK
// "BBM PM I2D Putaway to Automated Warehouse L3V"). Such a record is not an open issue: it is left out of To review,
// the application's issues, the record checks and the similarity check's pending records. It still has no catalogue
// code, so it never counts as matching the standard. A decision applies only while the application records exactly
// this text; when the record changes, it is checked again.
export const acceptedKey=({appId,dimension,raw})=>JSON.stringify([String(appId??'').trim(),dimension,String(raw??'')]);
const text=(value,max)=>String(value??'').slice(0,max);
export function cleanAcceptedRecords(value){
 if(!Array.isArray(value))return [];
 const seen=new Set();
 return value.flatMap(entry=>{
  if(!entry||typeof entry!=='object')return [];
  const record={appId:text(entry.appId,200).trim(),dimension:entry.dimension==='cap'?'cap':entry.dimension==='process'?'process':'',raw:text(entry.raw,2000),reviewer:text(entry.reviewer,200).trim(),reason:text(entry.reason,2000).trim(),acceptedAt:text(entry.acceptedAt,40).trim()};
  if(!record.appId||!record.dimension||!record.raw.trim()||!record.reviewer||!record.reason||!record.acceptedAt||seen.has(acceptedKey(record)))return [];
  seen.add(acceptedKey(record));
  return [record];
 });
}
// The sentence shown wherever the record would otherwise be an issue.
export const acceptedText=decision=>`${decision.reviewer} of ${decision.acceptedAt}: confirmed as recorded; not in the current ${decision.dimension==='cap'?'capability':'process'} catalogue, so it does not count as matching the standard. ${decision.reason}`;

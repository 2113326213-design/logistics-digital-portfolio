import {dataAsOf} from './data-as-of.mjs';

// Checks before Apply (an imported file) and before Upload (against the server data). V20, owner 2026-11-02, "先做 A 组":
// a wrong file, a filtered LeanIX export or a page holding other data would otherwise pass with only a few counts in
// the preview. These are warnings in plain words; the person can still go ahead after reading them.
// "Many" means more than a tenth of the applications, and more than a small floor, so a normal export never warns.
const many=(n,total,floor)=>n>Math.max(floor,total/10);
// An application of this tool's scope: a logistics capability (B.06) or a BBM PM process (or its ETAS number).
const logistics=app=>/(^|;)\s*B\.06(\.|\s|;|$)/.test(`${app?.['Main Business Capability']??''};${app?.['Business Capabilities']??''}`)||/(^|;)\s*(BBM\s+PM\b|ETAS\.)/i.test(String(app?.Processes??''));

// preview: previewImport's result; current: the data on the page before applying. newExport: the file is an inventory
// export (.xlsx); restored: server data put back over the data this page took or uploaded, so it may well be older.
export function importWarnings(preview,current,{newExport=false,restored=false}={}){
 const total=current?.apps?.length||0,warnings=[];
 if(many(preview.added.length,total,5))warnings.push(`${preview.added.length} applications are new; usually only a few are.`);
 if(many(preview.removed.length,total,3))warnings.push(`${preview.removed.length} applications would be removed.`);
 // Kept applications are named only when this file is a new LeanIX export that left them out (V20 review): a taxonomy
 // file, a workspace backup or the server data carry the list of an earlier export, which was checked when it came in.
 const missing=data=>JSON.stringify(data?.inventoryExport?.missingIds??[]),kept=preview.keptNotInExport||0;
 if(newExport&&missing(preview.next)!==missing(current)&&many(kept,total,5))warnings.push(`${kept} applications are not in this file and are kept unchanged; the LeanIX export may have been filtered.`);
 const other=preview.added.filter(app=>!logistics(app));
 if(other.length>=3&&other.length*2>=preview.added.length)warnings.push(`${other.length} of the new applications have no logistics capability (B.06) and no BBM PM process; they may belong to another department.`);
 const before=dataAsOf(current).date,after=dataAsOf(preview.next).date;
 if(!restored&&before&&after&&after<before)warnings.push(`This data (as of ${after}) is older than the data on this page (as of ${before}).`);
 return warnings;
}

// server and ours: data packages (readDataPackage). Compares the applications by ID.
export function uploadWarnings(server,ours){
 const ids=pkg=>new Set((pkg?.data?.apps||[]).map(app=>String(app.ID).trim()));
 const before=ids(server),after=ids(ours),total=before.size,warnings=[];
 const added=[...after].filter(id=>!before.has(id)).length,removed=[...before].filter(id=>!after.has(id)).length;
 if(many(added,total,5))warnings.push(`This data has ${added} applications that the server data does not have.`);
 if(many(removed,total,3))warnings.push(`This data does not have ${removed} applications that the server data has; they would disappear for everyone.`);
 return warnings;
}

import {workspaceData} from './workspace.mjs';
import {cleanCorrections,recordKey} from './corrections.mjs';
import {cleanAcceptedRecords} from './accepted-records.mjs';
import {dataAsOf} from './data-as-of.mjs';
import {cleanReviewHistory} from './reviews.mjs';

// Data package (owner choice 2026-10-22, V14): no LeanIX API is available, so one data steward imports the LeanIX
// exports in the tool and publishes the result as logistics-data.json next to index.html on the IIS server. Every
// user's page then offers it with the usual change preview; nothing changes until the user applies it.
// A package carries the shared data only: the application inventory, the capability and process catalogues and the
// owner's decisions (mappings, records confirmed as recorded). Applying it replaces those parts and keeps each user's
// own review notes, pair reviews, score settings, history and their own mappings.
export const DATA_PACKAGE_FILE='logistics-data.json';
export const DATA_PACKAGE_FORMAT='logistics-portfolio-data-package';
const VERSION=1;

// Two 32-bit FNV-1a style lanes (64 bits) over the canonical payload text. Not a security measure: it names a package and detects a damaged
// or edited file. (crypto.subtle is unavailable on the http intranet page, so the tool computes it itself.)
export function fingerprint(text){
 let h1=0x811c9dc5,h2=0x01000193^0x5bd1e995;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,0x01000193)>>>0;h2=Math.imul(h2^c,0x01000193^0x9e37)>>>0;h2=(h2^(h1>>>7))>>>0;}
 return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}

// The shared parts of a workspace, cleaned exactly as a workspace import would clean them. The revocation notes of its
// mappings (reviewer and reason, V14 review) travel with them, so users see who revoked a mapping and why.
export function packagePayload(data){
 const clean=workspaceData(data),mappingIds=new Set(clean.corrections.map(c=>c.id));
 return {source:clean.source,taxonomySource:clean.taxonomySource,...(clean.inventoryExport?{inventoryExport:clean.inventoryExport}:{}),
  apps:clean.apps,capabilityRows:clean.capabilityRows,processRows:clean.processRows,corrections:clean.corrections,acceptedRecords:clean.acceptedRecords,
  mappingNotes:cleanReviewHistory(data?.mappingNotes??clean.reviewHistory).filter(note=>note.action==='revoke'&&mappingIds.has(note.mappingId))};
}
export const packageId=payload=>fingerprint(JSON.stringify(payload));

export function createDataPackage(data,{publishedAt=new Date().toISOString()}={}){
 const payload=packagePayload(data),asOf=dataAsOf(payload);
 return {format:DATA_PACKAGE_FORMAT,version:VERSION,id:packageId(payload),publishedAt:String(publishedAt),dataAsOf:asOf?.date||'',applications:payload.apps.length,data:payload};
}
export const dataPackageText=(data,options)=>JSON.stringify(createDataPackage(data,options),null,1);

// Reads a package from the server. Rejects anything that is not a package of this tool or whose content no longer
// matches its id (edited or damaged); the message says so and nothing is offered.
export function readDataPackage(value){
 const document=typeof value==='string'?(()=>{try{return JSON.parse(value);}catch{throw Error('The data package is not valid JSON.');}})():value;
 if(document?.format!==DATA_PACKAGE_FORMAT)throw Error('This file is not a data package of this tool.');
 if(document.version!==VERSION)throw Error(`Data package version ${document.version} is not supported by this edition.`);
 const payload=packagePayload(document.data);
 if(packageId(payload)!==document.id)throw Error('The data package was changed or damaged after it was published.');
 // The data date comes from the verified content, never from the header (which the id does not cover).
 return {id:document.id,publishedAt:String(document.publishedAt||''),dataAsOf:dataAsOf(payload)?.date||'',data:payload};
}

// The owner decisions after applying a package (V14 review). Every mapping the package carries is taken as the steward
// published it — revocations and replacements included — except that a mapping this user revoked stays revoked for
// them. Mappings that shipped with the release (releaseIds) are shared too: one the package leaves out stays unless the
// package decides the same record. Mappings that came with the previously applied package (previousIds, V14 review 3)
// are the steward's: one the new package leaves out was withdrawn by the steward and is removed. Only the remaining
// mappings are the user's own: they are kept, and where one of them is active the package's active mapping for that
// record is left out for this user. A record never ends up with two active mappings.
function mergedCorrections(current,published,releaseIds,previousIds){
 const local=new Map(current.map(c=>[c.id,c])),ids=new Set(published.map(c=>c.id)),unpublished=current.filter(c=>!ids.has(c.id)&&(releaseIds.has(c.id)||!previousIds.has(c.id)));
 const mine=unpublished.filter(c=>!releaseIds.has(c.id)),mineActive=new Set(mine.filter(c=>!c.revokedAt).map(recordKey));
 const shared=published.map(c=>{const own=local.get(c.id);return own?.revokedAt&&!c.revokedAt?{...c,revokedAt:own.revokedAt}:c;})
  .filter(c=>c.revokedAt||!mineActive.has(recordKey(c)));
 const sharedActive=new Set(shared.filter(c=>!c.revokedAt).map(recordKey));
 const release=unpublished.filter(c=>releaseIds.has(c.id)&&(c.revokedAt||!sharedActive.has(recordKey(c))&&!mineActive.has(recordKey(c))));
 return [...shared,...release,...mine];
}

// The workspace after applying a package: the shared parts come from the package — the inventory, the catalogues and
// the owner decisions (mappings as above, with their revocation notes; "confirmed as recorded" has no page of its own
// and comes from the package as it is). Review notes, pair reviews, score settings, history and the user's own
// mappings stay. releaseIds: the ids of the mappings bundled with this release (the page passes them).
export function applyDataPackage(current,pkg,{releaseIds=[]}={}){
 const base=workspaceData(current),payload=pkg.data,noteIds=new Set(base.reviewHistory.map(n=>n.id)),published=cleanCorrections(payload.corrections);
 const next={...base,source:payload.source,taxonomySource:payload.taxonomySource,apps:payload.apps,capabilityRows:payload.capabilityRows,processRows:payload.processRows,
  corrections:mergedCorrections(base.corrections,published,new Set(releaseIds),new Set(base.dataPackage?.mappingIds||[])),acceptedRecords:cleanAcceptedRecords(payload.acceptedRecords),
  reviewHistory:[...base.reviewHistory,...cleanReviewHistory(payload.mappingNotes).filter(n=>n.action==='revoke'&&!noteIds.has(n.id))],
  isAcceptanceSample:false,dataPackage:{id:pkg.id,publishedAt:pkg.publishedAt,dataAsOf:pkg.dataAsOf,mappingIds:published.map(c=>c.id)}};
 delete next.inventoryExport;if(payload.inventoryExport)next.inventoryExport=payload.inventoryExport;
 return workspaceData(next);
}

// The shared data compared without regard to the order of mappings and confirmations.
const sharedText=data=>{const p=packagePayload(data);return JSON.stringify({...p,corrections:[...p.corrections].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),acceptedRecords:p.acceptedRecords.map(d=>JSON.stringify(d)).sort()});};
// Offer a package only when applying it would change this user's shared data (V14 review: otherwise the preview has
// nothing to apply and the notice would never go away; right after applying it nothing would change, so it is not
// offered again), and never one whose data is older than the data the page shows (e.g. a server file left from before
// a release with newer bundled data). Both dates are the data's own dates (file name or LeanIX export time), not the
// date of an import; a package without a date is judged by its content only. The package the workspace was last
// updated from is never offered again (V14 review 3): a newer release can add fields for the same source on reload,
// and applying the package again would only strip them. File imports clear that marker (import-review.mjs).
export function packageIsNew(current,pkg,options){
 if(!current||current.dataPackage?.id===pkg.id)return false;
 const shown=dataAsOf(packagePayload(current))?.date||'';
 if(pkg.dataAsOf&&shown&&pkg.dataAsOf<shown)return false;
 return sharedText(applyDataPackage(current,pkg,options))!==sharedText(current);
}
// Whether kept work from a package should count as at least as new as data dated fileDate (an undated package does).
export const packageNotOlder=(dataPackage,fileDate)=>!!dataPackage&&!(fileDate&&dataPackage.dataAsOf&&dataPackage.dataAsOf<fileDate);

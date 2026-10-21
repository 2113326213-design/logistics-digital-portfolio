import {capCode} from './codes.mjs';
// Presentation only: canonical IDs and taxonomy records remain unchanged.
import {opportunityEligibility} from './scope.mjs';
import {formatAnnualCost} from './costs.mjs';
export const displayCode=value=>String(value??'').split('.').map((part,i)=>i>1&&/^\d+$/.test(part)?String(Number(part)):part).join('.');
export function displayName(node){
 const raw=String(node?.reference||node?.label||'');
 if(!raw||raw===node?.id)return 'Other ('+displayCode(node?.id||'')+')';
 return raw.replace(/^(?:[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+)\s+/i,'').replace(/(?:\s*[….]+\s*){2,}/g,' … ').replace(/\bMgmt\./gi,'Management').replace(/\s+/g,' ').trim();
}
export const displayRecordLabel=node=>`${displayCode(node?.id)} ${displayName(node)}`.trim();
const capabilityCandidates={
 'B.06.1.6':{name:'Supply Chain (Logistics) IT, Data & Innovation Management',source:'P41 / P74'},
 'B.06.1.7':{name:'Supply Chain (Logistics) Process Management',source:'P48 / P68'},
 'B.06.8.1':{name:'Supply Chain (Logistics) Standard Reporting Management',source:'P77'},
 'B.06.8.2':{name:'Supply Chain (Logistics) Visualization and Tracking Management',source:'P77'}
};
export function capabilityNameCandidate(node){
 const candidate=capabilityCandidates[node?.id];
 return candidate&&/[…]{2,}/.test(String(node?.reference||node?.label||''))?candidate:null;
}
export const capabilitySourceTitle=(node,raw,code)=>node?.reference||raw||displayCode(code);
export const annualLabel=app=>formatAnnualCost(app)+(formatAnnualCost(app)==='Not recorded'?'':' / year');
export const opportunityCostLabel=app=>scopeReason(app)?'Out of scope':annualLabel(app);
export function scopeReason(app){const r=opportunityEligibility(app);return r.eligible?'':r.reason.includes('not still active')?`Not still active (${String(app.statusNote).trim()})`:r.reason.includes('not an application')?'Not an application':r.reason.includes('not go-live')?'Not live':'Outside BBM scope';}

export function capabilityCatalogueNotice(raw,standard=false){
 const code=capCode(raw);
 if(!code)return 'Code could not be identified — check the source format.';
 if(!/^B\.06(?:\.|$)/.test(code))return 'Outside B.06 review scope — not covered by this catalogue. This does not mean the code is incorrect.';
 // With the business capability standard as catalogue, a B.06 code outside it is a record to correct (owner decision 2026-10-19).
 if(standard)return 'Not in the business capability standard — correct the record in LeanIX.';
 return 'Not found in the current catalogue — verify the code and catalogue coverage. No error is confirmed.';
}

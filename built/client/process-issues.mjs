import {maintenanceReport} from './overview.mjs';
import {reviewIssues,REVIEW_TEXT} from './review-issues.mjs';
import {matchSource} from './leanix-processes.mjs';

// Issues in the application profile (owner requests 2026-10-20): the profile lists exactly the open issues that the
// Overview To review uses for this application (public/review-issues.mjs), one line each: the original record (or
// the missing level) and one specific sentence. Records that match the catalogue, records resolved by an applied
// mapping and normal parent levels are not listed; a level without any record is listed as missing.
export const PROCESS_ISSUE_TEXT=Object.freeze({
 notMatched:REVIEW_TEXT.notMatched,
 multiple:REVIEW_TEXT.multiple,
 otherChain:REVIEW_TEXT.otherChain,
 noLevel:REVIEW_TEXT.noLevel,
 empty:REVIEW_TEXT.emptyProcesses
});

// One maintenance report per model and dimension (a model never changes once built).
const reports={cap:new WeakMap(),process:new WeakMap()};
const reportFor=(model,dimension)=>{const cache=reports[dimension];if(!cache.has(model))cache.set(model,maintenanceReport(model,{},dimension));return cache.get(model);};

// Each entry: raw = the original record ('' for a missing level), label = what the issue is, findings = one sentence.
export function applicationIssues(model,app,dimension){
 return reviewIssues(model,reportFor(model,dimension),app).map(issue=>({raw:issue.kind==='missing'?'':issue.record,label:issue.label,level:issue.level,kind:issue.kind,findings:[issue.text,...(issue.detail?[issue.detail]:[])]}));
}
export const processIssues=(model,app)=>applicationIssues(model,app,'process');
export const capabilityIssues=(model,app)=>applicationIssues(model,app,'cap');

function renderIssues(title,issues,esc){
 if(!issues.length)return '';
 return `<h4>${title} · <span>${issues.length}</span></h4><div class="profile-processes">${issues.map(({raw,label,findings})=>`<div class="profile-unlisted"><span class="profile-source-label">${esc(raw||label)}</span>${findings.map(text=>`<small class="profile-catalogue-note">${esc(text)}</small>`).join('')}</div>`).join('')}</div>`;
}
export const renderProcessIssues=(issues,esc)=>renderIssues('Process issues',issues,esc);
// Confirmed process matches with the record, the code, the level and the source that supports each match.
export function processMatchRows(model,app){return (app.processMatches||[]).map(m=>({raw:m.raw,...matchSource(model,m.id,m.via)})).filter(r=>r.id);}
export function renderProcessMatches(model,app,esc){
 const rows=processMatchRows(model,app);if(!rows.length)return '';
 return `<h4>Process matches · <span>${rows.length}</span></h4><div class="profile-processes">${rows.map(r=>`<div class="profile-unlisted"><span class="profile-source-label">${esc(r.raw)}</span><small class="profile-catalogue-note">${esc(`${r.id} · Level ${r.level} · ${r.name}`)}</small><small class="profile-catalogue-note">${esc(`Source: ${r.sources.join(' and ')}. ${r.note}`)}</small></div>`).join('')}</div>`;
}
export const renderCapabilityIssues=(issues,esc)=>renderIssues('Capability issues',issues,esc);

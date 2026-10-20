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

function renderIssues(title,issues,esc,dimension=''){
 if(!issues.length)return '';
 return `<h4>${title} · <span>${issues.length}</span></h4><div class="profile-processes">${issues.map(({raw,label,kind,findings})=>`<div class="profile-unlisted" data-issue-dimension="${esc(dimension)}" data-issue-record="${esc(raw)}" data-issue-kind="${esc(kind)}"><span class="profile-source-label">${esc(raw||label)}</span>${findings.map(text=>`<small class="profile-catalogue-note">${esc(text)}</small>`).join('')}</div>`).join('')}</div>`;
}
export const renderProcessIssues=(issues,esc)=>renderIssues('Process issues',issues,esc,'process');
// Confirmed process matches with the record, the code, the level and the source that supports each match.
export function processMatchRows(model,app){return (app.processMatches||[]).map(m=>({raw:m.raw,...matchSource(model,m.id,m.via)})).filter(r=>r.id);}
export function renderProcessMatches(model,app,esc){
 const rows=processMatchRows(model,app);if(!rows.length)return '';
 return `<h4>Process matches · <span>${rows.length}</span></h4><div class="profile-processes">${rows.map(r=>`<div class="profile-unlisted"><span class="profile-source-label">${esc(r.raw)}</span><small class="profile-catalogue-note">${esc(`${r.id} · Level ${r.level} · ${r.name}`)}</small><small class="profile-catalogue-note">${esc(`Source: ${r.sources.join(' and ')}. ${r.note}`)}</small></div>`).join('')}</div>`;
}
export const renderCapabilityIssues=(issues,esc)=>renderIssues('Capability issues',issues,esc,'cap');

// View details from a comparison (V9.15): mark the profile issues for the records the comparison counted and bring the
// first into view. A record registered too coarsely is listed in the profile as the missing level below it. The page
// behind the details keeps its scroll position. Returns the marked issues.
export function focusApplicationIssue(root,focus){
 if(!root?.querySelectorAll||!focus||typeof focus!=='object')return [];
 const wanted=Array.isArray(focus.records)&&focus.records.length?focus.records:[{dimension:focus.dimension,kind:focus.kind,raw:focus.record}];
 const items=[...root.querySelectorAll('[data-issue-record]')],same=(a,b)=>String(a??'').trim()===String(b??'').trim();
 const marked=[];
 for(const record of wanted){
  const inDimension=items.filter(item=>item.dataset.issueDimension===record?.dimension);
  let hits=inDimension.filter(item=>item.dataset.issueRecord&&same(item.dataset.issueRecord,record.raw));
  if(!hits.length&&record.kind==='More detail needed')hits=inDimension.filter(item=>item.dataset.issueKind==='missing').slice(0,1);
  for(const item of hits)if(!marked.includes(item))marked.push(item);
 }
 for(const item of marked)item.classList?.add('is-focused-issue');
 const first=marked[0]||items.find(item=>item.dataset.issueDimension===focus.dimension);
 if(first){
  const x=globalThis.scrollX||0,y=globalThis.scrollY||0;
  first.scrollIntoView?.({block:'center'});
  if((globalThis.scrollX||0)!==x||(globalThis.scrollY||0)!==y)globalThis.scrollTo?.(x,y);
 }
 return marked;
}

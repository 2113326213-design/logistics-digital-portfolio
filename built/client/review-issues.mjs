import {capCode} from './codes.mjs';
import {displayCode} from './display.mjs';
import {semanticConcerns} from './semantic-review.mjs';
import {nameDifferenceRows} from './name-differences.mjs';

// One issue result per application and dimension (owner specification 2026-10-20). The Overview To review counts,
// the To review list and the application detail all use it.
// Every applicable level is checked on the records actually registered (Business Capability L1–L3, Process L0–L3;
// parents are never inferred from the category tree):
//  - a level without any record is 'Level X missing' (and gets no further mismatch issue);
//  - every record at a level that does not pass the standard match is its own 'Level X match needs review' issue,
//    even when another record at that level passes.
// Open questions that are not tied to a level are added: records without a level or with an unreadable code, and,
// for capabilities, names that differ from the standard (standard catalogue only) and meanings to confirm.
// Records resolved by an applied mapping and names already accepted as equivalent are not issues. A record that the
// catalogue does not contain is a question to confirm, not a confirmed error, unless the owner decided otherwise.
export const REVIEW_TEXT=Object.freeze({
 notMatched:'No confirmed match in the current process catalogue.',
 notMatchedL3V:'Recorded as L3V; no Level 3 process of this name in the current catalogue. Confirmation is required.',
 multiple:'Multiple possible matches. Confirmation is required.',
 otherChain:'The name matches a process in another process chain. Confirmation is required.',
 noLevel:'No process level (L0–L3) recorded.',
 capabilityUnreadable:'The capability code could not be identified. Check the source format.',
 outsideB06:'Outside the B.06 review scope and not in the current catalogue. Confirm the business assignment; no error is confirmed.',
 notInStandard:'This code is not in the business capability standard. Correct the record in LeanIX.',
 notInCatalogue:'Not found in the current catalogue. Verify the code and catalogue coverage; no error is confirmed.',
 emptyProcesses:'No process information recorded.',
 emptyCapabilities:'No capability information recorded.'
});
const DIMENSION_LABEL={cap:'Business Capability',process:'Process'};
const missingText=(dimension,level)=>`No Level ${level} ${dimension==='cap'?'capability':'process'} recorded.`;

function processText(model,app,raw){
 const issue=model.issues.find(i=>i.appId===app.id&&i.value===raw&&i.type.startsWith('流程'));
 if(!issue)return REVIEW_TEXT.notMatched;
 if(issue.type==='流程未标注标准层级')return REVIEW_TEXT.noLevel;
 if(issue.type==='流程名称对应多个编号'||issue.candidates?.length>1)return REVIEW_TEXT.multiple;
 if(issue.type==='流程未匹配层级表')return /\bL3V\s*$/i.test(raw)?REVIEW_TEXT.notMatchedL3V:REVIEW_TEXT.notMatched;
 return REVIEW_TEXT.otherChain;
}
function capabilityText(model,raw){
 const code=capCode(raw);
 if(!code)return REVIEW_TEXT.capabilityUnreadable;
 if(!/^B\.06(?:\.|$)/.test(code))return REVIEW_TEXT.outsideB06;
 return model.standardCatalogue?REVIEW_TEXT.notInStandard:REVIEW_TEXT.notInCatalogue;
}

// report: a maintenanceReport (or {records, levelsAvailable, dimension}) for the same model and dimension.
export function reviewIssues(model,report,app){
 const dimension=report.dimension,isCap=dimension==='cap',records=report.records.get(app.id)||[],issues=[];
 const textFor=raw=>isCap?capabilityText(model,raw):processText(model,app,raw);
 // An empty field is one issue in the owner's wording, not one per level.
 if(!records.length)return [{dimension,level:null,kind:'missing',record:'',label:isCap?'Business capabilities':'Processes',text:isCap?REVIEW_TEXT.emptyCapabilities:REVIEW_TEXT.emptyProcesses}];
 for(const level of report.levelsAvailable){
  const atLevel=records.filter(r=>r.level===level);
  if(!atLevel.length){issues.push({dimension,level,kind:'missing',record:'',label:`Level ${level} missing`,text:missingText(dimension,level)});continue;}
  for(const r of atLevel)if(!r.valid)issues.push({dimension,level,kind:'match',record:r.raw,label:`Level ${level} match needs review`,text:textFor(r.raw)});
 }
 for(const r of records)if(r.level===null&&!r.valid)issues.push({dimension,level:null,kind:'record',record:r.raw,label:isCap?'Capability needs review':'Process level not specified',text:textFor(r.raw)});
 if(isCap){
  const listed=new Set(issues.map(i=>i.record).filter(Boolean));
  if(model.standardCatalogue)for(const d of nameDifferenceRows(model,app))if(!listed.has(d.raw))issues.push({dimension,level:d.code.split('.').length-1,kind:'record',record:d.raw,label:'Name differs from standard',text:`The standard name is "${d.standardName}". Correct the record in LeanIX.`});
  for(const c of semanticConcerns(app,model.correctionLog,model.caps))if(!listed.has(c.raw))issues.push({dimension,level:c.code.split('.').length-1,kind:'record',record:c.raw,label:'Meaning needs confirmation',text:`${displayCode(c.code)}: the recorded name "${c.sourceName}" differs from the current name "${c.standardName}". Business confirmation is required.`});
 }
 return issues;
}

// One line per issue: the record or the missing level, then one sentence.
export function issueLine(issue){return issue.kind==='missing'?`${issue.label} — ${issue.text}`:`${issue.label}: ${issue.record} — ${issue.text}`;}

export function renderIssueList(issues,esc,{title}={}){
 const head=title?`<h4>${esc(title)} · <span>${issues.length} ${issues.length===1?'issue':'issues'}</span></h4>`:'';
 if(!issues.length)return `${head}<p class="profile-empty profile-no-issues">No ${title?esc(title.replace(/ issues$/,'').toLowerCase())+' ':''}issues detected.</p>`;
 return `${head}<ul class="review-issue-list">${issues.map(i=>`<li class="review-issue ${i.kind}"><span class="review-issue-label">${esc(i.label)}</span>${i.record?`<span class="review-issue-record">${esc(i.record)}</span>`:''}<small class="review-issue-text">${esc(i.text)}</small></li>`).join('')}</ul>`;
}
export const dimensionLabel=dimension=>DIMENSION_LABEL[dimension];

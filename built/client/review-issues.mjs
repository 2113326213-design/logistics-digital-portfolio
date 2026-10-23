import {capCode} from './codes.mjs';
import {displayCode} from './display.mjs';
import {semanticConcerns} from './semantic-review.mjs';
import {nameDifferenceRows} from './name-differences.mjs';
import {STANDARD_SNAPSHOT,matchSource} from './leanix-processes.mjs';

// One issue result per application and dimension (owner specification 2026-10-20). The Overview To review counts,
// the To review list and the application detail all use it.
// Every applicable level is checked on the records actually registered (Business Capability L1–L3, Process L0–L3):
//  - a level without a record is full when a deeper level fully matches the standard (ancestorCoverage, fixed rule
//    2026-10-23); otherwise it is 'Level X missing';
//  - every record at a level that does not pass the standard match is its own 'Level X match needs review' issue,
//    even when another record at that level passes.
// Open questions that are not tied to a level are added: records without a level or with an unreadable code, and,
// for capabilities, names that differ from the standard (standard catalogue only) and meanings to confirm.
// Records resolved by an applied mapping, records the owner confirmed as recorded (accepted-records.mjs, V9.18) and
// names already accepted as equivalent are not issues. A record that the
// catalogue does not contain is a question to confirm, not a confirmed error, unless the owner decided otherwise.
export const REVIEW_TEXT=Object.freeze({
 notMatched:'No confirmed match in the current process catalogue.',
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
 // L3V is L3 (owner rule 2026-10-19, fixed 2026-10-23): the same text for both.
 if(issue.type==='流程未匹配层级表')return REVIEW_TEXT.notMatched;
 return REVIEW_TEXT.otherChain;
}
function capabilityText(model,raw){
 const code=capCode(raw);
 if(!code)return REVIEW_TEXT.capabilityUnreadable;
 if(!/^B\.06(?:\.|$)/.test(code))return REVIEW_TEXT.outsideB06;
 return model.standardCatalogue?REVIEW_TEXT.notInStandard:REVIEW_TEXT.notInCatalogue;
}

// Process checks name the sources and versions used (owner specification 2026-10-20).
const checkedAgainst=model=>`${STANDARD_SNAPSHOT.label}${model.leanix?.records?.length?`; ${model.leanix.label}, ${model.leanix.scope.chains.join(', ')} Level ${model.leanix.scope.levels.join('–')} only`:''}`;
const codeName=(model,id)=>{const n=model.procs.get(id);return n?`${id} ${n.label} (Level ${n.level})`:id;};
function processDetail(model,app,raw,kind){
 const issue=model.issues.find(i=>i.appId===app.id&&i.value===raw&&i.type.startsWith('流程'));
 const candidates=issue?.candidates?.map(c=>codeName(model,c.id))||[];
 const code=candidates.length?`Candidates: ${candidates.join('; ')}`:'Process code: not identified';
 const next=issue?.type==='流程未标注标准层级'?'Confirm which level (L0–L3) this process belongs to.'
  :candidates.length>1?'Confirm the business branch (parent process) to choose one code.'
  :candidates.length?'Confirm whether the record belongs to this process chain.'
  :'Check the name and the catalogue version; this does not show that the process does not exist.';
 return `${code} · Checked against: ${checkedAgainst(model)} · Next: ${next}`;
}
// A level the application did not record can still be traceable from a confirmed deeper record (a code's Level L
// ancestor is its first L+2 code parts). It is full only through ancestorCoverage; this only names the parent.
function traceableParent(model,app,level){
 for(const id of app.process){const n=model.procs.get(id);if(!n||n.level<=level)continue;const parent=id.split('.').slice(0,level+2).join('.');if(model.procs.has(parent))return {parent,from:n};}
 return null;
}
function orphanParent(model,app,level){
 for(const id of app.process){const n=model.procs.get(id);if(!n||n.level<=level)continue;const parent=id.split('.').slice(0,level+2).join('.');if(!model.procs.has(parent))return {parent,from:n};}
 return null;
}

// Fixed rule (owner, 2026-10-23, V18.1; "只要是最大级满分 小于他的子级全部满分"): a level with no record of its own
// counts as filled and matching the standard when a deeper level has records that all match the standard and the
// parent of each of them at this level is in the catalogue. Example: Level 1 missing and Level 2 matching → Level 1
// full; Level 2 missing and Level 3 matching → Levels 2, 1 and 0 full. Both Business Capability (L1–L3) and Process
// (L0–L3). A level with its own records is judged on them only: a matching deeper record never hides a failing direct
// one. The parent is the code's first parts (Capability B.06.1.4 → L2 B.06.1; Process M.I2D.010.050.020 → L0 M.I2D).
// Process (union, V19.1/V19.2): a LeanIX-only process, or a Signavio process whose parent the list lacks, still fills the
// levels above; only a capability needs its parent in the standard.
// Returns the evidence (record, code, parent) or [] when the level is not covered.
export function ancestorCoverage(model,report,app,level){
 const isCap=report.dimension==='cap',records=report.records.get(app.id)||[];
 if(!Number.isInteger(level)||records.some(r=>r.level===level))return [];
 const map=isCap?model.caps:model.procs,matched=new Map((app.processMatches||[]).map(m=>[m.raw,m.id]));
 const mappings=model.correctionLog.filter(c=>c.state==='Applied'&&c.appId===app.id&&c.dimension===report.dimension);
 const codeOf=r=>mappings.find(c=>c.raw===r.raw)?.targetId||(isCap?capCode(r.raw):matched.get(r.raw));
 // A process in LeanIX but not in the Signavio list (union, V19.1) matches, but has no Signavio code or parent.
 const inLeanix=new Set(isCap?[]:(app.inLeanix||[]).map(x=>x.raw));
 const inCatalogue=(node,at)=>!!node&&node.level===at&&(isCap?!!node.reference:!node.ambiguous);
 for(let deeper=level+1;deeper<=3;deeper++){
  const atDeeper=records.filter(r=>r.level===deeper);
  if(!atDeeper.length||atDeeper.some(r=>!r.valid))continue;
  const evidence=atDeeper.map(r=>{
   if(inLeanix.has(r.raw))return {raw:r.raw,code:null,parent:null,inLeanix:true};
   const code=codeOf(r),parent=code?.split('.').slice(0,isCap?level+1:level+2).join('.');
   if(!inCatalogue(map.get(code),deeper))return null;
   if(inCatalogue(map.get(parent),level))return {raw:r.raw,code,parent};
   // Union (V19.2): the parent of a matching process that the Signavio list lacks is in LeanIX, like the process itself,
   // so it fills this level just as a LeanIX-only process does. A capability's parent must be in the capability standard.
   return isCap?null:{raw:r.raw,code,parent:null,parentInLeanix:true};
  });
  if(evidence.every(Boolean))return evidence;
 }
 return [];
}
// Earlier names, kept for their callers: the same rule.
export const capabilityLevel2Coverage=(model,report,app)=>report.dimension==='cap'?ancestorCoverage(model,report,app,2):[];
export const processAncestorCoverage=(model,report,app,level)=>report.dimension==='process'?ancestorCoverage(model,report,app,level):[];
export const processLevel2Coverage=(model,report,app)=>processAncestorCoverage(model,report,app,2);
export const level2Coverage=(model,report,app)=>ancestorCoverage(model,report,app,2);

// report: a maintenanceReport (or {records, levelsAvailable, dimension}) for the same model and dimension.
export function reviewIssues(model,report,app){
 const dimension=report.dimension,isCap=dimension==='cap',records=report.records.get(app.id)||[],issues=[];
 const textFor=raw=>isCap?capabilityText(model,raw):processText(model,app,raw);
 // An empty field is one issue in the owner's wording, not one per level.
 if(!records.length)return [{dimension,level:null,kind:'missing',record:'',label:isCap?'Business capabilities':'Processes',text:isCap?REVIEW_TEXT.emptyCapabilities:REVIEW_TEXT.emptyProcesses}];
 for(const level of report.levelsAvailable){
  const atLevel=records.filter(r=>r.level===level);
  if(!atLevel.length){
   if(ancestorCoverage(model,report,app,level).length)continue;
   const traced=!isCap&&traceableParent(model,app,level),orphan=!isCap&&!traced&&orphanParent(model,app,level);
   if(orphan){issues.push({dimension,level,kind:'catalogue',record:'',label:`Level ${level} parent not in catalogue`,text:`The recorded process ${codeName(model,orphan.from.id)} has no Level ${level} parent (${orphan.parent}) in the catalogue, so the relationship cannot be confirmed. This is a catalogue question, not an application error.`,detail:`Checked against: ${checkedAgainst(model)} · Next: Confirm the parent in the valid process catalogue.`});continue;}
   issues.push({dimension,level,kind:'missing',record:'',label:`Level ${level} missing`,text:traced?`No Level ${level} process recorded directly. A Level ${level} parent can be traced: ${codeName(model,traced.parent)}, from the recorded ${codeName(model,traced.from.id)}. It counts as filled once every record at that deeper level matches the standard.`:missingText(dimension,level),...(isCap?{}:{traced:!!traced,detail:`Checked against: ${checkedAgainst(model)} · Next: ${traced?`Confirm whether a direct Level ${level} record is required.`:`Add the Level ${level} process if it applies.`}`})});
   continue;
  }
  for(const r of atLevel)if(!r.valid&&!r.accepted)issues.push({dimension,level,kind:'match',record:r.raw,label:`Level ${level} match needs review`,text:textFor(r.raw),...(isCap?{}:{detail:processDetail(model,app,r.raw)})});
 }
 for(const r of records)if(r.level===null&&!r.valid&&!r.accepted)issues.push({dimension,level:null,kind:'record',record:r.raw,label:isCap?'Capability needs review':'Process level not specified',text:textFor(r.raw),...(isCap?{}:{detail:processDetail(model,app,r.raw)})});
 // A matched code whose latest LeanIX name differs from the Signavio snapshot name is not an issue since V19.1: both names
 // are valid (union, owner decision 2026-10-23). Until V19 it was listed as "Process name differs between sources".
 if(isCap){
  const listed=new Set(issues.map(i=>i.record).filter(Boolean));
  if(model.standardCatalogue)for(const d of nameDifferenceRows(model,app))if(!listed.has(d.raw))issues.push({dimension,level:d.code.split('.').length-1,kind:'record',record:d.raw,label:'Name differs from standard',text:`The standard name is "${d.standardName}". Correct the record in LeanIX.`});
  for(const c of semanticConcerns(app,model.correctionLog,model.caps))if(!listed.has(c.raw))issues.push({dimension,level:c.code.split('.').length-1,kind:'record',record:c.raw,label:'Meaning needs confirmation',text:`${displayCode(c.code)}: the recorded name "${c.sourceName}" differs from the current name "${c.standardName}". Business confirmation is required.`});
 }
 return issues;
}

// One line per issue: the record or the missing level, then one sentence.
export function issueLine(issue){return issue.kind==='missing'||!issue.record?`${issue.label} — ${issue.text}`:`${issue.label}: ${issue.record} — ${issue.text}`;}

export function renderIssueList(issues,esc,{title}={}){
 const head=title?`<h4>${esc(title)} · <span>${issues.length} ${issues.length===1?'issue':'issues'}</span></h4>`:'';
 if(!issues.length)return `${head}<p class="profile-empty profile-no-issues">No ${title?esc(title.replace(/ issues$/,'').toLowerCase())+' ':''}issues detected.</p>`;
 return `${head}<ul class="review-issue-list">${issues.map(i=>`<li class="review-issue ${i.kind}"><span class="review-issue-label">${esc(i.label)}</span>${i.record?`<span class="review-issue-record">${esc(i.record)}</span>`:''}<small class="review-issue-text">${esc(i.text)}</small>${i.detail?`<small class="review-issue-detail">${esc(i.detail)}</small>`:''}</li>`).join('')}</ul>`;
}
export const dimensionLabel=dimension=>DIMENSION_LABEL[dimension];

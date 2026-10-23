import {annualCost} from './costs.mjs';
import {capCode,norm,compareNatural} from './codes.mjs';
import {displayCode,displayName} from './display.mjs';
import {english} from './english.mjs';
import {maintenanceReport} from './overview.mjs';
import {scopeReason} from './display.mjs';
import {reviewIssues} from './review-issues.mjs';
import {semanticConcerns} from './semantic-review.mjs';
import {nameDifferenceRows} from './name-differences.mjs';
import {acceptedText} from './accepted-records.mjs';
export {nameDifferenceRows};

const applied=(model,appId,dimension,raw)=>model.correctionLog.some(c=>c.state==='Applied'&&c.appId===appId&&c.dimension===dimension&&c.raw===raw);
// nameDifferenceRows lives in name-differences.mjs, shared with the To review issues.

// A missing level has its own line per level; a record has one line, whatever is found about it.
function addRow(rows,dimension,raw='',level){
 const key=JSON.stringify(level===undefined?[dimension,raw]:[dimension,raw,level]);
 if(!rows.has(key))rows.set(key,{dimension,raw,primary:'',tags:[],details:[]});
 return rows.get(key);
}
function addTag(row,label,detail=''){
 if(!row.tags.some(tag=>tag.label===label&&tag.detail===detail))row.tags.push({label,detail});
}
// Data checks list exactly the issues of Issues to review (review-issues.mjs: every level, and the name and catalogue
// questions), so the two parts of the application details never disagree (owner decision 2026-10-23, V18.1). Before,
// only Level 3 was checked here. Records the owner confirmed as recorded are not issues there, so not here either.
function addIssues(rows,model,app,dimension,report){
 const name=dimension==='cap'?'Business Capability':'Process';
 for(const issue of reviewIssues(model,report,app)){
  const emptyField=!issue.record&&issue.level===null;
  const row=issue.record?addRow(rows,dimension,issue.record):emptyField?addRow(rows,dimension,''):addRow(rows,dimension,'',issue.level);
  row.issue=true;
  // Already listed in the same words, or the empty field already listed by sourceRows.
  if(row.tags.some(tag=>tag.label===issue.label)||emptyField&&row.tags.length)continue;
  const label=emptyField?issue.text.replace(/\.$/,''):issue.label;
  if(!row.primary)row.primary=`${name}: ${label}`;else addTag(row,label);
  // The sentence says what was found where the label alone does not (a catalogue question, a traceable parent).
  if((issue.kind==='catalogue'||issue.traced)&&!row.tags.some(tag=>tag.detail))row.details.push(issue.text);
 }
}

function sourceRows(model,app){
 const rows=new Map(),appId=app.id;
 for(const raw of app.rawCap){
  if(applied(model,appId,'cap',raw))continue;
  const row=addRow(rows,'cap',raw),code=capCode(raw),node=code&&model.caps.get(code);
  if(!code){
   const issue=model.issues.find(item=>item.appId===appId&&item.value===raw&&item.type==='业务能力无法识别');
   if(issue)addTag(row,'Capability needs review','Code could not be identified. Check the source format.');
   continue;
  }
  if(!/^B\.06(?:\.|$)/.test(code)){
   // Other capability areas (B.01, B.05, …). HC records never get here: they belong to another company and are left
   // out of the model (owner decision 2026-10-22); Source records names them.
   addTag(row,'Outside B.06 review scope','Outside B.06 review scope and excluded from similarity. This does not establish an error; confirm the business assignment before changing it.');
  }else if(!node?.reference){
   // With the business capability standard as catalogue, a B.06 code outside it is a record to correct (owner decision
   // 2026-10-19); with another catalogue the catalogue itself may be incomplete.
   if(model.standardCatalogue)addTag(row,'Not in standard','This code is not in the business capability standard. Correct the record in LeanIX; it is not changed automatically.');
   else addTag(row,'Verify in LeanIX','Not found in the current catalogue. Verify the code and catalogue coverage; no error is confirmed.');
  }
 }
 for(const concern of semanticConcerns(app,model.correctionLog,model.caps)){
  const row=addRow(rows,'cap',concern.raw);
  addTag(row,'Meaning needs confirmation',`${displayCode(concern.code)} · LeanIX: "${concern.sourceName}" · Standard: "${concern.standardName}" · not used in similarity until confirmed.`);
 }
 for(const raw of app.rawProcess){
  if(applied(model,appId,'process',raw))continue;
  const decision=(app.accepted||[]).find(d=>d.dimension==='process'&&d.raw===raw);
  if(decision){addTag(addRow(rows,'process',raw),'Confirmed by owner as recorded',acceptedText(decision));continue;}
  const issue=model.issues.find(item=>item.appId===appId&&item.value===raw&&item.type.startsWith('流程'));
  if(!issue)continue;
  const row=addRow(rows,'process',raw);
  if(issue.type==='流程未标注标准层级')addTag(row,'Process level not specified');
  else if(issue.type==='流程名称对应多个编号'||issue.candidates?.length>1){
   const codes=[...new Set(issue.candidates.map(candidate=>displayCode(candidate.id)))];
   addTag(row,`Matches ${codes.length} standard codes`,codes.join(' / '));
  }else if(issue.type==='流程未匹配层级表')addTag(row,'No confirmed standard match',`Source: ${raw}. Check naming, level and catalogue coverage before changing the record.`);
  else addTag(row,'Process needs review',english(issue.type));
 }
 const hasEmptyMapping=app.rawProcess.length===0&&model.correctionLog.some(c=>c.state==='Applied'&&c.appId===appId&&c.dimension==='process'&&c.raw==='');
 if(app.rawProcess.length===0&&!hasEmptyMapping){
  const row=addRow(rows,'process','');
  addTag(row,english('未填写流程'));
 }
 return rows;
}

function mappedRows(model,app){
 return model.correctionLog.filter(c=>c.appId===app.id&&c.state==='Applied').map(c=>{
  const map=c.dimension==='cap'?model.caps:model.procs,node=map.get(c.targetId);
  return {dimension:c.dimension,raw:c.raw,targetId:c.targetId,targetName:node?displayName(node):displayCode(c.targetId),reviewer:c.reviewer,optionalUpdate:c.dimension==='process'&&/^BBM\s+PM\s+DM\b/i.test(c.raw)};
 }).sort((a,b)=>a.dimension.localeCompare(b.dimension)||a.raw.localeCompare(b.raw)||a.targetId.localeCompare(b.targetId));
}

export function dataChecksForApp(model,app,reports=null){
 const currentReports=reports||{cap:maintenanceReport(model,{},'cap'),process:maintenanceReport(model,{},'process')};
 const rows=sourceRows(model,app),nameDifferences=nameDifferenceRows(model,app);
 // With the business capability standard as catalogue, a recorded name that differs from the standard name of its
 // code is a record to correct (owner decision 2026-10-19); otherwise the difference is shown as provenance only.
 if(model.standardCatalogue)for(const difference of nameDifferences)addTag(addRow(rows,'cap',difference.raw),'Name differs from standard',`Standard name: "${difference.standardName}". Correct the record in LeanIX; it is not changed automatically.`);
 addIssues(rows,model,app,'cap',currentReports.cap);
 addIssues(rows,model,app,'process',currentReports.process);
 // Out of scope (no score, or not still active): not counted in the cost totals, so no cost check (V17.5 audit).
 if(annualCost(app).score===1&&!scopeReason(app)){const row=addRow(rows,'cost','');addTag(row,'Cost score 1','Counted as ¥200,000 / year; plant to confirm.');}
 // Only issues of Issues to review, the cost check, and records the owner confirmed (shown, not counted) are listed. A
 // record tagged here that Issues to review does not count (the same code recorded twice, a catalogued code outside
 // B.06) is left out, so the two lists stay the same for any data (V18.1 review).
 const confirmed=row=>row.tags.some(tag=>tag.label==='Confirmed by owner as recorded');
 const checks=[...rows.values()].filter(row=>(row.primary||row.tags.length)&&(row.dimension==='cost'||row.issue||confirmed(row))).sort((a,b)=>['cap','process','cost'].indexOf(a.dimension)-['cap','process','cost'].indexOf(b.dimension)||a.raw.localeCompare(b.raw));
 const mappings=mappedRows(model,app);
 // A record the owner confirmed as recorded is shown, but it is not something to check (V17.5 audit).
 const toCheck=checks.filter(row=>row.primary||row.tags.some(tag=>tag.label!=='Confirmed by owner as recorded'));
 return {checks,mappings,nameDifferences,n:toCheck.length,m:mappings.length,k:nameDifferences.length,standard:!!model.standardCatalogue};
}

export function dataChecksSummary(checks){
 if(checks.n===0&&checks.m===0&&checks.k===0&&!checks.checks?.length)return '';
 return `${checks.n} to check${checks.m?` · ${checks.m} mapped`:''}`;
}

function highlightNameDifferences(sourceName,standardName,esc){
 const tokenize=name=>[...name.matchAll(/[\p{L}\p{N}_]+|[^\s]/gu)].map(match=>({text:match[0],start:match.index,end:match.index+match[0].length}));
 const source=tokenize(sourceName),standard=tokenize(standardName);
 const lengths=Array.from({length:source.length+1},()=>new Uint32Array(standard.length+1));
 for(let i=source.length-1;i>=0;i--)for(let j=standard.length-1;j>=0;j--){
  lengths[i][j]=source[i].text.toLowerCase()===standard[j].text.toLowerCase()?1+lengths[i+1][j+1]:Math.max(lengths[i+1][j],lengths[i][j+1]);
 }
 const sourceMatches=new Set(),standardMatches=new Set();
 for(let i=0,j=0;i<source.length&&j<standard.length;){
  if(source[i].text.toLowerCase()===standard[j].text.toLowerCase()){sourceMatches.add(i++);standardMatches.add(j++);}
  else if(lengths[i+1][j]>=lengths[i][j+1])i++;
  else j++;
 }
 const render=(name,tokens,matches)=>{
  let html='',cursor=0;
  for(let i=0;i<tokens.length;i++){
   const start=tokens[i].start;
   html+=esc(name.slice(cursor,start));
   if(matches.has(i))html+=esc(tokens[i].text);
   else{
    while(i+1<tokens.length&&!matches.has(i+1))i++;
    html+=`<mark class="app-name-change">${esc(name.slice(start,tokens[i].end))}</mark>`;
   }
   cursor=tokens[i].end;
  }
  return html+esc(name.slice(cursor));
 };
 return {source:render(sourceName,source,sourceMatches),standard:render(standardName,standard,standardMatches)};
}

function renderNameDifference(row,esc){
 const shortenedSource=/…|\.{3}/.test(row.sourceName),shortenedStandard=/…|\.{3}/.test(row.standardName);
 // A shortened label does not provide enough wording for a reliable comparison.
 const names=shortenedSource||shortenedStandard?{source:esc(row.sourceName),standard:esc(row.standardName)}:highlightNameDifferences(row.sourceName,row.standardName,esc);
 return `<li class="app-name-card">
  <div class="app-name-heading"><span>Business Capability</span><code>${esc(displayCode(row.code))}</code></div>
  <dl class="app-name-fields">
   <div class="app-name-source"><dt>Original name <span>(LeanIX)</span></dt><dd>${names.source}</dd></div>
   <div class="app-name-standard"><dt>Standard name</dt><dd>${names.standard}</dd></div>
  </dl>
  ${shortenedSource||shortenedStandard?`<p class="app-name-note">${shortenedStandard?'Standard':'Original'} name shortened (…). Full wording is needed to compare differences.</p>`:''}
 </li>`;
}

export function renderDataChecks(checks,esc){
 const checkList=checks.checks.length?`<ul class="app-check-list">${checks.checks.map(row=>`<li data-check-dimension="${row.dimension}"><div class="app-check-labels">${row.primary?`<strong class="app-check-primary">${esc(row.primary)}</strong>`:''}${row.tags.map(tag=>`<span class="app-check-tag">${esc(tag.label)}</span>`).join('')}</div>${row.raw?`<span class="app-check-raw">${esc(row.raw)}</span>`:''}${row.tags.filter(tag=>tag.detail).map(tag=>`<span class="app-check-detail">${esc(tag.detail)}</span>`).join('')}${(row.details||[]).map(text=>`<span class="app-check-detail">${esc(text)}</span>`).join('')}</li>`).join('')}</ul>`:'';
 const mappingList=checks.mappings.length?`<section class="app-mapped-list"><h4>Applied mappings</h4><ul class="app-mapping-cards">${checks.mappings.map(row=>`
  <li class="app-mapping-card">
   <div class="app-mapping-heading"><span>${row.dimension==='cap'?'Business Capability':'Process'} mapping</span><span class="app-mapping-status">Applied</span></div>
   <dl class="app-mapping-fields">
    <div class="app-mapping-source"><dt>LeanIX source</dt><dd>${esc(row.raw||'Not provided')}</dd></div>
    <div class="app-mapping-target"><dt><span aria-hidden="true">↓</span> Mapped to</dt><dd><code>${esc(displayCode(row.targetId))}</code><strong>${esc(row.targetName)}</strong></dd></div>
   </dl>
   <div class="app-mapping-footer"><p>Reviewed by: <span>${esc(row.reviewer)}</span></p>${row.optionalUpdate?'<p class="app-mapping-note">Optional: update the source entry in LeanIX.</p>':''}</div>
  </li>`).join('')}</ul></section>`:'';
 const nameList=checks.k?`<details class="app-name-differences"><summary>Name differences (${checks.k})</summary><p class="app-name-guide">${checks.standard?'Recorded and standard names for the same code; highlighted words differ. Each is listed above as a check: correct the record in LeanIX.':'Original and standard names for the same code. Highlighted words differ; confirm the business meaning before changing either entry.'}</p><ul class="app-name-cards">${checks.nameDifferences.map(row=>renderNameDifference(row,esc)).join('')}</ul></details>`:'';
 return `${checkList}${mappingList}${nameList}`;
}

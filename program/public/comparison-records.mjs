import {capCode} from './codes.mjs';
import {displayCode,displayName} from './display.mjs';
import {english} from './english.mjs';
import {comparisonLevelText,comparedLevelText} from './pair-status.mjs';
import {quickDifference} from './explanations.mjs';

// Why a branch without coverage was not scored (V9.15). Only a too-coarse registration is missing detail: the target's
// own B.06-root / L0 branch, or a peer that registers only coarser levels. A branch held back by the other application's
// unconfirmed records, or by its missing records, is that record problem; it is listed once as such, not as detail.
export function branchGapCause(dimension,result,branch){
 if(branch.level<(dimension==='cap'?2:1))return {cause:'detail',owner:'target'};
 if(branch.reason==='对方在此分支仍有未确认的分类。')return {cause:'unconfirmed',owner:'peer'};
 if(branch.reason==='对方登记深度不足。'&&!result.peer.known.length)return {cause:result.peer.pending.length?'unconfirmed':result.peer.outside?.length?'outside':'missing',owner:'peer'};
 return {cause:'detail',owner:'peer'};
}

// "More detail needed" lists each too-coarse record once, under the application that registered it, whichever direction
// found it (V9.15). Branches and scores are unchanged; every branch stays in "How the score is calculated".
function detailGaps(dimension,results,gaps){
 const base=dimension==='cap'?2:1,entries=new Map(),kept=[],union=(list,nodes)=>{for(const node of nodes)if(!list.some(item=>item.id===node.id))list.push(node);};
 const classified=gaps.map(gap=>{
  const result=results[gap.side],branch=result.branches.find(item=>item.items===gap.items);
  const {cause,owner}=branch?branchGapCause(dimension,result,branch):{cause:'detail',owner:'target'};
  return {gap,branch,cause,owner,side:owner==='target'?gap.side:1-gap.side,records:owner==='target'?gap.items:gap.peerItems.filter(node=>node.level<base)};
 }).filter(item=>item.cause==='detail');
 const listed=new Set(classified.filter(item=>item.owner==='target').map(item=>item.side));
 for(const item of classified){
  const {gap,owner,side,records}=item;
  // A peer registered only coarser levels elsewhere: that registration is already listed from its own direction.
  if(!records.length){if(!(item.branch?.reason==='对方登记深度不足。'&&listed.has(side)))kept.push(gap);continue;}
  const key=JSON.stringify([side,records.map(node=>node.id).sort()]);
  if(!entries.has(key))entries.set(key,{side,items:[...records],peerItems:[],reasons:[],sources:[]});
  const entry=entries.get(key);
  union(entry.peerItems,owner==='target'?gap.peerItems:gap.items);
  if(owner==='target')entry.reasons.push(gap.reason);
  entry.sources.push(gap);
 }
 // Without the registering application's own branch the original branch entries are kept as they were.
 const merged=[...entries.values()].flatMap(({side,items,peerItems,reasons,sources})=>reasons.length?[{side,items,peerItems,reason:[...new Set(reasons)].join(' ')}]:sources);
 return [...merged,...kept].sort((a,b)=>a.side-b.side);
}

// Evidence presentation only. Similarity weights, eligibility and scores stay in
// their existing modules. Effective leaf codes may include applied mappings.
export function comparisonRecordEvidence(model,forward,reverse){
 const dimension=forward.dimension,map=dimension==='cap'?model.caps:model.procs;
 const scopes=[forward.target,forward.peer],labels=['Application A','Application B'];
 const same=scopes[0].known.filter(node=>scopes[1].known.some(other=>other.id===node.id));
 const compared=[forward.comparedTarget||scopes[0].known,forward.comparedPeer||scopes[1].known];
 const shared=compared[0].filter(node=>compared[1].some(other=>other.id===node.id)&&(dimension==='cap'?node.level>=2:node.level>0)).map(node=>({node,targetSources:node.sources||[node],peerSources:compared[1].find(other=>other.id===node.id).sources||[compared[1].find(other=>other.id===node.id)]}));
 const exact=same.filter(node=>dimension==='cap'?node.level>=2:node.level>0);
 const broader=[];
 for(const [side,result] of [forward,reverse].entries())for(const branch of result.branches)for(const node of branch.common){
  if(same.some(item=>item.id===node.id)||dimension==='process'&&node.level===0)continue;
  const details=branch.peerItems.find(item=>item.id===node.id)?.sources?.filter(item=>item.id!==node.id)||[];
  if(details.length&&!broader.some(match=>match.side===side&&match.node.id===node.id))broader.push({node,side,details:details.map(item=>map.get(item.id)||item)});
 }
 const sides=scopes.map((scope,side)=>{
  const pending=scope.pending.flatMap(record=>{
   // A capability node may carry a label registered by another application.
   // Prefer this application's literal source entry when its code is known.
   const raw=dimension==='cap'&&record.id&&!record.semantic?scope.app.rawCap.filter(value=>capCode(value)===record.id):[];
   return (raw.length?raw:[record.value]).map(value=>({raw:value||'Blank source record',reason:english(record.reason),candidates:record.candidates||[]}));
  });
  const unconfirmed=[...new Map(pending.map(record=>[JSON.stringify(record),record])).values()];
  const excluded=dimension==='cap'?scope.outside.flatMap(node=>{
   const raws=scope.app.rawCap.filter(value=>capCode(value)===node.id);
   return (raws.length?raws:[node.label||node.id]).map(raw=>({raw,reason:'Outside the B.06 comparison scope. This does not mean the code is incorrect.'}));
  }):[];
  return {app:scope.app,label:labels[side],unconfirmed,excluded,empty:!scope.known.length&&!scope.pending.length&&!scope.outside.length&&!excluded.length};
 });
 // When the other application of a direction records capabilities only outside B.06, none of this side's branches can
 // be compared. That is the outside-scope reason of the pair status, not missing detail (2026-10-20): such branches are
 // listed as not compared, with the outside records named, instead of 'Peer records are not detailed enough'. A branch held
 // back by this side's own registration (e.g. only the B.06 root) keeps its own reason.
 const outsideOnly=result=>dimension==='cap'&&!result.peer.known.length&&!result.peer.pending.length&&result.peer.outside?.length>0;
 const outsideReason=side=>{const other=sides[1-side];return `${other.app.Name} records capabilities only outside the B.06 comparison scope (${other.excluded.map(record=>record.raw).join('; ')}). This does not mean the code is incorrect.`;};
 const allGaps=[forward,reverse].flatMap((result,side)=>result.branches.filter(branch=>branch.coverage===null).map(branch=>{const outside=outsideOnly(result)&&branch.reason==='对方登记深度不足。';return {side,items:branch.items,outside,reason:outside?outsideReason(side):english(branch.reason),peerItems:result.peer.known.filter(node=>branch.items.some(item=>item.id===node.id||item.id.startsWith(node.id+'.')||node.id.startsWith(item.id+'.')))};}));
 const gaps=detailGaps(dimension,[forward,reverse],allGaps.filter(gap=>!gap.outside)),notCompared=allGaps.filter(gap=>gap.outside);
 // Describe the levels scored in either direction; unscored root-only evidence adds none.
 const levels=key=>[...new Set([...(forward[key]||[]),...(reverse[key]||[])])].sort((a,b)=>a-b);
 return {dimension,map,exact,shared,broader,sides,gaps,notCompared,levelText:comparisonLevelText({comparisonLevels:levels('comparisonLevels'),deferredLevels:levels('deferredLevels')}),comparedText:comparedLevelText({comparisonLevels:levels('comparisonLevels')}),deferred:[forward.deferredTarget||[],forward.deferredPeer||[]],projectionIssues:forward.projectionIssues||[],diff:quickDifference(forward,reverse)};
}

// covered: keys `${appId}|${dimension}|${raw}` of records already named by the single-pair "records to check" row;
// they are not listed again under Records not yet confirmed (V9.15).
export function renderComparisonRecords({model,cap,capBack,process,processBack,opened=new Set(),escape:esc,covered=new Set()}){
 const groups=[{label:'Capability',...comparisonRecordEvidence(model,cap,capBack)},{label:'Process',...comparisonRecordEvidence(model,process,processBack)}];
 const codeLabel=(node,map)=>`<code>${esc(displayCode(node.id))}</code> <span>${esc(displayName(map.get(node.id)||node))}</span> <small>Level ${node.level}</small>`;
 const list=(nodes,map)=>`<ul class="comparison-code-list">${nodes.map(node=>`<li>${codeLabel(node,map)}</li>`).join('')}</ul>`;
 const disclosure=(id,label,body,classes='')=>`<details class="comparison-record-disclosure ${classes}" id="${id}" ${opened.has(id)?'open':''}><summary>${label}</summary>${body}</details>`;
 const rawList=records=>`<ul class="unconfirmed-record-list">${records.map(record=>`<li><span class="record-evidence-label">Original record</span><p class="record-original">${esc(record.raw)}</p><p class="record-reason"><strong>Reason:</strong> ${esc(record.reason)}</p>${record.candidates?.length?`<p class="record-reason"><strong>Possible standard codes:</strong> ${record.candidates.map(node=>`<code>${esc(displayCode(node.id))}</code> ${esc(node.label)}`).join('; ')}</p>`:''}</li>`).join('')}</ul>`;
 const content=groups.map(group=>{
  const {label,map,shared,sides,gaps,notCompared,deferred}=group,prefix=`focusRecords${label}`;
  const open=side=>side.unconfirmed.filter(record=>!covered.has(`${side.app.id}|${group.dimension}|${record.raw}`));
  const pendingSides=sides.filter(side=>open(side).length).map(side=>({...side,unconfirmed:open(side)})),pending=pendingSides.reduce((sum,side)=>sum+side.unconfirmed.length,0);
  // An empty source and a fully confirmed source are different states. Only actual
  // pending records get a disclosure; missing registrations remain visible outside it.
  const missing=sides.filter(side=>side.empty).map(side=>`<p class="comparison-missing-records"><strong>${side.label} · ${esc(side.app.Name)}:</strong> No ${group.dimension==='cap'?'business capability':'process'} records supplied. This comparison has missing data.</p>`).join('');
  const unresolved=pending?disclosure(`${prefix}Pending`,`Records not yet confirmed (${pending}) <span class="comparison-disclosure-hint">· Open original records and reasons</span>`,`<div class="record-columns pending-record-columns${pendingSides.length===1?' has-one-side':''}">${pendingSides.map(side=>`<section><h6>${side.label} · ${esc(side.app.Name)} (${side.unconfirmed.length})</h6>${rawList(side.unconfirmed)}</section>`).join('')}</div>`,'unconfirmed-records'):'';
  const depth=gaps.length?disclosure(`${prefix}Depth`,`More detail needed for this comparison (${gaps.length})`,gaps.map(gap=>`<div class="comparison-depth-gap"><p><strong>Application ${gap.side===0?'A':'B'} records</strong></p>${list(gap.items,map)}<p><strong>Application ${gap.side===0?'B':'A'} records in this branch</strong></p>${gap.peerItems.length?list(gap.peerItems,map):'<p>No confirmed codes recorded in this branch.</p>'}<p class="record-reason"><strong>Reason:</strong> ${esc(gap.reason)}</p></div>`).join(''),'comparison-depth-gaps'):'';
  const outside=notCompared.length?disclosure(`${prefix}NotCompared`,`Not compared · outside the B.06 scope (${notCompared.length})`,notCompared.map(gap=>`<div class="comparison-depth-gap"><p><strong>Application ${gap.side===0?'A':'B'} records</strong></p>${list(gap.items,map)}<p class="record-reason"><strong>Reason:</strong> ${esc(gap.reason)}</p></div>`).join(''),'comparison-not-compared'):'';
  const excludedCount=sides.reduce((sum,side)=>sum+side.excluded.length,0);
  const excluded=excludedCount?disclosure(`${prefix}Excluded`,`Records outside this comparison (${excludedCount})`,sides.filter(side=>side.excluded.length).map(side=>`<p><strong>${side.label} · ${esc(side.app.Name)}</strong></p>${rawList(side.excluded)}`).join(''),'comparison-excluded'):'';
  const projection=group.projectionIssues.length?disclosure(`${prefix}Hierarchy`,`Standard hierarchy needs confirmation (${group.projectionIssues.length})`,group.projectionIssues.map(issue=>`<p><strong>Application ${issue.side===0?'A':'B'}</strong> · <code>${esc(displayCode(issue.id))}</code> · ${esc(issue.reason)}</p>`).join('')):'';
  const sharedItem=match=>`<li>${codeLabel(match.node,map)}${[match.targetSources,match.peerSources].some(nodes=>nodes.some(source=>source.id!==match.node.id))?`<div class="record-reason">${[match.targetSources,match.peerSources].map((sources,side)=>`<p><strong>Application ${side===0?'A':'B'} recorded:</strong> ${sources.map(node=>`<code>${esc(displayCode(node.id))}</code>`).join(', ')}</p>`).join('')}</div>`:''}</li>`;
  // Keep the first shared registrations visible without removing any evidence.
  const visibleShared=shared.slice(0,5),remainingShared=shared.slice(5);
  const sharedList=shared.length?`<ul class="comparison-code-list">${visibleShared.map(sharedItem).join('')}</ul>${remainingShared.length?disclosure(`${prefix}MoreShared`,`Show ${remainingShared.length} more shared ${remainingShared.length===1?'code':'codes'}`,`<ul class="comparison-code-list">${remainingShared.map(sharedItem).join('')}</ul>`,'comparison-record-more'):''}`:'<p>No shared confirmed codes at the compared levels.</p>';
  return `<section class="comparison-record-group"><h5>${label}</h5>${group.comparedText?`<p class="comparison-level-note">${esc(group.comparedText)}</p>`:''}<h6>Shared codes at compared level (${shared.length})</h6>${sharedList}${missing}${unresolved}${depth}${outside}${projection}${excluded}</section>`;
 }).join('');
 const uniqueGroups=groups.filter(group=>group.diff.targetOnly.length||group.diff.peerOnly.length);
 const uniqueCount=uniqueGroups.reduce((sum,group)=>sum+group.diff.targetOnly.length+group.diff.peerOnly.length,0);
 const unique=uniqueGroups.length?`<details class="similarity-secondary" id="focusUnique" ${opened.has('focusUnique')?'open':''}><summary>Records found in only one application (${uniqueCount})</summary><p class="comparison-note">Confirmed codes at the compared levels. Unconfirmed records, when present, have a separate expandable list above.</p>${uniqueGroups.map(({label,map,diff})=>`<h5>${label}</h5><div class="record-columns">${[{label:'Application A',app:cap.target.app,items:diff.targetOnly},{label:'Application B',app:cap.peer.app,items:diff.peerOnly}].filter(side=>side.items.length).map(side=>`<section><h6>${side.label} · ${esc(side.app.Name)} (${side.items.length})</h6>${list(side.items,map)}</section>`).join('')}</div>`).join('')}</details>`:'';
 return `<section class="shared-comparison"><h4>Shared codes and unconfirmed records</h4><p class="comparison-note">Confirmed codes below match the current standard catalogue. Expand additional records when needed.</p>${content}${unique}</section>`;
}

// Deferred detail is calculation evidence, so since V9.15 it is listed in How the score is calculated (single-pair and
// multi-application views) instead of the records box. Same records, projections and explanation; scores are unchanged.
export function renderDeferredEvidence({model,cap,capBack,process,processBack,opened=new Set(),id='focusDeferred',escape:esc}){
 const groups=[{label:'Capability',...comparisonRecordEvidence(model,cap,capBack)},{label:'Process',...comparisonRecordEvidence(model,process,processBack)}].filter(group=>group.deferred.some(items=>items.length));
 if(!groups.length)return '';
 const count=groups.reduce((sum,group)=>sum+group.deferred.reduce((total,items)=>total+items.length,0),0);
 const item=(node,map)=>`<li><code>${esc(displayCode(node.id))}</code> <span>${esc(displayName(map.get(node.id)||node))}</span> <small>Level ${node.level}</small><br><span>Compared under <code>${esc(displayCode(node.comparedId))}</code> · Level ${node.comparedLevel}</span></li>`;
 const body=groups.map(({label,map,sides,deferred,levelText})=>`<h5>${label}${levelText?' · '+esc(levelText):''}</h5>${deferred.map((items,side)=>items.length?`<p><strong>Application ${side===0?'A':'B'} · ${esc(sides[side].app.Name)}</strong></p><ul class="comparison-code-list">${items.map(node=>item(node,map)).join('')}</ul>`:'').join('')}`).join('');
 return `<details class="similarity-secondary comparison-deferred-evidence" id="${esc(id)}" ${opened.has(id)?'open':''}><summary>Deferred detail · not used in the score (${count})</summary><p>These source records are retained. Detailed comparison resumes when both applications have confirmed records at that level.</p>${body}</details>`;
}

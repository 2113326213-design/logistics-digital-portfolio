import {capCode} from './codes.mjs';
import {displayCode,displayName} from './display.mjs';
import {english} from './english.mjs';
import {comparisonLevelText} from './pair-status.mjs';
import {quickDifference} from './explanations.mjs';

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
 const gaps=[forward,reverse].flatMap((result,side)=>result.branches.filter(branch=>branch.coverage===null).map(branch=>({side,items:branch.items,reason:english(branch.reason),peerItems:result.peer.known.filter(node=>branch.items.some(item=>item.id===node.id||item.id.startsWith(node.id+'.')||node.id.startsWith(item.id+'.')))})));
 // Describe the levels scored in either direction; unscored root-only evidence adds none.
 const levels=key=>[...new Set([...(forward[key]||[]),...(reverse[key]||[])])].sort((a,b)=>a-b);
 return {dimension,map,exact,shared,broader,sides,gaps,levelText:comparisonLevelText({comparisonLevels:levels('comparisonLevels'),deferredLevels:levels('deferredLevels')}),deferred:[forward.deferredTarget||[],forward.deferredPeer||[]],projectionIssues:forward.projectionIssues||[],diff:quickDifference(forward,reverse)};
}

export function renderComparisonRecords({model,cap,capBack,process,processBack,opened=new Set(),escape:esc}){
 const groups=[{label:'Capability',...comparisonRecordEvidence(model,cap,capBack)},{label:'Process',...comparisonRecordEvidence(model,process,processBack)}];
 const codeLabel=(node,map)=>`<code>${esc(displayCode(node.id))}</code> <span>${esc(displayName(map.get(node.id)||node))}</span> <small>Level ${node.level}</small>`;
 const list=(nodes,map)=>`<ul class="comparison-code-list">${nodes.map(node=>`<li>${codeLabel(node,map)}</li>`).join('')}</ul>`;
 const rawList=records=>`<ul class="unconfirmed-record-list">${records.map(record=>`<li><span class="record-evidence-label">Original record</span><p class="record-original">${esc(record.raw)}</p><p class="record-reason"><strong>Reason:</strong> ${esc(record.reason)}</p>${record.candidates?.length?`<p class="record-reason"><strong>Possible standard codes:</strong> ${record.candidates.map(node=>`<code>${esc(displayCode(node.id))}</code> ${esc(node.label)}`).join('; ')}</p>`:''}</li>`).join('')}</ul>`;
 const content=groups.map(group=>{
  const {label,map,shared,broader,sides,gaps,deferred}=group;
  const pending=sides.reduce((sum,side)=>sum+side.unconfirmed.length,0);
  const unresolved=`<section class="unconfirmed-records"><h6>Records not yet confirmed (${pending})</h6><div class="record-columns pending-record-columns">${sides.map(side=>`<section><h6>${side.label} · ${esc(side.app.Name)}</h6>${side.unconfirmed.length?rawList(side.unconfirmed):`<p>${side.empty?'No '+(group.dimension==='cap'?'business capability':'process')+' records supplied.':'No unconfirmed records.'}</p>`}</section>`).join('')}</div></section>`;
  const depth=gaps.length?`<section class="comparison-depth-gaps"><h6>More detail needed for this comparison</h6>${gaps.map(gap=>`<div class="comparison-depth-gap"><p><strong>Application ${gap.side===0?'A':'B'} records</strong></p>${list(gap.items,map)}<p><strong>Application ${gap.side===0?'B':'A'} records in this branch</strong></p>${gap.peerItems.length?list(gap.peerItems,map):'<p>No confirmed codes recorded in this branch.</p>'}<p class="record-reason"><strong>Reason:</strong> ${esc(gap.reason)}</p></div>`).join('')}</section>`:'';
  const excluded=sides.some(side=>side.excluded.length)?`<section class="comparison-excluded"><h6>Records outside this comparison</h6>${sides.filter(side=>side.excluded.length).map(side=>`<p><strong>${side.label} · ${esc(side.app.Name)}</strong></p>${rawList(side.excluded)}`).join('')}</section>`:'';
  const deferredDetails=deferred.some(items=>items.length)?`<details class="comparison-deferred"><summary>Deferred detail · not used in the score</summary><p>These source records are retained. Detailed comparison resumes when both applications have confirmed records at that level.</p>${deferred.map((items,side)=>items.length?`<p><strong>Application ${side===0?'A':'B'} · ${esc(sides[side].app.Name)}</strong></p><ul class="comparison-code-list">${items.map(node=>`<li>${codeLabel(node,map)}<br><span>Compared under <code>${esc(displayCode(node.comparedId))}</code> · Level ${node.comparedLevel}</span></li>`).join('')}</ul>`:'').join('')}</details>`:'';
  const projection=group.projectionIssues.length?`<section><h6>Standard hierarchy needs confirmation</h6>${group.projectionIssues.map(issue=>`<p><strong>Application ${issue.side===0?'A':'B'}</strong> · <code>${esc(displayCode(issue.id))}</code> · ${esc(issue.reason)}</p>`).join('')}</section>`:'';
  const sharedList=shared.length?`<ul class="comparison-code-list">${shared.map(match=>`<li>${codeLabel(match.node,map)}${[match.targetSources,match.peerSources].some(nodes=>nodes.some(source=>source.id!==match.node.id))?`<div class="record-reason">${[match.targetSources,match.peerSources].map((sources,side)=>`<p><strong>Application ${side===0?'A':'B'} recorded:</strong> ${sources.map(node=>`<code>${esc(displayCode(node.id))}</code>`).join(', ')}</p>`).join('')}</div>`:''}</li>`).join('')}</ul>`:'<p>No shared confirmed codes at the compared levels.</p>';
  return `<section class="comparison-record-group"><h5>${label}</h5>${group.levelText?`<p class="comparison-level-note">${esc(group.levelText)}. ${deferred.some(items=>items.length)?'The score uses the common level; deeper detail is not scored yet.':''}</p>`:''}<h6>Shared codes at compared level (${shared.length})</h6>${sharedList}${deferredDetails}${unresolved}${depth}${projection}${excluded}</section>`;

 }).join('');
 const uniqueGroups=groups.filter(group=>group.diff.targetOnly.length||group.diff.peerOnly.length);
 const unique=uniqueGroups.length?`<details class="similarity-secondary" id="focusUnique" ${opened.has('focusUnique')?'open':''}><summary>Records found in only one application</summary><p class="comparison-note">Confirmed codes at the compared levels. Unconfirmed records are listed above.</p>${uniqueGroups.map(({label,map,diff})=>`<h5>${label}</h5><div class="record-columns"><section><h6>Application A · ${esc(cap.target.app.Name)}</h6>${diff.targetOnly.length?list(diff.targetOnly,map):'<p>No additional confirmed codes.</p>'}</section><section><h6>Application B · ${esc(cap.peer.app.Name)}</h6>${diff.peerOnly.length?list(diff.peerOnly,map):'<p>No additional confirmed codes.</p>'}</section></div>`).join('')}</details>`:'';
 return `<section class="shared-comparison"><h4>Shared codes and unconfirmed records</h4><p class="comparison-note">Confirmed codes below match the current standard catalogue. Broader-level matches and records still needing confirmation are shown separately.</p>${content}${unique}</section>`;
}

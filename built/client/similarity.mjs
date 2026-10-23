import {compareNatural} from './codes.mjs';
// Directional coverage by distinct maintained codes; branches only organize evidence.
// Classification labels come from the user's selected taxonomy in buildModel.
import {semanticConcerns} from './semantic-review.mjs';
export function createSimilarity(model,dimension){
 if(!['cap','process'].includes(dimension))throw Error('请选择业务能力或流程');
 const map=dimension==='cap'?model.caps:model.procs,baseLevel=dimension==='cap'?2:1;
 const inScope=id=>dimension!=='cap'||id==='B.06'||id.startsWith('B.06.');
 const ancestor=(a,b)=>a===b||b.startsWith(a+'.');
 const byId=(a,b)=>compareNatural(a.id,b.id);
 const scopes=new Map(),cache=new Map();
 function atLevel(node,level){
  const seen=new Set();
  while(node&&node.level>level&&!seen.has(node.id)&&!node.ambiguous){seen.add(node.id);node=map.get(node.parent);}
  return node&&!node.ambiguous&&node.level===level?node:null;
 }
 function partitions(nodes){
  const groups=new Map();
  for(const node of nodes){const root=atLevel(node,Math.min(baseLevel,node.level));const key=root?.id||node.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);}
  function split(root,items){
   const levels=new Set(items.map(n=>n.level));
   if(levels.size===1)return [{id:root,label:map.get(root)?.label||root,level:items[0].level,items:items.toSorted(byId)}];
   const children=new Map(),nextLevel=(map.get(root)?.level??Math.min(...levels))+1;
   for(const n of items){const child=atLevel(n,Math.min(nextLevel,n.level));const key=child?.id||n.id;if(!children.has(key))children.set(key,[]);children.get(key).push(n);}
   return [...children].flatMap(([id,ns])=>split(id,ns));
  }
  return [...groups].flatMap(([id,ns])=>split(id,ns));
 }
 for(const app of model.apps){
  const known=[],outside=[],pending=[];
  const concerns=dimension==='cap'?semanticConcerns(app,model.correctionLog||[],model.caps):[];
  const concernCodes=new Set(concerns.map(concern=>concern.code));
  for(const concern of concerns)pending.push({id:concern.code,value:concern.raw,reason:`Source meaning “${concern.sourceName}” differs from the current capability name “${concern.standardName}”; business confirmation is pending.`,semantic:true});
  for(const id of app[dimension+'Leaf']){
   const node=map.get(id);
   if(concernCodes.has(id))continue;
   if(!inScope(id)){outside.push(node||{id,label:id,level:id.split('.').length-1});continue;}
   if(!node||node.ambiguous||(dimension==='cap'&&!node.reference)){pending.push({id,value:node?.label||id,reason:'分类表没有可确认的标准编号'});continue;}
   known.push(node);
  }
  // A process in LeanIX but not in the Signavio list matches (union, owner decision 2026-10-23, V19.1: "也按并集"): like a
  // record the owner confirmed, it is not pending; it has no Signavio code, so it adds no comparison evidence either.
  const inLeanix=new Set(dimension==='process'?(app.inLeanix||[]).map(x=>x.raw):[]);
  for(const issue of model.issues.filter(i=>i.appId===app.id&&i.type.startsWith(dimension==='cap'?'业务能力':'流程')&&!inLeanix.has(i.value))){
   pending.push({value:issue.value,reason:issue.type,candidates:issue.candidates||[],chain:issue.value.match(/^BBM\s+PM\s+([A-Z0-9]+)/i)?.[1]});
  }
  const levels=[...new Set(known.map(n=>n.level))].sort();
  scopes.set(app.id,{app,known,pending,outside,levels,deepest:Math.max(-1,...levels),coarse:levels.some(l=>l<3),branches:partitions(known),semanticConcerns:concerns});
 }
 function related(p,branch){
  // Unresolved process names do not establish a reliable scope boundary.
  if(dimension==='process')return true;
  if(p.id)return ancestor(branch.id,p.id)||ancestor(p.id,branch.id);
  if(p.candidates?.length)return p.candidates.some(n=>ancestor(branch.id,n.id)||ancestor(n.id,branch.id));
  if(p.chain)return branch.id.split('.')[1]===p.chain;
  return true;
 }
 // Compare each lineage at the shallower depth either application records in it,
 // without changing source registrations. Unrelated branches keep their own
 // registered level and stay in the denominator, so a peer's depth elsewhere
 // never changes them. Only real taxonomy ancestors may supply a projection;
 // root-only evidence is never promoted into detail.
 function align(target,peer){
  const floor=baseLevel,issues=[];
  const projected=[target,peer].map(scope=>scope.known.map(node=>({...node,sources:[{id:node.id,label:node.label,level:node.level}]})));
  const union=projected.flat();
  const compared=projected.map((nodes,side)=>{
   const unique=new Map();
   for(const node of nodes){
    const coarse=union.filter(other=>other.level>=floor&&other.level<node.level&&ancestor(other.id,node.id)).sort((a,b)=>a.level-b.level)[0];
    const parent=coarse?atLevel(node,coarse.level):node;
    if(coarse&&(!parent||parent.id!==coarse.id||dimension==='cap'&&!parent.reference))issues.push({side,id:node.sources[0].id,label:node.sources[0].label,level:node.sources[0].level,targetLevel:coarse.level,reason:'A unique taxonomy ancestor is missing; this record cannot be compared at the common level.'});
    const value=parent&&(dimension!=='cap'||parent.reference)&&(!coarse||parent.id===coarse.id)?parent:node;
    if(!unique.has(value.id))unique.set(value.id,{...value,sources:[]});
    for(const source of node.sources)if(!unique.get(value.id).sources.some(item=>item.id===source.id))unique.get(value.id).sources.push(source);
   }
   return [...unique.values()].sort(byId);
  });
  const deferred=compared.map(nodes=>nodes.flatMap(node=>node.sources.filter(source=>source.level>node.level).map(source=>({...source,comparedId:node.id,comparedLevel:node.level}))));
  return {comparedTarget:compared[0],comparedPeer:compared[1],deferredTarget:deferred[0],deferredPeer:deferred[1],comparisonLevels:[...new Set(compared.flat().map(node=>node.level))].sort((a,b)=>a-b),deferredLevels:[...new Set(deferred.flat().map(node=>node.level))].sort((a,b)=>a-b),depthAdjusted:deferred.some(items=>items.length>0),projectionIssues:issues};
 }
 function compare(targetId,peerId){
  if(targetId===peerId)throw Error('请选择两个不同应用');
  const key=JSON.stringify([targetId,peerId]);if(cache.has(key))return cache.get(key);
  const target=scopes.get(targetId),peer=scopes.get(peerId);
  if(!target||!peer)throw Error('请选择有效应用');
  const alignment=align(target,peer),{comparedTarget,comparedPeer,projectionIssues}=alignment;
  const branches=partitions(comparedTarget).map(branch=>{
   const projected=new Map();
   for(const n of comparedPeer){const p=atLevel(n,branch.level);if(p&&ancestor(branch.id,p.id)){if(!projected.has(p.id))projected.set(p.id,{...p,sources:[]});projected.get(p.id).sources.push(...n.sources);}}
   const common=branch.items.filter(n=>projected.has(n.id)),onlyTarget=branch.items.filter(n=>!projected.has(n.id));
   const coarse=comparedPeer.filter(n=>n.level<branch.level&&branch.items.some(item=>ancestor(n.id,item.id)));
   const unresolved=peer.pending.filter(p=>related(p,branch));
   // Extra unresolved peer records cannot undo a confirmed match for every
   // maintained target code in this directional comparison.
   // A shared L0 chain identifies a process area, not a confirmed function.
   const reason=dimension==='cap'&&branch.level<2?'The target records only the B.06 root; an L2 or deeper capability is needed for this comparison.':dimension==='process'&&branch.level===0?'The target records only this L0 process chain; an L1 or deeper record is needed to confirm a functional match.':common.length===branch.items.length?'':peer.deepest<baseLevel?'对方登记深度不足。':coarse.length?'对方在此分支只登记到更粗层级。':unresolved.length?'对方在此分支仍有未确认的分类。':'';
   return {...branch,common,onlyTarget,peerItems:[...projected.values()].sort(byId),coverage:reason?null:common.length/branch.items.length,reason};
  });
  const unavailable=branches.filter(b=>b.coverage===null);
  const onlyL0Process=dimension==='process'&&target.deepest===0;
  const semanticHold=dimension==='cap'&&(target.semanticConcerns.length||peer.semanticConcerns.length);
  const status=semanticHold||projectionIssues.length?'needs-review':target.pending.length||!target.known.length?'needs-review':!peer.known.length?'needs-review':unavailable.length?(unavailable.length===branches.length&&(onlyL0Process||peer.deepest<Math.min(...target.levels))?'insufficient-depth':'partial'):'comparable';
  // Each target code at the compared level counts once, regardless of branch.
  // Keep incomplete comparisons unavailable instead of shrinking the denominator.
  const targetCount=new Set(comparedTarget.map(n=>n.id)).size;
  const commonCount=new Set(branches.filter(b=>b.coverage!==null).flatMap(b=>b.common.map(n=>n.id))).size;
  const coverage=status==='comparable'?commonCount/targetCount:null;
  const branchReasons=[...new Set(unavailable.map(b=>b.reason))];
  const noBranch=branchReasons.length===1?branchReasons[0]:'No branch can be compared yet; see the branch details.';
  const reason=semanticHold?'The original capability name differs from the current standard name in one or both applications; business confirmation is pending.':projectionIssues.length?'A unique taxonomy ancestor is missing; common-level comparison cannot be completed.':target.pending.length?'目标应用仍有未确认的分类。':!target.known.length?'目标没有可比较的登记。':!peer.known.length?'对方没有可比较的登记。':onlyL0Process?'Target process evidence stops at L0; an L1 or deeper record is needed to confirm a functional match.':unavailable.length===branches.length&&branches.length?noBranch:unavailable.length?'部分分支信息不足，保留已知分支结果。':'';
  // Levels and deferred detail describe only branches that were actually scored;
  // root-only or unavailable branches are not reported as compared.
  const scored=branches.filter(b=>b.coverage!==null),scoredIds=new Set(scored.flatMap(b=>[...b.items,...b.peerItems].map(n=>n.id)));
  const comparisonLevels=[...new Set(scored.map(b=>b.level))].sort((a,b)=>a-b);
  const deferredLevels=[...new Set([...alignment.deferredTarget,...alignment.deferredPeer].filter(source=>scoredIds.has(source.comparedId)).map(source=>source.level))].sort((a,b)=>a-b);
  const result={dimension,target,peer,...alignment,comparisonLevels,deferredLevels,depthAdjusted:deferredLevels.length>0,branches,coverage,commonCount,targetCount,status,reason,comparableBranches:branches.length-unavailable.length,hasSourceNameDifferences:dimension==='cap'&&[...target.known,...peer.known].some(n=>n.hasNameDifference)};
  cache.set(key,result);return result;
 }
 function peers(targetId,relation='all'){
  const target=scopes.get(targetId);if(!target)return [];
  return model.apps.filter(a=>a.id!==targetId&&(relation==='all'||(relation==='same'?a.Entity===target.app.Entity:a.Entity!==target.app.Entity))).map(a=>compare(targetId,a.id)).sort((a,b)=>(b.coverage??-1)-(a.coverage??-1)||compareNatural(a.peer.app.Name,b.peer.app.Name));
 }
 return {dimension,scopes,compare,peers};
}

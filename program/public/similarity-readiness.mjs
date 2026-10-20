import {capCode,compareNatural} from './codes.mjs';
import {DATA_TO_CONFIRM,pairResultLabel} from './pair-status.mjs';

const pendingKinds=new Set(DATA_TO_CONFIRM);
const related=(a,b)=>a===b||a.startsWith(b+'.')||b.startsWith(a+'.');
const sourceRecords=(scope,dimension)=>scope.app?.[dimension==='cap'?'rawCap':'rawProcess'];
function recordsForNode(scope,dimension,node){
 const raw=sourceRecords(scope,dimension)||[];
 const matches=dimension==='cap'?raw.filter(value=>capCode(value)===node.id)
  :(scope.app.processMatches||[]).filter(match=>match.id===node.id).map(match=>match.raw);
 // A known catalogue code is reliable evidence even when a fixture or mapping does not retain its source text.
 return matches.length?matches:[node.id];
}

// Attribute unavailable weighted evidence to its source application, never to the healthy application it was
// compared with. This is a comparison-readiness queue, not the broader maintenance checklist: an unfilled level
// that does not prevent this comparison is deliberately absent. Source records, pair labels and scores stay intact.
export function comparisonReadiness(pairs,threshold=50){
 const apps=new Map(),seenPairs=new Set();
 let pairCount=0,unattributedPairCount=0;
 for(const pair of pairs){
  if(pair.status==='excluded'||!pendingKinds.has(pairResultLabel(pair,threshold)))continue;
  const ids=[pair.target?.app?.id,pair.peer?.app?.id];
  const pairKey=pair.key||(ids.every(Boolean)?JSON.stringify(ids.sort()):pair);
  if(seenPairs.has(pairKey))continue;
  seenPairs.add(pairKey);pairCount++;
  let attributed=false;
  const add=(app,dimension,kind,raw,reason)=>{
   if(!app?.id)return;
   attributed=true;
   if(!apps.has(app.id))apps.set(app.id,{app,pairs:new Set(),kinds:new Set(),records:new Map()});
   const row=apps.get(app.id),record={dimension,kind,raw:String(raw??''),reason};
   row.pairs.add(pairKey);row.kinds.add(kind);
   row.records.set(JSON.stringify([dimension,kind,record.raw,reason]),record);
  };
  for(const direction of [pair.forward,pair.reverse]){
   for(const component of direction.components||[]){
    if(!(component.weight>0)||component.score!==null)continue;
    const dimension=component.key;
    if(dimension==='name'||dimension==='description'){
     const field=dimension==='name'?'Name':'Description',text=component.text;
     for(const [side,scope] of [[0,direction.target],[1,direction.peer]]){
      const app=scope?.app,value=app?.[field];
      // Undefined evidence is not proof of an empty field. Preserve an unattributed pair if its origin is unknown.
      if(typeof value!=='string')continue;
      if(!value.trim())add(app,dimension,'Data missing',value,`${field} is not recorded.`);
      else if(text&&Array.isArray(text.shared)&&Array.isArray(text[side?'peerOnly':'targetOnly'])
       &&!text.shared.length&&!text[side?'peerOnly':'targetOnly'].length){
       add(app,dimension,'Needs confirmation',value,`${field} contains no comparable words.`);
      }
     }
     continue;
    }
    if(dimension!=='cap'&&dimension!=='process')continue;
    const result=component.result;
    if(!result)continue;
    const scopes=[result.target,result.peer],label=dimension==='cap'?'Capability':'Process';
    for(const [side,scope] of scopes.entries()){
     if(!scope?.app)continue;
     const known=scope.known||[],pending=scope.pending||[],outside=scope.outside||[],raw=sourceRecords(scope,dimension);
     for(const record of pending)add(scope.app,dimension,'Needs confirmation',record.value??record.id??'',record.reason||`${label} needs confirmation.`);
     if(Array.isArray(raw)&&!raw.length&&!known.length&&!pending.length&&!outside.length){
      add(scope.app,dimension,'Data missing','',`${label} is not recorded.`);
     }
     if(dimension==='cap'&&outside.length&&!known.length&&!pending.length){
      for(const node of outside)for(const value of recordsForNode(scope,dimension,node)){
       add(scope.app,dimension,'Needs confirmation',value,'Capabilities are recorded only outside the B.06 comparison scope. Confirm the intended comparison scope; this does not establish a record error.');
      }
     }
     if(dimension==='cap'&&known.length&&known.every(node=>node.level<2)){
      for(const node of known)for(const value of recordsForNode(scope,dimension,node)){
       add(scope.app,dimension,'More detail needed',value,'Capability is recorded only at the B.06 root; a Level 2 or deeper record is needed.');
      }
     }
     if(dimension==='process'){
      const unavailable=(result.branches||[]).filter(branch=>branch.coverage===null);
      for(const node of known.filter(node=>node.level===0)){
       const rootOnly=known.every(item=>item.level===0);
       const affectsBranch=unavailable.some(branch=>related(branch.id,node.id)
        ||(branch.items||[]).some(item=>related(item.id,node.id)));
       if(!rootOnly&&!affectsBranch)continue;
       for(const value of recordsForNode(scope,dimension,node)){
        add(scope.app,dimension,'More detail needed',value,'This process chain is recorded only at Level 0; a Level 1 or deeper record is needed.');
       }
      }
     }
     for(const issue of (result.projectionIssues||[]).filter(issue=>issue.side===side)){
      if(!issue.id)continue;
      const node=known.find(node=>node.id===issue.id)||{id:issue.id};
      const reason=(issue.reason||'A unique taxonomy ancestor is missing.')
       +(Number.isInteger(issue.targetLevel)?` Comparison requires Level ${issue.targetLevel}.`:'');
      for(const value of recordsForNode(scope,dimension,node))add(scope.app,dimension,'Needs confirmation',value,reason);
     }
    }
   }
  }
  if(!attributed)unattributedPairCount++;
 }
 return {
  apps:[...apps.values()].map(row=>({
   app:row.app,pairCount:row.pairs.size,
   kinds:DATA_TO_CONFIRM.filter(kind=>row.kinds.has(kind)),
   records:[...row.records.values()].sort((a,b)=>compareNatural(a.dimension,b.dimension)||compareNatural(a.kind,b.kind)||compareNatural(a.raw,b.raw)||compareNatural(a.reason,b.reason))
  })).sort((a,b)=>b.pairCount-a.pairCount||compareNatural(a.app.Name,b.app.Name)||compareNatural(a.app.id,b.app.id)),
  pairCount,unattributedPairCount
 };
}

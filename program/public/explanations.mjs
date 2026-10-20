import {english} from './english.mjs';
const unique=nodes=>[...new Map(nodes.map(n=>[n.id,n])).values()];
export function explainResult(r){
 if(r.dimension==='weighted')return r.reason;
 if(r.target.pending.length)return `Target has ${r.target.pending.length} unconfirmed classifications: ${english(r.target.pending[0].value)} (${english(r.target.pending[0].reason)}).`;
 if(!r.target.known.length)return r.dimension==='cap'?'Target has no comparable B.06 records.':'Target has no matched process records.';
 if(!r.peer.known.length)return r.peer.pending.length?`Peer classification is unconfirmed: ${english(r.peer.pending[0].value)}.`:'Peer has no comparable records.';
 if(r.coverage===null){
  const b=r.branches.find(b=>b.coverage===null);
  if(!b)return english(r.reason);
  if(b.reason.includes('深度')||b.reason.includes('粗层级')){
   const related=r.peer.known.filter(n=>b.items.some(item=>item.id===n.id||item.id.startsWith(n.id+'.')));
   const level=related.length?Math.max(...related.map(n=>n.level)):r.peer.deepest;
   return `${b.id}: Target records reach L${b.level}; ${level>=0?'peer records reach only L'+level:'peer has no confirmed records'}. Detailed coverage cannot be confirmed.`;
  }
  return `${b.id}: ${english(b.reason)}${r.comparableBranches?' Known branch results are available below.':''}`;
 }
 return `${r.commonCount} shared codes / ${r.targetCount} target codes; ${r.targetCount-r.commonCount} target-only records.`;
}
export function quickDifference(a,b){
 const known=r=>r.branches.filter(branch=>branch.coverage!==null);
 return {common:unique(known(a).flatMap(branch=>branch.common)),targetOnly:unique(known(a).flatMap(branch=>branch.onlyTarget)),peerOnly:unique(known(b).flatMap(branch=>branch.onlyTarget)),partial:a.coverage===null||b.coverage===null};
}

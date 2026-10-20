import {meetsThreshold,scorePoints} from './score-values.mjs';
import {capCode} from './codes.mjs';
// Distinguish absent source data from unresolved or intentionally deferred detail.
// A pair result never changes once built, so its missing evidence is worked out once per pair object.
const missingCache=new WeakMap();
export function missingPairEvidence(pair){
 if(missingCache.has(pair))return missingCache.get(pair);
 const result=[];
 for(const direction of [pair.forward,pair.reverse])for(const component of direction.components||[]){
  if(!component.weight||component.score!==null)continue;
  const key=component.key,label=key==='cap'?'Capability':component.label||key;
  if(key==='name'||key==='description'){
   const field=key==='name'?'Name':'Description';
   const blank=[direction.target.app,direction.peer.app].some(app=>!String(app[field]||'').trim());
   result.push({kind:blank?'Data missing':'Needs confirmation',label,reason:blank?`${label} is not recorded.`:`${label} contains no comparable words.`});
   continue;
  }
  const evidence=component.result;
  if(!evidence){result.push({kind:'Needs confirmation',label,reason:`${label} needs confirmation.`});continue;}
  const scopes=[evidence.target,evidence.peer];
  const blank=scopes.some(scope=>!(key==='cap'?scope.app.rawCap:scope.app.rawProcess)?.length&&!scope.known?.length&&!scope.pending?.length);
  const unresolved=scopes.some(scope=>scope.pending?.length);
  const l0=key==='process'&&scopes.some(scope=>scope.deepest===0);
  const capabilityRoot=key==='cap'&&scopes.some(scope=>scope.known?.length&&scope.deepest<2);
  // A chain recorded only at L0 beside deeper chains is a detail gap, not an unconfirmed code.
  const gaps=(evidence.branches||[]).filter(branch=>branch.coverage===null);
  const l0Chain=key==='process'&&!l0&&evidence.status!=='needs-review'&&gaps.length>0&&gaps.every(branch=>branch.level===0||(evidence.comparedPeer||[]).some(node=>node.level===0&&branch.id.startsWith(node.id+'.')));
  const outsideOnly=key==='cap'?scopes.find(scope=>scope.outside?.length&&!scope.known?.length&&!scope.pending?.length):null;
  const kind=blank?'Data missing':unresolved?'Needs confirmation':l0||capabilityRoot||l0Chain?'More detail needed':'Needs confirmation';
  const outsideIds=new Set(outsideOnly?.outside.map(node=>node.id)),outsideRecords=outsideOnly?(outsideOnly.app.rawCap||[]).filter(value=>outsideIds.has(capCode(value))):[];
  const outsideReason=outsideOnly&&`${outsideOnly.app.Name} records capabilities only outside the B.06 comparison scope (${(outsideRecords.length?outsideRecords:[...outsideIds]).join('; ')}). This does not mean the code is incorrect.`;
  result.push({kind,label,reason:blank?`${label} is not recorded.`:l0&&!unresolved?'Process is recorded only at Level 0.':l0Chain&&!unresolved?'Some process chains are recorded only at Level 0; a Level 1 or deeper record is needed in those chains.':capabilityRoot&&!unresolved?'Capability is recorded only at the B.06 root; a Level 2 or deeper record is needed.':outsideOnly&&!unresolved?outsideReason:`${label} needs confirmation.`});
 }
 const unique=Object.freeze([...new Map(result.map(item=>[JSON.stringify(item),item])).values()]);
 missingCache.set(pair,unique);return unique;
}

// One status rule for every place a pair appears: the single-pair header and summary, the candidate list, Other
// results, the multi-application comparison and the CSV (owner request 2026-10-20). It keeps four situations apart:
// a complete score below the threshold, no complete score, no shared registrations, and data still to be confirmed
// (Data missing / Needs confirmation / More detail needed). Below threshold never means confirmed different.
export const PAIR_STATES=Object.freeze(['Potential overlap','Below threshold','No complete score','No shared registrations','Data missing','Needs confirmation','More detail needed','Out of scope']);
export const DATA_TO_CONFIRM=Object.freeze(['Data missing','Needs confirmation','More detail needed']);
export function pairResultLabel(pair,threshold=50){
 if(pair.status==='confirmed')return meetsThreshold(pair.coverage,threshold)?'Potential overlap':'Below threshold';
 if(pair.status==='excluded')return 'Out of scope';
 const missing=missingPairEvidence(pair);
 if(missing.some(item=>item.kind==='Data missing'))return 'Data missing';
 if(missing.some(item=>item.kind==='Needs confirmation'))return 'Needs confirmation';
 if(missing.length)return 'More detail needed';
 if(pair.status==='investigation'){
  const codeComponents=[pair.forward,pair.reverse].flatMap(result=>(result.components||[]).filter(component=>['cap','process'].includes(component.key)&&component.weight>0));
  return codeComponents.length&&codeComponents.every(component=>component.score!==null&&component.result?.commonCount===0)?'No shared registrations':'No complete score';
 }
 return 'Needs confirmation';
}

// A No complete score pair has no pair score because its weighted name and description share no word, but its
// capability and process evidence is complete in both directions. Its code evidence is the lower directional total, to
// which the text fields contribute nothing; it is shown beside the status and is never a pair score.
export function codeEvidenceScore(pair){
 if(pairResultLabel(pair)!=='No complete score')return null;
 if(!pair.forward.components.some(c=>(c.key==='cap'||c.key==='process')&&c.weight>0))return null;
 return pair.directionalMinimum??null;
}
const oneDecimal=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
export const formatCodeEvidence=value=>oneDecimal.format(scorePoints(value))+' / 100';
const zeroTextFields=pair=>pair.forward.components.filter(c=>(c.key==='name'||c.key==='description')&&c.weight>0).map(c=>c.key==='name'?'names':'descriptions').join(' or ');
const codeFields=pair=>pair.forward.components.filter(c=>(c.key==='cap'||c.key==='process')&&c.weight>0).map(c=>c.key==='cap'?'capabilities':'processes').join(' and ');

// One explanation for a pair without a full score, shared by the UI hint and the CSV.
export function pairStatusReason(pair,threshold=50,scopeReason=()=>''){
 if(pair.status==='excluded')return 'Not in similarity check – '+[...new Set([scopeReason(pair.target.app),scopeReason(pair.peer.app)].filter(Boolean))].join('; ');
 const missing=missingPairEvidence(pair);
 if(missing.length)return [...new Set(missing.map(item=>item.reason))].join(' · ');
 if(pair.status==='investigation'){
  if(pairResultLabel(pair,threshold)==='No shared registrations')return `No shared words in ${zeroTextFields(pair)} and no shared ${codeFields(pair).replace(" and "," or ")}.`;
  const code=codeEvidenceScore(pair);
  return `No shared words in ${zeroTextFields(pair)}; compare the recorded functions.${code===null?'':' Code evidence '+formatCodeEvidence(code)+' from '+codeFields(pair)+'; not a pair score.'}`;
 }
 return pair.reason||'The available records need confirmation.';
}

// The one-sentence meaning of the status, shown under it wherever a single pair is explained.
export function pairStateNote(pair,threshold=50,scopeReason=()=>''){
 const label=pairResultLabel(pair,threshold),score=pair.status==='confirmed'?oneDecimal.format(scorePoints(pair.coverage)):'';
 if(label==='Potential overlap')return `Score ${score} is at or above the current threshold of ${threshold}. Shared registrations and words do not confirm duplicate functions.`;
 if(label==='Below threshold')return `Score ${score} is below the current threshold of ${threshold}. This does not mean the applications are confirmed to be different.`;
 if(label==='No complete score')return `There is no complete score: ${pairStatusReason(pair,threshold,scopeReason)}`;
 if(label==='No shared registrations')return `There is no complete score: ${pairStatusReason(pair,threshold,scopeReason)} This reflects the current registrations only; the actual functions may still overlap.`;
 if(label==='Out of scope')return pairStatusReason(pair,threshold,scopeReason)+'.';
 return `There is no complete score until the data is confirmed: ${pairStatusReason(pair,threshold,scopeReason)}`;
}

export function comparisonLevelText(result){
 const levels=result?.comparisonLevels;
 if(!levels?.length)return '';
 const compared=`Compared at ${levels.map(level=>'Level '+level).join(' / ')}`;
 const deferred=result.deferredLevels||[];
 return compared+(deferred.length?`; ${deferred.some(level=>levels.includes(level))?'Some ':''}${deferred.map(level=>'Level '+level).join(' / ')} detail deferred`:'');
}

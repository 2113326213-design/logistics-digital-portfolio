import {compareNatural} from './codes.mjs';
import {createSimilarity} from './similarity.mjs';
import {explainResult} from './explanations.mjs';
import {opportunityEligibility} from './scope.mjs';
import {meetsThreshold} from './score-values.mjs';
export const DEFAULT_WEIGHTS=Object.freeze({name:0.1,description:0.2,cap:0.3,process:0.4});
export const WEIGHT_LABELS={name:'Name',description:'Description',cap:'Business Capability',process:'Process'};
export function cleanWeights(value=DEFAULT_WEIGHTS){
 const result=Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map(k=>[k,value?.[k]]));
 if(Object.values(result).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||!Object.values(result).some(n=>n>0))throw Error('Weights must be between 0 and 1, with at least one greater than 0.');
 return result;
}
export function normalizeWeights(value){const raw=cleanWeights(value),sum=Object.values(raw).reduce((a,b)=>a+b,0);return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/sum]));}
// Filter ordinary English glue words from descriptions, but retain names and
// domain acronyms such as IT, CAN, TO, AGV and Karis.
const DESCRIPTION_STOP_WORDS=new Set('a an and are as at be been being by can for from has have in is it of on or that the this to was were which with'.split(' '));
const DOMAIN_ACRONYMS=new Set(['IT','TO','CAN']);
// A variation selector only picks a glyph; it never makes a different word. It is removed before NFKC so that it
// cannot stop a letter from composing with its mark or hide the "(recovered …)" suffix.
const plainText=text=>String(text??'').replace(/\p{Variation_Selector}/gu,'').normalize('NFKC');
const tokens=(text,stopWords=false)=>{
 const source=stopWords?plainText(text).replace(/(?:https?:\/\/|www\.)\S+/gi,' '):plainText(text);
 const words=source.replace(/([a-z])([A-Z])/g,'$1 $2').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)||[];
 return new Set(words.filter(word=>!stopWords||!DESCRIPTION_STOP_WORDS.has(word.toLowerCase())||DOMAIN_ACRONYMS.has(word)).map(word=>word.toLowerCase()));
};
// Names: a single letter (such as the P split from plant codes like QinP or WxP, or the w of "AGR w/ Camera") is not a
// word, and the LeanIX "(recovered <timestamp>)" suffix is not part of the name (owner decision 2026-10-19). Single
// digits and single Chinese characters remain words. The source names are unchanged.
const RECOVERED_SUFFIX=/\(\s*recovered\b[^)]*\)/gi;
const singleLetter=word=>/^\p{L}\p{M}*$/u.test(word)&&!/^\p{Script=Han}/u.test(word);
const nameTokens=text=>new Set([...tokens(plainText(text).replace(RECOVERED_SUFFIX,' '))].filter(word=>!singleLetter(word)));
// Each application's text is compared with every other application, so its words are worked out once per text.
const wordCache={name:new Map(),description:new Map()};
const wordsOf=(text,description)=>{const cache=description?wordCache.description:wordCache.name,key=String(text??'');if(!cache.has(key)){if(cache.size>5000)cache.clear();cache.set(key,description?tokens(key,true):nameTokens(key));}return cache.get(key);};
export function textEvidence(left,right,{description=false}={}){
 const a=wordsOf(left,description),b=wordsOf(right,description),shared=[...a].filter(t=>b.has(t)),all=new Set([...a,...b]);
 return {score:a.size&&b.size?shared.length/all.size:null,shared,unionCount:all.size,targetOnly:[...a].filter(t=>!b.has(t)),peerOnly:[...b].filter(t=>!a.has(t))};
}
export function textOverlap(left,right){return textEvidence(left,right).score;}
export function createWeightedSimilarity(model,rawWeights=DEFAULT_WEIGHTS){
 const weights=normalizeWeights(rawWeights),cap=createSimilarity(model,'cap'),process=createSimilarity(model,'process'),cache=new Map(),pairCache=new Map();
 const scopes=new Map(model.apps.map(app=>[app.id,{app,levels:[],known:[],pending:[]} ]));
 function compare(a,b){
 const key=JSON.stringify([a,b]);if(cache.has(key))return cache.get(key);
 const target=scopes.get(a),peer=scopes.get(b);if(!target||!peer)return null;
 const capResult=cap.compare(a,b),processResult=process.compare(a,b);
 const text={name:textEvidence(target.app.Name,peer.app.Name),description:textEvidence(target.app.Description,peer.app.Description,{description:true})};
 const scores={name:text.name.score,description:text.description.score,cap:capResult.coverage,process:processResult.coverage};
 const reasons={name:'Name is missing.',description:'Description is missing.',cap:explainResult(capResult),process:explainResult(processResult)};
 const components=Object.keys(weights).map(key=>({key,label:WEIGHT_LABELS[key],weight:weights[key],score:scores[key],contribution:scores[key]===null?null:scores[key]*weights[key],reason:scores[key]===null?reasons[key]:'',text:text[key]||null,result:key==='cap'?capResult:key==='process'?processResult:null}));
 const missing=components.filter(c=>c.weight>0&&c.score===null),evidenceWeight=components.filter(c=>c.weight>0&&c.score!==null).reduce((sum,c)=>sum+c.weight,0);
 const knownPoints=components.reduce((sum,c)=>sum+(c.contribution??0),0),coverage=missing.length?null:knownPoints;
 const missingWeight=missing.reduce((sum,c)=>sum+c.weight,0);
 const result={dimension:'weighted',target,peer,weights,components,coverage,knownPoints,evidenceWeight,missingWeight,reason:missing.length?'Incomplete: '+missing.map(c=>c.label).join(', ')+'. Known points are not a full similarity score.':'Weighted text overlap and directional code coverage.',branches:[],comparableBranches:0};
 cache.set(key,result);return result;
 }
 function pair(a,b){
  if(a===b)throw Error('Choose two different applications.');
  const key=JSON.stringify([a,b]);if(pairCache.has(key))return pairCache.get(key);
  const forward=compare(a,b),reverse=compare(b,a);if(!forward||!reverse)return null;
  const target=forward.target,peer=forward.peer;
  const eligibility=[opportunityEligibility(target.app),opportunityEligibility(peer.app)];
  // Only name/description fields that carry weight can hold a pair back (owner decision 2026-10-19).
  const textFields=forward.components.filter(c=>(c.key==='name'||c.key==='description')&&c.weight>0);
  const zeroText=textFields.length>0&&textFields.every(c=>c.score===0);
  const complete=forward.coverage!==null&&reverse.coverage!==null;
  const status=!eligibility.every(x=>x.eligible)?'excluded':zeroText?'investigation':complete?'confirmed':'incomplete';
  const directionalMinimum=complete?Math.min(forward.coverage,reverse.coverage):null;
  const coverage=status==='confirmed'?directionalMinimum:null;
  const reason=status==='excluded'?eligibility.filter(x=>!x.eligible).map(x=>x.reason).join(' '):status==='investigation'?(textFields.length===2?'Name and description both have zero overlap':textFields[0].label+' has zero overlap')+'; investigate the underlying function before treating this as an opportunity.':status==='incomplete'?'One or both directions lack weighted evidence; no full pair score is available.':'The opportunity score is the lower of the two confirmed directional totals.';
  const result={dimension:'weighted-pair',target,peer,forward,reverse,coverage,directionalMinimum,status,eligible:status==='confirmed',zeroText,scopeEligible:eligibility.every(x=>x.eligible),reason,key:[a,b].sort().join('::')};
  pairCache.set(key,result);return result;
 }
 function pairPeers(id,relation='all'){const source=scopes.get(id)?.app;if(!source)return [];return model.apps.filter(a=>a.id!==id&&(relation==='all'||(relation==='same'?a.Entity===source.Entity:a.Entity!==source.Entity))).map(a=>pair(id,a.id)).sort((a,b)=>{
  const rank={confirmed:0,incomplete:1,investigation:2,excluded:3};return rank[a.status]-rank[b.status]||(b.coverage??-1)-(a.coverage??-1)||compareNatural(a.peer.app.Name,b.peer.app.Name);
 });}
 function pairs(){const result=[];for(let i=0;i<model.apps.length;i++)for(let j=i+1;j<model.apps.length;j++)result.push(pair(model.apps[i].id,model.apps[j].id));return result;}
 function peers(id,relation='all'){return pairPeers(id,relation).map(r=>r.forward);}
 return {scopes,compare,peers,pair,pairPeers,pairs};
}

// Compute each unordered pair once. A directional total is not an opportunity
// score until both directions are confirmed and the source records are eligible.
export function portfolioCandidates(index){
 return {apps:[...index.scopes.values()].map(({app})=>app),pairs:index.pairs()};
}
export function portfolioAtThreshold(candidates,thresholdPercent){
 if(!Number.isFinite(thresholdPercent)||thresholdPercent<0||thresholdPercent>100)throw Error('Enter a threshold from 0 to 100.');
 const confirmedPairs=candidates.pairs.filter(pair=>pair.status==='confirmed'&&meetsThreshold(pair.coverage,thresholdPercent)).sort((a,b)=>b.coverage-a.coverage||a.key.localeCompare(b.key));
 const byApp=new Map();
 for(const result of confirmedPairs)for(const app of [result.target.app,result.peer.app]){
  const prior=byApp.get(app.id);if(!prior||result.coverage>prior.score){byApp.set(app.id,{app,peer:result.target.app.id===app.id?result.peer.app:result.target.app,score:result.coverage,result});}
 }
 const confirmed=[...byApp.values()].sort((a,b)=>b.score-a.score||compareNatural(a.app.Name,b.app.Name)||a.app.id.localeCompare(b.app.id));
 const incompletePairs=candidates.pairs.filter(pair=>pair.status==='incomplete');
 const investigationPairs=candidates.pairs.filter(pair=>pair.status==='investigation');
 const excludedPairs=candidates.pairs.filter(pair=>pair.status==='excluded');
 const excludedApps=candidates.apps.map(app=>({app,...opportunityEligibility(app)})).filter(row=>!row.eligible);
 return {totalApps:candidates.apps.length,eligibleApps:candidates.apps.length-excludedApps.length,excludedApps,thresholdPercent,confirmed,confirmedPairs,pairCount:confirmedPairs.length,confirmedCount:confirmed.length,incompletePairs,investigationPairs,excludedPairs};
}

export function belowThresholdConfirmedPairs(pairs,thresholdPercent){
 if(!Number.isFinite(thresholdPercent)||thresholdPercent<0||thresholdPercent>100)throw Error('Enter a threshold from 0 to 100.');
 return pairs.filter(pair=>pair.status==='confirmed'&&!meetsThreshold(pair.coverage,thresholdPercent));
}

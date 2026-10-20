import {pairResultLabel,pairStateNote,missingPairEvidence} from './pair-status.mjs';
import {meetsThreshold,scorePoints} from './score-values.mjs';
import {displayName} from './display.mjs';

// Guided comparison (owner request 2026-10-20): a business summary of one pair, built only from the recorded
// fields and the existing score evidence. Nothing here changes scores, labels or source data.
export const PAIR_REVIEW_STATUSES=Object.freeze(['Pending review','Overlap confirmed','Complementary','Different purposes','Related environments']);
const points=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(scorePoints(value));
const clean=text=>String(text??'').trim().replace(/\s+/g,' ');

// The first sentence of the original description, shortened; never invented.
export function purposeLine(app){
 const text=clean(app?.Description);if(!text)return 'Not provided';
 const sentence=text.match(/^.{20,260}?[.!?。](?=\s|$)/)?.[0]||text;
 return sentence.length>260?sentence.slice(0,257).trimEnd()+'…':sentence;
}

// Score, state and comparison level, kept apart (complete score / what the evidence shows / human review).
// Since 2026-10-20 this follows the one status rule of pair-status.mjs (the single-pair summary that used it was removed).
export function pairState(pair,threshold){
 return {score:pair.status==='confirmed'?`${points(pair.coverage)} / 100`:null,state:pairResultLabel(pair,threshold),note:pairStateNote(pair,threshold)};
}

// 'Capability at L2 · Process at L3', saying when finer levels were not compared.
export function comparisonLevels(pair){
 const part=(key,label)=>{const r=pair.forward.components.find(c=>c.key===key)?.result;const levels=r?.comparisonLevels||[];if(!levels.length)return `${label} not compared`;return `${label} at ${levels.map(l=>'L'+l).join('/')}${r.deferredLevels?.length?` (L${r.deferredLevels.join('/L')} detail not compared)`:''}`;};
 return `${part('cap','Capability')} · ${part('process','Process')}`;
}

// A description that names the other application is a sourced relationship clue (never inferred from names).
export function relationshipClue(a,b){
 for(const [x,y] of [[a,b],[b,a]]){
  const name=clean(y?.Name),text=clean(x?.Description);
  if(name.length<4||!text)continue;
  const at=text.toLowerCase().indexOf(name.toLowerCase());
  if(at>=0)return `The description of ${x.Name} mentions ${y.Name}: "…${text.slice(Math.max(0,at-60),at+name.length+60).trim()}…"`;
 }
 return '';
}

const sharedNames=(pair,key)=>{const r=pair.forward.components.find(c=>c.key===key)?.result;return [...new Map((r?.branches||[]).filter(b=>b.coverage!==null).flatMap(b=>b.common).map(n=>[n.id,displayName(n)])).values()];};
const onlyNames=(pair,key,side)=>{const d=side==='a'?pair.forward:pair.reverse;const r=d.components.find(c=>c.key===key)?.result;return [...new Map((r?.branches||[]).filter(b=>b.coverage!==null).flatMap(b=>b.onlyTarget).map(n=>[n.id,displayName(n)])).values()];};

// The five business questions of a comparison. issuesFor(app) returns the To review issues of one application
// (both dimensions) so data gaps here are the same issues as in Overview → To review.
export function compareSummary(pair,threshold,{issuesFor=()=>[]}={}){
 const a=pair.target.app,b=pair.peer.app,place=app=>[app.Entity||'Plant not provided',app.Division||'Business unit not provided'].join(' · ');
 const each=[{app:a,purpose:purposeLine(a),place:place(a)},{app:b,purpose:purposeLine(b),place:place(b)}];
 const common=[];
 const caps=sharedNames(pair,'cap'),procs=sharedNames(pair,'process');
 if(procs.length)common.push(`Shared confirmed process${procs.length>1?'es':''}: ${procs.slice(0,3).join('; ')}${procs.length>3?` and ${procs.length-3} more`:''}.`);
 if(caps.length)common.push(`Shared registered capabilit${caps.length>1?'ies':'y'}: ${caps.slice(0,3).join('; ')}${caps.length>3?` and ${caps.length-3} more`:''}.`);
 const words=pair.forward.components.find(c=>c.key==='description')?.text?.shared||[];
 if(words.length)common.push(`Description words in common: ${words.slice(0,6).join(', ')}${words.length>6?'…':''} (a clue only; similar wording can come from a shared template).`);
 if((a.Entity||'')&&a.Entity===b.Entity)common.push(`Same plant: ${a.Entity}.`);
 const clue=relationshipClue(a,b);
 if(common.length)common.push('Shared registrations do not prove the same, replaceable or mergeable function.');
 const differences=[];
 if((a.Entity||'')!==(b.Entity||''))differences.push(`Plant: ${a.Entity||'not provided'} vs ${b.Entity||'not provided'}.`);
 if((a.Division||'')!==(b.Division||''))differences.push(`Business unit: ${a.Division||'not provided'} vs ${b.Division||'not provided'}.`);
 for(const [key,label] of [['process','process'],['cap','capability']]){
  const onlyA=onlyNames(pair,key,'a'),onlyB=onlyNames(pair,key,'b');
  if(onlyA.length)differences.push(`Only ${a.Name} records the ${label}${onlyA.length>1?'s':''}: ${onlyA.slice(0,2).join('; ')}${onlyA.length>2?` and ${onlyA.length-2} more`:''}.`);
  if(onlyB.length)differences.push(`Only ${b.Name} records the ${label}${onlyB.length>1?'s':''}: ${onlyB.slice(0,2).join('; ')}${onlyB.length>2?` and ${onlyB.length-2} more`:''}.`);
 }
 const needs=[];
 for(const app of [a,b])for(const issue of issuesFor(app).filter(i=>i.kind!=='missing'||i.level===null))needs.push({app,dimension:issue.dimension,record:issue.record||issue.label,why:issue.text,next:'Confirm or correct this record in LeanIX (see To review).'});
 if(!needs.length&&pair.status!=='confirmed'&&pair.status!=='excluded')for(const item of missingPairEvidence(pair))needs.push({app:null,dimension:item.label,record:item.label,why:item.reason,next:'Complete or confirm this information, then compare again.'});
 const state=pairState(pair,threshold);
 const next=pair.status==='excluded'?'No comparison needed: at least one application is out of scope.'
  :clue?'Ask both owners whether these are environments of the same system; if so, record Related environments.'
  :needs.length&&pair.status!=='confirmed'?'Resolve the records under What needs confirmation first; the comparison cannot be judged yet.'
  :state.state==='Potential overlap'?'Compare the original descriptions with both application owners and record the result below.'
  :procs.length||caps.length?(pair.status==='confirmed'?'Shared registrations exist although the score is below the threshold: check with the owners whether the shared registrations are used the same way.':'There is no complete score, but registrations are shared: check with the owners whether the shared registrations are used the same way.')
  :'Currently no evidence of overlap from the registrations; review only if the descriptions suggest a similar purpose.';
 return {each,common,clue,differences,needs,next,state,levels:comparisonLevels(pair)};
}

// Pair reviews are human conclusions, kept apart from system suggestions. Stored in the workspace (data.pairReviews,
// keyed by the unordered pair key) and therefore exported and imported with it.
export function cleanPairReviews(value){
 const out={};
 for(const [key,review] of Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{})){
  if(!/::/.test(key)||!review||typeof review!=='object'||!PAIR_REVIEW_STATUSES.includes(review.status))continue;
  out[key]={status:review.status,reason:String(review.reason??'').slice(0,500),reviewer:String(review.reviewer??'').slice(0,100),date:String(review.date??'').slice(0,10)};
 }
 return out;
}

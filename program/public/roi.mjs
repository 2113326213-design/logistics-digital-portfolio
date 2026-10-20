import {opportunityEligibility} from './scope.mjs';
export function cleanROIScore(value){
 if(value==null||(typeof value==='string'&&value.trim()===''))return null;
 if(!['string','number'].includes(typeof value)||!Number.isInteger(Number(value))||Number(value)<1||Number(value)>5)throw Error('ROI score must be 1 to 5, or blank.');
 return Number(value);
}
export function formatROIScore(app){const score=cleanROIScore(app?.roiScore);return score===null?'Not recorded':`${score} / 5`;}

// ROI is shown as its payback period, following the source workbook formula
// =IF(O3=1,">2years",IF(O3=3,">1year","<1year")) for the scores it names (owner decision 2026-10-20). Only an explicit
// 5 reads "< 1 year": a blank score, an application outside scoring and any other score are named as such instead of
// falling into the formula's last branch. The source score itself is kept unchanged for tracing, sorting and checks.
export const ROI_PAYBACK=Object.freeze({1:'> 2 years',3:'> 1 year',5:'< 1 year'});
export const ROI_PAYBACK_RULE='1 → > 2 years, 3 → > 1 year, 5 → < 1 year';
const sourceScore=value=>{try{return {score:cleanROIScore(value),valid:true};}catch{return {score:null,valid:false};}};
export function roiPayback(app){
 const eligibility=opportunityEligibility(app),{score,valid}=sourceScore(app?.roiScore),raw=app?.roiScore;
 if(!eligibility.eligible)return {kind:'not-scored',text:'Not scored',score,reason:eligibility.reason};
 if(!valid)return {kind:'needs-confirmation',text:`Needs confirmation (source value ${String(raw)})`,score:null,raw};
 if(score===null)return {kind:'not-provided',text:'Not provided',score:null};
 if(Object.hasOwn(ROI_PAYBACK,score))return {kind:'payback',text:ROI_PAYBACK[score],score};
 return {kind:'needs-confirmation',text:`Needs confirmation (score ${score})`,score};
}
export const formatROIPayback=app=>roiPayback(app).text;
// The explanation beside the payback period: the source score and the rule, or why there is no payback period.
export function roiPaybackNote(app){
 const r=roiPayback(app);
 if(r.kind==='payback')return `Source ROI score ${r.score} / 5, shown as a payback period (${ROI_PAYBACK_RULE}). Not a monetary amount.`;
 if(r.kind==='not-scored')return `Not scored: ${r.reason}.${r.score!==null?` Source ROI score ${r.score} / 5.`:''}`;
 if(r.kind==='not-provided')return 'No ROI score in the source inventory.';
 return `${r.score!==null?`Source ROI score ${r.score} / 5`:`Source value ${String(r.raw)}`} has no payback rule (only 1, 3 and 5 are defined: ${ROI_PAYBACK_RULE}). Check the source.`;
}
// A stored ROI score as text in change history: the payback period with the score it comes from.
export function roiScoreText(value){
 if(value===null||value===undefined||String(value).trim()==='')return '';
 const {score,valid}=sourceScore(value);
 if(!valid)return `Needs confirmation (source value ${String(value)})`;
 return Object.hasOwn(ROI_PAYBACK,score)?`${ROI_PAYBACK[score]} (score ${score})`:`Needs confirmation (score ${score})`;
}
export function roiScoresFromSheets(sheets){
 const rows=sheets['Parameter Score'];if(!rows)return null;
 const h=rows.findIndex(row=>row?.includes('LeanIX ID')&&row?.includes('ROI'));if(h<0)return null;
 const idCol=rows[h].indexOf('LeanIX ID'),col=rows[h].indexOf('ROI'),result=new Map();
 rows.forEach((row,index)=>{if(index<=h)return;const id=String(row?.[idCol]??'').trim();if(!id)return;if(result.has(id))throw Error(`Duplicate ROI application ID on row ${index+1}.`);let score;try{score=cleanROIScore(row[col]);}catch(error){throw Error(`Parameter Score row ${index+1} (LeanIX ID ${id}), ROI: ${error.message} Found "${row[col]}".`);}result.set(id,{score,source:`Parameter Score · ROI · row ${index+1}`});});return result;
}

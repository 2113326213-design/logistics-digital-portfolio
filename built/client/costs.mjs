// Annual CNY conversion values: score 1 updated by the user on 2026-10-15.
// Score 1 is a fixed CNY 200,000 estimate; missing scores remain unknown.
export const ANNUAL_COST_BANDS=Object.freeze({1:200000,2:100000,3:50000,4:20000,5:10000});
export function cleanCostScore(value){
 if(value===null||value===undefined)return null;
 if(!['string','number'].includes(typeof value))throw Error('App operation cost must be a score from 1 to 5, or blank.');
 if(typeof value==='string'&&value.trim()==='')return null;
 const score=Number(value);
 if(!Number.isInteger(score)||score<1||score>5)throw Error('App operation cost must be a score from 1 to 5, or blank.');
 return score;
}
export function formatCostScore(app){const score=cleanCostScore(app?.operationCostScore);return score===null?'Not recorded':`${score} / 5`;}
export function annualCost(app){
 const score=cleanCostScore(app?.operationCostScore);
 return {score,amount:score===null?null:ANNUAL_COST_BANDS[score],openEnded:false,currency:'CNY'};
}
export function formatRMB(amount,{compact=false}={}){
 if(amount===null||amount===undefined)return 'Not recorded';
 const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:compact?1:0}).format(compact?amount/1000:amount);
 return `¥${number}${compact?'k':''}`;
}
export function formatAnnualCost(app,options={}){const cost=annualCost(app);return formatRMB(cost.amount,{...options,openEnded:cost.openEnded});}
export function costSummary(apps){
 const distribution={1:0,2:0,3:0,4:0,5:0};let scored=0,knownTotal=0;
 for(const app of apps){const cost=annualCost(app);if(cost.score!==null){distribution[cost.score]++;scored++;knownTotal+=cost.amount;}}
 const annualTotal=scored?knownTotal:null;
 return {total:apps.length,scored,missing:apps.length-scored,distribution,annualTotal,currency:'CNY',openEndedCount:0,scenario20:annualTotal===null?null:annualTotal*.2};
}
export function operationCostScoresFromSheets(sheets){
 const rows=sheets['Parameter Score'];if(!rows)return new Map();
 const header=rows.findIndex(row=>row?.includes('LeanIX ID')&&row?.includes('App operation cost'));
 if(header<0)throw Error('Parameter Score is missing LeanIX ID or App operation cost.');
 const idColumn=rows[header].indexOf('LeanIX ID'),scoreColumn=rows[header].indexOf('App operation cost'),result=new Map();
 for(let index=header+1;index<rows.length;index++){
  const row=rows[index],id=String(row?.[idColumn]??'').trim();if(!id)continue;
  if(result.has(id))throw Error(`Parameter Score has a duplicate LeanIX ID on row ${index+1}.`);
  let score;try{score=cleanCostScore(row[scoreColumn]);}catch(error){throw Error(`Parameter Score row ${index+1} (LeanIX ID ${id}), App operation cost: ${error.message} Found "${row[scoreColumn]}".`);}
  result.set(id,{score,source:`Parameter Score · App operation cost · row ${index+1}`});
 }
 return result;
}

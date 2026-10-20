import {DEFAULT_WEIGHTS,normalizeWeights} from './weighted.mjs';

const keys=Object.keys(DEFAULT_WEIGHTS);

export function weightPercentages(rawWeights){
 const normalized=normalizeWeights(rawWeights);
 const quotas=keys.map(key=>normalized[key]*1000);
 const units=quotas.map(Math.floor);
 let remaining=1000-units.reduce((sum,value)=>sum+value,0);
 const order=keys.map((_,index)=>index).sort((a,b)=>(quotas[b]-units[b])-(quotas[a]-units[a])||a-b);
 for(const index of order){if(remaining<=0)break;units[index]++;remaining--;}
 return Object.fromEntries(keys.map((key,index)=>[key,units[index]/10]));
}

export function inspectWeightAllocation(draft){
 const entries=keys.map(key=>[key,Number(draft[key])]);
 if(entries.some(([key,value])=>draft[key]===''||draft[key]===null||draft[key]===undefined||!Number.isFinite(value)||value<0||value>100)){
  return {valid:false,total:null,message:'Enter a number from 0 to 100 for each field.',weights:null};
 }
 // The inputs step by 0.1%; a finer weight would show as 0% yet still count as weighted (for example in the zero-text gate).
 if(entries.some(([,value])=>Math.abs(value*10-Math.round(value*10))>1e-9||value>0&&Math.round(value*10)===0))return {valid:false,total:null,message:'Use steps of 0.1%.',weights:null};
 const total=entries.reduce((sum,[,value])=>sum+value,0);
 if(Math.abs(total-100)>0.000001){
  const difference=Math.abs(100-total);
  const amount=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(difference);
  return {valid:false,total,message:total<100?`${amount}% left to assign.`:`${amount}% over the limit. Lower another field.`,weights:null};
 }
 return {valid:true,total:100,message:'Ready to apply. Scores will update after you select Apply.',weights:Object.fromEntries(entries.map(([key,value])=>[key,Math.round(value*10)/10/100]))};
}

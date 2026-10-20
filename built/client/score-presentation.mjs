import {normalizeWeights} from './weighted.mjs';
import {scorePoints} from './score-values.mjs';
export function componentContribution(score,dimension,weights){
 const weight=normalizeWeights(weights)[dimension];
 return {score,weight,contribution:weight===0?0:score===null?null:score*weight,excluded:weight===0};
}
export const formatPoints=value=>value===null?'N/A':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(scorePoints(value))+' pts';

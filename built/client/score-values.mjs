// Weighted totals are float sums; settle them before display and threshold checks
// so an exact 34 is not stored as 33.999… and .x5 values round the same way.
export const settledScore=value=>value===null||value===undefined?null:Math.round(value*1e9)/1e9;
export const scorePoints=value=>value===null||value===undefined?null:Math.round(value*1e9)/1e7;
export const meetsThreshold=(value,thresholdPercent)=>value!==null&&value!==undefined&&Math.round(value*1e9)>=Math.round(thresholdPercent*1e7);

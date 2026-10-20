// Minimum score for Potential overlap (Score settings). Since V9.15 it is kept in the workspace next to the
// weights, so Export workspace carries it and an import applies it; the saved page view is only a fallback.
export const DEFAULT_THRESHOLD=50;
const numeric=/^\s*\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;
// 0 and 100 are valid; blanks, text, booleans and values outside 0–100 are rejected (null), never read as 0.
export function cleanThreshold(value){
 const number=typeof value==='number'?value:typeof value==='string'&&numeric.test(value)?Number(value):NaN;
 return Number.isFinite(number)&&number>=0&&number<=100?number+0:null;
}
// The workspace field exists only when it holds a valid value.
export function thresholdField(data){const value=cleanThreshold(data?.similarityThreshold);return value===null?{}:{similarityThreshold:value};}
// An import without the field (an older backup or an Excel inventory) keeps the current setting.
export function keepThreshold(current,next){
 const value=cleanThreshold(current?.similarityThreshold);
 return Object.hasOwn(next,'similarityThreshold')||value===null?next:{...next,similarityThreshold:value};
}
// The page view saved in this browser only applies when the workspace has no threshold of its own.
export function effectiveThreshold(data,viewValue){
 return cleanThreshold(data?.similarityThreshold)??cleanThreshold(viewValue)??DEFAULT_THRESHOLD;
}

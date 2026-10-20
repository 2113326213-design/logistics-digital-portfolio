import {capCode,norm,compareNatural} from './codes.mjs';
import {displayName} from './display.mjs';
import {semanticConcerns} from './semantic-review.mjs';

// Recorded capability names that differ from the standard name of their code. Shared by Data checks and the
// To review issues, so both use the same rule.
const applied=(model,appId,raw)=>model.correctionLog.some(c=>c.state==='Applied'&&c.appId===appId&&c.dimension==='cap'&&c.raw===raw);
const displaySourceName=raw=>String(raw??'').replace(/^\S+\s*/,'').trim();
const normalizeAbbreviation=name=>String(name??'').replace(/\bMgmt\./gi,'Management');

function matchesTruncatedStandard(sourceName,standardName){
 const clean=String(standardName??'').replace(/(?:\s*[….]+\s*){2,}/g,' … '),mark=clean.indexOf('…');
 if(mark<0)return false;
 const source=norm(normalizeAbbreviation(sourceName)),left=norm(normalizeAbbreviation(clean.slice(0,mark))),right=norm(normalizeAbbreviation(clean.slice(mark+1)));
 return !!left&&!!right&&source.startsWith(left)&&source.endsWith(right)&&source.length>left.length+right.length;
}

export function nameDifferenceRows(model,app){
 const pending=new Set(semanticConcerns(app,model.correctionLog,model.caps).map(item=>item.raw));
 const rows=[];
 for(const raw of app.rawCap){
  const code=capCode(raw),node=code&&model.caps.get(code);
  // A record with an applied mapping is already resolved.
  if(!code||!node?.reference||pending.has(raw)||applied(model,app.id,raw))continue;
  const sourceName=displaySourceName(raw),standardName=displayName(node);
  if(norm(normalizeAbbreviation(sourceName))===norm(normalizeAbbreviation(standardName)))continue;
  if(matchesTruncatedStandard(sourceName,standardName))continue;
  rows.push({code,raw,sourceName,standardName,label:`${sourceName} → ${standardName}`});
 }
 return rows.sort((a,b)=>compareNatural(a.code,b.code)||a.sourceName.localeCompare(b.sourceName));
}

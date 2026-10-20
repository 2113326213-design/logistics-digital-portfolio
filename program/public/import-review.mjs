import {workspaceData,ownerDecisions} from './workspace.mjs';
import {buildModel} from './model.mjs';
import {correctionStates} from './corrections.mjs';
import {reviewAuditEvents} from './reviews.mjs';
import {cleanCostScore} from './costs.mjs';
import {opportunityEligibility} from './scope.mjs';
import {capCode} from './codes.mjs';
import {OTHER_DEPARTMENT_CODE} from './xlsx.mjs';
import {keepThreshold} from './score-settings.mjs';
// Capability catalogue changes by code: renamed (same code, new name; a code merely written another way,
// such as B.06.2.02 for B.06.2.2, is not a rename), added and removed codes.
export function capabilityCatalogueChanges(currentRows,nextRows){
 const names=rows=>{const map=new Map();for(const value of (rows||[]).flat()){const id=value&&capCode(value);if(id&&!map.has(id))map.set(id,String(value).replace(/^\S+\s*/,'').trim());}return map;};
 const before=names(currentRows),after=names(nextRows);
 const renamed=[...after].filter(([id,name])=>before.has(id)&&before.get(id)!==name).length,added=[...after.keys()].filter(id=>!before.has(id)).length,removed=[...before.keys()].filter(id=>!after.has(id)).length;
 return {renamed,added,removed,total:renamed+added+removed};
}
// Pair reviews (owner request 2026-10-20): a backup that differs from the current workspace only in its pair reviews
// is still a change, so it can be previewed and applied. Counts by pair key; an edited conclusion, reviewer, reason
// or date counts as updated.
export function pairReviewChanges(current,next){
 const before=current&&typeof current==='object'?current:{},after=next&&typeof next==='object'?next:{};
 const added=Object.keys(after).filter(key=>!Object.hasOwn(before,key)).length,removed=Object.keys(before).filter(key=>!Object.hasOwn(after,key)).length;
 const updated=Object.keys(after).filter(key=>Object.hasOwn(before,key)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).length;
 return {added,updated,removed,total:added+updated+removed,count:Object.keys(after).length};
}
// Status after an import is applied: application changes first, otherwise what did change.
export const importAppliedStatus=(preview,appCount)=>preview.added.length||preview.updated.length||preview.removed.length?`Updated ${appCount} applications.`:preview.taxonomyChanged?'Taxonomy updated; no application records changed.':preview.pairReviews?.total?`Pair reviews updated (${preview.pairReviews.count} in the workspace); no application records changed.`:'Workspace updated; no application records changed.';
// A restored saved workspace keeps its own capability list. When the bundled data has switched to a capability
// standard that the saved workspace does not use, say how to switch; nothing is changed automatically.
export function catalogueNotice(saved,bundled){
 const standard=String(bundled?.taxonomySource??'').match(/^(.+?) \(capabilities\); /)?.[1];
 if(!standard||!capabilityCatalogueChanges(saved?.capabilityRows,bundled.capabilityRows).total)return '';
 // The same source name can still hide a different list, e.g. a workspace saved before HC was removed.
 if((saved?.capabilityRows||[]).flat().some(value=>value&&OTHER_DEPARTMENT_CODE.test(String(value).trim())))return `This saved workspace still lists HC capabilities, which belong to another department and were removed from the catalogue on 2026-10-19. To remove them, get the business capability standard ${standard} from the data owner and import it as the taxonomy in Import data.`;
 return `This saved workspace keeps its own capability list (${saved.taxonomySource||'source not named'}). The bundled data uses the business capability standard ${standard}; to switch, get that workbook from the data owner and import it as the taxonomy in Import data.`;
}
// Missing optional columns preserve previously supplied evidence. Explicit blanks
// in a present column/table remain authoritative and are shown in the preview.
export function mergeInventoryEvidence(currentApps,incomingApps){
 const existing=new Map(currentApps.map(app=>[String(app.ID).trim(),app]));
 const groups=[['Description'],['Lifecycle: Current Lifecycle'],['Lifecycle: Active'],['annualBenefitCNY','annualBenefitSource'],['roiScore','roiSource'],['Main Business Capability'],['scopeNote','scopeSource'],['operationCostScore','operationCostSource']];
 return incomingApps.map(app=>{
  const previous=existing.get(String(app.ID).trim()),next={...app};
  if(previous)for(const [field,...sources] of groups)if(!Object.hasOwn(app,field)&&Object.hasOwn(previous,field)){
   next[field]=previous[field];for(const source of sources)if(Object.hasOwn(previous,source))next[source]=previous[source];
  }
  return next;
 });
}
// raw: the data as read, before workspaceData applies owner decisions (defaults to incoming).
export function previewImport(current,incoming,raw=incoming){
 const next=keepThreshold(current,workspaceData(incoming));buildModel(next);
 const before=new Map(current.apps.map(a=>[String(a.ID).trim(),a])),after=new Map(next.apps.map(a=>[String(a.ID).trim(),a]));
 const added=[],removed=[],updated=[];
 for(const [id,a] of after)if(!before.has(id))added.push(a);else if(JSON.stringify(a)!==JSON.stringify(before.get(id)))updated.push(a);
 for(const [id,a] of before)if(!after.has(id))removed.push(a);
 const states=correctionStates(next);
 const beforeActivity=reviewAuditEvents(current),afterActivity=reviewAuditEvents(next),retained=new Set(afterActivity.map(e=>e.id));
 const taxonomyChanged=JSON.stringify([current.capabilityRows,current.processRows])!==JSON.stringify([next.capabilityRows,next.processRows]);
 const pairReviews=pairReviewChanges(current.pairReviews,next.pairReviews);
 const workspaceChanged=pairReviews.total>0||['reviews','corrections','reviewHistory','applicationEvents','importHistory','similarityWeights','similarityThreshold'].some(key=>JSON.stringify(current[key]??null)!==JSON.stringify(next[key]??null));
 const costScoresRemoved=updated.filter(app=>cleanCostScore(before.get(String(app.ID).trim())?.operationCostScore)!==null&&cleanCostScore(app.operationCostScore)===null).length;
 const scopeExclusionsRemoved=updated.filter(app=>!opportunityEligibility(before.get(String(app.ID).trim())).eligible&&opportunityEligibility(app).eligible).length;
 // Explicit blank cells in a supplied column replace recorded text; count them for the preview warning.
 const cleared=field=>updated.filter(app=>String(before.get(String(app.ID).trim())?.[field]??'').trim()&&!String(app[field]??'').trim()).length;
 return {next,added,removed,updated,unchanged:next.apps.length-added.length-updated.length,taxonomyChanged,capabilityChanges:capabilityCatalogueChanges(current.capabilityRows,next.capabilityRows),costScoresRemoved,scopeExclusionsRemoved,descriptionsCleared:cleared('Description'),lifecycleValuesCleared:cleared('Lifecycle: Current Lifecycle')+cleared('Lifecycle: Active'),ownerDecisions:ownerDecisions(raw),hasChanges:!!(added.length||removed.length||updated.length||taxonomyChanged||workspaceChanged),appliedMappings:states.filter(c=>c.state==='Applied').length,staleMappings:states.filter(c=>c.state==='Needs review').length,reviewNotes:Object.keys(next.reviews).length,pairReviews,activityRecords:afterActivity.length,activityRemoved:beforeActivity.filter(e=>!retained.has(e.id)).length};
}

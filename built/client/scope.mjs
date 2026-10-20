// Opportunity screening follows the source inventory's unnamed column C.
// It does not remove applications from the portfolio or cost summaries.
export function opportunityEligibility(app){
 const note=String(app?.scopeNote??'').trim().toLowerCase().replace(/\s+/g,' ');
 if(note==='no score,not an application'||note==='no score, not an application')return {eligible:false,reason:'Marked as not an application in the source inventory'};
 if(note==='no score,not go-live'||note==='no score, not go-live')return {eligible:false,reason:'Marked as not go-live in the source inventory'};
 if(note==='no score,not bbm'||note==='no score, not bbm')return {eligible:false,reason:'Marked as outside BBM scope in the source inventory'};
 return {eligible:true,reason:note==='with score'?'Scored application in the source inventory':'No explicit opportunity exclusion recorded'};
}

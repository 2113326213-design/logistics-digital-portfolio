// Opportunity screening follows the source inventory's scope column (the unnamed column C, or 'with score or not')
// and, since 2026-10-21, its status column ('Status in Oct').
// It does not remove applications from the portfolio or cost summaries.
export function opportunityEligibility(app){
 const note=String(app?.scopeNote??'').trim().toLowerCase().replace(/\s+/g,' ');
 if(note==='no score,not an application'||note==='no score, not an application')return {eligible:false,reason:'Marked as not an application in the source inventory'};
 if(note==='no score,not go-live'||note==='no score, not go-live')return {eligible:false,reason:'Marked as not go-live in the source inventory'};
 if(note==='no score,not bbm'||note==='no score, not bbm')return {eligible:false,reason:'Marked as outside BBM scope in the source inventory'};
 // Owner decision 2026-10-21: an application whose status in the source inventory is not "still active" (phase-out,
 // end of life, moved to central ownership) is not counted either. A blank or absent status excludes nothing.
 const status=String(app?.statusNote??'').trim();
 if(status&&status.toLowerCase().replace(/\s+/g,' ')!=='still active')return {eligible:false,reason:`Status "${status}" in the source inventory (not still active)`};
 return {eligible:true,reason:note==='with score'?'Scored application in the source inventory':'No explicit opportunity exclusion recorded'};
}

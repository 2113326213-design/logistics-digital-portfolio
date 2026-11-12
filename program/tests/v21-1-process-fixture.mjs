import {readFileSync} from 'node:fs';
const records=JSON.parse(readFileSync(new URL('./fixtures/v21.1-process-records.json',import.meta.url),'utf8'));
// 2026-11-12 policy: preserve the exact pre-cleanup records for historical parser, acceptance and import regressions.
// Production cleanup, saved-work migration and imports are exercised separately by v21-2-process-policy.test.mjs.
export function v211ProcessFixture(data){
 const snapshot={...data,apps:data.apps.map(app=>({...app,Processes:records[app.ID]??app.Processes})),applicationEvents:(data.applicationEvents||[]).filter(e=>!String(e.id).startsWith('bbm-pm-only-20261112-'))};
 delete snapshot.processPolicy;
 return snapshot;
}

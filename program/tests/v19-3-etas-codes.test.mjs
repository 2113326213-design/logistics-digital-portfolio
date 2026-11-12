// V19.3 (owner 2026-11-02, "认，编号和名称一致就算同一个"): a process recorded with its ETAS number, as EDCN AWS does in the
// LeanIX export of 2026-11-02 ("ETAS.I2D.010.050.010 Putaway of Automated Goods Receipt (AGR)"), is the Signavio process
// with the same number (M.I2D.010.050.010) when the name is the same too. It then has that process's level.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processIssues} from '../public/process-issues.mjs';
import {createSimilarity} from '../public/similarity.mjs';

const base=()=>workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const withProcesses=Processes=>{const data=base();return buildModel(workspaceData({...data,apps:[...data.apps,{ID:'etas-test',Name:'ETAS test',Description:'Test application.',Entity:'Plant A',Division:'PS','Business Capabilities':'B.06.5.1 Inbound Management and Receiving',Processes}]}));};
const records=model=>maintenanceReport(model,{},'process').records.get('etas-test');

test('an ETAS number with the same name is the Signavio process: matched, Level 3, no issue, compared in the similarity check',()=>{
 const model=withProcesses('ETAS.I2D.010.050.010 Putaway of Automated Goods Receipt (AGR);etas.i2d.010.050.020 putaway to  warehouse destination');
 const app=model.apps.find(a=>a.id==='etas-test');
 assert.deepEqual(app.processMatches.map(m=>[m.id,m.via]),[['M.I2D.010.050.010','code'],['M.I2D.010.050.020','code']],'letter case and spacing do not matter');
 assert.deepEqual(app.inLeanix,[]);
 assert.deepEqual(records(model).map(r=>[r.level,r.valid]),[[3,true],[3,true]]);
 assert(!processIssues(model,app).some(i=>/ETAS/i.test(i.raw||'')),'no issue for the ETAS records');
 assert.deepEqual(createSimilarity(model,'process').scopes.get('etas-test').known.map(n=>n.id).sort(),['M.I2D.010.050.010','M.I2D.010.050.020']);
});

test('a different name, or a number the Signavio list does not have, is not matched: without a level it stays an issue',()=>{
 for(const raw of ['ETAS.I2D.010.050.010 Something else','ETAS.I2D.999.999.999 Putaway of Automated Goods Receipt (AGR)']){
  const model=withProcesses(raw),app=model.apps.find(a=>a.id==='etas-test');
  assert.deepEqual(app.processMatches,[],raw);
  assert.deepEqual(processIssues(model,app).filter(i=>i.raw===raw).map(i=>i.label),['Process level not specified'],raw);
 }
});

// 2026-11-12 export compatibility: BBM_SWS replaces ETAS and also writes the Level 0 chain code without numbers.
test('BBM_SWS numbers keep the ETAS code-and-name rule, including normalised names and similarity evidence',()=>{
 const model=withProcesses('BBM_SWS.I2D.010.050.010 Putaway of Automated Goods Receipt (AGR);bbm_sws.i2d.010.050.020 putaway to  warehouse destination');
 const app=model.apps.find(a=>a.id==='etas-test');
 assert.deepEqual(app.processMatches.map(m=>[m.id,m.via]),[['M.I2D.010.050.010','code'],['M.I2D.010.050.020','code']]);
 assert.deepEqual(app.inLeanix,[]);
 assert.deepEqual(records(model).map(r=>[r.level,r.valid]),[[3,true],[3,true]]);
 assert(!processIssues(model,app).some(i=>/BBM_SWS/i.test(i.raw||'')));
 assert.deepEqual(createSimilarity(model,'process').scopes.get('etas-test').known.map(n=>n.id).sort(),['M.I2D.010.050.010','M.I2D.010.050.020']);
});

test('a BBM_SWS or ETAS chain code without numbers matches Level 0 only when its name also matches',()=>{
 for(const prefix of ['BBM_SWS','ETAS']){
  const raw=`${prefix}.P2F Plan to Fulfill`,model=withProcesses(raw),app=model.apps.find(a=>a.id==='etas-test');
  assert.deepEqual(app.processMatches,[{raw,id:'M.P2F',via:'code'}]);
  assert.deepEqual(records(model).map(r=>[r.level,r.valid]),[[0,true]]);
  assert(!processIssues(model,app).some(i=>i.raw===raw));
 }
});

test('BBM_SWS records with a different name or an unknown code remain unmatched and keep the missing-level issue',()=>{
 for(const raw of ['BBM_SWS.I2D.010.050.010 Something else','BBM_SWS.I2D.999.999.999 Putaway of Automated Goods Receipt (AGR)','BBM_SWS.P2F Something else','BBM_SWS.UNKNOWN Plan to Fulfill']){
  const model=withProcesses(raw),app=model.apps.find(a=>a.id==='etas-test');
  assert.deepEqual(app.processMatches,[],raw);
  assert.deepEqual(app.inLeanix,[],raw);
  assert.deepEqual(processIssues(model,app).filter(i=>i.raw===raw).map(i=>i.label),['Process level not specified'],raw);
 }
});

test('the bundled data: EDCN AWS records its 7 processes with ETAS numbers, all matched at Level 3',()=>{
 const data=base(),model=buildModel(data),app=model.apps.find(a=>a.Name==='EDCN AWS');
 const etas=app.rawProcess.filter(raw=>/^ETAS\./.test(raw));
 assert.equal(etas.length,7);
 assert.deepEqual(app.processMatches.filter(m=>etas.includes(m.raw)).map(m=>m.id),etas.map(raw=>'M.'+raw.split(' ')[0].slice(5)));
 assert(records(buildModel(workspaceData({...data,apps:[...data.apps,{...data.apps.find(a=>a.Name==='EDCN AWS'),ID:'etas-test'}]}))).filter(r=>etas.includes(r.raw)).every(r=>r.level===3&&r.valid));
 assert(!processIssues(model,app).some(i=>etas.includes(i.raw)));
 assert.equal(data.source,'20261102_025607_zApwu_inventory.xlsx','the LeanIX export of 2026-11-02');
});

import {WHATS_NEW,updateNoticeDue,updateNoticeHTML} from '../public/whats-new.mjs';
test('the update notice of 2 November 2026 tells returning users about the new data and the ETAS numbers, once, with no version number',()=>{
 assert.notEqual(WHATS_NEW.id,'2026-10-23-3');
 const seen=id=>{const map=new Map([['logistics-portfolio:update-seen',id]]);return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))};};
 assert.equal(updateNoticeDue(seen('2026-10-23-3')),true,'someone who closed the 23 October notice sees this one');
 assert.equal(updateNoticeDue(seen(WHATS_NEW.id)),false);
 const html=updateNoticeHTML(s=>String(s));
 assert.match(html,/The tool was updated on 12 November 2026\./);
 assert(html.includes('<li>The data now comes from the LeanIX export of 2 November 2026. 16 applications changed, mostly their business capabilities and processes.</li>'));
 assert(html.includes('<li>A process recorded with an ETAS number (for example ETAS.I2D.010.050.010) now counts as the same standard process when the number and the name match.</li>'));
 assert.match(html,/Data checks now list the same items as Issues to review/,'the 23 October lines stay');
 assert.doesNotMatch(html,/\bV\d|version|release/i);
});

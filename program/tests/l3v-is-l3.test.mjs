// Fixed rule (owner 2026-10-19, restated 2026-10-23: "L3和L3V看做统一等级 … 之后要把这个写入死，不要变了 L3v就是L3"): a process
// record ending in L3V is a Level 3 record, exactly like L3. These tests fail if any part of the tool starts to treat L3V
// differently: the same data with every L3 written as L3V (and the reverse) must give the same matches, issues, review
// texts, overview figures and similarity results; and no program code may single out "L3V".
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {PROCESS_LEVEL} from '../public/codes.mjs';
import {overviewStats,maintenanceReport} from '../public/overview.mjs';
import {createWeightedSimilarity,portfolioCandidates} from '../public/weighted.mjs';
import {pairResultLabel,pairStatusReason} from '../public/pair-status.mjs';
import {workspaceData} from '../public/workspace.mjs';

const bundled=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const level3=/\bL3V?(\s*)$/i;
// The same data with every Level 3 record written one way: in the applications, the owner's mappings (their record and
// the application snapshot they were made on) and the records the owner confirmed as recorded.
const write=(data,suffix)=>{
 const raw=s=>String(s??'').split(';').map(x=>x.replace(level3,suffix+'$1')).join(';');
 const snapshot=s=>typeof s==='string'?s.replace(/\bL3V?(?=;|")/g,suffix):s;
 return workspaceData({...data,apps:data.apps.map(a=>({...a,Processes:raw(a.Processes)})),
  corrections:data.corrections.map(c=>({...c,raw:c.dimension==='process'?raw(c.raw):c.raw,appSnapshot:snapshot(c.appSnapshot)})),
  acceptedRecords:(data.acceptedRecords||[]).map(d=>d.dimension==='process'?{...d,raw:raw(d.raw)}:d)});
};
const same=value=>JSON.stringify(value,(k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v).replace(/\bL3V\b/g,'L3');
const asL3=write(bundled,'L3'),asL3V=write(bundled,'L3V');

test('L3V is L3: the level rule reads both as Level 3',()=>{
 for(const s of ['BBM PM I2D Putaway L3','BBM PM I2D Putaway L3V','BBM PM I2D Putaway l3v '])assert.equal(PROCESS_LEVEL.exec(s)?.[1],'3',s);
 assert.notEqual(same(asL3.apps),same(bundled.apps).replace(/x/,'y'),'the data really holds both spellings');
 assert(bundled.apps.some(a=>/L3V\s*(;|$)/.test(a.Processes))&&bundled.apps.some(a=>/L3\s*(;|$)/.test(a.Processes)));
});

test('L3V is L3: matches, issues, review texts and overview figures are the same whichever way Level 3 is written',()=>{
 const a=buildModel(asL3),b=buildModel(asL3V);
 assert.equal(same(a.apps.map(x=>[x.id,x.process,x.processLeaf,x.processMatches.map(m=>[m.id,m.via]),x.unmatched,x.accepted])),same(b.apps.map(x=>[x.id,x.process,x.processLeaf,x.processMatches.map(m=>[m.id,m.via]),x.unmatched,x.accepted])));
 assert.equal(same(a.issues),same(b.issues));
 assert.equal(same(overviewStats(a)),same(overviewStats(b)));
 // The maintenance report holds every record's level and validity and every To review text.
 assert.equal(same(maintenanceReport(a,{},'process')),same(maintenanceReport(b,{},'process')));
});

test('L3V is L3: every similarity pair has the same status, score and reason',()=>{
 const run=data=>{const m=buildModel(data),list=portfolioCandidates(createWeightedSimilarity(m,data.similarityWeights)),pairs=list.pairs;
  return pairs.map(p=>[p.key,pairResultLabel(p,data.similarityThreshold??50),p.coverage,pairStatusReason(p,data.similarityThreshold??50)]);};
 assert.equal(same(run(asL3)),same(run(asL3V)));
});

test('L3V is L3: no program code singles out L3V (only comments may name it)',()=>{
 const dir=new URL('../public/',import.meta.url),files=readdirSync(dir).filter(f=>/\.(mjs|js)$/.test(f)&&f!=='english.mjs');
 const offenders=files.flatMap(f=>readFileSync(new URL(f,dir),'utf8').split('\n').map((line,i)=>[f,i+1,line]).filter(([,,line])=>/L3V/i.test(line)&&!/^\s*\/\//.test(line)));
 assert.deepEqual(offenders.map(([f,n])=>`${f}:${n}`),[]);
});

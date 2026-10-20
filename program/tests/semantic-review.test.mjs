import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {semanticConcerns,SEMANTIC_CASES} from '../public/semantic-review.mjs';
import {labelDifferenceRows} from '../public/label-differences.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
// The seven cases were flagged against the catalogue in use until 2026-10-16; the fixture keeps that rule covered with its real names.
const old=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const {importHistory,applicationEvents,...previous}=data;
const model=buildModel(data),legacy=buildModel({...previous,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});
const catalogueName=(rows,code)=>String(rows.flat().find(value=>String(value??'').startsWith(code+' '))??'').replace(/^\S+\s*/,'');

test('only the seven signed-off-pending legacy labels are flagged',()=>{
 const concerns=legacy.apps.flatMap(app=>semanticConcerns(app,legacy.correctionLog,legacy.caps));
 assert.equal(SEMANTIC_CASES.length,7);
 assert.deepEqual(Object.fromEntries(SEMANTIC_CASES.map(item=>[item.code,concerns.filter(c=>c.code===item.code).length])),{
  'B.06.2.10':1,'B.06.4':7,'B.06.4.1':4,'B.06.4.2':4,'B.06.5.2':3,'B.06.5.3':2,'B.06.7.1':1
 });
 assert(concerns.every(c=>c.status==='pending'&&c.decision===null));
 assert.equal(semanticConcerns({ID:'modern', 'Business Capabilities':'B.06.2.10 Order Planning Simulation'}).length,0);
 assert.equal(semanticConcerns({ID:'other', 'Business Capabilities':'B.06.2.10 Other Planning'}).length,0);
});

test('the business capability standard adopts all seven source names, so no semantic concern remains',()=>{
 for(const item of SEMANTIC_CASES){
  assert.equal(catalogueName(old.capabilityRows,item.code),item.standardName,item.code+' legacy catalogue name');
  assert.equal(catalogueName(data.capabilityRows,item.code),item.sourceName,item.code+' standard name');
 }
 assert.deepEqual(model.apps.flatMap(app=>semanticConcerns(app,model.correctionLog,model.caps)),[]);
 const held=legacy.apps.flatMap(app=>semanticConcerns(app,legacy.correctionLog,legacy.caps).map(c=>[c.appId,c.raw]));
 assert.equal(held.length,22);
 assert(held.every(([appId,raw])=>model.apps.find(app=>app.id===appId).rawCap.includes(raw)),'original application records are preserved');
});

test('current taxonomy controls the standard name after an import',()=>{
 const app={ID:'A','Business Capabilities':'B.06.4 Inventory Management'};
 assert.equal(semanticConcerns(app,[],new Map([['B.06.4',{reference:'B.06.4 Inventory Management'}]])).length,0);
 assert.equal(semanticConcerns(app,[],new Map()).length,0,'missing taxonomy reference belongs to missing-code review');
 const changed=semanticConcerns(app,[],new Map([['B.06.4',{reference:'B.06.4 New Storage Name'}]]));
 assert.equal(changed.length,1);
 assert.equal(changed[0].standardName,'New Storage Name');
});

test('an applied verified mapping clears only its own application and raw label',()=>{
 const source=legacy.apps.find(app=>semanticConcerns(app).some(c=>c.code==='B.06.2.10'));
 const concern=semanticConcerns(source,[],legacy.caps).find(c=>c.code==='B.06.2.10');
 const applied={appId:source.id,dimension:'cap',raw:concern.raw,state:'Applied'};
 assert.equal(semanticConcerns(source,[applied],legacy.caps).length,0);
 assert.equal(semanticConcerns(source,[{...applied,state:'Revoked'}],legacy.caps).length,1);
 assert.equal(semanticConcerns(source,[{...applied,appId:'another-app'}],legacy.caps).length,1);
 assert.equal(semanticConcerns(model.apps.find(app=>app.id===source.id),[],model.caps).length,0,'the standard name needs no mapping');
});

test('source label table keeps all differences while highlighting just pending semantic cases',()=>{
 const rows=labelDifferenceRows(legacy);
 assert.equal(rows.filter(row=>row.semanticStatus==='pending').length,22);
 assert(rows.some(row=>row.code==='B.06.2.10'&&row.sourceName==='Customer Order Planning'&&row.semanticStatus==='pending'));
 assert(rows.some(row=>row.semanticStatus===null));
 const current=labelDifferenceRows(model);
 assert.equal(current.length,2);assert(current.every(row=>row.semanticStatus===null));
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {buildModel} from '../public/model.mjs';
import {displayCode,displayName,displayRecordLabel,capabilityNameCandidate,capabilitySourceTitle,opportunityCostLabel} from '../public/display.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
const model=buildModel(data);
// Catalogue in use until 2026-10-16, with the truncated names the candidates were written for.
const old=JSON.parse(fs.readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const legacy=buildModel({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource});

test('standard display expands Mgmt. and preserves truncation without guessing a formal label',()=>{
 assert.equal(displayName({id:'B.06.8.1',reference:'B.06.8.1 Supply Chain……Reporting Mgmt.'}),'Supply Chain … Reporting Management');
 assert.equal(displayName({id:'B.06.8.1',reference:'B.06.8.1 Supply Chain……Reporting Mgmt.'}).includes('Standard Reporting'),false);
});

test('single-dimension record labels normalize the code once and keep the display name',()=>{
 const node={id:'B.06.2.02',label:'B.06.2.02 Demand Planning'};
 assert.equal(displayCode(node.id),'B.06.2.2');
 assert.equal(displayRecordLabel(node),'B.06.2.2 Demand Planning');
});

test('full LeanIX name candidates are limited to the four truncated standards',()=>{
 const expected={
  'B.06.1.6':['Supply Chain (Logistics) IT, Data & Innovation Management','P41 / P74'],
  'B.06.1.7':['Supply Chain (Logistics) Process Management','P48 / P68'],
  'B.06.8.1':['Supply Chain (Logistics) Standard Reporting Management','P77'],
  'B.06.8.2':['Supply Chain (Logistics) Visualization and Tracking Management','P77']
 };
 for(const [id,[name,source]] of Object.entries(expected)){
  const node=legacy.caps.get(id),candidate=capabilityNameCandidate(node);
  assert.deepEqual(candidate,{name,source});
  assert.equal(capabilitySourceTitle(node,'unused source',id),node.reference);
 }
 assert.equal(capabilityNameCandidate(legacy.caps.get('B.06.1.4')),null);
 assert.equal(capabilityNameCandidate({id:'B.06.8.1',reference:'B.06.8.1 Standard Reporting Management'}),null);
 assert.equal(capabilitySourceTitle(null,'Raw LeanIX value without a catalogue code','raw'),'Raw LeanIX value without a catalogue code');
});

test('the business capability standard has no truncated names, so no name candidate is offered',()=>{
 const ellipsis=String.fromCharCode(8230);
 assert(!data.capabilityRows.flat().some(value=>String(value??'').includes(ellipsis)));
 assert.deepEqual([...model.caps.values()].filter(node=>capabilityNameCandidate(node)).map(node=>node.id),[]);
 const standard={
  'B.06.1.6':'Supply Chain (Logistics) IT, Data & Innovation Management',
  'B.06.1.7':'Supply Chain (Logistics) Process Management',
  'B.06.8.1':'Supply Chain (Logistics) Standard Reporting',
  'B.06.8.2':'Supply Chain (Logistics) Monitoring and Dashboarding'
 };
 for(const [id,name] of Object.entries(standard)){
  const node=model.caps.get(id);
  assert.equal(displayName(node),name);assert.equal(capabilitySourceTitle(node,'unused source',id),id+' '+name);
 }
 // The standard confirms two former candidates and names the two B.06.8 capabilities differently.
 assert.deepEqual(Object.keys(standard).filter(id=>capabilityNameCandidate(legacy.caps.get(id)).name===standard[id]),['B.06.1.6','B.06.1.7']);
});

test('scope-excluded applications show Out of scope for annual cost',()=>{
 assert.equal(opportunityCostLabel({scopeNote:'no score,not bbm',operationCostScore:3}),'Out of scope');
 assert.equal(opportunityCostLabel({scopeNote:'with score',operationCostScore:3}),'¥50,000 / year');
});

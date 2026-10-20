import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPairReviews,purposeLine,relationshipClue,PAIR_REVIEW_STATUSES} from '../public/similarity-guide.mjs';
import {workspaceData} from '../public/workspace.mjs';

test('pair reviews keep only known statuses on pair keys, with bounded text', () => {
 const out=cleanPairReviews({'a::b':{status:'Complementary',reason:'x'.repeat(600),reviewer:'Owner',date:'2026-10-20T10:00'},'bad':{status:'Complementary'},'c::d':{status:'Duplicate'},'e::f':null});
 assert.deepEqual(Object.keys(out),['a::b']);
 assert.equal(out['a::b'].reason.length,500);
 assert.equal(out['a::b'].date,'2026-10-20');
 assert.deepEqual(cleanPairReviews([1,2]),{});
 assert.ok(PAIR_REVIEW_STATUSES.includes('Pending review'));
});

test('the purpose line quotes the original description and never invents one', () => {
 assert.equal(purposeLine({Description:''}),'Not provided');
 assert.equal(purposeLine({Description:'Tracks inbound trucks at the gate. Also prints labels.'}),'Tracks inbound trucks at the gate.');
});

test('a relationship clue appears only when one description names the other application', () => {
 assert.match(relationshipClue({Name:'WMS Test',Description:'Test environment of WMS Prod for the plant.'},{Name:'WMS Prod',Description:''}),/mentions WMS Prod/);
 assert.equal(relationshipClue({Name:'Alpha',Description:'Scans pallets.'},{Name:'Bravo',Description:'Plans routes.'}),'');
});

test('pair reviews travel with the workspace export', () => {
 const data=workspaceData({apps:[{Name:'A'}],capabilityRows:[],processRows:[],pairReviews:{'a::b':{status:'Related environments',reason:'Same system',reviewer:'',date:'2026-10-20'}}});
 assert.equal(data.pairReviews['a::b'].status,'Related environments');
});

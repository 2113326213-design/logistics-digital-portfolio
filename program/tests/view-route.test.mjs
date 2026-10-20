import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tabFromSearch,searchForTab} from '../public/view-route.mjs';

test('shared view URLs take precedence and preserve unrelated query parameters',()=>{
 assert.equal(tabFromSearch(''),'overview');
 assert.equal(tabFromSearch('?tab=similarity'),'similarity');
 assert.equal(tabFromSearch('?tab=review'),'overview');
 assert.equal(tabFromSearch('?tab=opportunities'),'opportunities');
 assert.equal(searchForTab('?foo=bar','opportunities'),'foo=bar&tab=opportunities');
 assert.equal(tabFromSearch('?tab=unknown'),'overview');
 assert.equal(searchForTab('?foo=bar','landscape'),'foo=bar&tab=landscape');
 assert.equal(searchForTab('?foo=bar&tab=review','overview'),'foo=bar');
});

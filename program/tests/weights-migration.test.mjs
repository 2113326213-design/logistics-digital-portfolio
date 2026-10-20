import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceData,importWorkspace,exportWorkspace} from '../public/workspace.mjs';
import {DEFAULT_WEIGHTS} from '../public/weighted.mjs';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url)));
test('unversioned former defaults adopt the confirmed meeting weights',()=>{
 const next=workspaceData({...data,similarityWeights:{name:.1,description:.4,cap:.4,process:.1}});
 assert.deepEqual(next.similarityWeights,{name:.1,description:.2,cap:.3,process:.4});
 assert.deepEqual(next.similarityWeights,DEFAULT_WEIGHTS);
 assert.equal(next.similarityWeightsVersion,2);
});
test('custom weights and newly chosen former ratios survive workspace export and import',()=>{
 for(const weights of [{name:.25,description:.25,cap:.25,process:.25},{name:.1,description:.4,cap:.4,process:.1}]){
  const next=workspaceData({...data,similarityWeights:weights,similarityWeightsVersion:2});
  assert.deepEqual(importWorkspace(exportWorkspace(next)).similarityWeights,weights);
 }
 const custom={name:.2,description:.2,cap:.5,process:.1};
 assert.deepEqual(workspaceData({...data,similarityWeights:custom}).similarityWeights,custom);
});

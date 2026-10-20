import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {filterLandscape} from '../public/landscape.mjs';

const initial=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));

test('displayed and canonical process codes find the same registered applications',()=>{
 const model=buildModel(initial),original=JSON.stringify(initial);
 for(const [shown,canonical,count] of [['M.I2D.10','M.I2D.010',20],['M.I2D.10.40.10','M.I2D.010.040.010',1]]){
  const displayResult=filterLandscape(model,'process',{query:shown}).apps;
  const rawResult=filterLandscape(model,'process',{query:canonical}).apps;
  assert.equal(displayResult.length,count);assert.deepEqual(displayResult.map(a=>a.id),rawResult.map(a=>a.id));
 }
 assert.equal(JSON.stringify(initial),original,'search must not normalize stored IDs');
});

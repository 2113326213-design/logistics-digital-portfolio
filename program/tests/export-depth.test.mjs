import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity} from '../public/weighted.mjs';
import {similarityCSV} from '../public/exports.mjs';
const fixture=()=>({source:'inventory.xlsx',taxonomySource:'taxonomy.xlsx',capabilityRows:[['B.06 Logistics','B.06.1 Storage','B.06.1.1 Receive'],['B.06 Logistics','B.06.1 Storage','B.06.1.2 Putaway']],processRows:[],apps:[{ID:'A',Name:'Warehouse A',Description:'warehouse records',Entity:'Plant A','Business Capabilities':'B.06.1.1 Receive;B.06.1.2 Putaway',Processes:''},{ID:'B',Name:'Warehouse B',Description:'warehouse records',Entity:'Plant B','Business Capabilities':'B.06.1 Storage',Processes:''}]});
function records(csv){
 const rows=csv.slice(1).split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
 assert(rows.slice(1).every(row=>row.length===rows[0].length),'every exported row must align with its header');
 return rows.slice(1).map(row=>Object.fromEntries(rows[0].map((header,index)=>[header,row[index]])));
}
test('CSV distinguishes lower-depth score from deferred original details',()=>{
 const data=fixture(),index=createSimilarity(buildModel(data),'cap');
 const [row]=records(similarityCSV([index.compare('A','B')],'cap',data));
 assert.equal(row['Target match score (out of 100)'],'100.0000');
 assert.equal(row['Comparison levels'],'L2');
 assert.equal(row['Depth adjusted'],'Yes');
 assert.equal(row['Target codes (denominator)'],'1');
 assert.equal(row['Compared target code IDs'],'B.06.1');
 assert.equal(row['Deferred target detail code IDs'],'B.06.1.1; B.06.1.2');
 assert.equal(row['Deferred peer detail code IDs'],'');
 assert.equal(row['Source target levels'],'L3');assert.equal(row['Source peer levels'],'L2');
 assert.doesNotMatch(row['Coverage scope'],/Full/);
 assert.match(row['Calculation method'],/does not confirm a match at the deeper level/);
 assert.equal(row['Target registered code IDs'],'B.06.1.1; B.06.1.2');
});
test('Weighted CSV records comparison levels and deferred evidence in both directions',()=>{
 const data=fixture(),index=createWeightedSimilarity(buildModel(data),{name:.1,description:.2,cap:.7,process:0});
 const [row]=records(similarityCSV([index.pair('A','B')],'weighted',data));
 assert.equal(row['A to B Business Capability Comparison levels'],'L2');
 assert.equal(row['B to A Business Capability Comparison levels'],'L2');
 assert.equal(row['A to B Business Capability Deferred target detail code IDs'],'B.06.1.1; B.06.1.2');
 assert.equal(row['B to A Business Capability Deferred peer detail code IDs'],'B.06.1.1; B.06.1.2');
 assert.equal(row['A to B Process contribution (points out of 100)'],'0');
 assert.equal(row['A to B Process status'],'Excluded');
});


test('CSV does not label target-only codes as confirmed when the peer branch is unresolved',()=>{
 const data=fixture();
 data.apps[0]['Business Capabilities']='B.06.1.1 Receive';
 data.apps[1]['Business Capabilities']='B.06.1.2 Putaway;Unrecognized source capability';
 const result=createSimilarity(buildModel(data),'cap').compare('A','B');
 assert.equal(result.coverage,null);
 const [row]=records(similarityCSV([result],'cap',data));
 assert.equal(row['Confirmed target-only code IDs'],'');
 assert.equal(row['Target registered code IDs'],'B.06.1.1');
});

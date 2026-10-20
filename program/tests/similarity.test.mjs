import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {explainResult} from '../public/explanations.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
const model=buildModel(data),indexes={cap:createSimilarity(model,'cap'),process:createSimilarity(model,'process')};
// Four shared codes out of six targets count as 4/6, regardless of branch sizes.
const capRows=[['B.06 Logistics','B.06.1 Strategy','B.06.2 Planning'],...['B.06.1.1','B.06.1.2','B.06.2.1','B.06.2.2','B.06.2.3','B.06.2.4'].map(id=>[id+' Detail'])];
const make=(id,codes)=>({ID:id,Name:id,Entity:id,'Business Capabilities':codes.map(c=>c+' Detail').join(';'),Processes:''});
const target=make('A',['B.06.1.1','B.06.1.2','B.06.2.1','B.06.2.2','B.06.2.3','B.06.2.4']);
const peer=make('B',['B.06.1.1','B.06.2.1','B.06.2.2','B.06.2.3']);
const sample=buildModel({apps:[target,peer],capabilityRows:capRows,processRows:[]});
let index=createSimilarity(sample,'cap'),r=index.compare('A','B');
assert.equal(r.coverage,4/6);assert.equal(r.commonCount,4);assert.equal(r.targetCount,6);
assert.deepEqual(r.branches.map(b=>b.coverage),[.5,.75]);assert.equal(index.compare('B','A').coverage,1);
assert.match(explainResult(r),/4 shared codes \/ 6 target codes/);

// A repeated leaf and its already-represented parent must not change the denominator.
const duplicated={...target,'Business Capabilities':target['Business Capabilities']+';B.06.1.1 Detail;B.06.1 Strategy;B.06 Logistics'};
const dedup=createSimilarity(buildModel({apps:[duplicated,peer],capabilityRows:capRows,processRows:[]}),'cap').compare('A','B');
assert.equal(dedup.targetCount,6);assert.equal(dedup.commonCount,4);assert.equal(dedup.coverage,4/6);

// Several fine peer codes map to one maintained coarse target code, counted once.
const coarse=make('C',['B.06.1']);
const projection=createSimilarity(buildModel({apps:[coarse,target],capabilityRows:capRows,processRows:[]}),'cap');
assert.equal(projection.compare('C','A').targetCount,1);assert.equal(projection.compare('C','A').commonCount,1);assert.equal(projection.compare('C','A').coverage,1);
// Owner decision 2026-10-16 (option A): only the B.06.1 lineage is lowered to C's L2 record;
// the unrelated B.06.2 branch keeps its four L3 codes in the denominator (1 shared / 5).
assert.equal(projection.compare('A','C').coverage,1/5,'unrelated B.06.2 codes stay in the denominator at their registered level');
assert.deepEqual(projection.compare('A','C').comparisonLevels,[2,3]);

// Closest-peer ranking follows covered codes: 5/10 must outrank 1/10.
const rankCodes=['B.06.1.1',...Array.from({length:9},(_,i)=>'B.06.2.'+(i+1))];
const rankRows=[['B.06 Logistics','B.06.1 Strategy','B.06.2 Planning'],...rankCodes.map(id=>[id+' Detail'])];
const ranked=createSimilarity(buildModel({apps:[make('Target',rankCodes),make('One',[rankCodes[0]]),make('Five',rankCodes.slice(1,6))],capabilityRows:rankRows,processRows:[]}),'cap').peers('Target');
assert.deepEqual(ranked.map(r=>[r.peer.app.id,r.coverage]),[['Five',.5],['One',.1]]);

// Mixed maintained depths retain all four target codes: three matches give 3/4.
const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['T','L1','M.T.2','Two'],['T','L2','M.T.1.1','Broad'],['T','L2','M.T.1.2','Detail parent'],['T','L3','M.T.1.2.1','Detail one'],['T','L3','M.T.1.2.2','Detail two']];
const app=(id,process)=>({ID:id,Name:id,'Business Capabilities':'',Processes:process});
index=createSimilarity(buildModel({apps:[app('A','BBM PM T Broad L2;BBM PM T Detail one L3;BBM PM T Detail two L3;BBM PM T Two L1'),app('B','BBM PM T Broad L2;BBM PM T Detail one L3;BBM PM T Two L1')],capabilityRows:[],processRows}),'process');
r=index.compare('A','B');assert.equal(r.targetCount,4);assert.equal(r.commonCount,3);assert.equal(r.coverage,.75);
assert.equal(index.compare('B','A').coverage,1);

// A shared L0 chain identifies a broad area, not a confirmed functional match.
const broadProcessRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['U','L0','M.U','Other root'],['U','L1','M.U.1','Other one']];
const broadProcessIndex=createSimilarity(buildModel({apps:[app('Broad','BBM PM T Root L0'),app('Broad2','BBM PM T Root L0'),app('Detailed','BBM PM T One L1'),app('Detailed2','BBM PM T One L1'),app('Other','BBM PM U Other root L0'),app('Mixed','BBM PM T Root L0;BBM PM U Other one L1'),app('Mixed detailed','BBM PM T One L1;BBM PM U Other one L1')],capabilityRows:[],processRows:broadProcessRows}),'process');
for(const peerId of ['Broad2','Detailed','Other']){
 const broad=broadProcessIndex.compare('Broad',peerId);
 assert.equal(broad.coverage,null);
 assert.equal(broad.status,'insufficient-depth');
 assert.equal(broad.branches[0].coverage,null);
 assert.match(broad.reason,/L0.*L1/);
 assert.match(broad.branches[0].reason,/L0.*L1/);
}
assert.equal(broadProcessIndex.compare('Detailed','Broad').coverage,null);
assert.equal(broadProcessIndex.compare('Detailed','Detailed2').coverage,1);
const mixedBroad=broadProcessIndex.compare('Mixed','Mixed detailed');
assert.equal(mixedBroad.coverage,null);
assert.equal(mixedBroad.status,'partial');
assert.deepEqual(mixedBroad.branches.map(b=>b.coverage),[null,1]);
assert.equal(mixedBroad.comparableBranches,1);

// L3V is Level 3 (owner decision 2026-10-19, "level 3v就是level3"): an L3V record is matched by name at level 3
// exactly like L3. An unknown L3V name is an unmatched Level 3 record: it stays in the source review and is pending,
// so the direction with it as target has no score; a peer's extra pending record cannot undo a full target match.
const variantData={apps:[app('Variant','BBM PM T One L1;BBM PM T Unknown variant L3V'),app('Standard','BBM PM T One L1')],capabilityRows:[],processRows};
const variantModel=buildModel(variantData),variantIndex=createSimilarity(variantModel,'process');
assert.deepEqual(variantModel.issues.map(i=>[i.app,i.type,i.value]),[['Variant','流程未匹配层级表','BBM PM T Unknown variant L3V']]);
assert.deepEqual(variantIndex.scopes.get('Variant').pending.map(p=>[p.value,p.reason]),[['BBM PM T Unknown variant L3V','流程未匹配层级表']]);
assert.deepEqual(variantIndex.scopes.get('Variant').known.map(n=>n.id),['M.T.1']);
assert.equal(variantIndex.compare('Variant','Standard').coverage,null);
assert.equal(variantIndex.compare('Variant','Standard').status,'needs-review');
assert.equal(variantIndex.compare('Variant','Standard').reason,'目标应用仍有未确认的分类。');
assert.equal(variantIndex.compare('Standard','Variant').coverage,1);
assert.equal(variantIndex.compare('Standard','Variant').status,'comparable');
// Each L3V record gets the same result as the same record marked L3: a unique name in its chain is matched,
// an L2-only name is not found at level 3, a name with two L3 codes is ambiguous and another chain is a chain difference.
const l3vRows=[...processRows,['T','L2','M.T.2.1','Twin parent'],['T','L3','M.T.2.1.1','Twin'],['T','L3','M.T.1.2.3','Twin']];
const l3vRecords=suffix=>['BBM PM T Detail one','BBM PM T Broad','BBM PM T Twin','BBM PM U Detail two'].map(record=>record+' '+suffix).join(';');
const levelModel=buildModel({apps:[app('Marked L3V',l3vRecords('L3V')),app('Marked L3',l3vRecords('L3'))],capabilityRows:[],processRows:l3vRows});
const outcome=id=>{const a=levelModel.apps.find(a=>a.id===id);return {process:a.process,issues:levelModel.issues.filter(i=>i.appId===id).map(i=>[i.value.replace(/ L3V?$/,''),i.type,i.candidates.map(n=>n.id).sort()])};};
assert.deepEqual(outcome('Marked L3V'),{process:['M.T.1.2.1'],issues:[
 ['BBM PM T Broad','流程未匹配层级表',[]],
 ['BBM PM T Twin','流程名称对应多个编号',['M.T.1.2.3','M.T.2.1.1']],
 ['BBM PM U Detail two','流程链编号存在差异',['M.T.1.2.2']]]});
assert.deepEqual(outcome('Marked L3'),outcome('Marked L3V'));
// A matched L3V record is a Level 3 code in the comparison and in the denominator.
const matchedIndex=createSimilarity(buildModel({apps:[app('Both L3V','BBM PM T Detail one L3V;BBM PM T Detail two L3V'),app('Both L3','BBM PM T Detail one L3;BBM PM T Detail two L3'),app('One L3','BBM PM T Detail one L3')],capabilityRows:[],processRows}),'process');
assert.deepEqual(matchedIndex.scopes.get('Both L3V').known.map(n=>[n.id,n.level]),[['M.T.1.2.1',3],['M.T.1.2.2',3]]);
assert.deepEqual(matchedIndex.scopes.get('Both L3V').pending,[]);
assert.equal(matchedIndex.compare('Both L3V','Both L3').coverage,1);assert.equal(matchedIndex.compare('Both L3','Both L3V').coverage,1);
assert.deepEqual(matchedIndex.compare('Both L3V','Both L3').comparisonLevels,[3]);
assert.equal(matchedIndex.compare('Both L3V','One L3').coverage,1/2);assert.equal(matchedIndex.compare('Both L3V','One L3').targetCount,2);
assert.equal(matchedIndex.compare('One L3','Both L3V').coverage,1);

// Mixed branches use their common depth without dropping unrelated branches.
const partial=createSimilarity(buildModel({apps:[make('A',['B.06.1.1','B.06.2.1']),make('B',['B.06.1.1','B.06.2'])],capabilityRows:capRows,processRows:[]}),'cap').compare('A','B');
assert.equal(partial.targetCount,2);assert.equal(partial.commonCount,2);assert.equal(partial.coverage,1);assert.equal(partial.status,'comparable');assert.deepEqual(partial.comparisonLevels,[2,3]);

const cap=indexes.cap;
const appId=name=>model.apps.find(a=>a.Name===name).id;
assert.equal(cap.compare(appId('ARS'),appId('AGR w/ Camera')).coverage,1);
assert.equal(cap.compare(appId('AGR w/ Camera'),appId('ARS')).coverage,1);
// Legacy catalogue (before 2026-10-16): AR Stock Taking's B.06.4 meaning is held and RBHP_LOG SupplierManager's B.06.9 lineage is not catalogued.
const old=JSON.parse(fs.readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url)));
const legacyModel=buildModel({...data,capabilityRows:old.capabilityRows,taxonomySource:old.taxonomySource}),legacyCap=createSimilarity(legacyModel,'cap');
assert.equal(legacyCap.compare(appId('AR Stock Taking'),appId('RBHP_LOG SupplierManager')).coverage,null);
assert.equal(legacyCap.compare(appId('RBHP_LOG SupplierManager'),appId('AR Stock Taking')).coverage,null);
// Business capability standard: both are fully catalogued with disjoint codes ({B.06.1.4, B.06.4} vs {B.06.6, B.06.8.2, B.06.9.1}): 0/2 and 0/3.
assert.equal(cap.compare(appId('AR Stock Taking'),appId('RBHP_LOG SupplierManager')).coverage,0);
assert.equal(cap.compare(appId('RBHP_LOG SupplierManager'),appId('AR Stock Taking')).coverage,0);
assert.equal(cap.compare(appId('RBHP_LOG SupplierManager'),appId('AR Stock Taking')).targetCount,3);
const counts=model.apps.map(a=>cap.peers(a.id).filter(r=>r.coverage!==null).length);
const comparableTargets=[...cap.scopes.values()].filter(scope=>scope.known.length&&scope.known.every(node=>node.level>=2)&&!scope.pending.length);
assert.equal(counts.filter(Boolean).length,comparableTargets.length);
for(const scope of cap.scopes.values())if(scope.deepest===1)assert(cap.peers(scope.app.id).every(result=>result.coverage===null),'B.06 root alone does not establish comparable capability detail');
const all=cap.peers(appId('AR Stock Taking')),same=cap.peers(appId('AR Stock Taking'),'same'),other=cap.peers(appId('AR Stock Taking'),'other');
assert.equal(same.length+other.length,all.length);assert.ok(all.every(r=>r.target.app.id!==r.peer.app.id));assert.ok(same.every(r=>r.peer.app.Entity==='RBCD'));
const legacyAll=legacyCap.peers(appId('AR Stock Taking'));assert.equal(legacyAll.length,all.length);
assert(legacyAll.every(r=>r.coverage===null),'with the legacy catalogue AR Stock Taking retains an unresolved semantic registration, so no pair has complete capability evidence');
assert.equal([...legacyCap.scopes.values()].reduce((n,scope)=>n+scope.semanticConcerns.length,0),22);
// The standard names match the seven held source meanings, so no application is held and AR Stock Taking has a full result for each other comparable target.
assert.equal([...cap.scopes.values()].reduce((n,scope)=>n+scope.semanticConcerns.length,0),0);
assert.deepEqual(all.filter(r=>r.coverage!==null).map(r=>r.peer.app.id).sort(),comparableTargets.map(scope=>scope.app.id).filter(id=>id!==appId('AR Stock Taking')).sort());
assert.equal(all.filter(r=>r.coverage!==null).length,68);
assert.equal(model.issues.length,22);assert.equal(model.taxonomyIssues.length,2);
// Bundled data, L3V as Level 3: the six L3V records with applied mappings count as their L3 codes; the seven without a
// standard L3 of the same name (at any level, in any chain) are pending like any unmatched L3, so none of their four
// applications has a process score as target.
const processScopes=indexes.process.scopes;
const l3vPending=[...processScopes.values()].flatMap(scope=>scope.pending.filter(p=>/\bL3V\s*$/i.test(p.value)).map(p=>[scope.app.Name,p.value,p.reason])).sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1]));
assert.deepEqual(l3vPending,[
 ['AUTO-RACK','BBM PM I2D Putaway to Automated Warehouse L3V','流程未匹配层级表'],
 ['RBCD LOM Scrap Management Platform','BBM PM B2P Manage Fixed Assets Scrapping L3V','流程未匹配层级表'],
 ['RBCD LOM Scrap Management Platform','BBM PM I2P Disposal due to Scrapping L3V','流程未匹配层级表'],
 ['Szh5_ASRS_WCS_WMS','BBM PM I2D Pick via Picking Area (Goods to Man)-Automated warehouse L3V','流程未匹配层级表'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Move Material Production to Production L3V','流程未匹配层级表'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Return from Production L3V','流程未匹配层级表'],
 ['VM-CN_WACOS_Szh5','BBM PM I2D Round quantity in material request and picking L3V','流程未匹配层级表']]);
for(const name of new Set(l3vPending.map(([name])=>name)))assert(indexes.process.peers(appId(name)).every(r=>r.coverage===null&&r.status==='needs-review'),name+' has a pending L3V record');
for(const [name,codes] of [['AUTO-RACK',['M.I2D.010.050.010']],['RBCD LOP Digital Dashboard',['M.M2S.030.030.020']],['RBCW LOM Dashboard',['M.I2D.020.110.030']],['RBCW LOM PSTU Management System',['M.I2D.020.010.050']],['RBHP_LOG AGV Performance Tracking System',['M.I2D.020.100.020','M.I2D.020.100.030']]]){
 const known=processScopes.get(appId(name)).known;
 for(const code of codes)assert(known.some(n=>n.id===code&&n.level===3),`${name}: mapped L3V record counts as ${code}`);
}
console.log('PASS: code-count coverage 4/6 and 3/4, duplicate/ancestor removal, single-count projection, count-based rankings, L0 process N/A, N/A preservation, L3V matched and pending as Level 3, comparable capability targets require L2 or deeper, legacy semantic evidence holds, peer filters and unresolved records.');

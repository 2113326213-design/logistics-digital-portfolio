// V19.2 (owner 2026-10-23: "我们现在来做那三个小问题的补救把"): the three gaps of the union rule (V19.1) that the bundled data
// did not show. A process in LeanIX but not in the Signavio list matches (V19.1); these tests make it count the same in the
// similarity check and in the "deeper level fills the levels above" rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {processIssues} from '../public/process-issues.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,portfolioCandidates} from '../public/weighted.mjs';
import {missingPairEvidence,pairResultLabel} from '../public/pair-status.mjs';
import {comparisonRecordEvidence} from '../public/comparison-records.mjs';

const base=()=>workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const app=(ID,Processes)=>({ID,Name:ID,Description:`${ID} handles warehouse steps.`,Entity:'Plant A',Division:'PS','Business Capabilities':'B.06.5.1 Inbound Planning','Lifecycle: Current Lifecycle':'active',Processes});
const withApps=apps=>{const data=base();return buildModel(workspaceData({...data,apps:[...data.apps,...apps],corrections:data.corrections,acceptedRecords:data.acceptedRecords}));};
const byName=(model,name)=>model.apps.find(a=>a.Name===name);
const pairOf=(model,a,b)=>{const data=base();return portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights)).pairs.find(p=>[p.target.app.Name,p.peer.app.Name].sort().join('|')===[a,b].sort().join('|'));};

test('gap 1: an application whose processes are all only in LeanIX is compared by those processes, not reported as having none',()=>{
 const model=withApps([app('LX one','BBM PM I2D Some Local Step L3'),app('LX two','BBM PM I2D Some Local Step L3V;BBM PM I2D Another Local Step L3')]);
 const similarity=createSimilarity(model,'process'),one=byName(model,'LX one'),two=byName(model,'LX two');
 const scope=similarity.scopes.get(one.id);
 assert.deepEqual(scope.known.map(n=>[n.id,n.level]),[['LeanIX · I2D Some Local Step',3]],'its LeanIX process is a comparison record');
 assert.deepEqual(scope.pending,[]);
 const result=similarity.compare(one.id,two.id);
 assert.equal(result.status,'comparable');
 assert.equal(result.coverage,1,'L3 and L3V of the same LeanIX process are the same process (L3V is L3)');
 // Owner (2026-10-23, "不算，两个 E-Queue 算重合"): the LeanIX process that only "LX two" records does not lower its score.
 assert.equal(similarity.compare(two.id,one.id).coverage,1);
 const alone=withApps([app('LX three','BBM PM I2D Third Local Step L3'),app('LX one','BBM PM I2D Some Local Step L3')]),s3=createSimilarity(alone,'process');
 const r3=s3.compare(byName(alone,'LX three').id,byName(alone,'LX one').id);
 assert.deepEqual([r3.status,r3.coverage],['comparable',0],'nothing else to compare: no shared registration, not "no records"');
 const evidence=comparisonRecordEvidence(model,result,similarity.compare(two.id,one.id));
 assert(!JSON.stringify(evidence).includes('"empty":true'),'not "No process records supplied"');
 const pair=pairOf(model,'LX one','LX two');
 assert(!missingPairEvidence(pair).some(item=>item.kind==='Data missing'||/process/i.test(item.label)&&item.kind==='Needs confirmation'),JSON.stringify(missingPairEvidence(pair)));
 assert.notEqual(pairResultLabel(pair,50),'Data missing');
});

test('gap 2: a Signavio Level 0 with a LeanIX-only Level 3 is not "recorded only at Level 0"',()=>{
 const model=withApps([app('L0 and LX','BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Some Local Step L3'),app('LX one','BBM PM I2D Some Local Step L3')]);
 const scope=createSimilarity(model,'process').scopes.get(byName(model,'L0 and LX').id);
 assert.equal(scope.deepest,3);
 assert.deepEqual(scope.known.map(n=>n.id),['LeanIX · I2D Some Local Step'],'M.I2D is the chain of its LeanIX Level 3, not a separate chain');
 const pair=pairOf(model,'L0 and LX','LX one');
 assert(!missingPairEvidence(pair).some(item=>/only at Level 0/.test(item.reason)),JSON.stringify(missingPairEvidence(pair)));
});

test('gap 3: a Signavio process whose parent the list lacks fills the levels above, as a LeanIX-only process does',()=>{
 const model=withApps([app('Signavio L3','BBM PM I2D Putaway to Warehouse Destination L3'),app('LX L3','BBM PM I2D Some Local Step L3')]);
 const coded=byName(model,'Signavio L3'),local=byName(model,'LX L3');
 assert.deepEqual(coded.processMatches.map(m=>m.id),['M.I2D.010.050.020']);
 model.procs.delete('M.I2D.010.050');// its Level 2 parent is not in the Signavio list
 const report=maintenanceReport(model,{},'process');
 assert.deepEqual(processIssues(model,coded).filter(i=>i.level!==3),[],'no "Level 2 parent not in catalogue" or "Level 2 missing"');
 assert.deepEqual(report.coverage.get(coded.id).get(2),[{raw:'BBM PM I2D Putaway to Warehouse Destination L3',code:'M.I2D.010.050.020',parent:null,parentInLeanix:true}]);
 for(const level of [0,1,2])assert.equal(report.levels[level].valid.includes(coded),report.levels[level].valid.includes(local),`Level ${level}: the same as a LeanIX-only process`);
 assert(report.levels[2].valid.includes(coded));
 // A capability still needs its parent in the capability standard.
 const cap=maintenanceReport(model,{},'cap');
 assert(cap.levels.find(l=>l.level===2).filled.includes(coded),'B.06.5.1 fills L2 through the standard parent B.06.5');
});

test('owner example: a LeanIX process only one side records does not lower the score (the E-Queue and automated warehouse pairs)',()=>{
 const data=base(),model=buildModel(data),similarity=createSimilarity(model,'process'),id=name=>byName(model,name).id;
 // RBCW E-Queue system: Manage Time-Windows (Signavio) and Register Truck (LeanIX only); Karis records only Time-Windows.
 assert.equal(similarity.compare(id('RBCW E-Queue system'),id('RBCC E-Queue system(Karis)')).coverage,1);
 const pairs=portfolioCandidates(createWeightedSimilarity(model,data.similarityWeights)).pairs;
 const overlap=pairs.filter(p=>pairResultLabel(p,data.similarityThreshold??50)==='Potential overlap').map(p=>[p.target.app.Name,p.peer.app.Name].sort().join(' <-> '));
 for(const pair of ['AUTO-RACK <-> RBCW Auto Warehouse Management System','AUTO-RACK <-> Szh5_ASRS_WCS_WMS','RBCC E-Queue system(Karis) <-> RBCW E-Queue system','RBCW Auto Warehouse Management System <-> Szh5_ASRS_WCS_WMS'])assert(overlap.includes(pair),pair);
 assert.equal(overlap.length,13);
});

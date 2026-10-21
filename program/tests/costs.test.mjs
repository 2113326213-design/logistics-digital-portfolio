import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {costSummary,cleanCostScore,operationCostScoresFromSheets,annualCost,formatAnnualCost,formatRMB} from '../public/costs.mjs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {workspaceData,importWorkspace,exportWorkspace,mergeBundledCorrections} from '../public/workspace.mjs';
const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
test('confirmed annual CNY cost bands produce the confirmed estimate while preserving missing scores',()=>{
 // V9.17 (owner workbook 2026-10-21, Parameter Score re-scored): 14 cost scores changed and CGQB_Logistic_system_Q (score 5) left the
 // list. Derived by hand from V9.16 ({1:10,2:9,3:15,4:12,5:25}, ¥4,140,000): seven 1 → 5 (−¥1,330,000), two 5 → 1 (+¥380,000), ARS 5 → 4
 // (+¥10,000), Iris 4 → 2 (+¥80,000), EDCN AWS and RBCC LOG Control Tower V2 3 → 5 (−¥80,000), RBCC_VNA task management 2 → 4
 // (−¥80,000), CGQB_Logistic_system_Q removed (−¥10,000): ¥3,110,000 over all applications with a score.
 assert.deepEqual(costSummary(data.apps),{total:75,scored:70,missing:5,distribution:{1:5,2:9,3:13,4:13,5:30},annualTotal:3110000,currency:'CNY',openEndedCount:0,scenario20:622000});
 // The six RBCC score-1 applications of V9.16 are all re-scored 5; RBCC I4.0 Visualization (Davis) and PESS are re-scored 1.
 assert.deepEqual(data.apps.filter(a=>a.Entity==='RBCC'&&a.operationCostScore===1).map(a=>a.Name).sort(),['RBCC I4.0 Visualization (Davis)','RBCC Production Excution Support System(PESS)']);
 assert.deepEqual(importWorkspace(exportWorkspace(data)).apps,data.apps);
 for(const value of [0,6,1.5,'EUR 100000',true,[],{}])assert.throws(()=>cleanCostScore(value));
 for(const value of ['',null,undefined])assert.equal(cleanCostScore(value),null);
});
test('score 1 uses a fixed estimate and unknown costs remain unknown',()=>{
 assert.deepEqual([5,4,3,2,1].map(operationCostScore=>annualCost({operationCostScore}).amount),[10000,20000,50000,100000,200000]);
 assert.equal(formatAnnualCost({operationCostScore:1}),'¥200,000');
 assert.equal(formatAnnualCost({operationCostScore:2}),'¥100,000');
 assert.equal(formatAnnualCost({operationCostScore:null}),'Not recorded');
 assert.equal(formatRMB(3140000,{compact:true,openEnded:true}),'¥3,140k');
 assert.equal(costSummary([{operationCostScore:null}]).annualTotal,null);
 assert.equal(costSummary([]).scenario20,null);
 // V9.17: twelve of the fourteen re-scored applications are RBCC (all but RBCW E-Queue system, −¥190,000, and none removed):
 // ¥1,600,000 − ¥830,000.
 assert.equal(costSummary(data.apps.filter(a=>a.Entity==='RBCC')).annualTotal,770000);
});
test('Excel import joins costs by ID rather than name or row order, missing remains null',()=>{
 const sheets={'Logistic Apps':[['ID','Name','Division','Entity','Business Capabilities','Processes'],['A','Same name','GB','P','',''],['B','Same name','GB','P','',''],['C','No score','GB','P','','']],'Parameter Score':[['LeanIX ID','App Name','App operation cost'],['B','Other label','2'],['A','Same name','5']]};
 assert.deepEqual(inventoryFromSheets(sheets).map(a=>[a.ID,a.operationCostScore]),[['A',5],['B',2],['C',null]]);
 assert.equal(inventoryFromSheets({'Logistic Apps':sheets['Logistic Apps']})[0].operationCostScore,undefined);
 assert.throws(()=>operationCostScoresFromSheets({'Parameter Score':[['LeanIX ID','App operation cost'],['A',1],['A',2]]}),/duplicate/);
 assert.throws(()=>operationCostScoresFromSheets({'Parameter Score':[['LeanIX ID','App operation cost'],['A',1],['B',99]]}),{message:'Parameter Score row 3 (LeanIX ID B), App operation cost: App operation cost must be a score from 1 to 5, or blank. Found "99".'});
 assert.throws(()=>operationCostScoresFromSheets({'Parameter Score':[['Scores'],undefined,['LeanIX ID','App operation cost'],['A','x']]}),{message:'Parameter Score row 4 (LeanIX ID A), App operation cost: App operation cost must be a score from 1 to 5, or blank. Found "x".'},'workbook row, not header-relative');
});
test('only unchanged legacy app rows receive bundled scores; explicit blanks and changed apps stay intact',()=>{
 const old=structuredClone(data);for(const app of old.apps){delete app.operationCostScore;delete app.operationCostSource;}
 old.apps[0].Name+=' changed';old.apps[1].operationCostScore=null;
 const merged=mergeBundledCorrections(old,data);
 assert.equal(merged.data.apps[0].operationCostScore,undefined);
 assert.equal(merged.data.apps[1].operationCostScore,null);
 assert.equal(merged.data.apps[2].operationCostScore,data.apps[2].operationCostScore);
 assert.equal(merged.changed,true);
});

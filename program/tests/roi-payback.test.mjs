// ROI is shown as its payback period (owner decision 2026-10-20). Source workbook formula:
// =IF(O3=1,">2years",IF(O3=3,">1year","<1year")); only an explicit 5 reads "< 1 year".
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatROIPayback,roiPayback,roiPaybackNote,roiScoreText} from '../public/roi.mjs';
import {renderSourceRecords} from '../public/source-records.mjs';
import {workspaceData,exportWorkspace,importWorkspace} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const scored=roiScore=>({roiScore,scopeNote:'with score'});

test('1, 3 and 5 read as the workbook payback periods, exactly',()=>{
 assert.equal(formatROIPayback(scored(1)),'> 2 years');
 assert.equal(formatROIPayback(scored(3)),'> 1 year');
 assert.equal(formatROIPayback(scored(5)),'< 1 year');
 for(const s of [1,3,5])assert.doesNotMatch(formatROIPayback(scored(s)),/≥|≤|–|-|=/,'no boundary rules beyond the workbook');
});

test('blank, not scored and any other score are named, never "< 1 year"',()=>{
 for(const blank of [null,undefined,'','  '])assert.equal(formatROIPayback(scored(blank)),'Not provided');
 for(const note of ['no score,not an application','no score, not go-live','no score, not BBM']){
  assert.equal(formatROIPayback({roiScore:null,scopeNote:note}),'Not scored');
  assert.equal(formatROIPayback({roiScore:5,scopeNote:note}),'Not scored','an application outside scoring is not scored even with a score');
  assert.match(roiPaybackNote({roiScore:null,scopeNote:note}),/^Not scored: Marked as /);
 }
 assert.equal(formatROIPayback(scored(2)),'Needs confirmation (score 2)');
 assert.equal(formatROIPayback(scored(4)),'Needs confirmation (score 4)');
 assert.equal(formatROIPayback(scored(7)),'Needs confirmation (source value 7)');
 assert.equal(formatROIPayback(scored('abc')),'Needs confirmation (source value abc)');
 assert.equal(roiPayback(scored(4)).score,4,'the original score is kept for checking');
});

test('the source score stays in the data; only the display changes',()=>{
 const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
 const before=data.apps.map(a=>a.roiScore);
 const again=importWorkspace(exportWorkspace(data));
 assert.deepEqual(again.apps.map(a=>a.roiScore),before);
 assert.deepEqual(buildModel(data).apps.map(a=>a.roiScore),before);
 // Bundled data V9.17 (owner workbook 2026-10-21): 9 ROI scores changed (six 1 → 5 or 3, three 5 → 1), giving 12 × 1, 35 × 3, 24 × 5 for the
 // 71 applications of V9.16 that are scored. CGQB_Logistic_system_Q (5) left the list; RBCW LOM Dashboard (3), 360° Supplier dashboard (3)
 // and VM/LOG-Szh2_DAVIS (1) are not still active and show Not scored, with the five applications outside scoring: 11 / 33 / 23 / 8.
 const shown={};for(const a of data.apps){const t=formatROIPayback(a);shown[t]=(shown[t]||0)+1;}
 assert.deepEqual(shown,{'> 2 years':11,'> 1 year':33,'< 1 year':23,'Not scored':8});
});

test('every ROI display uses the payback period: details, cost table, source records, history',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes('<span>ROI (payback period)</span><strong title="${esc(roiPaybackNote(a))}">${esc(formatROIPayback(a))}</strong>'));
 const overview=readFileSync(new URL('../public/overview.mjs',import.meta.url),'utf8');
 assert(overview.includes('<th>ROI (payback period)</th>')&&overview.includes('${esc(formatROIPayback(a))}'));
 for(const file of ['app.js','overview.mjs','source-records.mjs','history-view.mjs','application-history.mjs'])assert.doesNotMatch(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),/ROI score<|'ROI score'|formatROIScore\(/,file);
 const records=renderSourceRecords({roiScore:3,roiSource:'Parameter Score · ROI · row 5',scopeNote:'with score','Business Capabilities':'','Processes':''},esc);
 assert.match(records,/ROI \(payback period\)/);assert.match(records,/&gt; 1 year/);assert.match(records,/Source ROI score: 3 \/ 5 · Parameter Score · ROI · row 5/);
 assert.equal(roiScoreText('1'),'> 2 years (score 1)');assert.equal(roiScoreText('5'),'< 1 year (score 5)');assert.equal(roiScoreText('4'),'Needs confirmation (score 4)');assert.equal(roiScoreText(''),'');
});

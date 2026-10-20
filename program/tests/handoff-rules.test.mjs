// Pins the user-confirmed examples and status rules from the 2026-10-15 handoff
// (00_Claude先读.md) plus the 2026-10-16 owner decisions on the real bundled data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createSimilarity} from '../public/similarity.mjs';
import {createWeightedSimilarity,portfolioCandidates,portfolioAtThreshold,belowThresholdConfirmedPairs} from '../public/weighted.mjs';
import {pairResultLabel,missingPairEvidence,comparisonLevelText,pairStatusReason} from '../public/pair-status.mjs';
import {comparisonRecordEvidence} from '../public/comparison-records.mjs';
import {similarityCSV} from '../public/exports.mjs';
import {scorePoints,meetsThreshold} from '../public/score-values.mjs';
import {formatPoints} from '../public/score-presentation.mjs';
import {createComparisonUI} from '../public/similarity-ui.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {scopeReason} from '../public/display.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data),index=createWeightedSimilarity(model),cap=createSimilarity(model,'cap'),process=createSimilarity(model,'process');
const app=name=>{const found=model.apps.find(a=>a.Name===name);assert(found,`bundled data includes ${name}`);return found;};
const pair=(a,b)=>index.pair(app(a).id,app(b).id);
const shown=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(scorePoints(value));
const component=(direction,key)=>direction.components.find(c=>c.key===key);
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-12,`${actual} ≈ ${expected}`);
const CJK=/[㐀-鿿]/;
function records(csv){
 const rows=csv.slice(1).split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
 assert(rows.slice(1).every(row=>row.length===rows[0].length),'every exported row must align with its header');
 return rows.slice(1).map(row=>Object.fromEntries(rows[0].map((header,i)=>[header,row[i]])));
}

test('confirmed example 1: ARS vs AGR w/ Camera is 30.869565… shown as 30.9, capability at L2 with L3 deferred, process at L3',()=>{
 const p=pair('ARS','AGR w/ Camera');
 assert.equal(p.status,'confirmed');close(p.coverage,0.30869565217391304);assert.equal(shown(p.coverage),'30.9');assert.equal(formatPoints(p.coverage),'30.9 pts');
 for(const direction of [p.forward,p.reverse]){
  const c=component(direction,'cap').result,pr=component(direction,'process').result;
  assert.equal(c.coverage,1);assert.deepEqual(c.comparisonLevels,[2]);assert.deepEqual(c.deferredLevels,[3]);
  assert.deepEqual(pr.comparisonLevels,[3],'capability L2 must not pull the complete L3 process comparison down');assert.deepEqual(pr.deferredLevels,[]);
 }
 assert.equal(comparisonRecordEvidence(model,cap.compare(app('ARS').id,app('AGR w/ Camera').id),cap.compare(app('AGR w/ Camera').id,app('ARS').id)).levelText,'Compared at Level 2; Level 3 detail deferred');
});

test('confirmed example 2: Iris vs RBCW process directions 100% and 1/3, total Unavailable because RBCW capability is only B.06',()=>{
 const p=pair('Iris','RBCW Auto Warehouse Management System');
 const forward=component(p.forward,'process').result,reverse=component(p.reverse,'process').result;
 assert.equal(forward.coverage,1);close(reverse.coverage,1/3);
 assert.deepEqual(forward.comparisonLevels,[2]);assert.deepEqual(forward.deferredTarget.map(s=>s.id),['M.I2D.020.030.030']);
 assert.equal(p.status,'incomplete');assert.equal(p.coverage,null);assert.equal(pairResultLabel(p),'More detail needed');
 const capability=component(p.forward,'cap').result;
 assert.equal(capability.coverage,null);assert.deepEqual(capability.comparisonLevels,[],'a B.06 root-only peer gives no compared level');assert.equal(comparisonLevelText(capability),'');
 assert.match(missingPairEvidence(p).map(item=>item.reason).join(' '),/B\.06 root/);
});

test('confirmed example 3: ARS–Iris 31.3, ARS–RCS-2000 32.1, Iris–RCS-2000 Unavailable with Review needed and a 30.0 subtotal',()=>{
 const ai=pair('ARS','Iris'),ar=pair('ARS','RCS-2000'),ir=pair('Iris','RCS-2000');
 close(ai.coverage,0.3125);assert.equal(shown(ai.coverage),'31.3');
 close(ar.coverage,0.32105263157894737);assert.equal(shown(ar.coverage),'32.1');
 assert.equal(ir.status,'investigation');assert.equal(ir.coverage,null);close(ir.directionalMinimum,0.3);assert.equal(shown(ir.directionalMinimum),'30');
 assert.equal(pairResultLabel(ir),'Review needed');assert.deepEqual(missingPairEvidence(ir),[]);
});

test('threshold labels are inclusive, use settled scores and keep Out of scope separate',()=>{
 const tower=pair('Control Tower','RBCC LOG Control Tower V2');
 assert.equal(tower.status,'confirmed');assert.equal(shown(tower.coverage),'34');
 assert.equal(pairResultLabel(tower,34),'Potential overlap','an exact 34 meets a threshold of 34');assert.equal(pairResultLabel(tower,35),'Not similar');
 const candidates=portfolioCandidates(index);
 assert(portfolioAtThreshold(candidates,34).confirmedPairs.some(p=>p.key===tower.key));
 assert(!belowThresholdConfirmedPairs(candidates.pairs,34).some(p=>p.key===tower.key));
 assert(belowThresholdConfirmedPairs(candidates.pairs,35).some(p=>p.key===tower.key));
 const excluded=candidates.pairs.find(p=>p.status==='excluded');assert.equal(pairResultLabel(excluded),'Out of scope');
 assert.equal(pairResultLabel({...tower,coverage:.5},50),'Potential overlap');assert.equal(pairResultLabel({...tower,coverage:.4999},50),'Not similar');
 assert.equal(meetsThreshold(0.33999999999999997,34),true);assert.equal(meetsThreshold(null,0),false);
});

test('displayed .x5 scores round the same way regardless of floating-point noise',()=>{
 assert.equal(shown(0.3125),'31.3');assert.equal(shown(0.5124999999999999),'51.3');assert.equal(shown(0.5125),'51.3');
 assert.equal(formatPoints(0.5124999999999999),'51.3 pts');assert.equal(scorePoints(0.30869565217391304).toFixed(4),'30.8696');
});

test('root-only and L0-only evidence never reports a compared level or a confirmed shared code',()=>{
 const rows=[['B.06 Logistics','B.06.1 Planning','B.06.1.1 Stock']];
 const make=(a,b)=>buildModel({apps:[{ID:'A',Name:'A',Description:'x','Business Capabilities':a,Processes:''},{ID:'B',Name:'B',Description:'x','Business Capabilities':b,Processes:''}],capabilityRows:rows,processRows:[]});
 const m=make('B.06 Logistics','B.06.1.1 Stock'),r=createSimilarity(m,'cap').compare('A','B');
 assert.equal(r.coverage,null);assert.deepEqual(r.comparisonLevels,[]);assert.equal(comparisonLevelText(r),'');
 const [row]=records(similarityCSV([r],'cap',{...m,source:'s',taxonomySource:'t',similarityWeights:undefined,apps:[]}));
 assert.equal(row['Comparison levels'],'Not compared');assert.equal(row['Confirmed shared code IDs'],'','B.06 root must not be exported as a confirmed shared code');
 assert.doesNotMatch(row.Status,/known branch results are retained/i);
 const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One']];
 const pm=buildModel({apps:[{ID:'A',Name:'A','Business Capabilities':'',Processes:'BBM PM T One L1'},{ID:'B',Name:'B','Business Capabilities':'',Processes:'BBM PM T Root L0'}],capabilityRows:[],processRows});
 const l0=createSimilarity(pm,'process').compare('A','B');
 assert.equal(l0.coverage,null);assert.deepEqual(l0.comparisonLevels,[]);
 const [processRow]=records(similarityCSV([l0],'process',{source:'s',taxonomySource:'t',apps:[]}));
 assert.equal(processRow['Confirmed shared code IDs'],'');assert.equal(processRow['Comparison levels'],'Not compared');
});

test('real CSV exports never list a B.06 root or L0 chain as a confirmed shared code',()=>{
 const ids=model.apps.map(a=>a.id),rows=[];
 for(const a of ids.slice(0,40))for(const b of ids)if(a!==b)rows.push(cap.compare(a,b));
 const exported=records(similarityCSV(rows,'cap',data));
 assert(exported.every(row=>!row['Confirmed shared code IDs'].split('; ').includes('B.06')));
 assert(exported.every(row=>row['Comparison levels']!=='L1'&&!/^L1 \//.test(row['Comparison levels'])),'the B.06 root (L1) is never a compared level');
 const processRows=[];for(const a of ids.slice(0,40))for(const b of ids)if(a!==b)processRows.push(process.compare(a,b));
 assert(records(similarityCSV(processRows,'process',data)).every(row=>row['Confirmed shared code IDs'].split('; ').every(id=>!id||id.split('.').length>2)),'L0 chains are never confirmed shared codes');
});

test('weighted CSV status matches the UI label and capability/process CSV marks Out of scope',()=>{
 const p=pair('Iris','RCS-2000'),tower=pair('Control Tower','RBCC LOG Control Tower V2');
 const csv=similarityCSV([p,tower],'weighted',data,{threshold:34}),[review,overlap]=records(csv);
 // Owner decision 2026-10-19 (c): a Review needed pair also states its code evidence. Iris–RCS-2000 has capability 1/1
 // and process 0/1 in both directions and no shared name or description word, so each directional total is
 // 0.3 × 1 + 0.4 × 0 = 0.30 (the 30.0 subtotal of confirmed example 3): '30 / 100' in the reason and
 // scorePoints(0.3).toFixed(4) = '30.0000' in the new column, which follows Status reason.
 assert.equal(review.Status,'Review needed');assert.equal(review['Status reason'],'No shared words in names or descriptions; compare the recorded functions. Code evidence 30 / 100 from capabilities and processes; not a pair score.');
 const header=[...csv.slice(1).split('\r\n')[0].matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1]);
 assert.equal(header[header.indexOf('Status reason')+1],'Review needed code evidence (out of 100)');
 assert.equal(review['Review needed code evidence (out of 100)'],'30.0000');assert.equal(review['Confirmed pair similarity (out of 100)'],'N/A','code evidence is not a pair score');
 assert.equal(overlap.Status,'Potential overlap');assert.equal(overlap['Review needed code evidence (out of 100)'],'','a confirmed pair has no code evidence');
 // Every unscored pair carries the same explanation as the UI hint.
 const unscored=portfolioCandidates(index).pairs.filter(q=>q.status!=='confirmed');
 const exported=records(similarityCSV(unscored,'weighted',data,{threshold:50}));
 exported.forEach((row,i)=>assert.equal(row['Status reason'],pairStatusReason(unscored[i],50,scopeReason),row['Unique pair key']));
 // The code evidence column is filled exactly on the Review needed rows, and their reason quotes the same value.
 exported.forEach(row=>assert.equal(row['Review needed code evidence (out of 100)']!=='',row.Status==='Review needed',row['Unique pair key']));
 const reviewRows=exported.filter(row=>row.Status==='Review needed');assert(reviewRows.length>0);
 for(const row of reviewRows)assert(row['Status reason'].endsWith(` Code evidence ${shown(Number(row['Review needed code evidence (out of 100)'])/100)} / 100 from capabilities and processes; not a pair score.`),row['Unique pair key']+': '+row['Status reason']);
 const zeroCodes=exported.find(row=>row.Status==='Not similar');assert.equal(zeroCodes['Status reason'],'No shared capabilities or processes');
 const excludedRow=exported.find(row=>/^Not in similarity check – /.test(row['Status reason']));assert(excludedRow);assert.equal(excludedRow.Status,'Out of scope');
 const outside=model.apps.find(a=>scopeReason(a)),inside=app('ARS');
 const [row]=records(similarityCSV([process.compare(outside.id,inside.id)],'process',data));
 assert.match(row['Opportunity scope'],/^Out of scope: /);assert.equal(row.Status,'Out of scope');
 const [inRow]=records(similarityCSV([cap.compare(app('ARS').id,app('Iris').id)],'cap',data));
 assert.equal(inRow['Opportunity scope'],'In scope');assert.equal(inRow.Status,'Comparable');
});

test('a capability recorded only outside B.06 keeps its label but explains the scope instead of asking to confirm the code',()=>{
 const scrap=app('RBCD LOM Scrap Management Platform'),peer=app('ARS');
 const p=index.pair(scrap.id,peer.id);
 assert.equal(pairResultLabel(p),'Needs confirmation');
 const reasons=missingPairEvidence(p).filter(item=>item.label==='Capability').map(item=>item.reason);
 assert(reasons.some(reason=>/only outside the B\.06 comparison scope \(B\.14\.09\.1 Waste Management\)/.test(reason)&&/does not mean the code is incorrect/.test(reason)),reasons.join(' | '));
 assert(!reasons.includes('Capability needs confirmation.'));
});

test('an L0-only chain beside deeper chains needs more detail, not confirmation',()=>{
 const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['U','L0','M.U','Other'],['U','L1','M.U.1','Other one']];
 const m=buildModel({apps:[{ID:'A',Name:'Shared A',Description:'shared words','Business Capabilities':'',Processes:'BBM PM T Root L0;BBM PM U Other one L1'},{ID:'B',Name:'Shared B',Description:'shared words','Business Capabilities':'',Processes:'BBM PM T One L1;BBM PM U Other one L1'}],capabilityRows:[],processRows});
 const p=createWeightedSimilarity(m,{name:.1,description:.2,cap:0,process:.7}).pair('A','B');
 assert.equal(component(p.forward,'process').result.status,'partial');
 assert.equal(pairResultLabel(p),'More detail needed');
 assert(missingPairEvidence(p).some(item=>/recorded only at Level 0/.test(item.reason)));
});

test('a direction with no comparable branch gives a specific reason, never "known branch results are retained"',()=>{
 const r=cap.compare(app('Iris').id,app('RBCW Auto Warehouse Management System').id);
 assert.equal(r.comparableBranches,0);assert.equal(r.coverage,null);
 assert.equal(r.reason,'对方登记深度不足。');
 for(const a of model.apps.slice(0,30))for(const b of model.apps)if(a.id!==b.id)for(const s of [cap,process]){const result=s.compare(a.id,b.id);if(result.comparableBranches===0)assert.notEqual(result.reason,'部分分支信息不足，保留已知分支结果。');}
 // Several different branch reasons and no comparable branch use the neutral fallback.
 const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['U','L0','M.U','Other'],['U','L1','M.U.1','Other one'],['V','L0','M.V','Third'],['V','L1','M.V.1','Third one']];
 const m=buildModel({apps:[{ID:'A',Name:'A','Business Capabilities':'',Processes:'BBM PM T Root L0;BBM PM U Other one L1'},{ID:'B',Name:'B','Business Capabilities':'',Processes:'BBM PM V Third one L1;BBM PM U Unlisted step L1'}],capabilityRows:[],processRows});
 const mixed=createSimilarity(m,'process').compare('A','B');
 assert.equal(mixed.comparableBranches,0);assert(new Set(mixed.branches.map(b=>b.reason)).size>=2);
 assert.equal(mixed.reason,'No branch can be compared yet; see the branch details.');
});

test('real direction changed by option A: VM-CN Auto labeling printing system → RBCW Auto Warehouse process is 2/8',()=>{
 const r=process.compare(app('VM-CN Auto labeling printing system').id,app('RBCW Auto Warehouse Management System').id);
 assert.equal(r.commonCount,2);assert.equal(r.targetCount,8);assert.equal(r.coverage,.25);
});

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function stubDocument(){
 const nodes=new Map();
 const node=()=>({innerHTML:'',value:'',hidden:false,open:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,listener){this.listeners??=new Map();if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);},fire(type,event){for(const listener of this.listeners?.get(type)||[])listener(event);},setAttribute(){},querySelectorAll(){return [];},querySelector(selector){this.children??=new Map();if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);},insertAdjacentHTML(where,html){this.innerHTML+=html;},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},append(){}});
 return {body:node(),createElement(){return {click(){},remove(){}};},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
}
function withUI(run){
 const old=globalThis.document,document=stubDocument();globalThis.document=document;
 try{run(createComparisonUI({getModel:()=>model,getData:()=>data,escape:esc,isSignedIn:()=>true}),document);}finally{globalThis.document=old;}
}

test('multi-select compares every pair: four applications give six pairs and five give ten',()=>withUI((ui,document)=>{
 const picks=['ARS','Iris','RCS-2000','AGR w/ Camera','Control Tower'].map(name=>app(name).id);
 ui.open({poolIds:picks.slice(0,4),contextLabel:'Four'});
 assert.match(document.getElementById('comparisonMatrix').innerHTML,/Comparing 4 applications · 6 pairs/);
 assert.equal((document.getElementById('comparisonMatrix').innerHTML.match(/class="compare-pair-row"/g)||[]).length,6);
 ui.open({poolIds:picks,contextLabel:'Five'});
 assert.match(document.getElementById('comparisonMatrix').innerHTML,/Comparing 5 applications · 10 pairs/);
}));

test('capability and process matrices mark Out of scope pairs and show English tooltips',()=>withUI((ui,document)=>{
 const outside=model.apps.find(a=>scopeReason(a)),ids=[outside.id,...model.apps.filter(a=>!scopeReason(a)).slice(0,12).map(a=>a.id)];
 for(const dim of ['cap','process']){
  ui.open({poolIds:ids,contextLabel:'Mixed',dimension:dim});
  ui.restoreState({...ui.getState(),selected:ids,dimension:dim});
  document.getElementById('compareDialog').open=true;ui.refresh();
  const html=document.getElementById('comparisonMatrix').innerHTML;
  assert.match(html,/<small>Out of scope<\/small>/,dim+' matrix marks the out-of-scope application');
  const titles=[...html.matchAll(/title="([^"]*)"/g)].map(match=>match[1]);
  assert(titles.length>0);assert(!titles.some(title=>CJK.test(title)),dim+' tooltips stay English');
 }
}));

test('the rendered Not similar diagnostic joins below-threshold confirmed pairs with zero-code investigation pairs',()=>withUI((ui,document)=>{
 ui.showPortfolio();
 const html=document.getElementById('portfolioProvisional').innerHTML,count=Number(html.match(/<summary>Not similar · (\d+) pairs?<\/summary>/)?.[1]);
 const pairs=portfolioCandidates(index).pairs,below=belowThresholdConfirmedPairs(pairs,50),zeroCodes=pairs.filter(p=>p.status==='investigation'&&pairResultLabel(p,50)==='Not similar');
 assert(below.length>0&&zeroCodes.length>0);
 assert.equal(count,below.length+zeroCodes.length);
}));

test('the single-pair comparison shows the pair status label next to the score',()=>withUI((ui,document)=>{
 ui.restoreState({focusAppId:app('Iris').id,focusPeerId:app('RCS-2000').id});
 const detail=document.getElementById('focusResult').innerHTML;
 assert.match(detail,/<strong>Unavailable<\/strong><em class="comparison-status">Review needed<\/em>/);
 ui.restoreState({focusAppId:app('ARS').id,focusPeerId:app('AGR w/ Camera').id});
 assert.match(document.getElementById('focusResult').innerHTML,/30\.9<small> \/ 100<\/small><\/strong><em class="comparison-status">Not similar<\/em>/);
}));

test('the in-app calculation note states the name rule of the 2026-10-19 owner decision',()=>withUI((ui,document)=>{
 // Decision (b), round 2 wording: names ignore single LETTERS (not every single character) and the LeanIX suffix.
 // The note closes each directional calculation, so the single-pair view shows it once per direction.
 const note='Name uses shared distinct words, ignoring single letters and the "(recovered …)" suffix; Description excludes common English filler words and URLs first.';
 ui.restoreState({focusAppId:app('ARS').id,focusPeerId:app('AGR w/ Camera').id});
 const html=document.getElementById('focusResult').innerHTML;
 assert.equal(html.split(note).length-1,2,'one note per direction');
 assert(!html.includes('Name uses shared distinct words;'),'the old note without the name rule is gone');
}));

test('the CSV exported from the comparison dialog uses the threshold chosen in the UI',async()=>{
 const saved={create:URL.createObjectURL,revoke:URL.revokeObjectURL,timer:globalThis.setTimeout};let blob;
 URL.createObjectURL=value=>{blob=value;return 'blob:test';};URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;
 try{
  withUI((ui,document)=>{
   const ids=[app('Control Tower').id,app('RBCC LOG Control Tower V2').id];
   ui.open({poolIds:ids,contextLabel:'Pair'});
   ui.restoreState({...ui.getState(),similarityThreshold:34,pool:ids,selected:ids,dimension:'weighted'});
   document.getElementById('exportSelection').onclick();
  });
 }finally{URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;globalThis.setTimeout=saved.timer;}
 const text=await blob.text(),[row]=records(text.startsWith('\uFEFF')?text:'\uFEFF'+text);// Blob.text() drops the BOM
 assert.equal(row.Status,'Potential overlap','an exact 34 at the UI threshold 34');
});

test('the CSV Status reason equals the hint the UI actually renders for every unscored pair',()=>withUI((ui,document)=>{
 ui.showPortfolio();
 const html=document.getElementById('portfolioProvisional').innerHTML;
 const shown=new Map([...html.matchAll(/data-portfolio-app="([^"]*)" data-portfolio-peer="([^"]*)">[^<]*<small>([^<]*)<\/small>/g)].map(m=>[[m[1],m[2]].sort().join('::'),m[3]]));
 const unscored=portfolioCandidates(index).pairs.filter(p=>p.status!=='confirmed');
 const rows=records(similarityCSV(unscored,'weighted',data,{threshold:50}));
 assert.equal(rows.length,unscored.length);
 rows.forEach((row,i)=>{assert(shown.has(unscored[i].key),'UI lists '+row['Unique pair key']);assert.equal(shown.get(unscored[i].key),esc(row['Status reason']),row['Unique pair key']);});
 // Since 2026-10-19 the Review needed hints carry the code evidence too, e.g. Iris–RCS-2000:
 // 0.3 × capability 1/1 + 0.4 × process 0/1 = 30 in both directions.
 assert.equal(shown.get(pair('Iris','RCS-2000').key),'No shared words in names or descriptions; compare the recorded functions. Code evidence 30 / 100 from capabilities and processes; not a pair score.');
 const reviewHints=rows.filter(row=>row.Status==='Review needed').map(row=>shown.get(row['Unique pair key']));
 assert(reviewHints.length>0&&reviewHints.every(hint=>/ Code evidence [\d.]+ \/ 100 from capabilities and processes; not a pair score\.$/.test(hint)),'every Review needed hint shows its code evidence');
}));

test('two out-of-scope applications with the same reason state it once in the UI hint and both CSVs',()=>{
 const outside=model.apps.filter(a=>scopeReason(a)),reasons=new Map();
 for(const a of outside){if(!reasons.has(scopeReason(a)))reasons.set(scopeReason(a),[]);reasons.get(scopeReason(a)).push(a);}
 const [reason,[a,b]]=[...reasons].find(([,apps])=>apps.length>=2);
 const p=index.pair(a.id,b.id);
 assert.equal(pairStatusReason(p,50,scopeReason),'Not in similarity check – '+reason);
 const [row]=records(similarityCSV([p],'weighted',data));assert.equal(row['Status reason'],'Not in similarity check – '+reason);
 const [capRow]=records(similarityCSV([cap.compare(a.id,b.id)],'cap',data));assert.equal(capRow['Opportunity scope'].split('; ').length,1,capRow['Opportunity scope']);
 // Two different reasons are both stated, target first.
 const [,[c]]=[...reasons].find(([text])=>text!==reason),q=index.pair(a.id,c.id),both='Not in similarity check – '+[scopeReason(q.target.app),scopeReason(q.peer.app)].join('; ');
 assert.notEqual(scopeReason(q.target.app),scopeReason(q.peer.app));
 assert.equal(pairStatusReason(q,50,scopeReason),both);
 const [mixed]=records(similarityCSV([q],'weighted',data));assert.equal(mixed['Status reason'],both);
 // Target first even when its reason sorts after the peer's.
 const late=outside.flatMap(x=>outside.filter(y=>scopeReason(y)!==scopeReason(x)).map(y=>index.pair(x.id,y.id))).find(p=>scopeReason(p.target.app).localeCompare(scopeReason(p.peer.app))>0);
 assert(late,'a pair whose target reason sorts last');
 assert.equal(pairStatusReason(late,50,scopeReason),'Not in similarity check – '+scopeReason(late.target.app)+'; '+scopeReason(late.peer.app));
});

test('out-of-scope reasons appear once each in the matrix tooltip and the evidence banner',()=>withUI((ui,document)=>{
 const outside=model.apps.filter(a=>scopeReason(a)),reasons=new Map();
 for(const a of outside){if(!reasons.has(scopeReason(a)))reasons.set(scopeReason(a),[]);reasons.get(scopeReason(a)).push(a);}
 const [reason,[a,b]]=[...reasons].find(([,apps])=>apps.length>=2),[otherReason,[c]]=[...reasons].find(([text])=>text!==reason),ids=[a.id,b.id,c.id];
 const not=(...texts)=>esc('Not in similarity check – '+texts.join('; '));
 for(const dim of ['cap','process']){
  ui.open({poolIds:ids,contextLabel:'Scope reasons',dimension:dim});
  ui.restoreState({...ui.getState(),selected:ids,dimension:dim});
  document.getElementById('compareDialog').open=true;ui.refresh();
  const html=document.getElementById('comparisonMatrix').innerHTML,attr=id=>id.replace(/[&<>"']/g,char=>esc(char));
  const title=(target,peer)=>html.match(new RegExp(`data-cell-target="${attr(target.id)}" data-cell-peer="${attr(peer.id)}" title="([^"]*)"`))?.[1];
  assert.equal(title(a,b),not(reason),dim+': a shared reason is stated once');
  assert.equal(title(a,c),not(reason,otherReason),dim+': two different reasons are both stated');
  // Clear the evidence first, so only the click on the matrix cell can render it.
  const evidence=document.getElementById('comparisonEvidence');
  const click=(target,peer)=>{evidence.innerHTML='';document.getElementById('compareDialog').fire('click',{target:{closest:()=>({dataset:{cellTarget:target.id,cellPeer:peer.id},hasAttribute:()=>false})}});return evidence.innerHTML;};
  const banner=view=>view.match(/<p class="scope-banner">([^<]*)<\/p>/)?.[1],rowTarget=view=>view.match(/<span class="pair-letter">Row target<\/span><h3>([^<]*)<\/h3>/)?.[1];
  let view=click(b,a);
  assert.equal(rowTarget(view),esc(b.Name),dim+': the clicked cell is shown');assert.equal(banner(view),'Out of scope · '+not(reason),dim+' banner, shared reason');
  view=click(c,a);
  assert.equal(rowTarget(view),esc(c.Name));assert.equal(banner(view),'Out of scope · '+not(otherReason,reason),dim+' banner, two reasons');
 }
}));

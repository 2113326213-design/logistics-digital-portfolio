import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {chronologicalEvents,renderHistoryRecords} from '../public/history-view.mjs';
import {recordImport,applicationTimeline,applicationTimelineCSV} from '../public/application-history.mjs';
import {workspaceData} from '../public/workspace.mjs';

// Source guards for the hand-over decisions (00_Claude先读.md). They read public/ directly, so they run without esbuild.
const pub=new URL('../public/',import.meta.url);
const read=file=>readFileSync(new URL(file,pub),'utf8');
const sources=readdirSync(pub).filter(file=>/\.(?:html|mjs)$/.test(file)||file==='app.js').sort().map(file=>({file,text:read(file)}));
const source=file=>sources.find(item=>item.file===file).text;
const CJK=/[\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u3100-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]+/g;
const level=String.raw`Level\s*(?:[123]|\$\{[^}]{1,30}\}|['"\x60]\s*\+\s*[\w.]+\s*\+\s*['"\x60])`;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Each allow entry is narrow: same file, the exact matched text, and (optionally) the line it must sit on.
const rules={
 removedWorkflows:{what:'Removed workflow or label is back (Owner review, Review assistant, Relationship not established, purpose-guess panel, Text & code)',
  pattern:/Owner[\s_-]*review|Review[\s_-]*assistant|reviewSubmissions|Relationship not established|application-interpretations|possibleRelationships|possible relationships?|(?:inferred|likely|guessed|probable|suggested) purpose|purpose[\s_-]*(?:guess|inference|hint|suggestion)|Text\s*(?:&|&amp;|\\u0026)\s*code/gi,
  allow:[{file:'workspace.mjs',match:/^reviewSubmissions$/,why:'the workspace normalizer may name the legacy owner-review key it discards (import-evidence.test.mjs)'}]},
 levelCorrect:{what:'Level 1/2/3 quality must say "matches standard", not "correct"',pattern:new RegExp(level+String.raw`[^\n]{0,20}?\bcorrect(?:ly|ness)?\b`,'gi'),allow:[]},
 annualLabel:{what:'"Annual benefit" text is only allowed as the import column name and its validation message',pattern:/Annual\s+benefit/gi,
  allow:[{file:'xlsx.mjs',match:/^Annual benefit$/,line:/'Annual benefit \(CNY\/year\)'/,why:'import column name'},{file:'annual-benefit.mjs',match:/^Annual benefit$/,line:/throw Error\('Annual benefit must be/,why:'import validation message'}]},
 annualField:{what:'Annual benefit amounts must not be formatted or rendered; the field may only be parsed and retained',pattern:/\w*annualBenefit\w*/gi,
  allow:[{file:'annual-benefit.mjs',match:/^(?:cleanAnnualBenefit|formatAnnualBenefit|annualBenefitCNY)$/,why:'parser (the formatter must stay unused elsewhere)'},
   {file:'xlsx.mjs',match:/^(?:cleanAnnualBenefit|annualBenefitCNY|annualBenefitSource)$/,why:'import column parsing'},
   {file:'workspace.mjs',match:/^(?:cleanAnnualBenefit|annualBenefitCNY|annualBenefitSource)$/,why:'retention in saved workspaces'},
   {file:'import-review.mjs',match:/^(?:annualBenefitCNY|annualBenefitSource)$/,why:'retention when a later Excel omits the column'},
   {file:'application-history.mjs',match:/^(?:annualBenefitCNY|annualBenefitSource)$/,why:'import-change record; its History rendering is checked separately below'}]},
 cjk:{what:'User-visible page text must be English (CJK characters found)',pattern:CJK,allow:[]}
};
function violations(rule,files){
 const found=[];
 for(const {file,text} of files)text.split('\n').forEach((line,index)=>{
  if(/^\s*\/\//.test(line))return; // code comments are not UI text
  for(const m of line.matchAll(rule.pattern)){
   if(rule.allow.some(entry=>entry.file===file&&entry.match.test(m[0])&&(!entry.line||entry.line.test(line))))continue;
   found.push(`${file}:${index+1}: …${line.slice(Math.max(0,m.index-40),m.index+m[0].length+40).trim()}…`);
  }
 });
 return found;
}
const report=(rule,found)=>`${rule.what}:\n  ${found.slice(0,20).join('\n  ')}${found.length>20?`\n  …and ${found.length-20} more`:''}`;
const assertClean=(rule,files)=>{const found=violations(rule,files);assert.deepEqual(found,[],report(rule,found));};
// Static, side-effect and dynamic imports plus <script src> all count as references.
const importers=(target,files)=>{const ref=new RegExp(String.raw`(?:\bfrom|\bimport\s*\(?|\bsrc\s*=)\s*["'\x60][^"'\x60]*\b${target.replaceAll('.','\\.')}["'\x60]`);return files.filter(({file,text})=>file!==target&&ref.test(text)).map(({file})=>file);};
const headlines=text=>({overview:text.match(/id="codeReview"[^>]*>\s*<summary>([^<]*)<\/summary>/)?.[1].trim(),pair:text.match(/class="comparison-score"><span>([^<]*)<\/span>/)?.[1].trim()});

test('guard matchers flag known violations and accept the allowed legacy code',()=>{
 const flagged=(rule,file,text)=>violations(rules[rule],[{file,text}]).length;
 assert.equal(flagged('removedWorkflows','app.js','<button id="ownerReview">Owner review</button>'),2);
 assert.equal(flagged('removedWorkflows','app.js','// Owner review was removed on 2026-10-15.'),0,'comments are not UI text');
 assert.equal(flagged('removedWorkflows','similarity-ui.mjs','<summary>Text &amp; code</summary>'),1);
 assert.equal(flagged('removedWorkflows','overview.mjs','<h4>Likely purpose</h4> Relationship not established'),2);
 assert.equal(flagged('removedWorkflows','app.js','data.reviewSubmissions'),1,'the legacy key is only allowed in the workspace normalizer');
 assert.equal(flagged('removedWorkflows','workspace.mjs','delete data.reviewSubmissions;'),0);
 assert.equal(flagged('removedWorkflows','similarity-ui.mjs','The score measures text and code overlap.'),0);
 assert.equal(flagged('levelCorrect','overview.mjs','<th>Level ${l} correct</th>'),1);
 assert.equal(flagged('levelCorrect','overview.mjs',"label+' · Level '+l.level+' correct'"),1);
 assert.equal(flagged('levelCorrect','overview.mjs','<h3>Level 3 matches standard</h3>'),0);
 assert.equal(flagged('annualLabel','app.js','<dt>Annual benefit</dt>'),1);
 assert.equal(flagged('annualLabel','app.js',"import {cleanAnnualBenefit} from './annual-benefit.mjs';"),0,'identifiers and file names are covered by annualField');
 assert.equal(flagged('annualLabel','xlsx.mjs',"headers.includes('Annual benefit (CNY/year)')"),0);
 assert.equal(flagged('annualField','app.js','${formatAnnualBenefit(app)}'),1);
 assert.equal(flagged('annualField','xlsx.mjs','formatAnnualBenefit(app)'),1);
 assert.equal(flagged('annualField','workspace.mjs','app.annualBenefitCNY=cleanAnnualBenefit(a.annualBenefitCNY)'),0);
 assert.equal(flagged('cjk','index.html','<p>演示数据</p>'),1);
 assert.deepEqual(importers('review-ui.mjs',[{file:'app.js',text:"import {createReviewUI} from './review-ui.mjs';"},{file:'x.mjs',text:"await import('./review-ui.mjs')"},{file:'y.mjs',text:"import './review-ui.mjs';"},{file:'z.html',text:'<script type="module" src="review-ui.mjs"></script>'},{file:'note.mjs',text:'// review-ui.mjs is legacy'},{file:'review-ui.mjs',text:"import './review-ui.mjs';"}]),['app.js','x.mjs','y.mjs','z.html']);
 assert.deepEqual(headlines('<details id="codeReview" open><summary>Text &amp; code</summary>'),{overview:'Text &amp; code',pair:undefined});
});

test('removed review workflows, purpose guesses and Text & code stay out of UI sources',()=>assertClean(rules.removedWorkflows,sources));

test('legacy review-ui.mjs stays unimported',()=>{
 const found=importers('review-ui.mjs',sources);
 assert.deepEqual(found,[],`review-ui.mjs is dead legacy review code and must stay unreachable; referenced from: ${found.join(', ')}`);
});

test('Level 1/2/3 quality wording says "matches standard"',()=>{
 assertClean(rules.levelCorrect,sources);
 const overview=source('overview.mjs');
 assert(new RegExp(level+String.raw`\s*matches standard`).test(overview),'overview.mjs must label Level 1/2/3 quality columns "Level N matches standard"');
 assert(overview.includes('Level 3 matches standard'),'overview.mjs must title the Level 3 quality card "Level 3 matches standard"');
});

test('Annual benefit amounts are only parsed and retained, never formatted for the UI',()=>{
 assertClean(rules.annualLabel,sources);
 assertClean(rules.annualField,sources);
});

test('History does not show Annual benefit amounts after an import changes them',()=>{
 const data=workspaceData(JSON.parse(read('data.json'))),id=data.apps[0].ID;
 const before={...data,apps:data.apps.map((app,i)=>i?app:{...app,annualBenefitCNY:123456,annualBenefitSource:'Inventory'})};
 const after={...data,apps:data.apps.map((app,i)=>i?app:{...app,annualBenefitCNY:654321,annualBenefitSource:'Inventory'})};
 const events=applicationTimeline(recordImport(before,after,{inventoryFile:'benefit.xlsx'}),id);
 const html=renderHistoryRecords(chronologicalEvents(events),{},esc),csv=applicationTimelineCSV(data.apps[0],events,'Inventory');
 for(const [name,text] of [['History panel',html],['History CSV',csv]])assert.doesNotMatch(text,/annualBenefit|Annual benefit|123,?456|654,?321/i,`${name} must not show Annual benefit amounts`);
});

test('index.html and the history demo contain no CJK text',()=>{
 assertClean(rules.cjk,[...['index.html','history-demo.html','history-demo.mjs'].map(file=>({file,text:source(file)})),{file:'history-demo-data.json',text:read('history-demo-data.json')}]);
});

test('similarity headline label is Score',()=>{
 const labels=headlines(source('similarity-ui.mjs'));
 assert.equal(labels.overview,'Score','similarity-ui.mjs: the #codeReview headline summary must read "Score"');
 assert.equal(labels.pair,'Score','similarity-ui.mjs: the pair comparison score label must read "Score"');
});

test('history demo is labelled fictional and shows a data-correction audit entry, not a review workflow',()=>{
 const demo=JSON.parse(read('history-demo-data.json'));
 assert.equal(demo.demo,true);assert.match(demo.notice,/Fictional/);
 assert.deepEqual(demo.events.filter(event=>event.review||!['import','mapping'].includes(event.kind)).map(event=>event.id),[],'demo events are imports or a mapping correction; no review status workflow');
 const html=renderHistoryRecords(chronologicalEvents(demo.events),{},esc);
 assert(html.includes('Process mapping applied')&&html.includes('Mapped to')&&html.includes('Demo data steward (fictional)'),'the correction renders as a mapping audit entry');
 assert.doesNotMatch(html,/Review (?:updated|status|result)|Pending review|Confirmed/,'no review status workflow is shown');
 assert.doesNotMatch(html,new RegExp(CJK.source),'rendered demo history is English');
 assert.match(source('history-demo.html'),/DEMO · Fictional data/);
});

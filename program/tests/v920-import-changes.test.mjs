// V9.20 (owner request 2026-10-22): the import preview lists every changed field of every application, old value → new
// value, before Apply, and exports the same details as CSV. Checked on a real case: importing the current bundled
// workspace into the V9.16 records reproduces exactly the field changes stored for the owner workbook of 2026-10-21.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceData} from '../public/workspace.mjs';
import {previewImport,importChangesCSV,listDifference} from '../public/import-review.mjs';
import {fieldChanges,recordImport} from '../public/application-history.mjs';
import {renderImportChanges} from '../public/import-changes-view.mjs';
import {RECORDS_V916} from './records-v916.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const raw=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const v916=workspaceData(JSON.parse(readFileSync(RECORDS_V916,'utf8'))),current=workspaceData(raw);
const preview=previewImport(v916,current,current);
const event=raw.importHistory.find(e=>e.inventoryFile==='20261021_logistic_inventory.xlsx');
const csvRows=text=>text.replace(/^﻿/,'').split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"')));

test('the preview lists the same field changes the import of 2026-10-21 recorded in the history',()=>{
 const key=c=>JSON.stringify([c.appId,c.field,c.before,c.after]);
 assert.equal(preview.fieldChanges.length,104);
 assert.deepEqual(preview.fieldChanges.map(key).sort(),event.changes.map(key).sort(),'old and new values match the stored import event');
 assert.equal(new Set(preview.fieldChanges.map(c=>c.appId)).size,75);
 assert.deepEqual([preview.added.length,preview.removed.map(a=>a.Name)],[0,['CGQB_Logistic_system_Q']]);
 const cdr=preview.fieldChanges.find(c=>c.name==='CDR_EM'&&c.field==='operationCostScore');
 assert.deepEqual([cdr.before,cdr.after],['1','5']);
 // The comparison is the one recordImport stores (hidden fields aside).
 const recorded=recordImport(v916,current).importHistory.at(-1).changes;
 assert.deepEqual(preview.fieldChanges.map(key).sort(),recorded.filter(c=>!/^annualBenefit/.test(c.field)).map(key).sort());
});

test('the change details table: one row per changed field, readable labels and values, list fields as removed and added entries',()=>{
 const html=renderImportChanges(preview,esc);
 assert.match(html,/<details class="import-changes" open><summary>Change details · 104 fields in 75 applications · 1 removed<\/summary>/);
 assert.equal((html.match(/<tr><th scope="row">/g)||[]).length,104);
 assert.match(html,/<tr><th scope="row">CDR_EM<\/th><td>Operation cost score<\/td><td>1<\/td><td>5<\/td><\/tr>/);
 assert.match(html,/<tr><th scope="row">PMS \(Package Management System\)<\/th><td>ROI \(payback period\)<\/td><td>&lt; 1 year \(score 5\)<\/td><td>&gt; 2 years \(score 1\)<\/td><\/tr>/);
 assert.match(html,/<tr><th scope="row">AGR w\/ Camera<\/th><td>Status in source inventory<\/td><td><span class="import-change-blank">\(blank\)<\/span><\/td><td>still active<\/td><\/tr>/);
 const dashboard=html.match(/<tr><th scope="row">360° Supplier dashboard<\/th><td>Business Capabilities<\/td>(.*?)<\/tr>/)[1];
 assert.equal((dashboard.match(/class="import-change-removed">− /g)||[]).length,2);
 assert.equal((dashboard.match(/class="import-change-added">\+ /g)||[]).length,3);
 assert.match(html,/<button type="button" id="exportImportChanges">Export change details \(CSV\)<\/button>/);
 assert.equal(renderImportChanges({fieldChanges:[],added:[],removed:[]},esc),'<p class="hint import-changes-none">No application fields change with this import.</p>');
 assert.doesNotMatch(html,/only in source references/,'every updated application of this import has a listed field change');
 // An application updated only in where its values come from (sheet, row) is counted, so the counts agree.
 const referencesOnly=renderImportChanges({updated:[{ID:'A'},{ID:'B'},{ID:'C'}],fieldChanges:[{appId:'A',name:'Alpha',field:'Name',before:'a',after:'b'}],added:[],removed:[]},esc);
 assert.match(referencesOnly,/ 2 updated applications change only in source references \(the sheet and row a value comes from\), which are not listed\.<\/p>/);
 // The landscape table's global th/td rules (fixed column widths, 140 px header, sticky first column) are reset for this table.
 const css=readFileSync(new URL('../public/interface.css',import.meta.url),'utf8');
 assert(css.includes('.import-changes-table th,.import-changes-table td{width:auto;min-width:0;height:auto;border-right:0;padding:6px 10px}'));
 assert(css.includes('.import-changes-table thead th,.import-changes-table thead th:first-child{position:sticky;top:0;left:auto;height:auto;'));
 assert.match(renderImportChanges({fieldChanges:[{appId:'A',name:'<b>x</b>',field:'Description',before:'a',after:'<i>'}],added:[],removed:[]},esc),/<th scope="row">&lt;b&gt;x&lt;\/b&gt;<\/th><td>Description<\/td><td>a<\/td><td>&lt;i&gt;<\/td>/);
});

test('the CSV has one row per changed field and per added or removed application, ready for Excel',()=>{
 const csv=importChangesCSV(preview,{inventoryFile:'20261021_logistic_inventory.xlsx'});
 assert(csv.startsWith('﻿"Change","Application ID","Application","Field","Before","After","Removed entries","Added entries","Import file"\r\n'),'UTF-8 byte-order mark and header');
 const rows=csvRows(csv);
 assert.equal(rows.length,1+1+104);
 assert.deepEqual(rows[1],['Application removed','fab13598-0672-4301-97ca-67583a04806b','CGQB_Logistic_system_Q','','','','','','20261021_logistic_inventory.xlsx']);
 const cdr=rows.find(r=>r[2]==='CDR_EM'&&r[3]==='Operation cost score');
 assert.deepEqual(cdr,['Field changed',cdr[1],'CDR_EM','Operation cost score','1','5','','','20261021_logistic_inventory.xlsx']);
 const dashboard=rows.find(r=>r[2]==='360° Supplier dashboard'&&r[3]==='Business Capabilities');
 assert.deepEqual([dashboard[6].split('\n').length,dashboard[7].split('\n').length],[2,3]);
 assert.deepEqual(listDifference('A;B;C','C;D'),{removed:['A','B'],added:['D']});
 // A value that Excel would read as a formula is kept as text.
 const guarded=csvRows(importChangesCSV({added:[],removed:[],fieldChanges:[{appId:'1',name:'App',field:'Description',before:'=SUM(A1)',after:'+1'}]}))[1];
 assert.deepEqual(guarded.slice(4,6),["'=SUM(A1)","'+1"]);
});

test('fieldChanges compares only applications present in both, in field order, without the hidden fields',()=>{
 const before={apps:[{ID:'A',Name:'Alpha',Description:'x',annualBenefitCNY:1},{ID:'B',Name:'Beta'}]};
 const after={apps:[{ID:'A',Name:'Alpha 2',Description:'x',annualBenefitCNY:2,statusNote:'phaseout'},{ID:'C',Name:'New'}]};
 assert.deepEqual(fieldChanges(before,after),[{appId:'A',name:'Alpha 2',field:'Name',before:'Alpha',after:'Alpha 2'},{appId:'A',name:'Alpha 2',field:'statusNote',before:'',after:'phaseout'}]);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes("${renderImportChanges(preview,esc)}${list('Added applications',preview.added)}"),'shown in the preview before the application lists');
 assert(app.includes("const csv=importChangesCSV(preview,{inventoryFile:inventory?.name||'',taxonomyFile:taxonomy?.name||''})")&&app.includes("link.download='Import_changes_'+new Date().toISOString().slice(0,10)+'.csv'"));
});

// Application landscape Category filter (owner request 2026-10-20): every option shows the category's own code
// exactly as in the original workbook, then its name. 'All categories' stays first and unchanged; the option
// values (category ids), their order and the filter they apply are the same as before the codes were added.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {categoryOptions,sourceCode,filterLandscape} from '../public/landscape.mjs';
import {displayName} from '../public/display.mjs';
import {capCode} from '../public/codes.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data);
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const views=['cap','process'];
const nodes=view=>view==='cap'?model.caps:model.procs;

// The option list as app.js built it before the codes were added (app.js line 61 before 2026-10-20): same
// filter, same sort by name, label = name only.
function previousOptions(m,view){
 const map=view==='cap'?m.caps:m.procs;
 return [...map.values()].filter(n=>(view==='cap'?!!n.reference:n.level<=1)&&m.apps.some(a=>a[view+'Leaf'].some(id=>m.ancestor(n.id,id)))).sort((a,b)=>displayName(a).localeCompare(displayName(b))).map(n=>[n.id,displayName(n)]);
}

test("'All categories' stays the first option, without a code",()=>{
 assert.match(app,/option\('landscapeBranch',categoryOptions\(model,view\),'All categories',filters\.branch\)/);
 // The option helper writes the 'all' entry (empty value) before the category options.
 assert.match(app,/const option=\(id,values,all,current\)=>\{const select=\$\(id\);select\.innerHTML=`<option value="">\$\{all\}<\/option>`\+values\.map/);
 assert.match(html,/<select id="landscapeBranch"><option value="">All categories<\/option><\/select>/);
 for(const view of views)assert(!categoryOptions(model,view).some(([value,label])=>value===''||/All categories/.test(label)));
});

test('every option label is the source code, one space, then the name',()=>{
 for(const view of views){
  const options=categoryOptions(model,view);
  assert(options.length>0,view);
  for(const [id,label] of options){
   const n=nodes(view).get(id);
   assert.equal(label,`${sourceCode(n,view)} ${displayName(n)}`,`${view} ${id}`);
   assert(!label.startsWith('Other ('),`${view} ${id} has a name`);
  }
 }
});

test('process codes are the Process ID of the row; capability codes are the code of the catalogue entry',()=>{
 for(const [id] of categoryOptions(model,'process')){
  const n=model.procs.get(id);
  assert.equal(sourceCode(n,'process'),n.id);
  assert(data.processRows.some(r=>r[2]===n.id&&r[3]===n.label),`${id} is a process sheet row`);
 }
 for(const [id] of categoryOptions(model,'cap')){
  const n=model.caps.get(id);
  assert.equal(sourceCode(n,'cap'),n.reference.trim().split(/\s+/)[0]);
  assert(data.capabilityRows.some(r=>r.includes(n.reference)),`${id} is a catalogue entry`);
 }
});

test('labels match the original workbooks exactly (code text and name, byte for byte)',()=>{
 const expected={
  cap:{
   // D:\Downloads\standard+name.xlsx, sheet 'Standard Name', row 2: A 'B.06' (Level 1 Code), B 'Logistics Management'.
   'B.06':'B.06 Logistics Management',
   // Same sheet, row 11: C 'B.06.2' (Level 2 Code), D 'Supply Chain (Logistics) Planning for Demand-Driven Fulfillment'.
   'B.06.2':'B.06.2 Supply Chain (Logistics) Planning for Demand-Driven Fulfillment',
   // Same sheet, row 21: E 'B.06.2.10' (Level 3 Code), F 'Customer Order Planning'.
   'B.06.2.10':'B.06.2.10 Customer Order Planning',
   // Same sheet, row 9: E 'B.06.1.6' (Level 3 Code), F 'Supply Chain (Logistics) IT, Data & Innovation Management'.
   'B.06.1.6':'B.06.1.6 Supply Chain (Logistics) IT, Data & Innovation Management'
  },
  process:{
   // D:\Downloads\Business+Capability+++Process.xlsx, sheet 'Data_RBW Process Structure', row 4: C 'L0', D 'M.B2P', E 'Budget to Perform'.
   'M.B2P':'M.B2P Budget to Perform',
   // Same sheet, row 333: C 'L0', D 'M.I2D', E 'Intralogistics to Demand'.
   'M.I2D':'M.I2D Intralogistics to Demand',
   // Same sheet, row 886: C 'L1', D 'M.O2C.030', E 'Delivery to Customer' (leading zero kept).
   'M.O2C.030':'M.O2C.030 Delivery to Customer',
   // Same sheet, row 977: C 'L1', D 'M.P2F.020', E 'Sales and Operations Planning'.
   'M.P2F.020':'M.P2F.020 Sales and Operations Planning'
  }
 };
 for(const view of views){
  const labels=new Map(categoryOptions(model,view));
  for(const [id,label] of Object.entries(expected[view]))assert.equal(labels.get(id),label,`${view} ${id}`);
 }
});

test('values, order and filter results are unchanged; only the code is added in front of the name',()=>{
 for(const view of views){
  const before=previousOptions(model,view),after=categoryOptions(model,view);
  assert.deepEqual(after.map(([value])=>value),before.map(([value])=>value),`${view} values and order`);
  after.forEach(([value,label],i)=>assert.equal(label,`${sourceCode(nodes(view).get(value),view)} ${before[i][1]}`,`${view} ${value}`));
  for(const [value] of after){
   const shown=filterLandscape(model,view,{branch:value}).apps.map(a=>a.id);
   const expected=model.apps.filter(a=>a[view+'Leaf'].some(id=>model.ancestor(value,id))).map(a=>a.id);
   assert(shown.length>0,`${view} ${value} selects applications`);
   assert.deepEqual(shown,expected,`${view} ${value} filter`);
  }
 }
 // Selecting an option still stores its value (the category id) as the branch filter.
 assert.match(app,/\['landscapeBranch','branch'\]\]\)\$\(id\)\.addEventListener\(id==='landscapeSearch'\?'input':'change',e=>\{filters\[key\]=e\.target\.value;/);
});

test("each code is the category's own level, never a parent's",()=>{
 for(const [id] of categoryOptions(model,'cap')){
  const n=model.caps.get(id),code=sourceCode(n,'cap');
  assert.equal(capCode(code),n.id,`${id}: code ${code} identifies this category`);
  assert.equal(code.split('.').length-1,n.level,`${id}: code ${code} has the category's level`);
  if(n.parent)assert.notEqual(capCode(code),n.parent,`${id}: not the parent code`);
 }
 const levels=new Set();
 for(const [id] of categoryOptions(model,'process')){
  const n=model.procs.get(id),code=sourceCode(n,'process');
  const row=data.processRows.find(r=>r[2]===code);
  assert(row,`${id}: code ${code} is a Process ID`);
  assert.equal(row[1],'L'+n.level,`${id}: process level of the code`);
  if(n.parent)assert.notEqual(code,n.parent,`${id}: not the parent code`);
  levels.add(n.level);
 }
 assert.deepEqual([...levels].sort(),[0,1],'process options include L0 and L1 categories, each with its own code');
});

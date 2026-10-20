// Application landscape, owner specification of 2026-10-20: + opens one level at a time, branches open and close
// independently, opened categories are shown as header rows with −, applications recorded only at an opened
// category stay visible in 'Only at this level', filters apply, Expand all / Collapse all keep the filters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildModel,columns} from '../public/model.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {filterLandscape,landscapeColumns,landscapeHeaderCell,openOneLevel,closeCategory,expandAll,openedGroupRows,openedGroupCell,OPENED_ROW_HEIGHT} from '../public/landscape.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url))));
const model=buildModel(data);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cols=(view,expanded,focus='',m=model)=>landscapeColumns(m,view,expanded,focus,columns);
const keys=list=>list.map(c=>c.key);
const depth=id=>id.split('.').length;

test('+ opens exactly one level, also when that level has a single sub-category',()=>{
 // B.01 has one populated sub-category (B.01.1) which has sub-categories of its own: one click shows B.01.1 only.
 const shown=cols('cap',openOneLevel(new Set(),'B.01'));
 const inside=shown.filter(c=>(c.opened||[]).includes('B.01'));
 assert.deepEqual(keys(inside.filter(c=>!c.direct)),['B.01.1']);
 assert.equal(inside.find(c=>c.id==='B.01.1').canExpand,true,'B.01.1 keeps its own +');
 assert(!shown.some(c=>c.id.startsWith('B.01.1.')),'no grandchild column before B.01.1 is opened');
 // Process: M.Q2E opens to its single L1 only.
 const proc=cols('process',openOneLevel(new Set(),'M.Q2E')).filter(c=>(c.opened||[]).includes('M.Q2E')&&!c.direct);
 assert(proc.length&&proc.every(c=>depth(c.id)===depth('M.Q2E')+1));
 // Every column below an opened category is exactly one level deeper than that category.
 for(const view of ['cap','process'])for(const top of cols(view,new Set()).filter(c=>c.canExpand)){
  for(const c of cols(view,openOneLevel(new Set(),top.id)).filter(c=>(c.opened||[]).includes(top.id)&&!c.direct))assert.equal(depth(c.id),depth(top.id)+1,`${top.id} → ${c.id}`);
 }
});

test('branches open and close independently; − closes the category and everything opened below it',()=>{
 const expanded=new Set();openOneLevel(expanded,'B.06.5');openOneLevel(expanded,'B.06.2');openOneLevel(expanded,'B.01');openOneLevel(expanded,'B.01.1');
 const before=cols('cap',expanded);
 assert(before.some(c=>c.id==='B.06.5.1')&&before.some(c=>c.id.startsWith('B.06.2.'))&&before.some(c=>c.id.startsWith('B.01.1.')));
 closeCategory(expanded,'B.06.5',model.ancestor);
 assert.deepEqual([...expanded].sort(),['B.01','B.01.1','B.06.2']);
 const after=cols('cap',expanded);
 assert(after.some(c=>c.id==='B.06.5'&&!c.direct&&c.canExpand),'B.06.5 is a summary column again');
 assert.deepEqual(keys(after.filter(c=>c.id.startsWith('B.06.2.'))),keys(before.filter(c=>c.id.startsWith('B.06.2.'))),'B.06.2 stays open');
 closeCategory(expanded,'B.01',model.ancestor);
 assert.deepEqual([...expanded],['B.06.2'],'closing B.01 also closes B.01.1');
 assert.deepEqual(keys(cols('cap',new Set())),keys(cols('cap',closeCategory(new Set(['B.06.2']),'B.06.2',model.ancestor))));
});

test('applications recorded only at an opened category stay in Only at this level; no empty placeholder column',()=>{
 const shown=cols('cap',new Set(['B.06.5']));
 const only=shown.find(c=>c.direct&&c.id==='B.06.5');
 const expected=model.apps.filter(a=>a.capLeaf.includes('B.06.5')).map(a=>a.id).sort();
 assert(expected.length>0,'the bundled data has applications recorded only at B.06.5');
 assert.deepEqual(only.apps.map(a=>a.id).sort(),expected);
 // Those applications are not placed in any sub-category column.
 for(const c of shown.filter(c=>c.id.startsWith('B.06.5.')))for(const a of c.apps)assert(a.capLeaf.some(id=>model.ancestor(c.id,id)),`${a.Name} really records ${c.id}`);
 for(const view of ['cap','process']){const all=cols(view,expandAll(model,view,new Set(),'',columns));assert(!all.some(c=>c.direct&&!c.apps.length),'never an empty Only at this level column');}
 const html=landscapeHeaderCell(only,{label:'Only at this level',escape:esc});
 assert.match(html,/<th scope="col" class="only-level">/);assert.match(html,/<span class="node-title">Only at this level<\/span>/);assert.match(html,/<small class="node-code">B\.06\.5<\/small>/);
 assert.doesNotMatch(html,/data-expand|data-collapse/);
});

test('opened categories are header rows spanning their columns, each with a − that collapses it',()=>{
 const expanded=new Set(['B.06.5','B.01','B.01.1']),shown=cols('cap',expanded),rows=openedGroupRows(shown);
 assert.equal(rows.length,2,'two levels opened under B.01');
 assert.equal(rows[0].reduce((n,cell)=>n+cell.span,0),shown.length);assert.equal(rows[1].reduce((n,cell)=>n+cell.span,0),shown.length);
 const b065=rows[0].find(cell=>cell.id==='B.06.5');assert.equal(b065.span,shown.filter(c=>(c.opened||[])[0]==='B.06.5').length);
 assert(rows[1].some(cell=>cell.id==='B.01.1'));
 const html=openedGroupCell(b065,{node:model.caps.get('B.06.5'),level:0,escape:esc});
 assert.match(html,new RegExp(`<th scope="colgroup" colspan="${b065.span}" class="opened-group" style="top:0px"><div class="opened-group-head"><button class="category-step" data-collapse="B\\.06\\.5" aria-label="Collapse B\\.06\\.5 [^"]+" title="Collapse">−</button><span class="opened-code">B\\.06\\.5</span>`));
 const second=openedGroupCell(rows[1].find(cell=>cell.id==='B.01.1'),{node:model.caps.get('B.01.1'),level:1,escape:esc});
 assert.match(second,new RegExp(`style="top:${OPENED_ROW_HEIGHT}px"`));
 assert.match(openedGroupCell({id:null,span:3},{level:0,escape:esc}),/<th class="opened-gap" colspan="3" style="top:0px" aria-hidden="true"><\/th>/);
 assert.deepEqual(openedGroupRows(cols('cap',new Set())),[],'nothing opened, no extra header row');
});

test('a category heading has + only when it can open; Not classified and leaves have none',()=>{
 const top=cols('cap',new Set());
 const b061=top.find(c=>c.id==='B.06.1');
 const html=landscapeHeaderCell(b061,{label:'Strategy',subCategories:4,escape:esc,top:88});
 assert.match(html,/<th scope="col" style="top:88px">/);
 assert.match(html,/<span class="category-title-row"><span class="node-title">Strategy<\/span><button class="category-step" data-expand="B\.06\.1" aria-label="Expand B\.06\.1: show 4 sub-categories" title="Show 4 sub-categories">\+<\/button><\/span>/);
 assert.match(landscapeHeaderCell(b061,{label:'x',subCategories:1,escape:esc}),/show 1 sub-category" title="Show 1 sub-category"/);
 const unmapped=top.find(c=>c.id==='unmapped');if(unmapped)assert.doesNotMatch(landscapeHeaderCell(unmapped,{label:'Not classified',escape:esc}),/category-step|node-code/);
 const leaf=cols('cap',new Set(['B.06.1'])).find(c=>c.id.startsWith('B.06.1.')&&!c.canExpand);
 assert.doesNotMatch(landscapeHeaderCell(leaf,{label:'x',escape:esc}),/category-step/);
 const hostile={id:'B.06.9<x>',key:'k"1',label:'<b>A & B</b>',reference:'',canExpand:true,apps:[{},{}],children:[]};
 const bad=landscapeHeaderCell(hostile,{label:hostile.label,subCategories:2,escape:esc});
 assert.doesNotMatch(bad,/<b>|<x>/);assert.match(bad,/&lt;b&gt;A &amp; B&lt;\/b&gt;/);assert.match(bad,/data-compare-column="k&quot;1"/);
});

test('filters apply to opened columns, cards and counts; Expand all follows the filtered result',()=>{
 const plant=model.apps.find(a=>a.capLeaf.some(id=>id.startsWith('B.06.5.'))).Entity;
 const filtered=filterLandscape(model,'cap',{entity:plant});
 const shown=cols('cap',new Set(['B.06.5']),'',filtered);
 for(const c of shown)for(const a of c.apps)assert.equal(a.Entity,plant);
 const opened=expandAll(filtered,'cap',new Set(),'',columns);
 for(const id of opened)assert(filtered.apps.some(a=>a.capLeaf.some(leaf=>model.ancestor(id,leaf))),`${id} has applications in ${plant}`);
 const all=cols('cap',opened,'',filtered);
 assert.equal(new Set(all.flatMap(c=>c.apps.map(a=>a.id))).size,filtered.apps.length,'every filtered application is still shown');
 // Search keeps working with opened categories.
 const searched=filterLandscape(model,'cap',{query:'Iris'});
 assert(cols('cap',new Set(['B.06.5']),'',searched).flatMap(c=>c.apps).every(a=>a.Name==='Iris'));
});

test('Expand all opens down to the deepest recorded level (process stops at L3); Collapse all restores the start',()=>{
 for(const view of ['cap','process']){
  const opened=expandAll(model,view,new Set(),'',columns),all=cols(view,opened);
  assert(!all.some(c=>c.canExpand),`${view}: nothing left to open`);
  assert.equal(new Set(all.flatMap(c=>c.apps.map(a=>a.id))).size,model.apps.length,`${view}: application total is unchanged`);
  if(view==='process')assert(all.every(c=>c.id==='unmapped'||model.procs.get(c.id).level<=3),'process columns stop at L3');
  opened.clear();assert.deepEqual(keys(cols(view,opened)),keys(cols(view,new Set())),`${view}: Collapse all restores the starting columns`);
 }
 // Expand all keeps categories opened earlier.
 const kept=expandAll(filterLandscape(model,'cap',{query:'no such application'}),'cap',new Set(['B.06.5']),'',columns);
 assert(kept.has('B.06.5'));
 // A Category filter shows that category opened one level.
 const focus=cols('cap',openOneLevel(new Set(),'B.06.5'),'B.06.5');
 assert(focus.every(c=>c.id==='B.06.5'||c.id.startsWith('B.06.5.')));assert(focus.some(c=>c.direct));
});

test('opening and closing only change what is shown; application data stays the same',()=>{
 const before=JSON.stringify(model.apps);
 const expanded=expandAll(model,'cap',new Set(),'',columns);cols('cap',expanded);closeCategory(expanded,'B.06.5',model.ancestor);cols('process',expandAll(model,'process',new Set(),'',columns));
 assert.equal(JSON.stringify(model.apps),before);
});

test('the page wires +, −, Expand all, Collapse all and the Category filter (app.js, index.html, CSS)',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes('if(b.dataset.expand){openOneLevel(expanded,b.dataset.expand);render();}'));
 assert(app.includes('if(b.dataset.collapse){closeCategory(expanded,b.dataset.collapse,model.ancestor);render();}'));
 assert(app.includes("$('expandAll').onclick=()=>{expandAll(filterLandscape(model,view,filters),view,expanded,filters.branch,columns);render();};"));
 assert(app.includes("$('collapse').onclick=()=>{expanded.clear();render();};"));
 assert(app.includes('if(key===\'branch\'){expanded.clear();if(filters.branch)openOneLevel(expanded,filters.branch);}'));
 assert(!/expandCategory/.test(app),'no automatic opening of several levels');
 assert(!/^(>>>|<<<|===)$/m.test(app));
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert(html.includes('<button id="expandAll">Expand all</button><button id="collapse">Collapse all</button>'));
 const css=readFileSync(new URL('../public/customer.css',import.meta.url),'utf8');
 assert.match(css,/\.category-step\{[^}]*width:24px;height:24px/);assert.match(css,/\.matrix thead tr\.opened-row th\{height:44px/);assert.match(css,/\.opened-group-head\{/);
});

test('column headings and opened-category rows show the code exactly as in the source workbook',async()=>{
 const {workbookCode}=await import('../public/landscape.mjs');
 // Process codes keep their leading zeros (process sheet 'Data_RBW Process Structure', column Process ID).
 const proc=model.procs.get('M.O2C.030');
 assert.equal(workbookCode(proc),'M.O2C.030');
 assert.match(landscapeHeaderCell({...proc,key:'M.O2C.030',apps:[],canExpand:true,opened:[]},{label:'x',subCategories:2,escape:esc}),/<small class="node-code">M\.O2C\.030<\/small>/);
 assert.match(openedGroupCell({id:'M.P2F.020',span:2},{node:model.procs.get('M.P2F.020'),level:0,escape:esc}),/<span class="opened-code">M\.P2F\.020<\/span>/);
 // Capability codes come from the standard+name.xlsx entry string.
 const cap=model.caps.get('B.06.2.10');
 assert.equal(workbookCode(cap),String(cap.reference).split(/\s+/)[0]);assert.equal(workbookCode(cap),'B.06.2.10');
 // Every process column under Expand all shows its process-sheet id.
 const all=cols('process',expandAll(model,'process',new Set(),'',columns));
 for(const c of all.filter(c=>c.id!=='unmapped'))assert.equal(workbookCode(c),c.id);
});

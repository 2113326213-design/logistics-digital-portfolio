// V13 (owner choice 2026-10-22): Import data reads the newest 'Logistic Apps_<date>' sheet of a workbook and the preview
// says which sheet it read; a search box under the title opens any application from any page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryFromSheets} from '../public/xlsx.mjs';
import {searchApplications,createAppSearch} from '../public/app-search.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';

const model=buildModel(workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'))));
const header=['ID','Type','Status in Oct','with score or not','Division','Entity','Name','Business Capabilities','Processes'];
const sheet=name=>[header,['A','Application','still active','with score','PS','RBCD',name,'','']];

test('the newest Logistic Apps_<date> sheet is read, whatever the sheet order, and the result says which',()=>{
 const apps=inventoryFromSheets({'Logistic Apps_0825':sheet('August'),'Logistic Apps_1021':sheet('October')});
 assert.equal(apps[0].Name,'October');
 assert.deepEqual(apps.inventorySheet,{name:'Logistic Apps_1021',rule:'newest',all:['Logistic Apps_0825','Logistic Apps_1021']});
 assert.equal(inventoryFromSheets({'Logistic Apps_1021':sheet('Oct'),'Logistic Apps 20261121':sheet('Nov')})[0].Name,'Nov','a full date counts as newer than a month and day');
 assert.equal(inventoryFromSheets({'Logistic Apps_1021':sheet('Oct'),'Logistic Apps_1121':sheet('Nov')})[0].Name,'Nov');
 const undated=inventoryFromSheets({'Apps':sheet('First'),'Other':sheet('Second')});
 assert.deepEqual([undated[0].Name,undated.inventorySheet.rule],['First','first']);
 const exact=inventoryFromSheets({'Logistic Apps_1121':sheet('Newer'),'Logistic Apps':[['ID',null,'Division','Entity','Name','Business Capabilities','Processes'],['A','with score','PS','RBCD','Named','','']]});
 assert.deepEqual([exact[0].Name,exact.inventorySheet.rule],['Named','exact'],'a sheet named exactly Logistic Apps is still used');
 const scored=inventoryFromSheets({'Logistic Apps_0825':sheet('August'),'Logistic Apps_1021':sheet('October'),'Parameter Score':[['LeanIX ID','App operation cost','ROI'],['A','5','3']]});
 assert.deepEqual([scored[0].operationCostScore,scored.inventorySheet.name],[5,'Logistic Apps_1021'],'kept when costs and ROI are read too');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(app.includes("<dt>Inventory</dt><dd>${esc(preview.next.source)}${inventorySheet?.name?` · sheet ${esc(inventorySheet.name)}`:''}</dd>"));
 assert(app.includes("the newest, ${esc(inventorySheet.name)}, was read"));
});

test('search: every word must match name, ID, plant or business unit; name matches come first; at most eight',()=>{
 assert.equal(searchApplications(model.apps,'auto-rack')[0].Name,'AUTO-RACK');
 assert.deepEqual(searchApplications(model.apps,'AUTO').slice(0,2).map(a=>a.Name),['Auto capacity simulation','AUTO-RACK'],'names starting with the text, in name order');
 assert.equal(searchApplications(model.apps,'b97561de')[0].Name,'AUTO-RACK','by application ID');
 assert.equal(searchApplications(model.apps,'rbcw dash')[0].Name,'RBCW LOM Dashboard','several words');
 const plant=searchApplications(model.apps,'RBCW');
 assert(plant.length<=8&&plant.every(a=>a.Entity==='RBCW'||/rbcw/i.test(a.Name)));
 assert.equal(searchApplications(model.apps,'RBCW',100).filter(a=>a.Entity==='RBCW').length,8,'all eight RBCW applications when the limit allows');
 assert.deepEqual(searchApplications(model.apps,'  '),[]);assert.deepEqual(searchApplications(model.apps,'zzzz-none'),[]);
});

test('the search box: results as you type, arrows and Enter open, Escape clears, / focuses it',()=>{
 const handlers={},node=()=>({listeners:{},attributes:{},value:'',hidden:true,innerHTML:'',addEventListener(type,f){this.listeners[type]=f;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},querySelectorAll(){return [];},focus(){this.focused=true;}});
 const input=node(),list=node(),opened=[];
 const oldDocument=globalThis.document;globalThis.document={addEventListener:(type,f)=>{handlers[type]=f;},querySelector:()=>null};
 try{
  createAppSearch({input,list,getApps:()=>model.apps,onOpen:id=>opened.push(id),escape:s=>String(s)});
  input.value='auto-rack';input.listeners.input();
  assert.equal(list.hidden,false);assert.equal(input.attributes['aria-expanded'],'true');
  assert.match(list.innerHTML,/^<li role="option" id="appSearchOption0" data-index="0">AUTO-RACK<small>RBCD · PS<\/small><\/li>/);
  let prevented=false;input.listeners.keydown({key:'Enter',preventDefault(){prevented=true;}});
  assert.deepEqual(opened,['b97561de-87df-46ec-a86c-477fe0e431f9']);assert(prevented);assert.equal(input.value,'');assert.equal(list.hidden,true);
  input.value='zzzz-none';input.listeners.input();assert.match(list.innerHTML,/No application found/);
  input.listeners.keydown({key:'Escape',preventDefault(){}});assert.deepEqual([input.value,list.hidden],['',true]);
  handlers.keydown({key:'/',target:{closest:()=>null},preventDefault(){}});assert.equal(input.focused,true);
 }finally{globalThis.document=oldDocument;}
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert(html.includes('<input id="appSearch" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="appSearchResults" aria-label="Find applications"'));
 assert(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').includes("createAppSearch({input:$('appSearch'),list:$('appSearchResults'),getApps:()=>model?.apps||[],onOpen:showApp,escape:esc});"));
});

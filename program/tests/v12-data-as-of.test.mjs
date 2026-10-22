// V12 (owner request 2026-10-22): the page says which data it shows and how recent it is, under the page title, and the
// line follows the data (imports, restored backups, kept work).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dataAsOf,dataAsOfText} from '../public/data-as-of.mjs';

const raw=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));

test('the date comes from the inventory file name, then the LeanIX export time, then the latest import',()=>{
 assert.equal(dataAsOfText(raw),'Data: 20261021_logistic_inventory.xlsx · as of 2026-10-21');
 assert.equal(dataAsOfText({source:'20261020_083736_UKj4Y_inventory.xlsx'}),'Data: 20261020_083736_UKj4Y_inventory.xlsx · as of 2026-10-20','LeanIX export names start with the date');
 assert.equal(dataAsOfText({source:'20260825_logistic_inventory.xlsx'}),'Data: 20260825_logistic_inventory.xlsx · as of 2026-08-25');
 assert.equal(dataAsOfText({source:'inventory.xlsx',inventoryExport:{exportedAt:'2026-10-20 08:37:37 GMT'}}),'Data: inventory.xlsx · as of 2026-10-20');
 assert.equal(dataAsOfText({source:'inventory.xlsx',importHistory:[{kind:'import',at:'2026-10-21T03:00:00Z'},{kind:'taxonomy',at:'2026-10-23T03:00:00Z'},{kind:'import',at:'2026-10-22T03:00:00Z'}]}),'Data: inventory.xlsx · imported 2026-10-22','a taxonomy upload is not a data date');
 assert.equal(dataAsOfText({source:'inventory.xlsx'}),'Data: inventory.xlsx');
 // Not a date: 13th month, a longer number, no source.
 assert.deepEqual(dataAsOf({source:'20261399_inventory.xlsx'}),{file:'20261399_inventory.xlsx',date:'',basis:''});
 assert.equal(dataAsOf({source:'1202610210_x.xlsx'}).date,'');
 assert.equal(dataAsOfText({source:'Imported workspace'}),'');assert.equal(dataAsOfText({}),'');
});

test('the line sits under the page title and is refreshed whenever the data changes',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert(html.includes('<h1>Logistics Digital Portfolio</h1><p id="dataAsOf" class="data-as-of" role="status"></p>'));
 assert(app.includes("data=clean;model=nextModel;$('dataAsOf').textContent=dataAsOfText(clean);"),'set in useData, which every data change goes through');
});

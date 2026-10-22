import test from 'node:test';
import assert from 'node:assert/strict';
import {isLeanixProcessLinks,processExportWithoutLinks,readProcessLinks,compareProcessLinks,processCheckCSV,NO_APPLICATIONS_COLUMN} from '../public/leanix-process-check.mjs';
import {LEANIX_PROCESS_EXPORT} from '../public/leanix-process-export.mjs';
import {split} from '../public/codes.mjs';
import {readXlsx} from '../public/xlsx.mjs';
import {readFileSync} from 'node:fs';
import {installDOMParser} from '../scripts/xml-dom.mjs';
import {xlsxBuffer} from './source-workbooks.mjs';

// Synthetic sheets shaped like the LeanIX export of the saved view "BBM PM process" (screenshots 2026-10-22).
const KEYS=['id','type','name','displayName','description','processLifecycleStatus','relToParent','relProcessToApplication','fullName','updatedAt'];
const LABELS=['ID','Type','Name','Display Name','Description','Process Lifecycle Status','Parent','Applications','Full Name','Updated At'];
const record=(id,name,apps,{type='Process',parent=''}={})=>[id,type,name,name,'','',parent,apps,name,'2025-10-10'];
const exportSheets=records=>({'BBM PM process (Export 2026-10-22 08_17)':[KEYS,LABELS,...records],ReadMe:[['This file was created at: 2026-10-22 00:17:06 GMT']]});
const data={apps:[
 {ID:'a1',Name:'AGR w/ Camera',Processes:'BBM PM I2D Receive to Store L1;BBM PM I2D Identification & Booking L2;RBCC | Warehouse Delivery'},
 {ID:'a2',Name:'ARS',Processes:'BBM PM I2D Warehouse to Consume L1'},
 {ID:'a3',Name:'Quiet App',Processes:'RBCC | Warehouse Delivery;HC.Other company process'},
 {ID:'a4',Name:'Same Name',Processes:''},{ID:'a5',Name:'same  name',Processes:''}
]};
const sheets=exportSheets([
 record('p1','BBM PM I2D Receive to Store L1','AGR w/ Camera;ARS'),
 record('p2','BBM PM I2D Identification and Booking L2','agr w/ camera'),
 record('p3','BBM PM I2D Warehouse to Consume L1',''),
 record('p4','BBM PM D2M Prepare development sample shipment L3','Unknown Tool'),
 record('x1','Some application','',{type:'Application'}),
 ['','','','','','','','','','']
]);

test('V15: a LeanIX process export with the Applications column is recognised; other workbooks are not',()=>{
 assert.equal(isLeanixProcessLinks(sheets),true);
 assert.equal(isLeanixProcessLinks(LEANIX_PROCESS_EXPORT.sheets),false);
 assert.equal(isLeanixProcessLinks({'Logistic Apps':[['ID','Name','Division','Entity','Business Capabilities','Processes']]}),false);
 assert.equal(isLeanixProcessLinks({ReadMe:[KEYS]}),false);
});

test('V15: the export is read from row 3, without other record types or blank rows',()=>{
 const links=readProcessLinks(sheets);
 assert.equal(links.sheet,'BBM PM process (Export 2026-10-22 08_17)');
 assert.equal(links.exportedAt,'2026-10-22 08:17 (Beijing time)');
 assert.deepEqual(links.records.map(r=>[r.row,r.id,r.applications]),[[3,'p1',['AGR w/ Camera','ARS']],[4,'p2',['agr w/ camera']],[5,'p3',[]],[6,'p4',['Unknown Tool']]]);
 // Without a display-name row the records start in row 2; without a ReadMe the date comes from the sheet name.
 const plain=readProcessLinks({'BBM PM process (Export 2026-10-21 09_00)':[KEYS,record('p1','A L1','X')]});
 assert.deepEqual([plain.exportedAt,plain.records[0].row],['2026-10-21',2]);
});

test('V15: a process export without the Applications column says how to export it again',()=>{
 assert.throws(()=>readProcessLinks(LEANIX_PROCESS_EXPORT.sheets),{message:NO_APPLICATIONS_COLUMN});
 assert.throws(()=>readProcessLinks({'Logistic Apps':[['ID','Name']]}),/No LeanIX process sheet/);
 assert.equal(processExportWithoutLinks(LEANIX_PROCESS_EXPORT.sheets),true);
 // An application export with field names in row 1 is not a process export.
 assert.equal(processExportWithoutLinks({Apps:[['id','type','name','displayName','relApplicationToProcess'],['ID','Type','Name','Display Name','Processes'],['a1','Application','X','X','P']]}),false);
 assert.equal(processExportWithoutLinks(sheets),false);
});

test('V15: per application, processes in both, only in LeanIX and only in the tool; nothing in the data changes',()=>{
 const before=JSON.stringify(data),check=compareProcessLinks(data,readProcessLinks(sheets),{file:'20261022_081706_inventory.xlsx'});
 assert.equal(JSON.stringify(data),before);
 const row=id=>check.rows.find(r=>r.id===id);
 // '&' and 'and', case and spacing are the same name; RBCC is not in this export and is not a difference.
 assert.deepEqual(row('a1'),{id:'a1',name:'AGR w/ Camera',status:'matches',both:['BBM PM I2D Receive to Store L1','BBM PM I2D Identification & Booking L2'],onlyLeanix:[],onlyTool:[],notInExport:['RBCC | Warehouse Delivery'],sameName:1});
 assert.deepEqual([row('a2').status,row('a2').both,row('a2').onlyLeanix,row('a2').onlyTool],['differs',[],['BBM PM I2D Receive to Store L1'],['BBM PM I2D Warehouse to Consume L1']]);
 // HC entries belong to another company and are not compared.
 assert.deepEqual([row('a3').status,row('a3').notInExport],['not-in-export',['RBCC | Warehouse Delivery']]);
 assert.deepEqual(check.rows.map(r=>r.id),['a2','a1','a3','a4','a5']);
 assert.deepEqual(check.counts,{applications:5,differs:1,matches:1,notInExport:3});
 assert.deepEqual([row('a4').sameName,row('a5').sameName],[2,2]);
 assert.deepEqual(check.unknownApplications,[{name:'Unknown Tool',processes:1}]);
 assert.deepEqual([check.processes,check.linkedApplications,check.file],[4,3,'20261022_081706_inventory.xlsx']);
});

test('V15: an export rebuilt from the bundled data, read as an .xlsx file, matches every application with processes',async()=>{
 installDOMParser();
 const bundled=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')),apps=new Map();
 for(const app of bundled.apps)for(const process of split(app.Processes))apps.set(process,[...(apps.get(process)||[]),app.Name]);
 const records=[...apps].map(([process,names],i)=>record('p'+i,process,names.join(';')));
 const file=new File([xlsxBuffer(exportSheets(records))],'20261022_081706_ZTcQF_inventory.xlsx'),sheets=await readXlsx(file);
 assert.equal(isLeanixProcessLinks(sheets),true);
 const check=compareProcessLinks(bundled,readProcessLinks(sheets),{file:file.name});
 const withProcesses=bundled.apps.filter(app=>split(app.Processes).some(p=>!/^HC\./.test(p))).length;
 assert.deepEqual(check.counts,{applications:bundled.apps.length,differs:0,matches:withProcesses,notInExport:bundled.apps.length-withProcesses});
 assert.deepEqual(check.unknownApplications,[]);
 // One link removed in LeanIX and one added: exactly those two show, for those two applications.
 const [first,second]=bundled.apps.filter(app=>split(app.Processes).length),moved=split(first.Processes)[0];
 const changed=records.map(r=>r[2]===moved?[...r.slice(0,7),split(r[7]).filter(n=>n!==first.Name).concat(second.Name).join(';'),...r.slice(8)]:r);
 const after=compareProcessLinks(bundled,readProcessLinks(exportSheets(changed)));
 assert.deepEqual(after.rows.filter(r=>r.status==='differs').map(r=>[r.name,r.onlyLeanix,r.onlyTool]).sort(),
  [[first.Name,[],[moved]],[second.Name,split(second.Processes).includes(moved)?[]:[moved],[]]].filter(([,a,b])=>a.length||b.length).sort());
});

test('V15: Import data checks a process export before reading it as an inventory and never offers Apply for it',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const run=app.slice(app.indexOf("$('importRun').onclick"),app.indexOf("$('importApply').onclick"));
 assert.ok(run.indexOf('isLeanixProcessLinks(sheets)')>0&&run.indexOf('isLeanixProcessLinks(sheets)')<run.indexOf('inventoryFromSheets('));
 const branch=run.slice(run.indexOf('if(linksFile){'),run.indexOf('return;',run.indexOf('if(linksFile){')));
 assert.ok(branch.includes('showProcessCheck(check)')&&!branch.includes('pendingImport'));
 const show=app.slice(app.indexOf('function showProcessCheck('),app.indexOf("$('importRun').onclick"));
 assert.ok(show.includes("$('importApply').hidden=true")&&!/pendingImport|useData|autosave/.test(show));
});

test('V15: the check exports as CSV with one row per application and process',()=>{
 const csv=processCheckCSV(compareProcessLinks(data,readProcessLinks(sheets),{file:'f.xlsx'})),lines=csv.slice(1).split('\r\n');
 assert.equal(csv[0],'﻿');
 assert.equal(lines[0],'"Application ID","Application","Process","Result","LeanIX export"');
 assert.ok(lines.includes('"a2","ARS","BBM PM I2D Receive to Store L1","Only in LeanIX","f.xlsx"'));
 assert.ok(lines.includes('"a2","ARS","BBM PM I2D Warehouse to Consume L1","Only in the tool","f.xlsx"'));
 assert.ok(lines.includes('"","Unknown Tool","","Application in LeanIX, not in the tool","f.xlsx"'));
 const formula=processCheckCSV({file:'',rows:[{id:'1',name:'=cmd',both:['+x'],onlyLeanix:[],onlyTool:[],notInExport:[]}],unknownApplications:[]});
 assert.ok(formula.includes(`"'=cmd","'+x"`));
});

// Tests for the LeanIX tools against a simulated LeanIX (no real LeanIX, no network beyond 127.0.0.1).
//   node --test tools/leanix/
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,mkdirSync,rmSync,copyFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {xlsxBuffer} from '../../program/tests/source-workbooks.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..','..');
const TOKEN='test-token-123',BEARER='bearer-xyz-789';
const fixtureData=dir=>{const file=path.join(dir,'data.json');writeFileSync(file,JSON.stringify({apps:[
 {ID:'app-a',Name:'App A',Entity:'RBCD',Division:'PS',Processes:'BBM PM I2D Receive to Store L1;BBM PM I2D Old Process L3'},
 {ID:'app-b',Name:'App B',Entity:'RBCW',Division:'PS',Processes:''},
 {ID:'app-c',Name:'App C',Entity:'RBCC',Division:'EM',Processes:''}]}));return file;};
const PROCESSES={
 p0:{name:'BBM PM I2D Intralogistics to Demand L0',parent:null},p1:{name:'BBM PM I2D Receive to Store L1',parent:'p0'},
 p2:{name:'BBM PM I2D Putaway L2',parent:'p1'},p3:{name:'BBM PM I2D Putaway to Warehouse Destination L3',parent:'p2'}};
const RELATIONS={'app-a':['p1','p3'],'app-b':['p3']};// app-c is not in this LeanIX

// A small LeanIX: token endpoint + GraphQL that answers the finder's two query shapes. It does not know the field
// "level" on Process, like a workspace without it, so the finder must drop that field and ask again.
function fakeLeanix(){
 const seen={token:[],graphql:[]};
 const sheet=id=>{const p=PROCESSES[id];return {id,name:p.name,displayName:p.name,type:'Process',description:`about ${id}`,lifecycle:{asString:'active',phases:[{phase:'active',startDate:'2024-01-01'}]},
  relToParent:{edges:p.parent?[{node:{factSheet:{id:p.parent,displayName:PROCESSES[p.parent].name}}}]:[]}};};
 const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const send=(code,json)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(json));};
  if(req.url==='/services/mtm/v1/oauth2/token'){seen.token.push(req.headers.authorization);
   return req.headers.authorization==='Basic '+Buffer.from(`apitoken:${TOKEN}`).toString('base64')?send(200,{access_token:BEARER}):send(401,{});}
  if(req.url==='/services/pathfinder/v1/graphql'){
   if(req.headers.authorization!==`Bearer ${BEARER}`)return send(401,{});
   const {query,variables}=JSON.parse(body);seen.graphql.push(query);
   if(/\blevel\b/.test(query))return send(200,{errors:[{message:"Validation error of type FieldUndefined: Field 'level' in type 'Process' is undefined @ 'factSheet'"}]});
   const id=variables.id;
   if(query.startsWith('query AppProcesses')){
    if(!RELATIONS[id])return send(200,{data:{factSheet:null}});
    return send(200,{data:{factSheet:{id,name:id,displayName:id,type:'Application',relApplicationToProcess:{totalCount:RELATIONS[id].length,edges:RELATIONS[id].map(p=>({node:{factSheet:sheet(p)}}))}}}});
   }
   return send(200,{data:{factSheet:PROCESSES[id]?sheet(id):null}});
  }
  send(404,{});
 });});
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,seen,base:`http://127.0.0.1:${server.address().port}`})));
}
const run=(script,args,env)=>new Promise(resolve=>{const child=spawn(process.execPath,[path.join(here,script),...args],{env:{...process.env,LEANIX_HOST:'',LEANIX_BASE_URL:'',LEANIX_API_TOKEN:'',...env}});
 let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>resolve({code,out}));});
const csv=file=>{const lines=readFileSync(file,'utf8').replace(/^﻿/,'').trim().split('\r\n');const head=lines[0].split(',');
 const parse=line=>{const cells=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')q=false;else cur+=c;}else if(c==='"')q=true;else if(c===','){cells.push(cur);cur='';}else cur+=c;}cells.push(cur);return cells;};
 return lines.slice(1).map(line=>Object.fromEntries(parse(line).map((v,i)=>[head[i],v])));};

test('find-processes: reads, read-only, the processes of each application and their parents, and compares with the tool',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'leanix-find-')),{server,seen,base}=await fakeLeanix();
 try{
  const result=await run('find-processes.mjs',['--data',fixtureData(dir),'--out',path.join(dir,'out')],{LEANIX_BASE_URL:base,LEANIX_API_TOKEN:TOKEN});
  assert.equal(result.code,0,result.out);
  assert(seen.graphql.length>0&&seen.graphql.every(q=>/^query\b/.test(q)&&!/mutation/i.test(q)),'only read queries were sent');
  assert(seen.graphql.some(q=>/\blevel\b/.test(q))&&seen.graphql.slice(1).every(q=>!/\blevel\b/.test(q)),'the unknown field was dropped after the first answer');
  const rows=csv(path.join(dir,'out','leanix_processes.csv'));
  assert.deepEqual(rows.map(r=>r.process_id),['p1','p3'],'only processes linked to the tool\'s applications; parents only feed the path');
  const [p1,p3]=rows;
  assert.equal(p3.path,'BBM PM I2D Intralogistics to Demand L0 > BBM PM I2D Receive to Store L1 > BBM PM I2D Putaway L2 > BBM PM I2D Putaway to Warehouse Destination L3');
  assert.deepEqual([p3.chain,p3.level_in_name,p3.hierarchy_level,p3.parent,p3.linked_app_count,p3.linked_apps,p3.in_tool_records],['I2D','L3','4','BBM PM I2D Putaway L2','2','App A; App B','none']);
  assert.deepEqual([p1.in_tool_records,p1.lifecycle,p1.description],['all','active (active 2024-01-01)','about p1']);
  const summary=readFileSync(path.join(dir,'out','leanix_processes_summary.md'),'utf8');
  assert.match(summary,/LeanIX 里找不到或无权读取的应用[\s\S]*App C（app-c）/);
  assert.match(summary,/\| App A \| BBM PM I2D Putaway to Warehouse Destination L3 \| BBM PM I2D Old Process L3 \|/);
  assert.match(summary,/v3（Process）/);
  assert(existsSync(path.join(dir,'out','leanix_processes_raw.json')));
  for(const file of readdirSync(path.join(dir,'out')))for(const secret of [TOKEN,BEARER])assert(!readFileSync(path.join(dir,'out',file),'utf8').includes(secret),`${file} must not hold a token`);
  for(const secret of [TOKEN,BEARER])assert(!result.out.includes(secret),'the console never shows a token');
 }finally{server.close();rmSync(dir,{recursive:true,force:true});}
});

test('find-processes without a token sends nothing and says what to set',async()=>{
 const {server,seen,base}=await fakeLeanix();
 try{
  const result=await run('find-processes.mjs',[],{LEANIX_BASE_URL:base});
  assert.equal(result.code,2);assert.match(result.out,/LEANIX_API_TOKEN[\s\S]*Nothing was sent\./);
  assert.deepEqual([seen.token.length,seen.graphql.length],[0,0]);
 }finally{server.close();}
});

test('a wrong token stops with a message that does not show the token',async()=>{
 const {server,base}=await fakeLeanix();
 try{
  const result=await run('find-processes.mjs',[],{LEANIX_BASE_URL:base,LEANIX_API_TOKEN:'wrong-secret-456'});
  assert.equal(result.code,1);assert.match(result.out,/did not accept the API token \(HTTP 401\)/);assert(!result.out.includes('wrong-secret-456'));
 }finally{server.close();}
});

test('summarize-export: lists sheets and columns, keeps the processes of the tool\'s applications, follows parents',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'leanix-sum-')),input=path.join(dir,'in');mkdirSync(input);
 try{
  const tech=['id','type','name','displayName','description','relToParent','relProcessToApplication','lifecycle:active'];
  const shown=['ID','Type','Name','Display Name','Description','Parent','Applications','Lifecycle: Active'];
  const row=(id,parent,apps)=>[id,'Process',PROCESSES[id].name,PROCESSES[id].name,`about ${id}`,parent?PROCESSES[parent].name:'',apps,'2024-01-01'];
  writeFileSync(path.join(input,'20261022_inventory.xlsx'),xlsxBuffer({'Export':[tech,shown,row('p0',null,''),row('p1','p0','App A'),row('p2','p1',''),row('p3','p2','App A;App B'),
   ['x9','Process','Other Plant Process L3','Other Plant Process L3','','','Somebody Else',''],['a1','Application','App A','App A','','','','']],'ReadMe':[['LeanIX inventory export created at: 2026-10-22 01:00:00 GMT']]}));
  const result=await run('summarize-export.mjs',['--in',input,'--out',path.join(dir,'out'),'--data',fixtureData(dir)],{});
  assert.equal(result.code,0,result.out);
  assert.match(result.out,/sheet "Export": 8 rows, 6 records, 8 columns/);
  assert.match(result.out,/columns: ID \| Type \| Name \| Display Name \| Description \| Parent \| Applications \| Lifecycle: Active/);
  assert.match(result.out,/sheet "ReadMe": 1 rows \(documentation or not a fact sheet table\)/);
  const rows=csv(path.join(dir,'out','leanix_processes.csv'));
  assert.deepEqual(rows.map(r=>r.display_name),['BBM PM I2D Receive to Store L1','BBM PM I2D Putaway to Warehouse Destination L3'],'other plants\' processes and the Application row are left out');
  assert.equal(rows[1].path.split(' > ').length,4);assert.equal(rows[1].linked_apps,'App A; App B');assert.equal(rows[0].lifecycle,'active 2024-01-01');
  assert.match(readFileSync(path.join(dir,'out','leanix_processes_summary.md'),'utf8'),/导出共有 5 条 Process，其中 2 条和工具的应用有关/);
  assert.deepEqual(readFileSync(path.join(input,'20261022_inventory.xlsx')),xlsxBuffer({'Export':[tech,shown,row('p0',null,''),row('p1','p0','App A'),row('p2','p1',''),row('p3','p2','App A;App B'),
   ['x9','Process','Other Plant Process L3','Other Plant Process L3','','','Somebody Else',''],['a1','Application','App A','App A','','','','']],'ReadMe':[['LeanIX inventory export created at: 2026-10-22 01:00:00 GMT']]}),'the export is only read');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('LeanIX data never reaches GitHub: git ignores it and MANIFEST.sha256 does not list it',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'leanix-git-'));
 try{
  copyFileSync(path.join(root,'.gitignore'),path.join(dir,'.gitignore'));mkdirSync(path.join(dir,'leanix_export'));
  for(const file of ['leanix_export/export.xlsx','leanix_export/leanix_processes.csv','leanix_processes.csv','kept.txt'])writeFileSync(path.join(dir,file),'x');
  assert.equal(spawnSync('git',['init','-q'],{cwd:dir}).status,0);
  const ignored=spawnSync('git',['check-ignore','leanix_export/export.xlsx','leanix_export/leanix_processes.csv','leanix_processes.csv','kept.txt'],{cwd:dir,encoding:'utf8'}).stdout.trim().split(/\r?\n/);
  assert.deepEqual(ignored,['leanix_export/export.xlsx','leanix_export/leanix_processes.csv','leanix_processes.csv']);
  rmSync(path.join(dir,'.git'),{recursive:true,force:true});
  assert.equal(spawnSync(process.execPath,[path.join(root,'.github','scripts','check-manifest.mjs'),'--write',dir]).status,0);
  assert.deepEqual(readFileSync(path.join(dir,'MANIFEST.sha256'),'utf8').trim().split('\n').map(l=>l.slice(66)),['.gitignore','kept.txt']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

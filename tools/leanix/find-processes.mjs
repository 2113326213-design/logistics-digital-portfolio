// Finds, READ-ONLY, the LeanIX Process fact sheets linked to the tool's logistics applications and writes
// leanix_export/leanix_processes.csv, leanix_processes_summary.md and leanix_processes_raw.json.
//
// The tool itself has no LeanIX fact sheet; its applications do: program/public/data.json holds the LeanIX ID of each
// of them, so nothing is searched by name. For each application the script reads its Process relations, then each
// process's parents up to the top, and compares the result with the process records the tool already holds.
//
// Usage (PowerShell, in the package folder; the token is yours and stays in your session):
//   $env:LEANIX_HOST = "bosch.leanix.net"
//   $env:LEANIX_API_TOKEN = "<API token from LeanIX>"
//   node tools/leanix/find-processes.mjs
// Options: --data <data.json> (default program/public/data.json), --out <folder> (default leanix_export),
//          --limit <n> (only the first n applications, for a quick try).
//
// Read-only by construction: the only requests are the token exchange and GraphQL operations that start with
// "query" (anything else is refused before sending). The token and the access token are never printed or written.
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {toolApps,DEFAULT_DATA,DEFAULT_OUT,processRows,differences,summaryMarkdown,writeCsv} from './leanix-common.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const dataPath=path.resolve(option('--data')||DEFAULT_DATA),outDir=path.resolve(option('--out')||DEFAULT_OUT),limit=Number(option('--limit'))||Infinity;
const host=String(process.env.LEANIX_HOST||'').trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
const base=String(process.env.LEANIX_BASE_URL||'').trim().replace(/\/$/,'')||(host?`https://${host}`:'');// LEANIX_BASE_URL: tests only
const token=String(process.env.LEANIX_API_TOKEN||'').trim();
if(!base||!token){
 console.error(`Set LEANIX_HOST (e.g. bosch.leanix.net) and LEANIX_API_TOKEN first, then run again:
  $env:LEANIX_HOST = "bosch.leanix.net"
  $env:LEANIX_API_TOKEN = "<API token from LeanIX>"
  node tools/leanix/find-processes.mjs
Nothing was sent.`);
 process.exit(2);
}

async function accessToken(){
 const response=await fetch(`${base}/services/mtm/v1/oauth2/token`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`apitoken:${token}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 if(!response.ok)throw Error(`LeanIX did not accept the API token (HTTP ${response.status}). Check LEANIX_HOST and that the token is valid; the token itself is not shown.`);
 const json=await response.json().catch(()=>({}));
 if(!json.access_token)throw Error('LeanIX answered the token request without an access token.');
 return json.access_token;
}

let bearer='',requests=0;
async function graphql(query,variables){
 // Read-only guard: only GraphQL queries leave this script.
 if(!/^\s*query\b/.test(query)||/\bmutation\b|\bsubscription\b/i.test(query))throw Error('Refused: only read queries are sent to LeanIX.');
 requests++;
 const response=await fetch(`${base}/services/pathfinder/v1/graphql`,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
 if(response.status===401)throw Error('LeanIX refused the request (HTTP 401): the access token expired or lacks read rights.');
 if(!response.ok)throw Error(`LeanIX GraphQL answered HTTP ${response.status}.`);
 return response.json();
}

// Meta model v3 has the type Process (this workspace's export of 2026-10-20 lists Process, not BusinessContext);
// v4 has BusinessContext with category "process". Optional fields are dropped when the workspace does not know them.
const SCHEMAS=[{rel:'relApplicationToProcess',type:'Process'},{rel:'relApplicationToBusinessContext',type:'BusinessContext',v4:true}];
const OPTIONAL={level:'level',lifecycle:'lifecycle { asString phases { phase startDate } }',parent:'relToParent { edges { node { factSheet { id displayName } } } }',category:'category'};
let schema=SCHEMAS[0],optional=Object.keys(OPTIONAL).filter(k=>k!=='category'),withTotal=true;
const fields=()=>`id name displayName type description ... on ${schema.type} { ${optional.map(k=>OPTIONAL[k]).join(' ')} }`;
const appQuery=()=>`query AppProcesses($id: ID!) { factSheet(id: $id) { id name displayName type ... on Application { ${schema.rel} { ${withTotal?'totalCount ':''}edges { node { factSheet { ${fields()} } } } } } } }`;
const processQuery=()=>`query ProcessById($id: ID!) { factSheet(id: $id) { ${fields()} } }`;

// Adjusts the query to the workspace when LeanIX reports an unknown field or type; returns false when it cannot.
function adapt(errors){
 const text=errors.map(e=>String(e?.message||'')).join('\n');
 const unknownField=[...text.matchAll(/Field '([^']+)' in type '([^']+)' is undefined|Cannot query field "([^"]+)" on type "([^"]+)"/g)].map(m=>m[1]||m[3]);
 const unknownType=/Unknown type '?"?(\w+)/.test(text)||/UnknownType/.test(text);
 let changed=false;
 for(const field of unknownField){
  const key=Object.keys(OPTIONAL).find(k=>OPTIONAL[k].split(/[\s{]/)[0]===field);
  if(['phases','phase','startDate'].includes(field)&&OPTIONAL.lifecycle.includes('phases')){OPTIONAL.lifecycle='lifecycle { asString }';changed=true;}
  else if(field==='asString'&&optional.includes('lifecycle')){optional=optional.filter(k=>k!=='lifecycle');changed=true;}
  else if(key&&optional.includes(key)){optional=optional.filter(k=>k!==key);changed=true;}
  else if(field==='totalCount'&&withTotal){withTotal=false;changed=true;}
  else if(field===schema.rel&&!schema.v4){schema=SCHEMAS[1];optional=[...new Set([...optional,'category'])];changed=true;}
 }
 if(!changed&&unknownType&&!schema.v4){schema=SCHEMAS[1];optional=[...new Set([...optional,'category'])];changed=true;}
 return changed;
}
async function ask(makeQuery,variables){
 for(let attempt=0;attempt<8;attempt++){
  const json=await graphql(makeQuery(),variables);
  if(!json.errors?.length)return json.data;
  if(!adapt(json.errors))throw Error(`LeanIX GraphQL error: ${json.errors.map(e=>e.message).join(' | ').slice(0,500)}`);
 }
 throw Error('LeanIX GraphQL: the query could not be adapted to this workspace.');
}

const toProcess=node=>{
 const parent=node.relToParent?.edges?.[0]?.node?.factSheet;
 const phases=(node.lifecycle?.phases||[]).filter(p=>p?.phase).map(p=>`${p.phase}${p.startDate?' '+p.startDate:''}`).join('; ');
 return {id:node.id,name:node.name||'',displayName:node.displayName||node.name||'',type:node.type,description:node.description||'',level:node.level??null,
  lifecycle:node.lifecycle?.asString?`${node.lifecycle.asString}${phases?` (${phases})`:''}`:phases,parentId:parent?.id||null,parentName:parent?.displayName||'',category:node.category||''};
};
const isProcess=p=>!schema.v4||!p.category||/process/i.test(p.category);

async function main(){
 const apps=toolApps(dataPath).slice(0,limit);
 console.log(`Tool applications: ${apps.length} (from ${path.relative(process.cwd(),dataPath)||dataPath}). Asking LeanIX, read-only...`);
 bearer=await accessToken();
 const processes=new Map(),links=new Map(),linkedNames=new Map(),notFound=[],withoutProcesses=[],raw={apps:[],processes:[]},truncated=[];
 let failedInRow=0;
 for(const [i,app] of apps.entries()){
  let sheet;
  try{sheet=(await ask(appQuery,{id:app.id}))?.factSheet;failedInRow=0;}
  catch(error){
   // One missing or unreadable fact sheet is listed and skipped; several in a row means the query itself is wrong.
   if(/HTTP|Refused|could not be adapted/.test(error.message)||++failedInRow>=5)throw error;
   sheet=null;app.problem=error.message.slice(0,200);
  }
  if(!sheet){notFound.push(app);continue;}
  const relation=sheet[schema.rel]||{edges:[]},nodes=relation.edges.map(e=>e?.node?.factSheet).filter(Boolean).map(toProcess).filter(isProcess);
  if(withTotal&&Number.isFinite(relation.totalCount)&&relation.totalCount>relation.edges.length)truncated.push(app.name);
  raw.apps.push({id:app.id,name:sheet.displayName||sheet.name,processes:nodes.map(n=>n.id)});
  if(!nodes.length)withoutProcesses.push(app);
  linkedNames.set(app.id,nodes.map(n=>n.displayName));
  for(const node of nodes){processes.set(node.id,node);if(!links.has(node.id))links.set(node.id,[]);links.get(node.id).push(app);}
  if((i+1)%10===0||i+1===apps.length)console.log(`  ${i+1}/${apps.length} applications read`);
 }
 // Parents up to the top of each hierarchy, so every row has its full path.
 const queue=[...processes.values()].map(p=>p.parentId).filter(Boolean),missingParents=[];
 while(queue.length){
  const id=queue.shift();if(processes.has(id))continue;
  let sheet=null;
  try{sheet=(await ask(processQuery,{id}))?.factSheet;}catch(error){if(/HTTP|Refused/.test(error.message))throw error;}
  if(!sheet){missingParents.push(id);continue;}
  const parent=toProcess(sheet);processes.set(id,parent);if(parent.parentId)queue.push(parent.parentId);
 }
 raw.processes=[...processes.values()];
 const rows=processRows([...processes.values()],links),diffs=differences(apps,linkedNames);
 const generatedAt=new Date().toISOString().slice(0,16).replace('T',' ')+' UTC';
 const notes=[`LeanIX 模型：${schema.v4?'v4（Business Context，只保留 category 为 process 的）':'v3（Process）'}；读取的字段：${['name','displayName','description',...optional].join('、')}。`,
  ...(truncated.length?[`注意：${truncated.length} 个应用的关系条数多于返回条数，可能不全：${truncated.join('、')}。`]:[]),
  ...(missingParents.length?[`注意：${missingParents.length} 个上级 Process 读不到（不存在或无权读取），相关行的层级路径不完整。`]:[]),`共发送 ${requests} 次只读查询。`];
 mkdirSync(outDir,{recursive:true});
 writeCsv(path.join(outDir,'leanix_processes.csv'),rows);
 writeFileSync(path.join(outDir,'leanix_processes_summary.md'),summaryMarkdown({source:`LeanIX API（${host||base}），按工具里 ${apps.length} 个应用的 LeanIX ID 读取`,generatedAt,apps,rows,diffs,notFound,withoutProcesses,notes}));
 writeFileSync(path.join(outDir,'leanix_processes_raw.json'),JSON.stringify({generatedAt,schema:schema.type,fields:optional,...raw},null,1));
 console.log(`Done: ${rows.length} processes linked to ${apps.length-notFound.length-withoutProcesses.length} applications; ${diffs.length} applications differ from the tool's records.`);
 console.log(`Written to ${outDir}: leanix_processes.csv, leanix_processes_summary.md, leanix_processes_raw.json (git-ignored).`);
}
main().catch(error=>{console.error(String(error.message||error).replaceAll(token,'***').replaceAll(bearer||'\u0000','***'));process.exit(1);});

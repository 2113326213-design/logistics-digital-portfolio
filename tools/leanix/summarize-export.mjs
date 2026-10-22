// Reads LeanIX Excel exports put in leanix_export/, lists every sheet with its columns and row count, keeps the
// Process fact sheets that belong to the tool's applications and writes leanix_export/leanix_processes.csv and
// leanix_processes_summary.md. Same output as find-processes.mjs, for when the export was made by hand.
//
//   node tools/leanix/summarize-export.mjs [--in leanix_export] [--out <folder, default: --in>] [--data program/public/data.json]
//
// Read-only: a LeanIX export is also LeanIX's import template. This script only reads it; it never changes the file
// and never talks to LeanIX. Uses the tool's own xlsx reader (no Python or pandas needed).
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {readXlsx} from '../../program/public/xlsx.mjs';
import {installDOMParser} from '../../program/scripts/xml-dom.mjs';

installDOMParser();// the xlsx reader parses XML like the browser does
import {toolApps,DEFAULT_DATA,DEFAULT_OUT,same,processRows,differences,summaryMarkdown,writeCsv} from './leanix-common.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const inDir=path.resolve(option('--in')||DEFAULT_OUT),outDir=path.resolve(option('--out')||inDir),dataPath=path.resolve(option('--data')||DEFAULT_DATA);
const text=value=>String(value??'').trim();
const list=value=>text(value).split(';').map(v=>v.trim()).filter(Boolean);// LeanIX list separator

// Header: row 1 technical names and row 2 display names (LeanIX export), or one row of display names (table view).
function layout(rows){
 const looks=row=>Array.isArray(row)&&row.some(c=>/^(name|display ?name|displayname)$/i.test(text(c)))&&row.some(c=>/^(type|id)$/i.test(text(c)));
 const h=rows.slice(0,5).findIndex(looks);if(h<0)return null;
 const second=looks(rows[h+1])?rows[h+1]:null,headers=[rows[h],second].filter(Boolean);
 const find=(...names)=>{for(const header of headers){const i=header.findIndex(c=>names.some(n=>n instanceof RegExp?n.test(text(c)):text(c).toLowerCase()===n.toLowerCase()));if(i>=0)return i;}return -1;};
 const all=(...patterns)=>[...new Set(headers.flatMap(header=>header.map((c,i)=>patterns.some(p=>p.test(text(c)))?i:-1).filter(i=>i>=0)))];
 return {start:h+headers.length,headers,
  id:find('id'),type:find('type'),name:find('name'),displayName:find('displayName','Display Name','Full Name'),description:find('description'),
  parent:find('relToParent','Parent'),level:find('level'),category:find('category','subtype'),
  apps:all(/^relProcessToApplication/i,/^relBusinessContextToApplication/i,/^Applications?$/i),lifecycle:all(/^lifecycle/i)};
}

async function main(){
 if(!existsSync(inDir)){console.error(`${inDir} does not exist. Put the LeanIX export (.xlsx) there first.`);process.exit(2);}
 const files=readdirSync(inDir).filter(f=>/\.xlsx$/i.test(f)&&!f.startsWith('~$'));
 if(!files.length){console.error(`No .xlsx file in ${inDir}. Put the LeanIX export there first.`);process.exit(2);}
 const apps=toolApps(dataPath),byName=new Map(apps.map(a=>[same(a.name),a])),byId=new Map(apps.map(a=>[a.id,a]));
 const records=new Map();for(const app of apps)for(const r of app.records){const k=same(r);if(!records.has(k))records.set(k,[]);records.get(k).push(app);}
 const processes=[],links=new Map(),notes=[],seen=new Set();let withAppsColumn=false;
 for(const file of files){
  const sheets=await readXlsx(new Blob([readFileSync(path.join(inDir,file))]));
  console.log(`\n${file}`);
  for(const [sheet,rows] of Object.entries(sheets)){
   const l=/^readme$/i.test(sheet)?null:layout(rows);
   const columns=l?l.headers[l.headers.length-1].map(text):[];
   console.log(`  sheet "${sheet}": ${rows.length} rows${l?`, ${rows.length-l.start} records, ${columns.length} columns`:' (documentation or not a fact sheet table)'}`);
   if(!l)continue;
   console.log(`    columns: ${columns.join(' | ')}`);
   if(l.apps.length)withAppsColumn=true;
   for(const row of rows.slice(l.start)){
    const type=l.type>=0?text(row[l.type]):'',category=l.category>=0?text(row[l.category]):'';
    if(type&&!/^process$/i.test(type)&&!(/^businesscontext$/i.test(type.replace(/\s/g,''))&&/process/i.test(category)))continue;
    const displayName=text(row[l.displayName>=0?l.displayName:l.name]),name=text(row[l.name>=0?l.name:l.displayName]);
    if(!displayName&&!name)continue;
    const id=l.id>=0&&text(row[l.id])?text(row[l.id]):`${file}#${sheet}#${displayName||name}`;
    if(seen.has(id))continue;seen.add(id);
    const lifecycle=l.lifecycle.map(i=>[text(l.headers[0][i]).replace(/^lifecycle:?/i,''),text(row[i])]).filter(([,v])=>v).map(([k,v])=>k?`${k} ${v}`:v).join('; ');
    processes.push({id,name,displayName:displayName||name,description:l.description>=0?text(row[l.description]):'',level:l.level>=0&&text(row[l.level])?Number(row[l.level]):null,
     lifecycle,parentName:l.parent>=0?list(row[l.parent])[0]||'':'',parentId:null});
    // Linked to the tool: an application of the tool in the relation column, or a name the tool already holds.
    const linked=[...new Set([...l.apps.flatMap(i=>list(row[i])).map(v=>byId.get(v)||byName.get(same(v))).filter(Boolean),...(records.get(same(displayName))||[]),...(records.get(same(name))||[])])];
    if(linked.length)links.set(id,linked);
   }
  }
 }
 // Parents by display name, so the path can be followed inside the export.
 const byDisplay=new Map(processes.map(p=>[same(p.displayName),p]));
 for(const p of processes)if(p.parentName)p.parentId=byDisplay.get(same(p.parentName))?.id||null;
 if(!withAppsColumn)notes.push('导出里没有 Applications（关联应用）列，只能按名称和工具里的记录对照；导出时请加上这一列。');
 const rows=processRows(processes,links),linkedNames=new Map();
 for(const [id,list] of links)for(const app of list){if(!linkedNames.has(app.id))linkedNames.set(app.id,[]);linkedNames.get(app.id).push(processes.find(p=>p.id===id).displayName);}
 const withoutProcesses=apps.filter(a=>!linkedNames.has(a.id));
 const diffs=withAppsColumn?differences(apps,linkedNames):[];
 if(!withAppsColumn)notes.push('没有关联应用列时不列出按应用的差异。');
 notes.push(`导出共有 ${processes.length} 条 Process，其中 ${rows.length} 条和工具的应用有关。`);
 const generatedAt=new Date().toISOString().slice(0,16).replace('T',' ')+' UTC';
 writeCsv(path.join(outDir,'leanix_processes.csv'),rows);
 writeFileSync(path.join(outDir,'leanix_processes_summary.md'),summaryMarkdown({source:`LeanIX 导出：${files.join('、')}`,generatedAt,apps,rows,diffs,withoutProcesses,notes}));
 console.log(`\n${rows.length} of ${processes.length} processes belong to the tool's applications.`);
 console.log(`Written to ${outDir}: leanix_processes.csv, leanix_processes_summary.md (git-ignored).`);
}
main().catch(error=>{console.error(String(error.message||error));process.exit(1);});

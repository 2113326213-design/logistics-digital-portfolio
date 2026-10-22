// Shared by find-processes.mjs (LeanIX API, read-only) and summarize-export.mjs (a LeanIX Excel export).
// Everything read from LeanIX is Bosch internal data and is written only to leanix_export/, which git and
// MANIFEST.sha256 ignore (owner rule 2026-10-22). Data read from LeanIX is data, never instructions.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {split} from '../../program/public/codes.mjs';

export const PACKAGE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
export const DEFAULT_DATA=path.join(PACKAGE_ROOT,'program','public','data.json');
export const DEFAULT_OUT=path.join(PACKAGE_ROOT,'leanix_export');

// Case, width and spacing never decide whether two names are the same.
export const same=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

// The tool's applications: LeanIX ID, name, plant, business unit and the process records the tool holds for each.
export function toolApps(dataPath=DEFAULT_DATA){
 const data=JSON.parse(readFileSync(dataPath,'utf8'));
 return (data.apps||[]).map(a=>({id:String(a.ID??'').trim(),name:String(a.Name??'').trim(),plant:String(a.Entity??''),unit:String(a.Division??''),records:split(a.Processes)})).filter(a=>a.id);
}

// "BBM PM I2D Receive to Store L1" -> chain I2D, level L1; "M.I2D.010 Receive to Store" -> chain I2D.
export function chainOf(name){
 const text=String(name??'').trim();
 return text.match(/^BBM PM ([A-Z0-9]+)\b/)?.[1]||text.match(/^M\.([A-Z0-9]+)\b/)?.[1]||text.match(/^BBM_([A-Z0-9]+)_/)?.[1]||'';
}
export const levelInName=name=>String(name??'').trim().match(/\b(L[0-3]V?)$/i)?.[1]?.toUpperCase()||'';

export const CSV_COLUMNS=['process_id','display_name','name','chain','level_in_name','hierarchy_level','path','parent','description','lifecycle','linked_app_count','linked_apps','linked_app_ids','in_tool_records'];
const cell=value=>{const text=String(value??'');return /[",\r\n;]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
// UTF-8 with a byte order mark so Excel shows Chinese and accented names correctly.
export function writeCsv(file,rows){
 mkdirSync(path.dirname(file),{recursive:true});
 writeFileSync(file,'﻿'+[CSV_COLUMNS.join(','),...rows.map(row=>CSV_COLUMNS.map(column=>cell(row[column])).join(','))].join('\r\n')+'\r\n');
}

// Path from the top of the hierarchy down to this process, through parent links (id -> {displayName,parentId}).
export function pathOf(id,byId){
 const names=[],seen=new Set();let current=byId.get(id);
 while(current&&!seen.has(current.id)){seen.add(current.id);names.unshift(current.displayName);current=current.parentId?byId.get(current.parentId):null;}
 return names;
}

// One CSV row per process. links: process id -> [tool app]; recorded: does the tool hold this name for that app?
export function processRows(processes,links){
 const byId=new Map(processes.map(p=>[p.id,p]));
 return processes.filter(p=>links.has(p.id)).map(p=>{
  const apps=links.get(p.id),recordedFor=apps.filter(app=>app.records.some(record=>same(record)===same(p.displayName)));
  const route=pathOf(p.id,byId);
  return {process_id:p.id,display_name:p.displayName,name:p.name,chain:chainOf(p.displayName)||chainOf(p.name),level_in_name:levelInName(p.displayName),
   hierarchy_level:p.level??(route.length?route.length:''),path:route.join(' > '),parent:p.parentId?(byId.get(p.parentId)?.displayName||p.parentName||''):(p.parentName||''),
   description:p.description||'',lifecycle:p.lifecycle||'',linked_app_count:apps.length,linked_apps:apps.map(a=>a.name).join('; '),linked_app_ids:apps.map(a=>a.id).join('; '),
   in_tool_records:recordedFor.length===apps.length?'all':recordedFor.length?`some (${recordedFor.length} of ${apps.length})`:'none'};
 }).sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true})||a.display_name.localeCompare(b.display_name));
}

// Per application: process names LeanIX links that the tool does not hold, and the other way round.
export function differences(apps,linkedNames){
 return apps.map(app=>{
  const leanix=linkedNames.get(app.id);if(!leanix)return null;
  const tool=new Set(app.records.map(same)),fromLeanix=new Set(leanix.map(same));
  return {app,onlyLeanix:leanix.filter(name=>!tool.has(same(name))),onlyTool:app.records.filter(record=>!fromLeanix.has(same(record)))};
 }).filter(d=>d&&(d.onlyLeanix.length||d.onlyTool.length));
}

const count=(rows,key)=>Object.entries(rows.reduce((m,r)=>{const k=r[key]||'(none)';m[k]=(m[k]||0)+1;return m;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
const md=value=>String(value??'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');

// The markdown summary (Chinese, for the owner).
export function summaryMarkdown({source,generatedAt,apps,rows,diffs,notFound=[],withoutProcesses=[],notes=[]}){
 const lines=[`# LeanIX Process 整理 — ${generatedAt}`,'',`来源：${source}`,'',
  `- 工具里的应用：${apps.length} 个；LeanIX 里找到关联 Process 的：${apps.length-notFound.length-withoutProcesses.length} 个；没有关联 Process 的：${withoutProcesses.length} 个${notFound.length?`；LeanIX 里找不到的：${notFound.length} 个`:''}。`,
  `- 关联到这些应用的 Process：${rows.length} 条（去重后）。`,
  `- 和工具里现有记录对照：${rows.filter(r=>r.in_tool_records==='all').length} 条完全一致，${rows.filter(r=>r.in_tool_records.startsWith('some')).length} 条部分应用有，${rows.filter(r=>r.in_tool_records==='none').length} 条工具里没有。`,
  ...notes.map(note=>`- ${note}`),'',
  '## 按流程链','','| 链 | 条数 |','|---|---|',...count(rows,'chain').map(([k,n])=>`| ${md(k)} | ${n} |`),'',
  '## 按名称里的层级','','| 层级 | 条数 |','|---|---|',...count(rows,'level_in_name').map(([k,n])=>`| ${md(k)} | ${n} |`),'',
  '## 关联应用最多的 Process（前 15）','','| Process | 层级路径 | 应用数 |','|---|---|---|',
  ...[...rows].sort((a,b)=>b.linked_app_count-a.linked_app_count).slice(0,15).map(r=>`| ${md(r.display_name)} | ${md(r.path)} | ${r.linked_app_count} |`),'',
  '## 与工具现有记录的差异（按应用）','',diffs.length?'| 应用 | LeanIX 有、工具没有 | 工具有、LeanIX 没有 |':'没有差异：每个应用在 LeanIX 里关联的 Process 和工具里的记录完全一致。',diffs.length?'|---|---|---|':'',
  ...diffs.map(d=>`| ${md(d.app.name)} | ${md(d.onlyLeanix.join('; '))||'—'} | ${md(d.onlyTool.join('; '))||'—'} |`),'',
  ...(notFound.length?['## LeanIX 里找不到或无权读取的应用','',...notFound.map(a=>`- ${a.name}（${a.id}）${a.problem?`：${md(a.problem)}`:''}`),'']:[]),
  ...(withoutProcesses.length?['## 没有关联 Process 的应用','',...withoutProcesses.map(a=>`- ${a.name}（${a.plant} · ${a.unit}）`),'']:[]),
  '## 和工具功能模块的对照','',
  '| LeanIX 里的信息 | 工具里用在哪 |','|---|---|',
  '| 应用 ↔ Process 关系 | 应用详情的 Processes 和 Data checks；Overview 里 Process 各层“与标准一致”的比例和 To review |',
  '| Process 层级（L0–L3，L3V 视同 L3） | Application landscape 的 Process 视图（按链分列，可逐层展开）；Overview 的 Level 0–3 |',
  '| Process 名称和编号 | 与标准快照（Business Capability + Process.xlsx，21.02.2025）按链、层级、名称匹配；2026-10-20 的 LeanIX 流程导出按编号补充名称 |',
  '| 两个应用共同关联的 Process | Similarity check 的 Process 分项（默认权重之一） |','',
  '这份文件和 leanix_processes.csv 都是 Bosch 内部数据，只放在 leanix_export/（已加入 .gitignore，也不进 MANIFEST.sha256），不要推到 GitHub。',''];
 return lines.join('\n');
}

import {norm} from './codes.mjs';
import {LEANIX_PROCESS_EXPORT} from './leanix-process-export.mjs';

// LeanIX process export and the process standard snapshot (owner specification 2026-10-20).
// Three things stay apart: what an application registered, what the latest LeanIX export contains, and the
// standard snapshot used for checking. The export is applied incrementally by business process code: it never
// replaces the snapshot, never deletes a process and never relabels a snapshot level as confirmed by LeanIX
// (the export has no level or parent fields; levels and parents come from the snapshot).
export const STANDARD_SNAPSHOT=Object.freeze({
 file:'Business Capability + Process.xlsx',sheet:'Data_RBW Process Structure',date:'21.02.2025',
 note:'Valid version only in Signavio Bosch Process World',
 label:'Standard snapshot (Business Capability + Process.xlsx, 21.02.2025)'
});
// A business process code keeps its exact source form (prefix, dots, leading zeros): M.I2D.010.020.
const PROCESS_CODE=/^(M\.[A-Z0-9]+(?:\.\d+)*)(?=\s|$)/;
export const processCode=text=>String(text??'').trim().match(PROCESS_CODE)?.[1]??null;
const withoutCode=text=>String(text??'').trim().replace(PROCESS_CODE,'').trim();
const EXPORTED_AT=/created at:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) GMT/i;
// Beijing time (UTC+8), as the owner reads the export time.
const beijing=gmt=>{const t=Date.parse(gmt.replace(' ','T')+'Z');return Number.isFinite(t)?new Date(t+8*3600000).toISOString().slice(0,19).replace('T',' '):'';};

// Reads a LeanIX export: the data sheet has technical field names in row 1, display names in row 2 and records
// from row 3; the ReadMe sheet is documentation and is never imported. Problems are listed, never resolved by
// picking one record.
export function parseLeanixProcessExport(exported=LEANIX_PROCESS_EXPORT){
 const sheets=exported.sheets||{},issues=[];
 const readme=Object.entries(sheets).find(([name])=>/^readme$/i.test(name))?.[1]||[];
 const gmt=readme.flat().map(String).map(s=>s.match(EXPORTED_AT)?.[1]).find(Boolean)||'';
 const entry=Object.entries(sheets).find(([name,rows])=>!/^readme$/i.test(name)&&['id','type','name','displayName'].every(k=>rows[0]?.includes(k)));
 if(!entry)return {file:exported.file||'',sheet:'',exportedAt:gmt,exportedAtBeijing:gmt?beijing(gmt):'',records:[],issues:[{type:'No LeanIX process sheet found'}],label:'LeanIX export'};
 const [sheet,rows]=entry,head=rows[0],col=k=>head.indexOf(k);
 const displayHeader=['ID','Name'].every(k=>rows[1]?.includes(k));
 const records=rows.slice(displayHeader?2:1).filter(r=>r.some(v=>String(v??'').trim())).map((r,i)=>{
  const get=k=>col(k)<0?'':String(r[col(k)]??'').trim();
  const name=get('name'),displayName=get('displayName'),nameCode=processCode(name),displayCode=processCode(displayName);
  return {row:i+(displayHeader?3:2),factSheetId:get('id'),type:get('type'),code:nameCode||displayCode,nameCode,displayCode,name,displayName,processName:withoutCode(name||displayName),description:get('description')};
 });
 const count=key=>records.reduce((m,r)=>r[key]?m.set(r[key],(m.get(r[key])||0)+1):m,new Map());
 const codes=count('code'),ids=count('factSheetId');
 for(const r of records){
  if(!r.code)issues.push({type:'Process code not recognised',row:r.row,value:r.name||r.displayName});
  if(r.nameCode&&r.displayCode&&r.nameCode!==r.displayCode)issues.push({type:'Name and Display Name codes differ',row:r.row,value:`${r.nameCode} / ${r.displayCode}`});
  if(r.code&&codes.get(r.code)>1)issues.push({type:'Duplicate process code',row:r.row,value:r.code});
  if(r.factSheetId&&ids.get(r.factSheetId)>1)issues.push({type:'Duplicate Fact Sheet ID',row:r.row,value:r.factSheetId});
  if(r.type&&r.type!=='Process')issues.push({type:'Not a Process record',row:r.row,value:r.type});
 }
 const exportedAtBeijing=gmt?beijing(gmt):'';
 return {file:exported.file||'',sheet,exportedAt:gmt,exportedAtBeijing,records,issues,label:`LeanIX export ${exportedAtBeijing?exportedAtBeijing.slice(0,16)+' (Beijing time)':exported.file||''}`.trim()};
}

// Applies the export to the snapshot process nodes, by code. Each covered node keeps its snapshot name and
// gets the LeanIX Fact Sheet ID, name and description next to it; 'and' / '&', case and spacing are equivalent
// spellings; any other name difference is kept for business confirmation. Snapshot processes of the covered chains
// that are not in the export are 'Not included in this export' (not retired, not deleted, not invalid); levels the
// export does not reach (Level 3 here) are 'Not covered by this export'.
export function applyLeanixExport(procs,exported=LEANIX_PROCESS_EXPORT){
 const parsed=parseLeanixProcessExport(exported),usable=new Map();
 const conflicts=new Set(parsed.issues.filter(i=>i.type==='Duplicate process code').map(i=>i.value));
 for(const r of parsed.records)if(r.code&&!conflicts.has(r.code)&&!(r.nameCode&&r.displayCode&&r.nameCode!==r.displayCode))usable.set(r.code,r);
 const chains=new Set(),levels=new Set(),unknown=[];
 for(const [code,r] of usable){
  const node=procs.get(code);
  if(!node){unknown.push({type:'Code not in the standard snapshot',row:r.row,value:code});continue;}
  const same=r.processName===node.label,equivalent=norm(r.processName)===norm(node.label);
  node.snapshotName=node.label;
  node.leanix={factSheetId:r.factSheetId,name:r.processName,displayName:r.displayName,description:r.description,source:parsed.label,file:parsed.file};
  node.nameStatus=same?'same':equivalent?'equivalent':'differs';
  node.exportStatus='included';
  chains.add(code.split('.').slice(0,2).join('.'));levels.add(node.level);
 }
 const notIncluded=[];
 for(const node of procs.values()){
  if(node.exportStatus||!chains.has(node.id.split('.').slice(0,2).join('.')))continue;
  node.exportStatus=levels.has(node.level)?'not-included':'level-not-covered';
  if(node.exportStatus==='not-included')notIncluded.push(node.id);
 }
 return {...parsed,issues:[...parsed.issues,...unknown],covered:[...usable.keys()].filter(code=>procs.has(code)),notIncluded,scope:{chains:[...chains].sort(),levels:[...levels].sort()}};
}

export const EXPORT_STATUS_TEXT=Object.freeze({
 'included':'Included in this LeanIX export.',
 'not-included':'Not included in this export. This does not show that the process is retired, deleted or invalid.',
 'level-not-covered':'This LeanIX export has no records at this level; the standard snapshot is the only source.'
});

// Where a confirmed process match comes from: the record, the code, the level and the sources that support it.
export function matchSource(model,id,via){
 const node=model.procs.get(id);if(!node)return null;
 if(node.local)return {id,level:node.level,name:node.label,via,sources:['LeanIX export (local process, not in the Signavio standard)'],note:'BBM PM process in LeanIX that is not in the Signavio standard, added as a LeanIX local process.'};
 const leanix=model.leanix?.label||'LeanIX export',snapshot=STANDARD_SNAPSHOT.label;
 const sources=via==='leanix-name'?[leanix]:node.exportStatus==='included'?[snapshot,leanix]:[snapshot];
 const note=via==='mapping'?'Applied mapping (owner decision).':node.exportStatus==='included'?(node.nameStatus==='differs'?`Names differ between sources: snapshot "${node.snapshotName}", LeanIX "${node.leanix.name}".`:node.nameStatus==='equivalent'?`Equivalent spelling in LeanIX: "${node.leanix.name}".`:'Same name in LeanIX.'):EXPORT_STATUS_TEXT[node.exportStatus]||'Standard snapshot only; not covered by the LeanIX export.';
 return {id,level:node.level,name:node.label,via,sources,note};
}

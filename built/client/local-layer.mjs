// LeanIX local processes (V17, owner decision 2026-10-23: "Signavio 标准为主，LeanIX 的 BBM PM 本地流程作为单独标注的一层加进
// 流程目录，导入时先预览再 Apply"). The process catalogue stays the Signavio standard (processRows). BBM PM processes of the
// LeanIX export that are not in it can be added as a separate layer (data.localProcesses): each local process hangs
// under its LeanIX Parent, and its ID is the parent's ID followed by ".L" and the start of its LeanIX Fact Sheet ID, so
// every rule that reads the hierarchy from the ID prefix keeps working. Its name is shown as in LeanIX, without a tag
// (owner 2026-10-23: plant users should not see "(LeanIX local)"). This module has no imports, so the model and the
// workspace can both use it.
export const LOCAL_ID=/^M\.[A-Z0-9]+(?:\.\d+)*(?:\.L[0-9a-f]{8,32})+$/;

export function cleanLocalProcesses(value){
 if(!Array.isArray(value))return [];
 const seen=new Set();
 return value.flatMap(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p))return [];
  const id=String(p.id??'').trim(),parent=String(p.parent??'').trim(),name=String(p.name??'').replace(/\s+/g,' ').trim(),level=Number(p.level);
  if(!LOCAL_ID.test(id)||!parent||!id.startsWith(parent+'.L')||id.slice(parent.length+1).includes('.')||!name||![1,2,3].includes(level)||seen.has(id))return [];
  seen.add(id);
  return [{id,name,level,parent,leanixId:String(p.leanixId??''),leanixName:String(p.leanixName??'')}];
 });
}

// Adds the layer to the model's process nodes, after the Signavio standard. A local process whose parent is not in the
// catalogue (e.g. after another taxonomy was imported) or is not one level above it is left out.
export function addLocalProcesses(procs,list){
 let pending=cleanLocalProcesses(list);
 for(let pass=0;pending.length&&pass<4;pass++)pending=pending.filter(p=>{
  if(procs.has(p.id))return false;
  const parent=procs.get(p.parent);if(!parent)return true;
  if(parent.level!==p.level-1)return false;
  procs.set(p.id,{id:p.id,label:p.name,matchName:p.name,level:p.level,chain:parent.chain,children:[],parent:p.parent,local:true,leanixLocal:{factSheetId:p.leanixId,name:p.leanixName}});
  return false;
 });
}

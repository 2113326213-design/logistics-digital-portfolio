import {DATA_PACKAGE_FILE,readDataPackage,createDataPackage} from './data-package.mjs';
import {uploadWarnings} from './import-warnings.mjs';

// Upload to server (V18, owner 2026-10-23: "客户自己做完后覆盖然后在上传到服务器给大家看", "你直接写好我在安装进去").
// On the intranet page, whoever updated the data sends it to the IIS server as logistics-data.json, and everyone who
// opens the tool is then offered it (V14). The server takes the file through WebDAV, from a signed-in Windows user
// only (the deploy script turns this on). The offline file (opened from the computer) never uploads.
// V20 (owner 2026-11-02, "先做 A 组"): the shared server data is protected.
//  - An upload replaces only the server data this page started from (data.serverBase: the package it took from the
//    server, or uploaded itself). Server data the page did not start from — someone else's upload, or a page that
//    kept older data — is never overwritten: the person first takes it, then imports again.
//  - The server keeps the last five uploads: logistics-data.previous.json (newest) to logistics-data.previous-5.json.
//    Restore earlier server data puts one of them back as the current data, so a bad upload can be undone.
//  - Large differences from the server data (applications added or removed) are shown first and need a second click.
// An empty file on the server (the deploy script creates the files empty) counts as no data.
export const BACKUP_FILES=Object.freeze(['logistics-data.previous.json','logistics-data.previous-2.json','logistics-data.previous-3.json','logistics-data.previous-4.json','logistics-data.previous-5.json']);
export const PREVIOUS_FILE=BACKUP_FILES[0];
export const canUpload=(protocol=globalThis.location?.protocol)=>/^https?:$/.test(String(protocol??''));
// The only network calls of this module: GET and PUT of the data files on the same server.
const send=(url,init)=>fetch(url,init);

// One data file on the server: {text, pkg}; text null when the file is missing or empty; pkg null when it cannot be read.
async function readFile(request,url){
 const response=await request(url,{cache:'no-store'});
 if(response.status===404)return {text:null,pkg:null};
 if(!response.ok)throw {status:response.status};
 const body=await response.text();
 if(!body.trim())return {text:null,pkg:null};
 let pkg=null;try{pkg=readDataPackage(body);}catch{}
 return {text:body,pkg};
}
const writeFile=async(request,url,body)=>{const response=await request(url,{method:'PUT',body,cache:'no-store',headers:{'Content-Type':'application/json'}});if(!response.ok)throw {status:response.status};};
const failure=error=>typeof error?.status==='number'?{status:'http',code:error.status}:{status:'unreachable'};

// base: the id of the server package this page started from (data.serverBase). confirmed: the person saw the
// warnings and clicked again. replaces: only for Restore earlier server data — the id of the server data being replaced.
export async function uploadToServer(text,{request=send,protocol,base='',confirmed=false,replaces=''}={}){
 if(!canUpload(protocol))return {status:'offline'};
 const ours=readDataPackage(text);
 try{
  const now=await readFile(request,DATA_PACKAGE_FILE);
  const conflict=pkg=>({status:'conflict',server:pkg?.dataAsOf||'',publishedAt:pkg?.publishedAt||'',pkg});
  // The same data: nothing is sent; the page counts it as its start (its id comes back).
  if(now.pkg?.id===ours.id)return {status:'same',id:ours.id,dataAsOf:ours.dataAsOf};
  if(replaces){if((now.pkg?.id||'')!==replaces)return {status:'changed'};}
  else if(now.pkg){
   if(now.pkg.dataAsOf&&ours.dataAsOf&&now.pkg.dataAsOf>ours.dataAsOf)return {status:'older',server:now.pkg.dataAsOf,dataAsOf:ours.dataAsOf};
   // The server package comes back with the conflict: the page checks whether it already holds all of it.
   if(now.pkg.id!==base)return conflict(now.pkg);
   const warnings=uploadWarnings(now.pkg,ours);
   if(warnings.length&&!confirmed)return {status:'check',warnings};
  }
  else if(now.text&&!confirmed)return {status:'check',warnings:['The data on the server cannot be read. Uploading replaces it.']};
  // The last five uploads are kept: each backup moves one place down, the oldest is dropped. A retry after a failed
  // upload finds the current data already kept as the newest backup: the backups then stay as they are (V20 review).
  if(now.text){
   const backups=[];for(const file of BACKUP_FILES.slice(0,-1))backups.push((await readFile(request,file)).text);
   if(backups[0]!==now.text){
    for(let i=BACKUP_FILES.length-1;i>0;i--)if(backups[i-1]!==null)await writeFile(request,BACKUP_FILES[i],backups[i-1]);
    await writeFile(request,PREVIOUS_FILE,now.text);
   }
  }
  // Another upload may have come in while the backups were written (V20 review): the data is then not replaced.
  const again=await readFile(request,DATA_PACKAGE_FILE);
  if(again.text!==now.text)return conflict(again.pkg);
  await writeFile(request,DATA_PACKAGE_FILE,text);
  const back=await readFile(request,DATA_PACKAGE_FILE);
  if(back.pkg?.id!==ours.id)return {status:'not-confirmed'};
  return {status:'done',id:ours.id,dataAsOf:ours.dataAsOf,previous:!!now.text,restored:!!replaces};
 }catch(error){return failure(error);}
}

// The current server data and the kept uploads, newest first, for Restore earlier server data.
export async function listServerData({request=send,protocol}={}){
 if(!canUpload(protocol))return {status:'offline'};
 try{
  const current=await readFile(request,DATA_PACKAGE_FILE),backups=[];
  for(const file of BACKUP_FILES){const read=await readFile(request,file);if(read.text)backups.push({file,pkg:read.pkg});}
  return {status:'ok',current:current.pkg,backups};
 }catch(error){return failure(error);}
}

// Puts a kept upload back as the current server data. The data is published again with a new time and marked as
// replacing the current server data and every upload after the one put back (newerIds, V20 review), so pages that took
// any of them are offered it although its data date is older (data-package.mjs packageIsNew). The replaced data becomes
// the newest backup, so this can be undone too. expectId: the data the person chose; if the file holds other data now
// (the backups moved), nothing is restored.
export async function restoreServerData(file,{request=send,protocol,currentId='',expectId='',newerIds=[],publishedAt=new Date().toISOString()}={}){
 if(!canUpload(protocol))return {status:'offline'};
 if(!BACKUP_FILES.includes(file))return {status:'unreadable'};
 let read;try{read=await readFile(request,file);}catch(error){return failure(error);}
 if(!read.pkg)return {status:'unreadable'};
 if(expectId&&read.pkg.id!==expectId)return {status:'changed'};
 const replaces=[...new Set([currentId,...newerIds].filter(id=>/^[0-9a-f]{16}$/.test(String(id??''))&&id!==read.pkg.id))];
 const text=JSON.stringify({...createDataPackage(read.pkg.data,{publishedAt}),...(replaces.length?{replaces}:{})},null,1);
 return uploadToServer(text,{request,protocol,replaces:currentId,confirmed:true});
}

// What the person who clicked reads (plain words, owner 2026-10-23).
export function uploadMessage(result){
 switch(result?.status){
  case 'done':return result.restored?`Restored. Everyone who opens the tool is now offered this data${result.dataAsOf?` (as of ${result.dataAsOf})`:''}. The data it replaced is kept as the newest backup.`:`Uploaded. Everyone who opens the tool now gets this data${result.dataAsOf?` (as of ${result.dataAsOf})`:''}.${result.previous?' The data it replaced is kept as a backup (the last five are kept).':''}`;
  case 'same':return 'The server already has this data. Nothing was uploaded.';
  case 'older':return `The server already has newer data (as of ${result.server}). Nothing was uploaded. Get it first with "Preview server data" at the top of this window.`;
  case 'conflict':return `The server has data that this page did not start from${result.server?` (as of ${result.server}${result.publishedAt?`, uploaded ${String(result.publishedAt).slice(0,10)}`:''})`:''}. Nothing was uploaded, so it is not overwritten. First take the server data with "Preview server data" at the top of this window, then import your file again and upload.`;
  case 'check':return `Check before uploading: ${result.warnings.join(' ')} If this is right, click Upload to server again.`;
  case 'changed':return 'The server data changed while you were choosing. Nothing was restored. Open the list again.';
  case 'unreadable':return 'This backup cannot be read. Nothing was restored.';
  case 'not-confirmed':return 'The file was sent, but the server did not give the same file back. Ask the server admin to check.';
  case 'offline':return 'Upload works only on the intranet page, not in the file opened from your computer.';
  case 'unreachable':return 'The server could not be reached. Nothing was uploaded.';
  case 'http':
   if(result.code===401)return 'The server did not accept your Windows sign-in. Nothing was uploaded.';
   if(result.code===403)return 'Your Windows account may not upload to this server. Ask the server admin. Nothing was uploaded.';
   if([404,405,501].includes(result.code))return 'This server does not take uploads yet. The server admin needs to run the latest deploy-iis.bat. Nothing was uploaded.';
   return `The server answered with error ${result.code}. Nothing was uploaded.`;
  default:return 'Nothing was uploaded.';
 }
}

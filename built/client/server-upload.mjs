import {DATA_PACKAGE_FILE,readDataPackage} from './data-package.mjs';

// Upload to server (V18, owner 2026-10-23: "客户自己做完后覆盖然后在上传到服务器给大家看", "你直接写好我在安装进去").
// On the intranet page, whoever updated the data sends it to the IIS server as logistics-data.json, and everyone who
// opens the tool is then offered it (V14). The server takes the file through WebDAV, from a signed-in Windows user
// only (the deploy script of V18 turns this on). Before writing, the file on the server is kept as
// logistics-data.previous.json, so the server admin can undo the last upload. A server file with newer data is never
// replaced, and the same file is not sent again. Afterwards the file is read back and checked.
// The offline file (opened from the computer) never uploads.
export const PREVIOUS_FILE='logistics-data.previous.json';
export const canUpload=(protocol=globalThis.location?.protocol)=>/^https?:$/.test(String(protocol??''));
// The one network call of this module: a GET or a PUT of the two data files on the same server.
const send=(url,init)=>fetch(url,init);

export async function uploadToServer(text,{request=send,protocol}={}){
 if(!canUpload(protocol))return {status:'offline'};
 const ours=readDataPackage(text);
 const read=async()=>{
  const response=await request(DATA_PACKAGE_FILE,{cache:'no-store'});
  if(response.status===404)return {text:null,pkg:null};
  if(!response.ok)throw {status:response.status};
  const body=await response.text();let pkg=null;try{pkg=readDataPackage(body);}catch{}
  return {text:body,pkg};
 };
 const write=async(url,body)=>{const response=await request(url,{method:'PUT',body,cache:'no-store',headers:{'Content-Type':'application/json'}});if(!response.ok)throw {status:response.status};};
 try{
  const now=await read();
  if(now.pkg?.id===ours.id)return {status:'same',dataAsOf:ours.dataAsOf};
  if(now.pkg?.dataAsOf&&ours.dataAsOf&&now.pkg.dataAsOf>ours.dataAsOf)return {status:'older',server:now.pkg.dataAsOf,dataAsOf:ours.dataAsOf};
  if(now.text)await write(PREVIOUS_FILE,now.text);
  await write(DATA_PACKAGE_FILE,text);
  const back=await read();
  if(back.pkg?.id!==ours.id)return {status:'not-confirmed'};
  return {status:'done',dataAsOf:ours.dataAsOf,previous:!!now.text};
 }catch(error){
  return typeof error?.status==='number'?{status:'http',code:error.status}:{status:'unreachable'};
 }
}

// What the person who clicked the button reads (plain words, owner 2026-10-23).
export function uploadMessage(result){
 switch(result?.status){
  case 'done':return `Uploaded. Everyone who opens the tool now gets this data${result.dataAsOf?` (as of ${result.dataAsOf})`:''}.${result.previous?` The file it replaced is kept as ${PREVIOUS_FILE}.`:''}`;
  case 'same':return 'The server already has this data. Nothing was uploaded.';
  case 'older':return `The server already has newer data (as of ${result.server}). Nothing was uploaded. Get it first with "Preview server data" at the top of this window.`;
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

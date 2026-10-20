import {english} from '../public/english.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel} from '../public/model.mjs';
import {autosaveLimitBytes} from '../public/autosave.mjs';
const reply=(body,status=200)=>Response.json(body.error?{...body,error:english(body.error)}:body,{status,headers:{'Cache-Control':'private, no-store','Vary':'oai-authenticated-user-id','X-Content-Type-Options':'nosniff'}});
const maxBytes=autosaveLimitBytes;
export async function workspaceAPI(request,env){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return reply({error:'请登录 ChatGPT 后使用自动保存。',code:'sign-in'},401);
 if(!['GET','PUT'].includes(request.method))return reply({error:'不支持此操作'},405);
 if(request.method==='PUT'){
  const origin=request.headers.get('Origin');
  if(!origin||origin!==new URL(request.url).origin)return reply({error:'请求来源不匹配'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'需要 JSON 工作区'},415);
 }
 if(!env.DB)return reply({error:'自动保存暂时不可用，请先导出工作区备份。'},503);
 try{
  if(request.method==='GET'){
   const row=await env.DB.prepare('SELECT payload, revision, updated_at FROM portfolio_workspaces WHERE user_id = ?').bind(user).first();
   return reply({data:row?JSON.parse(row.payload):null,revision:row?.revision||0,updatedAt:row?.updated_at||null});
  }
  if(Number(request.headers.get('content-length'))>maxBytes)return reply({error:'工作区较大，无法自动保存，请导出工作区备份。'},413);
  const reader=request.body?.getReader();let size=0;const chunks=[];
  if(!reader)return reply({error:'工作区内容为空'},400);
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return reply({error:'工作区较大，无法自动保存，请导出工作区备份。'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let input,data;
  try{input=JSON.parse(new TextDecoder().decode(bytes));if(!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('工作区版本无效');data=workspaceData(input.data);buildModel(data);if(data.isAcceptanceSample)throw Error('验收样例不覆盖已保存的工作区');}catch(e){return reply({error:e.message||'工作区内容无效'},400);}
  const payload=JSON.stringify(data),now=new Date().toISOString();
  // Revision checks make updates atomic across tabs and devices.
  const result=input.revision===0
   ?await env.DB.prepare('INSERT INTO portfolio_workspaces (user_id,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING RETURNING revision').bind(user,payload,now).first()
   :await env.DB.prepare('UPDATE portfolio_workspaces SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision').bind(payload,now,user,input.revision).first();
  if(!result)return reply({error:'另一个页面已保存了更新。请先导出当前工作区，再重新加载最新记录。',code:'conflict'},409);
  return reply({revision:result.revision,updatedAt:now});
 }catch(e){console.error('Workspace storage failure',e?.message||'unknown');return reply({error:'自动保存暂时失败，请先导出工作区备份，稍后重试。'},503);}
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/workspace')return workspaceAPI(request,env);
 if(path.startsWith('/api/'))return reply({error:'未找到此功能'},404);
 return env.ASSETS.fetch(request);
}};

import {english} from './english.mjs';
import {workspaceData} from './workspace.mjs';
// The worker rejects larger autosave requests; warn from 80% so users export in time.
export const autosaveLimitBytes=1500000;
const warningBytes=autosaveLimitBytes*.8;
export function createAutosave({getData,onRestore,onStatus,onRecovery=()=>{},request=fetch,requestTimeoutMs=10000}){
 let signedIn=false;
 let revision=0,ready=false,saving=false,pending=false,timer,blocked=false,loadKind='loading',loading=null,recovery=null;
 const status=(message,kind='saved')=>onStatus({message:english(message),kind});
 const bytes=text=>new TextEncoder().encode(text).length;
 const savedStatus=(message,size)=>size>warningBytes?status(`${message.replace(/\.?$/,'.')} Workspace is ${(size/1e6).toFixed(2)} MB, close to the ${autosaveLimitBytes/1e6} MB autosave limit. Export workspace to keep a backup.`,'warning'):status(message);
 async function send(options){
  const controller=new AbortController();let timeout;
  try{return await Promise.race([(async()=>{const response=await request('/api/workspace',{...options,signal:controller.signal});return {response,body:await response.json()};})(),new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('Request timed out'));},requestTimeoutMs);})]);}
  finally{clearTimeout(timeout);}
 }
 function load(){
  if(loading)return loading;
  if(getData()?.isAcceptanceSample){status('Return to inventory before recovering saved data.','error');return Promise.resolve(false);}
  loading=(async()=>{
   clearTimeout(timer);status('Loading saved workspace…','loading');
   try{
    const {response,body}=await send({credentials:'same-origin',cache:'no-store'});
    signedIn=response.ok;
    if(!response.ok){ready=false;loadKind=response.status===401?'signin':'error';status(body.error||'Unable to load saved data.',loadKind);return false;}
    const remote=body.data?workspaceData(body.data):null;
    revision=body.revision;ready=true;blocked=false;
    // Edits made before or during the GET must survive a late response.
    if(pending&&remote&&JSON.stringify(remote)!==JSON.stringify(workspaceData(getData()))){
     recovery={data:remote,revision};blocked=true;status('Choose which workspace to keep. Your changes are still in this tab.','conflict');onRecovery(recovery);return false;
    }
    recovery=null;
    if(remote&&!pending)onRestore(remote);
    savedStatus(remote?'Saved workspace restored.':'Autosave is on.',remote?bytes(JSON.stringify({revision,data:remote})):0);
    if(pending)await flush();
    return true;
   }catch{signedIn=false;ready=false;loadKind='error';status('Unable to load saved data. Retry or export your workspace.','error');return false;}
  })().finally(()=>{loading=null;});
  return loading;
 }
 function schedule(){
  if(getData()?.isAcceptanceSample)return;
  pending=true;clearTimeout(timer);
  if(blocked)return;
  if(!ready){if(!loading)status(loadKind==='signin'?'Not saved. Sign in or export a backup.':'Not saved. Retry or export a workspace backup.',loadKind==='signin'?'signin':'error');return;}
  status('Saving changes…','saving');timer=setTimeout(flush,350);
 }
 async function flush(){
  clearTimeout(timer);
  if(!ready||saving||blocked||!pending||getData()?.isAcceptanceSample)return;
  saving=true;pending=false;status('Autosaving…','saving');
  try{
   const payload=JSON.stringify({revision,data:workspaceData(getData())});
   const {response,body}=await send({method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:payload});
   if(!response.ok){if(response.status===401)signedIn=false;pending=true;blocked=response.status===409||response.status===401;status(body.error||'Unable to save changes.',response.status===401?'signin':'error');return;}
   revision=body.revision;savedStatus('Saved · '+new Date(body.updatedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),bytes(payload));
  }catch{pending=true;status('Autosave failed. Your changes remain in this tab. Retry or export a backup.','error');return;}
  finally{saving=false;}
  if(pending)await flush();
 }
 async function retry(){
  if(getData()?.isAcceptanceSample){status('Return to inventory before recovering saved data.','error');return;}
  if(recovery){onRecovery(recovery);return;}
  if(!ready||blocked)return load();
  pending=true;await flush();
 }
 async function resolveRecovery(choice){
  if(!recovery||!['local','saved'].includes(choice))return false;
  if(getData()?.isAcceptanceSample)return false;
  const remote=recovery;
  if(choice==='saved'){onRestore(remote.data);recovery=null;blocked=false;pending=false;status('Saved workspace restored.');}
  else {recovery=null;blocked=false;pending=true;await flush();}
  return true;
 }
 return {load,schedule,flush,retry,resolveRecovery,isSignedIn:()=>signedIn,hasUnsaved:()=>pending||saving};
}
const preferencesKey='logistics-portfolio-view-v1';
// Bundled data may not contain the user's saved plants, branches or app IDs.
// Retain the original preferences until the saved dataset arrives, unless the
// user has since changed the view.
export function viewForDatasetRestore(saved,rendered,current){
 return saved&&rendered&&JSON.stringify(rendered)===JSON.stringify(current)?saved:current;
}
export function readView(storage){try{return JSON.parse(storage.getItem(preferencesKey)||'null');}catch{return null;}}
export function writeView(storage,value){try{storage.setItem(preferencesKey,JSON.stringify(value));return true;}catch{return false;}}

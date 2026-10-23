// Save state of the offline edition (scripts/export-offline.mjs uses it in place of the cloud autosave).
// Export workspace starts a download of the current version, which the browser does not confirm as saved, so the
// export messages never say the file was saved.
// Since V11 (owner request 2026-10-22) every change is also kept in this browser on this computer (localStorage), and
// the next time the file or page is opened the user chooses to continue that work or to use the data in the file.
// When the browser does not allow local storage, the earlier behaviour applies: changes stay in this tab.
import {exportWorkspace,importWorkspace} from './workspace.mjs';
import {dataAsOf} from './data-as-of.mjs';
import {packageNotOlder} from './data-package.mjs';

export const OFFLINE_SAVE_MESSAGES={
 clean:'Offline edition: data is included in this file. No cloud connection.',
 unsaved:'Changes not exported. Export workspace before closing. To restore, reopen this file and use Import data with the exported file.',
 exportStarted:'Export of the current version started. Check the downloaded file. To restore, reopen this file and use Import data with that file.'
};
export const LOCAL_SAVE_MESSAGES={
 kept:'Changes are kept in this browser on this computer. Export workspace to back them up or to share them.'
};
export const LOCAL_SAVE_KEY='logistics-portfolio:kept-workspace';
const showNotice=message=>{const node=globalThis.document?.getElementById?.('sessionStatus');if(node)node.textContent=message;};
// localStorage can be missing (Node, tests) or blocked (browser privacy settings): then nothing is kept.
function browserStorage(){try{const storage=globalThis.window?.localStorage;if(!storage)return null;const probe=LOCAL_SAVE_KEY+':probe';storage.setItem(probe,'1');storage.removeItem(probe);return storage;}catch{return null;}}
// The work kept in this browser, or null when there is none or it cannot be read (then it is removed).
export function readKeptWork(storage){
 if(!storage)return null;
 let text;try{text=storage.getItem(LOCAL_SAVE_KEY);}catch{return null;}
 if(!text)return null;
 try{const kept=JSON.parse(text);const data=importWorkspace(kept.workspace);return {...kept,data};}
 catch{try{storage.removeItem(LOCAL_SAVE_KEY);}catch{}return null;}
}
const when=iso=>{const date=new Date(iso);return Number.isNaN(date.getTime())?'an earlier session':date.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
// What the restore question says (the dialog shows it; tests check it). The release is compared but never shown: the page
// shows no version number (owner decision 2026-10-23, V18.1).
export function keptWorkText(kept,{release='',source='',dataAsOf=''}={}){
 const pkg=kept.data?.dataPackage;
 const from=[kept.source?`data from ${kept.source}`:'',pkg?`published on the intranet server${pkg.dataAsOf?`, as of ${pkg.dataAsOf}`:''}`:''].filter(Boolean).join(', ');
 const text=`This browser keeps work from ${when(kept.savedAt)}${from?` (${from})`:''}. Continue it, or start from the data in this file and delete the kept work.`;
 const newer=(kept.release&&release&&kept.release!==release)||(kept.source&&source&&kept.source!==source);
 // V14 review: kept work from a server data package that is not older than this file's data is not "earlier data".
 if(packageNotOlder(pkg,dataAsOf)){
  const otherRelease=kept.release&&release&&kept.release!==release;
  return {text,warning:otherRelease?`This file is another version of the tool. Continuing keeps the data published on the intranet server${pkg.dataAsOf?` (as of ${pkg.dataAsOf})`:''} and your changes. Export the kept work first if you are unsure.`:''};
 }
 return {text,warning:newer?`This file ${kept.release&&release&&kept.release!==release?`is another version of the tool${source?`, with data from ${source}`:''}`:`has data from ${source}`}. Continuing keeps your earlier data and changes; the data in this file may be newer. Export the kept work first if you are unsure.`:''};
}
// The restore question in the page's dialog (index.html #localRestore). Closing it keeps the work.
function chooseInDialog(kept,info){
 const $=id=>document.getElementById(id),dialog=$('localRestore');
 if(!dialog?.showModal)return Promise.resolve('continue');
 const {text,warning}=keptWorkText(kept,info);
 $('localRestoreText').textContent=text;$('localRestoreWarning').textContent=warning;$('localRestoreWarning').hidden=!warning;
 $('localRestoreExport').onclick=()=>{const url=URL.createObjectURL(new Blob([kept.workspace],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='logistics-workspace-kept-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 return new Promise(resolve=>{
  let choice='continue';
  $('localRestoreContinue').onclick=()=>{choice='continue';dialog.close();};
  $('localRestoreFresh').onclick=()=>{choice='fresh';dialog.close();};
  dialog.addEventListener('close',()=>resolve(choice),{once:true});
  dialog.showModal();
 });
}

export function createOfflineAutosave({getData=()=>null,onRestore=()=>{},onStatus,onNotice=showNotice,storage=browserStorage(),release='',choose=chooseInDialog,delay=600}={}){
 let revision=0,exportedRevision=null,keptRevision=0,keepFailed=false,timer=null;
 const exportState=()=>exportedRevision===revision?'exportStarted':revision&&!(storage&&!keepFailed&&keptRevision===revision)?'unsaved':revision?'kept':'clean';
 const message=()=>{const state=exportState();return state==='kept'?LOCAL_SAVE_MESSAGES.kept:OFFLINE_SAVE_MESSAGES[state];};
 const status=()=>onStatus({message:message(),kind:'offline'});
 function keep(){
  timer=null;if(!storage||keptRevision===revision)return;
  const data=getData();if(!data)return;
  try{storage.setItem(LOCAL_SAVE_KEY,JSON.stringify({version:1,release,source:String(data.source||''),savedAt:new Date().toISOString(),workspace:exportWorkspace(data)}));keptRevision=revision;keepFailed=false;}
  catch{keepFailed=true;onNotice(OFFLINE_SAVE_MESSAGES.unsaved);}
  status();
 }
 const flush=()=>{if(timer){clearTimeout(timer);keep();}};
 return {
  load:async()=>{
   const kept=readKeptWork(storage),current=getData();
   if(!kept||(current&&kept.workspace===exportWorkspace(current))){status();return false;}
   const choice=await choose(kept,{release,source:String(current?.source||''),dataAsOf:current?dataAsOf(current)?.date||'':''});
   if(choice==='fresh'){try{storage.removeItem(LOCAL_SAVE_KEY);}catch{}status();return false;}
   onRestore(kept.data);keptRevision=revision;status();onNotice(LOCAL_SAVE_MESSAGES.kept);return true;
  },
  // Any change to the data or to a setting stored in the backup (weights, minimum score) is kept after a short pause
  // and asks for a new export when nothing can be kept.
  schedule:()=>{revision++;if(storage){clearTimeout(timer);timer=setTimeout(keep,delay);}status();if(!storage)onNotice(OFFLINE_SAVE_MESSAGES.unsaved);},
  exportStarted:()=>{flush();exportedRevision=revision;status();onNotice(OFFLINE_SAVE_MESSAGES.exportStarted);},
  exportState,
  flush:async()=>flush(),retry:async()=>status(),resolveRecovery:async()=>false,isSignedIn:()=>false,
  // Leaving warns while a change is not kept in this browser. A started export does not count: the browser does not
  // confirm that the download was saved.
  hasUnsaved:()=>{flush();return revision>0&&!(storage&&!keepFailed&&keptRevision===revision);}
 };
}

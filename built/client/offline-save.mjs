// Save state of the offline edition (scripts/export-offline.mjs uses it in place of the cloud autosave).
// Changes stay in this tab; Export workspace starts a download of the current version, which the browser
// does not confirm as saved. So the messages never say the file was saved, and leaving still warns while
// this tab holds changes, also after an export started.
export const OFFLINE_SAVE_MESSAGES={
 clean:'Offline edition: data is included in this file. No cloud connection.',
 unsaved:'Changes not exported. Export workspace before closing. To restore, reopen this file and use Import data with the exported file.',
 exportStarted:'Export of the current version started. Check the downloaded file. To restore, reopen this file and use Import data with that file.'
};
const showNotice=message=>{const node=globalThis.document?.getElementById?.('sessionStatus');if(node)node.textContent=message;};
export function createOfflineAutosave({onStatus,onNotice=showNotice}){
 let revision=0,exportedRevision=null;
 const exportState=()=>exportedRevision===revision?'exportStarted':revision?'unsaved':'clean';
 const status=()=>onStatus({message:OFFLINE_SAVE_MESSAGES[exportState()],kind:'offline'});
 return {
  load:async()=>{status();return false;},
  // Any change to the data or to a setting stored in the backup (weights, minimum score) asks for a new export.
  schedule:()=>{revision++;status();onNotice(OFFLINE_SAVE_MESSAGES.unsaved);},
  exportStarted:()=>{exportedRevision=revision;status();onNotice(OFFLINE_SAVE_MESSAGES.exportStarted);},
  exportState,
  flush:async()=>{},retry:async()=>status(),resolveRecovery:async()=>false,isSignedIn:()=>false,
  hasUnsaved:()=>revision>0
 };
}

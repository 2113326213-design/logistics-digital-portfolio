// A short notice for plant users when the tool was updated (owner request 2026-10-23: "if we update a new version, let
// them know"). The page itself shows no version number (owner decision 2026-10-23). Each update that changes what plant
// users see gets a new id and its own lines in plain English; one browser never sees the same id twice.
// The updates of 23 October 2026 (V18.1; V19: the LeanIX comparison and the download for the server were removed; V19.1:
// a process counts as matching when it is in the Signavio list or in LeanIX) share one notice, so a browser that skipped
// an earlier one still reads its lines.
// 2 November 2026 (V19.3): the data comes from the LeanIX export of that day, and ETAS process numbers are recognised. The
// 23 October lines stay below them, because the intranet site had not been updated in between.
// Later on 2 November 2026 (V20): the checks before Apply and Upload, and the kept server uploads. New id, same lines below.
// 12 November 2026 (V21): process names the tool cannot read are named and compared with the standard form, with a list
// for the plants; the Import data window uses simpler words. New id, the earlier lines stay below.
export const WHATS_NEW=Object.freeze({
 id:'2026-11-12-3',
 date:'12 November 2026',
 items:Object.freeze([
  'Only application process records starting with BBM PM are kept. Other records, including BBM_SWS, ETAS and M.P2F, are removed from the current data and incoming data. PESS keeps its 12 BBM PM records; Control Tower has no process records left and needs new BBM PM entries.',
  'The data now comes from the LeanIX export of 12 November 2026. Capability codes use two-digit segments. Updates include Control Tower, D-sample tracking, Dolly call off, Material Requistion Digitalization, Davis, PMS, E-Queue, CDP, IDPS, VNA and Scrap Management; several dashboards have more detailed capabilities. DEMOS has a new description, and RBCE Auto Warehouse Management System has a new lifecycle date.',
  'A process name the tool cannot read is now called "Process name not in the standard form". The application details show it part by part next to a standard name, and Overview, Process, lists every such name with what to change in LeanIX. Export for plants (CSV) gives that list to the plants.',
  'The Import data window uses simpler words: "LeanIX file (.xlsx)", "Share with everyone" and "Put back an earlier upload".',
  'Before you apply an import, the tool now names what looks wrong, for example many new or removed applications, applications of another department, or older data. Tick that you checked it, then apply.',
  'Upload to server now protects the shared data. It does not overwrite data that someone else uploaded first, it asks again when many applications would be added or removed, and the server keeps the last five uploads. To put one back: Import data, Share with everyone, Put back an earlier upload.',
  'The data now comes from the LeanIX export of 2 November 2026. 16 applications changed, mostly their business capabilities and processes.',
  'Data checks now list the same items as Issues to review, at every level.',
  'A level with no entry now counts as complete when a deeper level matches the standard. For example, if Level 3 matches, Levels 2, 1 and 0 count as complete.',
  'Import data no longer compares LeanIX process exports. If you choose one, the tool says so and changes nothing.',
  'Share with everyone now has only Upload to server. The download for the server admin is gone.',
  'A process now counts as matching when it is in the Signavio list or in LeanIX. Every process recorded with a level (L0 to L3) is in LeanIX, so only processes without a level are still listed to review. The Similarity check no longer asks to confirm them.'
 ])
});
export const UPDATE_SEEN_KEY='logistics-portfolio:update-seen';
// Everything the tool keeps in a browser starts with this (view settings, kept work, hidden data notices).
const OWN_KEY=/^logistics-portfolio/;

// True when this browser has used the tool before and has not closed this update's notice. A first visit sees no notice:
// the update is remembered as seen. Without usable storage nothing is shown, because closing could not be remembered.
// Call it before the page saves anything, so that a first visit is not taken for a returning one.
export function updateNoticeDue(storage,id=WHATS_NEW.id){
 try{
  if(!storage)return false;
  const seen=storage.getItem(UPDATE_SEEN_KEY);
  if(seen===id)return false;
  let returning=seen!==null;
  for(let i=0;!returning&&i<storage.length;i++)returning=OWN_KEY.test(storage.key(i)||'');
  if(!returning)storage.setItem(UPDATE_SEEN_KEY,id);
  return returning;
 }catch{return false;}
}
export function markUpdateSeen(storage,id=WHATS_NEW.id){try{storage?.setItem(UPDATE_SEEN_KEY,id);return true;}catch{return false;}}
export function updateNoticeHTML(esc,notes=WHATS_NEW){
 return `<span><strong>The tool was updated on ${esc(notes.date)}.</strong><ul>${notes.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></span><button type="button" id="updateNoticeClose">Close</button>`;
}

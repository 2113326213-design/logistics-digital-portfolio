// A short notice for plant users when the tool was updated (owner request 2026-10-23: "if we update a new version, let
// them know"). The page itself shows no version number (owner decision 2026-10-23). Each update that changes what plant
// users see gets a new id and its own lines in plain English; one browser never sees the same id twice.
export const WHATS_NEW=Object.freeze({
 id:'2026-10-23',
 date:'23 October 2026',
 items:Object.freeze([
  'Data checks now list the same items as Issues to review, at every level.',
  'A level with no entry now counts as complete when a deeper level matches the standard. For example, if Level 3 matches, Levels 2, 1 and 0 count as complete.'
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

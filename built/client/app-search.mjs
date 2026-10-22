import {compareNatural} from './codes.mjs';

// Global application search (owner choice 2026-10-22, V13): from any page, type part of an application's name, its ID,
// its plant or its business unit and open its details. Every word typed must appear in one of those fields; the best
// matches come first (name starts with the text, then a word of the name, then the ID, the plant or business unit,
// then anywhere).
const norm=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function searchApplications(apps,query,limit=8){
 const q=norm(query);if(!q)return [];
 const words=q.split(' ');
 const ranked=[];
 for(const app of apps){
  const name=norm(app.Name),id=norm(app.id??app.ID),plant=norm(app.Entity),unit=norm(app.Division),all=[name,id,plant,unit].join(' ');
  if(!words.every(word=>all.includes(word)))continue;
  const rank=name.startsWith(q)?0:name.split(/[\s_\-/()@.]+/).some(part=>part.startsWith(q))?1:id.startsWith(q)?2:plant===q||unit===q?3:name.includes(q)?4:5;
  ranked.push({app,rank});
 }
 return ranked.sort((a,b)=>a.rank-b.rank||compareNatural(a.app.Name,b.app.Name)).slice(0,limit).map(r=>r.app);
}

// The search box under the page title: a combobox with up to eight results. Arrow keys move, Enter opens, Escape
// clears; '/' anywhere outside a field focuses the box.
export function createAppSearch({input,list,getApps,onOpen,escape}){
 let results=[],active=-1;
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
 const mark=()=>{[...list.querySelectorAll('[role=option]')].forEach((node,i)=>node.classList.toggle('active',i===active));if(active>=0)input.setAttribute('aria-activedescendant','appSearchOption'+active);else input.removeAttribute('aria-activedescendant');};
 const open=app=>{input.value='';close();onOpen(app.id);};
 function render(){
  results=searchApplications(getApps(),input.value);active=results.length?0:-1;
  if(!input.value.trim()){close();return;}
  list.innerHTML=results.length?results.map((app,i)=>`<li role="option" id="appSearchOption${i}" data-index="${i}">${escape(app.Name)}<small>${escape([app.Entity,app.Division].filter(Boolean).join(' · '))}</small></li>`).join(''):'<li class="app-search-empty" role="presentation">No application found</li>';
  list.hidden=false;input.setAttribute('aria-expanded','true');mark();
 }
 input.addEventListener('input',render);
 input.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'&&results.length){event.preventDefault();active=(active+1)%results.length;mark();}
  else if(event.key==='ArrowUp'&&results.length){event.preventDefault();active=(active-1+results.length)%results.length;mark();}
  else if(event.key==='Enter'&&results[active]){event.preventDefault();open(results[active]);}
  else if(event.key==='Escape'){input.value='';close();}
 });
 // mousedown, so the choice happens before the box loses focus.
 list.addEventListener('mousedown',event=>{const option=event.target.closest('[role=option]');if(!option)return;event.preventDefault();open(results[Number(option.dataset.index)]);});
 input.addEventListener('blur',()=>setTimeout(close,150));
 document.addEventListener('keydown',event=>{
  if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey)return;
  const target=event.target;if(target?.closest?.('input,textarea,select,[contenteditable="true"],dialog[open]'))return;
  if(document.querySelector('dialog[open]'))return;
  event.preventDefault();input.focus();
 });
 return {render,close};
}

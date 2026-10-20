import {displayCode,displayName} from './display.mjs';
import {english} from './english.mjs';

export function filterLandscape(model,dimension,{query='',division='',entity='',branch=''}={}){
 const q=query.trim().toLowerCase(),map=dimension==='cap'?model.caps:model.procs;
 const apps=model.apps.filter(a=>{
  if(division&&(a.Division||'Not provided')!==division)return false;
  if(entity&&(a.Entity||'Not provided')!==entity)return false;
  if(branch&&!a[dimension+'Leaf'].some(id=>model.ancestor(branch,id)))return false;
  if(!q)return true;
  const assigned=a[dimension],labels=[...map.values()].filter(n=>assigned.includes(n.id)).map(n=>[n.id,n.label,displayCode(n.id),displayName(n)].join(' '));
  return [a.id,a.Name,a.Division,a.Entity,...(dimension==='cap'?a.rawCap:a.rawProcess),...labels].join(' ').toLowerCase().includes(q);
 });
 return {...model,apps};
}

// Opening and closing categories (owner specification 2026-10-20):
// + opens exactly one level, even when that level has a single sub-category; other branches keep their state.
// − closes a category together with every level opened below it. No empty placeholder columns are added.
export function landscapeColumns(model,view,expanded,focus,columns){return columns(model,view,expanded,focus);}
export function openOneLevel(expanded,id){expanded.add(id);return expanded;}
export function closeCategory(expanded,id,ancestor){for(const open of [...expanded])if(ancestor(id,open))expanded.delete(open);return expanded;}
// Expand all opens every category that can open for the current filters, level by level down to the deepest
// recorded level; categories opened earlier stay open.
export function expandAll(model,view,expanded,focus,columns){
 for(;;){const next=columns(model,view,expanded,focus).filter(c=>c.canExpand&&!expanded.has(c.id));if(!next.length)return expanded;for(const c of next)expanded.add(c.id);}
}

// Header rows above the category headings: one row per level of opened categories. Each opened category spans
// the columns it was opened into, so it is clear which sub-categories belong to it, and carries the − that
// closes it. Columns outside an opened category get an empty cell in that row.
export function openedGroupRows(cols){
 const depth=Math.max(0,...cols.map(c=>(c.opened||[]).length)),rows=[];
 for(let level=0;level<depth;level++){
  const row=[];
  for(const c of cols){const id=(c.opened||[])[level]||null,last=row[row.length-1];if(last&&last.id===id)last.span++;else row.push({id,span:1});}
  rows.push(row);
 }
 return rows;
}
export const OPENED_ROW_HEIGHT=44;
export function openedGroupCell(cell,{node,level,escape:esc}){
 const top=`style="top:${level*OPENED_ROW_HEIGHT}px"`;
 if(!cell.id)return `<th class="opened-gap" colspan="${cell.span}" ${top} aria-hidden="true"></th>`;
 const code=displayCode(cell.id),name=node?displayName(node):cell.id;
 return `<th scope="colgroup" colspan="${cell.span}" class="opened-group" ${top}><div class="opened-group-head"><button class="category-step" data-collapse="${esc(cell.id)}" aria-label="${esc(`Collapse ${code} ${name}`)}" title="Collapse">−</button><span class="opened-code">${esc(code)}</span><span class="opened-name" title="${esc(name)}">${esc(name)}</span></div></th>`;
}

// One category heading. A category with sub-categories has a + beside its title that opens one level. The
// column of applications recorded only at an opened category's own level is labelled 'Only at this level'.
export function landscapeHeaderCell(c,{label,subCategories=0,escape:esc,top=0}){
 const code=c.id==='unmapped'?'':displayCode(c.id),plural=subCategories===1?'sub-category':'sub-categories';
 const title=c.direct?'Only at this level':label;
 const step=!c.direct&&c.canExpand?`<button class="category-step" data-expand="${esc(c.id)}" aria-label="${esc(`Expand ${code}: show ${subCategories} ${plural}`)}" title="${esc(`Show ${subCategories} ${plural}`)}">+</button>`:'';
 const tooltip=c.direct?`Applications recorded at ${code} without a more detailed sub-category`:english(c.reference||c.label);
 return `<th scope="col"${top?` style="top:${top}px"`:''}${c.direct?' class="only-level"':''}><div class="category-head" title="${esc(tooltip)}"><span class="category-title-row"><span class="node-title">${esc(title)}</span>${step}</span>${code?`<small class="node-code">${esc(code)}</small>`:''}</div><div class="node-actions"><span class="node-n">${c.apps.length} ${c.apps.length===1?'app':'apps'}</span>${c.apps.length>1?`<button class="column-compare" data-compare-column="${esc(c.key)}" aria-label="Compare ${esc(title)}${c.direct?' '+esc(code):''}">Compare</button>`:''}</div></th>`;
}

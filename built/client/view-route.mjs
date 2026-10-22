const TABS=new Set(['overview','landscape','opportunities','similarity']);

export function tabFromSearch(search){
 const tab=new URLSearchParams(search).get('tab');
 return TABS.has(tab)?tab:'overview';
}

export function searchForTab(search,tab){
 if(!TABS.has(tab))throw Error('Unknown portfolio view');
 const query=new URLSearchParams(search);
 if(tab==='overview')query.delete('tab');else query.set('tab',tab);
 return query.toString();
}

// Direct links to an application (owner request 2026-10-22, V11): ?app=<application ID> opens its details. The address
// bar follows the open application, so it can be copied as well.
export const appFromSearch=search=>String(new URLSearchParams(search).get('app')??'').trim();
export function searchWithApp(search,id){
 const query=new URLSearchParams(search);
 if(id)query.set('app',id);else query.delete('app');
 const text=query.toString();
 return text?'?'+text:'';
}
// The link to share: this page with only ?app=<ID> (it opens on the Overview with the application's details).
export function appLink(href,id){
 const url=new URL(href);url.search='';url.hash='';url.searchParams.set('app',id);
 return url.href;
}

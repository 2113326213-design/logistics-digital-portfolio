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

import {chronologicalEvents,renderHistoryRecords} from './history-view.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const records=document.getElementById('demoHistoryRecords');
try{
 const response=await fetch('./history-demo-data.json');
 if(!response.ok)throw Error('Demo data unavailable');
 const demo=await response.json();
 if(demo.demo!==true)throw Error('Expected demo data');
 const events=chronologicalEvents(demo.events);
 records.innerHTML=renderHistoryRecords(events,{firstImport:events.find(event=>event.kind==='import')},esc);
 records.querySelector('.app-history-guide').textContent='Simulated history only. All values and people are fictional.';
 const labels=['First name change','Description updated','Second name change','Mapping correction'];
 document.getElementById('demoEventLinks').innerHTML=events.map((event,index)=>`<a href="#demo-event-${index+1}"><strong>${esc(new Date(event.at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))}</strong><span>${esc(labels[index])}</span></a>`).join('');
 records.querySelectorAll('.app-event').forEach((element,index)=>{
  element.id=`demo-event-${index+1}`;
  const previous=index?`<a href="#demo-event-${index}">← Previous event</a>`:'<span></span>';
  const next=index+1<events.length?`<a href="#demo-event-${index+2}">Next event →</a>`:'<a href="#demoEventLinks">Back to dates ↑</a>';
  element.insertAdjacentHTML('afterbegin',`<div class="history-demo-jump">${previous}<span>DEMO · ${index+1} / ${events.length}</span>${next}</div>`);
 });
 document.getElementById('demoEventLinks').addEventListener('click',()=>{document.getElementById('demoHistory').open=true;});
 const exportButton=document.getElementById('exportAppHistory');
 exportButton.textContent='Export demo CSV';
 exportButton.addEventListener('click',()=>{
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const rows=[['Data type','Application','Event time','Field','Before','After','Recorded by']];
  for(const event of events){
   // A mapping correction adds a standard mapping; the source entry itself stays unchanged.
   const changes=event.details||[{field:'Standard mapping',before:'Not mapped',after:`${event.mapping.raw} → ${event.mapping.targetId} ${event.mapping.targetName}`}];
   for(const change of changes)rows.push(['DEMO - FICTIONAL',demo.app.Name,event.at,change.field,change.before,change.after,event.actor]);
  }
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='DEMO_History_Before_After.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
}catch{
 records.textContent='Demo data could not be loaded. Refresh to try again.';
}

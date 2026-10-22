// Which data the page shows and how recent it is (owner request 2026-10-22, V12), shown under the page title and updated
// whenever the data changes (an import, a restored backup, kept work). The date is the one in the inventory file name
// (YYYYMMDD, as in 20261021_logistic_inventory.xlsx and LeanIX exports); without one, the LeanIX export time, then the
// date of the latest import.
const isoDate=(y,m,d)=>{const date=new Date(Date.UTC(+y,+m-1,+d));return date.getUTCFullYear()===+y&&date.getUTCMonth()===+m-1&&date.getUTCDate()===+d?`${y}-${m}-${d}`:'';};
export function dataAsOf(data){
 const file=String(data?.source??'').trim();
 if(!file||file==='Imported workspace')return {file:'',date:'',basis:''};
 const named=file.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})(?![0-9])/),fromName=named?isoDate(named[1],named[2],named[3]):'';
 if(fromName)return {file,date:fromName,basis:'file'};
 const exported=String(data?.inventoryExport?.exportedAt??'').match(/(20\d{2})-(\d{2})-(\d{2})/),fromExport=exported?isoDate(exported[1],exported[2],exported[3]):'';
 if(fromExport)return {file,date:fromExport,basis:'export'};
 const imports=(Array.isArray(data?.importHistory)?data.importHistory:[]).filter(e=>e&&e.kind!=='taxonomy'&&/^\d{4}-\d{2}-\d{2}/.test(String(e.at??'')));
 const last=imports.at(-1);
 return {file,date:last?String(last.at).slice(0,10):'',basis:last?'import':''};
}
export function dataAsOfText(data){
 const {file,date,basis}=dataAsOf(data);
 if(!file)return '';
 return `Data: ${file}${date?basis==='import'?` · imported ${date}`:` · as of ${date}`:''}`;
}

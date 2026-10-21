import {cleanAnnualBenefit} from './annual-benefit.mjs';
// Read standard XLSX locally using browser ZIP decompression and XML parsing.
// No workbook content is sent to a server.
import {roiScoresFromSheets} from './roi.mjs';
import {operationCostScoresFromSheets} from './costs.mjs';
import {capCode} from './codes.mjs';
export async function readXlsx(file){
 if(file.size>30*1024*1024)throw Error('文件超过 30 MB，请导出所需工作表后重试。');
 const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer),decoder=new TextDecoder();let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break;}
 if(end<0)throw Error('无法读取此文件，请使用未加密的 .xlsx 文件。');
 const count=v.getUint16(end+10,true);let p=v.getUint32(end+16,true),total=0;const entries=new Map();
 for(let i=0;i<count;i++){if(v.getUint32(p,true)!==0x02014b50)throw Error('Excel 压缩目录不完整。');const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),uncompressed=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);total+=uncompressed;if(total>120*1024*1024)throw Error('解压后的文件过大，请仅保留必要工作表。');entries.set(decoder.decode(bytes.slice(p+46,p+46+nl)),{flags,method,size,offset});p+=46+nl+el+cl;}
 // Part names in a package are case-insensitive.
 async function xml(path,optional=false){const e=entries.get(path)??[...entries].find(([name])=>name.toLowerCase()===path.toLowerCase())?.[1];if(!e){if(optional)return null;throw Error('Excel 中缺少 '+path);}if(e.flags&1)throw Error('不支持加密 Excel。');const o=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true),chunk=bytes.slice(o,o+e.size);let content;if(e.method===0)content=chunk;else if(e.method===8){if(typeof DecompressionStream==='undefined')throw Error('请用新版 Chrome 或 Edge 打开此网页以导入 Excel。');const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));content=new Uint8Array(await new Response(stream).arrayBuffer());}else throw Error('不支持此 Excel 压缩格式。');const bom=content[0]===0xFF&&content[1]===0xFE?'utf-16le':content[0]===0xFE&&content[1]===0xFF?'utf-16be':'';const encoding=bom||String.fromCharCode(...content.subarray(0,200)).match(/^(?:\xEF\xBB\xBF)?\s*<\?xml[^>]*?\bencoding\s*=\s*["']([^"']+)["']/)?.[1]||'utf-8';let source;try{source=new TextDecoder(encoding,{fatal:true}).decode(content);}catch{throw Error(`Cannot read ${path} in the Excel file as ${encoding} text.`);}const doc=new DOMParser().parseFromString(source,'application/xml');const error=doc.getElementsByTagName('parsererror')[0];if(error){const detail=String(error.textContent||'').match(/(?:error )?on line \d+[^\n]*|line \d+[^\n]*/i)?.[0].trim().replace(/\.+$/,'').slice(0,200);throw Error(`Invalid XML in the Excel file (${path}${detail?': '+detail:''}).`);}return doc;}
 const tags=(el,name)=>[...el.getElementsByTagNameNS('*',name)];
 // Phonetic guide runs (<rPh>) are reading aids, not part of the cell text.
 const text=el=>tags(el,'t').filter(t=>t.parentNode?.localName!=='rPh').map(t=>t.textContent).join('');
 const wb=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels'),relationships=new Map(tags(rels,'Relationship').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')]));const result={};
 const partPath=target=>target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
 // The shared-strings part is found through the workbook relationships, whatever its name, with the usual name as a fallback.
 const sharedTarget=tags(rels,'Relationship').find(e=>/\/sharedStrings$/.test(e.getAttribute('Type')||''))?.getAttribute('Target');
 const ss=(sharedTarget&&await xml(partPath(sharedTarget),true))||await xml('xl/sharedStrings.xml',true),strings=ss?tags(ss,'si').map(text):[];
 // An empty <v> is a blank cell; an index outside the shared-string table means a damaged file, not a value.
 const shared=(value,sheet,ref)=>{const index=String(value??'').trim();if(!index)return '';if(!/^\d+$/.test(index)||Number(index)>=strings.length)throw Error(`Worksheet '${sheet}' cell ${ref} refers to shared string "${value}", which does not exist (${ss?`${strings.length} shared strings`:'the workbook has no shared-strings table'}). The workbook is damaged; open and save it again in Excel.`);return strings[Number(index)];};
 const columnName=number=>{let name='';for(let n=number;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
 Object.defineProperty(result,'date1904',{value:['1','true'].includes(tags(wb,'workbookPr')[0]?.getAttribute('date1904'))});
 for(const sheet of tags(wb,'sheet')){const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id');const target=relationships.get(rid);if(!target)continue;const doc=await xml(partPath(target));const rows=[];let rowIndex=-1;for(const row of tags(doc,'row')){const out=[];let col=0;const rowRef=Number(row.getAttribute('r'));rowIndex=Number.isInteger(rowRef)&&rowRef>0?rowRef-1:rowIndex+1;for(const cell of tags(row,'c')){const letters=cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];if(letters){col=0;for(const char of letters)col=col*26+char.charCodeAt(0)-64;}else col++;const type=cell.getAttribute('t'),value=tags(cell,'v')[0]?.textContent;out[col-1]=type==='s'?shared(value,sheet.getAttribute('name'),cell.getAttribute('r')||columnName(col)+(rowIndex+1)):type==='inlineStr'?text(cell):type==='b'?(value==='1'?'TRUE':value==='0'?'FALSE':(value??'')):(value??'');}rows[rowIndex]=Array.from(out,x=>x??'');}result[sheet.getAttribute('name')]=rows;}
 return result;
}
export function inventoryFromSheets(sheets){
 const entry=sheets['Logistic Apps']?['Logistic Apps',sheets['Logistic Apps']]:Object.entries(sheets).filter(([name])=>!/^readme$/i.test(name)).find(([,rows])=>Array.isArray(rows)&&rows.some(r=>r?.includes('ID')&&r?.includes('Name')));
 const rows=entry?.[1];
 if(!rows)throw Error('未找到应用清单工作表。');
 const h=rows.findIndex(r=>r?.includes('ID')&&r?.includes('Name')),headers=rows[h];
 // A LeanIX application export (first received 2026-10-20): display names in row 1, a Type column, no Division /
 // Entity columns and no cost sheet. The fields it lacks are kept by ID (mergeInventoryEvidence); applications it
 // does not list are kept and recorded (applyInventory), because such an export can be a filtered view.
 const leanix=!headers.includes('Division')&&!headers.includes('Entity')&&headers.includes('Type')&&headers.includes('Display Name');
 for(const key of (leanix?['ID','Name','Business Capabilities','Processes']:['ID','Name','Division','Entity','Business Capabilities','Processes']))if(!headers.includes(key))throw Error('应用清单缺少列：'+key);
 // Optional columns absent from the sheet are left out, so existing values are kept by ID.
 const keys=['ID','Division','Entity','Name','Description','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active'].filter(k=>headers.includes(k));
 if(headers.includes('Main Business Capability'))keys.push('Main Business Capability');
 const hasScopeColumn=rows===sheets['Logistic Apps']&&!String(headers[2]??'').trim();
 // The owner workbook of 2026-10-21 names the scope column 'with score or not' and adds 'Status in Oct'. Both are found
 // by header (the month in the status header may change). Owner decision 2026-10-21: an application whose status is not
 // "still active" is not counted, like one without a score (scope.mjs).
 const sheetName=String(entry[0]),cell=index=>(index>=26?String.fromCharCode(64+Math.floor(index/26)):'')+String.fromCharCode(65+index%26);
 const scopeColumn=hasScopeColumn?-1:headers.findIndex(x=>/^with score or not$/i.test(String(x??'').trim()));
 const statusColumn=headers.findIndex(x=>/^status in \S+$/i.test(String(x??'').trim()));
 const apps=rows.flatMap((r,index)=>{
  if(index<=h||!r||!r.some(x=>String(x??'').trim()))return [];
  if(leanix&&String(r[headers.indexOf('Type')]??'').trim()&&String(r[headers.indexOf('Type')]).trim()!=='Application')return [];
  const app=Object.fromEntries(keys.map(k=>[k,k==='Lifecycle: Active'?excelDate(r[headers.indexOf(k)],sheets.date1904):r[headers.indexOf(k)]??'']));
  if(headers.includes('Annual benefit (CNY/year)')){try{app.annualBenefitCNY=cleanAnnualBenefit(r[headers.indexOf('Annual benefit (CNY/year)')]);}catch(error){throw Error(`Row ${index+1}, application ID ${String(r[headers.indexOf('ID')]??'').trim()||'not provided'}: ${error.message}`);}app.annualBenefitSource=`Inventory · Annual benefit (CNY/year) · row ${index+1}`;}
  if(hasScopeColumn){app.scopeNote=String(r[2]??'').trim();app.scopeSource=`Logistic Apps!C${index+1}`;}
  if(scopeColumn>=0){app.scopeNote=String(r[scopeColumn]??'').trim();app.scopeSource=`${sheetName}!${cell(scopeColumn)}${index+1}`;}
  if(statusColumn>=0){app.statusNote=String(r[statusColumn]??'').trim();app.statusSource=`${sheetName}!${cell(statusColumn)}${index+1} (${String(headers[statusColumn]).trim()})`;}
  return [app];
 });
 if(!apps.length)throw Error('应用清单没有数据。');
 if(leanix){const readme=Object.entries(sheets).find(([name])=>/^readme$/i.test(name))?.[1];const exportedAt=(Array.isArray(readme)?readme.flat():[]).map(v=>String(v??'')).map(s=>s.match(/created at:\s*(.+?)\s*$/i)?.[1]).find(Boolean)||'';apps.leanixExport={exportedAt,sheet:String(entry[0])};}
 if(!Object.hasOwn(sheets,'Parameter Score'))return apps;
 const costs=operationCostScoresFromSheets(sheets),roi=roiScoresFromSheets(sheets);
 const scored=apps.map(app=>{const cost=costs.get(String(app.ID).trim());return {...app,...(roi?{roiScore:roi.get(String(app.ID).trim())?.score??null,roiSource:roi.get(String(app.ID).trim())?.source||''}:{}),operationCostScore:cost?.score??null,operationCostSource:cost?.source||''};});
 if(apps.leanixExport)scored.leanixExport=apps.leanixExport;
 return scored;
}
// Date-time serials carry the time as a fraction; only the calendar date is stored. Text is kept as recorded
// unless it is exactly an ISO date or date-time, so a date followed by a note is never cut short.
export function excelDate(value,date1904=false){const text=String(value??'').trim();if(!text)return '';if(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text))return text.slice(0,10);const serial=Number(text);if(!Number.isFinite(serial)||serial<10000||serial>100000)return text;const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);return new Date(epoch+Math.floor(serial)*86400000).toISOString().slice(0,10);}
// A 'Standard Name' sheet (the business capability standard) supplies the capability list instead of
// 'Business Capability'. A workbook with only that sheet updates the capabilities and returns no
// processRows, so the current process taxonomy is kept.
export function taxonomyFromSheets(sheets){const standard=sheets['Standard Name'],caps=sheets['Business Capability'],proc=sheets['Data_RBW Process Structure'];if(standard&&!proc)return {capabilityRows:capabilityRowsFromStandard(standard)};if(!(caps||standard)||!proc)throw Error('Taxonomy must contain the Business Capability (or Standard Name) and Data_RBW Process Structure worksheets. A capability standard workbook may contain only a Standard Name worksheet.');const h=proc.findIndex(r=>r?.includes('Process ID'));if(h<0)throw Error('未找到 Process ID 表头。');const keys=['RBW E2E Process Chain','Process Level','Process ID','Process Name'];for(const k of keys)if(!proc[h].includes(k))throw Error('层级表缺少 '+k);return {capabilityRows:standard?capabilityRowsFromStandard(standard):caps.slice(1).filter(r=>r?.some(x=>String(x??'').trim())).map(r=>Array.from({length:3},(_,i)=>r[i]??'')).filter(r=>!r.some(x=>OTHER_DEPARTMENT_CODE.test(String(x??'').trim()))),processRows:proc.slice(h+1).filter(r=>r?.[proc[h].indexOf('Process ID')]).map(r=>keys.map(k=>r[proc[h].indexOf(k)]))};}
// The capability standard ('Standard Name': Level 1–3 Code and Name columns, found by header) as taxonomy
// rows: one row per entry, [Level 1, Level 2, Level 3] written as "CODE Name", blank levels null.
// Names are kept as recorded (trimmed). One code with two different names stops the import; the same code
// written two ways (B.06.2.01 / B.06.2.1) with the same name keeps the first spelling.
// Owner decision 2026-10-19: HC capabilities belong to another department, so an entry with an HC code is
// not taken into the catalogue (applications' own HC records are kept and stay outside B.06).
export const OTHER_DEPARTMENT_CODE=/^HC\./;
export function capabilityRowsFromStandard(rows){
 // Header cells match without regard to surrounding spaces or capitals ('level 1 code ').
 const key=value=>String(value??'').trim().toLowerCase(),column=(row,name)=>row.findIndex(cell=>key(cell)===name.toLowerCase());
 const header=rows.findIndex(row=>row&&column(row,'Level 1 Code')>=0);
 if(header<0)throw Error("'Standard Name' has no header row with a 'Level 1 Code' column.");
 const names=[1,2,3].flatMap(level=>[`Level ${level} Code`,`Level ${level} Name`]),missing=names.filter(name=>column(rows[header],name)<0);
 if(missing.length)throw Error(`'Standard Name' is missing the column${missing.length>1?'s':''} ${missing.map(name=>`'${name}'`).join(', ')}.`);
 const columns=[1,2,3].map(level=>[column(rows[header],`Level ${level} Code`),column(rows[header],`Level ${level} Name`)]),seen=new Map(),result=[];
 rows.forEach((row,index)=>{
  // Only the six Level cells count: a row with just a remark elsewhere is not an entry.
  if(index<=header||!columns.flat().some(position=>String(row?.[position]??'').trim()))return;
  if(columns.some(([codeColumn])=>OTHER_DEPARTMENT_CODE.test(String(row[codeColumn]??'').trim())))return;
  result.push(columns.map(([codeColumn,nameColumn],level)=>{
   const code=String(row[codeColumn]??'').trim(),name=String(row[nameColumn]??'').trim();
   if(!code&&!name)return null;
   if(!/^[A-Z]+\.\d+(?:\.\d+)*$/.test(code))throw Error(`'Standard Name' row ${index+1}, Level ${level+1}: "${code}" is not a capability code.`);
   if(!name)throw Error(`'Standard Name' row ${index+1}, Level ${level+1}: code ${code} has no name.`);
   const id=capCode(code),first=seen.get(id);
   if(first&&first.name!==name)throw Error(`'Standard Name' rows ${first.row} and ${index+1} give ${id} two different names: "${first.name}" and "${name}".`);
   if(!first)seen.set(id,{name,label:`${code} ${name}`,row:index+1});
   return (first||seen.get(id)).label;
  }));
 });
 if(!result.length)throw Error("'Standard Name' has no capability rows.");
 return result;
}
// taxonomySource names both workbooks when the capability list comes from another file than the processes.
export const taxonomySourceName=(processSource,capabilitySource)=>capabilitySource&&capabilitySource!==processSource?`${capabilitySource} (capabilities); ${processSource} (processes)`:processSource;
export const processTaxonomySource=source=>String(source??'').match(/^.*? \(capabilities\); (.+) \(processes\)$/)?.[1]??String(source??'');

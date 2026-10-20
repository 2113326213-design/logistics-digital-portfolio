import {capCode,split} from './codes.mjs';

// These seven exact old source labels were flagged in the supplied B.06 v3
// comparison. Its business sign-off columns are blank, so AI suggestions are
// context only and never become an applied mapping here.
export const SEMANTIC_CASES=[
 {code:'B.06.2.10',sourceName:'Customer Order Planning',standardName:'Order Planning Simulation',suggestedCode:'B.06.2'},
 {code:'B.06.4',sourceName:'Inventory Management',standardName:'Storage Management',suggestedCode:'B.06.4'},
 {code:'B.06.4.1',sourceName:'Commercial Inventory Management',standardName:'Stock Putaway Management',suggestedCode:null},
 {code:'B.06.4.2',sourceName:'Physical Inventory',standardName:'Stock Removal/Picking Management',suggestedCode:'B.06.4.4'},
 {code:'B.06.5.2',sourceName:'Material Flow and Storage Management',standardName:'Goods Replenishment Management',suggestedCode:'B.06.4'},
 {code:'B.06.5.3',sourceName:'Production Logistics',standardName:'Goods Issue Management',suggestedCode:'B.06.5.2'},
 {code:'B.06.7.1',sourceName:'Complaint Management Supplier / LSP / Internal',standardName:'Supply Chain……Traceability Management',suggestedCode:'B.06.7.4'}
];

const casesByCode=new Map(SEMANTIC_CASES.map(item=>[item.code,item]));
const label=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase();

export function semanticConcerns(app,correctionLog=[],caps=null){
 const appId=String(app?.id??app?.ID??'').trim();
 const rawCap=Array.isArray(app?.rawCap)?app.rawCap:split(app?.['Business Capabilities']);
 const applied=new Set(correctionLog.filter(c=>c.state==='Applied'&&c.dimension==='cap'&&c.appId===appId).map(c=>c.raw));
 return rawCap.flatMap(raw=>{
  const code=capCode(raw),item=casesByCode.get(code);
  if(!item||applied.has(raw))return [];
  const sourceName=raw.replace(/^\S+\s*/,'').trim();
  if(label(sourceName)!==label(item.sourceName))return [];
  // On imported taxonomies the current reference, if present, owns the name.
  // A missing reference is handled by the existing missing-code review.
  const reference=caps?caps.get(code)?.reference:null;
  if(caps&&!reference)return [];
  const standardName=reference?reference.replace(/^\S+\s*/,'').trim():item.standardName;
  if(label(sourceName)===label(standardName))return [];
  return [{appId,code,raw,sourceName,standardName,status:'pending',decision:null,suggestedCode:item.suggestedCode,source:'B06_能力编码对照_清单vs能力表_v3.xlsx · 名称对照'}];
 });
}

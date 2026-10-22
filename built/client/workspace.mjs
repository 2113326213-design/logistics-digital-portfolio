import {cleanAnnualBenefit} from './annual-benefit.mjs';
import {cleanROIScore} from './roi.mjs';
import {cleanWeights,DEFAULT_WEIGHTS} from './weighted.mjs';
import {cleanPairReviews} from './similarity-guide.mjs';
import {weightPercentages} from './weight-controls.mjs';
import {thresholdField} from './score-settings.mjs';
import {cleanCostScore} from './costs.mjs';
import {cleanCorrections,recordKey,verifyCorrection} from './corrections.mjs';
import {cleanReviews,cleanReviewHistory} from './reviews.mjs';
import {cleanApplicationEvents,cleanImportHistory} from './application-history.mjs';
import {cleanAcceptedRecords} from './accepted-records.mjs';
// Shareable files contain selected application fields, taxonomy and review notes.
const fields=['ID','Name','Division','Entity','Description','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active'];
const mainCapabilityField='Main Business Capability';
const manufacturingAppId='a103918e-63a2-4b26-ae5b-a5b1b7af8fd1';
const manufacturingSource='BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Receive to Store L1;Manufacturing';
const manufacturingDecision=manufacturingSource.replace(/;Manufacturing$/,'');
const needsManufacturingRemoval=app=>String(app?.ID||'').trim()===manufacturingAppId&&String(app?.Processes||'')===manufacturingSource;
// workspaceData applies the owner-approved removal above; imports report it with the original source text.
export function ownerDecisions(data){
 return (Array.isArray(data?.apps)?data.apps:[]).filter(needsManufacturingRemoval).map(app=>({appId:manufacturingAppId,field:'Processes',before:manufacturingSource,after:manufacturingDecision,note:`Owner decision applied: removed 'Manufacturing' from ${String(app.Name??'').trim()||manufacturingAppId} processes`}));
}
function workspaceWeights(data){
 const weights=cleanWeights(data.similarityWeights),legacy={name:.1,description:.4,cap:.4,process:.1};
 if(data.similarityWeightsVersion!==2&&Object.keys(legacy).every(key=>weights[key]===legacy[key]))return {...DEFAULT_WEIGHTS};
 // The weight fields show 0.1% steps; a saved or imported weight is used exactly as shown, so a field shown as 0%
 // never counts as weighted (for example in the zero-text gate).
 const shown=weightPercentages(weights);
 return Object.fromEntries(Object.keys(weights).map(key=>[key,shown[key]/100]));
}
// The latest LeanIX application export, when it did not list every application: those applications are kept
// with their last known records (applyInventory) and the profile says so.
// The data package a workspace was last updated from (V14, data-package.mjs): its id, publish time, data date and the
// ids of the mappings it carried (so that the next package can withdraw them).
function dataPackageField(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!/^[0-9a-f]{16}$/.test(String(value.id??'')))return {};
 const mappingIds=[...new Set((Array.isArray(value.mappingIds)?value.mappingIds:[]).map(v=>String(v??'').trim()).filter(Boolean))];
 return {dataPackage:{id:String(value.id),publishedAt:String(value.publishedAt??''),dataAsOf:String(value.dataAsOf??''),mappingIds}};
}
function inventoryExportField(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const missingIds=[...new Set((Array.isArray(value.missingIds)?value.missingIds:[]).map(v=>String(v??'').trim()).filter(Boolean))];
 return {inventoryExport:{file:String(value.file??''),exportedAt:String(value.exportedAt??''),sheet:String(value.sheet??''),missingIds}};
}
export function workspaceData(data){
 if(!data||!Array.isArray(data.apps)||!data.apps.length||!Array.isArray(data.capabilityRows)||!Array.isArray(data.processRows))throw Error('工作区缺少应用清单或分类表');
 if(!data.apps.every(a=>a&&typeof a==='object'&&!Array.isArray(a))||!data.capabilityRows.every(Array.isArray)||!data.processRows.every(Array.isArray))throw Error('工作区数据结构无效');
 return {similarityWeights:workspaceWeights(data),similarityWeightsVersion:2,...thresholdField(data),source:String(data.source||'Imported workspace'),taxonomySource:String(data.taxonomySource||'Workspace taxonomy'),...inventoryExportField(data.inventoryExport),...dataPackageField(data.dataPackage),isAcceptanceSample:data.isAcceptanceSample===true,apps:data.apps.map(a=>{const app=Object.fromEntries(fields.map(k=>[k,String(a[k]??'')]));if(Object.hasOwn(a,mainCapabilityField))app[mainCapabilityField]=String(a[mainCapabilityField]??'');if(Object.hasOwn(a,'scopeNote')){app.scopeNote=String(a.scopeNote??'');app.scopeSource=String(a.scopeSource??'');}if(Object.hasOwn(a,'statusNote')){app.statusNote=String(a.statusNote??'');app.statusSource=String(a.statusSource??'');}if(Object.hasOwn(a,'operationCostScore')){app.operationCostScore=cleanCostScore(a.operationCostScore);app.operationCostSource=String(a.operationCostSource||'');}if(Object.hasOwn(a,'roiScore')){app.roiScore=cleanROIScore(a.roiScore);app.roiSource=String(a.roiSource||'');}if(Object.hasOwn(a,'annualBenefitCNY')){app.annualBenefitCNY=cleanAnnualBenefit(a.annualBenefitCNY);app.annualBenefitSource=String(a.annualBenefitSource||'');}if(needsManufacturingRemoval(app))app.Processes=manufacturingDecision;return app;}),capabilityRows:data.capabilityRows.map(r=>r.map(v=>String(v??''))),processRows:data.processRows.map(r=>r.map(v=>String(v??''))),reviews:cleanReviews(data.reviews),reviewHistory:cleanReviewHistory(data.reviewHistory),pairReviews:cleanPairReviews(data.pairReviews),applicationEvents:cleanApplicationEvents(data.applicationEvents),importHistory:cleanImportHistory(data.importHistory),corrections:cleanCorrections(data.corrections),acceptedRecords:cleanAcceptedRecords(data.acceptedRecords)};
}
// Carry reviewed mappings from a newer bundled dataset into an older saved
// workspace only when the exact source row and taxonomy snapshots still match.
// Existing mappings (including revoked ones) always remain the user's choice.
export function mergeBundledCorrections(saved,bundled){
 let next=workspaceData(saved),changed=saved.apps?.some(needsManufacturingRemoval)||false;
 if(next.source===bundled?.source&&!next.isAcceptanceSample){
  const bundledApps=new Map(bundled.apps.map(a=>[String(a.ID).trim(),a]));
  for(const app of next.apps){const original=bundledApps.get(app.ID.trim());if(!app['Lifecycle: Active']&&original?.['Lifecycle: Active']&&fields.slice(0,-1).every(k=>app[k]===String(original[k]??''))){app['Lifecycle: Active']=String(original['Lifecycle: Active']);changed=true;}}
  for(const app of next.apps){
   const original=bundledApps.get(app.ID.trim());
   if(!original||!fields.every(key=>app[key]===String(original[key]??'')))continue;
   if(!Object.hasOwn(app,'roiScore')&&Object.hasOwn(original,'roiScore')){app.roiScore=cleanROIScore(original.roiScore);app.roiSource=String(original.roiSource||'');changed=true;}
   if(!Object.hasOwn(app,mainCapabilityField)&&Object.hasOwn(original,mainCapabilityField)){app[mainCapabilityField]=String(original[mainCapabilityField]??'');changed=true;}
   if(!Object.hasOwn(app,'scopeNote')&&Object.hasOwn(original,'scopeNote')){app.scopeNote=String(original.scopeNote??'');app.scopeSource=String(original.scopeSource??'');changed=true;}
   if(!Object.hasOwn(app,'statusNote')&&Object.hasOwn(original,'statusNote')){app.statusNote=String(original.statusNote??'');app.statusSource=String(original.statusSource??'');changed=true;}
   if(!Object.hasOwn(app,'operationCostScore')&&Object.hasOwn(original,'operationCostScore')){app.operationCostScore=cleanCostScore(original.operationCostScore);app.operationCostSource=String(original.operationCostSource||'');changed=true;}
  }
 }
 // Owner confirmations of records as recorded (V9.18) come into an older saved workspace of the same data source.
 if(next.source===bundled?.source&&!next.isAcceptanceSample&&!next.acceptedRecords.length&&cleanAcceptedRecords(bundled?.acceptedRecords).length){next={...next,acceptedRecords:cleanAcceptedRecords(bundled.acceptedRecords)};changed=true;}
 const existing=new Set(next.corrections.map(recordKey));
 for(const correction of cleanCorrections(bundled?.corrections)){
  const key=recordKey(correction);if(existing.has(key))continue;
  try{verifyCorrection(next,correction);}catch{continue;}
  next={...next,corrections:[...next.corrections,correction]};existing.add(key);changed=true;
 }
 return {data:next,changed};
}
// Version 6 (2026-10-16) adds compact import-history events; older editions reject it instead of silently dropping their fields.
export function exportWorkspace(data){return JSON.stringify({format:'logistics-portfolio-workspace',version:6,data:workspaceData(data)},null,2);}
export function importWorkspace(text){
 let document;try{document=JSON.parse(text);}catch{throw Error('工作区 JSON 内容无法读取');}
 if(document?.format!=='logistics-portfolio-workspace'||![1,2,3,4,5,6].includes(document.version))throw Error('请选择本程序导出的工作区 JSON 文件');
 return workspaceData(document.data);
}
export function acceptanceSample(data){
 const labels=new Map(data.capabilityRows.flat().filter(Boolean).map(s=>[String(s).match(/^\S+/)?.[0],String(s)]));
 const codes=['B.06','B.06.1','B.06.1.2','B.06.1.3','B.06.1.4'];
 if(codes.some(c=>!labels.has(c)))throw Error('当前分类表没有 A/B 样例所需的 B.06.1.2、.3、.4，请先使用原始分类表');
 const app=(suffix,division,unique)=>({ID:'acceptance-application-'+suffix,Name:'[TEST] Application '+suffix,Division:division,Entity:'TEST_'+suffix,Description:'Demo data: both applications cover B.06.1.2, with two most-specific records each.','Business Capabilities':['B.06','B.06.1','B.06.1.2',unique].map(c=>labels.get(c)).join(';'),Processes:''});
 return {...data,source:'A/B demo · 2 sample applications',isAcceptanceSample:true,reviews:{},reviewHistory:[],applicationEvents:[],importHistory:[],corrections:[],apps:[app('A','PS','B.06.1.3'),app('B','EM','B.06.1.4')]};
}

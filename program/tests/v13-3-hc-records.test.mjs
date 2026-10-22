// V13.3 (owner, 2026-10-22: "HC的开头的都不需要了，那个是其他公司的"): records whose code starts with HC belong to another
// company. On 2026-10-19 the HC entries had already been left out of the catalogue; now the applications' own HC records are
// left out of the analysis too — no category, landscape column, search match, review item, data check or comparison — while
// the source fields keep them as recorded and Source records names them as not used. An owner mapping on one still counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OTHER_COMPANY_CODE,otherCompanyRecord} from '../public/codes.mjs';
import {OTHER_DEPARTMENT_CODE} from '../public/xlsx.mjs';
import {workspaceData} from '../public/workspace.mjs';
import {buildModel,columns} from '../public/model.mjs';
import {filterLandscape,categoryOptions} from '../public/landscape.mjs';
import {reviewItems} from '../public/reviews.mjs';
import {dataChecksForApp} from '../public/data-checks.mjs';
import {maintenanceReport} from '../public/overview.mjs';
import {renderSourceRecords} from '../public/source-records.mjs';
import {createCorrection} from '../public/corrections.mjs';

const data=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const WUJ='HC.02.04.05 Transportation Management';
const wujOf=model=>model.apps.find(a=>a.Name.startsWith('Wuj HK AGV'));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('one rule for the catalogue and the records: a code that starts with "HC."',()=>{
 assert.equal(OTHER_DEPARTMENT_CODE,OTHER_COMPANY_CODE,'the catalogue import uses the same rule');
 for(const raw of [WUJ,'  HC.06.01.01 Demand Planning','HC.06'])assert.equal(otherCompanyRecord(raw),true,raw);
 for(const raw of ['B.06.5 Material Flow Orchestration','XHC.06.01 Other','HCX.06 Other','HC06 Other','hc.06 lower case','',null])assert.equal(otherCompanyRecord(raw),false,String(raw));
});

test('Wuj HK AGV: the HC record stays in the source field and is left out of every analysis',()=>{
 const model=buildModel(data),wuj=wujOf(model);
 assert(wuj['Business Capabilities'].includes(WUJ),'the source field is unchanged');
 assert.equal(data.apps.find(a=>a.Name.startsWith('Wuj HK AGV'))['Business Capabilities'],'B.06.5 Material Flow Orchestration;'+WUJ);
 assert.deepEqual([wuj.rawCap,wuj.otherCompany,wuj.cap,wuj.capLeaf],[['B.06.5 Material Flow Orchestration'],[WUJ],['B.06.5'],['B.06.5']]);
 assert.deepEqual([...model.caps.keys()].filter(id=>id.startsWith('HC')),[],'no HC category');
 // The landscape lost its HC.02 column (13 → 12 columns) and its category list never had HC.
 const capColumns=columns(model,'cap',new Set(),'').map(c=>c.id);
 assert(!capColumns.some(id=>id.startsWith('HC')));assert.equal(capColumns.length,12);
 assert(!JSON.stringify(categoryOptions(model,'cap')).includes('HC.'));
 assert.deepEqual(filterLandscape(model,'cap',{query:'HC.02'}).apps,[],'the landscape search no longer finds it by the HC record');
 // No review item, no data check row for it; the application keeps its genuine gap (B.06.5 is Level 2: no Level 3).
 assert(!reviewItems(model).some(item=>String(item.code||'').startsWith('HC')||String(item.raw||'').includes('HC.')));
 assert(!model.issues.some(issue=>String(issue.value).startsWith('HC.')));
 const checks=dataChecksForApp(model,wuj).checks;
 assert.deepEqual(checks.filter(row=>row.raw.startsWith('HC.')),[]);
 assert(checks.some(row=>row.dimension==='cap'&&row.primary==='Business Capability: Level 3 missing'));
 assert(![...maintenanceReport(model,{},'cap').records.get(wuj.id)].some(record=>String(record.raw).startsWith('HC.')));
 // Source records shows the field as recorded and names what is not used.
 const html=renderSourceRecords(wuj,esc);
 assert(html.includes(`<span class="app-source-value">${esc(WUJ)}</span>`),'listed as recorded');
 assert(html.includes(`Not used: ${esc(WUJ)} (HC entries belong to another company).`));
});

test('the same holds for processes and the Main Business Capability field, and only for HC records',()=>{
 const changed={...data,apps:data.apps.map(app=>app.Name.startsWith('Wuj HK AGV')?{...app,Processes:'HC.01.02 Other company process L3;'+app.Processes,'Main Business Capability':'HC.02 Other company'}:app)};
 const model=buildModel(changed),wuj=wujOf(model),before=wujOf(buildModel(data));
 assert.deepEqual(wuj.rawProcess,before.rawProcess,'the HC process record is left out');
 assert.deepEqual(wuj.otherCompany,[WUJ,'HC.01.02 Other company process L3']);
 assert.deepEqual(wuj.process,before.process);
 assert(!model.issues.some(issue=>String(issue.value).startsWith('HC.')));
 assert(![...maintenanceReport(model,{},'cap').records.get(wuj.id)].some(record=>String(record.raw).startsWith('HC.')),'Main Business Capability HC is left out as well');
 assert(renderSourceRecords(wuj,esc).includes('Not used: HC.01.02 Other company process L3 (HC entries belong to another company).'));
 // Every other application is built exactly as before.
 const plain=buildModel(data);
 for(const app of model.apps.filter(a=>!a.Name.startsWith('Wuj HK AGV'))){const same=plain.apps.find(a=>a.id===app.id);assert.deepEqual([app.rawCap,app.rawProcess,app.cap,app.process,app.otherCompany],[same.rawCap,same.rawProcess,same.cap,same.process,[]],app.Name);}
});

test('an owner mapping on an HC record is a decision about it: the record then counts as the mapped code',()=>{
 const wuj=data.apps.find(a=>a.Name.startsWith('Wuj HK AGV'));
 const mapping=createCorrection(data,{appId:wuj.ID,dimension:'cap',raw:WUJ,targetId:'B.06.3.2',reviewer:'Owner',reason:'Test: mapped to our catalogue'});
 const model=buildModel({...data,corrections:[...(data.corrections||[]),mapping]}),app=wujOf(model);
 assert.deepEqual([app.rawCap,app.otherCompany],[['B.06.5 Material Flow Orchestration',WUJ],[]]);
 assert(app.cap.includes('B.06.3.2'));assert(!app.cap.some(id=>id.startsWith('HC')));
});

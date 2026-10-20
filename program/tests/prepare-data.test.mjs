// scripts/prepare-data.mjs (replaces prepare_data.py). The source workbooks are not in the hand-over
// package, so they are synthesised from public/data.json in the real layout (tests/source-workbooks.mjs)
// and the rebuild must give back public/data.json byte for byte. Since 2026-10-16 the capability list comes
// from the business capability standard (standard+name.xlsx, --capabilities); the taxonomy workbook's own
// 'Business Capability' sheet still holds the old catalogue (tests/capability-rows-2026-10-15.json).
// Since 2026-10-19 (owner decision: HC capabilities belong to another department) the ten HC entries the
// standard still lists are not taken into the catalogue: the synthetic standard keeps them, as the real file
// does (71 entries), and the rebuild gives the 61 capability rows of public/data.json.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {main,buildData,describeDifferences,PRESERVED_KEYS} from '../scripts/prepare-data.mjs';
import {installDOMParser} from '../scripts/xml-dom.mjs';
import {readXlsx} from '../public/xlsx.mjs';
import {workspaceData,exportWorkspace,importWorkspace,acceptanceSample} from '../public/workspace.mjs';
import {correctionStates} from '../public/corrections.mjs';
import {inventorySheets,taxonomySheets,standardSheets,STANDARD_HEADER,OTHER_DEPARTMENT_ROWS,xlsxBuffer,EXCLUDED_MARKERS,MANUFACTURING_APP,MANUFACTURING_DECIDED} from './source-workbooks.mjs';

const script=fileURLToPath(new URL('../scripts/prepare-data.mjs',import.meta.url));
const dataPath=fileURLToPath(new URL('../public/data.json',import.meta.url));
const dataBytes=readFileSync(dataPath),data=JSON.parse(dataBytes.toString('utf8'));
// The catalogue public/data.json used until 2026-10-15: what the taxonomy workbook's 'Business Capability' sheet holds.
const legacy=JSON.parse(readFileSync(new URL('./capability-rows-2026-10-15.json',import.meta.url),'utf8'));
const TAXONOMY_FILE='Business Capability + Process.xlsx',STANDARD_FILE='standard+name.xlsx';
const BOTH_SOURCES=`${STANDARD_FILE} (capabilities); ${TAXONOMY_FILE} (processes)`;
const CJK=/[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿︰-﹏＀-￯]/;
// The HC entries the standard lists (owner decision 2026-10-19: not ours, so not in the catalogue).
const HC_CODES=['HC.06.01','HC.06.01.01','HC.06.01.02','HC.06.01.03','HC.06.01.04','HC.06.01.05','HC.06.02','HC.06.02.01','HC.06.02.02','HC.06.02.03'];
const isHc=value=>/^HC\./.test(String(value??'').trim());
const codesOf=rows=>new Set(rows.flat().filter(Boolean).map(label=>label.split(' ')[0]));
// Applications keep their own HC records; they are checked as recorded, outside the B.06 catalogue.
const HC_RECORDS=[['8aa81a3c-259e-400e-9eb4-1a792cb12d08','VMCN_CONNEX','HC.06.01.01 Demand Planning;HC.06.01.05 Detailed Production Scheduling'],
 ['2be34702-a301-49bd-b00c-0d235639253d','Wuj HK AGV (recovered 2025-06-26 03:31:37)','B.06.5 Material Flow Orchestration;HC.02.04.05 Transportation Management']];
const APP_ORDER=['ID','Division','Entity','Name','Description','Main Business Capability','Business Capabilities','Processes','Lifecycle: Current Lifecycle','Lifecycle: Active','scopeNote','scopeSource','operationCostScore','operationCostSource','roiScore','roiSource'];

const root=mkdtempSync(path.join(tmpdir(),'prepare-data-'));
after(()=>rmSync(root,{recursive:true,force:true}));
let folders=0;
const oldTaxonomy=()=>taxonomySheets(data,legacy.capabilityRows);
// Each case gets its own folder so the workbooks keep their real file names (they become source/taxonomySource).
// standard:null writes no standard workbook, and sources() then gives no --capabilities.
function workbooks({inventory=inventorySheets(data),taxonomy=oldTaxonomy(),standard=standardSheets(data),prefix='',date1904=false}={}){
 const dir=path.join(root,`case-${++folders}`);mkdirSync(dir);
 const files={dir,inventory:path.join(dir,data.source),taxonomy:path.join(dir,TAXONOMY_FILE),standard:standard&&path.join(dir,STANDARD_FILE),output:path.join(dir,'data.json')};
 writeFileSync(files.inventory,xlsxBuffer(inventory,{prefix,date1904}));writeFileSync(files.taxonomy,xlsxBuffer(taxonomy,{prefix,date1904}));
 if(standard)writeFileSync(files.standard,xlsxBuffer(standard,{prefix,date1904}));
 return files;
}
const base=workbooks();
const sources=files=>['--inventory',files.inventory,'--taxonomy',files.taxonomy,...(files.standard?['--capabilities',files.standard]:[])];
async function run(args){
 const out=[],err=[];
 const code=await main(args,{stdout:{write:text=>out.push(text)},stderr:{write:text=>err.push(text)}});
 return {code,stdout:out.join(''),stderr:err.join('')};
}
const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&');
const cli=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',cwd:root});
let baseRun;
const rebuildBase=()=>baseRun??=cli([...sources(base),'--preserve-workspace',dataPath,'--output',base.output]);
async function sheetsOf(buffer){installDOMParser();return readXlsx(new File([buffer],'book.xlsx'));}
// standard:null builds from the taxonomy workbook alone, as without --capabilities.
async function build(inventory,taxonomy=oldTaxonomy(),standard=standardSheets(data)){
 return buildData({inventorySheets:await sheetsOf(xlsxBuffer(inventory)),taxonomySheets:await sheetsOf(xlsxBuffer(taxonomy)),inventoryName:data.source,taxonomyName:TAXONOMY_FILE,
  ...(standard?{standardSheets:await sheetsOf(xlsxBuffer(standard)),standardName:STANDARD_FILE}:{}),preserved:data});
}

test('rebuilding from the source workbooks reproduces public/data.json byte for byte',async()=>{
 const result=rebuildBase();
 assert.equal(result.status,0,result.stderr);
 assert(readFileSync(base.output).equals(dataBytes),'the rebuilt file must equal public/data.json byte for byte');
 // The standard workbook given still lists the ten HC entries, on rows 63-72 as in the real standard+name.xlsx.
 const given=(await sheetsOf(readFileSync(base.standard)))['Standard Name'];
 assert.equal(given.length,72);
 assert.deepEqual(given.flatMap((row,index)=>row?.some(isHc)?[index+1]:[]),[63,64,65,66,67,68,69,70,71,72]);
 assert.equal(data.capabilityRows.flat().some(isHc),false,'public/data.json has no HC entry in its catalogue');
 assert.match(result.stdout,/76 applications; App operation cost recorded for 71, ROI for 71\./);
 assert.match(result.stdout,/Corrections: 12 applied, 0 need review, 0 revoked\./);
 assert.match(result.stdout,/Owner decision applied: removed 'Manufacturing' from the Processes of BMLP_Nexeed_IAS@WxP/);
});

test('--capabilities takes the capability names from the standard workbook and taxonomySource names both files',()=>{
 const result=rebuildBase();
 assert.equal(result.status,0,result.stderr);
 assert.equal(data.taxonomySource,BOTH_SOURCES,'public/data.json names the standard and the process workbook');
 const rebuilt=JSON.parse(readFileSync(base.output,'utf8'));
 assert.equal(rebuilt.taxonomySource,BOTH_SOURCES);
 assert.match(result.stdout,/^Wrote .*data\.json from 20260825_logistic_inventory\.xlsx and Business Capability \+ Process\.xlsx with standard\+name\.xlsx\.\n/);
 // 71 entries in the standard, of which ten are HC (another department's since 2026-10-19): 61 capability rows.
 assert(result.stdout.includes(`\nTaxonomy: ${BOTH_SOURCES}: 61 capability rows, 1,569 process rows.\n`),result.stdout);
 assert.equal(rebuilt.capabilityRows.length,61);
 assert.doesNotMatch(result.stdout,/existing data takes its capability names/,'nothing to warn about when the standard is given');
 const codes=codesOf(rebuilt.capabilityRows);
 assert.deepEqual(HC_CODES.filter(code=>codes.has(code)),[],'no HC.06 entry in the catalogue');
 assert.deepEqual([...codes].filter(isHc),[],'no HC code at any level');
 assert(codes.has('B.06')&&codes.has('B.06.9.7'),'the B.06 entries stay');
 // The applications' own HC records are rebuilt as recorded.
 for(const [id,name,capabilities] of HC_RECORDS){
  const app=rebuilt.apps.find(a=>a.ID===id);
  assert.deepEqual([app.Name,app['Business Capabilities']],[name,capabilities],id);
 }
 // The standard names replace the old, partly shortened catalogue names; the old-only code B.06.4.4 is gone.
 const label=(rows,code)=>[...new Set(rows.flat().filter(value=>value?.split(' ')[0]===code))];
 for(const [code,standard,old] of [['B.06.5','B.06.5 Material Flow Orchestration','B.06.5 Intra Logistics Management'],['B.06.1.1','B.06.1.1 Supply Chain (Logistics) Strategy Development','B.06.1.1 Supply Chain……Strategy Development']]){
  assert.deepEqual(label(rebuilt.capabilityRows,code),[standard],code);assert.deepEqual(label(legacy.capabilityRows,code),[old],code);
 }
 assert.deepEqual(label(rebuilt.capabilityRows,'B.06.4.4'),[]);assert.deepEqual(label(legacy.capabilityRows,'B.06.4.4'),['B.06.4.4 Physical Inventory Management']);
 // The synthetic standard has the real layout: one 'Standard Name' sheet, the six-column header on row 1, an entry per row,
 // the 61 catalogue entries on rows 2-62 and the ten HC entries on rows 63-72.
 const sheets=standardSheets(data);
 assert.deepEqual(Object.keys(sheets),['Standard Name']);assert.deepEqual(sheets['Standard Name'][0],[...STANDARD_HEADER]);assert.equal(sheets['Standard Name'].length,72);
 assert.deepEqual(sheets['Standard Name'].slice(62).map(row=>row.filter(isHc).at(-1)),HC_CODES);
 assert.deepEqual(sheets['Standard Name'].slice(62).map(row=>row.slice(0,2)),Array(10).fill(['B.06','Logistics Management']),'the HC entries sit under B.06 at Level 1');
 assert.equal(sheets['Standard Name'].slice(1,62).flat().some(isHc),false);
 assert.deepEqual(OTHER_DEPARTMENT_ROWS.flatMap(row=>[...codesOf([row])].filter(isHc)).filter((code,i,all)=>all.indexOf(code)===i),HC_CODES);
});

test('with --capabilities the taxonomy workbook needs only its process sheet, and its own capability sheets are not read',async()=>{
 const processesOnly=oldTaxonomy();delete processesOnly['Business Capability'];
 const files=workbooks({taxonomy:processesOnly}),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);assert(readFileSync(files.output).equals(dataBytes),'same file from a process-only taxonomy workbook');
 const broken=oldTaxonomy();broken['Standard Name']=[['Level 1 Code','Level 1 Name','Level 2 Code','Level 2 Name','Level 3 Code','Level 3 Name'],['B.06','Logistics'],['B.06','Logistics Mgmt.']];
 const ignored=workbooks({taxonomy:broken}),second=await run([...sources(ignored),'--preserve-workspace',dataPath,'--output',ignored.output]);
 assert.equal(second.code,0,second.stderr);assert(readFileSync(ignored.output).equals(dataBytes),'an unused standard sheet inside the taxonomy workbook is not read');
 const none=await run(['--inventory',files.inventory,'--taxonomy',files.taxonomy,'--preserve-workspace',dataPath,'--output',path.join(files.dir,'none.json')]);
 assert.equal(none.code,2);assert.match(none.stderr,/has no 'Business Capability' worksheet/,'without --capabilities a capability sheet is still required');
});

test('the --capabilities hint appears only where it helps, and the standard given as --taxonomy is recognised',async()=>{
 const onlyCapabilityMissing=oldTaxonomy();delete onlyCapabilityMissing['Business Capability'];
 const a=workbooks({taxonomy:onlyCapabilityMissing,standard:null}),first=await run([...sources(a),'--preserve-workspace',dataPath,'--output',a.output]);
 assert.equal(first.code,2);assert.match(first.stderr,/has no 'Business Capability' worksheet \(worksheets found: 'Data_RBW Process Structure'\)\. Or pass --capabilities <standard\.xlsx> to take the capability list from the business capability standard\./);
 const b=workbooks({taxonomy:{Notes:[['nothing here']]},standard:null}),second=await run([...sources(b),'--preserve-workspace',dataPath,'--output',b.output]);
 assert.equal(second.code,2);assert.match(second.stderr,/has no 'Business Capability' or 'Data_RBW Process Structure' worksheets/);assert.doesNotMatch(second.stderr,/--capabilities/,'the hint would not fix a missing process sheet');
 const c=workbooks({taxonomy:standardSheets(data),standard:null}),third=await run([...sources(c),'--preserve-workspace',dataPath,'--output',c.output]);
 assert.equal(third.code,2);assert.match(third.stderr,new RegExp(`^Error: The taxonomy workbook ${escape(TAXONOMY_FILE)} has a 'Standard Name' worksheet but no 'Data_RBW Process Structure' worksheet \\(worksheets found: 'Standard Name'\\), so it looks like the business capability standard\\. Pass it with --capabilities and give the process taxonomy workbook as --taxonomy\\.`));
 const twice=await run(['--inventory',c.inventory,'--taxonomy',c.taxonomy,'--capabilities',c.taxonomy,'--preserve-workspace',dataPath,'--output',c.output]);
 assert.equal(twice.code,2);assert.match(twice.stderr,/so it looks like the business capability standard\. The standard is already given with --capabilities; give the process taxonomy workbook as --taxonomy\./);
 for(const files of [a,b,c])assert.equal(existsSync(files.output),false);
});

test('without --capabilities a rebuild over the standard names says so, and --check lists the old catalogue as the difference',async()=>{
 const plain={...base,standard:null},file=path.join(base.dir,'standard-names.json');writeFileSync(file,dataBytes);
 const note=`The existing data takes its capability names from ${STANDARD_FILE}; this rebuild uses the 'Business Capability' sheet of ${TAXONOMY_FILE} instead. Add --capabilities <${STANDARD_FILE}> to keep the standard names.\n`;
 const check=await run([...sources(plain),'--output',file,'--check']);
 assert.equal(check.code,1,check.stderr);
 assert(check.stdout.includes(`against a rebuild from ${data.source} and ${TAXONOMY_FILE} (nothing is written).\n`),check.stdout);
 assert(check.stdout.includes(`\nTaxonomy: ${TAXONOMY_FILE}: 44 capability rows, 1,569 process rows.\n`),check.stdout);
 assert(check.stdout.includes('\n'+note),check.stdout);
 // No old row is also a standard row, so all 61 rows (the HC entries are not among them) are only in the file and all 44 only in the rebuild.
 assert.equal(legacy.capabilityRows.filter(row=>data.capabilityRows.some(own=>JSON.stringify(own)===JSON.stringify(row))).length,0);
 assert(check.stdout.includes('\n  capabilityRows: 61 rows in the file, 44 rebuilt; 61 only in the file, 44 only in the rebuilt data.\n'),check.stdout);
 assert(check.stdout.includes(`\n    - ${JSON.stringify(data.capabilityRows[0])}\n`)&&check.stdout.includes(`\n    + ${JSON.stringify(legacy.capabilityRows[0])}\n`),check.stdout);
 assert(check.stdout.includes(`\n  taxonomySource: ${JSON.stringify(BOTH_SOURCES)} -> ${JSON.stringify(TAXONOMY_FILE)}\n`),check.stdout);
 assert.doesNotMatch(check.stdout,/Applications:|processRows:|corrections:|importHistory:/,'only the capability list and its source differ');
 assert(readFileSync(file).equals(dataBytes),'--check never writes');
 // Writing without the standard stops, because the old catalogue would come back unnoticed; nothing is written.
 const refused=await run([...sources(plain),'--output',file]);
 assert.equal(refused.code,2);assert.match(refused.stderr,new RegExp(`^Error: The existing data takes its capability list from the business capability standard ${escape(STANDARD_FILE)}, and this rebuild has no --capabilities, so it would bring back the 'Business Capability' sheet of ${escape(TAXONOMY_FILE)}\\. Add --capabilities <${escape(STANDARD_FILE)}> to keep the standard, or --capabilities-from-taxonomy to go back to the sheet on purpose\\. Nothing was written\\.`));
 assert(readFileSync(file).equals(dataBytes),'refused: the file is unchanged');
 // The same when only the existing output uses the standard and the preserved file is a pre-standard snapshot.
 const preStandard=path.join(base.dir,'pre-standard.json');writeFileSync(preStandard,JSON.stringify({...data,capabilityRows:legacy.capabilityRows,taxonomySource:legacy.taxonomySource},null,2)+'\n');
 const viaPreserved=await run([...sources(plain),'--preserve-workspace',preStandard,'--output',file]);
 assert.equal(viaPreserved.code,2);assert.match(viaPreserved.stderr,/and this rebuild has no --capabilities/);assert(readFileSync(file).equals(dataBytes));
 const notedCheck=await run([...sources(plain),'--preserve-workspace',preStandard,'--output',file,'--check']);
 assert.equal(notedCheck.code,1);assert(notedCheck.stdout.includes('\n'+note),'--check notes it whichever file is preserved');
 // Asked for on purpose, the file gets the old catalogue back exactly as the taxonomy workbook records it; nothing else changes.
 const written=await run([...sources(plain),'--capabilities-from-taxonomy','--output',file]);
 assert.equal(written.code,0,written.stderr);assert(written.stdout.includes('\n'+note),written.stdout);
 const rebuilt=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(rebuilt.capabilityRows,legacy.capabilityRows);assert.equal(rebuilt.taxonomySource,legacy.taxonomySource);
 assert.deepEqual({...rebuilt,capabilityRows:data.capabilityRows,taxonomySource:data.taxonomySource},data);
 // Over data that already uses the old catalogue there is nothing to warn about.
 const again=await run([...sources(plain),'--output',file]);
 assert.equal(again.code,0,again.stderr);assert.doesNotMatch(again.stdout,/existing data takes its capability names/);
 assert.match(again.stdout,/Changes from the previous file: none \(identical bytes\)\./);
 // --capabilities brings the standard names back: the file is public/data.json again.
 const restored=await run([...sources(base),'--output',file]);
 assert.equal(restored.code,0,restored.stderr);assert(readFileSync(file).equals(dataBytes),'the standard rebuild is public/data.json again');
 assert(restored.stdout.includes('\n  capabilityRows: 44 rows in the file, 61 rebuilt; 44 only in the file, 61 only in the rebuilt data.\n'),restored.stdout);
});

test('a taxonomy workbook with its own Standard Name sheet takes the capability names from it',async()=>{
 const withStandard={...oldTaxonomy(),...standardSheets(data)};
 const files=workbooks({taxonomy:withStandard,standard:null}),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);
 const rebuilt=JSON.parse(readFileSync(files.output,'utf8'));
 assert.equal(rebuilt.taxonomySource,TAXONOMY_FILE,'one workbook holds both lists, so it is named alone');
 assert.deepEqual(rebuilt.capabilityRows,data.capabilityRows);
 assert.deepEqual({...rebuilt,taxonomySource:data.taxonomySource},data);
 // The sheet lists 71 entries; its ten HC entries are left out here too.
 assert(result.stdout.includes(`\nTaxonomy: ${TAXONOMY_FILE}: 61 capability rows, 1,569 process rows.\n`),result.stdout);
 assert.equal(withStandard['Standard Name'].slice(1).filter(row=>row.some(isHc)).length,10);
 assert.doesNotMatch(result.stdout,/existing data takes its capability names/,'the standard names are kept');
 // The old 'Business Capability' sheet is then not needed.
 const {'Business Capability':old,...withoutOld}=withStandard;assert(old);
 const alone=workbooks({taxonomy:withoutOld,standard:null}),aloneResult=await run([...sources(alone),'--preserve-workspace',dataPath,'--output',alone.output]);
 assert.equal(aloneResult.code,0,aloneResult.stderr);assert.deepEqual(JSON.parse(readFileSync(alone.output,'utf8')),rebuilt);
 // --capabilities wins over the taxonomy workbook's own sheet (here a shorter list).
 const both=workbooks({taxonomy:{...oldTaxonomy(),...standardSheets({capabilityRows:data.capabilityRows.slice(0,2)})}});
 const preferred=await run([...sources(both),'--preserve-workspace',dataPath,'--output',both.output]);
 assert.equal(preferred.code,0,preferred.stderr);assert(readFileSync(both.output).equals(dataBytes),'the --capabilities standard is used');
});

test('owner decision 2026-10-19: the HC entries of the standard are left out of the catalogue wherever they stand',async()=>{
 const own=standardSheets(data,{otherDepartment:[]})['Standard Name'],hcRows=standardSheets(data)['Standard Name'].slice(62);
 assert.equal(own.length,62);assert.equal(hcRows.length,10);
 const rebuild=async standard=>{const files=workbooks({standard}),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);return {files,result};};
 // A standard without them gives the same file: the HC entries add nothing to public/data.json.
 const without=await rebuild({'Standard Name':own});
 assert.equal(without.result.code,0,without.result.stderr);assert(readFileSync(without.files.output).equals(dataBytes),'the same file without the HC entries');
 // First, in the middle, at Level 1 only, or with a blank name (HC entries are left out before they are checked).
 const elsewhere={'Standard Name':[own[0],...hcRows.slice(0,4),...own.slice(1,30),...hcRows.slice(4),['HC.02','Other Department'],['HC.02','Other Department','HC.02.04','Other Department Area','HC.02.04.05','Transportation Management'],['B.06','Logistics Management','HC.06.03',''],...own.slice(30)]};
 const moved=await rebuild(elsewhere);
 assert.equal(moved.result.code,0,moved.result.stderr);assert(readFileSync(moved.files.output).equals(dataBytes),'HC entries anywhere are left out');
 assert(moved.result.stdout.includes(`\nTaxonomy: ${BOTH_SOURCES}: 61 capability rows, 1,569 process rows.\n`),moved.result.stdout);
 // The same B.06 entry without the skip would stop the rebuild: the check itself is unchanged for B.06 codes.
 const blankB06=await rebuild({'Standard Name':[...own,['B.06','Logistics Management','B.06.10','']]});
 assert.equal(blankB06.result.code,2);assert.match(blankB06.result.stderr,/'Standard Name' row 63, Level 2: code B\.06\.10 has no name\./);
 // Only the 'HC.' prefix is another department's: a code that merely begins with the letters HC is kept.
 const lookalike=standardSheets(data);lookalike['Standard Name'].push(['HCM.01','Lookalike Capability']);
 const kept=await build(inventorySheets(data),oldTaxonomy(),lookalike);
 assert.equal(kept.data.capabilityRows.length,62);assert.deepEqual(kept.data.capabilityRows.at(-1),['HCM.01 Lookalike Capability',null,null]);
 assert.deepEqual(kept.data.capabilityRows.slice(0,61),data.capabilityRows);
 // The applications keep their own HC records whichever way the standard lists HC.
 for(const result of [without,moved])for(const [id,,capabilities] of HC_RECORDS)assert.equal(JSON.parse(readFileSync(result.files.output,'utf8')).apps.find(a=>a.ID===id)['Business Capabilities'],capabilities,id);
 // A file from before the decision (the same data with the ten HC rows at the end of the catalogue): --check lists
 // exactly those rows as the difference, and writing removes them and gives public/data.json.
 const withHc={...data,capabilityRows:[...data.capabilityRows,...OTHER_DEPARTMENT_ROWS]};
 assert.deepEqual(standardSheets(withHc,{otherDepartment:[]}),standardSheets(data),'the synthetic standard is the one the data before the decision was read from');
 assert.throws(()=>standardSheets(withHc),/already lists HC capabilities/,'the helper never writes the HC entries twice');
 const before=path.join(base.dir,'with-hc.json'),beforeText=JSON.stringify(withHc,null,2)+'\n';writeFileSync(before,beforeText);
 const check=await run([...sources(base),'--output',before,'--check']);
 assert.equal(check.code,1,check.stderr);
 assert(check.stdout.includes('\n  capabilityRows: 71 rows in the file, 61 rebuilt; 10 only in the file, 0 only in the rebuilt data.\n'+OTHER_DEPARTMENT_ROWS.map(row=>`    - ${JSON.stringify(row)}\n`).join('')),check.stdout);
 assert.doesNotMatch(check.stdout,/Applications:|processRows:|taxonomySource:|importHistory:|\n {4}\+ /,'only the HC rows differ');
 assert.equal(readFileSync(before,'utf8'),beforeText,'--check never writes');
 const written=await run([...sources(base),'--output',before]);
 assert.equal(written.code,0,written.stderr);assert(readFileSync(before).equals(dataBytes),'written without the HC rows');
 assert(written.stdout.includes('\n  capabilityRows: 71 rows in the file, 61 rebuilt; 10 only in the file, 0 only in the rebuilt data.\n'),written.stdout);
});

test('ROI scores and sources survive the rebuild; contact and infrastructure columns are not copied',()=>{
 assert.equal(rebuildBase().status,0);
 const rebuilt=JSON.parse(readFileSync(base.output,'utf8'));
 // Since 2026-10-16 public/data.json also carries the (empty) application history and the taxonomy import events:
 // the switch to the standard (2026-10-16) and the HC removal (2026-10-19, stored compactly against the first).
 assert.deepEqual(Object.keys(rebuilt),['apps','capabilityRows','processRows','source','taxonomySource','corrections','applicationEvents','importHistory']);
 assert.deepEqual(rebuilt.applicationEvents,[]);
 assert.deepEqual(rebuilt.importHistory.map(event=>[event.kind,event.taxonomySource,event.at.slice(0,10)]),[['taxonomy',BOTH_SOURCES,'2026-10-16'],['taxonomy',BOTH_SOURCES,'2026-10-19']]);
 assert.equal(rebuilt.importHistory[1].appIdsBase,rebuilt.importHistory[0].id);
 assert.deepEqual(rebuilt.importHistory,data.importHistory);
 for(const app of rebuilt.apps)assert.deepEqual(Object.keys(app),APP_ORDER,app.ID);
 assert.equal(rebuilt.apps.filter(app=>app.roiScore!==null).length,71);
 assert.deepEqual(rebuilt.apps.map(app=>[app.ID,app.roiScore,app.roiSource]),data.apps.map(app=>[app.ID,app.roiScore,app.roiSource]));
 assert.equal(rebuilt.apps.find(app=>app.ID==='830c8445-c34f-463c-bc08-d494e5e18dc9').roiSource,'Parameter Score · ROI · row 2');
 const text=readFileSync(base.output,'utf8');
 for(const marker of EXCLUDED_MARKERS)assert(!text.includes(marker),`${marker} must not be copied`);
});

test('--check finds no differences against public/data.json and writes nothing',async()=>{
 const result=await run([...sources(base),'--check']);
 assert.equal(result.code,0,result.stderr+result.stdout);
 assert.match(result.stdout,/against a rebuild from 20260825_logistic_inventory\.xlsx and Business Capability \+ Process\.xlsx with standard\+name\.xlsx \(nothing is written\)\./);
 assert.match(result.stdout,/Result: no differences\. .*data\.json matches the rebuild byte for byte\./);
 assert(readFileSync(dataPath).equals(dataBytes));
});

test('--check exits 1 and lists each differing value as file value -> rebuilt value',()=>{
 const changed=structuredClone(data),file=path.join(base.dir,'changed.json');
 changed.apps[0].roiScore=2;changed.apps[1].Description='Edited by hand';changed.processRows.pop();
 const text=JSON.stringify(changed,null,2)+'\n';writeFileSync(file,text);
 const result=cli([...sources(base),'--output',file,'--check']);
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stdout,/Result: .*changed\.json differs from the rebuild \(file value -> rebuilt value\):/);
 assert.match(result.stdout,/Applications: 76 in the file, 76 rebuilt; 0 added, 0 removed, 2 changed\./);
 assert.match(result.stdout,/AGR w\/ Camera \(830c8445-c34f-463c-bc08-d494e5e18dc9\)\n\s+roiScore: 2 -> 3\n/);
 assert.match(result.stdout,new RegExp(escape(`${data.apps[1].Name} (${data.apps[1].ID})`)+'\\n\\s+Description: "Edited by hand" -> '+escape(JSON.stringify(data.apps[1].Description).slice(0,40))));
 assert.match(result.stdout,new RegExp('processRows: 1568 rows in the file, 1569 rebuilt; 0 only in the file, 1 only in the rebuilt data\\.\\n\\s+\\+ '+escape(JSON.stringify(data.processRows.at(-1)))));
 assert.equal(readFileSync(file,'utf8'),text,'--check never writes');
 const formatted=path.join(base.dir,'one-line.json');writeFileSync(formatted,JSON.stringify(data));
 const reformatted=cli([...sources(base),'--output',formatted,'--check']);
 assert.equal(reformatted.status,1);assert.match(reformatted.stdout,/Same data; only the formatting differs/);
});

test('writing reports the changes and a second run is identical',async()=>{
 const output=path.join(base.dir,'written.json'),old=structuredClone(data);old.apps[5].roiScore=null;
 writeFileSync(output,JSON.stringify(old,null,2)+'\n');
 const first=await run([...sources(base),'--output',output]);
 assert.equal(first.code,0,first.stderr);
 assert.match(first.stdout,new RegExp(`Changes from the previous file \\(old value -> new value\\):[\\s\\S]*roiScore: null -> ${data.apps[5].roiScore}`));
 assert(readFileSync(output).equals(dataBytes));
 const second=await run([...sources(base),'--output',output]);
 assert.match(second.stdout,/Changes from the previous file: none \(identical bytes\)\./);
});

test('an exported workspace (version 6) works as --preserve-workspace',async()=>{
 const workspace=workspaceData(data);
 workspace.similarityWeights={name:.25,description:.25,cap:.25,process:.25};
 workspace.source='renamed in the browser.xlsx';
 const exported=exportWorkspace(workspace),file=path.join(base.dir,'workspace-v6.json'),output=path.join(base.dir,'from-workspace.json');
 assert.equal(JSON.parse(exported).version,6);writeFileSync(file,exported);
 const result=await run([...sources(base),'--preserve-workspace',file,'--output',output]);
 assert.equal(result.code,0,result.stderr);
 assert.match(result.stdout,/\(workspace export, version 6\): corrections, reviews, reviewHistory, applicationEvents, importHistory, similarityWeights, similarityWeightsVersion\./);
 const rebuilt=JSON.parse(readFileSync(output,'utf8')),document=JSON.parse(exported);
 assert.deepEqual(Object.keys(rebuilt),['apps','capabilityRows','processRows','source','taxonomySource',...PRESERVED_KEYS]);
 assert.equal(rebuilt.source,data.source,'source names the inventory file, not the workspace');
 assert.deepEqual(rebuilt.apps,data.apps);assert.deepEqual(rebuilt.processRows,data.processRows);
 for(const key of PRESERVED_KEYS)assert.deepEqual(rebuilt[key],document.data[key],key);
 assert.deepEqual(rebuilt.similarityWeights,{name:.25,description:.25,cap:.25,process:.25});
 assert.equal(correctionStates(rebuilt).filter(c=>c.state==='Applied').length,12);
 assert.doesNotThrow(()=>importWorkspace(exportWorkspace(rebuilt)),'the result loads like any workspace');
 // Older exports are accepted as well.
 const v1=path.join(base.dir,'workspace-v1.json');
 writeFileSync(v1,JSON.stringify({format:'logistics-portfolio-workspace',version:1,data:{apps:data.apps,capabilityRows:data.capabilityRows,processRows:data.processRows,corrections:data.corrections}}));
 const older=await run([...sources(base),'--preserve-workspace',v1,'--output',path.join(base.dir,'from-v1.json')]);
 assert.equal(older.code,0,older.stderr);
 assert.match(older.stdout,/\(workspace export, version 1\): corrections\.\n/);
 // A version 1 export has no application history or import events, so those two keys are not carried over.
 const {applicationEvents,importHistory,...withoutHistory}=data;
 assert.deepEqual([applicationEvents.length,importHistory.length],[0,2]);
 assert(readFileSync(path.join(base.dir,'from-v1.json')).equals(Buffer.from(JSON.stringify(withoutHistory,null,2)+'\n','utf8')),'a version 1 export carrying only corrections gives the same file without the history keys');
});

test('unsupported --preserve-workspace files are rejected with a clear English error',async()=>{
 const demo=exportWorkspace(workspaceData(acceptanceSample(workspaceData(data))));
 const cases=[
  ['version-7.json',JSON.stringify({format:'logistics-portfolio-workspace',version:7,data}),/Unsupported --preserve-workspace file .*version-7\.json: format "logistics-portfolio-workspace", version 7\. Expected a data\.json snapshot or a workspace exported by this application \(format "logistics-portfolio-workspace", version 1 to 6\)\./],
  ['other-format.json',JSON.stringify({format:'another-tool',version:1,data}),/format "another-tool", version 1\./],
  ['array.json','[1,2]',/it is not a JSON object\./],
  ['partial.json',JSON.stringify({corrections:data.corrections}),/it has neither "apps" nor "format"\./],
  ['broken.json','{"apps":',/is not valid JSON\./],
  ['bad-data.json',JSON.stringify({format:'logistics-portfolio-workspace',version:6,data:{apps:[]}}),/is a workspace export, but its data is invalid: Workspace is missing the application inventory or taxonomy\./],
  ['bad-snapshot.json',JSON.stringify({apps:data.apps}),/is not a valid data\.json snapshot: Workspace is missing the application inventory or taxonomy\./],
  ['demo.json',demo,/holds the A\/B demo sample, not the portfolio/],
  ['missing.json',null,/Cannot read --preserve-workspace file .*missing\.json: file not found\./]
 ];
 for(const [name,content,message] of cases){
  const file=path.join(base.dir,name),output=path.join(base.dir,`rejected-${name}`);
  if(content!==null)writeFileSync(file,content);
  const result=await run([...sources(base),'--preserve-workspace',file,'--output',output]);
  assert.equal(result.code,2,name);
  assert.match(result.stderr,/^Error: /,name);assert.match(result.stderr,message,name);assert.doesNotMatch(result.stderr,CJK,name);
  assert.match(result.stderr,new RegExp('-preserve-workspace file '+escape(file)+'[: ]'),`${name}: the file is named after its role`);
  assert.equal(existsSync(output),false,`${name}: nothing is written`);
 }
});

test('the Manufacturing owner decision applies only on the exact match',async()=>{
 const withProcesses=(id,processes)=>{const sheets=inventorySheets(data),row=sheets['Logistic Apps'].find(r=>r?.[0]===id);row[8]=processes;return sheets;};
 const processesOf=(result,id)=>result.data.apps.find(app=>app.ID===id).Processes;
 const exact=await build(withProcesses(MANUFACTURING_APP,MANUFACTURING_DECIDED+';Manufacturing'));
 assert.equal(processesOf(exact,MANUFACTURING_APP),MANUFACTURING_DECIDED);
 assert(exact.notes.some(note=>note.startsWith("Owner decision applied: removed 'Manufacturing'")));
 for(const variant of [MANUFACTURING_DECIDED+';Manufacturing ',MANUFACTURING_DECIDED+';manufacturing',MANUFACTURING_DECIDED+';Manufacturing;BBM PM I2D Putaway L2','Manufacturing;'+MANUFACTURING_DECIDED,'BBM PM I2D Receive to Store L1;Manufacturing']){
  const result=await build(withProcesses(MANUFACTURING_APP,variant));
  assert.equal(processesOf(result,MANUFACTURING_APP),variant,`not applied to ${JSON.stringify(variant)}`);
  assert(result.notes.some(note=>note.startsWith('Owner decision NOT applied')),'the skipped decision is reported');
 }
 const other=data.apps.find(app=>app.ID!==MANUFACTURING_APP).ID;
 const sheets=withProcesses(other,MANUFACTURING_DECIDED+';Manufacturing');
 const result=await build(sheets);
 assert.equal(processesOf(result,other),MANUFACTURING_DECIDED+';Manufacturing','another application keeps the text');
 assert.equal(processesOf(result,MANUFACTURING_APP),MANUFACTURING_DECIDED);
 // prepare_data.py compared the ID without trimming it.
 const spaced=inventorySheets(data),row=spaced['Logistic Apps'].find(r=>r?.[0]===MANUFACTURING_APP);row[0]=MANUFACTURING_APP+' ';
 const untrimmed=await build(spaced);
 assert.equal(untrimmed.data.apps.find(app=>app.ID===MANUFACTURING_APP+' ').Processes,MANUFACTURING_DECIDED+';Manufacturing');
});

test('missing sheets, columns and invalid cells stop the rebuild with clear English errors',async()=>{
 const edit=(sheets,change)=>{change(sheets);return sheets;};
 const renameHeader=(sheet,from,to)=>sheets=>{const header=sheets[sheet].find(row=>row?.includes(from));header[header.indexOf(from)]=to;};
 const inv=change=>edit(inventorySheets(data),change),tax=change=>edit(oldTaxonomy(),change),std=change=>edit(standardSheets(data),change);
 const firstScored=data.apps.find(app=>app.operationCostSource.endsWith(' row 2'));
 // 'Standard Name' row 2 is B.06 alone; rows 3 and 4 both name B.06.1 (Level 2), and row 4 adds B.06.1.1 (Level 3).
 assert.deepEqual(standardSheets(data)['Standard Name'].slice(1,4).map(row=>row.filter(Boolean).filter((_,i)=>i%2===0)),[['B.06'],['B.06','B.06.1'],['B.06','B.06.1','B.06.1.1']]);
 const cases=[
  ['no Parameter Score',{inventory:inv(s=>delete s['Parameter Score'])},/The inventory workbook 20260825_logistic_inventory\.xlsx has no 'Parameter Score' worksheet \(worksheets found: 'Logistic Apps', 'Notes'\)\./],
  ['no Logistic Apps',{inventory:inv(s=>{s.Apps=s['Logistic Apps'];delete s['Logistic Apps'];})},/has no 'Logistic Apps' worksheet \(worksheets found: 'Parameter Score', 'Notes', 'Apps'\)\./],
  ['ROI header with a space',{inventory:inv(renameHeader('Parameter Score','ROI','ROI '))},/'Parameter Score' is missing the required column 'ROI' \(found "ROI "; check spaces and capitals\)\./],
  ['no App operation cost',{inventory:inv(renameHeader('Parameter Score','App operation cost','Cost'))},/'Parameter Score' is missing the required column 'App operation cost'\./],
  ['no Description',{inventory:inv(renameHeader('Logistic Apps','Description','Notes'))},/'Logistic Apps' is missing the required column 'Description'\./],
  ['two missing columns',{inventory:inv(s=>{renameHeader('Logistic Apps','Main Business Capability','MBC')(s);renameHeader('Logistic Apps','Lifecycle: Active','Active')(s);})},/is missing the required columns 'Main Business Capability', 'Lifecycle: Active'\./],
  ['duplicate column',{inventory:inv(s=>{s['Logistic Apps'][0][11]='Entity';})},/'Logistic Apps' has more than one 'Entity' column; keep only one\./],
  ['named column C',{inventory:inv(s=>{s['Logistic Apps'][0][2]='Scope';})},/'Logistic Apps' column C must be the unnamed scope-note column, but its header is "Scope"\./],
  ['invalid cost',{inventory:inv(s=>{s['Parameter Score'][1][2]='high';})},new RegExp(`'Parameter Score' row 2 \\(LeanIX ID ${firstScored.ID}\\), column 'App operation cost': App operation cost must be a score from 1 to 5, or blank\\. Found "high"\\.`)],
  ['invalid ROI',{inventory:inv(s=>{s['Parameter Score'][1][4]=7;})},/column 'ROI': ROI score must be 1 to 5, or blank\. Found "7"\./],
  ['duplicate ID',{inventory:inv(s=>{s['Logistic Apps'][2][0]=s['Logistic Apps'][1][0];})},/'Logistic Apps' rows 2 and 3 have the same ID 830c8445-c34f-463c-bc08-d494e5e18dc9\./],
  ['missing Name',{inventory:inv(s=>{s['Logistic Apps'][4][1]='';})},/'Logistic Apps' row 5 \(ID .+\) has no Name; the application cannot load a record without a name\./],
  ['no process sheet',{taxonomy:tax(s=>delete s['Data_RBW Process Structure'])},/The taxonomy workbook Business Capability \+ Process\.xlsx has no 'Data_RBW Process Structure' worksheet/],
  ['the standard given as the taxonomy',{taxonomy:standardSheets(data)},/The taxonomy workbook Business Capability \+ Process\.xlsx has a 'Standard Name' worksheet but no 'Data_RBW Process Structure' worksheet \(worksheets found: 'Standard Name'\), so it looks like the business capability standard\. The standard is already given with --capabilities; give the process taxonomy workbook as --taxonomy\./],
  // Without --capabilities the taxonomy workbook's own capability sheet is required.
  ['no capability sheet',{taxonomy:tax(s=>delete s['Business Capability']),standard:null},/The taxonomy workbook Business Capability \+ Process\.xlsx has no 'Business Capability' worksheet \(worksheets found: 'Data_RBW Process Structure'\)\./],
  // The capability standard (--capabilities).
  ['no Standard Name sheet',{standard:{Sheet1:standardSheets(data)['Standard Name']}},/The capability standard workbook standard\+name\.xlsx has no 'Standard Name' worksheet \(worksheets found: 'Sheet1'\)\./],
  ['no Level 3 Name',{standard:std(s=>{s['Standard Name'][0][5]='Level 3 Title';})},/Cannot read the capability standard standard\+name\.xlsx: 'Standard Name' is missing the column 'Level 3 Name'\./],
  ['two missing standard columns',{standard:std(s=>{s['Standard Name'][0][2]='L2 Code';s['Standard Name'][0][5]='L3 Name';})},/'Standard Name' is missing the columns 'Level 2 Code', 'Level 3 Name'\./],
  ['no Level 1 Code header',{standard:std(s=>{s['Standard Name'][0][0]='Code';})},/Cannot read the capability standard standard\+name\.xlsx: 'Standard Name' has no header row with a 'Level 1 Code' column\./],
  ['a code with two names',{standard:std(s=>{s['Standard Name'][3][3]='Supply Chain Strategy';})},/Cannot read the capability standard standard\+name\.xlsx: 'Standard Name' rows 3 and 4 give B\.06\.1 two different names: "Supply Chain \(Logistics\) Strategy and Design Management" and "Supply Chain Strategy"\./],
  ['a code without a name',{standard:std(s=>{s['Standard Name'][3][5]='';})},/'Standard Name' row 4, Level 3: code B\.06\.1\.1 has no name\./],
  ['a mistyped code',{standard:std(s=>{s['Standard Name'][3][4]='B06.1.1';})},/'Standard Name' row 4, Level 3: "B06\.1\.1" is not a capability code\./],
  ['a name without a code',{standard:std(s=>{s['Standard Name'][3][4]='';})},/'Standard Name' row 4, Level 3: "" is not a capability code\./],
  ['no Process Level',{taxonomy:tax(renameHeader('Data_RBW Process Structure','Process Level','Level'))},/'Data_RBW Process Structure' is missing the required column 'Process Level'\./],
  ['no Process ID header',{taxonomy:tax(renameHeader('Data_RBW Process Structure','Process ID','Code'))},/'Data_RBW Process Structure' has no header row with a 'Process ID' column\./]
 ];
 for(const [name,sheets,message] of cases){
  const files=workbooks(sheets),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
  assert.equal(result.code,2,`${name}: ${result.stdout}`);
  assert.match(result.stderr,message,name);assert.doesNotMatch(result.stderr,CJK,name);
  assert.equal(existsSync(files.output),false,`${name}: nothing is written`);
 }
 const notXlsx=path.join(base.dir,'inventory.csv');writeFileSync(notXlsx,'ID,Name\nA,App A\n');
 for(const [args,message] of [
  [['--inventory',notXlsx,'--taxonomy',base.taxonomy],/Cannot read the inventory workbook inventory\.csv: Unable to read this file\. Use an unencrypted \.xlsx file\./],
  [['--inventory',path.join(base.dir,'nowhere.xlsx'),'--taxonomy',base.taxonomy],/Cannot read the inventory workbook .*nowhere\.xlsx: file not found\./],
  [['--inventory',base.inventory],/Error: --taxonomy is required\./],
  [['--inventory',base.inventory,'--taxonomy',base.taxonomy,'--capabilities',path.join(base.dir,'no-standard.xlsx')],/Cannot read the capability standard workbook .*no-standard\.xlsx: file not found\./],
  [['--inventory',base.inventory,'--taxonomy',base.taxonomy,'--capabilities',notXlsx],/Cannot read the capability standard workbook inventory\.csv: Unable to read this file\. Use an unencrypted \.xlsx file\./],
  [[...sources(base),'--outptu','x.json'],/Error: Unknown option '--outptu'/]
 ]){
  const result=await run([...args,'--preserve-workspace',dataPath,'--output',path.join(base.dir,'never.json')]);
  assert.equal(result.code,2);assert.match(result.stderr,message);assert.doesNotMatch(result.stderr,CJK);
 }
 assert.equal(existsSync(path.join(base.dir,'never.json')),false);
});

test('Python-compatible row handling: blank IDs skipped and listed, empty scope has no source, blank taxonomy cells are null',async()=>{
 const inventory=inventorySheets(data),apps=inventory['Logistic Apps'];
 apps[1][2]='';                                   // no scope note on row 2
 apps.push(['','Total row without an ID']);       // row 78
 apps.push([]);apps.push(['   ','Whitespace ID']); // row 79 is empty; row 80 has a blank ID
 inventory['Parameter Score'].push(['not-in-inventory','Retired app',3,'Value 1',2]);
 const taxonomy=oldTaxonomy();
 taxonomy['Business Capability'].push([null,null,null,'remark only']);
 taxonomy['Data_RBW Process Structure'].push(['Plan to Fulfill (P2F)','M.P2F','L3','M.P2F.999',null]);
 const result=await build(inventory,taxonomy,null);  // the capability rows of the 'Business Capability' sheet (no --capabilities)
 assert.equal(result.data.apps.length,76);
 assert.equal(result.data.apps[0].scopeNote,'');assert.equal(result.data.apps[0].scopeSource,'','prepare_data.py left the source empty without a note');
 assert(result.notes.includes("Skipped 2 rows of 'Logistic Apps' without an ID: 78, 80."));
 assert(result.notes.includes("'Parameter Score' 1 row with a LeanIX ID that is not in 'Logistic Apps' (ignored): 73."));
 assert.equal(result.data.capabilityRows.length,legacy.capabilityRows.length,'a row with nothing in the first three columns is dropped');
 assert.deepEqual(result.data.processRows.at(-1),['Plan to Fulfill (P2F)','L3','M.P2F.999',null]);
 assert.deepEqual(result.data.capabilityRows[1],[null,'B.06.2 Order Planning Management','B.06.1.2 Supply Chain Network Strategy']);
 assert.deepEqual(result.data.capabilityRows,legacy.capabilityRows,'the old catalogue, as the 2026-10-15 data.json recorded it');
 // The capability standard: a missing level is null as well, and a row with nothing in the six columns is dropped.
 const standard=standardSheets(data);standard['Standard Name'].push([null,null,null,null,null,null,'remark only']);
 const fromStandard=await build(inventorySheets(data),oldTaxonomy(),standard);
 assert.deepEqual(fromStandard.data.capabilityRows[0],['B.06 Logistics Management',null,null]);
 assert.deepEqual(fromStandard.data.capabilityRows,data.capabilityRows);
 // Layout notes appear only when a workbook differs from what prepare_data.py assumed.
 assert.equal(result.notes.some(note=>note.includes('prepare_data.py assumed')),false);
 assert.equal(fromStandard.notes.some(note=>note.includes('prepare_data.py assumed')),false);
 const moved=oldTaxonomy();moved['Data_RBW Process Structure'].splice(0,2);
 const notes=(await build(inventorySheets(data),moved)).notes;
 assert(notes.includes("'Data_RBW Process Structure' header is on row 1; prepare_data.py assumed row 3."));
});

test('an annual-benefit column in the inventory is ignored instead of stopping the rebuild',async()=>{
 const inventory=inventorySheets(data);
 inventory['Logistic Apps'][0][15]='Annual benefit (CNY/year)';inventory['Logistic Apps'][1][15]='-5';
 const result=await build(inventory);
 assert(result.data.apps.every(app=>!Object.keys(app).some(key=>/annual/i.test(key))));
 assert.deepEqual(result.data.apps,data.apps);
});

test('SpreadsheetML written with a namespace prefix (x:row) rebuilds the same file',async()=>{
 const files=workbooks({prefix:'x'});
 assert.match(readFileSync(files.inventory).subarray(0,4).toString('latin1'),/^PK\x03\x04/);
 const result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);
 assert(readFileSync(files.output).equals(dataBytes));
});

test('package.json runs the Node rebuild and the Python script is gone',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['prepare:data'],'node scripts/prepare-data.mjs');
 assert.equal(existsSync(new URL('../prepare_data.py',import.meta.url)),false);
 const help=cli(['--help']);
 assert.equal(help.status,0);assert.match(help.stdout,/--preserve-workspace <json>/);assert.match(help.stdout,/--check/);assert.match(help.stdout,/--capabilities <xlsx> +Take the capability list from this business capability standard workbook/);
});

test('--check shows what changed inside long values instead of two identical shortened texts',async()=>{
 const long=key=>data.apps.filter(app=>JSON.stringify(app[key]).length>120);
 const [procApp]=long('Processes'),[descApp]=long('Description').filter(app=>app!==procApp),capApp=long('Business Capabilities').find(app=>app!==procApp&&app!==descApp);
 const file=path.join(base.dir,'long-values.json'),changed=structuredClone(data),edit=app=>changed.apps.find(a=>a.ID===app.ID);
 edit(procApp).Processes+=';BBM PM I2D Extra process L2';  // the rebuild no longer has this entry
 edit(descApp).Description+=' ';                            // the rebuild has no trailing space
 edit(capApp)['Business Capabilities']=capApp['Business Capabilities'].split(';').reverse().join(';');
 writeFileSync(file,JSON.stringify(changed,null,2)+'\n');
 const result=await run([...sources(base),'--output',file,'--check']);
 assert.equal(result.code,1,result.stderr);
 assert.match(result.stdout,new RegExp(escape(`${procApp.Name} (${procApp.ID})`)+'\\n\\s+Processes: removed "BBM PM I2D Extra process L2"\\n'));
 const text=descApp.Description,at=text.length,from=at-30;
 assert(result.stdout.includes(`    Description (${at+1} -> ${at} characters; first difference at character ${at+1}): ...${JSON.stringify((text+' ').slice(from))} -> ...${JSON.stringify(text.slice(from))}\n`),result.stdout);
 assert.match(result.stdout,new RegExp(escape(`${capApp.Name} (${capApp.ID})`)+'\\n\\s+Business Capabilities: the same entries in a different order\\n'));
 const replaced=structuredClone(data);replaced.apps.find(a=>a.ID===procApp.ID).Processes=procApp.Processes.replace('L0;','L0 ;');
 writeFileSync(file,JSON.stringify(replaced,null,2)+'\n');
 const spaced=await run([...sources(base),'--output',file,'--check']);
 const entry=procApp.Processes.split(';').find(item=>item.endsWith('L0'));
 assert.match(spaced.stdout,new RegExp('Processes: removed '+escape(JSON.stringify(entry+' '))+'; added '+escape(JSON.stringify(entry))+'\\n'),'a space inside one entry is visible');
});

test('a correction whose source row changed is counted as need review and named in a warning',async()=>{
 const inventory=inventorySheets(data),row=inventory['Logistic Apps'].find(r=>r?.[1]==='AUTO-RACK');row[5]+=' Edited in the source.';
 const files=workbooks({inventory}),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);
 assert.match(result.stdout,/Corrections: 11 applied, 1 need review, 0 revoked\./);
 assert.match(result.stdout,/ {2}Warning: the process mapping of "BBM PM I2D Putaway of Automated Goods Receipt \(AGR\) L3V" for AUTO-RACK \(b97561de-87df-46ec-a86c-477fe0e431f9\) no longer matches its source row or taxonomy and will show as Needs review\./);
 assert.equal(JSON.parse(readFileSync(files.output,'utf8')).corrections.length,data.corrections.length,'the stale correction is kept, not dropped');
});

test('--check lists added and removed applications and needs an existing file to compare',async()=>{
 const file=path.join(base.dir,'apps-differ.json'),changed=structuredClone(data),[gone]=changed.apps.splice(3,1);
 changed.apps.push({...structuredClone(data.apps[0]),ID:'retired-app-1',Name:'Retired app'});
 writeFileSync(file,JSON.stringify(changed,null,2)+'\n');
 const result=await run([...sources(base),'--output',file,'--check']);
 assert.equal(result.code,1);
 assert.match(result.stdout,/Applications: 76 in the file, 76 rebuilt; 1 added, 1 removed, 0 changed\.\n/);
 assert.match(result.stdout,new RegExp('\\n {4}\\+ '+escape(`${gone.Name} (${gone.ID})`)+'\\n {4}- Retired app \\(retired-app-1\\)\\n'));
 const missing=path.join(base.dir,'not-yet.json'),none=await run([...sources(base),'--output',missing,'--check']);
 assert.equal(none.code,1);assert.match(none.stdout,/Result: .*not-yet\.json does not exist, so there is nothing to compare\./);
 assert.equal(existsSync(missing),false,'--check never creates the file');
});

test('the default output is this program\'s public/data.json wherever the command runs',()=>{
 const result=cli([...sources(base),'--check']);
 assert.equal(result.status,0,result.stderr+result.stdout);
 assert(result.stdout.includes(`Checking ${dataPath} against a rebuild`),result.stdout);
 assert.equal(existsSync(path.join(root,'public')),false,'nothing is looked up or written relative to the current directory');
});

test('an existing --output is only replaced when it is a data.json snapshot',async()=>{
 const workbook=path.join(base.dir,'inventory-copy.xlsx');writeFileSync(workbook,readFileSync(base.inventory));
 const exported=path.join(base.dir,'exported-workspace.json');writeFileSync(exported,exportWorkspace(workspaceData(data)));
 const other=path.join(base.dir,'settings.json');writeFileSync(other,'{"name":"another file"}\n');
 for(const file of [workbook,exported,other]){
  const before=readFileSync(file),result=await run([...sources(base),'--preserve-workspace',dataPath,'--output',file]);
  assert.equal(result.code,2,path.basename(file));
  assert.match(result.stderr,/^Error: .+ exists but is not a data\.json snapshot \(a JSON object with an "apps" list\); it may be a workbook or another file\. Nothing was written\. Check --output\./);
  assert(readFileSync(file).equals(before),`${path.basename(file)} is untouched`);
 }
 const folder=path.join(base.dir,'a-folder');mkdirSync(folder);
 const directory=await run([...sources(base),'--preserve-workspace',dataPath,'--output',folder]);
 assert.equal(directory.code,2);assert.match(directory.stderr,/^Error: --output .*a-folder is a folder; give a file name such as data\.json\./);
 // Without --preserve-workspace the existing output is read for the carried decisions; errors say so.
 const broken=path.join(base.dir,'broken-output.json');writeFileSync(broken,'{"apps":');
 const defaulted=await run([...sources(base),'--output',broken]);
 assert.equal(defaulted.code,2);assert.match(defaulted.stderr,/^Error: Existing output file \(read for --preserve-workspace by default\) .*broken-output\.json is not valid JSON\./);
 assert.equal(readFileSync(broken,'utf8'),'{"apps":');
});

test('layout notes name every place where the workbook differs from what prepare_data.py assumed',async()=>{
 const inventory=inventorySheets(data);inventory['Logistic Apps'].unshift(['Logistic application inventory']);
 const taxonomy=oldTaxonomy();taxonomy['Data_RBW Process Structure']=taxonomy['Data_RBW Process Structure'].map(row=>row.length>2?[row[0],...row.slice(2)]:row);
 const {notes}=await build(inventory,taxonomy);
 assert(notes.includes("'Logistic Apps' header is on row 2; prepare_data.py assumed row 1."),notes.join('\n'));
 assert(notes.includes("'Data_RBW Process Structure' columns 'RBW E2E Process Chain', 'Process Level', 'Process ID', 'Process Name' are A, B, C, D; prepare_data.py assumed A, C, D, E."),notes.join('\n'));
});

test('the summary counts ROI and App operation cost separately',async()=>{
 const inventory=inventorySheets(data),row=inventory['Parameter Score'].find(r=>r?.[2]!==null&&r?.[2]!==undefined&&r?.[4]!==null&&r?.[4]!==undefined&&r!==inventory['Parameter Score'][0]);row[2]=null;
 const files=workbooks({inventory}),result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);
 assert.match(result.stdout,/76 applications; App operation cost recorded for 70, ROI for 71\./);
});

test('the change list counts repeated entries, caps long lists, escapes invisible characters and counts emoji once',()=>{
 const NBSP=String.fromCharCode(0xA0),escaped=code=>String.fromCharCode(92)+'u'+code.toString(16).toUpperCase().padStart(4,'0');
 const app=data.apps.find(a=>a.Processes.split(';').length>=3),entries=app.Processes.split(';');
 const lines=(edit,rebuilt=data)=>{const file=structuredClone(data);edit(file.apps.find(a=>a.ID===app.ID));return describeDifferences(JSON.stringify(file),rebuilt);};
 // One entry recorded twice in the file and once in the rebuild: the extra copy is reported.
 assert(lines(a=>{a.Processes=[entries[0],...entries].join(';');}).includes(`    Processes: removed ${JSON.stringify(entries[0])}`));
 // More than ten changed entries: the first ten and a count of the rest.
 const extra=Array.from({length:12},(_,i)=>`BBM PM Extra ${i+1} L2`);
 assert.equal(lines(a=>{a.Processes=[...entries,...extra].join(';');}).find(line=>line.startsWith('    Processes:')),`    Processes: ${extra.slice(0,10).map(item=>`removed ${JSON.stringify(item)}`).join('; ')}; ... and 2 more`);
 // A no-break space is written as an escape, in list entries and in short values.
 const spaced=entries[0].replace(' ',NBSP),nb=lines(a=>{a.Processes=[spaced,...entries.slice(1)].join(';');a.Name=app.Name+NBSP;});
 assert(nb.includes(`    Processes: removed ${JSON.stringify(spaced).replace(NBSP,escaped(0xA0))}; added ${JSON.stringify(entries[0])}`),nb.join('\n'));
 assert(nb.includes(`    Name: ${JSON.stringify(app.Name+NBSP).replace(NBSP,escaped(0xA0))} -> ${JSON.stringify(app.Name)}`),nb.join('\n'));
 // Bidi isolate marks (added around names copied from chat tools) and a line separator are escaped too.
 const marked=String.fromCharCode(0x2068)+app.Name+String.fromCharCode(0x2069,0x2028);
 assert(lines(a=>{a.Name=marked;}).includes(`    Name: "${escaped(0x2068)}${app.Name}${escaped(0x2069)}${escaped(0x2028)}" -> ${JSON.stringify(app.Name)}`));
 // A short text with many escapes is long once escaped: it is shown around its first difference, not cut.
 const padded=Array.from({length:12},(_,i)=>`word${i}`).join(NBSP)+' plant site (phase 2)',dotted=lines(a=>{a.Description=padded;},{...data,apps:data.apps.map(a=>a.ID===app.ID?{...a,Description:padded+'.'}:a)}).find(line=>line.startsWith('    Description'));
 assert.match(dotted,/^ {4}Description \(\d+ -> \d+ characters; first difference at character \d+\): .*phase 2\)" -> .*phase 2\)\."$/,dotted);
 // Shortened values are cut between characters, never inside an escape.
 assert.equal(describeDifferences(JSON.stringify({...data,source:NBSP.repeat(40)}),data).find(line=>line.startsWith('source:')),`source: "${escaped(0xA0).repeat(19)}... -> ${JSON.stringify(data.source)}`);
 // A character outside the basic plane counts once and is never cut in half.
 const smile=String.fromCodePoint(0x1F600),grin=String.fromCodePoint(0x1F601),rebuilt=structuredClone(data);
 rebuilt.apps.find(a=>a.ID===app.ID).Description=smile.repeat(40)+grin+smile.repeat(39);
 assert.equal(lines(a=>{a.Description=smile.repeat(80);},rebuilt).find(line=>line.startsWith('    Description')),
  `    Description (80 -> 80 characters; first difference at character 41): ...${JSON.stringify(smile.repeat(70))} -> ...${JSON.stringify(smile.repeat(30)+grin+smile.repeat(39))}`);
});

test('a data.json saved with a byte-order mark is read and replaced like any other; write errors are plain messages',async()=>{
 const output=path.join(base.dir,'with-bom.json');writeFileSync(output,Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),dataBytes]));
 const check=await run([...sources(base),'--output',output,'--check']);
 assert.equal(check.code,1);assert.match(check.stdout,/Same data; only the formatting differs \(indentation, spacing, line endings or a byte-order mark\)\./);
 const write=await run([...sources(base),'--output',output]);
 assert.equal(write.code,0,write.stderr);assert.match(write.stdout,/Carried over from .*with-bom\.json \(data\.json snapshot\): corrections, applicationEvents, importHistory\./);
 assert(readFileSync(output).equals(dataBytes),'rewritten without the byte-order mark');
 const blocked=await run([...sources(base),'--preserve-workspace',dataPath,'--output',path.join(output,'data.json')]);
 assert.equal(blocked.code,2);assert.match(blocked.stderr,/^Error: Cannot write .+: E[A-Z]+: /);assert.doesNotMatch(blocked.stderr,/Unexpected error|\n\s+at /);
});

test('a workbook in the 1904 date system rebuilds the same dates',async()=>{
 const files=workbooks({date1904:true});
 const result=await run([...sources(files),'--preserve-workspace',dataPath,'--output',files.output]);
 assert.equal(result.code,0,result.stderr);
 assert(readFileSync(files.output).equals(dataBytes),'Lifecycle: Active dates are read with the 1904 epoch');
});

// V14 (owner choice 2026-10-22, plan A): no LeanIX API, so a data steward imports the LeanIX exports in the tool and
// publishes the shared data as logistics-data.json next to index.html on the IIS server. The intranet page offers it with
// the usual import preview; applying it replaces the inventory, catalogues and owner decisions and keeps each user's own
// review notes, pair reviews, score settings, history and mappings. The offline file never looks for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DATA_PACKAGE_FILE,DATA_PACKAGE_FORMAT,createDataPackage,dataPackageText,readDataPackage,applyDataPackage,packageIsNew,packageNotOlder,packageId,packagePayload} from '../public/data-package.mjs';
import {workspaceData,mergeBundledCorrections} from '../public/workspace.mjs';
import {createCorrection,revokeCorrection,correctionStates} from '../public/corrections.mjs';
import {keptWorkText} from '../public/offline-save.mjs';
import {dataAsOfText} from '../public/data-as-of.mjs';
import {previewImport,applyInventory} from '../public/import-review.mjs';
import {reviewAuditEvents} from '../public/reviews.mjs';
import {recordImport} from '../public/application-history.mjs';
import {buildModel} from '../public/model.mjs';

const bundled=workspaceData(JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')));
const source=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const WUJ_HC='HC.02.04.05 Transportation Management';
const wujId=bundled.apps.find(a=>a.Name.startsWith('Wuj HK AGV')).ID;
const mapWuj=(data,targetId,reviewer)=>createCorrection(data,{appId:wujId,dimension:'cap',raw:WUJ_HC,targetId,reviewer,reason:'Test mapping'});
// The steward's newer data: AUTO-RACK has a new description, the last application left the inventory, and the owner
// mapped Wuj HK AGV's HC record.
const steward=(()=>{const apps=bundled.apps.slice(0,-1).map(a=>a.Name==='AUTO-RACK'?{...a,Description:'New description from LeanIX'}:a),base={...bundled,apps};return workspaceData({...base,corrections:[...base.corrections,mapWuj(base,'B.06.3.2','Steward')]});})();
const PUBLISHED='2026-10-22T08:00:00.000Z';
const pkg=createDataPackage(steward,{publishedAt:PUBLISHED});
// A user's workspace: the bundled data plus their own notes, pair review, score settings and one own mapping.
const user=workspaceData({...bundled,reviews:{'review-key':{status:'待核对',result:'Check with plant',reviewer:'User',updatedAt:'2026-10-22'}},
 pairReviews:{'a::b':{status:'Complementary',reason:'Different users',reviewer:'User',date:'2026-10-22'}},similarityWeights:{name:0.25,description:0.25,cap:0.25,process:0.25},similarityThreshold:60});

test('a package carries only the shared data, names itself by its content and states its date',()=>{
 assert.equal(DATA_PACKAGE_FILE,'logistics-data.json');
 assert.deepEqual(Object.keys(pkg),['format','version','id','publishedAt','dataAsOf','applications','data']);
 assert.deepEqual([pkg.format,pkg.version,pkg.publishedAt,pkg.dataAsOf,pkg.applications],[DATA_PACKAGE_FORMAT,1,PUBLISHED,'2026-10-21',bundled.apps.length-1]);
 assert.match(pkg.id,/^[0-9a-f]{16}$/);
 for(const key of Object.keys(pkg.data))assert(['source','taxonomySource','inventoryExport','apps','capabilityRows','processRows','corrections','acceptedRecords','mappingNotes'].includes(key),key);
 for(const key of ['reviews','reviewHistory','pairReviews','similarityWeights','similarityThreshold','importHistory','applicationEvents'])assert(!(key in pkg.data),`no ${key}: it is each user's own`);
 assert.equal(createDataPackage(steward,{publishedAt:'2030-01-01T00:00:00.000Z'}).id,pkg.id,'the publish time does not change the id');
 assert.notEqual(createDataPackage(bundled).id,pkg.id,'other data, other id');
 assert.equal(packageId(packagePayload(steward)),pkg.id);
});

test('the page reads a package back exactly, and refuses anything else or anything edited',()=>{
 const text=dataPackageText(steward,{publishedAt:PUBLISHED}),read=readDataPackage(text);
 assert.deepEqual(read,{id:pkg.id,publishedAt:PUBLISHED,dataAsOf:'2026-10-21',data:pkg.data});
 assert.throws(()=>readDataPackage('{not json'),/not valid JSON/);
 assert.throws(()=>readDataPackage({format:'something else'}),/not a data package of this tool/);
 assert.throws(()=>readDataPackage({...JSON.parse(text),version:2}),/version 2 is not supported/);
 assert.throws(()=>readDataPackage(text.replace('New description from LeanIX','Edited by hand')),/changed or damaged after it was published/);
 assert.throws(()=>readDataPackage({...JSON.parse(text),id:'0000000000000000'}),/changed or damaged/);
});

test('applying replaces the shared data and keeps everything that is the user\'s own',()=>{
 const read=readDataPackage(dataPackageText(steward,{publishedAt:PUBLISHED})),next=applyDataPackage(user,read);
 assert.deepEqual([next.apps,next.capabilityRows,next.processRows,next.source,next.taxonomySource],[steward.apps,steward.capabilityRows,steward.processRows,steward.source,steward.taxonomySource]);
 for(const key of ['reviews','reviewHistory','pairReviews','similarityWeights','similarityThreshold','importHistory','applicationEvents'])assert.deepEqual(next[key],user[key],key);
 assert.deepEqual(next.dataPackage,{id:pkg.id,publishedAt:PUBLISHED,dataAsOf:'2026-10-21',mappingIds:pkg.data.corrections.map(c=>c.id)});
 assert.equal(next.isAcceptanceSample,false);
 // The steward's mapping is added, since the user has none for that record; the shared ones are not duplicated.
 assert.equal(next.corrections.length,user.corrections.length+1);
 assert(buildModel(next).apps.find(a=>a.ID===wujId).cap.includes('B.06.3.2'));
 // A user's own mapping of the same record wins over the package.
 const own=workspaceData({...user,corrections:[...user.corrections,mapWuj(user,'B.06.3.1','User')]}),kept=applyDataPackage(own,read);
 assert.equal(kept.corrections.length,own.corrections.length);
 const wuj=buildModel(kept).apps.find(a=>a.ID===wujId);assert(wuj.cap.includes('B.06.3.1')&&!wuj.cap.includes('B.06.3.2'));
});

test('through the page\'s preview and Apply: the changes are listed, history records the package, and it is not offered again',()=>{
 const read=readDataPackage(dataPackageText(steward,{publishedAt:PUBLISHED}));
 assert.equal(packageIsNew(user,read),true,'offered to a user with other data');
 assert.equal(packageIsNew(steward,read),false,'not offered to the steward whose data it is');
 const preview=previewImport(user,applyDataPackage(user,read));
 assert.equal(preview.hasChanges,true);
 assert.deepEqual(preview.removed.map(a=>a.Name),[bundled.apps.at(-1).Name]);
 assert(preview.fieldChanges.some(c=>c.name==='AUTO-RACK'&&c.field==='Description'&&c.after==='New description from LeanIX'));
 const applied=recordImport(user,preview.next,{inventoryFile:`${DATA_PACKAGE_FILE} (published 2026-10-22)`,taxonomyFile:''});
 assert.equal(applied.importHistory.length,user.importHistory.length+1);
 assert.equal(applied.importHistory.at(-1).inventoryFile,'logistics-data.json (published 2026-10-22)');
 assert.deepEqual(applied.dataPackage,{id:pkg.id,publishedAt:PUBLISHED,dataAsOf:'2026-10-21',mappingIds:pkg.data.corrections.map(c=>c.id)});
 const reloaded=workspaceData(JSON.parse(JSON.stringify(applied)));
 assert.deepEqual(reloaded.dataPackage,applied.dataPackage,'kept in a saved or exported workspace');
 assert.equal(packageIsNew(reloaded,read),false,'not offered again after applying');
 assert.deepEqual(workspaceData({...bundled,dataPackage:{id:'not-an-id'}}).dataPackage,undefined,'a malformed record is dropped');
});

test('a package with older data than the page shows is not offered (a server file left from before a newer release)',()=>{
 const dated=day=>createDataPackage(workspaceData({...steward,source:`${day}_logistic_inventory.xlsx`}));
 const older=dated('20261001'),sameDay=dated('20261021'),newer=dated('20261105');
 assert.deepEqual([older.dataAsOf,sameDay.dataAsOf,newer.dataAsOf],['2026-10-01','2026-10-21','2026-11-05']);
 assert.deepEqual([packageIsNew(user,older),packageIsNew(user,sameDay),packageIsNew(user,newer)],[false,true,true],'the page shows data as of 2026-10-21');
 assert.equal(packageIsNew(user,{...newer,dataAsOf:''}),true,'a package without a date is judged by its content only');
});

test('the page wiring: only the intranet page looks for the package; Not now remembers the package; the steward exports it',()=>{
 const app=source('app.js'),html=source('index.html');
 assert(app.includes("async function checkDataPackage(){\n if(!/^https?:$/.test(location.protocol))return;\n let response;try{response=await fetch(DATA_PACKAGE_FILE,{cache:'no-store'});}catch{return;}\n if(!response.ok)return;"),'http/https only, no cache, a missing file is silent');
 assert(app.includes('await autosave.load();checkDataPackage();'),'checked once the page has its data');
 assert(app.includes('render();showPackageNotice();}'),'the notice follows every data change');
 assert(app.includes("localStorage.setItem(PACKAGE_DISMISSED_KEY,pkg.id)")&&app.includes("dismissed===pkg.id"),'Not now hides this package only');
 assert(app.includes('previewImport(base,applyDataPackage(base,pkg,packageOptions()))'),'the same preview and Apply as a file import');
 assert(app.includes("downloadText(text,DATA_PACKAGE_FILE,'application/json')"));
 assert(html.includes('<div id="packageNotice" class="package-notice" role="status" hidden></div>')&&html.includes('id="exportDataPackage"'));
});

// Review findings (V14, before release) — each case is the scenario the review reproduced.
test('review: the steward\'s mapping decisions reach users — revocations and replacements, not blocked by release copies',()=>{
 const X='l3v-12681baf83d23b3f1ca2137c';// a mapping that comes with the release (Applied)
 const afterRevoke=applyDataPackage(user,readDataPackage(dataPackageText(revokeCorrection(bundled,X))));
 assert.equal(correctionStates(afterRevoke).find(c=>c.id===X).state,'Revoked','the steward revoked it, so the user\'s copy is revoked too');
 // P1 maps Wuj HK AGV's HC record to B.06.3.1; P2 revokes that mapping and maps the record to B.06.3.2.
 const m1=mapWuj(bundled,'B.06.3.1','Steward'),s1=workspaceData({...bundled,corrections:[...bundled.corrections,m1]});
 const s2=(()=>{const r=revokeCorrection(s1,m1.id);return workspaceData({...r,corrections:[...r.corrections,mapWuj(r,'B.06.3.2','Steward')]});})();
 const p1=readDataPackage(dataPackageText(s1)),p2=readDataPackage(dataPackageText(s2));
 const capsOf=data=>buildModel(data).apps.find(a=>a.ID===wujId).cap;
 const afterP1=applyDataPackage(user,p1);assert(capsOf(afterP1).includes('B.06.3.1'));
 assert.equal(packageIsNew(afterP1,p2),true,'the replacement is offered');
 const afterP2=applyDataPackage(afterP1,p2);
 assert(capsOf(afterP2).includes('B.06.3.2')&&!capsOf(afterP2).includes('B.06.3.1'),'the replacement wins over the earlier copy');
 assert.deepEqual(correctionStates(afterP2).filter(c=>c.appId===wujId).map(c=>c.state).sort(),['Applied','Revoked']);
 assert(capsOf(applyDataPackage(user,p2)).includes('B.06.3.2'),'a revoked entry in the package does not block its active replacement');
 // A shared mapping the user revoked themselves stays revoked for them.
 const userRevoked=revokeCorrection(afterP1,m1.id),changed=workspaceData({...s1,apps:s1.apps.map(a=>a.Name==='AUTO-RACK'?{...a,Description:'Changed'}:a)});
 assert.equal(correctionStates(applyDataPackage(userRevoked,readDataPackage(dataPackageText(changed)))).find(c=>c.id===m1.id).state,'Revoked');
});

test('review: "confirmed as recorded" comes from the package as it is',()=>{
 const fewer=workspaceData({...bundled,acceptedRecords:bundled.acceptedRecords.slice(1)});
 assert.equal(bundled.acceptedRecords.length,2);
 assert.deepEqual(applyDataPackage(user,readDataPackage(dataPackageText(fewer))).acceptedRecords,fewer.acceptedRecords);
});

test('review: a package is offered only when applying it changes something, and an offered package can always be applied',()=>{
 const own=workspaceData({...user,corrections:[...user.corrections,mapWuj(user,'B.06.3.1','User')]});
 assert.equal(packageIsNew(own,readDataPackage(dataPackageText(bundled))),false,'the release data again: nothing to apply, so no notice');
 const redated=readDataPackage(dataPackageText({...bundled,source:'20261105_logistic_inventory.xlsx'}));
 assert.equal(packageIsNew(own,redated),true,'the same records with a newer date');
 const preview=previewImport(own,applyDataPackage(own,redated));
 assert.equal(preview.hasChanges,true,'Apply is offered');
 const applied=recordImport(own,preview.next,{inventoryFile:'logistics-data.json (published 2026-11-05)'});
 assert.equal(dataAsOfText(applied),'Data: 20261105_logistic_inventory.xlsx · as of 2026-11-05');
 assert.equal(packageIsNew(applied,redated),false,'and then the notice goes away');
 assert(buildModel(applied).apps.find(a=>a.ID===wujId).cap.includes('B.06.3.1'),'the user\'s own mapping stays');
});

test('review: the date rule compares the data\'s own dates, not import dates; a forged header date is ignored',()=>{
 const undated=readDataPackage(dataPackageText({...steward,source:'Logistics inventory final.xlsx'}));
 assert.equal(undated.dataAsOf,'');
 const afterUndated=recordImport(user,previewImport(user,applyDataPackage(user,undated)).next,{inventoryFile:'logistics-data.json',at:'2026-11-10T08:00:00.000Z'});
 const later=readDataPackage(dataPackageText({...bundled,source:'20261108_logistic_inventory.xlsx'}));
 assert.equal(packageIsNew(afterUndated,later),true,'data of 2026-11-08 is still offered after an import on 2026-11-10');
 assert.equal(readDataPackage({...JSON.parse(dataPackageText(steward)),dataAsOf:'2099-01-01'}).dataAsOf,'2026-10-21');
});

test('review: kept work from a server package is not called earlier data when the page opens',()=>{
 const kept={release:'V14',source:'20261105_logistic_inventory.xlsx',savedAt:'2026-11-06T08:00:00.000Z',data:{dataPackage:{id:'0123456789abcdef',publishedAt:'2026-11-05T09:00:00.000Z',dataAsOf:'2026-11-05'}}};
 const file={release:'V14',source:'20261021_logistic_inventory.xlsx',dataAsOf:'2026-10-21'};
 const same=keptWorkText(kept,file);
 assert.match(same.text,/published on the intranet server, as of 2026-11-05/);assert.equal(same.warning,'');
 const update=keptWorkText(kept,{...file,release:'V14.1'});
 assert.match(update.warning,/^This file is V14\.1\. Continuing keeps the data published on the intranet server \(as of 2026-11-05\) and your changes\./);
 assert.doesNotMatch(update.warning,/may be newer/);
 const older=keptWorkText({...kept,data:{dataPackage:{...kept.data.dataPackage,dataAsOf:'2026-10-01'}}},file);
 assert.match(older.warning,/the data in this file may be newer/,'an older package is earlier data');
});

test('review: hiding the notice is not the only way — the Import data dialog keeps an entry for the server data',()=>{
 const app=source('app.js'),html=source('index.html');
 // No title: it would replace the button's accessible name (as found in V11).
 assert(app.includes('<button type="button" id="packageLater">Hide this update</button>'));
 assert(html.includes('<p id="serverPackageEntry" class="server-package-entry" hidden><span id="serverPackageText"></span><button type="button" id="serverPackagePreview">Preview server data</button></p>'));
 assert(app.includes("$('serverPackageEntry').hidden=!offered;")&&app.includes("$('serverPackagePreview').onclick=previewDataPackage;"));
 assert(app.indexOf("$('serverPackageEntry').hidden=!offered;")<app.indexOf("if(!offered||dismissed===pkg.id)"),'the entry follows the data, not the hiding');
});

// Second review (V14, before release).
test('review 2: a later Excel or taxonomy import ends the "from the server" state, so the server data is offered again',()=>{
 const redated=readDataPackage(dataPackageText({...bundled,source:'20261105_logistic_inventory.xlsx',apps:bundled.apps.map(a=>a.Name==='AUTO-RACK'?{...a,Description:'From the server'}:a)}));
 const applied=recordImport(user,previewImport(user,applyDataPackage(user,redated)).next,{inventoryFile:'logistics-data.json'});
 assert.equal(packageIsNew(applied,redated),false);
 const ownFile=applyInventory(applied,bundled.apps,'20261101_logistic_inventory.xlsx');
 assert.equal(ownFile.dataPackage,undefined,'an inventory file clears the marker');
 assert.equal(packageIsNew(ownFile,redated),true,'the server data is offered again');
 assert(source('app.js').includes("taxonomySourceName(processTaxonomySource(next.taxonomySource),taxonomy.name)};delete next.dataPackage;}"),'a taxonomy file clears it too');
 const file={release:'V14',source:'20261121_logistic_inventory.xlsx',dataAsOf:'2026-11-21'};
 assert.match(keptWorkText({release:'V14',source:'20261101_logistic_inventory.xlsx',savedAt:'2026-11-02T08:00:00.000Z',data:workspaceData(ownFile)},file).warning,/may be newer/,'own older data is earlier data again');
});

test('review 2: mappings bundled with the release are shared, so the steward\'s mapping of the same record reaches users',()=>{
 const X=bundled.corrections.find(c=>c.id==='l3v-12681baf83d23b3f1ca2137c'),releaseIds=bundled.corrections.map(c=>c.id);
 // The steward's workspace never had X (an older base); the steward mapped the record again (S).
 const base={...bundled,corrections:bundled.corrections.filter(c=>c.id!==X.id)};
 const S=createCorrection(base,{appId:X.appId,dimension:X.dimension,raw:X.raw,targetId:X.targetId,reviewer:'Steward',reason:'Mapped again'});
 const pkg2=readDataPackage(dataPackageText({...base,corrections:[...base.corrections,S]}));
 const stateOf=data=>correctionStates(data).filter(c=>c.appId===X.appId&&c.raw===X.raw).map(c=>[c.id===S.id?'S':c.id===X.id?'X':'other',c.state]);
 assert.deepEqual(stateOf(applyDataPackage(user,pkg2,{releaseIds})),[['S','Applied']],'S applies; the release copy X gives way');
 // A release mapping the package says nothing about stays.
 const silent=readDataPackage(dataPackageText({...base,apps:base.apps.map(a=>a.Name==='AUTO-RACK'?{...a,Description:'Changed'}:a)}));
 assert.deepEqual(stateOf(applyDataPackage(user,silent,{releaseIds})),[['X','Applied']]);
 // A mapping the user made in this browser still wins over the package for its record.
 const userBase=revokeCorrection(user,X.id),own=createCorrection(userBase,{appId:X.appId,dimension:X.dimension,raw:X.raw,targetId:X.targetId,reviewer:'User',reason:'Own'});
 const withOwn=workspaceData({...userBase,corrections:[...userBase.corrections,own]});
 const result=correctionStates(applyDataPackage(withOwn,pkg2,{releaseIds})).filter(c=>c.appId===X.appId&&c.raw===X.raw&&!c.revokedAt);
 assert.deepEqual(result.map(c=>[c.id===own.id?'own':'other',c.state]),[['own','Applied']]);
});

test('review 2: an undated package is not judged older; the steward\'s revocation notes travel with the package',()=>{
 assert.equal(packageNotOlder({id:'0123456789abcdef',dataAsOf:''},'2026-10-21'),true);
 assert.equal(packageNotOlder({id:'0123456789abcdef',dataAsOf:'2026-10-01'},'2026-10-21'),false);
 assert.equal(packageNotOlder(undefined,'2026-10-21'),false);
 const undated={release:'V14',source:'Logistics inventory final.xlsx',savedAt:'2026-11-06T08:00:00.000Z',data:{dataPackage:{id:'0123456789abcdef',publishedAt:'2026-11-05T09:00:00.000Z',dataAsOf:''}}};
 const text=keptWorkText(undated,{release:'V14',source:'20261021_logistic_inventory.xlsx',dataAsOf:'2026-10-21'});
 assert.match(text.text,/published on the intranet server\)/);assert.equal(text.warning,'');
 assert(source('app.js').includes("const fromPackage=packageNotOlder(merged.data.dataPackage,dataAsOf(initialData)?.date||'');"));
 // The steward revokes a release mapping with the usual note; users see who and why, not "Reason was not recorded".
 const X='l3v-12681baf83d23b3f1ca2137c',note={id:'revoke-steward-1',action:'revoke',at:'2026-10-22T09:00:00.000Z',reviewer:'Data steward',mappingId:X,reason:'Demand planning is not done in this tool'};
 const stewardData=workspaceData({...revokeCorrection(bundled,X),reviewHistory:[...bundled.reviewHistory,note]});
 const read=readDataPackage(dataPackageText(stewardData));
 assert.deepEqual(read.data.mappingNotes.map(n=>[n.id,n.reviewer]),[['revoke-steward-1','Data steward']]);
 const applied=applyDataPackage(user,read,{releaseIds:bundled.corrections.map(c=>c.id)});
 const revokeEvents=reviewAuditEvents(applied).filter(e=>e.action==='revoke'&&e.mappingId===X);
 assert.deepEqual(revokeEvents.map(e=>[e.reviewer,e.reason]),[['Data steward','Demand planning is not done in this tool']]);
 assert.equal(packageIsNew(applied,read,{releaseIds:bundled.corrections.map(c=>c.id)}),false,'applying twice adds the note once');
 assert.equal(applyDataPackage(applied,read).reviewHistory.filter(n=>n.id==='revoke-steward-1').length,1);
});

test('review 3: mappings from an earlier package follow the steward — a later replacement reaches users and a withdrawal removes them',()=>{
 const releaseIds=bundled.corrections.map(c=>c.id),options={releaseIds},capsOf=data=>buildModel(data).apps.find(a=>a.ID===wujId).cap;
 const m1=mapWuj(bundled,'B.06.3.1','Steward'),p1=readDataPackage(dataPackageText(workspaceData({...bundled,corrections:[...bundled.corrections,m1]})));
 const afterP1=applyDataPackage(user,p1,options);assert(capsOf(afterP1).includes('B.06.3.1'));
 assert.deepEqual(workspaceData(JSON.parse(JSON.stringify(afterP1))).dataPackage.mappingIds,p1.data.corrections.map(c=>c.id),'kept in a saved or exported workspace');
 // The steward withdrew m1 (Undo import, or a workspace rebuilt from a backup) and mapped the record to B.06.3.2 instead.
 const m2=mapWuj(bundled,'B.06.3.2','Steward'),p3=readDataPackage(dataPackageText(workspaceData({...bundled,corrections:[...bundled.corrections,m2]})));
 assert.equal(packageIsNew(afterP1,p3,options),true,'the replacement is offered');
 const afterP3=applyDataPackage(afterP1,p3,options);
 assert(capsOf(afterP3).includes('B.06.3.2')&&!capsOf(afterP3).includes('B.06.3.1'),'the replacement applies');
 assert(!afterP3.corrections.some(c=>c.id===m1.id),'the withdrawn mapping is removed');
 // A package that only withdraws m1 is offered and removes it.
 const p4=readDataPackage(dataPackageText(bundled));
 assert.equal(packageIsNew(afterP1,p4,options),true);
 assert(!applyDataPackage(afterP1,p4,options).corrections.some(c=>c.id===m1.id));
 // A release mapping the next package leaves out still stays (the release rule), even though P1 carried it.
 const X='l3v-12681baf83d23b3f1ca2137c',p5=readDataPackage(dataPackageText({...bundled,corrections:bundled.corrections.filter(c=>c.id!==X)}));
 assert(applyDataPackage(afterP1,p5,options).corrections.some(c=>c.id===X));
});

test('review 3: the package the workspace came from is not offered again when a newer release adds fields on reload',()=>{
 const options={releaseIds:bundled.corrections.map(c=>c.id)};
 // A package left on the server, built from the previous release: same source and date, without the ROI fields.
 const older=readDataPackage(dataPackageText({...bundled,apps:bundled.apps.map(({roiScore,roiSource,...a})=>a)}));
 assert.equal(packageIsNew(user,older,options),true);
 const applied=recordImport(user,previewImport(user,applyDataPackage(user,older,options)).next,{inventoryFile:DATA_PACKAGE_FILE,taxonomyFile:''});
 // Reopening the page puts the release's fields back for the same source (mergeBundledCorrections in onRestore).
 const reloaded=mergeBundledCorrections(JSON.parse(JSON.stringify(applied)),bundled).data;
 assert(reloaded.apps.some(a=>a.roiScore!==undefined),'the release fields are back');
 assert.equal(reloaded.dataPackage.id,older.id);
 assert.equal(packageIsNew(reloaded,older,options),false,'the same package is not offered again');
 // A file import ends the "from the server" state (review 2), so the package can be offered again then.
 const {dataPackage,...withoutMarker}=reloaded;
 assert.equal(packageIsNew(withoutMarker,older,options),true);
});

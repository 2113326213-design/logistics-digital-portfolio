import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {buildModel} from '../public/model.mjs';
import {createWeightedSimilarity,textEvidence,textOverlap,DEFAULT_WEIGHTS} from '../public/weighted.mjs';
import {pairResultLabel,pairStatusReason,missingPairEvidence} from '../public/pair-status.mjs';
import {similarityCSV} from '../public/exports.mjs';

// Owner decision 2026-10-19, Similarity check:
// (a) the zero-text gate looks only at the name/description fields whose weight is above 0;
// (b) name words ignore single LETTERS and the LeanIX "(recovered <timestamp>)" suffix; descriptions are unchanged.
//     Round 2 correction: single digits and single Chinese (Han) characters stay name words; the name is
//     NFKC-normalized before the suffix is removed (so a full-width bracket suffix goes too), and the suffix may have
//     spaces after its opening bracket: /\(\s*recovered\b[^)]*\)/gi.
// Every expected value is derived by hand in the comment beside it ("was" gives the value before the decision;
// "round 1" gives the value under the first implementation of (b), which dropped every single character and matched
// the suffix before NFKC with no space allowed after the bracket).
// Unless a fixture says otherwise, both applications record capability B.06.1 and process M.T.1, so capability and
// process each score 1 in both directions and share a code (a held-back pair is then "Review needed").
const capabilityRows=[['B.06 Logistics','B.06.1 One','B.06.2 Two']];
const processRows=[['T','L0','M.T','Root'],['T','L1','M.T.1','One'],['T','L1','M.T.2','Two']];
const app=(ID,Name,Description,extra={})=>({ID,Name,Description,'Business Capabilities':'B.06.1 One',Processes:'BBM PM T One L1',...extra});
const W=(name,description,cap=.3,process=.4)=>({name,description,cap,process});
const close=(actual,expected)=>assert.ok(typeof actual==='number'&&Math.abs(actual-expected)<1e-10,`${actual} is not ${expected}`);
function pairOf(a,b,weights=DEFAULT_WEIGHTS){
 const data={apps:[a,b],capabilityRows,processRows},before=JSON.stringify(data);
 const pair=createWeightedSimilarity(buildModel(data),weights).pair(a.ID,b.ID);
 assert.equal(JSON.stringify(data),before,'source records are never changed');
 return pair;
}
const INVESTIGATE='; investigate the underlying function before treating this as an opportunity.';
const CONFIRMED='The opportunity score is the lower of the two confirmed directional totals.';
// Text fixtures: names alpha/beta share nothing, names "Yard Tool" are identical; descriptions orchard/tunnel share
// nothing, descriptions "warehouse stock" are identical.
const ZERO_BOTH=()=>[app('A','Alpha','orchard'),app('B','Beta','tunnel')];
const NAME_SHARED=()=>[app('A','Yard Tool','orchard'),app('B','Yard Tool','tunnel')];
const DESCRIPTION_SHARED=()=>[app('A','Alpha','warehouse stock'),app('B','Beta','warehouse stock')];

test('(a) default weights: the zero-text gate behaves exactly as before',()=>{
 // Unchanged by the decision: with 10/20/30/40 both text fields weigh more than 0, so both must score 0.
 const both=pairOf(...ZERO_BOTH());
 assert.equal(both.status,'investigation');
 assert.equal(both.zeroText,true);
 assert.equal(both.coverage,null);
 assert.equal(both.reason,'Name and description both have zero overlap'+INVESTIGATE);
 assert.equal(pairResultLabel(both),'Review needed');
 assert.ok(pairStatusReason(both).startsWith('No shared words in names or descriptions; compare the recorded functions.'));
 // Name 1, description 0: .1*1 + .2*0 + .3 + .4 = .8, confirmed.
 const name=pairOf(...NAME_SHARED());
 assert.equal(name.status,'confirmed');assert.equal(name.zeroText,false);close(name.coverage,.1+.3+.4);
 // Name 0, description 1: .1*0 + .2*1 + .3 + .4 = .9, confirmed.
 const description=pairOf(...DESCRIPTION_SHARED());
 assert.equal(description.status,'confirmed');assert.equal(description.zeroText,false);close(description.coverage,.2+.3+.4);
});

test('(a) description weight 0: a zero name score alone holds the pair back even when the descriptions share words',()=>{
 const weights=W(.1,0),pair=pairOf(...DESCRIPTION_SHARED(),weights),[name,description]=pair.forward.components;
 // Name alpha vs beta = 0 and weighs .1/.8 > 0; description is identical (1) but weighs 0 and contributes nothing.
 assert.equal(name.score,0);assert.ok(name.weight>0);
 assert.equal(description.score,1);assert.equal(description.weight,0);assert.equal(description.contribution,0);
 assert.equal(pair.zeroText,true);                       // was false: the unweighted description used to count
 assert.equal(pair.status,'investigation');              // was confirmed
 assert.equal(pair.coverage,null);                       // was .875
 // Both directions are complete; normalized weights .125/0/.375/.5 give 0 + 0 + .375 + .5 = .875 each way.
 close(pair.directionalMinimum,.875);
 assert.equal(pair.reason,'Name has zero overlap'+INVESTIGATE);
 assert.equal(pairResultLabel(pair),'Review needed');
 // The wording names only the weighted text field; the code evidence is .875 = 87.5 out of 100.
 assert.equal(pairStatusReason(pair),'No shared words in names; compare the recorded functions. Code evidence 87.5 / 100 from capabilities and processes; not a pair score.');
 // Unchanged: with the same weights a shared name is above 0, so the pair stays confirmed at (.1*1 + .3 + .4)/.8 = 1.
 const shared=pairOf(...NAME_SHARED(),weights);
 assert.equal(shared.status,'confirmed');assert.equal(shared.zeroText,false);close(shared.coverage,1);
});

test('(a) name weight 0: a zero description score alone holds the pair back even when the names share words',()=>{
 const weights=W(0,.2),pair=pairOf(...NAME_SHARED(),weights),[name,description]=pair.forward.components;
 assert.equal(name.score,1);assert.equal(name.weight,0);
 assert.equal(description.score,0);assert.ok(description.weight>0);
 assert.equal(pair.zeroText,true);                       // was false: the identical unweighted names used to count
 assert.equal(pair.status,'investigation');              // was confirmed
 assert.equal(pair.coverage,null);
 // Normalized weights 0, .2/.9, .3/.9, .4/.9: each direction 0 + 0 + (.3 + .4)/.9 = 7/9 (77.777... points).
 close(pair.directionalMinimum,7/9);
 assert.equal(pair.reason,'Description has zero overlap'+INVESTIGATE);
 assert.equal(pairResultLabel(pair),'Review needed');
 // 77.777... is shown with at most one decimal: 77.8.
 assert.equal(pairStatusReason(pair),'No shared words in descriptions; compare the recorded functions. Code evidence 77.8 / 100 from capabilities and processes; not a pair score.');
 // Unchanged: shared description words keep the pair confirmed at (.2*1 + .3 + .4)/.9 = 1.
 const shared=pairOf(...DESCRIPTION_SHARED(),weights);
 assert.equal(shared.status,'confirmed');close(shared.coverage,1);
});

test('(a) name and description weight 0: the gate never applies and a pair without shared words is confirmed at the lower direction',()=>{
 const [a,b]=ZERO_BOTH();a['Business Capabilities']='B.06.1 One;B.06.2 Two';
 const pair=pairOf(a,b,W(0,0));
 assert.deepEqual(pair.forward.components.slice(0,2).map(c=>[c.score,c.weight]),[[0,0],[0,0]]);
 assert.equal(pair.zeroText,false);                      // was true
 assert.equal(pair.status,'confirmed');                  // was investigation
 // Capability A to B = 1 of A's 2 codes (B.06.1, B.06.2) = .5, B to A = 1 of 1; processes identical = 1.
 // Normalized weights 0, 0, 3/7, 4/7: A to B = .5*3/7 + 4/7 = 11/14 (78.57), B to A = 3/7 + 4/7 = 1.
 close(pair.forward.coverage,.5*3/7+4/7);close(pair.reverse.coverage,1);
 close(pair.coverage,11/14);                             // was null
 close(pair.directionalMinimum,11/14);
 assert.equal(pair.reason,CONFIRMED);
 assert.equal(pairResultLabel(pair),'Potential overlap'); // 78.57 >= 50
 assert.equal(pairResultLabel(pair,80),'Not similar');    // 78.57 < 80
});

test('(a) a text weight of exactly 0 is ignored by the gate, while any positive weight counts',()=>{
 const tiny=1e-9;
 // Name 0 and description 0. With a tiny positive weight on one field the status stays investigation as before,
 // but the reason now names only that field.
 assert.equal(pairOf(...ZERO_BOTH(),W(0,0)).status,'confirmed');   // was investigation
 const tinyDescription=pairOf(...ZERO_BOTH(),W(0,tiny));
 assert.ok(tinyDescription.forward.components[1].weight>0);
 assert.equal(tinyDescription.status,'investigation');
 assert.equal(tinyDescription.reason,'Description has zero overlap'+INVESTIGATE); // was "Name and description both ..."
 const tinyName=pairOf(...ZERO_BOTH(),W(tiny,0));
 assert.equal(tinyName.status,'investigation');
 assert.equal(tinyName.reason,'Name has zero overlap'+INVESTIGATE);
 // Name 1 and description 0: only a positive description weight can hold the pair back.
 assert.equal(pairOf(...NAME_SHARED(),W(0,tiny)).status,'investigation'); // was confirmed
 assert.equal(pairOf(...NAME_SHARED(),W(0,0)).status,'confirmed');        // unchanged
 // Name 0 and description 1: only a positive name weight can hold the pair back.
 assert.equal(pairOf(...DESCRIPTION_SHARED(),W(tiny,0)).status,'investigation'); // was confirmed
 assert.equal(pairOf(...DESCRIPTION_SHARED(),W(0,0)).status,'confirmed');        // unchanged
});

test('(a) a pair held back by its one weighted text field whose codes share nothing is Not similar',()=>{
 // Name 0 (weighted), description 1 (weight 0); capability B.06.1 vs B.06.2 and process M.T.1 vs M.T.2 share no code.
 const [a,b]=DESCRIPTION_SHARED();Object.assign(b,{'Business Capabilities':'B.06.2 Two',Processes:'BBM PM T Two L1'});
 const pair=pairOf(a,b,W(.1,0));
 assert.equal(pair.status,'investigation');              // was confirmed at 0
 assert.equal(pair.reason,'Name has zero overlap'+INVESTIGATE);
 assert.equal(pairResultLabel(pair),'Not similar');      // label unchanged (was confirmed at 0, below 50)
 assert.equal(pairStatusReason(pair),'No shared capabilities or processes'); // was the confirmed-score reason
});

test('(a) a blank description with weight 0 neither blocks nor rescues a pair; a weighted blank stays Data missing',()=>{
 // Description weight 0: the blank description is ignored and name alpha vs beta = 0 is the only weighted text field.
 const unweighted=pairOf(app('A','Alpha',''),app('B','Beta','warehouse stock'),W(.1,0));
 assert.equal(unweighted.forward.components[1].score,null);
 assert.deepEqual(missingPairEvidence(unweighted),[]);
 assert.equal(unweighted.zeroText,true);                 // was false (null description is not 0)
 assert.equal(unweighted.status,'investigation');        // was confirmed
 assert.equal(unweighted.reason,'Name has zero overlap'+INVESTIGATE);
 assert.equal(pairResultLabel(unweighted),'Review needed');
 // Unchanged: with default weights the blank description is missing data, not zero overlap.
 const weighted=pairOf(app('A','Alpha',''),app('B','Beta','warehouse stock'));
 assert.equal(weighted.zeroText,false);assert.equal(weighted.status,'incomplete');
 assert.equal(pairResultLabel(weighted),'Data missing');
});

test('(b) single letters are not name words, but descriptions keep them',()=>{
 // "AGR w/ Camera" -> agr, camera; "AGR w/ Scanner" -> agr, scanner: 1 shared of 3 (was agr+w of 4).
 assert.deepEqual(textEvidence('AGR w/ Camera','AGR w/ Scanner'),{score:1/3,shared:['agr'],unionCount:3,targetOnly:['camera'],peerOnly:['scanner']});
 assert.equal(textEvidence('AGR w/ Camera','AGR w/ Scanner',{description:false}).score,1/3);
 // "E-Queue Kiosk" -> queue, kiosk; "E-Board Kiosk" -> board, kiosk: 1 of 3 (was e+kiosk of 4).
 assert.equal(textOverlap('E-Queue Kiosk','E-Board Kiosk'),1/3);
 // A one-letter name has no comparable word: null, not 0 (was x vs y = 0).
 assert.equal(textOverlap('X','Y'),null);
 // One letter means one code point: Deseret capital long I (U+10400, not Han) is two UTF-16 units but one letter, so
 // it is dropped like X: yard vs dock = 0 (was the shared Deseret letter: 1 of 3). (U+20000, also two UTF-16 units,
 // is a Han character and is now kept: see the Chinese-character test below.)
 const des=String.fromCodePoint(0x10400);
 assert.equal(textOverlap(des+' Yard',des+' Dock'),0);
 // Single letters of other alphabets are letters too: "Yard" + Greek alpha (U+03B1) vs "Yard" + Cyrillic ya (U+044F)
 // both reduce to yard = 1 (was 1 of 3).
 assert.equal(textOverlap('Yard '+String.fromCharCode(0x3B1),'Yard '+String.fromCharCode(0x44F)),1);
 // Unchanged: descriptions keep single characters, and two-character words remain name words.
 assert.deepEqual(textEvidence('AGR w/ Camera','AGR w/ Scanner',{description:true}),{score:2/4,shared:['agr','w'],unionCount:4,targetOnly:['camera'],peerOnly:['scanner']});
 assert.equal(textEvidence('E-Queue Kiosk','E-Board Kiosk',{description:true}).score,2/4);
 // The description lower-cases U+10400 to U+10428 and keeps it as its one shared word (of 3: the letter, yard, dock).
 assert.deepEqual(textEvidence(des+' Yard',des+' Dock',{description:true}).shared,[String.fromCodePoint(0x10428)]);
 assert.deepEqual(textEvidence('AB Tool','AB Kit').shared,['ab']);
});

test('(b) camelCase plant codes no longer share the split-off P',()=>{
 // "QinP Scanner" -> "Qin P Scanner" -> qin, scanner; "WxP Printer" -> wx, printer: nothing shared (was p: 1 of 5).
 assert.deepEqual(textEvidence('QinP Scanner','WxP Printer'),{score:0,shared:[],unionCount:4,targetOnly:['qin','scanner'],peerOnly:['wx','printer']});
 // "ShzP_ALICE" -> shz, alice; "ShzP_DAVIS" -> shz, davis: 1 of 3 (was shz+p of 4).
 assert.equal(textOverlap('ShzP_ALICE','ShzP_DAVIS'),1/3);
 // Default weights with descriptions orchard/tunnel: name 0 and description 0 now hold the pair back
 // (was name 1/5, confirmed at .1/5 + .3 + .4 = .72).
 const pair=pairOf(app('A','QinP Scanner','orchard'),app('B','WxP Printer','tunnel'));
 assert.equal(pair.forward.components[0].score,0);
 assert.equal(pair.zeroText,true);
 assert.equal(pair.status,'investigation');
 assert.equal(pair.reason,'Name and description both have zero overlap'+INVESTIGATE);
 // Unchanged: a description keeps the single p of "plant WxP" ("by" is a filler word): used, plant, p shared.
 assert.deepEqual(textEvidence('used by plant QinP','used by plant WxP',{description:true}).shared,['used','plant','p']);
});

test('(b) the LeanIX "(recovered <timestamp>)" suffix is not part of a name',()=>{
 const stamp='(recovered 2025-12-19 10:03:06)';
 // Both names reduce to yard, manager: identical (was 2 of 9 with recovered, 2025, 12, 19, 10, 03, 06).
 assert.deepEqual(textEvidence('Yard Manager '+stamp,'Yard Manager'),{score:1,shared:['yard','manager'],unionCount:2,targetOnly:[],peerOnly:[]});
 // Case-insensitive (each was 2 of 9).
 assert.equal(textOverlap('Yard Manager (RECOVERED 2025-12-19 10:03:06)','Yard Manager'),1);
 assert.equal(textOverlap('Yard Manager (Recovered 2025-11-19 08:20:28)','Yard Manager'),1);
 // More than one suffix (was yard, manager + 12 distinct suffix words: 2 of 14), and a suffix in the middle of the
 // name (was 2 of 9).
 assert.equal(textOverlap('Yard '+stamp+' Manager (recovered 2026-01-02 08:00:00)','Yard Manager'),1);
 assert.equal(textOverlap('Yard '+stamp+' Manager','Manager Yard'),1);
 // Two recovered names no longer match on timestamp words: datahub vs rmm, system = 0
 // (was recovered, 2025, 12, 19, 10, 03 shared: 6 of 11).
 assert.equal(textOverlap('Datahub (recovered 2025-12-19 10:03:06)','RMM System (recovered 2025-12-19 10:03:58)'),0);
 // An unclosed parenthesis is not the suffix: its 9 words stay, while the closed copy reduces to yard, manager
 // (was identical: 1).
 const open=textEvidence('Yard Manager (recovered 2025-12-19 10:03:06','Yard Manager '+stamp);
 assert.equal(open.score,2/9);
 assert.deepEqual(open.targetOnly,['recovered','2025','12','19','10','03','06']);
 assert.deepEqual(open.peerOnly,[]);
 // "(recovery plan)" is another word and stays: yard, recovery, plan vs yard, plan = 2 of 3 (was 2 of 10).
 assert.equal(textOverlap('Yard (recovery plan)','Yard Plan '+stamp),2/3);
 // "recovered" outside the parentheses is part of the name: data, recovered on both sides (was 2 of 8).
 assert.equal(textOverlap('Data recovered '+stamp,'Data recovered'),1);
 // Unchanged: a plain "Recovered" word counts in names, and descriptions keep the whole suffix (2 of 8).
 assert.equal(textOverlap('Recovered Parts Yard','Parts Yard'),2/3);
 assert.equal(textEvidence('Data recovered '+stamp,'Data recovered',{description:true}).score,2/8);
});

test('(b) round 2: the suffix is removed after NFKC and may have spaces after the opening bracket',()=>{
 const C=String.fromCharCode,fullWidth=text=>[...text].map(ch=>C(ch.charCodeAt(0)+0xFEE0)).join('');
 const OPEN=C(0xFF08),CLOSE=C(0xFF09),IDEOGRAPHIC_SPACE=C(0x3000),words=' 2025-12-19 10:03:06';
 // Each name below reduces to yard, manager = 1. Under round 1 the suffix stayed, so its 7 words (recovered, 2025, 12,
 // 19, 10, 03, 06) joined yard, manager: 2 shared of 9.
 // Full-width brackets U+FF08/U+FF09 become ( and ) under NFKC.
 assert.equal(textOverlap('Yard Manager'+OPEN+'recovered'+words+CLOSE,'Yard Manager'),1);                    // round 1: 2/9
 // A space after the opening bracket.
 assert.equal(textOverlap('Yard Manager ( recovered'+words+')','Yard Manager'),1);                         // round 1: 2/9
 // A tab and a space after the opening bracket.
 assert.equal(textOverlap('Yard Manager ('+C(9)+' recovered'+words+')','Yard Manager'),1);               // round 1: 2/9
 // Full-width bracket plus an ideographic space (U+3000 becomes a space under NFKC).
 assert.equal(textOverlap('Yard Manager'+OPEN+IDEOGRAPHIC_SPACE+'recovered'+words+CLOSE,'Yard Manager'),1);  // round 1: 2/9
 // Full-width letters r-e-c-o-v-e-r-e-d become ASCII "recovered" under NFKC.
 assert.equal(textOverlap('Yard Manager ('+fullWidth('recovered')+words+')','Yard Manager'),1);            // round 1: 2/9
 // The full evidence for the full-width suffix: yard, manager on both sides.
 assert.deepEqual(textEvidence('Yard Manager'+OPEN+'recovered'+words+CLOSE,'Yard Manager'),{score:1,shared:['yard','manager'],unionCount:2,targetOnly:[],peerOnly:[]}); // round 1: score 2/9, unionCount 9
 // A name that is only a full-width or a spaced suffix has no comparable word: null (round 1: 0 = 7 suffix words vs
 // yard, tool sharing nothing).
 assert.equal(textEvidence(OPEN+'recovered'+words+CLOSE,'Yard Tool').score,null);                          // round 1: 0
 assert.equal(textEvidence('( recovered'+words+')','Yard Tool').score,null);                                // round 1: 0
 // Unchanged guards (same in round 1): "recovered" must end at a word boundary, also after the new optional spaces,
 // so "(recoveredparts)" stays: yard, recoveredparts vs yard = 1 of 2; and "(recovery plan)" stays:
 // yard, recovery, plan vs yard, plan (+ removed suffix) = 2 of 3.
 assert.equal(textOverlap('Yard (recoveredparts)','Yard'),1/2);
 assert.equal(textOverlap('Yard ( recoveredparts)','Yard'),1/2);
 assert.equal(textOverlap('Yard'+OPEN+'recoveredparts'+CLOSE,'Yard'),1/2);
 assert.equal(textOverlap('Yard ( recovery plan)','Yard Plan (recovered'+words+')'),2/3);
 // Unchanged: descriptions keep a full-width suffix: data, recovered, 2025, 12, 19, 10, 03, 06 vs data = 1 of 8.
 assert.equal(textEvidence('Data'+OPEN+'recovered'+words+CLOSE,'Data',{description:true}).score,1/8);
 assert.equal(textEvidence('Data ( recovered'+words+')','Data',{description:true}).score,1/8);
});

test('(b) the suffix needs no timestamp, and its removal leaves a word break',()=>{
 // Gaps from the round-2 mutation review (same before round 3). The suffix pattern is /\(\s*recovered\b[^)]*\)/gi:
 // nothing is required after "recovered", and the match is replaced by a space, not deleted.
 // A bare "(recovered)": yard, manager on both sides = 1 (if the suffix needed a timestamp, "recovered" would stay:
 // yard, manager, recovered vs yard, manager = 2 of 3).
 assert.deepEqual(textEvidence('Yard Manager (recovered)','Yard Manager'),{score:1,shared:['yard','manager'],unionCount:2,targetOnly:[],peerOnly:[]});
 assert.equal(textOverlap('Yard Manager (RECOVERED)','Yard Manager'),1);
 assert.equal(textOverlap('Yard Manager ( recovered )','Yard Manager'),1);
 // A name that is only the bare suffix has no comparable word: null (if it stayed: recovered vs yard, tool = 0).
 assert.equal(textEvidence('(recovered)','Yard Tool').score,null);
 // Descriptions keep it: data, recovered vs data = 1 of 2.
 assert.equal(textEvidence('Data (recovered)','Data',{description:true}).score,1/2);
 // The suffix glued between two words leaves a space: "yard(recovered ...)tool" reads yard, tool = 1 against
 // "yard tool". Deleting it instead would glue "yardtool" into one word: 0 of 3. The same holds for upper case (no
 // camelCase split between D and T) and for a digit after the suffix ("line2" would be one word).
 const stamp='(recovered 2025-12-19 10:03:06)';
 assert.deepEqual(textEvidence('yard'+stamp+'tool','yard tool'),{score:1,shared:['yard','tool'],unionCount:2,targetOnly:[],peerOnly:[]});
 assert.equal(textOverlap('YARD'+stamp+'TOOL','Yard Tool'),1);
 assert.equal(textOverlap('Line'+stamp+'2','Line 2'),1);
 // "Yard(recovered ...)Tool" also reads yard, tool, but would do so even if the suffix were deleted: "YardTool" is split
 // again by the camelCase rule, so this spelling alone cannot show the word break.
 assert.equal(textOverlap('Yard'+stamp+'Tool','Yard Tool'),1);
});

test('(b) round 2: single digits stay name words; longer numbers are unchanged',()=>{
 // "I4.0" splits into i4 and 0, and the 0 stays: i4, 0, dashboard vs i4, 0, portal = 2 shared of 4 (same as before the
 // decision; round 1 dropped the 0: 1 of 3).
 assert.deepEqual(textEvidence('I4.0 Dashboard','I4.0 Portal').shared,['i4','0']);    // round 1: ['i4']
 assert.equal(textOverlap('I4.0 Dashboard','I4.0 Portal'),2/4);                        // round 1: 1/3
 // A standalone single digit tells names apart again: line, 1 vs line, 2 = 1 of 3.
 assert.equal(textOverlap('Line 1','Line 2'),1/3);                                     // round 1: 1 (both were line)
 assert.equal(textOverlap('Line 1','Line 1'),1);
 // A name made only of a single digit has a comparable word: 1 vs yard, tool = 0, and 7 vs 7 = 1.
 assert.equal(textEvidence('1','Yard Tool').score,0);                                  // round 1: null
 assert.equal(textOverlap('7','7'),1);                                                 // round 1: null
 // NFKC first: the full-width digit two (U+FF12) is the digit 2: line, 2 vs line, 1 = 1 of 3.
 assert.equal(textOverlap('Line '+String.fromCharCode(0xFF12),'Line 1'),1/3);          // round 1: 1
 // Unchanged: multi-digit numbers and letter-digit words stay, and descriptions keep single digits (1 of 3).
 assert.equal(textOverlap('RCS-2000','RCS 2000'),1);
 assert.equal(textOverlap('Szh5 Yard','Szh2 Yard'),1/3);
 assert.equal(textEvidence('Line 1','Line 2',{description:true}).score,1/3);
 // Default weights, descriptions orchard/tunnel (0): name 1/3 is above 0, so the pair is confirmed at
 // .1*1/3 + .2*0 + .3 + .4 = .7333... in both directions (the name Jaccard is symmetric).
 const lines=pairOf(app('A','Line 1','orchard'),app('B','Line 2','tunnel'));
 assert.equal(lines.status,'confirmed');
 close(lines.coverage,.1/3+.3+.4);                                                      // round 1: .8 (name 1)
 // Names "1" and "2": name 0 and description 0 are both weighted, so the gate holds the pair back.
 const digits=pairOf(app('A','1','orchard'),app('B','2','tunnel'));
 assert.equal(digits.forward.components[0].score,0);                                    // round 1: null
 assert.equal(digits.status,'investigation');                                           // round 1: incomplete
 assert.equal(digits.reason,'Name and description both have zero overlap'+INVESTIGATE); // round 1: no gate
 assert.equal(pairResultLabel(digits),'Review needed');                                 // round 1: Needs confirmation
});

test('(b) round 2: a single Chinese (Han) character stays a name word',()=>{
 // KU = U+5E93 (store), CANG = U+4ED3 (warehouse); each is one Han character.
 const KU=String.fromCharCode(0x5E93),CANG=String.fromCharCode(0x4ED3);
 // yard, KU vs yard, CANG = 1 shared of 3.
 assert.deepEqual(textEvidence('Yard '+KU,'Yard '+CANG),{score:1/3,shared:['yard'],unionCount:3,targetOnly:[KU],peerOnly:[CANG]}); // round 1: score 1, unionCount 1
 // A lone Han character is a comparable word: KU vs KU = 1, KU vs yard, tool = 0.
 assert.equal(textOverlap(KU,KU),1);                                                   // round 1: null
 assert.equal(textOverlap(KU,'Yard Tool'),0);                                          // round 1: null
 // One character means one code point: CJK Extension B U+20000 is two UTF-16 units but one Han character, kept:
 // ext, yard vs ext, dock = 1 of 3 (same as before the decision).
 const ext=String.fromCodePoint(0x20000);
 assert.equal(textOverlap(ext+' Yard',ext+' Dock'),1/3);                               // round 1: 0
 assert.deepEqual(textEvidence(ext+' Yard',ext+' Dock').shared,[ext]);                 // round 1: []
 // Unchanged: a run of Han characters is one word (CANG+KU = warehouse): shared CANG+KU of 3.
 assert.deepEqual(textEvidence(CANG+KU+' Tool',CANG+KU+' Kit').shared,[CANG+KU]);
 // Unchanged: descriptions keep single Han characters (yard shared of 3).
 assert.equal(textEvidence('Yard '+KU,'Yard '+CANG,{description:true}).score,1/3);
 // Default weights, names KU/KU (1), descriptions orchard/tunnel (0): confirmed at .1*1 + .2*0 + .3 + .4 = .8.
 const pair=pairOf(app('A',KU,'orchard'),app('B',KU,'tunnel'));
 assert.equal(pair.forward.components[0].score,1);                                      // round 1: null
 assert.equal(pair.status,'confirmed');                                                 // round 1: incomplete
 close(pair.coverage,.1+.3+.4);                                                         // round 1: null
});

// Round 3 (2026-10-19): a word is a letter or digit followed by letters, combining marks (\p{M}) and digits, for names
// and descriptions alike, so a mark no longer cuts a word into pieces; a single name letter is a letter followed only by
// marks (and not a Chinese character). "round 2" gives the value under the previous rule (words = runs of letters and
// digits, single letter = exactly one letter code point).
const C=String.fromCharCode,codes=(...points)=>points.map(point=>String.fromCodePoint(point)).join('');
// Devanagari "bhandar" (store): BHA U+092D, sign anusvara U+0902 (Mn), DDA U+0921, vowel sign AA U+093E (Mc), RA U+0930.
const BHANDAR=codes(0x92D,0x902,0x921,0x93E,0x930);
// Devanagari "prabandhan" (management): PA U+092A, virama U+094D (Mn), RA U+0930, BA U+092C, anusvara U+0902, DHA U+0927,
// NA U+0928.
const PRABANDHAN=codes(0x92A,0x94D,0x930,0x92C,0x902,0x927,0x928);
// Thai "khlang" (warehouse): KHO KHWAI U+0E04, LO LING U+0E25, MAI HAN-AKAT U+0E31 (Mn), NGO NGU U+0E07.
// Thai "khlik" (click): KHO KHWAI U+0E04, LO LING U+0E25, SARA I U+0E34 (Mn), KO KAI U+0E01.
const KHLANG=codes(0xE04,0xE25,0xE31,0xE07),KHLIK=codes(0xE04,0xE25,0xE34,0xE01);

test('(b) round 3: combining marks stay inside name words (Devanagari, Thai, Latin)',()=>{
 // NFKC has no precomposed form for any of these, so the marks are still there when the words are cut.
 for(const word of [BHANDAR,PRABANDHAN,KHLANG,KHLIK])assert.equal(word.normalize('NFKC'),word);
 // Devanagari: the whole word is one name word: identical names = 1.
 // Round 2: the marks cut it into BHA | DDA | RA, three single letters, all dropped: no comparable word, score null.
 assert.deepEqual(textEvidence(BHANDAR,BHANDAR),{score:1,shared:[BHANDAR],unionCount:1,targetOnly:[],peerOnly:[]}); // round 2: score null, unionCount 0
 assert.equal(textOverlap(BHANDAR,BHANDAR),1);                                                                        // round 2: null
 // bhandar, prabandhan vs bhandar = 1 shared of 2.
 // Round 2: prabandhan became PA | RA+BA | DHA+NA (PA dropped), so the target kept two fragments while the peer kept
 // nothing: null.
 assert.deepEqual(textEvidence(BHANDAR+' '+PRABANDHAN,BHANDAR),{score:1/2,shared:[BHANDAR],unionCount:2,targetOnly:[PRABANDHAN],peerOnly:[]}); // round 2: score null
 // Thai: khlang is one word: identical names = 1 on the shared word khlang. Round 2 also gave 1, but on the fragment
 // KHO KHWAI + LO LING (NGO NGU after the mark was a dropped single letter).
 assert.deepEqual(textEvidence(KHLANG,KHLANG),{score:1,shared:[KHLANG],unionCount:1,targetOnly:[],peerOnly:[]}); // round 2: shared [KHO KHWAI + LO LING]
 // khlang (warehouse) vs khlik (click) share no word: 0. Round 2 cut both down to the same fragment KHO KHWAI + LO LING
 // (the final NGO NGU and KO KAI were dropped as single letters), so the two different words matched: 1.
 assert.deepEqual(textEvidence(KHLANG,KHLIK),{score:0,shared:[],unionCount:2,targetOnly:[KHLANG],peerOnly:[KHLIK]}); // round 2: score 1
 // Latin: X + combining macron U+0304 has no precomposed form, so "X(macron)ray" stays decomposed after NFKC and is one
 // word: yard, x(macron)ray vs yard, ray = 1 of 3. Round 2 cut it into the single letter X (dropped) and the unrelated
 // word "ray": yard, ray on both sides = 1.
 const XRAY='X'+C(0x304)+'ray';
 assert.equal(XRAY.normalize('NFKC'),XRAY);
 assert.deepEqual(textEvidence('Yard '+XRAY,'Yard Ray'),{score:1/3,shared:['yard'],unionCount:3,targetOnly:['x'+C(0x304)+'ray'],peerOnly:['ray']}); // round 2: score 1
});

test('(b) round 3: descriptions keep whole words with their combining marks',()=>{
 // Descriptions keep single characters, so round 2 kept every fragment instead of dropping the single letters.
 // bhandar, prabandhan vs bhandar = 1 of 2. Round 2: BHA, DDA, RA, PA, RA+BA, DHA+NA vs BHA, DDA, RA = 3 shared of 6.
 assert.deepEqual(textEvidence(BHANDAR+' '+PRABANDHAN,BHANDAR,{description:true}),{score:1/2,shared:[BHANDAR],unionCount:2,targetOnly:[PRABANDHAN],peerOnly:[]}); // round 2: shared [BHA, DDA, RA], unionCount 6
 // khlang vs khlik = 0. Round 2: KHO KHWAI + LO LING shared, NGO NGU and KO KAI kept as single characters: 1 of 3.
 assert.equal(textEvidence(KHLANG,KHLIK,{description:true}).score,0);                    // round 2: 1/3
 // yard, x(macron)ray vs yard, ray = 1 of 3. Round 2: yard, x, ray vs yard, ray = 2 of 3.
 assert.equal(textEvidence('Yard X'+C(0x304)+'ray','Yard Ray',{description:true}).score,1/3); // round 2: 2/3
 // q + combining dot above U+0307 has no precomposed form: the description word is q with its dot, not a bare q.
 const QDOT='q'+C(0x307);
 assert.equal(QDOT.normalize('NFKC'),QDOT);
 assert.deepEqual(textEvidence('Yard '+QDOT,'Yard '+QDOT,{description:true}).shared,['yard',QDOT]); // round 2: ['yard', 'q']
 assert.equal(textEvidence('Yard '+QDOT,'Yard q',{description:true}).score,1/3);         // round 2: 1 (both were yard, q)
});

test('(b) round 3: a single letter followed only by combining marks is not a name word',()=>{
 const DOTTED_I=C(0x130),QDOT='q'+C(0x307);
 // Capital I with dot above (U+0130) is one code point, but lower-cases to i + combining dot above U+0307: a letter and
 // a mark. Round 2 tested for exactly one letter code point after lower-casing, so this two-code-point "i" stayed a name
 // word: yard, i(dot) vs yard = 1 of 2.
 assert.equal(DOTTED_I.toLowerCase(),'i'+C(0x307));
 assert.deepEqual(textEvidence('Yard '+DOTTED_I,'Yard'),{score:1,shared:['yard'],unionCount:1,targetOnly:[],peerOnly:[]}); // round 2: score 1/2
 // The decomposed spelling I + U+0307 composes to U+0130 under NFKC and is dropped the same way.
 assert.equal(('I'+C(0x307)).normalize('NFKC'),DOTTED_I);
 assert.equal(textOverlap('Yard I'+C(0x307),'Yard'),1);                                   // round 2: 1/2
 // More than one mark: U+0130 + combining acute U+0301 lower-cases to i, U+0307, U+0301 (a letter and two marks): dropped.
 // Round 2 cut the acute off and kept i(dot): 1 of 2.
 assert.equal(textOverlap('Yard '+DOTTED_I+C(0x301),'Yard'),1);                          // round 2: 1/2
 // A name that is only such a letter has no comparable word: null, not 0.
 assert.equal(textEvidence(DOTTED_I,'Yard Tool').score,null);                            // round 2: 0 (i(dot) vs yard, tool)
 // Unchanged (same in round 2, which cut the mark off and dropped the bare q): q + U+0307 is not a name word.
 assert.equal(textOverlap('Yard '+QDOT,'Yard'),1);
 // Unchanged: descriptions keep the dotted i as a word: yard, i(dot) vs yard = 1 of 2.
 assert.deepEqual(textEvidence('Yard '+DOTTED_I,'Yard',{description:true}).targetOnly,['i'+C(0x307)]);
 // Unchanged: a word starts with a letter or digit, never with a mark: a stray leading acute U+0301 is not part of
 // "yard", so yard vs yard = 1 in names and descriptions.
 assert.equal(textOverlap(C(0x301)+'Yard','Yard'),1);
 assert.equal(textEvidence(C(0x301)+'Yard','Yard',{description:true}).score,1);
});

test('(b) round 3: a Chinese character followed by a mark is still a Chinese name word',()=>{
 // KU = U+5E93 (store). A combining mark after a Chinese character stays inside the word (round 3), and a word that starts
 // with a Chinese character is never a single letter, so it stays a name word. Combining acute U+0301 (Mn) and combining
 // enclosing circle U+20DD (Me) have no precomposed form with KU, so NFKC keeps them. Unchanged by round 4 (these marks
 // are not variation selectors).
 const KU=C(0x5E93),ACUTE=C(0x301),CIRCLE=C(0x20DD);
 for(const mark of [ACUTE,CIRCLE]){
  assert.equal((KU+mark).normalize('NFKC'),KU+mark);
  // Identical names = 1 on the whole word KU + mark (a single Han character with its mark is not dropped).
  assert.deepEqual(textEvidence(KU+mark,KU+mark),{score:1,shared:[KU+mark],unionCount:1,targetOnly:[],peerOnly:[]});
  assert.deepEqual(textEvidence('Yard '+KU+mark,'Dock '+KU+mark).shared,[KU+mark]);
  // The mark is part of the word: yard, KU+mark vs yard, KU = 1 shared of 3.
  assert.deepEqual(textEvidence('Yard '+KU+mark,'Yard '+KU),{score:1/3,shared:['yard'],unionCount:3,targetOnly:[KU+mark],peerOnly:[KU]});
 }
 // Round 4: an ideographic variation selector U+E0100 (VS17, general category Mn) is not such a mark. It only picks a glyph
 // (as in Japanese registered names), and is removed (before NFKC since round 5), so the shared word is the bare KU.
 // Round 3 kept the selector in the word: shared [KU+VS17].
 const VS17=String.fromCodePoint(0xE0100);
 assert.equal((KU+VS17).normalize('NFKC'),KU+VS17);
 assert.deepEqual(textEvidence(KU+VS17,KU+VS17),{score:1,shared:[KU],unionCount:1,targetOnly:[],peerOnly:[]}); // round 3: shared [KU+VS17]
 assert.deepEqual(textEvidence('Yard '+KU+VS17,'Dock '+KU+VS17).shared,[KU]);           // round 3: [KU+VS17]
});

test('(b) round 4: a variation selector never makes a different name word',()=>{
 // Round 4 (2026-10-19) removes every variation selector (\p{Variation_Selector}); round 5 moved the removal before
 // NFKC (see the round 5 tests below). NFKC itself keeps them, so the removal step is what makes a character with a
 // selector the same word as the character without one.
 // "round 3" gives the value when the selector stayed inside the word as a mark (category Mn).
 const KU=C(0x5E93),VS1=C(0xFE00),VS16=C(0xFE0F),VS17=String.fromCodePoint(0xE0100),KEYCAP=C(0x20E3);
 for(const selector of [VS1,VS17]){
  // VS1 (U+FE00, standardized variation sequence) and VS17 (U+E0100, ideographic variation sequence, two UTF-16 units).
  assert.equal((KU+selector).normalize('NFKC'),KU+selector);                            // premise (same in round 3)
  // yard, KU on both sides = 1. Round 3: yard, KU+selector vs yard, KU = 1 shared of 3.
  assert.deepEqual(textEvidence('Yard '+KU+selector,'Yard '+KU),{score:1,shared:['yard',KU],unionCount:2,targetOnly:[],peerOnly:[]}); // round 3: score 1/3
  assert.equal(textOverlap('Yard '+KU+selector,'Yard '+KU),1);                          // round 3: 1/3
  // A name that is only the character: KU vs KU = 1. Round 3: KU+selector vs KU, nothing shared = 0.
  assert.equal(textOverlap(KU+selector,KU),1);                                          // round 3: 0
  // Descriptions use the same word rule: yard, KU = 1. Round 3: 1 of 3.
  assert.equal(textEvidence('Yard '+KU+selector,'Yard '+KU,{description:true}).score,1); // round 3: 1/3
 }
 // Two different selectors on the same character are the same word: KU = KU (round 3: KU+VS1 vs KU+VS17 = 0 of 2).
 assert.equal(textOverlap(KU+VS1,KU+VS17),1);                                           // round 3: 0
 // A selector inside a Latin word neither splits nor changes it: "Ya(VS16)rd" is yard = 1 (round 3: one word with the
 // selector inside, 0 of 2).
 assert.equal(textOverlap('Ya'+VS16+'rd','Yard'),1);                                    // round 3: 0
 // Keycap one: digit 1, emoji presentation selector VS16 (U+FE0F), combining enclosing keycap U+20E3 (category Me).
 // NFKC keeps all three. The selector is removed; the keycap is a mark, and marks stay inside words (round 3), so the
 // word is 1 + U+20E3. A digit with a mark is not a single letter, so it is a name word.
 const keycap='1'+VS16+KEYCAP;
 assert.equal(keycap.normalize('NFKC'),keycap);                                          // premise
 assert.ok(/^\p{Me}$/u.test(KEYCAP)&&/^\p{Variation_Selector}$/u.test(VS16));           // premise
 // So it equals the keycap written without the selector. Round 3: 1+VS16+U+20E3 vs 1+U+20E3, 0 of 2.
 assert.deepEqual(textEvidence(keycap,'1'+KEYCAP),{score:1,shared:['1'+KEYCAP],unionCount:1,targetOnly:[],peerOnly:[]}); // round 3: score 0
 assert.equal(textOverlap('Line '+keycap,'Line 1'+KEYCAP),1);                           // round 3: 1/3
 // Unchanged (round 3 too): the keycap is not the plain digit 1, because the enclosing mark stays in the word:
 // line, 1+U+20E3 vs line, 1 = 1 of 3; and a name that is only the keycap is a comparable word (0 against yard, not null).
 assert.equal(textOverlap('Line '+keycap,'Line 1'),1/3);
 assert.equal(textEvidence(keycap,'Yard').score,0);
 // End to end, default weights, descriptions orchard/tunnel (0): names "Yard KU+VS17" / "Yard KU" score 1, so the pair is
 // confirmed at .1*1 + .2*0 + .3 + .4 = .8. Round 3: name 1/3, confirmed at .1/3 + .7.
 const pair=pairOf(app('A','Yard '+KU+VS17,'orchard'),app('B','Yard '+KU,'tunnel'));
 assert.equal(pair.forward.components[0].score,1);                                     // round 3: 1/3
 assert.equal(pair.status,'confirmed');                                                 // unchanged (round 3: confirmed too)
 close(pair.coverage,.1+.3+.4);                                                         // round 3: .1/3 + .7
 // Guard: the recorded names keep their selectors (only the compared words lose them).
 assert.equal(pair.target.app.Name,'Yard '+KU+VS17);
});

test('(b) round 3: a single caseless letter (category Lo) is not a name word, while a single Chinese character stays',()=>{
 // Gap from the round-3 mutation review (same before round 4). The single-letter rule is "a letter followed only by
 // marks", for every letter category, not only for lower-case letters (names are lower-cased before the rule, so a rule
 // for \p{Ll} alone would still catch X, but would keep caseless letters).
 // Hiragana NO (U+306E) and Hebrew ALEF (U+05D0) are letters of category Lo with no case.
 const NO=C(0x306E),ALEF=C(0x5D0),QAMATS=C(0x5B8),KU=C(0x5E93);
 for(const letter of [NO,ALEF,KU])assert.ok(/^\p{Lo}$/u.test(letter)&&letter.toLowerCase()===letter&&letter.toUpperCase()===letter);
 // yard, NO vs yard: the single NO is dropped, yard vs yard = 1 (kept, it would be 1 of 2).
 assert.deepEqual(textEvidence('Yard '+NO,'Yard'),{score:1,shared:['yard'],unionCount:1,targetOnly:[],peerOnly:[]});
 assert.equal(textOverlap('Yard '+ALEF,'Yard'),1);
 // ALEF + combining QAMATS (U+05B8, Mn) stays decomposed under NFKC (its precomposed form U+FB2F is excluded from
 // composition) and is one letter followed by a mark: dropped too.
 assert.equal((ALEF+QAMATS).normalize('NFKC'),ALEF+QAMATS);
 assert.equal(textOverlap('Yard '+ALEF+QAMATS,'Yard'),1);
 // A name that is only one such letter has no comparable word: null (kept, it would be 0 against yard, tool).
 assert.equal(textEvidence(NO,'Yard Tool').score,null);
 assert.equal(textEvidence(ALEF,'Yard Tool').score,null);
 // Two different single kana, Hiragana NO vs Hiragana KA (U+304B), are both dropped: yard vs yard = 1 (kept, they would
 // make it 1 of 3).
 assert.equal(textOverlap('Yard '+NO,'Yard '+C(0x304B)),1);
 // A single Chinese character is also Lo but stays (round 2 decision): yard, KU vs yard = 1 of 2; KU vs KU = 1.
 assert.deepEqual(textEvidence('Yard '+KU,'Yard'),{score:1/2,shared:['yard'],unionCount:2,targetOnly:[KU],peerOnly:[]});
 assert.equal(textOverlap(KU,KU),1);
 // Two kana are a word: yard, NO+NO vs yard = 1 of 2.
 assert.equal(textOverlap('Yard '+NO+NO,'Yard'),1/2);
 // Descriptions keep single caseless letters: yard, NO vs yard = 1 of 2.
 assert.deepEqual(textEvidence('Yard '+NO,'Yard',{description:true}).targetOnly,[NO]);
});

test('(b) round 3: an enclosing mark (Me) inside a word keeps the word whole',()=>{
 // Gap from the round-3 mutation review (same before round 4). A word continues through every combining mark category
 // (\p{M}: Mn, Mc and Me), so an enclosing mark neither ends nor splits a word.
 // Combining enclosing circle U+20DD and combining enclosing keycap U+20E3 are category Me; NFKC keeps both.
 const CIRCLE=C(0x20DD),KEYCAP=C(0x20E3);
 for(const mark of [CIRCLE,KEYCAP])assert.ok(/^\p{Me}$/u.test(mark));
 assert.equal(('Dock'+CIRCLE+'Yard').normalize('NFKC'),'Dock'+CIRCLE+'Yard');
 // "Dock(circle)Yard" is one word, dock+circle+yard (lower-cased; no camelCase split, since the mark sits between k and Y):
 // nothing shared with dock, yard = 0 of 3 (if the mark ended the word: dock, yard on both sides = 1).
 assert.deepEqual(textEvidence('Dock'+CIRCLE+'Yard','Dock Yard'),{score:0,shared:[],unionCount:3,targetOnly:['dock'+CIRCLE+'yard'],peerOnly:['dock','yard']});
 assert.equal(textEvidence('Dock'+CIRCLE+'Yard','Dock Yard',{description:true}).score,0);
 // The keycap stays on its digit: line, 1+keycap vs line, 1 = 1 of 3 (if the mark were cut off: line, 1 = 1).
 assert.deepEqual(textEvidence('Line 1'+KEYCAP,'Line 1'),{score:1/3,shared:['line'],unionCount:3,targetOnly:['1'+KEYCAP],peerOnly:['1']});
 assert.equal(textOverlap('Line 1'+KEYCAP,'Line 1'+KEYCAP),1);
 // A single letter followed by an enclosing mark is still a single letter in names (dropped): yard = 1 (kept, it would
 // be yard, x+circle vs yard = 1 of 2); descriptions keep it as the word x+circle: yard, x+circle vs yard, x = 1 of 3.
 assert.equal(textOverlap('Yard X'+CIRCLE,'Yard'),1);
 assert.equal(textEvidence('Yard X'+CIRCLE,'Yard',{description:true}).targetOnly[0],'x'+CIRCLE);
 assert.equal(textEvidence('Yard X'+CIRCLE,'Yard X',{description:true}).score,1/3);
});

test('(b) round 3: the bundled names and descriptions contain no combining mark, so their compared words are unchanged',()=>{
 // Data fact (same before round 3): after NFKC, and after lower-casing, no bundled name or description has a character
 // of category M. Round 3 changes only how marks are handled, so no bundled word, score or count changes
 // (588 confirmed, 644 incomplete, 1,253 investigation, 365 excluded, as before round 3).
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
 const marked=data.apps.filter(a=>[a.Name,a.Description].some(text=>/\p{M}/u.test(String(text??'').normalize('NFKC'))||/\p{M}/u.test(String(text??'').normalize('NFKC').toLowerCase())));
 assert.deepEqual(marked.map(a=>a.Name),[]);
 assert.equal(data.apps.length,76);
});

// Round 5 (2026-10-19): variation selectors are removed BEFORE NFKC, for names and descriptions; the name's "(recovered
// ...)" suffix is matched after that removal, and the description URL strip runs after NFKC. "round 4" gives the value
// under the previous order: a name was NFKC-normalized and its suffix removed, then it was NFKC-normalized again and its
// selectors were removed last; a description had its URLs stripped from the raw text, then NFKC, then its selectors removed.
// Each selector below is in \p{Variation_Selector}, has general category Mn (so a selector left in a word would stay inside
// it as a mark) and is kept by NFKC: VS1 U+FE00 and VS16 U+FE0F (standardized variation sequences), VS17 U+E0100
// (ideographic variation sequences; two UTF-16 units) and the Mongolian free variation selectors FVS1-FVS3 U+180B-U+180D
// and FVS4 U+180F (added in Unicode 14).
const SELECTORS=[['VS1',0xFE00],['VS16',0xFE0F],['VS17',0xE0100],['FVS1',0x180B],['FVS2',0x180C],['FVS3',0x180D],['FVS4',0x180F]].map(([label,point])=>[label,String.fromCodePoint(point)]);

test('(b) round 5: the selectors used below are variation selectors that NFKC keeps',()=>{
 for(const [label,selector] of SELECTORS){
  assert.ok(/^\p{Variation_Selector}$/u.test(selector),label);
  assert.ok(/^\p{Mn}$/u.test(selector),label);
  assert.equal(selector.normalize('NFKC'),selector,label);
 }
});

test('(b) round 5: a selector between a letter and its combining mark no longer stops them composing',()=>{
 // NFKC composes e + combining acute U+0301 into U+00E9 (e-acute), and a Hangul leading consonant + vowel into one
 // syllable, only when no character of combining class 0 stands between them. A selector has class 0, so NFKC alone leaves
 // e + selector + U+0301 as it is. Round 5 removes the selector first, so the pair composes; round 4 removed it after NFKC,
 // leaving the decomposed e + U+0301, which is a different word from U+00E9.
 const ACUTE=C(0x301),E_ACUTE=C(0xE9);
 assert.equal(('e'+ACUTE).normalize('NFKC'),E_ACUTE);                                     // premise
 for(const [label,selector] of SELECTORS){
  assert.equal(('e'+selector+ACUTE).normalize('NFKC'),'e'+selector+ACUTE,label);         // premise: NFKC alone is blocked
  // Descriptions keep single letters: e + selector + U+0301 and e + U+0301 are both the word U+00E9: 1.
  // Round 4: e + U+0301 vs U+00E9, nothing shared: 0 of 2.
  assert.deepEqual(textEvidence('e'+selector+ACUTE,'e'+ACUTE,{description:true}),{score:1,shared:[E_ACUTE],unionCount:1,targetOnly:[],peerOnly:[]},label); // round 4: score 0
  // Inside a longer word: yard, caf + U+00E9 on both sides = 1. Round 4: yard, cafe + U+0301 vs yard, caf + U+00E9 = 1 of 3.
  assert.equal(textEvidence('Yard Cafe'+selector+ACUTE,'Yard Caf'+E_ACUTE,{description:true}).score,1,label); // round 4: 1/3
  assert.deepEqual(textEvidence('Yard Cafe'+selector+ACUTE,'Yard Caf'+E_ACUTE),{score:1,shared:['yard','caf'+E_ACUTE],unionCount:2,targetOnly:[],peerOnly:[]},label); // round 4: score 1/3
 }
 // Unchanged (round 4 too): without a selector the decomposed spelling already composed: 1.
 assert.equal(textOverlap('Yard Cafe'+ACUTE,'Yard Caf'+E_ACUTE),1);
 // Hangul: the leading consonants KIYEOK U+1100 and NIEUN U+1102 with the vowel A U+1161 compose into the syllables GA
 // U+AC00 and NA U+B098.
 const G=C(0x1100),N=C(0x1102),A=C(0x1161),GA=C(0xAC00),NA=C(0xB098);
 assert.equal((G+A+N+A).normalize('NFKC'),GA+NA);                                           // premise
 for(const [label,selector] of SELECTORS){
  assert.equal((G+selector+A).normalize('NFKC'),G+selector+A,label);                       // premise: NFKC alone is blocked
  // Descriptions: G + selector + A is the syllable GA: 1. Round 4: the two jamo G + A vs GA, nothing shared: 0 of 2.
  assert.deepEqual(textEvidence(G+selector+A,GA,{description:true}),{score:1,shared:[GA],unionCount:1,targetOnly:[],peerOnly:[]},label); // round 4: score 0
  // Names (one syllable alone is a single letter, so the name has two): GA + NA on both sides = 1.
  // Round 4: the one word G + A + NA vs GA + NA: 0 of 2.
  assert.deepEqual(textEvidence(G+selector+A+N+A,GA+NA),{score:1,shared:[GA+NA],unionCount:1,targetOnly:[],peerOnly:[]},label); // round 4: score 0
 }
});

test('(b) round 5: a selector inside the "(recovered ...)" suffix no longer hides it',()=>{
 // The suffix pattern /\(\s*recovered\b[^)]*\)/gi is matched after the selectors are removed. Round 4 matched it on the NFKC
 // text with the selectors still in it, so a selector after the bracket or inside "recovered" broke the match; the selectors
 // were removed later and the suffix's 7 words (recovered, 2025, 12, 19, 10, 03, 06) joined yard, manager: 2 shared of 9.
 const stamp=' 2025-12-19 10:03:06',OPEN=C(0xFF08),CLOSE=C(0xFF09),DOT=C(0x307),D_DOT=C(0x1E0B);
 // Unchanged (round 4 too): "recovere" + d + combining dot above U+0307 reads "recovere" + U+1E0B (NFKC composes d + U+0307
 // into d with dot above), which is not "recovered", so nothing is removed: yard, recovere + U+1E0B, 2025, 12, 19, 10, 03,
 // 06 vs yard = 1 of 8.
 const DOTTED={score:1/8,shared:['yard'],unionCount:8,targetOnly:['recovere'+D_DOT,'2025','12','19','10','03','06'],peerOnly:[]};
 assert.deepEqual(textEvidence('Yard (recovered'+DOT+stamp+')','Yard'),DOTTED);
 for(const [label,selector] of SELECTORS){
  // The suffix is looked for in the text the words come from, so a selector between the d and the dot changes nothing:
  // 1 of 8 again. Round 4 looked for it before the selector was gone: the d stayed uncomposed, "recovered" followed by a
  // mark matched, and the brackets were removed: yard vs yard = 1.
  assert.deepEqual(textEvidence('Yard (recovered'+selector+DOT+stamp+')','Yard'),DOTTED,label);        // round 4: score 1
  // Inside "recovered": yard, manager on both sides = 1.
  assert.deepEqual(textEvidence('Yard Manager (reco'+selector+'vered'+stamp+')','Yard Manager'),{score:1,shared:['yard','manager'],unionCount:2,targetOnly:[],peerOnly:[]},label); // round 4: score 2/9, unionCount 9
  // Right after the opening bracket, where only white space may stand: 1.
  assert.equal(textOverlap('Yard Manager ('+selector+'recovered'+stamp+')','Yard Manager'),1,label);   // round 4: 2/9
  // After the white space allowed inside the bracket: the selector goes first, so the suffix still matches: 1.
  assert.equal(textOverlap('Yard Manager ( '+selector+'recovered'+stamp+')','Yard Manager'),1,label);  // round 4: 2/9
  // After a full-width bracket U+FF08 (NFKC makes it "(" in either order): 1.
  assert.equal(textOverlap('Yard Manager'+OPEN+selector+'recovered'+stamp+CLOSE,'Yard Manager'),1,label); // round 4: 2/9
  // A name that is only such a suffix has no comparable word: null (round 4: 0, its 7 words vs yard, tool).
  assert.equal(textEvidence('(re'+selector+'covered'+stamp+')','Yard Tool').score,null,label);         // round 4: 0
  // The word boundary after "recovered" is judged without the selector: "(recovered + selector + parts)" reads
  // "(recoveredparts)", which is not the suffix, so it stays: yard, recoveredparts vs yard = 1 of 2. Round 4 took the
  // selector as the end of the word "recovered" and removed the brackets as a suffix: yard vs yard = 1.
  assert.equal(textOverlap('Yard (recovered'+selector+'parts)','Yard'),1/2,label);                    // round 4: 1
  // Unchanged (round 4 too): descriptions keep the suffix, without the selector: data, recovered vs data = 1 of 2.
  assert.equal(textEvidence('Data (reco'+selector+'vered)','Data',{description:true}).score,1/2,label);
 }
});

test('(b) round 5: every selector is removed, not only the first',()=>{
 const VS1=C(0xFE00),VS16=C(0xFE0F),VS17=String.fromCodePoint(0xE0100),FVS4=C(0x180F),ACUTE=C(0x301),E_ACUTE=C(0xE9),KU=C(0x5E93);
 // Two selectors in one description word: "Ya(VS16)r(VS1)d" is yard = 1. With only the first removed, VS1 (a mark) would
 // stay inside the word: yar + VS1 + d vs yard = 0 of 2. Same in round 4.
 assert.deepEqual(textEvidence('Ya'+VS16+'r'+VS1+'d','Yard',{description:true}),{score:1,shared:['yard'],unionCount:1,targetOnly:[],peerOnly:[]});
 // The same selector twice: 1 (first only: 0 of 2). Same in round 4.
 assert.equal(textEvidence('Ya'+VS1+'r'+VS1+'d','Yard',{description:true}).score,1);
 // Selectors in two words: yard, KU vs yard, KU = 1 (first only: yard, KU + VS17 vs yard, KU = 1 of 3). Same in round 4.
 assert.equal(textEvidence('Yard'+VS1+' '+KU+VS17,'Yard '+KU,{description:true}).score,1);
 // Two selectors between e and the acute both go before NFKC, so the pair composes: yard, caf + U+00E9 = 1. First only:
 // the second still blocks it, cafe + VS16 + U+0301: 1 of 3; round 4: cafe + U+0301, 1 of 3.
 assert.equal(textEvidence('Yard Cafe'+VS1+VS16+ACUTE,'Yard Caf'+E_ACUTE,{description:true}).score,1); // round 4: 1/3
 // Names: three selectors in one word, "Y(VS1)a(VS16)r(VS17)d", are all removed: yard, tool = 1 (any selector left would
 // stay inside the word: 1 of 3). Same in round 4.
 assert.equal(textOverlap('Y'+VS1+'a'+VS16+'r'+VS17+'d Tool','Yard Tool'),1);
 // Two selectors inside "recovered": the suffix still goes, yard, manager = 1 (one left inside "recovered" would keep the
 // suffix: 2 of 9, as in round 4).
 assert.equal(textOverlap('Yard Manager (re'+VS1+'cov'+FVS4+'ered 2025-12-19 10:03:06)','Yard Manager'),1); // round 4: 2/9
});

test('(b) round 5: selectors are removed before the camelCase split',()=>{
 // "Yard(selector)Tool": with the selector gone, lower-case d meets upper-case T and the camelCase rule splits "YardTool"
 // into yard, tool: 1 against "Yard Tool". If the selector were still between d and T at the split, nothing would split,
 // and removing it afterwards would leave the one word yardtool: 0 of 3. Same in round 4.
 for(const [label,selector] of SELECTORS){
  assert.deepEqual(textEvidence('Yard'+selector+'Tool','Yard Tool'),{score:1,shared:['yard','tool'],unionCount:2,targetOnly:[],peerOnly:[]},label);
  assert.equal(textEvidence('Yard'+selector+'Tool','Yard Tool',{description:true}).score,1,label);
  // Plant code: "Qin(selector)P" splits into qin and the single letter p (not a name word): qin, scanner = 1 against
  // "Qin Scanner" (unsplit: qinp, scanner vs qin, scanner = 1 of 3).
  assert.equal(textOverlap('Qin'+selector+'P Scanner','Qin Scanner'),1,label);
 }
});

test('(b) round 5: the four Mongolian free variation selectors are removed like the others',()=>{
 // Mongolian "mongol": MA U+182E, O U+1823, NGA U+1829, GA U+182D, O U+1823, LA U+182F (all category Lo, no case). A free
 // variation selector after GA only picks one of its written forms. Removed, the word is plain mongol: yard, mongol on
 // both sides = 1. Kept, it would stay inside the word as a mark: yard, mongol + FVS vs yard, mongol = 1 of 3.
 // Same in round 4; the round 5 order for these four is covered by the SELECTORS loops above.
 const MONGOL=codes(0x182E,0x1823,0x1829,0x182D,0x1823,0x182F);
 for(const point of [0x180B,0x180C,0x180D,0x180F]){
  const label='U+'+point.toString(16).toUpperCase(),word=codes(0x182E,0x1823,0x1829,0x182D,point,0x1823,0x182F);
  assert.equal(word.normalize('NFKC'),word,label);                                         // premise: NFKC keeps it
  assert.deepEqual(textEvidence('Yard '+word,'Yard '+MONGOL),{score:1,shared:['yard',MONGOL],unionCount:2,targetOnly:[],peerOnly:[]},label);
  assert.equal(textEvidence('Yard '+word,'Yard '+MONGOL,{description:true}).score,1,label);
  assert.equal(textOverlap(word,MONGOL),1,label);
 }
});

test('(b) round 5 guard: soft hyphen, zero width joiner and zero width space are not removed and still split words',()=>{
 // U+00AD soft hyphen, U+200D zero width joiner and U+200B zero width space are format characters (category Cf), not
 // variation selectors, and NFKC keeps them. Only selectors are removed, so each still ends a word: "yard(X)tool" (lower
 // case, so the camelCase rule cannot split it) is yard, tool: 1 against "yard tool" and 0 of 3 against the one word
 // "yardtool". Removed like a selector, it would read yardtool: 0 of 3 and 1. Same in round 4.
 for(const point of [0xAD,0x200D,0x200B]){
  const x=C(point),label='U+'+point.toString(16).toUpperCase();
  assert.ok(/^\p{Cf}$/u.test(x)&&!/\p{Variation_Selector}/u.test(x),label);                // premise
  assert.equal(('yard'+x+'tool').normalize('NFKC'),'yard'+x+'tool',label);                // premise
  for(const description of [false,true]){
   assert.deepEqual(textEvidence('yard'+x+'tool','yard tool',{description}),{score:1,shared:['yard','tool'],unionCount:2,targetOnly:[],peerOnly:[]},label);
   assert.deepEqual(textEvidence('yard'+x+'tool','yardtool',{description}),{score:0,shared:[],unionCount:3,targetOnly:['yard','tool'],peerOnly:['yardtool']},label);
  }
 }
});

test('(b) round 5: a description URL written with full-width characters is removed',()=>{
 // Descriptions drop URLs (/(?:https?:\/\/|www\.)\S+/gi). Round 5 strips them after NFKC, which turns the full-width
 // forms U+FF01-U+FF5E (ASCII + 0xFEE0: letters, colon, solidus, full stop) into ASCII, so a full-width
 // "https://bosch.com/app" is a URL too: stock vs stock = 1. Round 4 stripped URLs from the raw text, where the full-width
 // spelling does not match; NFKC then made the words https, bosch, com, app: stock and those 4 vs stock = 1 of 5.
 const wide=text=>[...text].map(ch=>C(ch.charCodeAt(0)+0xFEE0)).join('');
 assert.equal(wide('https://bosch.com/app').normalize('NFKC'),'https://bosch.com/app');      // premise
 assert.deepEqual(textEvidence('stock '+wide('https://bosch.com/app'),'stock',{description:true}),{score:1,shared:['stock'],unionCount:1,targetOnly:[],peerOnly:[]}); // round 4: score 1/5, targetOnly https, bosch, com, app
 // Only "www" full-width: stock = 1. Round 4: stock, www, bosch, com vs stock = 1 of 4.
 assert.equal(textEvidence('stock '+wide('www')+'.bosch.com','stock',{description:true}).score,1);  // round 4: 1/4
 // A selector inside the scheme is removed before the strip: "ht(VS1)tps://bosch.com/app" is a URL: 1. Round 4: the
 // selector broke the match on the raw text and was removed later: 1 of 5.
 assert.equal(textEvidence('stock ht'+C(0xFE00)+'tps://bosch.com/app','stock',{description:true}).score,1); // round 4: 1/5
 // Upper-case URLs are stripped too (the pattern ignores case): stock = 1; a case-sensitive strip would keep
 // https, bosch, com, app, www: 1 of 6.
 assert.equal(textEvidence('stock HTTPS://Bosch.com/App WWW.bosch.com','stock',{description:true}).score,1);
 // A bare scheme with no address is not a URL and stays a word: stock, https on both sides = 1 (dropping it would give 1 of 2).
 assert.equal(textEvidence('stock https://','stock https',{description:true}).score,1);
 // Unchanged (round 4 too): names keep URL words, full-width or not: stock, https, bosch, com, app vs stock = 1 of 5.
 assert.equal(textEvidence('stock '+wide('https://bosch.com/app'),'stock').score,1/5);
 assert.equal(textEvidence('stock https://bosch.com/app','stock').score,1/5);
});

test('(b) round 5: NFKC changes no bundled name or description and none holds a selector, so no bundled word changes',()=>{
 // A text that NFKC leaves as it is and that holds no selector reads the same words whether selectors are removed before
 // or after NFKC and whether URLs are stripped before or after it.
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
 assert.deepEqual(data.apps.filter(a=>[a.Name,a.Description].some(text=>{const s=String(text??'');return s.normalize('NFKC')!==s||/\p{Variation_Selector}/u.test(s);})).map(a=>a.Name),[]);
 // Four bundled descriptions hold a URL; none of their compared words is a URL scheme.
 const linked=data.apps.filter(a=>/(?:https?:\/\/|www\.)\S/i.test(String(a.Description??'')));
 assert.deepEqual(linked.map(a=>a.Name).sort(),['Iris','RBCC E-Queue system(Karis)','RBCC I4.0 Visualization (Davis)','RBCW E-Queue system']);
 for(const a of linked)assert.ok(!textEvidence(a.Description,a.Description,{description:true}).shared.some(word=>/^(?:https?|www)$/.test(word)),a.Name);
});

test('(b) full-width and compatibility characters are normalized (NFKC) before the single-letter rule',()=>{
 const wide=text=>[...text].map(ch=>ch===' '?String.fromCharCode(0x3000):String.fromCharCode(ch.charCodeAt(0)+0xFEE0)).join('');
 // Full-width "QinP Scanner" (ideographic space) normalizes to "QinP Scanner": qin, scanner vs wx, scanner = 1 of 3
 // (was qin, p, scanner vs wx, p, scanner = 2 of 4).
 assert.deepEqual(textEvidence(wide('QinP Scanner'),'WxP Scanner'),{score:1/3,shared:['scanner'],unionCount:3,targetOnly:['qin'],peerOnly:['wx']});
 // A full-width single letter is still a single letter: "AGR (full-width W)/ Camera" = agr, camera (was 2 of 3).
 assert.equal(textOverlap('AGR '+wide('W')+'/ Camera','AGR Camera'),1);
 // Circled digit one (U+2460) normalizes to "1", a single digit, which stays a word in round 2:
 // dock, 1 vs dock = 1 of 2 (same as before the decision; round 1 dropped the 1: dock vs dock = 1).
 assert.equal(textOverlap('Dock '+String.fromCharCode(0x2460),'Dock'),1/2);            // round 1: 1
 // Unchanged: Roman numeral four (U+2163) is one code point but normalizes to "IV", two characters, so it stays.
 assert.equal(textOverlap('Gate '+String.fromCharCode(0x2163),'Gate IV'),1);
 assert.equal(textOverlap('Gate '+String.fromCharCode(0x2163),'Gate'),1/2);
});

test('(b) a name made only of single letters or only of the suffix has no comparable words',()=>{
 assert.equal(textEvidence('X','Yard Tool').score,null);                                // was 0
 assert.equal(textEvidence('A B C','Yard Tool').score,null);                            // was 0
 assert.equal(textEvidence('(recovered 2025-12-19 10:03:06)','Yard Tool').score,null);  // was 0
 for(const Name of ['X','(recovered 2025-12-19 10:03:06)']){
  // Default weights, identical descriptions (1): the weighted name is unknown, so neither direction is complete.
  // Known points .2*1 + .3 + .4 = .9, missing weight .1 (was confirmed at .9 with name 0).
  const pair=pairOf(app('A',Name,'warehouse stock'),app('B','Yard Tool','warehouse stock'));
  assert.equal(pair.forward.components[0].score,null,Name);
  assert.equal(pair.forward.coverage,null);
  close(pair.forward.knownPoints,.2+.3+.4);
  close(pair.forward.missingWeight,.1);
  assert.equal(pair.zeroText,false);
  assert.equal(pair.status,'incomplete');
  // The name is recorded, so this is "Needs confirmation", not "Data missing".
  assert.deepEqual(missingPairEvidence(pair),[{kind:'Needs confirmation',label:'Name',reason:'Name contains no comparable words.'}]);
  assert.equal(pairResultLabel(pair),'Needs confirmation');
  assert.equal(pairStatusReason(pair),'Name contains no comparable words.');
  // An unknown name is not a zero score: with zero description overlap the gate still does not apply
  // (was investigation with name 0 and description 0).
  const zeroDescription=pairOf(app('A',Name,'orchard'),app('B','Yard Tool','tunnel'));
  assert.equal(zeroDescription.zeroText,false);
  assert.equal(zeroDescription.status,'incomplete');
  assert.equal(pairResultLabel(zeroDescription),'Needs confirmation');
  // Unchanged: with name weight 0 the name is not needed: (.2*1 + .3 + .4)/.9 = 1, confirmed.
  const unweighted=pairOf(app('A',Name,'warehouse stock'),app('B','Yard Tool','warehouse stock'),W(0,.2));
  assert.equal(unweighted.status,'confirmed');close(unweighted.coverage,1);
  // With both text weights 0 a pair of such names is confirmed on codes alone: (.3 + .4)/.7 = 1 (was investigation).
  const codesOnly=pairOf(app('A',Name,'orchard'),app('B','Y','tunnel'),W(0,0));
  assert.equal(codesOnly.status,'confirmed');close(codesOnly.coverage,1);
 }
});

test('(b) source names stay exactly as recorded after buildModel and comparison',()=>{
 const names=['QinP Scanner (recovered 2025-12-19 10:03:06)','WxP Scanner'];
 const data={apps:[app('A',names[0],'orchard'),app('B',names[1],'tunnel')],capabilityRows,processRows},before=JSON.stringify(data);
 const model=buildModel(data),pair=createWeightedSimilarity(model).pair('A','B'),name=pair.forward.components[0];
 // Compared words qin, scanner vs wx, scanner = 1 of 3 (was qin, p, scanner + 7 suffix words vs wx, p, scanner = 2 of 11).
 assert.equal(name.score,1/3);
 assert.deepEqual(name.text.shared,['scanner']);
 assert.deepEqual(name.text.targetOnly,['qin']);
 // Unchanged: the records keep their full names.
 assert.deepEqual(model.apps.map(a=>a.Name),names);
 assert.equal(pair.target.app.Name,names[0]);assert.equal(pair.peer.app.Name,names[1]);
 assert.equal(JSON.stringify(data),before);
 // Round 2: the NFKC step is for comparison only. A full-width suffix (U+FF08 ... U+FF09) is removed from the compared
 // words, but the recorded name keeps its full-width brackets.
 const wideNames=['QinP Scanner'+String.fromCharCode(0xFF08)+'recovered 2025-12-19 10:03:06'+String.fromCharCode(0xFF09),'WxP Scanner'];
 const wideData={apps:[app('A',wideNames[0],'orchard'),app('B',wideNames[1],'tunnel')],capabilityRows,processRows},wideBefore=JSON.stringify(wideData);
 const wideModel=buildModel(wideData),widePair=createWeightedSimilarity(wideModel).pair('A','B'),wideName=widePair.forward.components[0];
 // qin, scanner vs wx, scanner = 1 of 3 (round 1: qin, scanner + recovered, 2025, 12, 19, 10, 03, 06 vs wx, scanner
 // = 1 of 10).
 assert.equal(wideName.score,1/3);                                                      // round 1: 1/10
 assert.deepEqual(wideName.text.targetOnly,['qin']);                                    // round 1: qin + 7 suffix words
 assert.deepEqual(wideModel.apps.map(a=>a.Name),wideNames);
 assert.equal(widePair.target.app.Name,wideNames[0]);
 assert.equal(JSON.stringify(wideData),wideBefore);
});

test('(b) bundled data: recovered names and plant-code names compare on their real words',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url))),before=JSON.stringify(data);
 const model=buildModel(data),index=createWeightedSimilarity(model);
 const find=name=>{const found=model.apps.find(a=>a.Name===name);assert.ok(found,name);return found;};
 const pairFor=(a,b)=>index.pair(find(a).id,find(b).id);
 const nameScore=(a,b)=>pairFor(a,b).forward.components.find(c=>c.key==='name').score;
 // datahub vs rmm, system = 0 (was recovered, 2025, 12, 19, 10, 03 shared: 6 of 11).
 assert.equal(nameScore('Datahub (recovered 2025-12-19 10:03:06)','RMM System (recovered 2025-12-19 10:03:58)'),0);
 // scrap, management, system vs rbcd, lom, scrap, management, platform = 2 of 6 (was 2 of 13).
 assert.equal(nameScore('Scrap Management System (recovered 2025-11-19 08:20:28)','RBCD LOM Scrap Management Platform'),2/6);
 // The trailing Q is a single letter: cgqb, logistic, system on both sides = 1 (was 3 of 4).
 assert.equal(nameScore('CGQB_Logistic_system','CGQB_Logistic_system_Q'),1);
 // shz, karis vs qin, fg, smart, label, management = 0 (was the split p: 1 of 8).
 assert.equal(nameScore('ShzP_Karis','QinP FG Smart Label Management'),0);
 // BMLP_Nexeed_IAS@WxP -> bmlp, nexeed, ias, wx vs qin, fg, smart, label, management: 0 (was the split p: 1 of 10).
 // Descriptions share no word: bmlp, nexeed, ias, application, used, plant, wx, p vs obtain, real, time, data, sap,
 // sources, visualize, after, label, validation. So the pair is held back (was confirmed).
 const bmlp=pairFor('BMLP_Nexeed_IAS@WxP','QinP FG Smart Label Management');
 assert.deepEqual(bmlp.forward.components.slice(0,2).map(c=>c.score),[0,0]);
 assert.equal(bmlp.zeroText,true);
 assert.equal(bmlp.status,'investigation');
 assert.equal(bmlp.coverage,null);
 // Its codes are complete in both directions and both record B.06.3 Transport Management: Review needed.
 assert.equal(bmlp.forward.missingWeight,0);assert.equal(bmlp.reverse.missingWeight,0);
 assert.deepEqual(missingPairEvidence(bmlp),[]);
 assert.equal(pairResultLabel(bmlp),'Review needed');
 // Round 2: the 0 of "I4.0" is a single digit and stays a word: rbcc, i4, 0, visualization, davis.
 const i40='RBCC I4.0 Visualization (Davis)';
 assert.deepEqual(textEvidence(i40,i40).shared,['rbcc','i4','0','visualization','davis']); // round 1: without '0'
 // vs "ShzP_DAVIS" -> shz, davis (the split p is a single letter): davis shared of 6 distinct words.
 assert.equal(nameScore(i40,'ShzP_DAVIS'),1/6);                                         // round 1: 1/5
 // Unchanged data fact behind that: after NFKC and the camelCase split, the only bundled name with a standalone
 // single digit is "RBCC I4.0 ..."; no bundled name has a Han character, and no "(recovered" suffix is written with
 // full-width brackets or spaces after the bracket. So round 2 changes the compared words of that one name only.
 const standaloneDigit=/(?:^|[^\p{L}\p{N}])\p{N}(?![\p{L}\p{N}])/u;
 assert.deepEqual(model.apps.filter(a=>standaloneDigit.test(a.Name.normalize('NFKC'))).map(a=>a.Name),[i40]);
 assert.deepEqual(model.apps.filter(a=>/\p{Script=Han}/u.test(a.Name)).map(a=>a.Name),[]);
 assert.deepEqual(model.apps.filter(a=>/recovered/i.test(a.Name.normalize('NFKC'))&&!/\(recovered /.test(a.Name)).map(a=>a.Name),[]);
 // Unchanged: every bundled name still has at least one comparable word, and the four suffixed names stay as recorded.
 assert.deepEqual(model.apps.filter(a=>textOverlap(a.Name,a.Name)!==1).map(a=>a.Name),[]);
 assert.deepEqual(model.apps.filter(a=>/\(recovered /.test(a.Name)).map(a=>a.Name),['Datahub (recovered 2025-12-19 10:03:06)','RMM System (recovered 2025-12-19 10:03:58)','Scrap Management System (recovered 2025-11-19 08:20:28)','Wuj HK AGV (recovered 2025-06-26 03:31:37)']);
 assert.equal(JSON.stringify(data),before);
});

// Minimal CSV reader for the weighted export (quoted fields, CRLF rows, leading byte-order mark).
function parseCSV(text){
 const s=text.charCodeAt(0)===0xFEFF?text.slice(1):text,rows=[[]];let field='',quoted=false;
 for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(quoted){if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;continue;}
  if(ch==='"')quoted=true;
  else if(ch===','){rows.at(-1).push(field);field='';}
  else if(ch==='\n'){rows.at(-1).push(field);field='';rows.push([]);}
  else if(ch!=='\r')field+=ch;
 }
 rows.at(-1).push(field);return rows;
}

test('CSV column "Zero overlap in all weighted name/description fields" prints the zero-text gate',()=>{
 // Round 2 renamed the column (round 1: "Zero name and description overlap", which misread once a text weight is 0);
 // its value is the gate pair.zeroText: Yes exactly when every name/description field with weight above 0 scores 0.
 const data={apps:[],capabilityRows,processRows,source:'fixture',taxonomySource:'fixture'};
 const COLUMN='Zero overlap in all weighted name/description fields';
 const cases=[
  // Name weight 0 with identical names (score 1), description weighted and orchard/tunnel = 0: the only weighted text
  // field scores 0, so the gate applies: Yes (even though the names do share words).
  ['name weight 0, shared name, zero description',pairOf(...NAME_SHARED(),W(0,.2)),'Yes',true],
  // Name and description weights 0 (alpha/beta and orchard/tunnel both 0): no weighted text field, so no gate: No.
  ['both text weights 0',pairOf(...ZERO_BOTH(),W(0,0)),'No',false],
  // Default weights: name 0 and description 0, both weighted: Yes; a shared name (1) lifts the gate: No.
  ['default weights, no shared words',pairOf(...ZERO_BOTH()),'Yes',true],
  ['default weights, shared name',pairOf(...NAME_SHARED()),'No',false],
 ];
 for(const [label,pair,expected,gate] of cases){
  assert.equal(pair.zeroText,gate,label);
  const [headers,row]=parseCSV(similarityCSV([pair],'weighted',data));
  assert.equal(row.length,headers.length,label);
  assert.equal(headers.includes('Zero name and description overlap'),false,label);    // round 1: true (old header)
  const column=headers.indexOf(COLUMN);
  assert.ok(column>=0,label);                                                          // round 1: -1
  // It sits right after the Review needed code evidence column, as the old column did.
  assert.equal(headers[column-1],'Review needed code evidence (out of 100)',label);    // round 1: column -1
  assert.equal(row[column],expected,label);                                            // round 1: undefined
 }
 // The Method text describes the round 2 name rule (U+2026 is the ellipsis).
 const [headers,row]=parseCSV(similarityCSV([cases[0][1]],'weighted',data));
 const method=row[headers.indexOf('Method')];
 assert.ok(method.includes('names ignore single letters and the "(recovered '+String.fromCharCode(0x2026)+')" suffix'),method); // round 1: single characters
 assert.ok(!method.includes('single characters'),method);                              // round 1: present
});

test('CSV gate column on Out of scope rows reports the weighted text overlap, not the status',()=>{
 // Gap from the round-2 mutation review (same before round 3). An application marked "no score, not an application" puts
 // the pair out of scope before the gate is applied (status excluded), but pair.zeroText is still computed from the
 // weighted name/description fields, and the column prints it: Yes exactly when every weighted text field scores 0.
 const data={apps:[],capabilityRows,processRows,source:'fixture',taxonomySource:'fixture'};
 const COLUMN='Zero overlap in all weighted name/description fields',OUT={scopeNote:'no score, not an application'};
 const cases=[
  // alpha/beta 0 and orchard/tunnel 0, both weighted: true -> Yes (the row is still Out of scope).
  ['no shared words',pairOf(app('A','Alpha','orchard',OUT),app('B','Beta','tunnel')),true,'Yes'],
  // Description weight 0: only name alpha/beta (0) counts, the identical descriptions do not: true -> Yes.
  ['description weight 0',pairOf(app('A','Alpha','warehouse stock',OUT),app('B','Beta','warehouse stock'),W(.1,0)),true,'Yes'],
  // Shared name "Yard Tool" (1): false -> No.
  ['shared name',pairOf(app('A','Yard Tool','orchard',OUT),app('B','Yard Tool','tunnel')),false,'No'],
  // Both text weights 0: no weighted text field, so no gate: false -> No.
  ['both text weights 0',pairOf(app('A','Alpha','orchard',OUT),app('B','Beta','tunnel'),W(0,0)),false,'No'],
 ];
 for(const [label,pair,gate,expected] of cases){
  assert.equal(pair.status,'excluded',label);
  assert.equal(pair.zeroText,gate,label);
  assert.equal(pair.coverage,null,label);
  const [headers,row]=parseCSV(similarityCSV([pair],'weighted',data)),value=name=>row[headers.indexOf(name)];
  assert.equal(value('Status'),'Out of scope',label);
  // scopeReason gives "Not an application"; U+2013 is the en dash.
  assert.equal(value('Status reason'),'Not in similarity check '+String.fromCharCode(0x2013)+' Not an application',label);
  assert.equal(value('Confirmed pair similarity (out of 100)'),'N/A',label);
  assert.equal(value('Review needed code evidence (out of 100)'),'',label);
  assert.equal(value(COLUMN),expected,label);
 }
 // Documented the same way: the README names the column, says it reports the zero-text gate, and defines the gate by the
 // weighted text fields alone ("every weighted name/description field shares no word"); scope is a separate status, so
 // an Out of scope row can show Yes.
 const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8').replace(/\s+/g,' ');
 assert.ok(readme.includes(`'${COLUMN}' (it reports the zero-text gate`),'README names the column and what it reports');
 assert.ok(readme.includes('when every weighted name/description field shares no word'),'README defines the gate by the weighted text fields');
});

test('bundled data: the gate column says Yes on 204 of the 365 Out of scope rows',()=>{
 // Independent recount over the bundled records (own tokenizer, default weights): the five applications marked
 // "no score, ..." (CngP/MSE-Nbo Supplier SCM, RBAC_ME_Szh5 Intralogistics control system, RBCE Auto Warehouse
 // Management System, VMCN_CONNEX, Wuj HK AGV (recovered ...)) make 5 x 71 + 10 = 365 excluded pairs; every one has
 // comparable names and descriptions on both sides, and 204 of them share no name word and no description word.
 const data=JSON.parse(fs.readFileSync(new URL('../public/data.json',import.meta.url)));
 const model=buildModel(data),index=createWeightedSimilarity(model),apps=model.apps;
 const excluded=[];
 for(let i=0;i<apps.length;i++)for(let j=i+1;j<apps.length;j++){const pair=index.pair(apps[i].id,apps[j].id);if(pair.status==='excluded')excluded.push(pair);}
 assert.equal(excluded.length,365);
 const [headers,...rows]=parseCSV(similarityCSV(excluded,'weighted',{...data,source:'bundled',taxonomySource:'bundled'}));
 const column=headers.indexOf('Zero overlap in all weighted name/description fields'),status=headers.indexOf('Status');
 assert.equal(rows.length,365);
 assert.ok(rows.every(row=>row[status]==='Out of scope'));
 assert.equal(rows.filter(row=>row[column]==='Yes').length,204);
 assert.equal(rows.filter(row=>row[column]==='No').length,161);
 // Among the out-of-scope applications themselves (10 pairs): Yes for the 5 pairs whose names and descriptions share
 // nothing, e.g. VMCN_CONNEX | Wuj HK AGV (recovered ...); No for RBAC_ME_Szh5 Intralogistics control system | RBCE Auto
 // Warehouse Management System (shared name word "system": 1 of 10).
 const byNames=(a,b)=>rows.find(row=>[row[headers.indexOf('Application A')],row[headers.indexOf('Application B')]].sort().join('|')===[a,b].sort().join('|'));
 assert.equal(byNames('VMCN_CONNEX','Wuj HK AGV (recovered 2025-06-26 03:31:37)')[column],'Yes');
 assert.equal(byNames('RBAC_ME_Szh5 Intralogistics control system','RBCE Auto Warehouse Management System')[column],'No');
});

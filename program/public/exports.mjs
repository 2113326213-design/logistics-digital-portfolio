import {componentContribution} from './score-presentation.mjs';
import {english} from './english.mjs';
import {correctionStates} from './corrections.mjs';
import {pairResultLabel,pairStatusReason,codeEvidenceScore} from './pair-status.mjs';
import {scopeReason} from './display.mjs';
import {opportunityEligibility} from './scope.mjs';
import {scorePoints} from './score-values.mjs';
const codeIds=nodes=>[...new Set((nodes||[]).map(node=>node.id))].join('; ');
const levelNames=levels=>(levels||[]).map(level=>'L'+level).join(' / ');
const scopeText=apps=>{const out=apps.map(opportunityEligibility).filter(x=>!x.eligible);return out.length?'Out of scope: '+[...new Set(out.map(x=>x.reason))].join('; '):'In scope';};
const depthHeaders=['Comparison levels','Source target levels','Source peer levels','Depth adjusted','Compared target code IDs','Compared peer code IDs','Deferred target detail code IDs','Deferred peer detail code IDs'];
const deferredIds=nodes=>codeIds((nodes||[]).flatMap(node=>(node.sources||[]).filter(source=>source.level>node.level)));
function depthValues(result){
 return [result?.comparisonLevels?.length?levelNames(result.comparisonLevels):'Not compared',levelNames(result?.target?.levels),levelNames(result?.peer?.levels),result?.depthAdjusted?'Yes':'No',codeIds(result?.comparedTarget),codeIds(result?.comparedPeer),deferredIds(result?.comparedTarget),deferredIds(result?.comparedPeer)];
}
const depthMethod='Capability and Process compare registered codes at the shared lower depth of the related branch. Deeper records are projected to a verified standard ancestor and distinct projected codes are counted once; unrelated branches keep their registered level. Comparison levels list only branches that were scored. Deferred detail does not confirm a match at the deeper level. Unresolved source records or unavailable standard ancestors remain unconfirmed.';
export function similarityCSV(rows,dimension,data,{threshold=50}={}){
 const quote=v=>'"'+String(v??'').replace(/^(\s*[=+@\-\t\r])/u,"'$1").replaceAll('"','""')+'"';
 if(dimension==='weighted'){
  const headers=['Dimension','Unique pair key','Application A ID','Application A','A plant','A GB','Application B ID','Application B','B plant','B GB','Confirmed pair similarity (out of 100)','A to B confirmed (out of 100)','B to A confirmed (out of 100)','Status','Status reason','Review needed code evidence (out of 100)','Zero overlap in all weighted name/description fields','A to B known weighted points (out of 100)','A to B missing weight (%)','B to A known weighted points (out of 100)','B to A missing weight (%)',...['A to B','B to A'].flatMap(direction=>['Name','Description','Business Capability','Process'].flatMap(label=>[direction+' '+label+' weight (%)',direction+' '+label+' score (out of 100)',direction+' '+label+' contribution (points out of 100)',direction+' '+label+' status'])),...['A to B','B to A'].flatMap(direction=>['Business Capability','Process'].flatMap(label=>depthHeaders.map(header=>direction+' '+label+' '+header))),'Method','Inventory source','Taxonomy source'];
  const score=n=>n===null?'N/A':scorePoints(n).toFixed(4);
  // Same explanation as the UI for unscored pairs; confirmed pairs keep the scoring rule.
  const statusReason=r=>r.status==='confirmed'?r.reason:pairStatusReason(r,threshold,scopeReason);
  const components=r=>r.components.flatMap(c=>[(c.weight*100).toFixed(4),score(c.score),c.weight===0?'0':score(c.contribution),c.weight===0?'Excluded':c.reason||'Comparable']);
  const values=rows.map(r=>{
   if(!r.forward||!r.reverse)throw Error('Weighted CSV requires an unordered pair with both directional calculations.');
   return ['Weighted pair similarity',r.key,r.target.app.id,r.target.app.Name,r.target.app.Entity,r.target.app.Division,r.peer.app.id,r.peer.app.Name,r.peer.app.Entity,r.peer.app.Division,r.status==='confirmed'?score(r.coverage):'N/A',score(r.forward.coverage),score(r.reverse.coverage),pairResultLabel(r,threshold),statusReason(r),codeEvidenceScore(r)===null?'':score(codeEvidenceScore(r)),r.zeroText?'Yes':'No',score(r.forward.knownPoints),(r.forward.missingWeight*100).toFixed(4),score(r.reverse.knownPoints),(r.reverse.missingWeight*100).toFixed(4),...components(r.forward),...components(r.reverse),...[r.forward,r.reverse].flatMap(direction=>['cap','process'].flatMap(key=>depthValues(direction.components.find(c=>c.key===key)?.result))),'Directional total = sum of component match × normalized weight. Pair opportunity score = min(A to B, B to A) only when both directions are complete and eligible and, if Name or Description carries weight above zero, at least one of those weighted fields has a shared word; for Review needed pairs, when Capability or Process carries weight, that minimum (capability and process points only) is reported as code evidence, not as a pair score. Incomplete directions show known weighted points and missing weight without normalization. Name and Description use distinct-word Jaccard (names ignore single letters and the "(recovered …)" suffix); Capability and Process use directional code coverage at the stated comparison levels. '+depthMethod,data.source,data.taxonomySource];
  });
  return '\uFEFF'+[headers,...values].map(row=>row.map(quote).join(',')).join('\r\n');
 }
 const ids=nodes=>[...new Set(nodes.map(n=>n.id))].join('; '),corrections=correctionStates(data).filter(c=>c.state==='Applied');
 const mappings=id=>corrections.filter(c=>c.appId===id&&c.dimension===dimension).map(c=>`${c.raw||'(not provided)'} -> ${c.targetId} [${c.reviewer}]`).join('; ');
 // Root-only (B.06 / L0) projections never count as confirmed shared codes.
 const floor=dimension==='cap'?2:1;
 const headers=['Dimension','Coverage scope','Target ID','Target application','Target entity','Target GB','Peer ID','Peer application','Peer entity','Peer GB','Opportunity scope','Target match score (out of 100)','Target depth','Comparable branches','Total branches','Status','Common codes (numerator)','Target codes (denominator)','Confirmed shared code IDs','Confirmed target-only code IDs','Target registered code IDs','Peer registered code IDs',...depthHeaders,'Calculation method','Target applied mappings','Peer applied mappings','Inventory source','Taxonomy source'];
 const values=rows.map(r=>{const scope=scopeText([r.target.app,r.peer.app]);return [dimension==='cap'?'Business Capability':'Process',dimension==='cap'?'B.06 codes at shared comparison depth':'Process codes at shared comparison depth',r.target.app.id,r.target.app.Name,r.target.app.Entity,r.target.app.Division,r.peer.app.id,r.peer.app.Name,r.peer.app.Entity,r.peer.app.Division,scope,r.coverage===null?'N/A':scorePoints(r.coverage).toFixed(4),r.target.levels.map(l=>'L'+l).join(' / '),r.comparableBranches,r.branches.length,scope!=='In scope'?'Out of scope':r.coverage===null?english(r.reason):'Comparable',r.coverage===null?'':r.commonCount,r.coverage===null?'':r.targetCount,ids(r.branches.flatMap(b=>b.common).filter(n=>n.level>=floor)),ids(r.branches.filter(b=>b.coverage!==null).flatMap(b=>b.onlyTarget)),ids(r.target.known),ids(r.peer.known),...depthValues(r),'Shared compared codes / distinct target codes at the stated comparison levels. '+depthMethod,mappings(r.target.app.id),mappings(r.peer.app.id),data.source,data.taxonomySource];});
 headers.push('Applied component weight (%)','Weighted contribution (points out of 100)','Weight status');
 rows.forEach((r,i)=>{const c=componentContribution(r.coverage,dimension,data.similarityWeights);values[i].push((c.weight*100).toFixed(4),c.contribution===null?'N/A':(c.contribution*100).toFixed(4),c.excluded?'Excluded':'Included');});
 return '\uFEFF'+[headers,...values].map(row=>row.map(quote).join(',')).join('\r\n');
}

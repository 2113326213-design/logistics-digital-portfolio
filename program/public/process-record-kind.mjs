import {norm} from './codes.mjs';

// A process record without a level, shown for what it is (V21, owner 2026-11-12: "让别人一眼就能看出是什么问题", then
// "详细的对比展示", plan A + B). The tool reads a process's level from its name: standard records are written
// "BBM PM <chain> <name> L0–L3" (or carry an M. or ETAS code). A record written another way — an old or plant-made name
// such as "BBM_P2S_LE_01 Production Replenishment" or "RBCC | Warehouse Delivery" — is not in the standard form: no
// level, not in the standard list, so the tool cannot place it. A record in the standard form that only lacks the level
// keeps "Process level not specified".
// A: the name is split into prefix, process chain, name and level and shown part by part next to a standard record of
//    the same application (Issues to review). B: every such record of the Overview's plants, with what is wrong and what
//    to change, in one list that exports for the plants. Issues to review, Data checks, the To review export and the
//    Similarity notes use the same label and words.
export const NOT_STANDARD_LABEL='Process name not in the standard form';
export const NO_LEVEL_LABEL='Process level not specified';
export const NO_LEVEL_TEXT='No process level (L0–L3) recorded.';
const STANDARD_FORM=/^\s*(?:BBM\s+PM\s+[A-Z0-9]+\s|M\.[A-Z0-9]+\.|ETAS\.)/i;
const LEVEL=/\s+(L[0-3])V?\s*$/i;
const NEXT_REPLACE='In LeanIX, replace it with a standard process (written "BBM PM <chain> <name> L1", "L2" or "L3"), or remove it if another process already covers it.';
// Used when an application has no standard record to compare with.
export const STANDARD_EXAMPLE='BBM PM I2D Request Packaging Kit L3';

const chainCount=model=>[...(model?.procs?.values?.()||[])].filter(n=>n.level===0).length;
const isChain=(model,chain)=>!!chain&&model?.procs?.get(`M.${chain}`)?.level===0;
// The standard processes with this name (normalised), in the chain when one is given.
const standardNamed=(model,chain,name)=>[...(model?.procs?.values?.()||[])].filter(n=>!n.ambiguous&&Number.isInteger(n.level)&&(!chain||String(n.id).startsWith(`M.${chain}.`)||n.id===`M.${chain}`)&&norm(n.label)===norm(name));

// The four parts of a recorded process name; a part that is not there is ''.
export function processNameParts(raw){
 const text=String(raw??'').trim();
 const standard=text.match(/^(BBM\s+PM)\s+([A-Z0-9]+)\s+(.+?)$/i);
 if(standard){const level=standard[3].match(LEVEL);return {prefix:'BBM PM',chain:standard[2].toUpperCase(),name:level?standard[3].slice(0,level.index).trim():standard[3].trim(),level:level?level[1].toUpperCase():''};}
 const old=text.match(/^(BBM_)([A-Z0-9]+)_(.*)$/i);
 if(old){const level=old[3].match(LEVEL);return {prefix:'BBM_',chain:old[2].toUpperCase(),name:(level?old[3].slice(0,level.index):old[3]).trim(),level:level?level[1].toUpperCase():''};}
 const level=text.match(LEVEL);
 return {prefix:'',chain:'',name:(level?text.slice(0,level.index):text).trim(),level:level?level[1].toUpperCase():''};
}

// Each part of a recorded name checked against the standard form: state ok, wrong or check, and a short note.
export function checkProcessName(model,raw){
 const parts=processNameParts(raw),chainOk=isChain(model,parts.chain),n=chainCount(model);
 const named=parts.name&&standardNamed(model,chainOk?parts.chain:'',parts.name).length>0;
 return [
  {part:'Prefix',value:parts.prefix,state:parts.prefix==='BBM PM'?'ok':'wrong',note:parts.prefix==='BBM PM'?'':parts.prefix?'should be "BBM PM"':'missing (should be "BBM PM")'},
  {part:'Process chain',value:parts.chain,state:chainOk?'ok':'wrong',note:chainOk?'':parts.chain?`not one of the ${n} standard chains`:'missing'},
  {part:'Process name',value:parts.name,state:named?'ok':'check',note:named?'':'not in the standard list'},
  {part:'Level',value:parts.level,state:parts.level?'ok':'wrong',note:parts.level?'':'no L0–L3 at the end'}
 ];
}

// A standard record of the same application to compare with: one the tool matched by name, Level 3 first.
export function standardExample(model,app){
 const records=(app?.processMatches||[]).filter(m=>m.via!=='code'&&m.via!=='mapping').map(m=>String(m.raw).trim()).filter(raw=>{const p=processNameParts(raw);return p.prefix==='BBM PM'&&p.level&&isChain(model,p.chain);});
 const raw=records.find(r=>processNameParts(r).level==='L3')||records[0];
 return raw?{raw,own:true}:{raw:STANDARD_EXAMPLE,own:false};
}

export function noLevelRecord(model,raw){
 const text=String(raw??'').trim();
 if(!STANDARD_FORM.test(text)){
  const parts=processNameParts(text);
  const chain=parts.prefix==='BBM_'&&parts.chain&&!isChain(model,parts.chain)?` "${parts.chain}" is not one of the standard process chains.`:'';
  return {label:NOT_STANDARD_LABEL,text:`The tool reads the level from the name. This name has no level (L0–L3) and is not in the standard process list, so the tool cannot place it.${chain}`,next:NEXT_REPLACE};
 }
 const written=processNameParts(text);
 if(written.prefix!=='BBM PM')return {label:NO_LEVEL_LABEL,text:NO_LEVEL_TEXT,next:'Confirm which level (L0–L3) this process belongs to.'};
 const nodes=standardNamed(model,written.chain,written.name);
 if(nodes.length===1){
  const [node]=nodes;
  return {label:NO_LEVEL_LABEL,text:`The level (L0–L3) is missing at the end of the name. The name is the standard process ${node.id} (Level ${node.level}).`,
   next:`In LeanIX, choose "BBM PM ${written.chain} ${node.label} L${node.level}".`};
 }
 return {label:NO_LEVEL_LABEL,text:'The level (L0–L3) is missing at the end of the name, and the name is not one standard process.',next:'Confirm which level (L0–L3) this process belongs to.'};
}

// A: the recorded name next to the standard form, part by part (data for renderNameComparison).
export function nameComparison(model,app,raw){
 const example=standardExample(model,app);
 return {recorded:checkProcessName(model,raw),example:{raw:example.raw,own:example.own,parts:processNameParts(example.raw)}};
}
const PART_KEYS=['prefix','chain','name','level'];
export function renderNameComparison(comparison,esc){
 if(!comparison)return '';
 const cell=(value,state,note)=>`<span class="name-part is-${state}" role="cell">${esc(value||'none')}${note?`<small>${esc(note)}</small>`:''}</span>`;
 const head=['Prefix','Process chain','Process name','Level'].map(h=>`<span role="columnheader">${h}</span>`).join('');
 const recorded=comparison.recorded.map(p=>cell(p.value,p.state,p.note)).join('');
 const example=PART_KEYS.map(k=>cell(comparison.example.parts[k],'ok','')).join('');
 return `<div class="name-compare" role="table" aria-label="Recorded name compared with the standard form"><div class="name-compare-row name-compare-head" role="row"><span role="columnheader"></span>${head}</div><div class="name-compare-row" role="row"><span class="name-compare-label" role="rowheader">Recorded in LeanIX</span>${recorded}</div><div class="name-compare-row" role="row"><span class="name-compare-label" role="rowheader">Standard form<small>${comparison.example.own?'a record of this application':'an example'}</small></span>${example}</div></div>`;
}

// B: what is wrong with a name, in one line (the parts that are not right).
export const nameProblems=(model,raw)=>checkProcessName(model,raw).filter(p=>p.state!=='ok').map(p=>`${p.part}${p.value?` "${p.value}"`:''}: ${p.note}`).join(' · ');

import {split,capCode} from './codes.mjs';
const sourceFields=['ID','Name','Division','Entity','Description','Business Capabilities','Processes','Lifecycle: Current Lifecycle'];
export const recordKey=c=>JSON.stringify([String(c.appId).trim(),c.dimension,c.raw]);
const appSnapshot=a=>JSON.stringify(sourceFields.map(k=>String(a[k]??'')));
export function standardTargets(data,dimension){
 const targets=new Map();
 if(dimension==='cap')for(const value of data.capabilityRows.flat()){const id=capCode(value);if(id){const label=String(value);const old=targets.get(id);targets.set(id,{id,label,ambiguous:!!old&&(old.ambiguous||old.label!==label)});}}
 else if(dimension==='process')for(const [chain,level,id,label] of data.processRows){if(!id||!/^L[0-3]$/.test(level))continue;const key=String(id),old=targets.get(key),node={id:key,label:String(label),level,chain:String(chain)};node.ambiguous=!!old&&(old.ambiguous||old.label!==node.label||old.level!==node.level||old.chain!==node.chain);targets.set(key,node);}
 return targets;
}
function targetSnapshot(data,dimension,targetId){
 const targets=standardTargets(data,dimension),target=targets.get(targetId);
 if(!target||target.ambiguous)return null;
 // Bind to exact target and ancestor records, including missing parents and ambiguity.
 return JSON.stringify([...targets.values()].filter(n=>targetId===n.id||targetId.startsWith(n.id+'.')).sort((a,b)=>a.id.localeCompare(b.id)));
}
export function cleanCorrections(value){
 if(!Array.isArray(value))return [];
 return value.filter(c=>c&&typeof c==='object'&&['cap','process'].includes(c.dimension)&&typeof c.id==='string'&&c.id&&typeof c.appId==='string'&&typeof c.raw==='string'&&typeof c.targetId==='string'&&typeof c.appSnapshot==='string'&&typeof c.taxonomySnapshot==='string'&&String(c.reviewer||'').trim()&&String(c.reason||'').trim()).map(c=>Object.fromEntries(['id','appId','dimension','raw','targetId','appSnapshot','taxonomySnapshot','reviewKey','reviewer','reason','createdAt','revokedAt'].map(k=>[k,String(c[k]??'')])));
}
export function correctionStates(data){
 const records=cleanCorrections(data.corrections),active=records.filter(c=>!c.revokedAt),counts=new Map();
 for(const c of active)counts.set(recordKey(c),(counts.get(recordKey(c))||0)+1);
 return records.map(c=>{
  if(c.revokedAt)return {...c,state:'Revoked'};
  const a=data.apps.find(a=>String(a.ID).trim()===c.appId);
  const values=a?split(a[c.dimension==='cap'?'Business Capabilities':'Processes']):[];
  const valid=a&&appSnapshot(a)===c.appSnapshot&&(values.includes(c.raw)||(c.raw===''&&!values.length))&&targetSnapshot(data,c.dimension,c.targetId)===c.taxonomySnapshot&&counts.get(recordKey(c))===1;
  return {...c,state:valid?'Applied':'Needs review'};
 });
}
export function createCorrection(data,{appId,dimension,raw,targetId,reviewer,reason,reviewKey,id=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')}){
 appId=String(appId).trim();
 if(!['cap','process'].includes(dimension))throw Error('Choose a valid dimension.');
 const a=data.apps.find(a=>String(a.ID).trim()===appId),values=a?split(a[dimension==='cap'?'Business Capabilities':'Processes']):[];
 if(!a||(!values.includes(raw)&&!(raw===''&&!values.length)))throw Error('This source record is no longer available.');
 if(!String(reviewer||'').trim()||!String(reason||'').trim())throw Error('Enter a resolution and reviewer before applying a mapping.');
 const snapshot=targetSnapshot(data,dimension,targetId);if(!snapshot)throw Error('Select a unique code from the current taxonomy.');
 if(correctionStates(data).some(c=>c.state!=='Revoked'&&recordKey(c)===recordKey({appId,dimension,raw})))throw Error('Revoke the existing mapping for this record before replacing it.');
 return {id,appId,dimension,raw,targetId,appSnapshot:appSnapshot(a),taxonomySnapshot:snapshot,reviewKey:String(reviewKey||''),reviewer:String(reviewer).trim(),reason:String(reason).trim(),createdAt:new Date().toISOString(),revokedAt:''};
}
export function revokeCorrection(data,id){
 return {...data,corrections:cleanCorrections(data.corrections).map(c=>c.id===id&&!c.revokedAt?{...c,revokedAt:new Date().toISOString()}:c)};
}

export function verifyCorrection(data,draft){
 const verified=createCorrection(data,{...draft,id:draft.id});
 if(verified.appSnapshot!==draft.appSnapshot||verified.taxonomySnapshot!==draft.taxonomySnapshot)throw Error('Source or taxonomy changed. Preview this mapping again.');
 return verified;
}

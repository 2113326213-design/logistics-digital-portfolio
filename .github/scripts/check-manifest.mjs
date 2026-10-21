// Checks MANIFEST.sha256 against the checked-out files: "<sha256>  <path>" for every file except .git, MANIFEST.sha256
// and program/node_modules, sorted by plain string order. Exits 1 and lists the differences when they do not match.
// usage: node .github/scripts/check-manifest.mjs [root]      (regenerate locally with: node .github/scripts/check-manifest.mjs --write)
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const args=process.argv.slice(2),write=args.includes('--write'),root=path.resolve(args.find(a=>a!=='--write')||'.');
const skip=new Set(['.git','MANIFEST.sha256','program/node_modules','program/dist','program/outputs']);
const files=[];
const walk=dir=>{for(const name of readdirSync(dir)){const full=path.join(dir,name),rel=path.relative(root,full).split(path.sep).join('/');if(skip.has(rel))continue;if(lstatSync(full).isDirectory())walk(full);else files.push(rel);}};
walk(root);
files.sort((a,b)=>a<b?-1:a>b?1:0);
const text=files.map(f=>createHash('sha256').update(readFileSync(path.join(root,f))).digest('hex')+'  '+f).join('\n')+'\n';
if(write){writeFileSync(path.join(root,'MANIFEST.sha256'),text);console.log(`MANIFEST.sha256 written: ${files.length} files.`);process.exit(0);}
const listed=new Map(readFileSync(path.join(root,'MANIFEST.sha256'),'utf8').split('\n').filter(Boolean).map(l=>[l.slice(66),l.slice(0,64)]));
const actual=new Map(text.split('\n').filter(Boolean).map(l=>[l.slice(66),l.slice(0,64)]));
const changed=[...actual].filter(([f,h])=>listed.has(f)&&listed.get(f)!==h).map(([f])=>f);
const unlisted=[...actual.keys()].filter(f=>!listed.has(f)),missing=[...listed.keys()].filter(f=>!actual.has(f));
if(!changed.length&&!unlisted.length&&!missing.length){console.log(`MANIFEST.sha256 matches all ${files.length} files.`);process.exit(0);}
for(const [label,list] of [['changed',changed],['not in the manifest',unlisted],['listed but missing',missing]])if(list.length)console.log(`${label} (${list.length}):\n  ${list.join('\n  ')}`);
console.log('Regenerate with: node .github/scripts/check-manifest.mjs --write');
process.exit(1);

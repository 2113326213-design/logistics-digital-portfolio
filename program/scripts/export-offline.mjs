import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {RELEASE_DATE,RELEASE_VERSION,OFFLINE_FILE_NAME} from './release.mjs';
import {writeDeployFiles} from './deploy-script.mjs';
const root=process.cwd(),pub=path.join(root,'public');
function replaceRequired(text,pattern,replacement,label){
 const matches=typeof pattern==='string'?text.split(pattern).length-1:[...text.matchAll(new RegExp(pattern.source,'g'))].length;
 if(matches!==1)throw Error(`Offline export stopped: expected one ${label}, found ${matches}.`);
 return text.replace(pattern,replacement);
}
const mimeTypes={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};
async function dataUri(file){
 const type=mimeTypes[path.extname(file).toLowerCase()];
 if(!type)throw Error(`Offline export stopped: no MIME type for asset ${file}.`);
 return `data:${type};base64,${(await readFile(path.join(pub,file))).toString('base64')}`;
}
// Every reference matched by the pattern is rewritten; repeated references share one data URI.
async function inlineAssets(text,pattern,wrap){
 const uris=new Map();
 for(const m of text.matchAll(pattern))if(!m[1].startsWith('data:')&&!uris.has(m[1]))uris.set(m[1],await dataUri(m[1]));
 return text.replace(pattern,(all,file)=>uris.has(file)?wrap(uris.get(file)):all);
}
let source=await readFile(path.join(pub,'app.js'),'utf8');
source=replaceRequired(source,/const localAdmin=.*?;/,'const localAdmin=true;','offline access setting');
source=replaceRequired(source,"const response=await fetch('./data.json');","const response={ok:true,json:async()=>JSON.parse(document.getElementById('offlineInventory').textContent)};",'embedded data loader');
source=replaceRequired(source,'autosave=createAutosave({','autosave=createOfflineAutosave({','offline save adapter');
source=replaceRequired(source,"'Admin preview'","'Offline edition'",'offline account label');
source=replaceRequired(source,"(alias?history.replaceState:history.pushState).call(history,null,'',url);","try{(alias?history.replaceState:history.pushState).call(history,null,'',url);}catch{}",'address bar update');
// The offline save state (changes not exported, export started) lives in public/offline-save.mjs.
source+=`\nimport {createOfflineAutosave} from './offline-save.mjs';\n`;
const result=await build({stdin:{contents:source,resolveDir:pub,sourcefile:'offline-app.js',loader:'js'},bundle:true,write:false,format:'esm',target:'es2022',minify:true});
let markup=await readFile(path.join(pub,'index.html'),'utf8');
// Insert the banner before CSS and scripts are embedded, so '<main' can only match the page's own element.
markup=replaceRequired(markup,'<main',()=>`<aside style="padding:10px 24px;background:#edf5f8;color:#25485b;font:14px system-ui">Offline edition · ${RELEASE_VERSION.toUpperCase()} · ${RELEASE_DATE} | All data is included. No internet connection required. Changes remain in this tab only; use Export workspace to save a backup and Import data to restore it. Reopening this HTML loads the bundled data. Incomplete Level 3 records are currently deferred.</aside><main`,'offline banner position');
for(const match of [...markup.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]){
 const css=await inlineAssets(await readFile(path.join(pub,match[1]),'utf8'),/url\(["']?([^\s)"']+)["']?\)/g,uri=>`url("${uri}")`);
 markup=replaceRequired(markup,match[0],()=>'<style>'+css+'</style>',`stylesheet link ${match[1]}`);
}
markup=await inlineAssets(markup,/src="(assets\/[^"]+)"/g,uri=>`src="${uri}"`);
const data=JSON.parse(await readFile(path.join(pub,'data.json'),'utf8'));
const json=JSON.stringify(data).replace(/</g,'\\u003c');
markup=replaceRequired(markup,'<script type="module" src="app.js"></script>',()=>`<script type="application/json" id="offlineInventory">${json}</script><script type="module">${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`,'embedded application script');
await mkdir(path.join(root,'outputs'),{recursive:true});
const output=path.join(root,'outputs',OFFLINE_FILE_NAME);
await writeFile(output,markup);
console.log(output);console.log(`${(Buffer.byteLength(markup)/1024).toFixed(0)} KB`);
// The IIS deploy script follows every export automatically (owner request 2026-10-21).
for(const file of writeDeployFiles(path.join(root,'outputs'),Buffer.from(markup)))console.log(file);

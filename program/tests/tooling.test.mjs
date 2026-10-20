import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const configAt=async host=>{
 const previous=process.env.VITE_HOST;
 if(host===undefined)delete process.env.VITE_HOST;else process.env.VITE_HOST=host;
 try{return (await import(new URL(`../vite.config.mjs?host=${host??'default'}`,import.meta.url))).default;}
 finally{if(previous===undefined)delete process.env.VITE_HOST;else process.env.VITE_HOST=previous;}
};
test('dev server serves the real inventory on localhost only unless VITE_HOST opts in',async()=>{
 const local=await configAt(undefined),all=await configAt('0.0.0.0');
 assert.equal(local.server.host,'127.0.0.1','npm run dev must not expose data.json to the LAN by default');
 assert.equal(all.server.host,'0.0.0.0','VITE_HOST=0.0.0.0 opts into all interfaces');
 for(const config of [local,all])assert.deepEqual(config.server.allowedHosts,['terminal.local']);
});
test('package scripts run the full suite and offline export on the supported Node version',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts.test,'node --test "tests/*.test.mjs"','quoted glob: node expands it, so the script also works in cmd.exe');
 assert.equal(pkg.scripts['export:offline'],'node scripts/export-offline.mjs');
 assert.equal(pkg.engines?.node,'>=22.13','node:sqlite without a flag needs 22.13; Vite 7.1 needs 22.12');
});

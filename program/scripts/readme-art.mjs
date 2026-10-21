// README badges and link buttons (owner request 2026-10-22: make the GitHub page look finished, in the style of
// GyulyVGC/sniffnet — a banner, a row of coloured buttons, one line of text, then a large screenshot). The numbers are
// read from the package, so the badges stay true for each release:
//   version          scripts/release.mjs
//   tests            verification/test-results.txt (the npm test log copied there at release)
//   data             public/data.json
//
//   npm run readme:art        (run in program/ after the test log is copied to verification/)
//
// Self-contained SVG files in docs/images: no external badge service, so they also show in the private repository.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {RELEASE_VERSION} from './release.mjs';

const program=process.cwd(),root=path.resolve(program,'..'),images=path.join(root,'docs','images');
const VERSION=RELEASE_VERSION.toUpperCase();
const esc=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const logFile=path.join(root,'verification','test-results.txt'),log=existsSync(logFile)?readFileSync(logFile,'utf8'):'';
const count=key=>Number(log.match(new RegExp(`ℹ ${key} (\\d+)`))?.[1]??NaN),tests={total:count('tests'),pass:count('pass'),fail:count('fail')};
if(!Number.isFinite(tests.total)||tests.fail!==0||tests.pass!==tests.total)throw Error('verification/test-results.txt has no complete passing npm test log. Copy the log of a passing npm test run there first.');
const data=JSON.parse(readFileSync(path.join(program,'public','data.json'),'utf8'));
const apps=data.apps.length,plants=new Set(data.apps.map(a=>String(a.Entity).trim())).size;
const write=(name,svg)=>{writeFileSync(path.join(images,name),svg);console.log('docs/images/'+name);};
const width=(text,cjk=12,upper=7.2,narrow=3.6,other=6.4)=>[...text].reduce((w,ch)=>w+(/[　-鿿＀-￯]/.test(ch)?cjk:/[A-Z0-9]/.test(ch)?upper:/[ .·]/.test(ch)?narrow:other),0);

// ---- status badges (small, flat) ------------------------------------------------------------------------------------
const badge=(file,label,value,color)=>{
 const lw=Math.round(width(label)+16),vw=Math.round(width(value)+16),h=24,total=lw+vw;
 write(file,`<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<defs><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
<clipPath id="r"><rect width="${total}" height="${h}" rx="6" fill="#fff"/></clipPath></defs>
<g clip-path="url(#r)"><rect width="${lw}" height="${h}" fill="#1f2d3d"/><rect x="${lw}" width="${vw}" height="${h}" fill="${color}"/><rect width="${total}" height="${h}" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="'Segoe UI',Verdana,Geneva,DejaVu Sans,'Microsoft YaHei',sans-serif" font-size="12" font-weight="600">
<text x="${lw/2}" y="16" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw/2}" y="15">${esc(label)}</text>
<text x="${lw+vw/2}" y="16" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${lw+vw/2}" y="15">${esc(value)}</text>
</g></svg>
`);
};
badge('badge-version.svg','version',VERSION,'#0071a8');
badge('badge-tests.svg','tests',`${tests.pass} passed`,'#2e9e5b');
badge('badge-offline.svg','offline','single HTML · no install','#5b6b7a');
badge('badge-data.svg','data',`${apps} apps · ${plants} plants`,'#7c5cbf');
badge('badge-private.svg','visibility','private','#b7791f');

// ---- link buttons (the "for-the-badge" look: square, bold, an icon and spaced capitals) ------------------------------
const ICONS={
 download:'<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13h11" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
 globe:'<g fill="none" stroke="#fff" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.6" ry="6"/><path d="M2 8h12"/></g>',
 book:'<path d="M2 3h4.2A1.8 1.8 0 0 1 8 4.8V13a1.4 1.4 0 0 0-1.4-1.4H2zM14 3H9.8A1.8 1.8 0 0 0 8 4.8V13a1.4 1.4 0 0 1 1.4-1.4H14z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
 list:'<path d="M5 4h8M5 8h8M5 12h8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><g fill="#fff"><circle cx="2.5" cy="4" r="1.1"/><circle cx="2.5" cy="8" r="1.1"/><circle cx="2.5" cy="12" r="1.1"/></g>',
 chat:'<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>'
};
const button=(file,icon,text,en,color)=>{
 const label=`${text}  ${en}`,tw=Math.round(width(text,14)+width(en,0,8.4,4.2,8.4)+8),w=16+18+tw+16,h=32;
 write(file,`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<rect width="${w}" height="${h}" rx="4" fill="${color}"/>
<rect width="${w}" height="${h/2}" rx="4" fill="#fff" fill-opacity=".08"/>
<g transform="translate(14 8)">${ICONS[icon]}</g>
<text x="38" y="21" fill="#fff" font-family="'Segoe UI',Verdana,'Microsoft YaHei','PingFang SC',sans-serif" font-size="13" font-weight="700">${esc(text)}<tspan font-size="11" letter-spacing="1.2" dx="7" fill-opacity=".85">${esc(en)}</tspan></text>
</svg>
`);
};
button('button-download.svg','download','下载离线版','DOWNLOAD','#e8890c');
button('button-online.svg','globe','打开在线版','ONLINE','#1f9d55');
button('button-guide.svg','book','使用说明','GUIDE','#2b7fd4');
button('button-changelog.svg','list','更新日志','CHANGELOG','#2b7fd4');
button('button-feedback.svg','chat','反馈问题','FEEDBACK','#7c5cbf');
console.log(`${VERSION} · tests ${tests.pass}/${tests.total} · ${apps} apps / ${plants} plants`);

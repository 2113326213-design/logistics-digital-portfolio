// The IIS deploy script of the current release (owner request 2026-10-21: the script must follow every change
// automatically). It is generated from deploy-iis.template.bat, the script tested on the IIS server for V9.15, with the
// release version, the release ZIP name and the SHA-256 of the offline HTML filled in. npm run export:offline writes it
// next to the offline HTML in outputs/; npm run release:files puts it into the package's offline/ folder.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {crc32,inflateRawSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_DATE,RELEASE_VERSION,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,DEPLOY_ZIP_NAME} from './release.mjs';

export const DEPLOY_TEMPLATE=fileURLToPath(new URL('./deploy-iis.template.bat',import.meta.url));
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export function deployScript({html,version=RELEASE_VERSION,zipName=RELEASE_ZIP_NAME,scriptName=DEPLOY_SCRIPT_NAME,template=readFileSync(DEPLOY_TEMPLATE,'utf8')}){
 const values={VERSION:version.toUpperCase(),version,ZIPNAME:zipName,SHA256:sha256(html),SCRIPT:scriptName};
 const text=template.replace(/\{\{(\w+)\}\}/g,(placeholder,key)=>{
  if(!Object.hasOwn(values,key))throw Error(`Unknown placeholder ${placeholder} in ${path.basename(DEPLOY_TEMPLATE)}.`);
  return values[key];
 });
 // cmd.exe needs CRLF line endings (labels can be missed with LF only).
 return text.replace(/\r?\n/g,'\r\n');
}

// A ZIP with stored (uncompressed) entries and UTF-8 names, which Windows Explorer opens directly. The entry time is the
// release date, so the same input always gives the same bytes.
export function storedZip(entries,date=RELEASE_DATE){
 const [y,m,d]=date.split('-').map(Number),dosDate=((y-1980)<<9)|(m<<5)|d,locals=[],centrals=[];let offset=0;
 for(const [name,content] of entries){
  const nameBytes=Buffer.from(name,'utf8'),data=Buffer.from(content),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(0,10);local.writeUInt16LE(dosDate,12);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);local.writeUInt16LE(0,28);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(0,10);central.writeUInt16LE(0,12);central.writeUInt16LE(dosDate,14);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,nameBytes,data);centrals.push(central,nameBytes);offset+=local.length+nameBytes.length+data.length;
 }
 const centralSize=centrals.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...centrals,end]);
}

// Reads the entries of a ZIP (stored or deflated) as a Map of name to bytes.
export function readZip(bytes){
 const buf=Buffer.from(bytes);let end=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Not a ZIP file.');
 const count=buf.readUInt16LE(end+10),entries=new Map();let p=buf.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  if(buf.readUInt32LE(p)!==0x02014b50)throw Error('Damaged ZIP central directory.');
  const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLength=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
  const name=buf.toString('utf8',p+46,p+46+nameLength),start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),raw=buf.subarray(start,start+size);
  if(method!==0&&method!==8)throw Error(`Unsupported ZIP compression ${method} for ${name}.`);
  entries.set(name,method===8?inflateRawSync(raw):Buffer.from(raw));
  p+=46+nameLength+extra+comment;
 }
 return entries;
}

// Writes the deploy script and its download ZIP for this HTML into dir; returns the two file paths.
export function writeDeployFiles(dir,html){
 const script=deployScript({html}),scriptPath=path.join(dir,DEPLOY_SCRIPT_NAME),zipPath=path.join(dir,DEPLOY_ZIP_NAME);
 writeFileSync(scriptPath,script);
 writeFileSync(zipPath,storedZip([[DEPLOY_SCRIPT_NAME,script]]));
 return [scriptPath,zipPath];
}

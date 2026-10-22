// Puts the current release into the package's offline/ folder (owner request 2026-10-21): the offline HTML, the release
// ZIP and the IIS deploy script, all for the same build. Run npm run export:offline first.
//
//   npm run release:files
//
// The release ZIP is the one download (owner report 2026-10-22): it holds the HTML and deploy-iis.bat, and the server
// deploys by opening it and double-clicking the script. offline/deploy-iis.bat is the same script, kept for reading.
// The HTML and the release ZIP of a version are never replaced with different content, also when only the deploy
// script inside the ZIP changed (V13.2: a published V13.1 ZIP had been rewritten locally this way): a changed build or
// script needs a new RELEASE_VERSION in scripts/release.mjs. tests/deploy-script.test.mjs fails when offline/ holds a
// release without its matching script.
import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {OFFLINE_FILE_NAME,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,OLD_DEPLOY_ZIP_NAME} from './release.mjs';
import {sha256,readZip,deployScript,releaseZip} from './deploy-script.mjs';

const program=process.cwd(),outputs=path.join(program,'outputs'),offline=path.resolve(program,'..','offline');
const fail=message=>{console.error(`Release files stopped: ${message}`);process.exit(1);};
const built=path.join(outputs,OFFLINE_FILE_NAME);
if(!existsSync(built))fail(`outputs/${OFFLINE_FILE_NAME} is missing. Run npm run export:offline first.`);
if(!existsSync(offline))fail(`the package folder ${offline} is missing (expected next to program/).`);
const html=readFileSync(built),hash=sha256(html),script=deployScript({html}),zip=releaseZip(html,script),notes=[];

// All checks come before any file is written.
const htmlTarget=path.join(offline,OFFLINE_FILE_NAME),zipTarget=path.join(offline,RELEASE_ZIP_NAME);
if(existsSync(htmlTarget)&&sha256(readFileSync(htmlTarget))!==hash)fail(`offline/${OFFLINE_FILE_NAME} already exists with different content. A changed build needs a new RELEASE_VERSION.`);
const old=existsSync(zipTarget)?readFileSync(zipTarget):null;
if(old){
 const htmlEntries=[...readZip(old)].filter(([name])=>/\.html$/i.test(name));
 if(htmlEntries.length!==1||sha256(htmlEntries[0][1])!==hash)fail(`offline/${RELEASE_ZIP_NAME} already exists and does not hold exactly this HTML. A changed build needs a new RELEASE_VERSION.`);
 if(!old.equals(zip))fail(`offline/${RELEASE_ZIP_NAME} already exists with another deploy script inside (same HTML). A release ZIP is never replaced: give the change a new RELEASE_VERSION, or delete the file first only if this version was never published.`);
}
writeFileSync(htmlTarget,html);
writeFileSync(zipTarget,zip);
writeFileSync(path.join(offline,DEPLOY_SCRIPT_NAME),script);
const oldDownload=path.join(offline,OLD_DEPLOY_ZIP_NAME);
if(existsSync(oldDownload)){rmSync(oldDownload);notes.push(`removed offline/${OLD_DEPLOY_ZIP_NAME}: the deploy script is inside ${RELEASE_ZIP_NAME} now.`);}
console.log([`offline/${OFFLINE_FILE_NAME}`,`offline/${RELEASE_ZIP_NAME} (HTML + ${DEPLOY_SCRIPT_NAME})`,`offline/${DEPLOY_SCRIPT_NAME}`,`HTML SHA-256 ${hash}`,...notes].join('\n'));

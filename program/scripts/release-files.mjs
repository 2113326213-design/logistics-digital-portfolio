// Puts the current release into the package's offline/ folder (owner request 2026-10-21): the offline HTML, the release
// ZIP, and the IIS deploy script with its download ZIP, all for the same build. Run npm run export:offline first.
//
//   npm run release:files
//
// The HTML and the release ZIP of a version are never replaced with different content: a changed build needs a new
// RELEASE_VERSION in scripts/release.mjs. The deploy script (deploy-iis.bat) always describes the release named in
// scripts/release.mjs; tests/deploy-script.test.mjs fails when offline/ holds a release without its matching script.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {OFFLINE_FILE_NAME,RELEASE_ZIP_NAME,DEPLOY_SCRIPT_NAME,DEPLOY_ZIP_NAME} from './release.mjs';
import {sha256,storedZip,readZip,writeDeployFiles} from './deploy-script.mjs';

const program=process.cwd(),outputs=path.join(program,'outputs'),offline=path.resolve(program,'..','offline');
const fail=message=>{console.error(`Release files stopped: ${message}`);process.exit(1);};
const built=path.join(outputs,OFFLINE_FILE_NAME);
if(!existsSync(built))fail(`outputs/${OFFLINE_FILE_NAME} is missing. Run npm run export:offline first.`);
if(!existsSync(offline))fail(`the package folder ${offline} is missing (expected next to program/).`);
const html=readFileSync(built),hash=sha256(html);

const htmlTarget=path.join(offline,OFFLINE_FILE_NAME);
if(existsSync(htmlTarget)&&sha256(readFileSync(htmlTarget))!==hash)fail(`offline/${OFFLINE_FILE_NAME} already exists with different content. A changed build needs a new RELEASE_VERSION.`);
writeFileSync(htmlTarget,html);

const zipTarget=path.join(offline,RELEASE_ZIP_NAME);
if(existsSync(zipTarget)){
 const htmlEntries=[...readZip(readFileSync(zipTarget))].filter(([name])=>/\.html$/i.test(name));
 if(htmlEntries.length!==1||sha256(htmlEntries[0][1])!==hash)fail(`offline/${RELEASE_ZIP_NAME} already exists and does not hold exactly this HTML. A changed build needs a new RELEASE_VERSION.`);
}else writeFileSync(zipTarget,storedZip([[OFFLINE_FILE_NAME,html]]));

writeDeployFiles(offline,html);
console.log(`offline/${OFFLINE_FILE_NAME}\noffline/${RELEASE_ZIP_NAME}\noffline/${DEPLOY_SCRIPT_NAME}\noffline/${DEPLOY_ZIP_NAME}\nHTML SHA-256 ${hash}`);

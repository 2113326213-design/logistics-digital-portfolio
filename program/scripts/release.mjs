// Keep the visible release label and downloaded file name in sync.
export const RELEASE_DATE='2026-10-22';
export const RELEASE_VERSION='v17.5';
export const OFFLINE_FILE_NAME=`物流工具_最新版_离线单文件_${RELEASE_DATE.replaceAll('-','')}_${RELEASE_VERSION}.html`;
// The release ZIP is the one GitHub release asset: the offline HTML and the IIS deploy script generated for it
// (scripts/deploy-script.mjs), so the server needs one download (owner report 2026-10-22: twice only the script was
// downloaded).
export const RELEASE_ZIP_NAME=`logistics-offline-${RELEASE_DATE.replaceAll('-','')}-${RELEASE_VERSION}.zip`;
export const DEPLOY_SCRIPT_NAME='deploy-iis.bat';
// Until V13.1 the script was a second download; npm run release:files removes this file from offline/.
export const OLD_DEPLOY_ZIP_NAME='deploy-iis-script.zip';

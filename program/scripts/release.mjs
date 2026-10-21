// Keep the visible release label and downloaded file name in sync.
export const RELEASE_DATE='2026-10-21';
export const RELEASE_VERSION='v9.17';
export const OFFLINE_FILE_NAME=`物流工具_最新版_离线单文件_${RELEASE_DATE.replaceAll('-','')}_${RELEASE_VERSION}.html`;
// The release ZIP (GitHub release asset) and the IIS deploy script generated for it (scripts/deploy-script.mjs).
export const RELEASE_ZIP_NAME=`logistics-offline-${RELEASE_DATE.replaceAll('-','')}-${RELEASE_VERSION}.zip`;
export const DEPLOY_SCRIPT_NAME='deploy-iis.bat';
export const DEPLOY_ZIP_NAME='deploy-iis-script.zip';

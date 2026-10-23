# V19 验证记录 — 2026-10-23

基线：仓库 V18.1（a133c9d）。删掉 Import data 里的 LeanIX 流程对比、“Download file for the server” 按钮和 `tools/leanix`。

## 自动检查

- `npm test`：540 项通过，0 失败（`v19-test-results.txt`），含新增 `tests/v19-removed.test.mjs`（5 项：LeanIX 对比的代码和样式不在了；LeanIX 流程导出（有没有 Applications 列都算）在读清单之前被拒绝、清单 / LeanIX 应用导出 / 只有 id,type,name 的应用导出不会被误拒；没有下载按钮、分享一节只在能上传时显示、部署脚本不再提下载；`tools/leanix` 不在、`.gitignore` 仍排除 LeanIX 原始导出；新的更新提示）。
- `npm run deploy:sim`：14 / 14（V19）。

## 浏览器检查（本机）

- 内网方式（http，本机测试服务器）：Import data 第 1 格只写 “Application inventory / Workspace backup”；“Share this data with everyone” 只有 Upload to server；在第 1 格选一个 LeanIX 流程导出（BBM PM process 视图格式）点 Preview changes：显示 “Import failed: This is a LeanIX process export. The tool no longer reads these files. Select an application inventory, a saved workspace or a taxonomy file. Current data has not changed.”，没有预览、没有 Apply，仍是 75 个应用。
- 离线文件（file://，无头 Edge）：“Share this data with everyone” 整节隐藏（hidden），75 个应用照常显示。

## 复核

复核流程（1 个复核者读代码并实际运行检查，含误拒正常工作簿的风险）：没有发现问题。

## 还没验证的

- 没有在 IIS 服务器上部署。

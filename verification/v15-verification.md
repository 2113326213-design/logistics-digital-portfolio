# V15 验证记录 — 2026-10-22

基线：仓库 cafa1a5（V14）。用户选 A：“先只核对、不改数据。导入预览按应用列出 LeanIX 里挂的流程和工具里登记的流程哪些对得上、哪些只有一边有。”

## 改动

Import data 识别 LeanIX 流程导出（带 Applications 列），按应用比较 LeanIX 挂的流程和工具里登记的流程，显示对得上 / 只在 LeanIX / 只在工具里，以及工具里登记但这份导出没有的流程（不算差异）。只核对：不改数据、没有 Apply、不记历史；可下载 CSV。没有 Applications 列的流程导出给出重新导出的说明。

## 自动检查

- `npm test`：517 项通过，0 失败。日志：`v15-test-results.txt`。新增 `tests/v15-leanix-process-check.test.mjs`（7 项）。其中一项用内置数据重建同版式的导出、写成 .xlsx 再用页面的读取器读回：75 个应用全部一致、没有不认识的应用；改掉一个链接、加上一个链接后，恰好这两个应用显示差异。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 10 / 10 通过（V15）。离线文件仍只有 V14 那一个 fetch（读服务器数据包）。

## 实际浏览器检查（本机 http://127.0.0.1，离线版 V15）

合成导出（由内置数据重建 200 个流程；去掉 1 个链接、加 1 个链接、加 1 个工具里没有的应用名）：

- Preview changes → “Process check ready: 2 of 75 applications differ. Nothing was changed.”；Applications 75、Differ 2、Match 73、No processes in this export 0；“200 in this export · linked to 76 applications by name”；“1 application named in LeanIX is not in the tool under that name.”
- 有差异的应用在前：AGR w/ Camera “3 in both · 0 only in LeanIX · 1 only in the tool”，展开为三栏；Apply 按钮隐藏。
- 1280 宽度对话框无横向溢出；375 宽度三栏变单栏，页面无横向滚动。
- 测试后清除了本机测试地址上的浏览器记录。

未接触真实 LeanIX 导出（只在公司电脑上处理）；未在 IIS 服务器上部署。

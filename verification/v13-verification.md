# V13 验证记录 — 2026-10-22

基线：仓库 4620bfd（V12）。用户：“继续更新”。本版：标题右侧的应用搜索；Import data 读取日期最新的 Logistic Apps_<日期> 表并在预览里写明。

## 自动检查

- `npm test`：479 项通过，0 失败。日志：`v13-test-results.txt`。新增 `tests/v13-search-and-sheets.test.mjs`（表的选择：不论顺序取最新、完整日期新于月日、无日期取第一张、正好叫 Logistic Apps 的表优先、同时读取成本和 ROI 时保留；搜索：多词、按 ID、按工厂、排序、最多 8 个、空输入；搜索框：输入即列出、回车打开、无结果提示、Esc 清空、/ 定位）。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 7 / 7 通过（V13 脚本）。

## 实际浏览器检查（本机 http://127.0.0.1）

- 搜索 “rbcw dash” → 只列出 RBCW LOM Dashboard；回车打开应用详情，地址栏带 ?app=。
- 页面上按 / → 焦点到搜索框，框里没有多出 “/”。
- Import data 选 20261021_logistic_inventory.xlsx → Preview changes：Inventory 一行为 “20261021_logistic_inventory.xlsx · sheet Logistic Apps_1021”，下面提示 “This workbook has 2 inventory sheets (Logistic Apps_1021, Logistic Apps_0825); the newest, Logistic Apps_1021, was read.”；“No application fields change with this import.”（内置数据就是这份工作簿）。没有点 Apply，关闭对话框后数据行仍为 2026-10-21。

未在 IIS 服务器上部署（服务器上为用户部署的 V12）。

# V10 验证记录 — 2026-10-22

基线：仓库 de60b22（V9.19）。用户要求：导入预览里加“变化明细”（每个字段原值 → 新值，Apply 前可见）和导出 CSV 的按钮。版本号按用户确认的新规则（新功能升大版本）定为 V10。

## 自动检查

- `npm test`：468 项通过，0 失败。日志：`v10-test-results.txt`。新增 `tests/v920-import-changes.test.mjs`：
  - 用 V9.16 的记录导入当前数据，预览的 104 处字段变化与 2026-10-21 导入事件逐条一致（应用、字段、原值、新值）；也与 recordImport 对同一输入的结果一致。
  - 明细表：每个变化一行，标签可读（Operation cost score、ROI (payback period)、Status in source inventory），列表字段显示 − / + 条目，HTML 转义，没有变化时显示提示，只在来源位置变化的应用数量单独说明。
  - CSV：UTF-8 BOM、表头、每个字段一行加删除的应用一行，列表字段的删除和新增条目，公式字符前加 '。
  - 样式：屏蔽景观大表的全局 th/td 规则。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 5 / 5 通过（V10 脚本）。

## 实际浏览器检查（本机 127.0.0.1）

- 打开 V10 离线页面，Import data 选 2026-08-25 的工作簿，点 Preview changes（未 Apply）：Added 1、Updated 75；“Change details · 67 fields in 53 applications · 1 added”，并说明另有 22 个应用只在来源位置变化；表头 31 px（修正前 140 px）；“Export change details (CSV)” 按钮存在（浏览器里未点下载，CSV 内容由单元测试检查）。

未在 IIS 服务器上部署。

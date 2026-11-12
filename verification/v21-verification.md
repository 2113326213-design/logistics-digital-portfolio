# V21 验证记录 — 2026-11-12

基线：仓库 V20（d5a5833）。

- `npm test`：583 项通过，0 失败（`v21-test-results.txt`）。新增 `tests/v21-process-names.test.mjs` 7 项：名字拆成四段（L3V = L3）；每段的检查和说明；noLevelRecord 三种情况的文字；对比用同应用的 L3 标准记录、没有时用示例；Issues to review / 详情 HTML / Data checks / Similarity 说明一致，PESS 的 L0–L3 仍算合格；工厂清单 8 条 5 个应用、按工厂筛选、CSV（BOM、引号、逗号）、文件名、只在 Process 下显示、导出按钮接线；只用平实英文；更新提示 id 2026-11-12、无版本号。9 个旧测试按新标签 / 新日期更新。
- `deploy:sim`：19 / 19。
- 浏览器（本机 http://127.0.0.1:8772，离线版 V21）：?app=PESS 打开详情 → Issues to review 显示 “Process name not in the standard form”，四段表格：BBM_ / P2S / LE_01 Production Replenishment / none 标红或标黄，下面一行 BBM PM / I2D / Block / Unblock Stock / L3 标绿；Overview → Process → “Process names to fix in LeanIX · 8”，8 行按工厂排序；Export for plants (CSV) 生成 9 行、text/csv；控制台只有本机服务器对不存在文件的两条 404，无脚本错误。
- 未做独立审查（本周额度用尽，V21 用 Fable 5.1 完成）；下一版本补做。未在 IIS 服务器上部署。

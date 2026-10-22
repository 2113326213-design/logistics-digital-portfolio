# V12 验证记录 — 2026-10-22

基线：仓库 5c8f5d3（V11）。用户选择：页面上显示数据截至哪天。另外修部署脚本：用户在服务器上运行 V11 脚本时 Downloads 里没有对应压缩包。

## 自动检查

- `npm test`：476 项通过，0 失败。日志：`v12-test-results.txt`。新增 `tests/v12-data-as-of.test.mjs`（日期来源顺序、真实日期校验、没有来源时不显示、标题下的位置、useData 每次更新）。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 7 / 7 通过（V12 脚本），其中新增：只有浏览器存成 “(1)” 的压缩包时找到并通过 SHA-256 校验；Downloads 里只有别的版本时写明原因、列出找到的压缩包并等待按键。

## 实际浏览器检查（本机 http://127.0.0.1）

- 标题下显示 “Data: 20261021_logistic_inventory.xlsx · as of 2026-10-21”。
- Import data 选 2026-08-25 的工作簿 → Apply → 变为 “Data: 20260825_logistic_inventory.xlsx · as of 2026-08-25”；Undo import → 恢复为 2026-10-21。测试后清除了本机保存的工作。

未在 IIS 服务器上部署（服务器上仍是 V9.15；用户正在部署 V11）。

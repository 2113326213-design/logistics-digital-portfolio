# V17 验证记录 — 2026-10-23

基线：仓库 dddc584（V16）。用户：“Signavio 标准为主，LeanIX 的 BBM PM 本地流程作为单独标注的一层加进流程目录，导入时先预览再 Apply。”

## 自动检查

- 没有本地层时，buildModel 的输出在真实数据、去掉映射、旧分类表、边界记录四种情况下与 V16 逐项相同。
- `npm test`：533 项通过，0 失败（日志 `v17-test-results.txt`）；新增 `tests/v17-local-processes.test.mjs`。
- `npm run build`、`export:offline`、`release:files` 通过；`deploy:sim` 10 / 10（V17）。

## 复核

本地层没有时与 V16 完全相同（四组数据逐项比对，含全部 533 项测试）。发布前启动了一轮快速复核（1 个复核者 + 1 个反驳者），用户当天急用，复核结果在发布后补充；如有确认的问题，修正为 V17.1。

## 实际浏览器检查（本机 http://127.0.0.1，离线版 V17，合成导出）

- 流程核对的 LeanIX local processes：Can be added 4、Cannot be added 14（没有 Parent、Parent 找不到等原因正确）。
- Preview the local process layer：普通导入预览，Taxonomy · Changed，应用数量不变；Apply 后 “Level 3 to review” 18 → 16；保存的工作区带 4 个本地流程（编号如 M.I2D.010.020.L0000012c，标签带 “(LeanIX local)”）。
- 测试后清除了本机测试地址上的浏览器记录。

未接触真实 LeanIX 导出；未在 IIS 服务器上部署。

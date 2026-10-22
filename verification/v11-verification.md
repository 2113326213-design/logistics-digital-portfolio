# V11 验证记录 — 2026-10-22

基线：仓库 d421a44（V10）。用户从升级清单选了：自动保存在本机、To review 导出 Excel、应用直达链接。

## 自动检查

- `npm test`：474 项通过，0 失败。日志：`v11-test-results.txt`。新增 `tests/v11-usability.test.mjs`（6 项）：改动在停顿后写入、离开前补写、写入后不提醒离开；浏览器拒绝保存时沿用旧规则；打开时与当前数据不同才询问，Continue 恢复、Use the data 删除、损坏的已存工作被移除；询问文字和新版本提醒；To review 的行与 Overview / 应用详情的问题一致（Capability 39 个应用、Process 22 个），按工厂筛选、CSV 表头和文件名；`?app=` 读取、地址栏更新、链接生成（http 和 file）。原有 `v915-part4-score-settings` 的“开始下载不取消离开提醒”规则仍通过。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 5 / 5 通过（V11 脚本）。

## 实际浏览器检查（本机 http://127.0.0.1）

- 直达链接：打开 `v11.html?app=b97561de-…` 直接显示 AUTO-RACK 详情；Copy link 复制出 `…/v11.html?app=b97561de-…`，显示 “Link copied.”（测试时用替身代替系统剪贴板）；关闭详情后地址栏去掉 `?app=`。
- To review 导出：选 RBCW 后点 Export To review (CSV)，文件名 `To_review_RBCW_2026-10-22.csv`，7 行问题（测试时拦截了下载，没有写到磁盘）。
- 自动保存：Score settings 最低分改为 45 → localStorage 里有 V11 的已存工作（最低分 45），状态提示 “Changes are kept in this browser on this computer…”；刷新后弹出 “Continue your kept work?”（写明保存时间、V11 和数据文件）；Continue → 最低分 45；再刷新选 Use the data in this file → 已存工作被删除。
- 去掉了导出按钮的 title（无障碍名称原本被 title 覆盖）。

未在 IIS 服务器上部署。

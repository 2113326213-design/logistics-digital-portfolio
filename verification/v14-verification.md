# V14 验证记录 — 2026-10-22

基线：仓库 f0aeb38（V13.3）。数据包由侧边会话开始（方案 A），用户让主会话接手（“把这个任务一直到主对话框吧”）。GitHub 真实数据：用户决定保留（“真实数据保留”）。

## 自动检查

- `npm test`：510 项通过，0 失败。日志：`v14-test-results.txt`。新增 `tests/v14-data-package.test.mjs`；网络规则改为精确检查唯一的 fetch。
- `node --test tools/leanix/leanix.test.mjs`：5 / 5。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 10 / 10 通过（V14，部署脚本未改）。
- 复核：三轮复核（每轮一个小工作流：复核者 + 反驳者，都用真实数据跑探针）。第一轮确认 5 个问题、第二轮 4 个、第三轮 2 个：上一个数据包带来的映射被当成用户自己的，数据管家之后的替换或撤回到不了已应用过的用户；新版本恢复时为同一来源补回字段后，同一个数据包每次刷新都重新提示、每次 Apply 都删掉这些字段。第三轮还驳回 1 个（用户和数据管家都撤销同一映射时历史里有两条撤销记录——两条都是真实记录）。全部修复并加测试，新测试都先在修复前的代码上确认失败。

## 实际浏览器检查（本机 http://127.0.0.1，离线版 V14，本机模拟服务器上的 logistics-data.json：去掉 1 个应用、改了 AUTO-RACK 的说明）

| 步骤 | 结果 |
|---|---|
| 首次打开 | 标题下 “New data on the server · as of 2026-10-21 · published 2026-10-22 · Preview changes · Hide this update”；Import data 对话框顶部有同样一行和 “Preview server data” |
| Preview changes | 0 added · 1 updated · 1 removed · 73 unchanged；说明文字在顶部；变化明细：AUTO-RACK Description |
| Apply | “Updated 74 applications.”；提示消失；可 Undo；本机保存了工作 |
| 刷新 → Continue kept work | 74 个应用；提示不再出现 |
| 刷新 → Use the data in this file | 75 个应用；提示重新出现 |
| Hide this update | 提示条隐藏；Import data → Preview server data 仍能预览并 Apply（74 个） |
| Apply 后刷新 | 恢复提问写 “… published on the intranet server, as of 2026-10-21”，没有 “the data in this file may be newer”；Continue 后 74 个、无提示、无目录切换提示 |
| 服务器上的包被改过 | “The data package on the server could not be read: The data package was changed or damaged after it was published. The page keeps its current data.” |
| 服务器上没有包（404） | 无提示，页面正常 |

- 浏览器测试工具用脚本点击 “Continue kept work” 时，启动流程不继续（V13.3 同样如此），真实鼠标点击正常；以上步骤都用真实点击。
- 导出按钮没有在浏览器里点击（会产生下载），导出内容由测试覆盖。
- 测试后删除了本机测试服务器上的数据包，清除了浏览器存储。

未在 IIS 服务器上部署；服务器上还没有数据包。

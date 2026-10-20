# Logistics Digital Portfolio

物流工具（Logistics Digital Portfolio）交接包，当前版本 **V9.1（2026-10-20）**。本仓库包含真实的应用清单数据，请保持私有。

- **直接使用**：下载 [V9.1 离线包](offline/logistics-offline-20261020-v9.1.zip)，或到本仓库 Releases 下载同名文件，解压后用 Chrome 打开 `物流工具_最新版_离线单文件_20261020_v9.1.html`，不需要联网。页面顶部会明确显示 V9.1。
- **交接说明**：先读 `00_Claude先读.md`（中文，按日期记录每次改动和用户决定），再读 `program/README.md`（英文，"Current state" 一节是当前状态）。
- **程序源码**：`program/`（`npm ci`、`npm test`、`npm run build`、`npm run export:offline`，需要 Node 22.13 或更新版本）。

V9.1 更新 Capability 的二级检查：三级登记完整匹配、无待确认事项且能确认标准二级父项时，二级未单独登记不再算问题。To review、应用详情与 Level 2 合规统计使用同一规则；“filled”仍仅统计直接填写的记录。

保留 V9 的 Similarity check 操作顺序、候选展示、多选和返回位置。V8 已删除的比较摘要与人工评审表单保持删除。当前说明和验证边界见 `00_Claude先读.md` 顶部 V9.1 章节。

## 文件地图（给 AI 助手和新接手的人）

所有路径都相对于仓库根目录，在 GitHub 上的地址是 `https://github.com/2113326213-design/logistics-digital-portfolio/blob/main/<路径>`。程序是不需要框架的 ES 模块，页面逻辑都在 `program/public/`。

| 想找什么 | 在哪里 |
|---|---|
| 当前状态、改动记录、用户决定 | `00_Claude先读.md`、`program/README.md` |
| 内置数据（76 个应用、能力和流程目录） | `program/public/data.json`；由 `program/scripts/prepare-data.mjs` 从原始 Excel 重建 |
| LeanIX 流程导出（2026-10-20，26 条） | `program/public/leanix-process-export.mjs`（原样数据）、`program/public/leanix-processes.mjs`（按编号合并、名称差异、来源） |
| 数据模型：读入应用、匹配能力和流程 | `program/public/model.mjs`、`program/public/codes.mjs` |
| 页面入口和整体渲染 | `program/public/index.html`、`program/public/app.js` |
| Overview：各层级统计、To review | `program/public/overview.mjs`、`program/public/review-issues.mjs` |
| 应用详情：问题列表、流程匹配来源、源记录 | `program/public/process-issues.mjs`、`program/public/source-records.mjs`、`program/public/app.js` |
| Application landscape：分类列、逐级展开、Excel 编号 | `program/public/landscape.mjs`、`program/public/model.mjs`（`columns`） |
| Similarity check：评分 | `program/public/weighted.mjs`、`program/public/similarity.mjs`、`program/public/score-values.mjs` |
| Similarity check：页面、状态、证据 | `program/public/similarity-ui.mjs`、`program/public/pair-status.mjs`、`program/public/comparison-records.mjs`、`program/public/weight-controls.mjs` |
| 已保存的组合评审数据 | `program/public/similarity-guide.mjs`（`cleanPairReviews`）、`program/public/workspace.mjs` |
| ROI 回本时间、年度成本 | `program/public/roi.mjs`、`program/public/costs.mjs` |
| 导入 / 导出（Excel、工作区、CSV） | `program/public/xlsx.mjs`、`program/public/import-review.mjs`、`program/public/workspace.mjs`、`program/public/exports.mjs` |
| 样式 | `program/public/*.css` |
| 构建和离线单文件 | `program/scripts/build.mjs`、`program/scripts/export-offline.mjs` |
| 测试（`npm test`，当前 375 项） | `program/tests/*.test.mjs`；最近一次结果在 `verification/v9.1-test-results.txt` |
| 离线单文件版 | `offline/` |
| 构建输出、文件校验清单 | `built/`、`MANIFEST.sha256` |

规则提示：程序不会自动修改原始记录或业务数据；相似度分数只是线索，不代表确认重复。

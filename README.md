<p align="center"><img src="docs/images/banner.svg" alt="Logistics Digital Portfolio — 物流数字化应用组合工具" width="1000"></p>

<p align="center">
  <img src="docs/images/badge-version.svg" alt="version V9.15">&nbsp;
  <img src="docs/images/badge-tests.svg" alt="tests 442 passed">&nbsp;
  <img src="docs/images/badge-offline.svg" alt="offline single HTML, no install">&nbsp;
  <img src="docs/images/badge-data.svg" alt="data 76 apps, 10 plants">&nbsp;
  <img src="docs/images/badge-private.svg" alt="visibility private">
</p>

<p align="center">
  一个 HTML 文件，装下整个物流应用组合：<b>哪些应用登记不全</b> · <b>谁在做什么</b> · <b>哪些可能重复</b><br>
  <sub>当前版本 V9.15（2026-10-20） · 不需要安装、不需要联网 · 用 Chrome 打开即用</sub>
</p>

<p align="center">
  <a href="https://github.com/2113326213-design/logistics-digital-portfolio/releases/latest"><b>⬇&nbsp; 下载最新版</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp; <a href="#三个页面">三个页面</a>
  &nbsp;&nbsp;·&nbsp;&nbsp; <a href="#数据从哪里来">数据流</a>
  &nbsp;&nbsp;·&nbsp;&nbsp; <a href="#版本记录">版本记录</a>
  &nbsp;&nbsp;·&nbsp;&nbsp; <a href="00_Claude先读.md">接手说明</a>
  &nbsp;&nbsp;·&nbsp;&nbsp; <a href="#文件地图给-ai-助手和新接手的人">文件地图</a>
</p>

> [!IMPORTANT]
> 本仓库包含真实的应用清单数据，请保持**私有**，不要把下载链接转发给外部人员。

<br>

<table align="center">
  <tr>
    <td align="center" width="25%"><h3>76</h3><sub>应用 · 10 个工厂 · 5 个业务部门</sub></td>
    <td align="center" width="25%"><h3>2,850</h3><sub>组两两比较 · 7 组得分 ≥ 50</sub></td>
    <td align="center" width="25%"><h3>24 / 38</h3><sub>Process / Capability 待处理应用</sub></td>
    <td align="center" width="25%"><h3>442</h3><sub>项自动测试，全部通过</sub></td>
  </tr>
</table>

<br>

<p align="center"><img src="docs/images/overview.jpg" alt="Overview：应用维护质量总览" width="900"></p>

## 三个页面

### 📊 Overview — 谁登记得不完整

按工厂查看 Business Capability 和 Process 各层级的**填写率**和**标准匹配率**。**To review** 列出需要处理的应用；点 **View details** 看具体是哪条记录、对照的是哪个版本的目录、下一步要确认什么。Level 3 已正确登记、能找到标准上级时，上级未单独登记不再算问题。

### 🗺️ Application landscape — 谁在做什么

按业务能力或流程分类排列全部应用，分类旁的 **+** 一层一层展开，**Category** 下拉按 Level 0–3 分组、编号与原始 Excel 一致。一眼看出哪个分类下挤了很多应用、哪个分类是空的。

### 🔍 Similarity check — 哪些可能重复

按名称、描述、能力、流程四项加权打分，找出可能重叠的应用组合。顶部 **Score settings** 调整权重和最低分；资料不全、无法比较的应用在 **Check application records** 中按应用列出，而不是让你逐对去看。分数只是线索，不代表确认重复。

<table>
<tr>
<td width="50%"><img src="docs/images/landscape.jpg" alt="Application landscape"><p align="center"><sub>Application landscape · 逐级展开</sub></p></td>
<td width="50%"><img src="docs/images/similarity.jpg" alt="Similarity check"><p align="center"><sub>Similarity check · 潜在重叠列表</sub></p></td>
</tr>
</table>

## 数据从哪里来

```mermaid
flowchart LR
  inv["LeanIX 应用清单<br/>20260825_logistic_inventory.xlsx"] --> prep
  std["流程标准快照<br/>Business Capability + Process.xlsx · 21.02.2025"] --> prep
  cap["能力标准<br/>standard+name.xlsx"] --> prep
  prep["prepare-data.mjs<br/>从原始 Excel 重建"] --> data[("data.json<br/>内置数据")]
  lx["LeanIX 流程导出 2026-10-20<br/>26 条 M.I2D 流程"] -. 按编号增量合并 .-> model
  data --> model["model.mjs<br/>匹配能力与流程"]
  model --> ov["Overview"]
  model --> ls["Application landscape"]
  model --> sim["Similarity check"]
  ov & ls & sim --> html["离线单文件 HTML<br/>offline/"]
  classDef src fill:#e8f3fa,stroke:#0071a8,color:#173f58
  classDef out fill:#e6f7ef,stroke:#2e9e5b,color:#14532d
  class inv,std,cap,lx src
  class html out
```

原始记录只读，程序不会自动改动 LeanIX 或业务数据；所有修正都要人工确认后在 LeanIX 里改。

## 快速开始

1. 到 [Releases](https://github.com/2113326213-design/logistics-digital-portfolio/releases/latest) 下载 `logistics-offline-20261020-v9.15.zip`（仓库里的 [`offline/`](offline/) 也有同一个文件）。
2. 解压，用 Chrome 打开 `物流工具_最新版_离线单文件_20261020_v9.15.html`。页面顶部会显示 V9.15。
3. 页面里的修改只保存在当前标签页：用 **Export workspace** 导出备份，下次用 **Import data** 恢复。

### 部署到 Bosch 内网 IIS（Windows Server）

1. 在服务器的 Chrome 里（已登录 GitHub）点这个链接直接下载：[**⬇ deploy-iis-v9.15-script.zip**](https://github.com/2113326213-design/logistics-digital-portfolio/raw/main/offline/deploy-iis-v9.15-script.zip)，右键 Extract all。
2. 把 `logistics-offline-20261020-v9.15.zip` 放在同一个文件夹或 `Downloads`，右键 `deploy-iis-v9.15.bat` → **Run as administrator**。
3. 默认部署到 `D:\logistics-tool`、端口 `8083`；要换就在 cmd 里带参数：`deploy-iis-v9.15.bat 8084 D:\其他目录`。

脚本会校验 HTML 的 SHA-256、备份旧 `index.html`、按 SID 授予 IIS_IUSRS/IUSR 读取权限，只新建自己的 `LogisticsTool` 站点，**不改防火墙和其他站点**。源文件：[`offline/deploy-iis-v9.15.bat`](offline/deploy-iis-v9.15.bat)。

想改程序：`program/` 是源码（原生 ES 模块，没有框架）。`npm ci` → `npm test` → `npm run build` → `npm run export:offline`，需要 Node 22.13 或更新版本。接手前先读 [`00_Claude先读.md`](00_Claude先读.md)（中文，按日期记录每次改动和用户决定），再读 [`program/README.md`](program/README.md)（英文，"Current state" 一节是当前状态）。

## 主要规则

| 规则 | 含义 |
|---|---|
| **不自动改数据** | 程序只读原始记录；LeanIX 和业务数据的修改都要人工确认。 |
| **层级覆盖** | Level 3 已正确登记、能找到标准上级时，上级未单独登记不再算问题（Capability Level 2；Process Level 0–2）。"filled" 仍只统计直接登记。 |
| **相似度只是线索** | 分数来自文字和分类编号的重合，不代表业务功能确认重复；要对照描述并和负责人确认。 |
| **流程来源可追溯** | 流程标准以 21.02.2025 的快照为准，2026-10-20 的 LeanIX 导出按编号合并进来，新旧名称并列保留，差异标为待确认。 |

## 版本记录

<details open>
<summary><b>V9 系列（2026-10-20）</b> — 点击收起</summary>
<br>

| 版本 | 主要变化 |
|---|---|
| [V9.15](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.15-20261020) | 单对比较按应用列出待核对记录并直达详情；切换页面保留比较；Deferred detail 移入计算说明；阈值随备份导出、导入，导出提示分状态 |
| [V9.14](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.14-20261020) | 已隐藏的其他比较结果不再在页面里生成（页面更轻）；关闭应用详情后焦点回到原入口 |
| [V9.13](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.13-20261020) | 单应用比较第二步改为按名称排列的 Choose another application |
| [V9.12](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.12-20261020) | 多应用比较给出下一步（Compare actual uses）；待核对资料按应用去重 |
| [V9.11](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.11-20261020) | 隐藏 "other comparison results and screening reasons" 入口 |
| [V9.10](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.10-20261020) | 其他比较结果默认收起 |
| [V9.9](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.9-20261020) | 受资料影响的 1,159 对比较归并为 19 个待核对应用 |
| [V9.8](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.8-20261020) | Score settings 移到 Similarity check 顶部 |
| [V9.7](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.7-20261020) | Overview 列表不再展开问题说明，点 View details 查看 |
| [V9.6](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.6-20261020) | 应用详情只显示待检查的问题 |
| [V9.5](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.5-20261020) | Process Level 0、Level 1 也由已确认的 Level 3 覆盖；Process To review 45 → 24 |
| [V9.4](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.4-20261020) | 能力全在 B.06 之外的应用，比较页改为 "Not compared · outside the B.06 scope" |
| [V9.3](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.3-20261020) | Category 下拉按 Level 0–3 分组排序 |
| [V9.2](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.2-20261020) | Process Level 2 覆盖规则；修复导入预览报错；统一状态标签 |
| [V9.1](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.1-20261020) | Capability Level 2 由已确认的 Level 3 覆盖 |
| [V9](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9-20261020) | Similarity check 按步骤比较，返回时保留位置 |
| [V8](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v8-20261020) | 并入 LeanIX 流程导出；删除比较说明和 Your review 区域 |

</details>

更早的版本和每次改动的详细说明见 [`00_Claude先读.md`](00_Claude先读.md)；每个版本的验证记录在 [`verification/`](verification/)。

## 文件地图（给 AI 助手和新接手的人）

<details>
<summary><b>展开文件地图</b> — 所有路径都相对于仓库根目录，页面逻辑都在 <code>program/public/</code></summary>
<br>

在 GitHub 上的地址是 `https://github.com/2113326213-design/logistics-digital-portfolio/blob/main/<路径>`。

| 想找什么 | 在哪里 |
|---|---|
| 当前状态、改动记录、用户决定 | `00_Claude先读.md`、`program/README.md` |
| 内置数据（76 个应用、能力和流程目录） | `program/public/data.json`；由 `program/scripts/prepare-data.mjs` 从原始 Excel 重建 |
| LeanIX 流程导出（2026-10-20，26 条） | `program/public/leanix-process-export.mjs`（原样数据）、`program/public/leanix-processes.mjs`（按编号合并、名称差异、来源） |
| 数据模型：读入应用、匹配能力和流程 | `program/public/model.mjs`、`program/public/codes.mjs` |
| 页面入口和整体渲染 | `program/public/index.html`、`program/public/app.js` |
| Overview：各层级统计、To review、上级由三级确认的规则 | `program/public/overview.mjs`、`program/public/review-issues.mjs`（`capabilityLevel2Coverage`、`processAncestorCoverage`） |
| 应用详情：问题列表、源记录 | `program/public/process-issues.mjs`（`focusApplicationIssue` 定位问题）、`program/public/source-records.mjs`、`program/public/app.js` |
| Application landscape：分类列、逐级展开、Excel 编号、Category 下拉（按层级排序） | `program/public/landscape.mjs`（`categoryOptions`）、`program/public/model.mjs`（`columns`） |
| Similarity check：评分 | `program/public/weighted.mjs`、`program/public/similarity.mjs`、`program/public/score-values.mjs` |
| Similarity check：页面、状态、证据 | `program/public/similarity-ui.mjs`、`program/public/similarity-readiness.mjs`（按应用归并待检查记录）、`program/public/pair-status.mjs`、`program/public/comparison-records.mjs`、`program/public/weight-controls.mjs` |
| 已保存的组合评审数据 | `program/public/similarity-guide.mjs`（`cleanPairReviews`）、`program/public/workspace.mjs` |
| ROI 回本时间、年度成本 | `program/public/roi.mjs`、`program/public/costs.mjs` |
| 导入 / 导出（Excel、工作区、CSV） | `program/public/xlsx.mjs`、`program/public/import-review.mjs`、`program/public/workspace.mjs`、`program/public/exports.mjs`、`program/public/score-settings.mjs`（阈值随备份）、`program/public/offline-save.mjs`（离线导出提示） |
| 样式 | `program/public/*.css` |
| 构建和离线单文件 | `program/scripts/build.mjs`、`program/scripts/export-offline.mjs` |
| 测试（`npm test`，当前 442 项） | `program/tests/*.test.mjs`；最近一次完整结果在 `verification/v9.15-test-results.txt` |
| 离线单文件版 | `offline/` |
| README 横幅、徽章和截图 | `docs/images/` |
| 构建输出、文件校验清单 | `built/`、`MANIFEST.sha256` |

</details>

<br>

<p align="center"><sub>Logistics Digital Portfolio · 2026 · 离线、只读、可追溯</sub></p>

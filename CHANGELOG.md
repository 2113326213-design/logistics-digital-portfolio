# 更新日志 · Changelog

每个版本的离线包在 [Releases](https://github.com/2113326213-design/logistics-digital-portfolio/releases)；详细的修改说明和用户决定在 [`00_Claude先读.md`](00_Claude先读.md)，验证记录在 [`verification/`](verification/)。

## [V13.3](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v13.3-20261022) · 2026-10-22

- **HC 记录不再使用**（用户：“HC的开头的都不需要了，那个是其他公司的”）：2026-10-19 起 HC 条目已不进能力目录，但各应用自己的 HC 记录还保留在“B.06 范围外”。现在凡是以 `HC.` 开头的能力或流程记录（以及 Main Business Capability）都不参与任何统计、地图、搜索、待处理、数据检查和相似度；原始记录不改，应用详情的 Source records 原样列出并写明 “Not used: … (HC entries belong to another company)”。目前只有 Wuj HK AGV 有一条（HC.02.04.05 Transportation Management）：Application landscape 少了 HC.02 一列（13 → 12），To review 少了 1 项（“能力编码缺失 HC.02.4.5”），它的数据检查从 “HC 记录 Level 3 待确认” 变为 “Level 3 missing”（只登记了 B.06.5）。相似度的 2775 对结果完全不变。所有者若把某条 HC 记录映射到我们的能力，映射照常生效。

## [V13.2](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v13.2-20261022) · 2026-10-22

- **部署只需下载一个文件**（用户在 V11 和 V13.1 两次只下载了部署脚本，脚本停在 “…zip not found”）：`deploy-iis.bat` 放进发布 zip `logistics-offline-<日期>-<版本>.zip`，和离线 HTML 在一起。服务器上：下载这个 zip 存在 Downloads → 打开 → 双击 `deploy-iis.bat`。脚本仍校验 HTML 的 SHA-256；不符时在复制文件之前停下，写明删掉哪个 zip、重新下载，并等待按键。Release 不再附 `deploy-iis-script.zip`。`npm run deploy:sim` 扩展为 10 种情况。
- **发布打包不再改写已有的发布 zip**：`npm run release:files` 遇到同一版本已有的发布 zip，只要内容不同（哪怕 HTML 相同、只是里面的脚本不同）就停下，要求新的版本号。发布前发现本机的 V13.1 zip 曾被这样改写，已恢复为 GitHub 上发布的原件。
- **同一天再次部署也会显示新版本**（发布前复核发现）：发布 zip 里每个文件的时间都是发布日期 00:00，同一天的几个版本部署后 index.html 的时间完全相同，IIS 据此判断“没变”，浏览器可能继续显示旧版本。脚本在复制后把 index.html 的时间设为部署时刻（失败时只提示按 Ctrl+F5，不中断部署）。此问题自 V9.16 起就有。

## [V13.1](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v13.1-20261022) · 2026-10-22

- **搜索框统一**（用户确认 2026-10-22）：标题右侧、Application landscape、Overview 卡片点开的应用列表、Similarity check 的 Compare an application 第 1 步和第 2 步、Compare multiple applications，这 6 个找应用的搜索框都叫 **Find applications**，提示都是 “Name, ID, plant or business unit”，规则相同：输入的每个词都要出现在名称、工厂或业务单元里，或是应用 ID 的开头（不分大小写和全角半角；ID 是很长的生成码，只认开头，避免中间的片段匹配到无关应用）。以前比较窗口里不能按 ID 搜、Compare multiple applications 也不能按业务单元搜，现在都可以。Application landscape 另外仍可按分类编号或分类名称搜（早先的要求，按整句匹配，与 V13 相同；提示写作 “Name, ID, plant, business unit or category”）。标题搜索框加了放大镜图标和 “/” 快捷键提示；窗口较窄、标题行放不下时，搜索框和按钮换到标题下方靠右，不再盖住标题。
- **比较窗口只留一个 Clear selection**：原来 “1. Select applications” 里和 “N selected” 旁边各有一个，作用完全一样；现在只留 “N selected” 旁边那个（折叠选择列表时也看得到）。

## [V13](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v13-20261022) · 2026-10-22

- **应用搜索**：页面标题右侧新增 **Find an application** 搜索框。输入名称、应用 ID、工厂或业务单元的一部分（多个词时每个词都要对上），最多列出 8 个结果，名称开头相符的排在最前；方向键选择、回车或点击打开应用详情（地址栏同时带上 ?app=，可直接复制分享），Esc 清空。在任意页面不在输入框里时按 **/** 键直接定位到搜索框。
- **导入读最新的表**：Import data 选的工作簿里有多张 Logistic Apps_<日期> 表（如自有工作簿同时有 Logistic Apps_1021 和 Logistic Apps_0825）时，读取日期最新的一张，不再取决于表的排列顺序；工作簿里有一张正好叫 Logistic Apps 的表时仍读它。导入预览的 Inventory 一行写明 “· sheet <表名>”，有多张时另起一行说明有哪些表、读了哪一张。

## [V12](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v12-20261022) · 2026-10-22

- **数据日期**（用户选择 2026-10-22）：页面标题下面显示 “Data: <文件名> · as of <日期>”。日期取自文件名里的 YYYYMMDD（自有工作簿和 LeanIX 导出都是这种命名）；没有时用 LeanIX 导出时间，再没有时显示导入日期。导入新表、撤销导入、恢复备份或继续本机保存的工作后都会跟着更新。
- **部署脚本**（用户在服务器上遇到 “logistics-offline-20261022-v11.zip not found”）：Downloads 里没有同名压缩包时，接受浏览器存成的 “<同名> (1).zip” 等副本（取最新的一份，后面仍校验 SHA-256）；还找不到时写明要下载什么，并列出 Downloads 里现有的 logistics-offline-*.zip。`npm run deploy:sim` 扩展为 7 种情况。

## [V11](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v11-20261022) · 2026-10-22

- **改动自动保存在本机**：页面里的调整（映射、审核备注、权重、最低分、导入）在停顿约半秒后保存在这台电脑的浏览器里。下次打开时询问“Continue kept work / Use the data in this file”，并可先 “Export kept work”；文件是更新的版本或数据时会提醒。浏览器不允许保存时沿用以前的规则（只在本标签页，离开时提醒）。页面顶部提示改为 “Your changes are kept in this browser on this computer — use Export workspace to back them up or share them.”
- **To review 导出**：Overview 的 “Export To review (CSV)” 按当前业务部门和工厂筛选导出全部待处理问题（两个维度，每个问题一行：工厂、业务部门、应用、维度、层级、问题、来源记录、要核对什么、详细说明、数据来源）。
- **应用直达链接**：网址带 `?app=<应用 ID>` 时直接打开该应用；打开详情时地址栏随之更新，关闭时去掉；详情里 “Copy link to this application” 复制链接（在线版可直接发给同事）。

## [V10](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v10-20261022) · 2026-10-22

- 导入预览新增“变化明细”（用户要求 2026-10-22）：点 Apply 之前按应用列出每个字段的“原值 → 新值”；Business Capabilities 和 Processes 只列出删掉（−）和新增（+）的条目；只在来源位置（表和行）变化的应用单独说明数量。
- “Export change details (CSV)” 按钮：同样的明细导出为 Excel 可直接打开的 CSV（每个变化的字段一行，新增和删除的应用各一行）。
- 明细与导入后应用历史里记录的变化是同一份比较：用 2026-10-21 的导入核对过，104 处字段变化逐条一致。
- 版本号规则（用户 2026-10-22 确认）：新的数据来源、新的功能模块，或页面结构有可见变化 → 升大版本（V10、V11……）；修正、文字和显示调整 → 升小版本（V10.1、V10.2……）。本版因此是 V10，不是 V9.20。

## [V9.19](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.19-20261022) · 2026-10-22

- 用户决定（2026-10-22）：页面顶部的提示只留一行——版本、日期和 “Changes stay in this tab — use Export workspace to keep them.”。
- “Offline edition” 和 “All data is included in this file; no internet connection is required.” 只在双击文件打开（file://）时显示；通过内网网址（IIS）打开时不显示，右上角也不再显示 “Offline edition”。
- 删掉开发时留下的内部说明 “Incomplete Level 3 records are currently deferred.”。

## [V9.18](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.18-20261022) · 2026-10-22

- 负责人确认（2026-10-22）：RBCW Auto Warehouse Management System 的 “BBM PM I2D Transport Material Intra Plant L3” 和 AUTO-RACK 的 “BBM PM I2D Putaway to Automated Warehouse L3V” 按原样登记有效。流程目录里没有这两个流程，所以没有标准编号。
- 新的“负责人确认按原样登记”记录（`data.acceptedRecords`）：被确认的记录不再列为待处理（To review、应用详情的问题、数据检查、相似度的待核对资料），应用详情和历史里写明确认人、日期和原因；仍不算“匹配标准”。只要应用的登记原文不变就一直有效，原文一改就重新检查。
- Process To review 23 → 22（AUTO-RACK 移出）；Overview 的 Level 3 卡片显示 “18 Level 3 to review · 2 confirmed as recorded”；Level 3 匹配标准不变（55 / 75）。

## [V9.17](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.17-20261021) · 2026-10-21

- 并入 2026-10-21 的自有工作簿（Logistic Apps_1021，新增 Status in Oct）：Status 不是 still active 的 3 个应用和 no score 的 5 个一样不计入成本、ROI 和相似度检查；CGQB_Logistic_system_Q 不在新清单里，已移出；14 个成本分、9 个 ROI 分按新的 Parameter Score 更新；ROI 继续按公式显示回本时间；计入 67 个应用，年成本 ¥2,890,000；Capability To review 40 → 39
- 2026-10-22：IIS 部署脚本修复——`appcmd` 按完整路径调用，部署一律在不会自动关闭的窗口里进行，UAC 失败会写明原因；新增 `npm run deploy:sim` 本机模拟，并写入长期有效的“部署脚本编写规则”。Release 里的 `deploy-iis-script.zip` 已替换。
- 2026-10-22：README 按 Sniffnet 的版式改版——横幅下一排彩色按钮（下载、在线版、使用说明、更新日志、反馈），一句话介绍，再放 V9.17 的大截图（1440×900 实拍）；按钮和徽章由 `npm run readme:art` 生成。新增 LICENSE（内部使用许可）、SECURITY.md 和本日志。

## [V9.16](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.16-20261021) · 2026-10-21

- 并入 2026-10-20 的 LeanIX 应用导出（按 ID 更新 35 个应用；未包含的 5 个保留并标注）；Import data 接受 LeanIX 导出格式；Process To review 24 → 23，Capability 38 → 40

## [V9.15](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.15-20261020) · 2026-10-20

- 单对比较按应用列出待核对记录并直达详情；切换页面保留比较；Deferred detail 移入计算说明；阈值随备份导出、导入，导出提示分状态

## [V9.14](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.14-20261020) · 2026-10-20

- 已隐藏的其他比较结果不再在页面里生成（页面更轻）；关闭应用详情后焦点回到原入口

## [V9.13](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.13-20261020) · 2026-10-20

- 单应用比较第二步改为按名称排列的 Choose another application

## [V9.12](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.12-20261020) · 2026-10-20

- 多应用比较给出下一步（Compare actual uses）；待核对资料按应用去重

## [V9.11](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.11-20261020) · 2026-10-20

- 隐藏 "other comparison results and screening reasons" 入口

## [V9.10](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.10-20261020) · 2026-10-20

- 其他比较结果默认收起

## [V9.9](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.9-20261020) · 2026-10-20

- 受资料影响的 1,159 对比较归并为 19 个待核对应用

## [V9.8](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.8-20261020) · 2026-10-20

- Score settings 移到 Similarity check 顶部

## [V9.7](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.7-20261020) · 2026-10-20

- Overview 列表不再展开问题说明，点 View details 查看

## [V9.6](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.6-20261020) · 2026-10-20

- 应用详情只显示待检查的问题

## [V9.5](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.5-20261020) · 2026-10-20

- Process Level 0、Level 1 也由已确认的 Level 3 覆盖；Process To review 45 → 24

## [V9.4](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.4-20261020) · 2026-10-20

- 能力全在 B.06 之外的应用，比较页改为 "Not compared · outside the B.06 scope"

## [V9.3](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.3-20261020) · 2026-10-20

- Category 下拉按 Level 0–3 分组排序

## [V9.2](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.2-20261020) · 2026-10-20

- Process Level 2 覆盖规则；修复导入预览报错；统一状态标签

## [V9.1](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9.1-20261020) · 2026-10-20

- Capability Level 2 由已确认的 Level 3 覆盖

## [V9](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v9-20261020) · 2026-10-20

- Similarity check 按步骤比较，返回时保留位置

## [V8](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v8-20261020) · 2026-10-20

- 并入 LeanIX 流程导出；删除比较说明和 Your review 区域

## 更早的版本

V1–V7（2026-10-13 至 2026-10-20）的说明见 [`00_Claude先读.md`](00_Claude先读.md) 的历史段落。

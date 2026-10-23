# 更新日志 · Changelog

每个版本的离线包在 [Releases](https://github.com/2113326213-design/logistics-digital-portfolio/releases)；详细的修改说明和用户决定在 [`00_Claude先读.md`](00_Claude先读.md)，验证记录在 [`verification/`](verification/)。

## [V17.3](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v17.3-20261022) · 2026-10-23

- 给工厂用户的措辞（用户经侧边会话 2026-10-23：“第一个可以 第二个我感觉不要显示 第三个别显示第五个不用显示”）：
  - Import data 底部的发布一节标题改为 **Only for the data maintainer: publish this data to the intranet server**，第一句 “Plant users do not need this.”。
  - 总览 “Level 3 to review” 旁不再显示 “· N confirmed as recorded”（确认为原样登记的记录仍照常不算待处理，应用详情里仍可看到）。
  - 本地流程（V17）名称后不再标注 “(LeanIX local)”；来源说明改为 “LeanIX export (BBM PM process, not in the Signavio standard)”。“L3V” 的单独说法 V17.2 已去掉，原始记录里的 “L3V” 是原文，不改。
  - 总览数字和服务器新数据提示不变。

## [V17.2](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v17.2-20261022) · 2026-10-23

- **L3V 就是 L3，写死**（用户：“L3和L3V看做统一等级 … 之后要把这个写入死，不要变了 L3v就是L3”）。检查全部代码后，有 3 处把 L3V 当成和 L3 不同：
  - 待处理提示：L3V 没对上标准表时写 “Recorded as L3V; no Level 3 process of this name in the current catalogue. Confirmation is required.”，L3 写 “No confirmed match in the current process catalogue.”——现在两者相同（后者）。
  - 标准表对 LeanIX 的核对（V16）：L3V 名称对不上时单独算 “local variants (L3V)”、只以 L3V 出现的标准流程单独注明——现在 L3V 与 L3 一样列在 “In LeanIX, not in the catalogue”，不再单独计数和注明。
  - 本地流程层（V17）：不再区分 L3V（不存 variant，说明文字相同）。
- 新增 `tests/l3v-is-l3.test.mjs`（锁定）：同一份数据把所有 Level 3 写成 L3 或 L3V，匹配、待处理、待处理提示、总览数字、2775 个相似度配对、LeanIX 两项核对必须完全相同；且程序代码（注释除外）不得出现 “L3V”。这些测试在 V17.1 的代码上有 3 项失败。
- **AUTO-RACK 的 “Needs confirmation”**：AUTO-RACK 自己的 6 条流程记录都已对上或已由所有者确认为原样登记；它有 12 个配对显示 “Needs confirmation”，原因是**对方**应用有标准表里没有的流程（如 “Load Truck L3”、几条 L3V、“BBM_P2S_LE …” 等）。这些在 Import data 里应用 LeanIX 本地流程层（V17）后大多能对上。

## [V17.1](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v17.1-20261022) · 2026-10-23

- 修正：LeanIX 里两个本地流程同名（在不同上级下）时，挂在这个名称下的子流程不再按导出行的先后随便挂到其中一个，而是不加入并写明原因（复核发现）。例：LeanIX 里 “BBM PM I2D Dup Area L2” 分别在两个上级下各有一条，另一条流程的 Parent 写的是这个名称——以前会挂到导出里排在后面的那一个（换个顺序结果就变），现在不加入，原因 “Its LeanIX Parent name is used by several local processes, so the Parent is not clear.”。同一个本地流程在同一上级下重复出现时仍算一个，子流程照常加入。与标准流程同名多编号时不按顺序决定的规则一致。
- 用户：“不要重要去除吧”——这类说不清的情况直接不加入。

## [V17](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v17-20261022) · 2026-10-23

- **LeanIX 本地流程层**（用户 2026-10-23：“Signavio 标准为主，LeanIX 的 BBM PM 本地流程作为单独标注的一层加进流程目录，导入时先预览再 Apply”）。工具的流程目录仍是 Signavio 标准（Business Capability + Process 表）；在 Import data 选 LeanIX 流程导出后，流程核对里多了 **LeanIX local processes** 一节：
  - 能加入的：名称是 “BBM PM <链> <名称> L1–L3 / L3V”、标准里找不到（名称规则、所有者映射、同名、一编号两名称都对不上）的流程，挂在 LeanIX Parent 之下（Parent 是标准流程，或本次一起加入的本地流程）。
  - 不能加入的列出原因：没有 Parent、Parent 找不到、Parent 在别的链、层级不对、标准里这个名称在别的链等。
  - **Preview the local process layer** 打开普通的导入预览（Taxonomy · Changed），**Apply** 后才生效，可 Undo；再导入新的导出时整层替换。
- 本地流程的编号是 “上级编号 + .L + LeanIX Fact Sheet ID 前 8 位”（如 M.I2D.030.070.L1a2b3c4d），所以层级、Level 3 判断等照常；名称后标注 “(LeanIX local)”，来源写明 “LeanIX export (local process, not in the Signavio standard)”。同名时 Signavio 标准优先。
- 应用登记了本地流程的，不再列为 “流程未匹配层级表”；标准对 LeanIX 的核对（V16）只比较 Signavio 标准，本地层的 LeanIX 流程单独计数。
- 本地流程层随工作区保存、导出，也随数据包发布到服务器。没有本地流程层时，所有结果与 V16 完全相同（四组数据逐项比对）。

## [V16](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v16-20261022) · 2026-10-22

- **标准流程目录对 LeanIX**（用户：“我还缺少 process process id processname”，随后 “business CAPABILITY + PROCESS那个表格 和我拉出来的新的 … 一些缺少的？我要去补齐的”）：在 Import data 选 LeanIX 流程导出后，预览先显示 **Standard catalogue against LeanIX**。工具的流程目录（Business Capability + Process.xlsx 的 Data_RBW Process Structure：RBW E2E Process Chain、Process Level、Process ID、Process Name）里的每个流程，按应用记录所用的同一条名称规则（“BBM PM <链> <名称> L<层级>”）在导出里找：
  - **Missing in LeanIX**：导出涉及到的流程链里，标准目录有、LeanIX 没有的流程，列出 Process chain、Level、Process ID、Process Name 和 LeanIX 里应有的名称。
  - **In LeanIX, not in the catalogue**：LeanIX 里以 L0–L3 结尾、但对不上目录的流程，并写明原因（该层级没有这个名称、只在别的流程链里有、目录里这个编号有两个名称）和候选。
  - 所有者做过的流程映射照样算（例如 “BBM PM DM Data Management L0” → M.MDM）。目录里同一层级同一链下重名的流程（如 Register Truck）按 LeanIX 的 Parent 列判断是哪一个；Parent 判断不了时，LeanIX 里这个名称有几条就算几个，其余标为 **Possibly missing**（可能缺少，请核对）。
  - 导出里出现了 “BBM PM <链>” 名称的流程链都比较（即使名称都对不上）；一个都没出现的链不比较，只列出链和流程数。目录里一个 Process ID 对应两个名称的（1 个）不比较。
  - L3V 本地变体（在 L2 之下，不属于标准目录）和名称末尾没有 L0–L3 的流程（如 “BBM_PPM_PM …”、“ETAS.…”）只计数，放在 CSV 里，不算要改的名称；只以 L3V 形式出现的标准流程单独注明。
  - **Download catalogue check (CSV)**：标准目录的全部流程按原表顺序，每行带结果（In LeanIX / Missing / Possibly missing / Not compared…）、LeanIX 应有名称（空格已整理）、找到的 LeanIX 名称和 ID、说明；然后是不在目录里的、L3V 和其他命名的 LeanIX 流程。前四列与 Data_RBW Process Structure 相同，方便逐行补齐。
- **按应用的核对**：每个流程旁显示标准 Process ID（应用自己的记录用工具里的对应，含所有者映射）；**Download check (CSV)** 增加 Process ID 和 Process Name 两列。LeanIX 用 “名称 + 版本” 称呼应用（如 “Supply Chain Management System 1.0”），现在也能对上；LeanIX 还把这些流程挂到上万个工具以外的应用，只显示数量，不再逐个列出；工具里的应用在 LeanIX 里一个流程都没挂时，列出相似的 LeanIX 名称供核对。
- **用真实导出验证过一次**（用户同意破例，读完即删）：3560 个流程；修正前比较 1567 个、LeanIX 有 1094、缺 473、对不上 2254（其中 1315 个 L3V、800 个其他命名）；75 个应用中 70 个一致，5 个差异里 4 个是应用名带版本号造成的误报。另一次导出确认 LeanIX 的 BBM Signavio ID 全为空、External ID 只出现在 BBM_PPM 和 ETAS 的流程上，所以 BBM PM 流程只能按名称对应。
- 名称对应规则从 `model.mjs` 的 buildModel 里抽成 `processLookup`，应用记录和这次核对共用同一条规则；抽取前后模型输出逐项相同（真实数据和三种变体）。
- 仍然只核对，不改任何数据，没有 Apply。

## [V15](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v15-20261022) · 2026-10-22

- **LeanIX 流程核对**（用户选 A：“先只核对、不改数据。导入预览按应用列出 LeanIX 里挂的流程和工具里登记的流程哪些对得上、哪些只有一边有。”）：在 **Import data** 第 1 格选 LeanIX 流程导出（保存的视图 “BBM PM process”，必须带 **Applications** 列），**Preview changes** 显示 “LeanIX process check”：应用总数、有差异 / 一致 / 本导出里没有其流程的数量；有差异的应用排在前面并展开，每个应用分三栏列出 **Only in LeanIX**、**Only in the tool**、**In both**。
- 规则：应用按名称对应（LeanIX 的 Applications 列是分号分隔的应用名称）；流程按名称对应，忽略大小写、空格和 “&” / “and” 的写法差别，Name、Display Name、Full Name 任一相同都算同一个流程。工具里登记、但这份导出里根本没有的流程（例如不属于 BBM PM 的 “RBCC | Warehouse Delivery”）不算差异，单独注明 “not in this export”。HC 开头的记录属于其他公司，不比较（与 V13.3 一致）。LeanIX 里出现、工具里没有同名应用的，单独列出以便核对名称；工具里同名的多个应用会标出。
- **只核对**：不改任何数据，没有 Apply 按钮，历史也不记录。**Download check (CSV)** 每行一个应用和流程（Result 为 In both / Only in LeanIX / Only in the tool / Not in this export），用 Excel 打开。导出的时间按 ReadMe 里的 GMT 换算成北京时间显示。
- 选了没有 Applications 列的流程导出（如 2026-10-20 那份）时，页面说明要在 LeanIX 的 Manage columns 加上 Applications 再导出；流程导出要单独选，不能同时选第二个文件。
- 数据只在公司电脑上处理：维护者只按截图里的版式写读取和测试（测试用同样版式的合成文件），没有接触真实导出。

## [V14](https://github.com/2113326213-design/logistics-digital-portfolio/releases/tag/v14-20261022) · 2026-10-22

- **数据包**（用户选定方案 A：没有 LeanIX API，IT 不提供；服务器也登不上 LeanIX）：数据管家在工具里导入 LeanIX 导出并 Apply 后，在 Import data 对话框底部导出 `logistics-data.json`，复制到服务器 `D:\logistics-tool\`。用内网网址打开的页面会读取它（只在 http/https，离线文件从不读取）：如果它的数据和当前页面不同，标题下提示 “New data on the server · as of … · published …”，**Preview changes** 用与导入文件相同的预览和 Apply；**Hide this update** 只隐藏这条提示，Import data 对话框顶部的 **Preview server data** 仍可打开它。
- 数据包只含共享数据（应用清单、能力和流程目录、所有者的映射和确认），应用后个人的备注、配对审核、打分设置、历史和自己的映射都保留。所有者的映射按编号以数据包为准：数据管家撤销或替换的会同步（你自己撤销的保持撤销），撤销人和原因也一起带来；随版本内置的映射同样算共享决定，数据包对同一条记录另有决定时以数据包为准；上一个数据包带来的映射算数据管家的：新数据包里没有了，就是数据管家撤回了，从你这里去掉；只有你在自己浏览器里另加的映射算你自己的，保留，并在同一条记录上优先于数据包；“confirmed as recorded” 以数据包为准。应用数据包后再导入 Excel 或分类表，就不再算 “服务器上的数据”，服务器上的数据包会重新提示。只有应用后确实有变化时才提示，提示出现时一定能 Apply；已经应用过的同一个数据包不再提示（新版本打开时为同一来源补回字段，也不会让它反复出现）。打开页面时的恢复提问能认出来自服务器数据包的工作，不再误说 “本文件的数据可能更新”。数据包带内容指纹：被改过或损坏时页面会说明并保持原数据；比页面当前数据更旧的不会提示（防止服务器上留着旧文件时把新版本的数据“降级”）。
- 页面唯一的网络请求就是读取这一个文件（GET，不缓存）；测试从“完全不联网”改为精确检查这一条。
- 新增 `tools/leanix/`（整理 LeanIX 导出的脚本），`.gitignore` 与 MANIFEST 永远排除 `leanix_export/` 和 `leanix_processes*.csv`。GitHub 私有仓库继续保存工具的真实数据（用户 2026-10-22 决定），LeanIX 原始导出不上传。

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

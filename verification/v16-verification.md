# V16 验证记录 — 2026-10-22

基线：仓库 c5d1bfb（V15）。用户：“我还缺少 process process id processname”；“business CAPABILITY + PROCESS那个表格 和我拉出来的新的 … 一些缺少的？我要去补齐的”。

## 改动

LeanIX 流程核对里新增 “Standard catalogue against LeanIX”：标准流程目录（Process ID、Process Name）中 LeanIX 导出缺少的流程及 LeanIX 里应有的名称、LeanIX 里不在目录中的流程及原因，可下载目录 CSV 逐行补齐；按应用的核对加上标准 Process ID / Process Name。名称对应规则抽成 `processLookup`，应用记录和核对共用。只核对，不改数据。

## 自动检查

- 规则抽取前后，buildModel 的输出（应用、问题、冲突、分类问题、流程和能力节点、已确认记录）在真实数据、去掉映射、旧分类表、加入边界记录（M. 编码、无链、错链、无层级、L3V、& / and、小写）四种情况下逐项相同。
- `npm test`：528 项通过，0 失败。日志：`v16-test-results.txt`。新增 `tests/v16-catalogue-check.test.mjs`；`v15-leanix-process-check` 按新列更新。
- `npm run build`、`npm run export:offline`、`npm run release:files` 通过；`npm run deploy:sim` 10 / 10 通过（V16）。

## 复核

两轮复核（小工作流）。第一轮 2 个复核者 + 1 个反驳者：确认 9 个问题（只按匹配到的流程判断链是否在导出里；目录同名流程都算找到；没用所有者映射；编号两个名称时原因误导；Level 0 编号不认；应有名称有双空格；一个都比较不了时写 “0 missing”；按应用的 Process ID 不含映射；同名流程未用 Parent），驳回 3 个。另外用真实导出跑一次又发现 3 个（应用名带版本号；1 万多个工具外应用被列出并警告；L3V 和其他命名混在 “not in the catalogue” 里）。全部修复并加测试，6 项新测试在修复前的代码上全部失败。第二轮 1 个复核者 + 1 个反驳者：提出 3 点，均判定为有意的设计，没有确认的问题。

## 实际浏览器检查（本机 http://127.0.0.1，离线版 V16）

合成导出（按真实导出的特点：应用自己的流程和链接，其中一个应用名带 “ 1.0”，另挂一个工具外应用；I2D 全部标准流程带 Parent，去掉 3 个和两个 Register Truck 中的一个；2 个 L3V；BBM_PPM 和 ETAS 命名各 1 个；1 个目录外名称）：标准目录部分显示 Compared 1319 / In LeanIX 272 / Missing 1047 / not in the catalogue 9；I2D 缺 5 个，其中 Register Truck 由 Parent 判断出缺的是 M.I2D.030.070.020，两个 Stage Packaging Kits 标为可能缺少；“9 local variants (L3V) · 5 processes named otherwise” 只计数；Supply Chain Management System 显示 “in LeanIX as “Supply Chain Management System 1.0””，75 个应用全部一致；“LeanIX also links these processes to 1 application that is not in the tool's inventory”；Apply 隐藏。1280 宽度无横向溢出。测试后清除了本机测试地址上的浏览器记录。

未接触真实 LeanIX 导出（只在公司电脑上处理）；未在 IIS 服务器上部署。

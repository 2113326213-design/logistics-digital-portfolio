# LeanIX Process 整理工具

把物流工具里 75 个应用在 LeanIX 里关联的 Process 找出来，整理成 `leanix_processes.csv` 和一份摘要。两种用法，结果格式相同：

| 脚本 | 什么时候用 | 需要 |
|---|---|---|
| `find-processes.mjs` | 有 LeanIX API token 时：直接按应用 ID 读取，不用手动筛选和导出 | Node（已有），LeanIX API token |
| `summarize-export.mjs` | 没有 token：在 LeanIX 网页里手动导出 Excel，放进 `leanix_export/` | Node（已有） |

物流工具本身在 LeanIX 里没有 Fact Sheet（仓库里没有它的 LeanIX ID），所以这里找的是 **它所管理的 75 个应用** 关联的 Process。应用的 LeanIX ID 都在 `program/public/data.json` 里，脚本按 ID 读取，不靠名称搜索。

## 只读，数据不出本机

- 两个脚本都**不会修改 LeanIX**：`find-processes.mjs` 只发送以 `query` 开头的 GraphQL 读取请求（其他请求在发出前就被拒绝）；`summarize-export.mjs` 只读 Excel，不连 LeanIX。LeanIX 导出的 Excel 同时也是导入模板，**不要在 LeanIX 里做 Import**。
- 结果只写进 `leanix_export/`。这个文件夹和 `leanix_processes*.csv` 已加入 `.gitignore`，也不会写进 `MANIFEST.sha256`：Bosch 内部数据不会推到 GitHub。
- token 只从环境变量读取，不会打印或写进任何文件。

## 用法一：有 API token

API token 需要 LeanIX 管理员建一个只读（Viewer）的 Technical User 并给出 token。在包的根目录（`物流工具_Claude接手包_20261015`）打开 PowerShell：

```powershell
$env:LEANIX_HOST = "bosch.leanix.net"
$env:LEANIX_API_TOKEN = "<token>"
node tools/leanix/find-processes.mjs
```

先试 5 个应用：加 `--limit 5`。得到：

- `leanix_export/leanix_processes.csv`：每个 Process 一行（名称、上级、完整层级路径、描述、生命周期、关联的工具应用、工具里是否已有这条记录）
- `leanix_export/leanix_processes_summary.md`：按链和层级统计、与工具现有记录的差异、和工具功能模块的对照
- `leanix_export/leanix_processes_raw.json`：原始读取结果

## 用法二：手动导出

1. 在 LeanIX Inventory 里筛出 Process（类型 Process；名称含 `BBM PM`），切到表格，加列 Name、Display Name、Description、Lifecycle、Parent、**Applications**，然后导出 Excel。
2. 把 xlsx 放进包根目录的 `leanix_export/`。
3. 运行：

```powershell
node tools/leanix/summarize-export.mjs
```

脚本会列出每个工作表、列名和行数，然后只保留和工具的应用有关的行（按 Applications 列；没有这一列时只能按名称对照，结果会少很多）。

注意：2026-10-20 那份流程导出（`M.I2D.010 Receive to Store` 这种名称，没有 Applications 列）和工具里应用登记的 Process（`BBM PM I2D … L3` 这种名称）不是同一批，按名称一条也对不上。

## 测试

```powershell
node --test tools/leanix/leanix.test.mjs
```

用本机模拟的 LeanIX 测试（不连真实 LeanIX）：只发读取请求、字段不存在时自动调整、token 不出现在任何输出里、导出只读、`leanix_export/` 不进 git 和 MANIFEST。

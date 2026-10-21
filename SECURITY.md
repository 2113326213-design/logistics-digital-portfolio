# 安全说明 · Security policy

## 数据

- 内置数据来自真实的应用清单（LeanIX 导出和自有工作簿），所以本仓库必须保持**私有**。
- 不要把仓库链接、离线 HTML、导出的工作区文件或数据截图转发给 Bosch 以外的人。
- 在 Issue 里描述问题时，只写应用名称和现象，不要粘贴整张清单或成本数据。

## 程序做什么、不做什么

| 方面 | 说明 |
|---|---|
| 原始记录 | 只读。程序不会修改 LeanIX 或任何业务数据；在页面里的调整只存在当前浏览器标签页，导出备份由你自己保存。 |
| 离线版 | 单个 HTML 文件，数据内置；不加载任何外部脚本、样式或字体，不需要安装。 |
| 在线版 | 部署在内网 IIS（WX-WEB-TD02）上的同一个 HTML 文件，没有后台服务、没有数据库。 |
| IIS 部署脚本 | 校验 HTML 的 SHA-256，备份旧的 `index.html`，只新建自己的 `LogisticsTool` 站点和应用池，按 SID 授予读取权限；**不改防火墙，不动其他站点**。编写规则见 [`00_Claude先读.md`](00_Claude先读.md) 的“部署脚本编写规则”，每次发布前用 `npm run deploy:sim` 在本机模拟。 |
| 文件完整性 | `MANIFEST.sha256` 记录仓库里每个文件的 SHA-256，可用 `node .github/scripts/check-manifest.mjs` 核对。 |

## 支持的版本

只维护最新版本（见 [Releases](https://github.com/2113326213-design/logistics-digital-portfolio/releases/latest)）。旧版本的离线文件保留在 `offline/`，仅供追溯。

## 报告问题

- 一般问题：在本仓库[新建 Issue](https://github.com/2113326213-design/logistics-digital-portfolio/issues/new/choose)，选“报告问题”。
- 涉及数据泄露、权限或服务器配置的问题：不要写在 Issue 里，请直接联系仓库维护人。

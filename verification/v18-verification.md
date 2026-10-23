# V18 验证记录 — 2026-10-23

基线：V17.5。新功能 “Upload to server”。

## 自动检查

- `npm test`：549 项通过，0 失败（`v18-test-results.txt`），含新增 `tests/v18-upload.test.mjs`。
- `npm run deploy:sim`：14 / 14（V18；新增第 11、12、13、5b 种）。DISM 用替身：没有 IIS 功能时（第 4 种）上传不打开、照常完成；能打开时（第 5、8、9 种）显示 “Upload to server: on”；第 11 种：限制设不上时上传保持关闭、写入被关掉、网站照常部署；第 12 种：WebDAV 原来就装着时不动全服务器设置；第 13 种：做不到只限本站时卸掉 WebDAV；第 5b 种：新装的 WebDAV 只加到本站。

## 浏览器检查（本机，模拟能接收上传的服务器）

- Import data → Share this data with everyone → Upload to server：显示 “Uploaded. Everyone who opens the tool now gets this data (as of 2026-10-21).”，服务器收到 logistics-data.json；再点一次显示 “The server already has this data. Nothing was uploaded.”。

## 复核

发布前小复核（1 个复核者 + 1 个反驳者）：确认 1 个严重问题——IIS-WebDAV 是整台服务器的功能，装上后会让同一台服务器上其他网站的 PUT/DELETE 报 405；已改为只加到本站（原来没装时从全局列表去掉再加到本站，做不到就卸掉），并加模拟部署第 12、13、5b 种。驳回 2 条：部分失败时写入仍开着（当前代码已先设限制、最后才打开写入，失败会关掉）；按钮没有 catch（实际很难触发，仍顺手加上出错提示）。此前原会话提醒：改服务器安全设置要用户明确同意（用户已确认 “公司账号都可以”），且限制设不上时不能打开写入（已实现，第 11 种）。

## 还没验证的

- 真实 IIS 服务器上：功能安装、匿名读取 + 登录写入同时生效、域账号写入权限。需要在服务器上运行 V18 的 deploy-iis.bat 后，从另一台电脑实际点一次 Upload to server。

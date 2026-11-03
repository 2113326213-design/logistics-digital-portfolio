# V20 验证记录 — 2026-11-02

基线：仓库 V19.3（66eb20b）。

- 独立审查：独立审查（Ultracode 工作流：3 个审查代理分别看页面上传与恢复、部署脚本、警告与测试，每条发现再由第二个代理尝试反驳；中途额度用完，用户说 “请再试一次” 后续跑）：15 条发现，13 条核实为真，1 条降级，1 条驳回，全部修复并加测试。主要有：页面已有服务器全部数据却没记下起点时会一直冲突（高）——现在 “same” 也记下起点，冲突时若服务器数据没有页面缺的内容就记下起点、再点一次即可上传；两人同时上传会丢一份——写数据前再读一次，变了就不写；恢复两步以前的数据——replaces 记下被撤销的每一次上传；上传成功后重新读服务器；重试不再挤掉备份、恢复前确认那份数据还在原位；“Hide this update” 按 “数据 + 上传时间” 记；工作区备份导入保留起点；“导出可能被筛选” 只对新的 LeanIX 导出提示；阈值不再向上取整；恢复数据的 “更旧” 警告只对拿过被替换数据的页面免除；预览无变化时不挡上传；部署脚本关掉继承权限、去掉手工复制的恢复说明。审查代理的复现脚本在各自的临时副本里运行，没有改程序文件夹。
- `npm test`：576 项通过，0 失败（`v20-test-results.txt`）。新增 `tests/v20-upload-safety.test.mjs` 17 项（审查后加 5 项：已有服务器数据时不会卡住、写数据前再读一次、重试不挤备份、恢复多步以前的数据、上传后被恢复的页面仍会收到提示）。最初 12 项：没拿过的服务器数据不覆盖（只读一次）、拿过的可以覆盖；空文件 = 没有数据；删除很多应用要第二次确认、服务器文件读不了也要；uploadWarnings 阈值；5 个备份的轮换顺序（先读、从最旧往下写、写新数据、读回）；恢复（replaces、上传时间、被替换的成为最新备份；服务器变了不恢复；只认 5 个备份名）；恢复的旧数据只提示给拿过被替换数据的页面；Import data 顶部入口（packageDiffers）；serverBase 保存；Apply 前的 5 种警告；页面源码（勾选才 Apply、预览未 Apply 不上传、第二次点击、恢复确认）；更新提示 id 2026-11-02-2。
- `deploy:sim`：19 / 19。
- 浏览器（本机 http，离线版 V20，`wl/tools/serve-selfservice.mjs` 模拟内网服务器，部署后的 7 个空文件 + 一份 “别人在 10 月 20 日上传的” 数据）：
  1. 打开页面：标题下没有提示（服务器数据更旧），Import data 顶部显示 “The server has data that this page did not start from · as of 2026-10-20 · uploaded 2026-10-20”。
  2. Upload to server → “The server has data that this page did not start from …”，服务器文件没变。
  3. Preview server data → 预览顶部 “Check before applying · This data (as of 2026-10-20) is older …”，Apply 灰掉；预览未 Apply 时点上传 → “An import preview is waiting …”，没有请求；勾选后 Apply。
  4. 导入 20261109 的测试导出并 Apply（没有警告）→ 上传 → “Uploaded … kept as a backup (the last five are kept).”；previous.json = 10 月 20 日那份。
  5. Restore earlier server data → 列出 10 月 20 日那份 → Put this back（确认框内容正确）→ “Restored …”；页面标题下出现 “Earlier data was put back on the server · as of 2026-10-20”。再列：11 月 9 日那份可放回，10 月 20 日那份标 “the same as now” 不能再放回；服务器文件 current = 10-20（replaces 11-09 的 id）、previous = 11-09、previous-2 = 10-20。
  浏览器检查后改了两处：上传时间显示本地时间（原 UTC）；警告文字 “The data in this file” 改成 “This data”（也用于服务器数据）。

未在 IIS 服务器上部署：WebDAV、Windows 登录、文件权限和部署后的上传测试只在 deploy:sim 里模拟过。

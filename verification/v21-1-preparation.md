# V21.1 source preparation — not a release

Date: 2026-11-12. Base: V21, commit `5b53511cb7e2e23fc18e96c74db6e3131037b4ac`.

This change prepares the process reader for the next LeanIX application export. The actual 12 November export is not available in this environment, so no data merge or V21.1 release has been performed. The bundled data remains the 2 November export; its existing assertions, version, update notice, published offline files and release metadata remain unchanged.

## Completed

- `processLookup` accepts `BBM_SWS.` as well as `ETAS.`. A code matches only an unambiguous Signavio node whose normalized name also matches. Chain codes without numeric segments, including `BBM_SWS.P2F Plan to Fulfill`, match Level 0.
- The process-format check recognizes `BBM_SWS.`. Valid code matches do not appear in the plant correction list; a wrong name or unknown code remains an issue.
- Regression cases retain ETAS compatibility, check BBM_SWS Level 3 and Level 0, reject wrong names and unknown codes, and check the plant CSV.
- Two synthetic capability tests verify that padded codes match the existing standard, retain their original source strings, and preserve level completion.
- An independent source review found no blocking issue. Its additional probes checked ambiguous nodes and normalized names. This review covers this compatibility patch, not the full V21.1 data update.

## Capability code limitation

`capCode` already maps `B.06.05.02` to `B.06.5.2`, so two-digit segments do not require a matching-rule change. The original source strings are retained.

The import preview still compares application objects and field strings literally. A synthetic import changing only `B.06.5.2` to `B.06.05.02` reports one updated application and one changed Business Capabilities field. This can also be stored in import history. It must not be reported as “no changes.” As permitted by the handoff brief, this is documented rather than changing import/history rules in this small patch.

## Validation

- Node v24.22.1, Linux; dependencies installed with `npm ci --no-audit --no-fund`.
- Process regression files: 15 tests passed, none failed.
- Full suite including the capability regressions: 589 tests passed, none failed or skipped; original assertions were retained (583 existing tests plus 6 new tests).
- `npm run build` and `npm run export:offline` succeeded. The generated files are local verification output only, under the unchanged V21 filename; they must not replace the published V21 release.
- `npm run deploy:sim` stopped with exit code 2: `deploy:sim needs Windows (cmd.exe).` No Windows deployment pass is claimed.

## Required before V21.1 release

1. On the Windows computer holding the original export, use the existing merge script and the program's import path. Verify all import counts, actual field changes, preserved applications and source date against that file. Never commit or upload the original export.
2. Update only the live-data expectations justified by the verified import, with the requested `2026-11-12 data:` comments. Keep the old ETAS behavior tests.
3. Set the release version and update-notice id, complete the V21.1 release documentation, and run all tests and build/export steps again with the actual merged data.
4. Run `release:files`, then all 19 `deploy:sim` checks on Windows. Publish only after they pass, then download the release asset and compare its SHA-256. Complete the requested local ZIP copy and remove the temporary raw export after use.
5. Update release artwork and the package manifest for the final packaged content. This draft's manifest only describes the source preparation snapshot.

## 待办提醒

1. 在 WX-WEB-TD02 部署最新正式包，检查 `[6/6] upload test`，从另一台电脑试上传。
2. 由工厂在 LeanIX 修正 5 个应用的 8 条非标准流程记录，再重新导出。
3. 核实 VMCN_iWPC_AKL_Szh5 为什么不在 11 月 12 日导出中。
4. 确定 Capability L3 缺失的 27 个应用是由工厂补充，还是调整规则；新数据合并后复核数量。
5. 本次代码补丁已做小范围独立审查；完整 V21.1 数据与发布结果仍待复核。
6. GitHub 页面数据自动更新、B 组工厂体验和 C 组维护工作仍待安排。

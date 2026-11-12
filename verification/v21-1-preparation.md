# V21.1 initial source preparation — historical record

**Current status:** the data import is now complete, but the full updated-data test suite and release steps are unfinished. Continue from `v21.1-handoff.md`. The following records the earlier code preparation and pre-import checks.

Date: 2026-11-12. Base: V21, commit `5b53511cb7e2e23fc18e96c74db6e3131037b4ac`.

This change prepares the process reader for the next LeanIX application export. The 12 November export has now been found in Drive and verified with a dry run, but has not been merged into the bundled data. Per the owner's updated handoff, continue steps 1–8 on the Windows computer from this PR branch, using `D:\CODEX_V21_1_brief.md`; complete validation, merge the PR, then create the release. The bundled data remains the 2 November export; its existing assertions, version, update notice, published offline files and release metadata remain unchanged.

## Verified Drive input and dry run

- File: `20261112_055820_sqAhl_inventory.xlsx`, Drive ID `1ILQnL2fwU9BP7ct8F1lGHqxS5eoCEjyI`. Provider modified time: 2026-11-12 05:58:53 UTC. Size: 33,921 bytes. SHA-256: `2ef1e921f7db5b2101400aac446cf32d71d73530e39a272402294a0b57f2b182`.
- This download has valid ZIP CRCs and both worksheets parse without repair. The application sheet has 71 applications; ReadMe reports 2026-11-12 05:58:21 GMT. A repaired Windows copy with an empty ReadMe sheet can have a different file hash; compare the parsed application records, not only the container hash.
- Using `readXlsx` → `inventoryFromSheets` → `applyInventory` → `previewImport`: 75 total, 71 updated, 0 added, 0 removed, 4 kept. The kept records are RBCW LOM Dashboard, VM/LOG-Szh2_DAVIS (recovered 2026-09-21 09:32:15), VMCN_iWPC_AKL_Szh5, and 360° Supplier dashboard; each stayed unchanged.
- 77 literal field changes: 56 change only capability code padding, and 21 other field changes affect 18 applications. The last category includes ETAS-to-BBM_SWS prefix changes; it does not imply 18 business-meaning changes. The plant correction list still has 8 records on 5 applications.
- The dry run did not write `public/data.json` or create a release. The original export must not be committed or uploaded; the temporary cloud download is removed after inspection.

## Mapping migration to handle before updating test expectations

The current data has 12 Applied and 7 Revoked mappings. A plain import produces 1 Applied, 11 Needs review and 7 Revoked because `correctionStates` binds a mapping to an exact whole-application snapshot, including Business Capabilities. Do not hide this regression by merely changing expected counts.

- Nine process mappings (on eight applications) become stale solely from capability code padding: RBCW LOM PSTU Management System, RBAC_ME_Logistics Data Platform, RBCC Supplier Logistics Management Platform, RBHP_LOG SupplierManager, AUTO-RACK, RBHP_LOG AGV Performance Tracking System (two mappings), VMCN_Digital Dynamic Supermarket, and VMCN_iSCMP: Intelligent Supply Chain management platform.
- One mapping on RBCD LOP Digital Dashboard becomes stale because a capability is added; its entire Processes field is unchanged.
- The old `BBM PM DM Data Management L0` mapping on RBCC LOG Control Tower V2 no longer has a source record. Retire that mapping and record why. Do not transfer it to the new P2F processes.
- RBCW LOM Dashboard's mapping remains Applied without changes.

The stored mapping reasons document the earlier one-time carry-over procedure for imports on 20/21 October and 2 November. Reuse that procedure through `revokeCorrection` and `createCorrection` only after checking each mapping: previously Applied; process dimension; application ID and Name unchanged; full Processes field byte-for-byte unchanged; original raw process still present; target/ancestor snapshot unchanged and unambiguous; no duplicate mapping key. Preserve each old record and refer to its ID, reviewer and reason in the new record; identify the new reviewer as the assistant carrying over a previously confirmed mapping. This permits the ten unchanged process mappings above, including RBCD LOP, without changing global validation rules. Expected result after that migration: 29 records = 11 Applied + 18 Revoked + 0 Needs review. Independently check those counts and the resulting model before release.

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
4. Run `release:files`, then all 19 `deploy:sim` checks on Windows from a normal, non-elevated terminal. Scenarios 1/2 rely on the non-administrator state; running the simulation as Administrator can take the real new-window path instead. Publish only after all checks pass, then download the release asset and compare its SHA-256. Complete the requested local ZIP copy and remove the temporary raw export after use.
5. Update release artwork and the package manifest for the final packaged content. This draft's manifest only describes the source preparation snapshot.

## 待办提醒

1. 在 WX-WEB-TD02 部署最新正式包，检查 `[6/6] upload test`，从另一台电脑试上传。
2. 由工厂在 LeanIX 修正 5 个应用的 8 条非标准流程记录，再重新导出。
3. 核实 VMCN_iWPC_AKL_Szh5 为什么不在 11 月 12 日导出中。
4. 确定 Capability L3 缺失的 27 个应用是由工厂补充，还是调整规则；新数据合并后复核数量。
5. 本次代码补丁已做小范围独立审查；完整 V21.1 数据与发布结果仍待复核。
6. GitHub 页面数据自动更新、B 组工厂体验和 C 组维护工作仍待安排。

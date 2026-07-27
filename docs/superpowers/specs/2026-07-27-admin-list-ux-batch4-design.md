# Admin 列表體驗一致化（第四批）設計

- 日期：2026-07-27
- 範圍：延續同日第二／三批；收 backlog 的手機卡片化 + 最後一張缺搜尋的大清單 + 文件掛名的孤兒檔清理
- 性質：**純前端**，零後端改動
- 分支：與第二批共用 `feat/admin-list-ux-batch2-2026-07-27`

## 1. 範圍

| # | 項目 | 改動 | 驗證 |
|---|------|------|------|
| 1 | `workbench/WorkbenchApprovalsView.vue` 手機卡片化 | 三個待簽核佇列在 `useIsMobile` 時以 `AdminListCards` 呈現（比照 `EmployeeListView.vue:455` 範式）；核准/駁回主動作進卡片 `#actions`；桌機表格不動 | 元件測試斷言 mobile 分支渲染 AdminListCards 與資料筆數；桌機分支既有測試綠 |
| 2 | `StudentAttendanceView.vue` 總覽姓名搜尋 | 總覽 tab 的 `overviewRows` 套 recipe（AdminListToolbar + useClientTableFilter，學生姓名），與學年期下拉交集；點名編修 tab 不動（另有日期驅動流程） | 收斂/還原測試 |
| 3 | 孤兒檔清理 | 刪 `src/composables/usePreschoolGovData.ts`（CLAUDE.md 明載零 caller 待清理）、`src/composables/useAnalyticsTimeRange.ts` + `tests/unit/composables/useAnalyticsTimeRange.test.js`（2026-06-03 經營分析整塊移除的遺留）；同步刪 CLAUDE.md 兩處「待清理」註記 | 刪前 grep 再核零 caller；全套 gate 綠 |

## 2. 非目標

- `AuditLogView` 後端 search 參數：跨 repo，另批。
- public 報名頁（非後台範圍）。
- `LeaveView`／`OvertimeView` 手機卡片化：這兩頁行動使用率低（行政桌機作業），本批只做簽核工作台（主管會在手機上簽核）。

## 3. 驗證

Gate 同第三批：typecheck（僅容許 IntegrationsHealthCard baseline）、eslint 全量 0 error、全套 vitest（flake 隔離重跑判定）、build。

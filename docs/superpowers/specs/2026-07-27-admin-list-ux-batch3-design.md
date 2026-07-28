# Admin 列表體驗一致化（第三批）設計

- 日期：2026-07-27
- 範圍：延續同日第二批（`2026-07-27-admin-list-ux-batch2-design.md`），繼續收斂搜尋缺口與寫死 hex
- 性質：**純前端**，零後端改動
- 分支：與第二批共用 `feat/admin-list-ux-batch2-2026-07-27`

## 1. 範圍

**搜尋補齊**（recipe 同第二批：`AdminListToolbar` + `useClientTableFilter`，交集既有篩選）：

| # | 檔案 | 改動 |
|---|------|------|
| 1 | `activity/ActivityCourseView.vue` | 課程清單加名稱/老師關鍵字搜尋（欄位以實際檔案為準）；候補/已選名單若有姓名欄一併納入同框搜尋或各自處理，以改動最小為準 |
| 2 | `activity/POSApprovalView.vue` | 學期對帳清單加姓名/課程搜尋（無名字欄則不硬做，記回報） |
| 3 | `ClassroomView.vue` | 班級卡片格加名稱/帶班老師搜尋（卡片 v-for 改綁 filtered，非 el-table） |

**寫死 hex 收斂**（第 5 節體檢揪出的三大戶，admin 範圍）：

| # | 檔案 | 處數 | 原則 |
|---|------|------|------|
| 4 | `components/signoff/SignoffPanel.vue` | 37 | 只收斂「UI 色」（文字/背景/邊框/狀態色）到 `--neutral-*`/`--color-*`/semantic token；**資料視覺化用色（圖表 series、地圖 marker）不動** |
| 5 | `components/recruitment/RecruitmentStatsPanel.vue` | 32 | 同上 |
| 6 | `components/recruitment/RecruitmentAddressHeatmap.vue` | 34 | 同上（heatmap 色階與地圖圖層色屬資料視覺化，保留） |

## 2. 非目標

- `WorkbenchApprovalsView` 手機卡片化：需實機視口驗證，另批處理。
- `AuditLogView` 後端 search 參數：跨 repo，另批。
- public 端兩支報名頁（`ActivityPublicView` 等）：非後台範圍。

## 3. 驗證

- 每檔既有測試綠 + 搜尋頁各補收斂/還原測試（mock 手法同第二批，見 `git show da0c7cf4`）。
- Gate（全量）：`npm run typecheck`（僅容許 main 既有 `IntegrationsHealthCard` baseline error）、`npm run lint` 0 error、`npm test` 全套、`npm run build`。
- hex 收斂為 CSS-only，不強造測試，但 diff 需逐處人工核對用途對映。

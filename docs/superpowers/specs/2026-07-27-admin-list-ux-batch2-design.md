# Admin 列表體驗一致化（第二批）設計

- 日期：2026-07-27
- 範圍：admin 清單頁的關鍵字搜尋／筆數回饋／空狀態補齊
- 性質：**純前端**，零後端改動、零 schema 異動
- 來源：2026-07-27 UI/UX 批次逐頁體檢（15 檔），延續 `2026-06-17-admin-list-experience-consistency-design.md` 的元件與 composable

## 1. 背景與問題

06-17 第一批建立了 `AdminListToolbar`（工具列）與 `useClientTableFilter`（客端過濾 composable），但至今 `AdminListToolbar` 只有 3 個 caller、`useClientTableFilter` **零 caller**。本輪體檢 15 個最大的 admin 清單頁，發現的共通痛點（皆已逐檔核實）：

- `LeaveView.vue`／`OvertimeView.vue`：整年月資料全量進表格，**無任何關鍵字搜尋**，找特定員工只能開下拉逐個選。
- `WorkbenchApprovalsView.vue`：三個待簽核佇列（請假/加班/補打卡）全量列出，旺季件數一多只能整頁捲動找人。
- `ScheduleView.vue` 換班紀錄 tab：只有狀態下拉，無姓名搜尋。
- `StudentIncidentView.vue`：有後端分頁**但無空狀態**——班級篩不到資料時使用者只看到一張空表格，無任何提示。
- `AuditLogView.vue`：無空狀態；style 內 4 處寫死 hex（`#666`/`#fafafa`/`#888`/`#f5f5f5`）。

## 2. 目標 / 非目標

**目標**

- 給 4 張「全量客端」清單補上關鍵字（姓名）搜尋與「顯示 N / 共 M 筆」回饋，一律走 `AdminListToolbar` + `useClientTableFilter`，與既有下拉篩選以**交集**組合。
- 給 2 張清單補空狀態（`el-table` `#empty` slot + `EmptyState`，區分「無資料」與「篩選無結果」文案）。
- `AuditLogView` 4 處 hex 收斂到 `--neutral-*`／`--text-*` token。

**非目標（YAGNI）**

- 不動後端：`AuditLogView` 的「搜尋僅濾當頁」限制屬後端 search 參數缺口，記 backlog 不硬做。
- 不做分頁改造：全量清單的資料量（單月請假/加班、待簽核佇列）在可控範圍，06-17 與員工模組 batch 2 均已判分頁 YAGNI。
- 不統一 `EmployeeListView` 的第三套自建 `useLatestSearch` 模式（運作正常，統一屬重構非優化，記入 DESIGN.md 已知分歧）。
- 不動 `ActivityRegistrationView` 自寫搜尋列（功能最完整，改寫風險 > 收益）。

## 3. 作法（逐頁）

共通 recipe（Pattern B）：

```ts
const { searchQuery, filtered, total, shown } = useClientTableFilter({
  source: () => records.value,
  searchFields: (r) => [r.employee_name],
})
```

`el-table :data` 改綁 `filtered`（或與既有 computed 交集）；頁首篩選區前插 `<AdminListToolbar v-model:search="searchQuery" :total="total" :shown="shown" />`；既有 `el-select` 篩選保留原位或移入 toolbar `#actions` slot（以改動最小為準）。

| # | 檔案 | 改動 | 驗證 |
|---|------|------|------|
| 1 | `LeaveView.vue` | 姓名搜尋 + 筆數；與年/月/員工/狀態下拉交集 | 元件測試：輸入關鍵字後列數收斂、清空還原 |
| 2 | `OvertimeView.vue` | 同上（兩個 tab 共用同一 searchQuery，各自 filtered） | 同上 |
| 3 | `WorkbenchApprovalsView.vue` | 單一搜尋框，三佇列各自 `useClientTableFilter`（共用 searchQuery）；筆數顯示三段合計 | 元件測試：搜尋同時過濾三表 |
| 4 | `ScheduleView.vue` | 換班紀錄 tab 加姓名搜尋（申請人/對象任一命中） | 元件測試 |
| 5 | `StudentIncidentView.vue` | `#empty` slot + `EmptyState`（「該班級尚無事件紀錄」/「調整篩選試試」） | 既有測試綠 + snapshot 級斷言 |
| 6 | `AuditLogView.vue` | 空狀態同上；4 處 hex → token | 既有測試綠；CSS-only 部分不強造測試 |

## 4. 測試策略

- `useClientTableFilter` 既有單元測試不動。
- 每頁新增（或擴充既有）元件測試斷言：搜尋收斂列數、空字串不過濾、與既有篩選交集。
- Gate：`npm run typecheck` 0 errors、`npm run lint` 0 errors、相關測試樹全綠、`npm run build` 成功。

## 5. 執行紀律

- 每頁獨立 commit、path 限定；worktree `feat/admin-list-ux-batch2-2026-07-27`（base main `967e2cfc`）。
- 共用 checkout 上另一 session 的 portal WIP 與本批目標檔零交集，不得掃入。
- 收束走 staging 閘門流程；push 由使用者裁定後執行。

## 6. Backlog（本批不做，集中列出）

- `AuditLogView` 後端 `search` 參數（解「僅濾當頁」誤導）。
- `LeaveView`／`OvertimeView` 若未來單月資料破千筆再考慮後端分頁。
- `WorkbenchApprovalsView` 表格手機卡片化（現只有 header flex 調整）。
- `EmployeeListView` `useLatestSearch` 與 `useClientTableFilter` 的模式統一。

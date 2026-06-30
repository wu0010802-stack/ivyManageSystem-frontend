# Admin 列表體驗一致化（第一批）設計

- 日期：2026-06-17
- 範圍：園方管理端（Admin/HR）清單頁的搜尋 / 篩選 / 分頁 / 結果數 / 匯出沿用篩選
- 性質：前端主導，含兩處小型後端 query 參數擴充；**無 schema 異動、無 migration**
- 來源：admin UX 盤點 workflow（`.scratch/admin-ux-survey-2026-06-17/REPORT.md`）速贏主題「列表缺搜尋/篩選/分頁」「匯出/篩選脫鉤」「客端統計失真」

---

## 1. 背景與問題

盤點顯示 admin 端 **94 個 view 用 `el-table`、只有 13 個用 `el-pagination`**，多數清單客端全載或靜默截斷，且各清單的搜尋/篩選/匯出各做各的、彼此不一致。具體痛點（皆有程式碼證據）：

- `AnnouncementView.vue:390` 直接 `:data="announcements"` 全載 + `max-height="600"` 捲動，無分頁無搜尋；後端 `api/announcements.py:140 list_announcements` **早已支援 `page/page_size`**，前端沒接 → 公告 > 50 則看不到也改不到（資料遺失風險）。
- `DsrRequestsView` 不分待處理/已處理；後端 `api/dsr_admin.py:58 list_dsr_requests` **已支援 `status` filter**，前端沒用 → 個資法請求（有法定回應期限）容易漏處理。
- `salary/settle/StepReview.vue:46` 寬表 `:data="visibleRecords"` 全載、只有 anomalies toggle，20+ 人月底核薪只能橫向肉眼找人。
- `appraisal/CurrentSemesterOverview.vue:514` 狀態表 `participants` 全載無搜尋/狀態篩選，每學期定位「誰卡在哪一關」只能逐列掃。
- 員工/學生匯出寫死整份、忽略當前畫面篩選，HR 篩完還要去 Excel 手刪行。

## 2. 目標 / 非目標

**目標**
- 抽出一套共用清單工具列 + 一個客端篩選 composable，與既有 `useTableFilters` 搭配，套到第一批 5 張最痛的清單。
- 讓「搜尋框 / 篩選 chip / 結果數 / 匯出」在這些清單上長相一致、綁法一致。
- 修掉公告分頁的資料遺失風險；讓匯出沿用當前篩選。

**非目標（YAGNI）**
- 不重寫其餘 ~90 張 `el-table`；不做重量級 `<DataTable>` 全包裝元件。
- 公告「狀態」篩選不做（status 為回應時 `derive_status` 計算值，server-side filter 成本高且破壞 total）；本批只做「優先級 + 標題搜尋」。
- 不含其他速贏（用藥更正＋二次確認、補登時間選擇器、全量統計徽章）——屬「高風險護欄」與「可信數字」主線，留後續批次。
- DSR 不加分頁（資料量低），只做狀態 chip + 預設待處理 + 筆數。

## 3. 架構

清單天然分兩種型態，**共用同一顆工具列元件**，差別只在資料來源 composable：

### 3.1 `<AdminListToolbar>`（新，presentational，`src/components/common/`）

純呈現、不持有資料來源，pattern 無關。

**Props**
- `search: string`（搭配 `v-model:search`）
- `searchPlaceholder?: string`
- `filters?: FilterGroup[]` — `FilterGroup = { key: string; label: string; type: 'single' | 'multi'; options: { label: string; value: string | number }[] }`
- `filterValues?: Record<string, unknown>`（搭配 `v-model:filter-values`）
- `total: number`
- `shown?: number` — 客端篩選用，提供時顯示「顯示 {shown} / 共 {total} 筆」，否則「共 {total} 筆」
- `exportable?: boolean`、`exporting?: boolean`

**Emits**：`update:search`、`update:filter-values`、`export`

**Slots**：`#actions`（額外按鈕，如「新增公告」）

篩選 chip 用 `el-radio-group`（single）/ `el-check-tag` 群（multi）呈現，點擊更新 `filterValues[key]` 並 emit。

### 3.2 Pattern A — 後端分頁/篩選型（沿用既有 `useTableFilters`）

`src/composables/useTableFilters.ts` 已具備：搜尋 + debounce(300ms) + `page/page_size` + `total` + 並發競態保護 + 吃 `{data,total}`/`{items,total}`/陣列。**不改其行為**，僅使用。

- 工具列 `search` ↔ `searchQuery`；篩選 chip → `setExtraParams({ ... })`；底部接 `el-pagination`（`:current-page="page"` `:page-size="pageSize"` `:total="total"` `@current-change="setPage"`）。
- 匯出：呼叫匯出 api 時帶 `{ search: searchQuery, ...extraParams }`（與清單同一組 query）。

### 3.3 Pattern B — 客端篩選型（新增 `useClientTableFilter`）

`src/composables/useClientTableFilter.ts`（新）。資料已全載，純客端過濾；**刻意對齊 `useTableFilters` 的回傳形狀**，讓 `<AdminListToolbar>` 兩邊綁法一致。

**契約**
```ts
useClientTableFilter<T>(options: {
  source: () => T[]                                  // getter（reactive）
  searchFields: (row: T) => (string | null | undefined)[]   // 參與關鍵字比對的欄位
  filters?: Record<string, (row: T, value: unknown) => boolean>  // 每個 chip group 的 predicate
}): {
  searchQuery: Ref<string>
  filterValues: Ref<Record<string, unknown>>
  filtered: ComputedRef<T[]>     // 套用 search + 所有 filter 後
  total: ComputedRef<number>     // source 長度
  shown: ComputedRef<number>     // filtered 長度
  reset: () => void
}
```
- search：大小寫不敏感、`searchFields` 任一含查詢字串即命中；空字串不過濾。
- filter：`filterValues[key]` 為空（undefined / '' / 空陣列）時該 predicate 視為通過。
- 與既有 computed（如 StepReview 的 anomalies toggle）以「交集」組合：`visibleRecords = filtered ∩ anomaliesFilter`。

### 3.4 匯出沿用篩選

工具列 `@export` → caller 用「當前 search + filterValues」呼叫匯出：
- 伺服器清單：傳同一組 query 給匯出端點（員工匯出端點需接受 `search/classroom_id/status`）。
- 客端清單：直接匯出 `filtered`（若走後端匯出端點則傳對應 query）。

## 4. 第一批清單

| # | 清單 | Pattern | 範圍 | 後端 |
|---|------|---------|------|------|
| 1 | 公告 `AnnouncementView.vue` | A | 接 `useTableFilters` + `el-pagination`（修 >50 則遺失）＋標題搜尋＋優先級 chip | 分頁純前端；`list_announcements` 補 `search`(title ILIKE)、`priority` Query 參數 |
| 2 | DSR 佇列 `DsrRequestsView.vue` | A（僅 server filter，不分頁） | 狀態 chip（待處理/已核准/已駁回）＋預設待處理＋筆數 | 純前端（BE 已有 `status`） |
| 3 | 薪資覆核寬表 `salary/settle/StepReview.vue` | B | **姓名搜尋**（`SettlementRecord` 僅 `employee_name`，無班級/職稱欄→不做 chip）＋結果數，與既有 `onlyAttention` toggle 交集 | 純前端 |
| 4 | 考核狀態表 `appraisal/CurrentSemesterOverview.vue` | B | 姓名搜尋＋chip：**「未加入考核」(`is_participant === false`)**、**「有懲處」(`warning+minor+major > 0`)**＋筆數（participant 資料無簽核階段欄→不做階段 chip） | 純前端 |
| 5 | 員工清單匯出 `EmployeeView.vue` | A 匯出 | 匯出沿用當前 **`search`**（後端 list 已支援）；`statusFilter` 為前端衍生、無班級篩選欄→本批不做，列為延伸 | `api/exports.py::export_employees` 加 `search` Query + `downloadFile` 支援 params + pytest |

> 已確認的實際識別子（plan 直接採用）：record 姓名欄 `employee_name`、`employee_id`；StepReview inject key `'settlement'`、既有 `onlyAttention` toggle + `visibleRecords`；participant 姓名欄 `employee_name`、`is_participant`、`disciplinary.{warning,minor,major}_count`；公告 priority 值 `normal/important/urgent`（`priorityOptions`）、後端回 `{total, items}`、`fetchAnnouncements` 丟棄 total；DSR 狀態 `pending/approved/rejected`（`STATUS_LABEL`/`STATUS_TAG_TYPE`）、後端已有 `status` 參數無分頁；員工匯出走 `downloadFile('/exports/employees')` 寫死、後端 `export_employees` 在 `api/exports.py` 無篩選參數。

## 5. 後端觸點（小）

僅 #1、#5 兩處 query 參數擴充，皆先補 pytest 再實作：
- `api/announcements.py::list_announcements`：新增 `search: str | None`（`title ILIKE %q%`）、`priority: str | None`（欄位等值）。**filter 必須同時套用到主 `query`（announcements.py:176-187）與獨立的 `total` 計數 query（announcements.py:188）**，否則 total 與實際筆數不一致、分頁壞掉。
- `api/exports.py::export_employees`（exports.py:135-146，**非** employees.py）：新增 `search: str | None`，套用與 list 同義的 `Employee.name.ilike | Employee.employee_id.ilike` filter。`status`（前端 `statusKeyOf` 衍生）與 `classroom_id`（兩端皆無篩選欄）本批不做。前端 `utils/download.downloadFile` 需擴充支援帶 query params。

改動後：`python scripts/dump_openapi.py` → `npm run gen:api`（query 型別更新進 `schema.d.ts`）→ `npm run gen:api:check` 確認無漂移。

## 6. 測試策略（TDD）

- **元件/composable 先行**：
  - `AdminListToolbar`（Vitest）：渲染搜尋框/chip/筆數；`update:search`、`update:filter-values`、`export` emit；`shown` 顯示邏輯。
  - `useClientTableFilter`：search 命中/不命中、空查詢不過濾、單一/多重 filter、`total`/`shown`、`reset`。
- **各清單**：搜尋/篩選後列數收斂；公告分頁渲染與切頁；DSR 預設待處理；員工匯出帶當前 query（mock 匯出 api 斷言參數）。
- **後端**：`tests/test_announcements*.py` 補 search/priority；員工匯出 query pytest。

## 7. 落地與收尾

- 前後端各一支分支（worktree **off `origin/main`**），分開 commit；Conventional Commits 繁中。
- 完成走 `./scripts/finish-check.sh`（push + CI 綠 + worktree 清）。
- 後端目前 Zeabur SUSPENDED；本批無 migration，後端 query 參數於 resume 後自動生效（無前置）。

## 8. 實作順序（給 plan 參考）

1. 基礎：`AdminListToolbar` + `useClientTableFilter`（含測試）。
2. 客端清單（純前端）：StepReview、CurrentSemesterOverview。
3. 伺服器清單純前端段：Announcement 分頁接線（先修資料遺失，獨立於 BE 搜尋）、DSR 狀態 chip。
4. 後端段：Announcement `search/priority`、員工匯出 query + pytest + gen:api，前端接上搜尋/優先級/匯出沿用篩選。

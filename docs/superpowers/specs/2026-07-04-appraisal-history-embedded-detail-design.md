# 考核歷史週期頁重構：dropdown 選週期 + 內嵌明細（2026-07-04）

## 需求

`/appraisal-year-end?section=appraisal&tab=history` 現況為「週期表格 → 點『明細』跳轉獨立分頁 `/appraisal/cycles/:id`」，重構為：

1. **進入頁面即顯示當期週期明細**：依當前日期解析學年學期（上學期 8/1–1/31、下學期 2/1–7/31，與後端 `utils/academic.term_bounds` 及前端 `getCurrentAcademicTerm()` 同一慣例）。若該學期已建立週期，進頁即內嵌顯示該週期明細的**列表模式**；明細改為元件、不再是獨立分頁。
2. **週期選擇改 dropdown**：以 `el-select` 列出所有已建立週期（如「113 學年上學期」…「114 學年下學期」），預設選中當期週期，無當期則取最新一筆。

## 設計

### 1. `CycleDetailPanel.vue`（新元件，自 `CycleDetailView.vue` 搬移）

- `src/views/appraisal/CycleDetailPanel.vue`，props：`cycleId: number`。
- 邏輯與 template 原樣搬移，差異：
  - `cycleId` 由 `route.params.id` 改為 prop（父層以 `:key="cycleId"` 重掛，`onMounted(load)` 不變）。
  - **預設 view 由 `kanban` 改 `list`**（需求指定列表模式）；URL query `view` 覆寫機制保留（kanban/list 切換、F5 保留、可分享）。
  - 移除 `el-page-header`（內嵌後無「返回」語意）。
- `CycleDetailView.vue` 刪除；`CycleDetailView.spec.js` 改為 `CycleDetailPanel.spec.js`（route params mock 改 prop）。

### 2. `CycleListView.vue` 重構（歷史週期 tab 本體）

- 移除週期表格與 `el-page-header`，改為：
  - **Toolbar**：週期 dropdown（`el-select`，label `{{academic_year}} 學年{{上/下學期}}（{{狀態}}）`，依 academic_year desc、SECOND 先於 FIRST 排序）+ 既有「新增週期 / 上傳 Excel / 重新整理」按鈕。
  - **內嵌 `<CycleDetailPanel :cycle-id="selectedCycleId" :key="selectedCycleId" />`**（匯出考核表 / 轉帳名冊按鈕已在 panel toolbar 內，不重複）。
  - 無任何週期 → `el-empty` + 新增週期入口。
- **預設選中優先序**：① URL query `cycle`（有效且存在於清單）② 當期學期週期（`getCurrentAcademicTerm()` 匹配 `academic_year` + `semester`）③ 排序後最新一筆。
- 選擇變更 → `router.replace` 同步 `cycle` query（保留 section/tab）。
- **建立週期 dialog 區塊 byte-level 不動**：平行 session 有未提交 WIP 正在簡化該 dialog（移除日期欄位），刻意不碰以縮小 merge 衝突面。

### 3. 路由

- `/appraisal/cycles/:id` 改 redirect：`{ path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'history', cycle: :id } }`（舊連結不失效）。
- query 殘留清理：`AppraisalManagementView.onTabChange` 切離 `history` 時刪 `cycle`；`AppraisalYearEndView.onSectionChange` 切離 `appraisal` 時已刪 `tab`，一併刪 `cycle`。
- `legacyRedirects.spec.ts` 對應更新（原斷言 `/appraisal/cycles/3` 保持原路徑 → 改斷言 redirect）。

## 測試

- `CycleDetailPanel.spec.js`：搬移既有案例；補「預設 view=list」「query view=kanban 覆寫」。
- `CycleListView.spec.ts`（新）：dropdown 選項渲染；預設選中當期週期；無當期 fallback 最新；query `cycle` 優先；切換 dropdown → router.replace 帶 `cycle`；空清單 empty state。
- `legacyRedirects.spec.ts`：redirect 斷言更新。

## 不做

- 後端零改動（`/appraisal/current`、`GET /appraisal/cycles` 既有端點足夠；當期解析用前端純函式，不加 API 呼叫）。
- 不動 KanbanView / ListView / 簽核流程。

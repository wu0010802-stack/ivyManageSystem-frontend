# 員工管理 × 離職管理 整合設計

- 日期：2026-06-04
- 範圍：**純前端**（ivy-frontend），不動後端、無 Pydantic / migration / 新端點
- 模式：薄殼 wrapper view + `el-segmented` 分頁，沿用 `AppraisalYearEndView.vue` 既有慣例

## 背景與動機

「人事薪資」側邊欄群組目前有兩個分離入口：

- **員工管理**（`/employees` → `EmployeeView.vue`，1387 行）：員工 CRUD 清單、狀態徽章（在職／待離職／已離職）、「辦理離職」按鈕開啟 `OffboardingModal`（input→preview→process 三階段）。離職的**發起點**。
- **離職管理**（`/admin/offboarding` → `views/admin/OffboardingView.vue`，268 行）：列出已設 `resign_date` 的員工，顯示 checklist 狀態、離職證明 PDF 下載、Magic Link 下載連結管理 drawer。離職的**後續管理**。

兩者高度相關卻分散在兩個側邊欄項目。整合目標：HR 在「員工管理」一處即可在「員工」與「離職管理」之間切換，少一個側邊欄入口。

離職後續管理保留在**專屬離職清單**（使用者決策 A），不下沉到個別員工詳情 drawer。

## 設計

### 1. 新增 `src/views/EmployeeHubView.vue`（薄殼 wrapper，~80 行）

完全比照 `AppraisalYearEndView.vue`：

- `el-segmented` 兩個分頁，由 `?section=` query 驅動（可深連結、重整保留、預設第一個）：
  - `employees`（標籤「員工管理」）→ 渲染 `EmployeeView`
  - `offboarding`（標籤「離職管理」）→ 渲染 `OffboardingView`
- 子 view 用 `defineAsyncComponent` + `v-if` **懶載入**：離職分頁只有切過去時才 mount + 抓資料，平常不付出 N 次 detail 請求成本。
- 權限：兩分頁皆 `EMPLOYEES_READ`。由於能進 `/employees` 即已具備此權限，兩分頁恆顯示（比考核三權限情境更單純，不需 per-section `can()` 過濾，但仍沿用同樣的 `resolveSection` / `onSectionChange` / `watch(route.query.section)` 骨架以保深連結與 URL 修正行為一致）。

### 2. 第一個分頁「員工管理」內容不變

`EmployeeView.vue` 的清單顯示**全部員工**（在職＋已離職，用狀態徽章區分）—— 維持現狀，分頁名「員工管理」。**EmployeeView.vue 零改動**：保留自己的標題列、搜尋、匯出、新增、「辦理離職」modal 等所有既有行為。

### 3. 路由 `src/router/index.ts`

- `/employees` 的 `component` 由 `EmployeeView.vue` 改為 `EmployeeHubView.vue`（meta title 保持「員工管理」）。
- `/admin/offboarding` 由原本的 component route 改為 **redirect**：
  ```ts
  {
    path: '/admin/offboarding',
    redirect: (to) => ({ path: '/employees', query: { ...to.query, section: 'offboarding' } }),
  }
  ```
  沿用同檔既有 `/students` → `/appraisal-year-end?section=payout` 的 redirect-with-query 先例。保留舊書籤、不留死路由。

### 4. 側邊欄 `src/components/layout/AdminSidebar.vue`

- 移除「離職管理」`el-menu-item`（`index="/admin/offboarding"`）。
- 人事薪資群組保留：員工管理（`/employees`）、薪資管理…。
- active-menu 高亮：兩分頁都落在 `/employees`，由 segmented 當次級導航，可接受。

### 5. `OffboardingView.vue`（離職分頁子元件）

- 行為與外觀不變，原地保留於 `views/admin/`（不搬移以降低 import 變動風險）。
- **可選小優化**（低風險、非阻塞）：基礎員工清單改讀 `employeeStore`（filter `resign_date`）而非自己再 `getEmployees()` 全清單抓取——同頁後省一次重複請求。per-employee 的 `fetchDetail`（checklist／magic-link／certificate 欄位所需）為本質需求，保留。

### 6. 內部連結

- `GlobalSearch.vue` 目前僅有「員工管理 → `/employees`」一筆 quick-nav，無離職管理項，**無需改動**。
- 全 repo 不再有對 `/admin/offboarding` 的硬連結（redirect 已兜底）。

## 測試

- 新增 `src/views/__tests__/EmployeeHubView.spec.ts`（輕量）：
  - 預設（無 query）渲染員工子元件、segmented model 為 `employees`。
  - 深連結 `?section=offboarding` 渲染離職子元件。
  - 切換 segmented 會 `router.replace` 更新 `?section`。
  - 子 view 以 stub 掛載，避免拉起 EmployeeView/OffboardingView 全量依賴。
- 既有 `EmployeeView` / `OffboardingView` 測試不受影響（兩者未改行為）。

## 非目標（YAGNI）

- 不把 checklist／證明／Magic Link 下沉到員工詳情 drawer（決策 B，未採用）。
- 不改 `EmployeeView` 的篩選邏輯、不新增在職／離職 filter。
- 不動 `OffboardingModal` 辦理流程、不動後端任何端點。
- 不重命名／搬移 `OffboardingView.vue` 檔案位置。

## 風險與緩解

- **EmployeeView 1387 行大檔**：採薄殼 wrapper、子 view 以組合方式掛載，**完全不改 EmployeeView 內部**，避免大檔再膨脹。
- **死路由／死連結**：`/admin/offboarding` 改 redirect 兜底，側邊欄與 GlobalSearch 同步確認。
- **分支隔離**：實作另開乾淨分支（off `origin/main`），不疊在目前 `feat/academic-term-auto-derive-fe` 的 WIP 上。

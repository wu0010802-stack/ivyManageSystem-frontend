# 報表統計優化 P1：載入性能（Reports Optimization Phase 1）

**日期**：2026-05-14
**範圍**：純前端（`ivy-frontend`），admin「報表統計」頁
**分支**：`feat/reports-optimization-p1-frontend`
**狀態**：設計中，待 user 審閱

---

## 1. 背景與動機

admin「報表統計」頁（`/reports`）由 `views/ReportsView.vue` 進入，內含 4 個 tab：

| Tab | 元件 | 資料來源 |
| --- | --- | --- |
| 概況 | `views/reports/OverviewPanel.vue` | `getDashboard(year)` + `getFinanceSummary(year)` 整併 |
| 收支彙總 | `views/reports/FinanceSummaryPanel.vue` | `getFinanceSummary(year, month)` |
| 出勤 | `views/reports/AttendancePanel.vue` | `getDashboard(year)` |
| 薪資 | `views/reports/SalaryPanel.vue` | `getDashboard(year)` + finance |

後端 `api/reports.py` 已有 `report_cache_service`（DB snapshot，TTL 30 分），server-side 重複呼叫成本低。但**前端載入策略**有 4 個明確問題：

### 痛點

1. **重複請求（真 bug）**
   `ReportsView.vue` 父層 `fetchFinance()` 抓 `financeData` 給 `OverviewPanel` 用；同時 `FinanceSummaryPanel.vue:38` 自己 `onMounted` 抓一次 `getFinanceSummary(props.year, selectedMonth.value)`，**完全沒接父層 prop 也沒共享狀態**。User 切到「收支」tab 就重複請求一次同樣 endpoint。

2. **進頁無條件抓兩個 endpoint**
   `ReportsView.vue:60` `onMounted(fetchAll)` 同時打 `getDashboard` + `getFinanceSummary`。即使 user 只想看「薪資」tab，也得等 finance 回來才不會卡 loading 遮罩。

3. **無客端快取**
   年份切到 2025 → 2024 → 2025，每次都重打後端。後端 DB cache 命中也仍有網路 round-trip + JSON 解析 + ECharts 重畫，浪費 200–500ms。

4. **全頁遮罩體驗差**
   `ReportsView.vue:64` `v-loading="loading"` 遮整頁，loading 等於 `dashboardLoading || financeLoading`。User 看不到任何內容直到兩個 API 都回。

---

## 2. 解決方案

### 2.1 引入 `useReportData` composable

新增 `src/composables/useReportData.js`，提供 cache + dedupe，介面：

```js
// 訂閱資料（多次相同 key+params 不重複請求）
const { data, loading, error, refresh } = useReportData(
  cacheKey,         // 'dashboard' | 'finance' 等
  reactiveParams,   // ref / reactive，會被 watch
  fetcher,          // (params) => Promise<{ data }>
  { ttl = 300_000 } // 預設 5 分鐘
)

// 全域 invalidate（給寫入端用，例如薪資封存後）
import { invalidateReportData } from '@/composables/useReportData'
invalidateReportData('dashboard') // 清掉所有 dashboard cache
invalidateReportData('dashboard', { year: 2025 }) // 只清特定 params
```

#### 行為合約

- **cache key 正規化**：內部用 `JSON.stringify(canonicalize(params))` 生成 cache key。`canonicalize` **移除 value 為 `null` / `undefined` 的欄位** 並按 key 字母序排序。例如 `{year:2025}` 與 `{year:2025, month:null}` 視為同 key（與後端 `month=None` 同一支查詢對齊）。
- **cache hit**：同 key + 同 params + TTL 內 → 立即 return cached `data`，不打 API
- **cache miss / expired**：呼叫 fetcher，存入 cache
- **inflight dedupe**：同 key + 同正規化 params 並行請求 → 共享同一個 Promise（防止快速切 tab 雙發、防止兩 panel 同時打同一 endpoint）
- **error 不快取**：失敗回應不入 cache，下次重試
- **params reactive**：watch params 變化，自動換 key 重抓（cache hit 不會 loading flash）
- **記憶體上限**：LRU 上限 20 筆（每 key），超過 evict 最舊

#### 為何 TTL = 5 分鐘

後端 DB cache 30 分鐘是「上限」（資料異動端會 `invalidate_category` 主動清）。前端 5 分鐘較短，避免 user 修了資料後看不到變化；同時夠覆蓋「切 tab 來回」的常見操作。

### 2.2 重構 `ReportsView.vue`

**改動**：

- 移除父層 `fetchDashboard` / `fetchFinance` / `dashboardData` / `financeData` / `loading`
- 父層只保留 `selectedYear`、`activeTab`，作為 props 傳給各 panel
- 移除全頁 `v-loading`

**改後職責**：純粹是 layout shell + tab switching。

### 2.3 重構 4 個 Panel

每個 panel 改用 `useReportData`，自己管 loading / error / data：

```js
// 例：OverviewPanel.vue
const props = defineProps({ year: Number })

const yearRef = computed(() => ({ year: props.year }))
const dashboard = useReportData('dashboard', yearRef,
  ({ year }) => getDashboard({ year })
)
const finance = useReportData('finance', yearRef,
  ({ year }) => getFinanceSummary(year)
)

// template 用 dashboard.loading.value / dashboard.data.value
```

**FinanceSummaryPanel** 特例：params 含 `selectedMonth`（panel 內 state），cache key 自動含進去，月份切換自動 cache 命中。

#### Skeleton

每個 panel `<template>` 結構：

```vue
<el-skeleton v-if="dashboard.loading.value && !dashboard.data.value" :rows="6" animated />
<div v-else>...</div>
```

「首次 loading 才顯 skeleton；refresh 時保留舊資料（避免閃爍）」。

### 2.4 Tab Lazy Loading

`ReportsView.vue` 已有 `v-if="activeTab === '<name>'"`，**保留不動**（已是正確的 lazy mount 行為）。配合各 panel 自己 fetch，達成「真正只抓當前 tab 需要的資料」。

---

## 3. 不做的事（YAGNI）

- ❌ 改動後端：`report_cache_service` 已夠用
- ❌ 動 echarts 圖表結構或設定
- ❌ 動匯出（`/export` endpoint 不在此範圍）
- ❌ 加 ETag / Cache-Control header（與本層 cache 互補但複雜度不值）
- ❌ Service Worker 快取（PWA 已有，但報表頁不在 SW scope）
- ❌ 對接 store（Pinia）：composable 內部維護 Map 已足夠，引入 store 增加複雜度

---

## 4. 測試策略

### Vitest（必補）

新增 `tests/composables/useReportData.spec.js`：

1. **cache hit**：同 key+params 在 TTL 內第二次呼叫，fetcher 只被叫一次
2. **cache miss after TTL**：vi.useFakeTimers 推進 TTL 後，fetcher 重新呼叫
3. **inflight dedupe**：未 resolve 的 Promise 期間第二次呼叫，共享同一 Promise
4. **params 變化**：params ref 改值，新 key 抓新資料，舊 key cache 仍保留
5. **invalidate**：`invalidateReportData(key)` 後下次呼叫 fetcher 被叫
6. **error 不快取**：fetcher reject 後，下次仍呼叫 fetcher

不補 panel 整合測試（panel 多 mock 量大，ROI 低）。手動驗證為主。

### 手動驗證

跑 `./start.sh` 後在 `http://localhost:5173/reports`：

| 步驟 | 預期 Network 行為 |
| --- | --- |
| 進頁，default tab=overview | 看到 1 個 `/dashboard` + 1 個 `/finance-summary`（OverviewPanel 需兩個） |
| 切 tab → 出勤 | **不發 request**（dashboard 已 cached） |
| 切 tab → 收支 | **0 個 request**（FinancePanel 與 OverviewPanel 的 `getFinanceSummary(year)` 經 params 正規化後共用同一 cache key） |
| FinancePanel 切月份 | 1 個 `/finance-summary?year=...&month=N` |
| 切年份 2025 → 2024 | 1 個 `/dashboard?year=2024` + 1 個 `/finance-summary` |
| 切回 2025 | **不發 request**（cached） |
| 等 5 分鐘後切年份 | 重新發 request |
| 任何 panel 載入中 | 該 panel 顯 skeleton，**不再全頁遮罩** |

### 不破壞測試

- 既有 1340 Vitest 全綠
- ReportsView / 4 panel 既有測試（如有）全綠

---

## 5. 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| Cache stale：薪資封存後報表沒更新 | 提供 `invalidateReportData` API；本 phase 不接，留 P3/P4 處理（也可手動 refresh）。Cache TTL 5 分鐘已是合理上限 |
| FinanceSummaryPanel 既有功能（月份切換、下鑽 dialog）回歸 | 手動跑完所有 panel 互動；Vitest 跑 panel 既有測試 |
| Inflight dedupe 邏輯錯誤 → 共享 Promise 後 unmount panel cancel 影響其他訂閱者 | composable 內 fetcher 不接 abortSignal（簡化設計）；Vue unmount 不會 cancel Promise，只 unsub watcher |
| 多 panel watch 同 props.year，timing race | `useReportData` 內部已 dedupe；同 (key, params) 同步啟動只有一次 fetch |

---

## 6. 驗收標準

1. ✅ 進報表頁 default tab=overview：Network 看到 **2 個 request**（dashboard + finance），與現況數量一致；改善點在後續操作
2. ✅ 切到「收支」tab：**0 個新 request**（cache hit），不再多打一次 `/finance-summary`（修真 bug）
3. ✅ 切到「出勤」/「薪資」tab：**0 個新 request**（dashboard cache hit）
4. ✅ 年份來回切：第二次切回不發 request（cache hit）
5. ✅ 每個 panel skeleton：載入中時該 panel 顯 skeleton，其他 panel 可正常運作
6. ✅ 既有 Vitest 全綠（1340 個）
7. ✅ 新增 `useReportData` 6 個測試全綠

---

## 7. 檔案異動清單

**新增**：

- `src/composables/useReportData.js`（~80 行）
- `tests/composables/useReportData.spec.js`（~120 行）

**修改**：

- `src/views/ReportsView.vue`：移除 fetch 邏輯，純 shell（110 → ~70 行）
- `src/views/reports/OverviewPanel.vue`：改用 composable
- `src/views/reports/FinanceSummaryPanel.vue`：改用 composable（移除 `onMounted(fetchData)`）
- `src/views/reports/AttendancePanel.vue`：改用 composable
- `src/views/reports/SalaryPanel.vue`：改用 composable

**不動**：

- `src/api/reports.js`（API 簽名不變）
- 後端任何檔案
- `chartSetup.js`、`FinanceDetailDialog.vue`

---

## 8. 後續 phase 預告（不在此 spec 範圍）

- **P2**：KPI 卡片首屏 + 視覺升級
- **P3**：篩選與下鑽（月/班/部門/假別）
- **P4**：整合 ChurnPanel/FunnelPanel + 才藝/招生報表

每個 phase 完成後再為下個 phase 寫獨立 spec。

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

### 2.1 重用既有 `useCachedAsync` composable

**📌 重要修訂（2026-05-14）**：原計畫新建 `useReportData`，但發現 `src/composables/useCachedAsync.js` 已存在且功能完全涵蓋（TTL cache + stale-while-revalidate + inflight dedupe + global invalidate by prefix + AbortController）。已有測試檔 `tests/unit/composables/useCachedAsync.test.js`，parent 端 3 view（MeView、TodayView、FamilyView）在用。**P1 改為複用，不新建 composable**。

#### 既有介面（節錄自 `useCachedAsync.js` JSDoc）

```js
const { data, error, pending, isStale, refresh, invalidate } = useCachedAsync(
  key,         // string；同 key 跨元件共享 cache
  fetcher,     // (signal: AbortSignal) => Promise<any>
  {
    ttl: 300_000,        // 多久內視為 fresh
    immediate: true,     // mount 時自動 fetch
    initialData: null,
  }
)

// 全域 invalidate by prefix
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
invalidateCachedAsync('reports/')  // 清掉所有 reports/* cache
```

#### Key 命名慣例（沿用 parent 端 pattern）

- Dashboard：`reports/dashboard:{year}`（例：`reports/dashboard:2026`）
- Finance（全年）：`reports/finance:{year}`（month 為 null/undefined 時）
- Finance（指定月）：`reports/finance:{year}:{month}`（例：`reports/finance:2026:3`）

**為何字串拼接 key 取代 spec 舊版的「物件 + JSON 正規化」**：parent 端既有 3 個 view 已用字串拼接 pattern，跟著一致；同時把「month=null 與省略 month 視為同 cache 鍵」的責任放到 key 組裝端（callers 自己負責），不需要 composable 內部做 canonicalize。Caller side 寫法：

```js
const financeKey = computed(() =>
  selectedMonth.value != null
    ? `reports/finance:${props.year}:${selectedMonth.value}`
    : `reports/finance:${props.year}`
)
```

#### Reactive params：watch + refresh pattern

`useCachedAsync` 本身**不 watch params**，由 caller 控制：

```js
const dashboardKey = computed(() => `reports/dashboard:${props.year}`)
const { data, pending, refresh } = useCachedAsync(
  dashboardKey.value,  // 初始 key（注意：non-reactive 傳入）
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
watch(() => props.year, () => refresh(false))  // 換 year 重抓（cache hit 不打 API）
```

**注意 key 必須隨參數變化**。本 P1 因為 `useCachedAsync` 簽名是 `(key, ...)`，目前 parent 端 pattern 是 **重建 composable instance** 或 **直接呼叫 refresh()**。本案選後者：watch year 變化 → refresh()。cache map 內部以「最後抓的 key」為準；同 year 重訪命中，新 year 走 fetcher。

> ⚠️ 實作 caveat：caller 必須**在 fetcher 內讀取最新的 reactive 值**（如 `props.year`），不能 closure 凍結舊值。pattern 上面已展示。

#### 為何 TTL = 5 分鐘

後端 DB cache 30 分鐘是「上限」（資料異動端會 `invalidate_category` 主動清）。前端 5 分鐘較短，避免 user 修了資料後看不到變化；同時夠覆蓋「切 tab 來回」的常見操作。沿用 parent 端 60_000 ms 也可考慮，但 admin 報表頁互動頻率較低，5 分鐘 ROI 較好。

### 2.2 重構 `ReportsView.vue`

**改動**：

- 移除父層 `fetchDashboard` / `fetchFinance` / `dashboardData` / `financeData` / `loading`
- 父層只保留 `selectedYear`、`activeTab`，作為 props 傳給各 panel
- 移除全頁 `v-loading`

**改後職責**：純粹是 layout shell + tab switching。

### 2.3 重構 4 個 Panel

每個 panel 改用 `useCachedAsync`，自己管 loading / error / data：

```js
// 例：OverviewPanel.vue
import { computed, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'

const props = defineProps({ year: { type: Number, required: true } })

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
const finance = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => {
  dashboard.refresh(false)
  finance.refresh(false)
})

// template 用 dashboard.pending.value / dashboard.data.value（pending 而非 loading）
```

**FinanceSummaryPanel** 特例：key 隨 `selectedMonth` 變化，要 watch month 並 refresh：

```js
const props = defineProps({ year: { type: Number, required: true } })
const selectedMonth = ref(null)

const financeKey = computed(() =>
  selectedMonth.value != null
    ? `reports/finance:${props.year}:${selectedMonth.value}`
    : `reports/finance:${props.year}`
)

const finance = useCachedAsync(
  financeKey.value,
  () => getFinanceSummary(props.year, selectedMonth.value).then(r => r.data),
  { ttl: 300_000 }
)

watch([() => props.year, selectedMonth], () => finance.refresh(false))
```

#### Skeleton

每個 panel `<template>` 結構：

```vue
<el-skeleton v-if="dashboard.pending.value && !dashboard.data.value" :rows="6" animated />
<div v-else>...</div>
```

「首次 loading 才顯 skeleton；refresh 時保留舊資料（avoid flash）」—— 這也是 `useCachedAsync` 內建的 SWR 行為（line 82：`pending.value = data.value == null`）。

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

### Vitest

`useCachedAsync` 已有測試（`tests/unit/composables/useCachedAsync.test.js`），**不需新增 composable 測試**。

panel 與 ReportsView 既有 spec（若存在）需通過。本 P1 不為 panel 補新整合測試（mock 量大、ROI 低，手動驗證為主）；但若改 panel 過程中發現該 panel 有既有 spec 引用 `dashboardData` / `financeData` 等舊 prop 命名，需同步更新該 spec。

執行：`npm run test -- --run` 全綠（既有 1340 個）。

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
6. ✅ 既有 Vitest 全綠（1340 個；含既有 `useCachedAsync` 測試）

---

## 7. 檔案異動清單

**新增**：（無，複用既有 `useCachedAsync`）

**修改**：

- `src/views/ReportsView.vue`：移除 fetch 邏輯，純 shell（110 → ~70 行）
- `src/views/reports/OverviewPanel.vue`：改用 `useCachedAsync`，自抓 dashboard + finance
- `src/views/reports/FinanceSummaryPanel.vue`：改用 `useCachedAsync`，cache key 含 month；移除 `onMounted(fetchData)`
- `src/views/reports/AttendancePanel.vue`：改用 `useCachedAsync`，自抓 dashboard
- `src/views/reports/SalaryPanel.vue`：改用 `useCachedAsync`，自抓 dashboard + finance

**不動**：

- `src/composables/useCachedAsync.js`（直接重用既有實作）
- `src/api/reports.js`（API 簽名不變）
- 後端任何檔案
- `chartSetup.js`、`FinanceDetailDialog.vue`

---

## 8. 後續 phase 預告（不在此 spec 範圍）

- **P2**：KPI 卡片首屏 + 視覺升級
- **P3**：篩選與下鑽（月/班/部門/假別）
- **P4**：整合 ChurnPanel/FunnelPanel + 才藝/招生報表

每個 phase 完成後再為下個 phase 寫獨立 spec。

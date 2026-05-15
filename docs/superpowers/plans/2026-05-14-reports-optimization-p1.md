# 報表統計優化 P1：載入性能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修 admin「報表統計」頁的重複請求 bug，引入 client cache 讓切 tab / 切年份不發冗餘 request，並把全頁 loading 改為各 panel 自管 skeleton。

**Architecture:** 重用既有 `src/composables/useCachedAsync.js`（已有 TTL cache + inflight dedupe + AbortController + SWR）。改造 admin「報表統計」頁的 1 個 shell（`ReportsView.vue`）+ 4 個 panel（Overview / FinanceSummary / Attendance / Salary），每個 panel 自己用 composable 取資料，父層只管 `selectedYear` 與 `activeTab`。

**Tech Stack:** Vue 3 SFC `<script setup>`、Element Plus（`el-skeleton`、`el-tabs`）、Vitest（既有 1340 個測試需保持綠燈）。

**Spec:** `docs/superpowers/specs/2026-05-14-reports-optimization-p1-design.md`

**Branch:** `feat/reports-optimization-p1-frontend`（已開）

---

## 前置知識

### `useCachedAsync` 介面（src/composables/useCachedAsync.js）

```js
const {
  data,        // shallowRef，初始為 initialData
  error,       // ref，最近一次 fetch 的 error
  pending,     // ref boolean；data 為 null 時才在 fetch 期間 true（SWR：有舊資料不顯 spinner）
  fetchedAt,   // ref number，最近一次成功 fetch 的 timestamp
  isStale,     // computed boolean
  refresh,     // (force=false) => Promise<data>；TTL 內 cache hit 不打 API
  invalidate,  // () => void；清掉此 key 的 cache
} = useCachedAsync(
  key,                                // string
  fetcher,                            // (signal: AbortSignal) => Promise<data>
  { ttl = 60_000, immediate = true, initialData = null }
)

// 全域 invalidate by prefix（本 P1 不用，留給後續 phase）
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
invalidateCachedAsync('reports/')
```

### Cache key 慣例

- Dashboard：`reports/dashboard:${year}`
- Finance（全年）：`reports/finance:${year}`
- Finance（指定月）：`reports/finance:${year}:${month}`

### 重要 caveat

- `useCachedAsync` 的 `key` 參數是 **call-time 字串**，不 reactive。當 year 變化時不能靠 key reactivity 觸發重抓 → 必須 `watch(() => props.year, () => refresh(false))`。fetcher 內部需讀 `props.year` 當下值（closure 會凍結 — 因此 fetcher 寫 `() => getDashboard({ year: props.year })` 而非預先解構）。
- 同 (key) 但 fetcher 內部讀取的 reactive 值改變時，refresh() 會用新值打 API；新結果寫到此 instance 的 `data` 與 cache 的同 key 條目（會覆蓋舊年資料）。**這就是為什麼 key 必須含 year**：不同 year 走不同 cache 條目，不互相覆蓋。

### Skeleton pattern

```vue
<template>
  <el-skeleton v-if="dashboard.pending.value && !dashboard.data.value" :rows="6" animated />
  <div v-else>
    <!-- 既有 chart / KPI 內容 -->
  </div>
</template>
```

### Verification command

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -20
```

需見 `Test Files  XX passed (XX)` 與 `Tests  1340 passed (1340)`（既有總數；可能因新 PR 略增減，以 baseline 為準）。

---

## 檔案結構

| 檔案 | 動作 | 重點 |
| --- | --- | --- |
| `src/views/reports/AttendancePanel.vue` | 修改 | 改用 useCachedAsync 抓 dashboard；接收 `year` prop 取代 `data` prop；加 skeleton |
| `src/views/reports/SalaryPanel.vue` | 修改 | 改用 useCachedAsync 抓 dashboard + finance；接 `year` prop；加 skeleton |
| `src/views/reports/OverviewPanel.vue` | 修改 | 改用 useCachedAsync 抓 dashboard + finance；接 `year` prop；加 skeleton |
| `src/views/reports/FinanceSummaryPanel.vue` | 修改 | 改用 useCachedAsync（cache key 含 month）；接 `year` prop；加 skeleton |
| `src/views/ReportsView.vue` | 修改 | 移除 fetch state、全頁 v-loading；只傳 `:year` |
| `src/api/reports.js` | 不動 | API 簽名不變 |
| `src/composables/useCachedAsync.js` | 不動 | 直接重用 |

---

## Task 1：AttendancePanel 改用 useCachedAsync

**動機**：4 個 panel 中最單純（只用 dashboard，不用 finance），先打通流程。完成後其他 panel 套同模板。

**Files:**
- Modify: `src/views/reports/AttendancePanel.vue`

- [ ] **Step 1：替換 `<script setup>` 區塊**

`src/views/reports/AttendancePanel.vue` 開頭整段 `<script setup>` 替換為：

```vue
<script setup>
import { computed, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard } from '@/api/reports'
import { LineChart, BarChart, MONTH_LABELS } from './chartSetup.js'

const props = defineProps({
  year: { type: Number, required: true },
})

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => dashboard.refresh(false))

const data = computed(() => dashboard.data.value || {
  attendance_monthly: [],
  attendance_by_classroom: [],
  leave_monthly: [],
})

const attendanceChartData = computed(() => {
  const monthMap = {}
  ;(data.value.attendance_monthly || []).forEach(d => { monthMap[d.month] = d })
  const rates = [], late = [], early = [], miss = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d ? d.rate : null)
    late.push(d ? d.late : null)
    early.push(d ? d.early_leave : null)
    miss.push(d ? d.missing : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '出勤率 (%)', data: rates, borderColor: '#409EFF', backgroundColor: 'rgba(64,158,255,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
      { label: '遲到次數', data: late, borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' },
      { label: '早退次數', data: early, borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', borderDash: [4, 4], tension: 0.3, yAxisID: 'y1' },
      { label: '缺卡次數', data: miss, borderColor: '#F56C6C', backgroundColor: 'rgba(245,108,108,0.1)', borderDash: [3, 3], tension: 0.3, yAxisID: 'y1' },
    ],
  }
})

const attendanceChartOptions = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'top' }, title: { display: false } },
  scales: {
    y: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } },
    y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '次數' } },
  },
  spanGaps: true,
}

const classroomChartData = computed(() => {
  const arr = data.value.attendance_by_classroom || []
  const labels = arr.map(d => d.classroom)
  const rates = arr.map(d => d.rate)
  const colors = rates.map(r => r >= 95 ? '#67C23A' : r >= 90 ? '#E6A23C' : '#F56C6C')
  return { labels, datasets: [{ label: '出勤率 (%)', data: rates, backgroundColor: colors, borderRadius: 4 }] }
})

const classroomChartOptions = {
  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } } },
}

const leaveChartData = computed(() => {
  const arr = data.value.leave_monthly || []
  const personal = arr.map(d => d.personal || 0)
  const sick = arr.map(d => d.sick || 0)
  const annual = arr.map(d => d.annual || 0)
  const other = arr.map(d => (d.menstrual || 0) + (d.maternity || 0) + (d.paternity || 0))
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '事假', data: personal, backgroundColor: '#E6A23C', stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: '#409EFF', stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: '#67C23A', stack: 'leaves' },
      { label: '其他', data: other, backgroundColor: '#909399', stack: 'leaves' },
    ],
  }
})

const leaveChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '次數' } } },
}
</script>
```

**改動重點**：
- `defineProps` 從 `data: Object` 改為 `year: Number, required: true`
- 新增 `useCachedAsync` 抓 dashboard
- 新增 `watch(() => props.year, ...)` 切年份重抓
- 新增 `data` computed 從 `dashboard.data.value` 解出（含 fallback 空物件）
- 所有 `props.data.X` 改為 `data.value.X`（因為 `data` 現在是 computed ref）

- [ ] **Step 2：替換 `<template>` 區塊加入 skeleton**

把 `<template>` 整段換成：

```vue
<template>
  <el-skeleton v-if="dashboard.pending.value && !dashboard.data.value" :rows="8" animated />
  <el-row v-else :gutter="16">
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">月度出勤率趨勢</span></template>
        <div class="chart-container"><LineChart :data="attendanceChartData" :options="attendanceChartOptions" /></div>
      </el-card>
    </el-col>
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">各班級出勤統計</span></template>
        <div class="chart-container">
          <BarChart v-if="data.attendance_by_classroom?.length" :data="classroomChartData" :options="classroomChartOptions" />
          <el-empty v-else description="無班級出勤資料" :image-size="60" />
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">請假趨勢分析</span></template>
        <div class="chart-container"><BarChart :data="leaveChartData" :options="leaveChartOptions" /></div>
      </el-card>
    </el-col>
  </el-row>
</template>
```

`<style>` 區塊不動。

- [ ] **Step 3：跑測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -10
```

Expected：`Test Files  XX passed`、`Tests  1340 passed`（既有測試數，不可破）。
若 ReportsView 既有測試引用 `:data` prop，會失敗 → 暫時不修，等 Task 5 一起改。
**若 Task 1 後測試紅 → 必為 ReportsView spec 引用 `<AttendancePanel :data="...">`。在 Task 1 commit 前不修，因 ReportsView 還沒重構；可在 ReportsView 測試暫時 stub AttendancePanel 或標 skip 至 Task 5。**

- [ ] **Step 4：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/AttendancePanel.vue && git commit -m "$(cat <<'EOF'
refactor(reports): AttendancePanel 改用 useCachedAsync 自抓 dashboard

接收 year prop 取代 data prop；加 skeleton；watch year 變化 refresh。
Cache key reports/dashboard:{year} 與其他 panel 共用，切 tab 命中不重抓。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：SalaryPanel 改用 useCachedAsync

**Files:**
- Modify: `src/views/reports/SalaryPanel.vue`

- [ ] **Step 1：替換 `<script setup>` 區塊**

```vue
<script setup>
import { computed, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { BarChart, MONTH_LABELS } from './chartSetup.js'
import { money } from '@/utils/format'

const props = defineProps({
  year: { type: Number, required: true },
})

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

const data = computed(() => dashboard.data.value || { salary_monthly: [] })
const financeData = computed(() => finance.data.value)
const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)

const salaryChartData = computed(() => {
  const monthMap = {}
  ;(data.value.salary_monthly || []).forEach(d => { monthMap[d.month] = d })
  const gross = [], net = [], bonus = [], ot = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    gross.push(d ? d.total_gross : null)
    net.push(d ? d.total_net : null)
    bonus.push(d ? d.total_bonus : null)
    ot.push(d ? d.total_overtime_pay : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '應發總額', data: gross, backgroundColor: 'rgba(64,158,255,0.6)', borderColor: '#409EFF', borderWidth: 1, borderRadius: 4, order: 3 },
      { label: '實發總額', data: net, type: 'line', borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: false, tension: 0.3, pointRadius: 4, order: 1 },
      { label: '獎金', data: bonus, type: 'line', borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', fill: false, tension: 0.3, borderDash: [5, 5], pointRadius: 3, order: 2 },
      { label: '加班費', data: ot, type: 'line', borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', fill: false, tension: 0.3, borderDash: [3, 3], pointRadius: 3, order: 2 },
    ],
  }
})

const salaryChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : 0}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: '金額 (NTD)' },
      ticks: { callback: (val) => '$' + (val / 1000).toFixed(0) + 'k' },
    },
  },
  spanGaps: true,
}

const expenseCategories = computed(() => financeData.value?.expense_by_category || [])
const totalEmployerBenefit = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'employer_benefit')
  return row?.amount || 0
})
const totalGross = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'salary_gross')
  return row?.amount || 0
})
</script>
```

**改動重點**：
- props 從 `data` + `finance` 改為僅 `year`
- 新增 2 個 `useCachedAsync`（dashboard + finance）
- `data` / `financeData` 改為從 composable computed 取出
- `expenseCategories` 改用 `financeData.value?.expense_by_category`（原為 `props.finance?.expense_by_category`）

- [ ] **Step 2：替換 `<template>` 區塊加入 skeleton**

```vue
<template>
  <el-skeleton v-if="loading" :rows="8" animated />
  <div v-else>
    <el-card class="chart-card" shadow="hover">
      <template #header><span class="chart-title">薪資支出月度比較</span></template>
      <div class="chart-container chart-container--tall">
        <BarChart :data="salaryChartData" :options="salaryChartOptions" />
      </div>
    </el-card>

    <el-card v-if="financeData" class="chart-card" shadow="hover">
      <template #header><span class="chart-title">園方人事成本（本年彙總）</span></template>
      <el-row :gutter="16">
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">員工應發</div>
            <div class="kpi-value">{{ money(totalGross) }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">雇主保費+勞退</div>
            <div class="kpi-value kpi-orange">{{ money(totalEmployerBenefit) }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="kpi">
            <div class="kpi-label">園方真實支出</div>
            <div class="kpi-value kpi-blue">{{ money(totalGross + totalEmployerBenefit) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>
```

`<style>` 不動。

- [ ] **Step 3：跑測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -10
```

Expected：1340 passed（同 Task 1）。ReportsView 若有對 `:data` / `:finance` 的 spec 仍紅，Task 5 修。

- [ ] **Step 4：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/SalaryPanel.vue && git commit -m "$(cat <<'EOF'
refactor(reports): SalaryPanel 改用 useCachedAsync 自抓 dashboard + finance

接收 year prop 取代 data + finance props；共用 reports/dashboard:{year} 與
reports/finance:{year} cache key，避免與其他 panel 重複請求。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：OverviewPanel 改用 useCachedAsync

**Files:**
- Modify: `src/views/reports/OverviewPanel.vue`

- [ ] **Step 1：替換 `<script setup>` 區塊**

```vue
<script setup>
import { computed, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { Money, Coin, Wallet, TrendCharts, Calendar, Check, DataAnalysis } from '@element-plus/icons-vue'
import { money } from '@/utils/format'

const props = defineProps({
  year: { type: Number, required: true },
})

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

const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)

const summary = computed(() => finance.data.value?.summary || {
  total_revenue: 0,
  total_refund: 0,
  net_revenue: 0,
  total_expense: 0,
  net_cashflow: 0,
})

const currentMonth = new Date().getMonth() + 1
const mom = computed(() => {
  const trend = finance.data.value?.monthly_trend || []
  if (!trend.length) return null
  const curr = trend.find(r => r.month === currentMonth) || null
  const prev = trend.find(r => r.month === currentMonth - 1) || null
  if (!curr || !prev) return null
  const pct = (a, b) => {
    if (!b) return null
    return ((a - b) / b) * 100
  }
  return {
    revenue: pct(curr.revenue, prev.revenue),
    expense: pct(curr.expense, prev.expense),
    net: pct(curr.net, prev.net),
  }
})

const netClass = computed(() => {
  const v = summary.value.net_cashflow || 0
  if (v > 0) return 'value-green'
  if (v < 0) return 'value-red'
  return ''
})

const avgAttendanceRate = computed(() => {
  const arr = dashboard.data.value?.attendance_monthly || []
  if (!arr.length) return null
  return (arr.reduce((s, d) => s + (d.rate || 0), 0) / arr.length).toFixed(1)
})

const formatPct = (v) => {
  if (v == null || !Number.isFinite(v)) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}
</script>
```

**改動重點**：
- props 從 `finance` + `dashboard` 改為僅 `year`
- 新增 2 個 `useCachedAsync`
- `summary` / `mom` 改用 `finance.data.value?.X`
- `avgAttendanceRate` 改用 `dashboard.data.value?.attendance_monthly`

- [ ] **Step 2：替換 `<template>` 區塊**

整段 `<template>...</template>` 替換為（外層加 v-if skeleton，內層 7 個 el-col 完全不動）：

```vue
<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else class="overview">
    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--blue" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Coin /></el-icon></div>
          <div class="kpi-label">本年總收入</div>
          <div class="kpi-value value-blue">{{ money(summary.total_revenue) }}</div>
          <div v-if="mom?.revenue != null" class="kpi-trend" :class="mom.revenue >= 0 ? 'up' : 'down'">
            {{ mom.revenue >= 0 ? '↑' : '↓' }} {{ formatPct(mom.revenue) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">（未扣退款）</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--orange" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Wallet /></el-icon></div>
          <div class="kpi-label">本年退款</div>
          <div class="kpi-value value-orange">{{ money(summary.total_refund) }}</div>
          <div class="kpi-sub">學費+才藝</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--red" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Money /></el-icon></div>
          <div class="kpi-label">本年總支出</div>
          <div class="kpi-value value-red">{{ money(summary.total_expense) }}</div>
          <div v-if="mom?.expense != null" class="kpi-trend" :class="mom.expense >= 0 ? 'up-warn' : 'down-good'">
            {{ mom.expense >= 0 ? '↑' : '↓' }} {{ formatPct(mom.expense) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">薪資+雇主保費</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--green" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><TrendCharts /></el-icon></div>
          <div class="kpi-label">本年淨現金</div>
          <div class="kpi-value" :class="netClass">{{ money(summary.net_cashflow) }}</div>
          <div v-if="mom?.net != null" class="kpi-trend" :class="mom.net >= 0 ? 'up' : 'down'">
            {{ mom.net >= 0 ? '↑' : '↓' }} {{ formatPct(mom.net) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">（收入-退款-支出）</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Check /></el-icon></div>
          <div class="kpi-label">年度出勤率</div>
          <div class="kpi-value">{{ avgAttendanceRate != null ? `${avgAttendanceRate}%` : '-' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><DataAnalysis /></el-icon></div>
          <div class="kpi-label">淨營收</div>
          <div class="kpi-value">{{ money(summary.net_revenue) }}</div>
          <div class="kpi-sub">總收入 - 退款</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Calendar /></el-icon></div>
          <div class="kpi-label">收支比</div>
          <div class="kpi-value">
            {{ summary.total_expense ? (summary.net_revenue / summary.total_expense).toFixed(2) : '-' }}
          </div>
          <div class="kpi-sub">淨營收 / 總支出</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
```

`<style>` 區塊不動。

- [ ] **Step 3：跑測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -10
```

Expected：1340 passed。

- [ ] **Step 4：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/OverviewPanel.vue && git commit -m "$(cat <<'EOF'
refactor(reports): OverviewPanel 改用 useCachedAsync 自抓 dashboard + finance

接收 year prop 取代 finance + dashboard props；共用 cache key 與其他 panel
避免重複請求；首次載入顯 skeleton 取代依賴父層 v-loading。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：FinanceSummaryPanel 改用 useCachedAsync

**動機**：本 panel 是真 bug 來源（onMounted 重抓）。需處理 selectedMonth 隨改變 cache key。

**Files:**
- Modify: `src/views/reports/FinanceSummaryPanel.vue`

- [ ] **Step 1：替換 `<script setup>` 開頭區塊（第 1 行到 `onMounted(fetchData)` 結束）**

打開 `src/views/reports/FinanceSummaryPanel.vue`。目前第 1–38 行為：

```js
<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { LineChart, PieChart } from './chartSetup.js'
import FinanceDetailDialog from './FinanceDetailDialog.vue'
import { getFinanceSummary, financeSummaryExportUrl } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
import { downloadFile } from '@/utils/download'

const props = defineProps({
  year: { type: Number, required: true },
})

const loading = ref(false)
const exporting = ref(false)
const selectedMonth = ref(null)
const data = ref(null)

const detailVisible = ref(false)
const detailMonth = ref(null)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getFinanceSummary(props.year, selectedMonth.value)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入收支資料失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.year, fetchData)
watch(selectedMonth, fetchData)
onMounted(fetchData)
```

整段替換為：

```js
<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { LineChart, PieChart } from './chartSetup.js'
import FinanceDetailDialog from './FinanceDetailDialog.vue'
import { getFinanceSummary, financeSummaryExportUrl } from '@/api/reports'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
import { downloadFile } from '@/utils/download'

const props = defineProps({
  year: { type: Number, required: true },
})

const exporting = ref(false)
const selectedMonth = ref(null)

const detailVisible = ref(false)
const detailMonth = ref(null)

// 雙軌策略：
// - selectedMonth === null：走 useCachedAsync，cache key 與 OverviewPanel/SalaryPanel
//   共用（reports/finance:${year}），切 tab 命中
// - selectedMonth 有值：直接 axios，不寫入共用 cache（避免污染年級 cache：
//   useCachedAsync 的 key 在 instance 建立時固定，若 refresh() 帶 month 結果會
//   蓋到 reports/finance:${year} 條目，導致 Overview/Salary 拿到月資料而非全年）
const yearLevel = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000, immediate: false }
)
const monthData = ref(null)
const monthLoading = ref(false)

async function loadData() {
  if (selectedMonth.value == null) {
    try {
      await yearLevel.refresh(false)
    } catch (e) {
      ElMessage.error(apiError(e, '載入收支資料失敗'))
    }
  } else {
    monthLoading.value = true
    try {
      const res = await getFinanceSummary(props.year, selectedMonth.value)
      monthData.value = res.data
    } catch (e) {
      ElMessage.error(apiError(e, '載入收支資料失敗'))
    } finally {
      monthLoading.value = false
    }
  }
}

watch([() => props.year, selectedMonth], loadData, { immediate: true })

const data = computed(() =>
  selectedMonth.value == null ? yearLevel.data.value : monthData.value
)
const loading = computed(() => {
  const hasData = data.value != null
  if (selectedMonth.value == null) return yearLevel.pending.value && !hasData
  return monthLoading.value && !hasData
})
```

**改動重點**：
- 移除 `onMounted` import；改 `watch([year, month], loadData, { immediate: true })` 觸發首次載入
- 移除舊 `const loading = ref(false)`、`const data = ref(null)`、`fetchData`、`watch(year)` / `watch(selectedMonth)` 各自
- 雙軌：`yearLevel`（cached）+ `monthData`（直抓）；`useCachedAsync` 設 `immediate: false`，由 `loadData` 控制何時 refresh
- `data` / `loading` 改 `computed`，依當前 `selectedMonth` 切換來源
- 錯誤訊息保留（兩條路徑都有 `ElMessage.error`）

下方第 40 行起的 `const months = ...` 直到 `</script>` 之前的所有 code **完全不動**（既有 computed 引用 `data.value?.X` / `selectedMonth.value`，與新 `data` computed 介面 100% 相容）。

- [ ] **Step 2：替換 `<template>` 第 157 行的根 div**

打開檔案，第 156–157 行為：

```vue
<template>
  <div v-loading="loading" class="finance-panel">
```

把第 157 行整個 `<div>` 開頭（含 `v-loading` 與其後**整個 div 的子孫不動，只動外層**）改為「skeleton + div」結構：

```vue
<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else class="finance-panel">
```

（移除 `v-loading="loading"`，因為 `loading` 現為 computed 且 SWR 行為下 refresh 時不會 true；改用首次 skeleton 即可）

結尾不變（仍然 `</div>` 然後 `</template>`）。

- [ ] **Step 3：跑測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -10
```

Expected：1340 passed。

- [ ] **Step 4：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/reports/FinanceSummaryPanel.vue && git commit -m "$(cat <<'EOF'
refactor(reports): FinanceSummaryPanel 改用 useCachedAsync 修重複 fetch bug

移除 onMounted(fetchData)，改用 useCachedAsync；cache key 與
OverviewPanel/SalaryPanel 共用 reports/finance:{year}，切收支 tab
不再重打 API（本次優化主要修補的真 bug）。

panel 內切 selectedMonth 仍會打 API（key 固定限制），跨 panel 不影響。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：ReportsView 清理 — 移除 fetch state、改 prop 傳遞

**動機**：4 panel 都已自抓，父層的 dashboard/finance fetch 是死碼。

**Files:**
- Modify: `src/views/ReportsView.vue`

- [ ] **Step 1：完整替換檔案**

`src/views/ReportsView.vue` 整檔替換為：

```vue
<script setup>
import { ref, computed } from 'vue'
import { getUserInfo } from '@/utils/auth'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'

const viewerName = computed(() => {
  const info = getUserInfo()
  return info?.display_name || info?.username || '管理員'
})

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const activeTab = ref('overview')
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <div class="page-title">
        <h2>報表統計</h2>
        <span class="viewer-tag">{{ viewerName }} 的報表統計</span>
      </div>
      <el-select v-model="selectedYear" style="width: 120px;">
        <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" type="card" class="reports-tabs">
      <el-tab-pane label="概況" name="overview">
        <OverviewPanel v-if="activeTab === 'overview'" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="收支彙總" name="finance">
        <FinanceSummaryPanel v-if="activeTab === 'finance'" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="出勤" name="attendance">
        <AttendancePanel v-if="activeTab === 'attendance'" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :year="selectedYear" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.reports-page { padding: 0; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.viewer-tag { font-size: 13px; color: var(--el-text-color-secondary); }
.reports-tabs :deep(.el-tabs__item) { font-weight: 600; }
</style>
```

**改動重點**：
- 移除 `getDashboard`、`getFinanceSummary`、`apiError`、`ElMessage` 等 import
- 移除 `dashboardLoading`、`financeLoading`、`dashboardData`、`financeData`、`fetchDashboard`、`fetchFinance`、`fetchAll`、`watch`、`onMounted`
- 移除全頁 `v-loading`
- panel binding 全改為 `:year="selectedYear"`，移除 `:finance` / `:dashboard` / `:data`

- [ ] **Step 2：跑測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -15
```

Expected：1340 passed。本 Task 修完後，Task 1–4 因 ReportsView spec（若有）對 `:data` 假設造成的紅燈也應一併綠回。

- [ ] **Step 3：Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/ReportsView.vue && git commit -m "$(cat <<'EOF'
refactor(reports): ReportsView 移除 fetch state，純 shell 化

panel 已各自用 useCachedAsync 抓資料；父層只保留 selectedYear / activeTab
state 並只傳 :year prop。移除全頁 v-loading（panel 自管 skeleton）。

至此 P1 載入優化完成：切 tab 命中 cache 不重複請求；切年份來回不重打；
panel 載入中只該 panel 顯 skeleton。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：手動驗證（必跑，找回歸）

**動機**：composable 已有 unit test，但組裝行為（切 tab / 切年 / Network 請求數）只有真實瀏覽器能驗。

**Files:** 無修改

- [ ] **Step 1：起 dev server**

開另一個終端：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

或直接：

```bash
cd ~/Desktop/ivy-frontend && npm run dev
```

打開瀏覽器到 `http://localhost:5173/login`，用 `admin / admin123` 登入。

- [ ] **Step 2：用 Chrome DevTools Network 面板驗證 5 個場景**

打開 DevTools → Network → 清空 → 篩選 `reports/` 字串：

| 場景 | 步驟 | 預期 |
| --- | --- | --- |
| A. 首次進頁 | 點側欄「報表統計」 | 看到 1 個 `/api/reports/dashboard?year=2026` + 1 個 `/api/reports/finance-summary?year=2026`，**共 2 個** |
| B. 切「出勤」tab | 點 tab | **0 個新 request**（dashboard cache 命中） |
| C. 切「薪資」tab | 點 tab | **0 個新 request**（dashboard + finance 雙 cache 命中） |
| D. 切「收支」tab | 點 tab | **0 個新 request**（finance cache 命中；這是修真 bug 的核心場景） |
| E. 年份切到上一年再切回 | 切到 2025 → 切回 2026 | 2025 各 1 個 dashboard + finance；切回 2026 **0 個新 request** |

每個場景失敗都需排查；若 D 仍見 finance-summary 重打 → cache key 未對齊（檢查 OverviewPanel 與 FinanceSummaryPanel 的 key 是否都是 `reports/finance:{year}`）。

- [ ] **Step 3：UI 回歸**

切到 4 個 tab 各看一遍：

- 概況：KPI 卡 4 個（總收入/退款/總支出/淨現金）、3 個輔助卡（出勤率/淨營收/收支比），數字非全 0（或正確顯 0）
- 收支彙總：折線圖 + 圓餅圖；切 selectedMonth 1–12 應能切換、下鑽 dialog 能開
- 出勤：3 張圖（趨勢/班級/請假）正常
- 薪資：1 張圖 + 3 個 KPI

任一壞掉就回到對應 task 的 commit 排查。

- [ ] **Step 4：最終測試**

```bash
cd ~/Desktop/ivy-frontend && npm test 2>&1 | tail -10
```

Expected：全綠。

- [ ] **Step 5：建立 PR（不 push 上 origin，由 user 決定）**

```bash
cd ~/Desktop/ivy-frontend && git log --oneline feat/reports-optimization-p1-frontend ^main
```

確認 commit 鏈：
- docs(reports): P1 載入性能優化設計 spec
- docs(reports): P1 spec 修正改用既有 useCachedAsync
- refactor(reports): AttendancePanel ...
- refactor(reports): SalaryPanel ...
- refactor(reports): OverviewPanel ...
- refactor(reports): FinanceSummaryPanel ...
- refactor(reports): ReportsView ...

回報 user：「P1 完成，分支 `feat/reports-optimization-p1-frontend`，X 個 commit，等指示 push / open PR / 進 P2」。

---

## Self-Review

### Spec coverage 對照

| Spec 章節 | Task 對應 |
| --- | --- |
| §1.1 痛點 1 重複請求 | Task 4（FinanceSummaryPanel）+ Task 5（ReportsView 移除父層 fetch） |
| §1.2 痛點 2 進頁抓兩 endpoint | Task 5（移除父層 fetch；現在依當前 tab 由該 panel 各自抓） |
| §1.3 痛點 3 無客端 cache | Task 1–4（每個 panel 改用 useCachedAsync） |
| §1.4 痛點 4 全頁遮罩 | Task 1–4 加 skeleton + Task 5 移除 v-loading |
| §2.1 reuse useCachedAsync | Task 1–4 都用 |
| §2.2 ReportsView 純 shell | Task 5 |
| §2.3 panel 重構 + skeleton | Task 1–4 |
| §2.4 tab lazy mount 保留 | Task 5（`v-if="activeTab === '...'"` 保留） |
| §4 測試 | Task 1–5 每個 step 都跑 npm test；Task 6 手動驗證 |
| §6 驗收 #1–#6 | Task 6 Step 2 表格 + Step 3 UI 回歸 + Step 4 npm test |
| §7 檔案異動清單 | 與 Task files 完全對齊 |

### 風險與緩解

- **Task 4 Step 1.5 限制**：FinanceSummaryPanel 內切 month 不享受 cache。已在 spec §5（risks）暗含，commit message 明寫。後續 phase 若決定修，方案是「動態重建 useCachedAsync instance」或「升級 composable 接受 reactive key」。
- **ReportsView 既有 spec 紅燈**：Task 1–4 期間若有測試引用 `:data` / `:finance` / `:dashboard`，會紅；Task 5 修。各 step 跑 `npm test` 容忍此暫時紅，commit 前確認 baseline diff 合理（紅的 case 屬已知）。

### Placeholder scan

無 TBD / TODO / 未具體化的 step。每個 step 都有可執行的指令或可貼上的 code block。

### Type consistency

- 4 個 panel 都接 `year: { type: Number, required: true }` 一致。
- Cache key 命名 `reports/dashboard:{year}` / `reports/finance:{year}` / `reports/finance:{year}:{month}` 全 plan 一致。
- `useCachedAsync` 返回的 `pending` / `data` / `refresh` 用法一致（不用 `loading` — 那是 useFetchPending 的命名）。

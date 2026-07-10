# 報表統計 UI/UX 全面改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 spec `docs/superpowers/specs/2026-07-10-reports-ui-ux-redesign-design.md` 把 /#/reports 改成「儀表板式總覽＋分頁下鑽」，根治資料懸崖、MoM 錨點 bug、KPI 口徑虛胖與各 tab 呈現問題。

**Architecture:** 純前端。新增 `computeReportPeriod` 純函式作為「資料截止月」單一事實來源；`financeTrend.ts` 擴充口徑/截斷/持平 helper；新增 3 個小元件（ReportKpiCard / CategoryBarList / SparkLine）；六個 panel 逐一重排；ReportsView 做 tab 重組＋URL query 同步＋資料截至 badge。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、chart.js（經 `@/composables/useChartJs`）、Vitest + @vue/test-utils。

## Global Constraints

- 全程 TypeScript strict：禁 `: any` / `as any`；新 SFC 一律 `<script setup lang="ts">`。
- **不動後端**：不改任何 `src/api/*.ts` 的請求參數與端點、不觸發 OpenAPI regen。
- 共用 checkout 有平行 session：**commit 一律 path 限定 `git commit -m "..." -- <檔案們>`**，絕不裸 commit；`git add` 也只 add 自己的檔。
- Commit message：Conventional Commits、繁體中文、結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 針對性測試：`cd ~/Desktop/ivy-frontend && npx vitest run <測試檔路徑>`。
- 既有 tab `name` key（`overview`/`finance`/`monthly-pnl`/`fixed-cost`/`attendance`/`salary`）**不改**，只改顯示 label 與順序。
- 語意色 token 沿用：收=綠 `--color-success`、支=紅 `--color-danger`、退=橘 `--color-warning`、淨=藍 `--color-info`、持平=灰 `--text-secondary`。
- 新 UI 元素加 `data-test` 屬性。
- 使用 `useCachedAsync` 的 panel 測試：`beforeEach` 呼叫 `invalidateCachedAsync('reports/')`（從 `@/composables/useCachedAsync` import）避免模組級快取跨測試污染。
- mock 的 response 形狀必抄真實後端契約（reports API 均為 `api.get(...)` 回 `{ data: ... }`，除 `getMonthlyPnL` 已在 wrapper `.then(r => r.data)` 解包）。

---

### Task 1: financeTrend.ts helper 擴充（口徑加總／未來預登錄／series 截斷／持平判定）

**Files:**
- Modify: `src/views/reports/financeTrend.ts`
- Test: `src/views/reports/__tests__/financeTrend.test.ts`（新檔）

**Interfaces:**
- Consumes: 既有 `FinanceTrendRow`、`lastMonthWithData`、`pctChange`（同檔）。
- Produces（後續 Task 5–8 依賴，簽名固定）:
  ```ts
  export interface TrendSums { revenue: number; refund: number; expense: number; net: number }
  export function sumTrendUpTo(trend: FinanceTrendRow[], uptoMonth: number): TrendSums
  export function futurePreloggedExpense(trend: FinanceTrendRow[], afterMonth: number): { total: number; months: number[] }
  export function cutSeries(trend: FinanceTrendRow[], key: 'revenue' | 'refund' | 'expense' | 'net', cutoffMonth: number): (number | null)[]
  export type DeltaKind = 'up' | 'down' | 'flat'
  export function deltaKind(v: number | null): DeltaKind | null
  ```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/financeTrend.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  sumTrendUpTo,
  futurePreloggedExpense,
  cutSeries,
  deltaKind,
  type FinanceTrendRow,
} from '../financeTrend'

// 模擬 dev DB 實況：1–7 月有實際收支，8–12 月只有預登錄固定支出 500,000
function makeTrend(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    if (m <= 7) {
      rows.push({ month: m, revenue: 1000 * m, refund: 10 * m, expense: 500 * m, net: 1000 * m - 10 * m - 500 * m })
    } else {
      rows.push({ month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
    }
  }
  return rows
}

describe('sumTrendUpTo', () => {
  it('只加總 month ≤ uptoMonth 的列', () => {
    const s = sumTrendUpTo(makeTrend(), 7)
    expect(s.revenue).toBe(1000 * (1 + 2 + 3 + 4 + 5 + 6 + 7))
    expect(s.expense).toBe(500 * (1 + 2 + 3 + 4 + 5 + 6 + 7))
    expect(s.refund).toBe(10 * 28)
  })
  it('uptoMonth = 0 回全零', () => {
    expect(sumTrendUpTo(makeTrend(), 0)).toEqual({ revenue: 0, refund: 0, expense: 0, net: 0 })
  })
  it('空 trend 回全零', () => {
    expect(sumTrendUpTo([], 12)).toEqual({ revenue: 0, refund: 0, expense: 0, net: 0 })
  })
})

describe('futurePreloggedExpense', () => {
  it('回傳 afterMonth 之後 expense > 0 的月份與總額', () => {
    const f = futurePreloggedExpense(makeTrend(), 7)
    expect(f.months).toEqual([8, 9, 10, 11, 12])
    expect(f.total).toBe(500000 * 5)
  })
  it('無未來預登錄時回空', () => {
    const f = futurePreloggedExpense(makeTrend(), 12)
    expect(f.months).toEqual([])
    expect(f.total).toBe(0)
  })
})

describe('cutSeries', () => {
  it('回傳固定 12 格；month > cutoffMonth 一律 null（不畫），≤ cutoff 保留原值（含真實 0）', () => {
    const s = cutSeries(makeTrend(), 'expense', 7)
    expect(s).toHaveLength(12)
    expect(s[6]).toBe(500 * 7)
    expect(s[7]).toBeNull() // 8 月預登錄 500000 也不畫
    expect(s[11]).toBeNull()
  })
  it('trend 缺某月時該格為 null', () => {
    const sparse: FinanceTrendRow[] = [{ month: 2, revenue: 5, refund: 0, expense: 0, net: 5 }]
    const s = cutSeries(sparse, 'revenue', 12)
    expect(s[0]).toBeNull()
    expect(s[1]).toBe(5)
  })
})

describe('deltaKind', () => {
  it('null → null（無資料，不顯示）', () => expect(deltaKind(null)).toBeNull())
  it('|v| < 0.1 → flat（含 0 與 ±0.05）', () => {
    expect(deltaKind(0)).toBe('flat')
    expect(deltaKind(0.05)).toBe('flat')
    expect(deltaKind(-0.09)).toBe('flat')
  })
  it('v ≥ 0.1 → up；v ≤ -0.1 → down', () => {
    expect(deltaKind(0.1)).toBe('up')
    expect(deltaKind(-23.1)).toBe('down')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/views/reports/__tests__/financeTrend.test.ts`
Expected: FAIL（`sumTrendUpTo` 等 export 不存在）

- [ ] **Step 3: Write minimal implementation**

在 `src/views/reports/financeTrend.ts` 檔尾追加：

```ts
export interface TrendSums { revenue: number; refund: number; expense: number; net: number }

/**
 * 「截至實際發生」口徑：只加總 month ≤ uptoMonth 的列。
 * KPI 主數字用此結果，取代後端 summary 的全年（含未來月預登錄固定支出）口徑。
 */
export function sumTrendUpTo(trend: FinanceTrendRow[], uptoMonth: number): TrendSums {
  const out: TrendSums = { revenue: 0, refund: 0, expense: 0, net: 0 }
  for (const r of trend) {
    if (r.month > uptoMonth) continue
    out.revenue += r.revenue || 0
    out.refund += r.refund || 0
    out.expense += r.expense || 0
    out.net += r.net || 0
  }
  return out
}

/** afterMonth 之後仍有 expense（= 預登錄固定支出）的月份與總額，供口徑副行/表尾說明。 */
export function futurePreloggedExpense(
  trend: FinanceTrendRow[],
  afterMonth: number,
): { total: number; months: number[] } {
  const months: number[] = []
  let total = 0
  for (const r of trend) {
    if (r.month <= afterMonth) continue
    if ((r.expense || 0) > 0) {
      months.push(r.month)
      total += r.expense
    }
  }
  months.sort((a, b) => a - b)
  return { total, months }
}

/**
 * 圖表 series 截斷：固定回傳 12 格，month > cutoffMonth 塞 null（chart.js 不畫），
 * 消除「未來月掉到 0」的資料懸崖；≤ cutoff 的真實 0 照畫。
 */
export function cutSeries(
  trend: FinanceTrendRow[],
  key: 'revenue' | 'refund' | 'expense' | 'net',
  cutoffMonth: number,
): (number | null)[] {
  const byMonth: Record<number, FinanceTrendRow> = {}
  trend.forEach(r => { byMonth[r.month] = r })
  const out: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    if (m > cutoffMonth || !byMonth[m]) {
      out.push(null)
    } else {
      out.push(byMonth[m][key])
    }
  }
  return out
}

export type DeltaKind = 'up' | 'down' | 'flat'

/** MoM/YoY 顯示語意：null=無資料不顯示；|v|<0.1% 視為持平（灰、無箭頭）。 */
export function deltaKind(v: number | null): DeltaKind | null {
  if (v == null || !Number.isFinite(v)) return null
  if (Math.abs(v) < 0.1) return 'flat'
  return v > 0 ? 'up' : 'down'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/financeTrend.test.ts`
Expected: PASS（全綠）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/reports/financeTrend.ts src/views/reports/__tests__/financeTrend.test.ts
git commit -m "feat(reports): financeTrend 擴充口徑加總/截斷/持平 helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/financeTrend.ts src/views/reports/__tests__/financeTrend.test.ts
```

---

### Task 2: `computeReportPeriod` — 資料截止月單一事實來源

**Files:**
- Create: `src/views/reports/useReportPeriod.ts`
- Test: `src/views/reports/__tests__/useReportPeriod.test.ts`

**Interfaces:**
- Consumes: `lastMonthWithData`、`FinanceTrendRow`（Task 1 檔案的既有 export）。
- Produces（Task 5–12 依賴）:
  ```ts
  export interface ReportPeriod {
    isCurrentYear: boolean
    cutoffMonth: number            // 檢視今年→當前真實月；過去年→12；未來年→0
    lastActualMonth: number | null // min(cutoffMonth, lastMonthWithData(trend))；無資料→null
    lastCompleteMonth: number | null // MoM 錨點：今年→min(lastActualMonth, 當前真實月-1)；過去年→lastActualMonth
  }
  export function computeReportPeriod(year: number, trend?: FinanceTrendRow[], today?: Date): ReportPeriod
  ```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/useReportPeriod.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { computeReportPeriod } from '../useReportPeriod'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 6, 10) // 2026-07-10（月為 0-based）

// 1–7 月有實際收支；8–12 月只有預登錄固定支出（expense 500000）
function trendWithPrelogged(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    rows.push(m <= 7
      ? { month: m, revenue: 100, refund: 0, expense: 50, net: 50 }
      : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
  }
  return rows
}

describe('computeReportPeriod — cutoffMonth', () => {
  it('檢視今年 → 當前真實月份', () => {
    expect(computeReportPeriod(2026, undefined, TODAY).cutoffMonth).toBe(7)
  })
  it('過去年 → 12；未來年 → 0', () => {
    expect(computeReportPeriod(2025, undefined, TODAY).cutoffMonth).toBe(12)
    expect(computeReportPeriod(2027, undefined, TODAY).cutoffMonth).toBe(0)
  })
})

describe('computeReportPeriod — lastActualMonth（回歸：預登錄未來月不得拉高錨點）', () => {
  it('未來月只有預登錄固定支出時，lastActualMonth 被 cutoff 夾住 = 7，不是 12', () => {
    const p = computeReportPeriod(2026, trendWithPrelogged(), TODAY)
    expect(p.lastActualMonth).toBe(7)
  })
  it('過去年 → lastMonthWithData 原值（cutoff=12 不夾）', () => {
    const p = computeReportPeriod(2025, trendWithPrelogged(), TODAY)
    expect(p.lastActualMonth).toBe(12) // 過去年檢視時 12 月的 500000 屬真實歷史資料
  })
  it('無 trend 或全空 → null', () => {
    expect(computeReportPeriod(2026, undefined, TODAY).lastActualMonth).toBeNull()
    expect(computeReportPeriod(2026, [], TODAY).lastActualMonth).toBeNull()
  })
  it('未來年 → null（cutoff=0）', () => {
    expect(computeReportPeriod(2027, trendWithPrelogged(), TODAY).lastActualMonth).toBeNull()
  })
})

describe('computeReportPeriod — lastCompleteMonth（MoM 錨點）', () => {
  it('今年、當月有資料 → 錨定上一個完整月（7 月進行中 → 錨 6 月）', () => {
    const p = computeReportPeriod(2026, trendWithPrelogged(), TODAY)
    expect(p.lastCompleteMonth).toBe(6)
  })
  it('過去年 → 錨定 lastActualMonth（12）', () => {
    const p = computeReportPeriod(2025, trendWithPrelogged(), TODAY)
    expect(p.lastCompleteMonth).toBe(12)
  })
  it('今年 1 月（無上一個完整月）→ null', () => {
    const jan = new Date(2026, 0, 15)
    const trend: FinanceTrendRow[] = [{ month: 1, revenue: 100, refund: 0, expense: 0, net: 100 }]
    expect(computeReportPeriod(2026, trend, jan).lastCompleteMonth).toBeNull()
  })
  it('無資料 → null', () => {
    expect(computeReportPeriod(2026, [], TODAY).lastCompleteMonth).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/useReportPeriod.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write minimal implementation**

`src/views/reports/useReportPeriod.ts`：

```ts
import { lastMonthWithData, type FinanceTrendRow } from './financeTrend'

/**
 * 報表模組「資料截止月」單一事實來源（spec §2）。
 *
 * 根治兩個既有問題：
 * 1. 資料懸崖：圖表/表格以 cutoffMonth 截斷，未來月不畫 0。
 * 2. MoM 錨點 bug：lastMonthWithData 會把「只有預登錄固定支出」的未來月當有資料
 *    （錨點跑到 12 月 → 恆 0.0%）；此處以 cutoffMonth 夾住，MoM 再退一步錨定
 *    「最後完整月」（進行中的當月 vs 完整上月會誤導）。
 */
export interface ReportPeriod {
  isCurrentYear: boolean
  cutoffMonth: number
  lastActualMonth: number | null
  lastCompleteMonth: number | null
}

export function computeReportPeriod(
  year: number,
  trend?: FinanceTrendRow[],
  today: Date = new Date(),
): ReportPeriod {
  const realYear = today.getFullYear()
  const isCurrentYear = year === realYear
  const cutoffMonth = year < realYear ? 12 : year > realYear ? 0 : today.getMonth() + 1

  const rawLast = trend && trend.length ? lastMonthWithData(trend) : null
  const clamped = rawLast == null ? null : Math.min(rawLast, cutoffMonth)
  const lastActualMonth = clamped != null && clamped >= 1 ? clamped : null

  let lastCompleteMonth: number | null = null
  if (lastActualMonth != null) {
    const candidate = isCurrentYear
      ? Math.min(lastActualMonth, today.getMonth()) // getMonth() = 當月-1
      : lastActualMonth
    lastCompleteMonth = candidate >= 1 ? candidate : null
  }

  return { isCurrentYear, cutoffMonth, lastActualMonth, lastCompleteMonth }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/useReportPeriod.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/useReportPeriod.ts src/views/reports/__tests__/useReportPeriod.test.ts
git commit -m "feat(reports): computeReportPeriod 資料截止月單一事實來源

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/useReportPeriod.ts src/views/reports/__tests__/useReportPeriod.test.ts
```

---

### Task 3: ReportKpiCard 共用元件（含「— 持平」規則）

**Files:**
- Create: `src/views/reports/ReportKpiCard.vue`
- Test: `src/views/reports/__tests__/ReportKpiCard.test.ts`

**Interfaces:**
- Consumes: `deltaKind`（Task 1）。
- Produces（Task 5、8 依賴）:
  ```ts
  // props
  interface KpiTrendItem {
    label: string          // 'vs 上月' | 'vs 去年'
    delta: number | null   // pctChange 結果
    invert?: boolean       // true = 上升是壞事（支出/退款）：up 紅、down 綠
    emptyText?: string     // delta 為 null 時顯示的替代文案（如「無去年資料」）；未給則整項不顯示
    test?: string          // data-test
  }
  defineProps<{
    label: string
    value: string
    valueTest?: string
    valueClass?: string
    accent?: 'green' | 'orange' | 'red' | 'blue'
    trends?: KpiTrendItem[]
    sub?: string
    note?: string          // 口徑副行（如「全年含預登錄：NT$X」）
    noteTest?: string
  }>()
  ```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/ReportKpiCard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ReportKpiCard from '../ReportKpiCard.vue'

function mountCard(props: Record<string, unknown>) {
  return mount(ReportKpiCard, {
    props: { label: '本年總收入', value: 'NT$100', ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('ReportKpiCard trend 顯示規則', () => {
  it('|delta| < 0.1 → 顯示「— 持平」灰色、無箭頭', () => {
    const w = mountCard({ trends: [{ label: 'vs 上月', delta: 0.05, test: 'mom' }] })
    const el = w.find('[data-test="mom"]')
    expect(el.text()).toContain('— 持平')
    expect(el.text()).not.toContain('↑')
    expect(el.find('.trend-flat').exists()).toBe(true)
  })
  it('上升 → ↑ +x.x%；invert=false 時上升為綠', () => {
    const w = mountCard({ trends: [{ label: 'vs 上月', delta: 12.34, test: 'mom' }] })
    const el = w.find('[data-test="mom"]')
    expect(el.text()).toContain('↑ +12.3%')
    expect(el.find('.trend-good').exists()).toBe(true)
  })
  it('invert=true（支出）時上升為紅、下降為綠', () => {
    const up = mountCard({ trends: [{ label: 'vs 上月', delta: 5, invert: true, test: 'mom' }] })
    expect(up.find('[data-test="mom"] .trend-bad').exists()).toBe(true)
    const down = mountCard({ trends: [{ label: 'vs 上月', delta: -5, invert: true, test: 'mom' }] })
    expect(down.find('[data-test="mom"] .trend-good').exists()).toBe(true)
    expect(down.find('[data-test="mom"]').text()).toContain('↓ -5.0%')
  })
  it('delta=null 且有 emptyText → 顯示替代文案；無 emptyText → 整項不渲染', () => {
    const w1 = mountCard({ trends: [{ label: 'vs 去年', delta: null, emptyText: '無去年資料', test: 'yoy' }] })
    expect(w1.find('[data-test="yoy"]').text()).toContain('無去年資料')
    const w2 = mountCard({ trends: [{ label: 'vs 上月', delta: null, test: 'mom' }] })
    expect(w2.find('[data-test="mom"]').exists()).toBe(false)
  })
  it('note 副行有給才渲染', () => {
    const w = mountCard({ note: '全年含預登錄：NT$9,408,206', noteTest: 'note' })
    expect(w.find('[data-test="note"]').text()).toContain('全年含預登錄')
    expect(mountCard({}).find('[data-test="note"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/ReportKpiCard.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: Write minimal implementation**

`src/views/reports/ReportKpiCard.vue`：

```vue
<script setup lang="ts">
import { deltaKind } from './financeTrend'

export interface KpiTrendItem {
  label: string
  delta: number | null
  invert?: boolean
  emptyText?: string
  test?: string
}

const props = defineProps<{
  label: string
  value: string
  valueTest?: string
  valueClass?: string
  accent?: 'green' | 'orange' | 'red' | 'blue'
  trends?: KpiTrendItem[]
  sub?: string
  note?: string
  noteTest?: string
}>()

function fmtPct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

// good/bad 由 invert 翻轉：一般指標上升=好；支出/退款上升=壞
function trendClass(item: KpiTrendItem): string {
  const kind = deltaKind(item.delta)
  if (kind === 'flat') return 'trend-flat'
  if (kind === 'up') return item.invert ? 'trend-bad' : 'trend-good'
  if (kind === 'down') return item.invert ? 'trend-good' : 'trend-bad'
  return ''
}

function trendText(item: KpiTrendItem): string {
  const kind = deltaKind(item.delta)
  if (kind === 'flat') return '— 持平'
  if (kind == null || item.delta == null) return ''
  return `${kind === 'up' ? '↑' : '↓'} ${fmtPct(item.delta)}`
}

const visibleTrends = () =>
  (props.trends || []).filter(t => t.delta != null || t.emptyText)
</script>

<template>
  <el-card class="report-kpi" :class="accent ? `report-kpi--${accent}` : ''" shadow="never">
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-value" :class="valueClass" :data-test="valueTest">{{ value }}</div>
    <div v-for="item in visibleTrends()" :key="item.label" class="kpi-trend" :data-test="item.test">
      <template v-if="item.delta != null">
        <span :class="trendClass(item)">{{ trendText(item) }}</span>
        <span class="kpi-trend-label">{{ item.label }}</span>
      </template>
      <span v-else class="kpi-trend-label">{{ item.emptyText }}</span>
    </div>
    <div v-if="note" class="kpi-note" :data-test="noteTest">{{ note }}</div>
    <div v-if="sub" class="kpi-sub">{{ sub }}</div>
  </el-card>
</template>

<style scoped>
.report-kpi {
  text-align: center;
  padding: 12px 8px 10px;
  border-top: 3px solid transparent;
  height: 100%;
}
.report-kpi--green  { border-top-color: var(--color-success); }
.report-kpi--orange { border-top-color: var(--color-warning); }
.report-kpi--red    { border-top-color: var(--color-danger); }
.report-kpi--blue   { border-top-color: var(--color-info); }

.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 26px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.kpi-trend { font-size: 12px; font-weight: 600; margin-top: 4px; min-height: 16px; }
.trend-good { color: var(--color-success); }
.trend-bad  { color: var(--color-danger); }
.trend-flat { color: var(--text-secondary); font-weight: normal; }
.kpi-trend-label { font-weight: normal; color: var(--text-secondary); margin-left: 4px; }
.kpi-note { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.kpi-sub  { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* 語意色（正負淨現金） */
.kpi-value.value-green { color: var(--color-success); }
.kpi-value.value-red   { color: var(--color-danger); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/ReportKpiCard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/ReportKpiCard.vue src/views/reports/__tests__/ReportKpiCard.test.ts
git commit -m "feat(reports): ReportKpiCard 共用 KPI 卡（含持平規則）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/ReportKpiCard.vue src/views/reports/__tests__/ReportKpiCard.test.ts
```

---

### Task 4: CategoryBarList 元件（取代極端傾斜的圓餅圖）＋ SparkLine 迷你趨勢

**Files:**
- Create: `src/views/reports/CategoryBarList.vue`
- Create: `src/views/reports/SparkLine.vue`
- Test: `src/views/reports/__tests__/CategoryBarList.test.ts`

**Interfaces:**
- Produces（Task 7、8 依賴）:
  ```ts
  // CategoryBarList props
  defineProps<{
    items: Array<{ label: string; amount: number }>
    colors?: string[]   // 依排序後順序輪用；預設內建 palette
  }>()
  // SparkLine props
  defineProps<{ values: (number | null)[]; color?: string }>()
  ```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/CategoryBarList.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryBarList from '../CategoryBarList.vue'

const ITEMS = [
  { label: '才藝', amount: 500 },
  { label: '學費', amount: 9000 },
  { label: '雜項收款', amount: 500 },
]

describe('CategoryBarList', () => {
  it('按金額降冪排序，每列含名稱/金額/百分比', () => {
    const w = mount(CategoryBarList, { props: { items: ITEMS } })
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('學費')
    expect(rows[0].text()).toContain('90.0%')
    expect(rows[1].text()).toContain('5.0%')
  })
  it('金額 0 的類別列出但淡化（.cat-zero）', () => {
    const w = mount(CategoryBarList, { props: { items: [{ label: 'A', amount: 100 }, { label: 'B', amount: 0 }] } })
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows[1].classes()).toContain('cat-zero')
  })
  it('總額為 0 時所有列不算百分比（顯示 —）', () => {
    const w = mount(CategoryBarList, { props: { items: [{ label: 'A', amount: 0 }] } })
    expect(w.find('[data-test="cat-row"]').text()).toContain('—')
  })
  it('bar 寬度依占比設定', () => {
    const w = mount(CategoryBarList, { props: { items: ITEMS } })
    const fill = w.findAll('[data-test="cat-row"]')[0].find('.cat-bar-fill')
    expect(fill.attributes('style')).toContain('width: 90%')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/CategoryBarList.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/views/reports/CategoryBarList.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { money } from '@/utils/format'

const props = defineProps<{
  items: Array<{ label: string; amount: number }>
  colors?: string[]
}>()

const DEFAULT_COLORS = ['#67c23a', '#409eff', '#9b59b6', '#e6a23c', '#f56c6c', '#909399']

const sorted = computed(() =>
  [...props.items].sort((a, b) => (b.amount || 0) - (a.amount || 0)),
)
const total = computed(() => sorted.value.reduce((s, i) => s + (i.amount || 0), 0))

function pct(amount: number): number | null {
  if (!total.value) return null
  return (amount / total.value) * 100
}
function color(idx: number): string {
  const palette = props.colors && props.colors.length ? props.colors : DEFAULT_COLORS
  return palette[idx % palette.length]
}
</script>

<template>
  <div class="cat-list">
    <div
      v-for="(item, idx) in sorted"
      :key="item.label"
      class="cat-row"
      :class="{ 'cat-zero': !item.amount }"
      data-test="cat-row"
    >
      <span class="cat-swatch" :style="{ background: color(idx) }" />
      <span class="cat-label">{{ item.label }}</span>
      <span class="cat-amount">{{ money(item.amount) }}</span>
      <span class="cat-pct">{{ pct(item.amount) == null ? '—' : `${pct(item.amount)!.toFixed(1)}%` }}</span>
      <span class="cat-bar-track">
        <span class="cat-bar-fill" :style="{ width: `${pct(item.amount) ?? 0}%`, background: color(idx) }" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.cat-list { display: flex; flex-direction: column; gap: 10px; padding: 8px 4px; }
.cat-row {
  display: grid;
  grid-template-columns: 12px minmax(72px, auto) 1fr 52px;
  grid-template-areas: 'swatch label amount pct' '. bar bar bar';
  align-items: center;
  column-gap: 8px;
  row-gap: 4px;
  font-size: 13px;
}
.cat-swatch { grid-area: swatch; width: 10px; height: 10px; border-radius: 2px; }
.cat-label { grid-area: label; color: var(--text-primary); }
.cat-amount { grid-area: amount; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.cat-pct { grid-area: pct; text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.cat-bar-track {
  grid-area: bar;
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  overflow: hidden;
}
.cat-bar-fill { display: block; height: 100%; border-radius: 3px; }
.cat-zero { opacity: 0.45; }
</style>
```

`src/views/reports/SparkLine.vue`（純 SVG，無 chart.js 依賴）：

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  values: (number | null)[]
  color?: string
}>()

const W = 120
const H = 36
const PAD = 3

// 只連有值的點；x 依 12 格均分，null 中斷
const points = computed(() => {
  const vals = props.values
  const nums = vals.filter((v): v is number => v != null)
  if (!nums.length) return ''
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = (W - PAD * 2) / Math.max(vals.length - 1, 1)
  return vals
    .map((v, i) => {
      if (v == null) return null
      const x = PAD + i * step
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="sparkline" preserveAspectRatio="none" aria-hidden="true">
    <polyline :points="points" fill="none" :stroke="color || 'var(--color-info)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.sparkline { width: 120px; height: 36px; display: block; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/CategoryBarList.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/CategoryBarList.vue src/views/reports/SparkLine.vue src/views/reports/__tests__/CategoryBarList.test.ts
git commit -m "feat(reports): CategoryBarList 分類條列圖與 SparkLine 迷你趨勢元件

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/CategoryBarList.vue src/views/reports/SparkLine.vue src/views/reports/__tests__/CategoryBarList.test.ts
```

---

### Task 5: ReportsView — tab 重組＋URL query 同步＋「資料截至」badge＋navigate 轉發

**Files:**
- Modify: `src/views/ReportsView.vue`（全檔重寫 script＋template 調整）
- Modify: `src/views/__tests__/ReportsView.test.ts`（加 vue-router mock＋新測試）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2）、`getFinanceSummary`（既有 `@/api/reports`）。
- Produces（Task 7、8 依賴）:
  - `OverviewPanel` 的 `@navigate` 事件 payload：`{ tab: string; month?: number }`（Task 7 發出、此處接收）。
  - `FinanceSummaryPanel` 新 prop `initialMonth?: number | null`（Task 8 實作接收；本 task 先傳入，panel 未接前是無害多餘 attr）。
  - URL 契約：`#/reports?tab=<name>&year=<yyyy>`；無效值 fallback `overview`/當年。

- [ ] **Step 1: Write the failing test**

在 `src/views/__tests__/ReportsView.test.ts` 檔頭 mock 區加 vue-router mock（既有 mount 不會壞——replace 是 spy）：

```ts
// URL 同步：useRoute/useRouter mock（hash router 不進 jsdom）
const routeQuery = ref<Record<string, string>>({})
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock }),
}))
```

（`ref` 需從 vue import：`import { ref } from 'vue'`；`beforeEach` 中加 `routeQuery.value = {}` 與 `replaceMock.mockReset()`。）

新增 describe 區塊：

```ts
describe('URL query 同步（spec §3）', () => {
  it('query 有效值還原 tab 與 year', () => {
    routeQuery.value = { tab: 'finance', year: '2025' }
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.activeTab).toBe('finance')
    expect(vm.selectedYear).toBe(2025)
  })
  it('query 無效值 fallback 預設（overview / 當年）', () => {
    routeQuery.value = { tab: 'bogus', year: 'abc' }
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.activeTab).toBe('overview')
    expect(vm.selectedYear).toBe(new Date().getFullYear())
  })
  it('tab 切換以 router.replace 寫回 query（不塞 history）', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    vm.activeTab = 'salary'
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ tab: 'salary' }) }),
    )
  })
})

describe('tab 重組（spec §3）', () => {
  it('tab 順序：overview → finance → monthly-pnl → attendance → salary → fixed-cost（登錄殿後）', () => {
    const w = mountView()
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map(p => p.props('name'))).toEqual(
      ['overview', 'finance', 'monthly-pnl', 'attendance', 'salary', 'fixed-cost'],
    )
    expect(panes[0].props('label')).toBe('經營總覽')
    expect(panes[2].props('label')).toBe('現金收支表')
  })
})
```

另加「資料截至 badge」測試（mock `@/api/reports` 的 `getFinanceSummary`，本測試檔目前未 mock 它；panel 全 stub 所以只有 ReportsView 自己會呼叫）：

```ts
vi.mock('@/api/reports', () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({
    data: {
      monthly_trend: [
        { month: 1, revenue: 100, refund: 0, expense: 50, net: 50 },
        { month: 2, revenue: 100, refund: 0, expense: 50, net: 50 },
      ],
    },
  }),
}))
```

```ts
describe('資料截至 badge', () => {
  it('檢視過去年顯示「全年」；有資料的今年顯示「資料截至 N 月」', async () => {
    routeQuery.value = { year: '2020' } // 相對測試當下必為過去年
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="data-cutoff-badge"]').text()).toContain('全年')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/__tests__/ReportsView.test.ts`
Expected: 新增測試 FAIL（tab label 仍是「概況」、無 query 還原、無 badge）；既有測試仍 PASS。

- [ ] **Step 3: Write implementation**

`src/views/ReportsView.vue` script 重寫（保留 `confirmLoseFixedCost` 邏輯）：

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import { getUserInfo } from '@/utils/auth'
import { getFinanceSummary } from '@/api/reports'
import { computeReportPeriod } from './reports/useReportPeriod'
import type { FinanceTrendRow } from './reports/financeTrend'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import MonthlyPnLPanel from './reports/MonthlyPnLPanel.vue'
import MonthlyFixedCostPanel from './reports/MonthlyFixedCostPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'

const route = useRoute()
const router = useRouter()

const viewerName = computed(() => {
  const info = getUserInfo()
  return info?.display_name || info?.username || '管理員'
})

const VALID_TABS = ['overview', 'finance', 'monthly-pnl', 'attendance', 'salary', 'fixed-cost'] as const
const currentYear = new Date().getFullYear()

// ── URL query 還原（無效值 fallback，不報錯） ──────────────────────────
function parseTab(raw: unknown): string {
  return typeof raw === 'string' && (VALID_TABS as readonly string[]).includes(raw) ? raw : 'overview'
}
function parseYear(raw: unknown): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2999 ? n : currentYear
}
const selectedYear = ref(parseYear(route.query.year))
const activeTab = ref(parseTab(route.query.tab))
const fixedCostDirty = ref(false)

// tab/年度 → query（replace 不塞 history）
watch([activeTab, selectedYear], ([tab, year]) => {
  router.replace({ query: { ...route.query, tab, year: String(year) } })
}, { immediate: true })

// ── 「資料截至 X 月」badge：與 panel 共用同一端點（輕量 GET，5 分鐘內多為 server cache）
const badgeTrend = ref<FinanceTrendRow[]>([])
watch(selectedYear, async (y) => {
  badgeTrend.value = []
  try {
    const res = await getFinanceSummary(y)
    badgeTrend.value = res.data?.monthly_trend || []
  } catch {
    badgeTrend.value = [] // badge 屬輔助資訊，載入失敗時顯示「—」不擋頁面
  }
}, { immediate: true })

const period = computed(() => computeReportPeriod(selectedYear.value, badgeTrend.value))
const cutoffBadgeText = computed(() => {
  const p = period.value
  if (!p.isCurrentYear && p.cutoffMonth === 12) return '全年'
  if (p.cutoffMonth === 0) return '尚無資料'
  if (p.lastActualMonth == null) return '尚無資料'
  return `資料截至 ${p.lastActualMonth} 月`
})

// ── OverviewPanel 下鑽轉發 ────────────────────────────────────────────
const financeInitialMonth = ref<number | null>(null)
function onNavigate(payload: { tab: string; month?: number }) {
  if ((VALID_TABS as readonly string[]).includes(payload.tab)) {
    financeInitialMonth.value = payload.tab === 'finance' ? (payload.month ?? null) : null
    activeTab.value = payload.tab
  }
}
watch(activeTab, (t) => { if (t !== 'finance') financeInitialMonth.value = null })

// ── 固定支出 dirty 離開保護（既有邏輯不動） ──────────────────────────
async function confirmLoseFixedCost(): Promise<boolean> {
  if (!(activeTab.value === 'fixed-cost' && fixedCostDirty.value)) return true
  try {
    await ElMessageBox.confirm('固定費用尚有未儲存變更，確定離開並捨棄？', '未儲存變更', {
      type: 'warning',
      confirmButtonText: '捨棄變更',
      cancelButtonText: '留在此頁',
    })
    return true
  } catch {
    return false
  }
}

async function onYearChange(y: number): Promise<void> {
  if (await confirmLoseFixedCost()) {
    selectedYear.value = y
  }
}

async function onTabBeforeLeave(_activeName: string | number, oldName: string | number): Promise<boolean> {
  if (oldName === 'fixed-cost' && fixedCostDirty.value) {
    return confirmLoseFixedCost()
  }
  return true
}

defineExpose({
  selectedYear,
  activeTab,
  fixedCostDirty,
  onYearChange,
  onTabBeforeLeave,
})
</script>
```

template（tab 重排＋badge＋navigate/initialMonth 接線；`fixed-cost` pane 移到最後、label 加 icon）：

```vue
<template>
  <div class="reports-page">
    <div class="page-header">
      <div class="page-title">
        <h2>報表統計</h2>
        <span class="viewer-tag">{{ viewerName }} 的報表統計</span>
      </div>
      <div class="page-controls">
        <el-tag type="info" effect="plain" size="small" data-test="data-cutoff-badge">{{ cutoffBadgeText }}</el-tag>
        <el-select :model-value="selectedYear" style="width: 120px;" @change="onYearChange">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
      </div>
    </div>

    <el-tabs v-model="activeTab" type="card" class="reports-tabs" :before-leave="onTabBeforeLeave">
      <el-tab-pane label="經營總覽" name="overview">
        <OverviewPanel v-if="activeTab === 'overview'" :key="selectedYear" :year="selectedYear" @navigate="onNavigate" />
      </el-tab-pane>
      <el-tab-pane label="收支彙總" name="finance">
        <FinanceSummaryPanel v-if="activeTab === 'finance'" :key="selectedYear" :year="selectedYear" :initial-month="financeInitialMonth" />
      </el-tab-pane>
      <el-tab-pane label="現金收支表" name="monthly-pnl">
        <MonthlyPnLPanel v-if="activeTab === 'monthly-pnl'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="出勤" name="attendance">
        <AttendancePanel v-if="activeTab === 'attendance'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane name="fixed-cost">
        <template #label>
          <span class="tab-entry-label"><el-icon :size="13"><EditPen /></el-icon> 固定支出登錄</span>
        </template>
        <MonthlyFixedCostPanel
          v-if="activeTab === 'fixed-cost'"
          :key="selectedYear"
          :year="selectedYear"
          @update:dirty="fixedCostDirty = $event"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
```

style 加：

```css
.page-controls { display: flex; align-items: center; gap: 10px; }
.tab-entry-label { display: inline-flex; align-items: center; gap: 4px; }
```

**注意**：tab pane 測試以 `props('label')` 斷言——`fixed-cost` pane 改用 `#label` slot 後 `props('label')` 為 undefined，測試斷言前 5 個 label＋名稱順序即可（Step 1 的測試已如此設計，只斷言 `panes[0]`、`panes[2]` 的 label）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/__tests__/ReportsView.test.ts`
Expected: PASS（既有 dirty-guard 測試與新測試全綠）

- [ ] **Step 5: Commit**

```bash
git add src/views/ReportsView.vue src/views/__tests__/ReportsView.test.ts
git commit -m "feat(reports): tab 重組＋URL query 同步＋資料截至 badge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/ReportsView.vue src/views/__tests__/ReportsView.test.ts
```

---

### Task 6: 趨勢圖共用 builder（截斷＋進行中月標示）

**Files:**
- Create: `src/views/reports/trendChart.ts`
- Test: `src/views/reports/__tests__/trendChart.test.ts`

**Interfaces:**
- Consumes: `cutSeries`、`FinanceTrendRow`（Task 1）、`ReportPeriod`（Task 2）。
- Produces（Task 7、8 依賴）:
  ```ts
  export function buildTrendChartData(
    trend: FinanceTrendRow[],
    period: ReportPeriod,
    opts?: { includeRefund?: boolean },
  ): ChartData<'line', (number | null)[]>
  // dataset 順序固定：收入(綠)、[退款(橘，opts 開啟時)]、支出(紅)、淨現金(藍粗線)
  export function inProgressIndex(period: ReportPeriod): number | null
  // 今年且當月有實際資料（lastActualMonth === cutoffMonth）→ cutoffMonth-1（0-based dataIndex），否則 null
  ```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/trendChart.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildTrendChartData, inProgressIndex } from '../trendChart'
import { computeReportPeriod } from '../useReportPeriod'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 6, 10)
function trend(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    rows.push(m <= 7
      ? { month: m, revenue: 100 * m, refund: m, expense: 50 * m, net: 49 * m }
      : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
  }
  return rows
}

describe('buildTrendChartData', () => {
  it('預設三條線（收入/支出/淨現金），8–12 月為 null（資料懸崖修復）', () => {
    const p = computeReportPeriod(2026, trend(), TODAY)
    const data = buildTrendChartData(trend(), p)
    expect(data.datasets.map(d => d.label)).toEqual(['收入', '支出', '淨現金'])
    const revenue = data.datasets[0].data
    expect(revenue[6]).toBe(700)
    expect(revenue[7]).toBeNull()
    expect(revenue[11]).toBeNull()
  })
  it('includeRefund 開啟時四條線', () => {
    const p = computeReportPeriod(2026, trend(), TODAY)
    const data = buildTrendChartData(trend(), p, { includeRefund: true })
    expect(data.datasets.map(d => d.label)).toEqual(['收入', '退款', '支出', '淨現金'])
  })
})

describe('inProgressIndex', () => {
  it('今年且當月有實際資料 → cutoffMonth-1', () => {
    expect(inProgressIndex(computeReportPeriod(2026, trend(), TODAY))).toBe(6)
  })
  it('過去年 → null；當月無資料 → null', () => {
    expect(inProgressIndex(computeReportPeriod(2025, trend(), TODAY))).toBeNull()
    const juneOnly: FinanceTrendRow[] = [{ month: 6, revenue: 1, refund: 0, expense: 0, net: 1 }]
    expect(inProgressIndex(computeReportPeriod(2026, juneOnly, TODAY))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/trendChart.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write minimal implementation**

`src/views/reports/trendChart.ts`：

```ts
import type { ChartData, ScriptableLineSegmentContext } from 'chart.js'
import { cutSeries, type FinanceTrendRow } from './financeTrend'
import type { ReportPeriod } from './useReportPeriod'

export const TREND_MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

/** 今年且當月有實際資料時回傳該月的 0-based dataIndex（供空心點/虛線段標示），否則 null。 */
export function inProgressIndex(period: ReportPeriod): number | null {
  if (!period.isCurrentYear) return null
  if (period.lastActualMonth == null || period.lastActualMonth !== period.cutoffMonth) return null
  return period.cutoffMonth - 1
}

interface LineDatasetSpec {
  label: string
  key: 'revenue' | 'refund' | 'expense' | 'net'
  color: string
  bg: string
  width?: number
  dash?: number[]
}

/**
 * 年度收支趨勢共用 builder（總覽＝三線；收支彙總＝四線含退款）。
 * - 依 period.cutoffMonth 截斷（cutSeries）
 * - 進行中的當月：最後一段虛線＋空心大點，tooltip 由 caller 註記「本月進行中」
 */
export function buildTrendChartData(
  trend: FinanceTrendRow[],
  period: ReportPeriod,
  opts: { includeRefund?: boolean } = {},
): ChartData<'line', (number | null)[]> {
  const specs: LineDatasetSpec[] = [
    { label: '收入', key: 'revenue', color: '#67c23a', bg: 'rgba(103,194,58,0.1)' },
    ...(opts.includeRefund
      ? [{ label: '退款', key: 'refund', color: '#e6a23c', bg: 'rgba(230,162,60,0.1)', dash: [4, 4] } as LineDatasetSpec]
      : []),
    { label: '支出', key: 'expense', color: '#f56c6c', bg: 'rgba(245,108,108,0.1)' },
    { label: '淨現金', key: 'net', color: '#409eff', bg: 'rgba(64,158,255,0.1)', width: 3 },
  ]
  const progIdx = inProgressIndex(period)
  return {
    labels: TREND_MONTH_LABELS,
    datasets: specs.map(s => ({
      label: s.label,
      data: cutSeries(trend, s.key, period.cutoffMonth),
      borderColor: s.color,
      backgroundColor: s.bg,
      borderWidth: s.width ?? 2,
      borderDash: s.dash,
      fill: s.key === 'revenue',
      tension: 0.3,
      // 進行中的當月：空心大點
      pointRadius: (ctx: { dataIndex: number }) => (progIdx != null && ctx.dataIndex === progIdx ? 5 : 3),
      pointBackgroundColor: (ctx: { dataIndex: number }) =>
        progIdx != null && ctx.dataIndex === progIdx ? 'transparent' : s.color,
      pointBorderColor: s.color,
      // 進行中的當月：最後一段虛線
      segment: {
        borderDash: (ctx: ScriptableLineSegmentContext) =>
          progIdx != null && ctx.p1DataIndex === progIdx ? [5, 5] : s.dash,
      },
    })),
  } as unknown as ChartData<'line', (number | null)[]>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/trendChart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/trendChart.ts src/views/reports/__tests__/trendChart.test.ts
git commit -m "feat(reports): 趨勢圖共用 builder（cutoff 截斷＋進行中月標示）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/trendChart.ts src/views/reports/__tests__/trendChart.test.ts
```

---

### Task 7: OverviewPanel 重排 — 儀表板化

**Files:**
- Modify: `src/views/reports/OverviewPanel.vue`（大改）
- Test: `src/views/reports/__tests__/OverviewPanel.test.ts`（新檔）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2）、`sumTrendUpTo`/`futurePreloggedExpense`/`pctChange`（Task 1）、`ReportKpiCard`（Task 3）、`SparkLine`（Task 4）、`buildTrendChartData`/`inProgressIndex`（Task 6）、`LineChart`（既有 chartSetup）。
- Produces: `emit('navigate', { tab, month? })`（Task 5 已接線）。

**變更要點（spec §4）**：
1. KPI 帶改雙口徑：主數字 = `sumTrendUpTo(trend, period.cutoffMonth)`；副行 note = 後端 `summary` 全年值（僅當 `futurePreloggedExpense(trend, cutoffMonth).total > 0` 時對「總支出」「淨現金」顯示「全年含預登錄：NT$X」）。卡片順序：**淨現金→總收入→總支出→退款**，全部改用 `ReportKpiCard`。
2. MoM 錨點改 `period.lastCompleteMonth`（取代 `lastMonthWithData` 直接錨定）；YoY 邏輯保留（分母 null 顯示「無去年資料」）。
3. 新增年度收支趨勢主圖（`buildTrendChartData(trend, period)` 三線版），佔左 2/3；右 1/3 為既有「異常與待辦」卡。圖 onClick 資料點 → `emit('navigate', { tab: 'finance', month: dataIndex + 1 })`；tooltip 對 `inProgressIndex` 加「（本月進行中）」註記。
4. 次要列改為三卡：出勤摘要卡（加權出勤率大字＋`SparkLine :values="attendanceRateSeries"`，整卡可點 `emit('navigate', { tab: 'attendance' })`）、薪資摘要卡（園方人事成本＝`salary_gross`＋`employer_benefit` 兩數字與合計，整卡可點 → salary）、「淨營收・收支比」合併卡。
5. 既有「異常與待辦」「資料說明」邏輯與測試 attr 全保留；資料說明新增一條 `<dt>KPI 口徑</dt>`。

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/OverviewPanel.test.ts`（mock 契約抄真實後端形狀；`getDashboard`/`getFinanceSummary` 回 `{ data: ... }`）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

vi.mock('@/utils/auth', () => ({
  hasPermission: () => false, // 略過固定支出/簽收待辦分支，聚焦 KPI/圖表
  getUserInfo: () => ({ username: 'admin' }),
}))

// 1–6 月實際收支各 100/50；7–12 月僅預登錄固定支出 500000
const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
  const m = i + 1
  return m <= 6
    ? { month: m, revenue: 100, refund: 10, expense: 50, net: 40 }
    : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 }
})

vi.mock('@/api/reports', () => ({
  getDashboard: vi.fn().mockResolvedValue({
    data: {
      attendance_monthly: [
        { month: 5, rate: 90, total_records: 100 },
        { month: 6, rate: 95, total_records: 100 },
      ],
      salary_monthly: [],
    },
  }),
  getFinanceSummary: vi.fn().mockImplementation((year: number) =>
    Promise.resolve({
      data: {
        summary: {
          total_revenue: 600, total_refund: 60, net_revenue: 540,
          total_expense: 50 * 6 + 500000 * 6, // 全年口徑（含預登錄）
          net_cashflow: 540 - (50 * 6 + 500000 * 6),
        },
        monthly_trend: year === 2026 ? monthlyTrend : [],
      },
    }),
  ),
}))
vi.mock('@/api/monthlyFixedCost', () => ({ getMonthlyFixedCosts: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/vendorPayment', () => ({ getVendorPaymentSummary: vi.fn().mockResolvedValue({ data: {} }) }))
vi.mock('@/api/miscReceipt', () => ({ getMiscReceiptSummary: vi.fn().mockResolvedValue({ data: {} }) }))

import OverviewPanel from '@/views/reports/OverviewPanel.vue'

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10)) // 2026-07-10 → cutoff=7
})

function mountPanel() {
  return mount(OverviewPanel, {
    props: { year: 2026 },
    global: {
      plugins: [ElementPlus],
      stubs: { LineChart: true, RouterLink: true },
    },
  })
}

describe('OverviewPanel KPI 雙口徑（spec §4）', () => {
  it('主數字 = 截至 cutoff 實際發生（7 月預登錄 500000 計入、8–12 月不計入）', async () => {
    const w = mountPanel()
    await flushPromises()
    // 截至 7 月：支出 = 50*6 + 500000（7 月預登錄在 cutoff 內屬「本月已登錄」計入）
    expect(w.find('[data-test="kpi-total-expense"]').text()).toContain('500,300')
    expect(w.find('[data-test="kpi-total-revenue"]').text()).toContain('600')
  })
  it('兩口徑不同時顯示「全年含預登錄」副行', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="kpi-expense-note"]').text()).toContain('全年含預登錄')
  })
})

describe('OverviewPanel MoM 錨點（回歸：不再 0.0%）', () => {
  it('錨定最後完整月（6 月 vs 5 月），兩月相同 → 顯示持平而非 ↑0.0%', async () => {
    const w = mountPanel()
    await flushPromises()
    const mom = w.find('[data-test="mom-revenue"]')
    expect(mom.exists()).toBe(true)
    expect(mom.text()).toContain('— 持平')
    expect(mom.text()).not.toContain('↑')
  })
})

describe('OverviewPanel 下鑽導覽', () => {
  it('出勤摘要卡點擊 emit navigate attendance', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="attendance-summary-card"]').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual([{ tab: 'attendance' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/OverviewPanel.test.ts`
Expected: FAIL（`kpi-expense-note`、`attendance-summary-card` 不存在；MoM 仍是舊錨點）

- [ ] **Step 3: Write implementation**

`OverviewPanel.vue` script 關鍵變更（既有 import 之外新增）：

```ts
import { LineChart } from './chartSetup'
import ReportKpiCard from './ReportKpiCard.vue'
import SparkLine from './SparkLine.vue'
import { computeReportPeriod } from './useReportPeriod'
import { buildTrendChartData, inProgressIndex } from './trendChart'
import {
  pctChange, sumTrendUpTo, futurePreloggedExpense, type FinanceTrendRow,
} from './financeTrend'
import type { ChartOptions } from 'chart.js'

const emit = defineEmits<{ navigate: [{ tab: string; month?: number }] }>()

const trend = computed<FinanceTrendRow[]>(() => finance.data.value?.monthly_trend || [])
const period = computed(() => computeReportPeriod(props.year, trend.value))

// KPI 主數字：截至實際發生口徑（spec §0 裁定）
const actuals = computed(() => sumTrendUpTo(trend.value, period.value.cutoffMonth))
const prelogged = computed(() => futurePreloggedExpense(trend.value, period.value.cutoffMonth))
const expenseNote = computed(() =>
  prelogged.value.total > 0 ? `全年含預登錄：${money(summary.value.total_expense)}` : undefined)
const netNote = computed(() =>
  prelogged.value.total > 0 ? `全年口徑：${money(summary.value.net_cashflow)}` : undefined)

// MoM：錨定「最後完整月」（進行中的當月不當錨點；預登錄月被 cutoff 夾住不會拉高錨點）
const mom = computed(() => {
  const anchor = period.value.lastCompleteMonth
  if (anchor == null) return null
  const curr = trend.value.find(r => r.month === anchor)
  const prev = trend.value.find(r => r.month === anchor - 1)
  if (!curr || !prev) return null
  return {
    revenue: pctChange(curr.revenue, prev.revenue),
    expense: pctChange(curr.expense, prev.expense),
    net: pctChange(curr.net, prev.net),
  }
})

// 主趨勢圖（三線）＋點擊下鑽＋進行中月 tooltip 註記
const trendChartData = computed(() => buildTrendChartData(trend.value, period.value))
const trendChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      callbacks: {
        title: (items: Array<{ label: string; dataIndex: number }>) => {
          const idx = inProgressIndex(period.value)
          const base = items[0]?.label ?? ''
          return idx != null && items[0]?.dataIndex === idx ? `${base}（本月進行中）` : base
        },
        label: (ctx: { dataset: { label: string }; parsed: { y: number } }) =>
          `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
      },
    },
  },
  scales: { y: { ticks: { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'k' } } },
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (!elements.length) return
    emit('navigate', { tab: 'finance', month: elements[0].index + 1 })
  },
}) as unknown as ChartOptions<'line'>)

// 出勤 sparkline：rate 依 cutoff 截斷
const attendanceRateSeries = computed<(number | null)[]>(() => {
  const arr: Array<{ month: number; rate?: number }> = dashboard.data.value?.attendance_monthly || []
  const byMonth: Record<number, number | undefined> = {}
  arr.forEach(d => { byMonth[d.month] = d.rate })
  const out: (number | null)[] = []
  for (let m = 1; m <= 12; m++) out.push(m > period.value.cutoffMonth ? null : (byMonth[m] ?? null))
  return out
})

// 薪資摘要（沿用 SalaryPanel 同款來源：expense_by_category）
const expenseCategories = computed<Array<{ category?: string; amount?: number }>>(
  () => finance.data.value?.expense_by_category || [])
const salaryGross = computed(() =>
  expenseCategories.value.find(c => c.category === 'salary_gross')?.amount || 0)
const employerBenefit = computed(() =>
  expenseCategories.value.find(c => c.category === 'employer_benefit')?.amount || 0)
```

template 重排（KPI 帶 → 主圖＋待辦兩欄 → 三張摘要卡 → 資料說明；「異常與待辦」卡整段 markup 原樣搬進右欄）：

```vue
<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else class="overview">
    <div v-if="financeUnavailable" class="section-error" data-test="finance-error">
      <el-empty :description="financeErrorText" />
    </div>
    <template v-else>
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="12" :sm="6">
          <ReportKpiCard
            label="本年淨現金" accent="blue"
            :value="money(actuals.net)" :value-class="netClass" value-test="kpi-net-cashflow"
            :trends="[
              { label: 'vs 上月', delta: mom?.net ?? null, test: 'mom-net' },
              { label: 'vs 去年', delta: yoy?.net ?? null, emptyText: yoy ? '無去年資料' : undefined, test: 'yoy-net' },
            ]"
            :note="netNote" note-test="kpi-net-note" sub="（收入-退款-支出）"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <ReportKpiCard
            label="本年總收入" accent="green"
            :value="money(actuals.revenue)" value-test="kpi-total-revenue"
            :trends="[
              { label: 'vs 上月', delta: mom?.revenue ?? null, test: 'mom-revenue' },
              { label: 'vs 去年', delta: yoy?.revenue ?? null, emptyText: yoy ? '無去年資料' : undefined, test: 'yoy-revenue' },
            ]"
            sub="（未扣退款）"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <ReportKpiCard
            label="本年總支出" accent="red"
            :value="money(actuals.expense)" value-test="kpi-total-expense"
            :trends="[
              { label: 'vs 上月', delta: mom?.expense ?? null, invert: true, test: 'mom-expense' },
              { label: 'vs 去年', delta: yoy?.expense ?? null, invert: true, emptyText: yoy ? '無去年資料' : undefined, test: 'yoy-expense' },
            ]"
            :note="expenseNote" note-test="kpi-expense-note"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <ReportKpiCard
            label="本年退款" accent="orange"
            :value="money(actuals.refund)" value-test="kpi-total-refund"
            sub="學費+才藝"
          />
        </el-col>
      </el-row>
      <div class="kpi-band-note" data-test="kpi-band-note">
        截至 {{ period.lastActualMonth ?? '—' }} 月實際發生；含固定支出、廠商付款；不含年終獎金（另行轉帳）
      </div>

      <el-row :gutter="16">
        <el-col :xs="24" :lg="16">
          <el-card class="chart-card" shadow="never">
            <template #header><span class="chart-title">年度收支趨勢（點擊資料點看該月明細）</span></template>
            <div class="chart-container"><LineChart :data="trendChartData" :options="trendChartOptions" /></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="8">
          <!-- 異常與待辦：既有卡整段原樣搬入（todo-card markup 與邏輯不動） -->
        </el-col>
      </el-row>
    </template>

    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card
          v-if="!dashboardUnavailable"
          class="summary-card" shadow="never"
          data-test="attendance-summary-card"
          @click="emit('navigate', { tab: 'attendance' })"
        >
          <div class="kpi-label">年度出勤率（加權平均）</div>
          <div class="summary-value" data-test="attendance-rate">{{ weightedAttendanceRate != null ? `${weightedAttendanceRate}%` : '-' }}</div>
          <SparkLine :values="attendanceRateSeries" />
          <span class="summary-link">查看出勤 →</span>
        </el-card>
        <div v-else class="section-error" data-test="attendance-rate-error">
          <el-empty :description="dashboardErrorText" :image-size="50" />
        </div>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card
          v-if="!financeUnavailable"
          class="summary-card" shadow="never"
          data-test="salary-summary-card"
          @click="emit('navigate', { tab: 'salary' })"
        >
          <div class="kpi-label">園方人事成本（本年）</div>
          <div class="summary-value">{{ money(salaryGross + employerBenefit) }}</div>
          <div class="summary-sub">應發 {{ money(salaryGross) }}＋雇主負擔 {{ money(employerBenefit) }}</div>
          <span class="summary-link">查看薪資 →</span>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card v-if="!financeUnavailable" class="summary-card summary-card--static" shadow="never">
          <div class="kpi-label">淨營收・收支比</div>
          <div class="summary-value">{{ money(summary.net_revenue) }}</div>
          <div class="summary-sub">
            收支比 {{ summary.total_expense ? (summary.net_revenue / summary.total_expense).toFixed(2) : '-' }}（淨營收 / 總支出）
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 資料說明 collapse：既有 markup 保留，dl 內新增一條 -->
    <!-- <dt>KPI 口徑</dt><dd>KPI 主數字為「截至實際發生月」加總；含未來月預登錄固定支出的全年口徑見各卡副行與 Excel 匯出。</dd> -->
  </div>
</template>
```

style 追加：

```css
.summary-card { text-align: center; padding: 12px 8px; cursor: pointer; height: 100%; transition: border-color 0.2s; }
.summary-card:hover { border-color: var(--el-color-primary); }
.summary-card--static { cursor: default; }
.summary-card--static:hover { border-color: var(--el-border-color-lighter); }
.summary-value { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 4px 0; }
.summary-sub { font-size: 12px; color: var(--text-secondary); }
.summary-link { display: inline-block; margin-top: 6px; font-size: 12px; color: var(--el-color-primary); }
.chart-container { height: 320px; position: relative; }
.chart-card { height: 100%; }
```

刪除：舊 KPI 卡 markup（整段 el-card kpi-card 4 張）、`formatPct`、`netClass` 若 ReportKpiCard 已承接則保留 `netClass` 傳入 valueClass、舊「d. 三卡」列。**保留**：`salaryPendingAlert`/`missingFixedCostMonths`/`vendorSignoff`/`miscSignoff`/`signoffLinkState`/`todoItems`/`formatFetchedAt`/`weightedAttendanceRate` 與其 markup、`data-test` attr 名稱全部不變。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/OverviewPanel.test.ts src/views/__tests__/ReportsView.test.ts`
Expected: PASS（含 ReportsView 既有測試不回歸）

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/OverviewPanel.vue src/views/reports/__tests__/OverviewPanel.test.ts
git commit -m "feat(reports): 經營總覽儀表板化——KPI 雙口徑/主趨勢圖/下鑽摘要卡

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/OverviewPanel.vue src/views/reports/__tests__/OverviewPanel.test.ts
```

---

### Task 8: FinanceSummaryPanel — KPI 持平／分類條列圖／截斷／明細截列

**Files:**
- Modify: `src/views/reports/FinanceSummaryPanel.vue`
- Test: `src/views/reports/__tests__/FinanceSummaryPanel.test.ts`（新檔）

**Interfaces:**
- Consumes: `computeReportPeriod`、`buildTrendChartData`/`inProgressIndex`、`ReportKpiCard`、`CategoryBarList`、`futurePreloggedExpense`。
- Produces: 新 prop `initialMonth?: number | null`（Task 5 傳入）。

**變更要點（spec §5）**：
1. 新 prop `initialMonth`：`const selectedMonth = ref<number | null>(props.initialMonth ?? null)`。**注意 el-select clearable 陷阱**：`@change` 時 `selectedMonth.value = val ?? null` 正規化 undefined（見 memory feedback_elselect_clear_undefined_json_drops_field；此處是本地 state 非 API body，但比照防禦）。
2. KPI 4 卡改用 `ReportKpiCard`（整年模式：主數字 `sumTrendUpTo(trend, period.cutoffMonth)`＋雙口徑 note；單月模式：維持該月數字、無 MoM）。MoM 錨點改 `period.lastCompleteMonth`。
3. 趨勢圖改 `buildTrendChartData(trend, period, { includeRefund: true })`（單月模式維持現行單點呈現，不套 builder）。
4. 兩張 `PieChart` → `CategoryBarList`（`:items="data.revenue_by_category"`、`:colors="['#67c23a','#409eff','#9b59b6','#e6a23c']"`；expense 同理換色）。移除 `PieChart` import 與 `revenuePieData`/`expensePieData`/`pieOptions`。
5. 月度明細表：整年模式 `trendTableData` 改 `computed(() => (data.value?.monthly_trend || []).filter(r => r.month <= (period.value.lastActualMonth ?? 0)))`；表格下方加表尾說明（`futurePreloggedExpense(trend, lastActualMonth)` 有值時）：`<div class="prelogged-note" data-test="prelogged-note">{{ months[0] }}–12 月已預登錄固定支出共 {{ money(total) }}，於「現金收支表」檢視</div>`。

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/FinanceSummaryPanel.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
  const m = i + 1
  return m <= 6
    ? { month: m, revenue: 1000, refund: 10, expense: 500, net: 490 }
    : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 }
})

vi.mock('@/api/reports', () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({
    data: {
      summary: { total_revenue: 6000, total_refund: 60, net_revenue: 5940, total_expense: 3003000, net_cashflow: -2997060 },
      monthly_trend: monthlyTrend,
      revenue_by_category: [
        { label: '學費', amount: 9000 },
        { label: '才藝', amount: 500 },
        { label: '雜項收款', amount: 500 },
      ],
      expense_by_category: [{ label: '員工應發', amount: 3000 }],
    },
  }),
  financeSummaryExportUrl: vi.fn().mockReturnValue('/reports/finance-summary/export?year=2026'),
}))

import FinanceSummaryPanel from '@/views/reports/FinanceSummaryPanel.vue'

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10)) // cutoff=7、lastActual=7、lastComplete=6
})

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(FinanceSummaryPanel, {
    props: { year: 2026, ...props },
    global: { plugins: [ElementPlus], stubs: { LineChart: true, FinanceDetailDialog: true } },
  })
}

describe('分類條列圖取代圓餅（spec §5）', () => {
  it('渲染 CategoryBarList 列（含學費占比），不再有 PieChart', async () => {
    const w = mountPanel()
    await flushPromises()
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(4) // 收入 3 + 支出 1
    expect(rows[0].text()).toContain('學費')
    expect(rows[0].text()).toContain('90.0%')
  })
})

describe('月度明細截列＋預登錄表尾（spec §5）', () => {
  it('只列到 lastActualMonth（7 列），無 8–12 月假紅字列', async () => {
    const w = mountPanel()
    await flushPromises()
    const table = w.findComponent({ name: 'ElTable' })
    expect((table.props('data') as unknown[]).length).toBe(7)
  })
  it('表尾顯示預登錄固定支出說明', async () => {
    const w = mountPanel()
    await flushPromises()
    const note = w.find('[data-test="prelogged-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('已預登錄固定支出')
  })
})

describe('initialMonth prop（總覽下鑽）', () => {
  it('initialMonth=3 時以單月模式載入', async () => {
    const w = mountPanel({ initialMonth: 3 })
    await flushPromises()
    expect(w.text()).toContain('檢視 2026 年 3 月')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/FinanceSummaryPanel.test.ts`
Expected: FAIL（cat-row 不存在、明細 12 列、無 prelogged-note、無 initialMonth prop）

- [ ] **Step 3: Write implementation**

依「變更要點」逐項落實。script 關鍵 diff：

```ts
// props 加 initialMonth
const props = defineProps<{ year: number; initialMonth?: number | null }>()
const selectedMonth = ref<number | null>(props.initialMonth ?? null)

// period（僅整年模式有意義）
import { computeReportPeriod } from './useReportPeriod'
import { buildTrendChartData, inProgressIndex } from './trendChart'
import { sumTrendUpTo, futurePreloggedExpense, pctChange, type FinanceTrendRow } from './financeTrend'
import ReportKpiCard from './ReportKpiCard.vue'
import CategoryBarList from './CategoryBarList.vue'

const trend = computed<FinanceTrendRow[]>(() => data.value?.monthly_trend || [])
const period = computed(() => computeReportPeriod(props.year, trend.value))

// 整年模式 KPI 主數字（截至實際發生）；單月模式沿用 summary
const actuals = computed(() => sumTrendUpTo(trend.value, period.value.cutoffMonth))
const prelogged = computed(() => futurePreloggedExpense(trend.value, period.value.lastActualMonth ?? 0))

// MoM 錨點改 lastCompleteMonth（原 lastMonthWithData 錨點刪除）
const mom = computed(() => {
  if (selectedMonth.value != null) return null
  const anchor = period.value.lastCompleteMonth
  if (anchor == null) return null
  const curr = trend.value.find(r => r.month === anchor)
  const prev = trend.value.find(r => r.month === anchor - 1)
  if (!curr || !prev) return null
  return {
    revenue: pctChange(curr.revenue, prev.revenue),
    refund: pctChange(curr.refund, prev.refund),
    expense: pctChange(curr.expense, prev.expense),
    net: pctChange(curr.net, prev.net),
  }
})

// 趨勢圖：整年模式走共用 builder；單月模式維持既有單點組法
const trendChartData = computed(() => {
  if (selectedMonth.value == null) {
    return buildTrendChartData(trend.value, period.value, { includeRefund: true })
  }
  // （保留既有單月組法程式碼）
})

// 明細截列
const trendTableData = computed(() => {
  const rows = data.value?.monthly_trend || []
  if (selectedMonth.value != null) return rows
  const last = period.value.lastActualMonth ?? 0
  return rows.filter((r: FinanceTrendRow) => r.month <= last)
})
```

template：KPI 4 卡換 `ReportKpiCard`（value 用 `selectedMonth == null ? money(actuals.revenue) : money(summary.total_revenue)` 依模式切換；expense/net 加 note）；PieChart 卡改：

```vue
<el-col :xs="24" :lg="12">
  <el-card class="chart-card" shadow="hover">
    <template #header><span class="chart-title">收入分類</span></template>
    <CategoryBarList v-if="hasRevenue" :items="data.revenue_by_category" :colors="['#67c23a', '#409eff', '#9b59b6', '#e6a23c']" />
    <el-empty v-else description="無收入資料" :image-size="60" />
  </el-card>
</el-col>
```

明細表卡尾加：

```vue
<div v-if="selectedMonth == null && prelogged.total > 0" class="prelogged-note" data-test="prelogged-note">
  {{ prelogged.months[0] }}–{{ prelogged.months[prelogged.months.length - 1] }} 月已預登錄固定支出共
  {{ money(prelogged.total) }}，於「現金收支表」分頁檢視
</div>
```

```css
.prelogged-note { font-size: 12px; color: var(--text-secondary); padding: 8px 4px 0; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/FinanceSummaryPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/FinanceSummaryPanel.vue src/views/reports/__tests__/FinanceSummaryPanel.test.ts
git commit -m "feat(reports): 收支彙總——分類條列圖/截斷/明細截列/持平規則

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/FinanceSummaryPanel.vue src/views/reports/__tests__/FinanceSummaryPanel.test.ts
```

---

### Task 9: MonthlyPnLPanel — 當月高亮／未來月淡化／跳到本月／dark 修正

**Files:**
- Modify: `src/views/reports/MonthlyPnLPanel.vue`
- Modify: `src/views/reports/__tests__/MonthlyPnLPanel.spec.ts`（追加測試）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2；不需 trend——cutoff 與當月僅依年度/今天）。

**變更要點（spec §6；sticky 表頭/首欄已存在，驗證不回歸即可）**：
1. `const period = computed(() => computeReportPeriod(props.year))`；`currentMonthIdx = period.isCurrentYear ? period.cutoffMonth - 1 : null`。
2. 所有月份 cell（thead th.col-month 與 tbody td.cell-num 的 v-for idx）加 class：`idx === currentMonthIdx → 'col-current'`；`idx + 1 > period.cutoffMonth → 'col-future'`。
3. `netCellClass` 加參數 guard：未來月（idx+1 > cutoffMonth）回 `''`（中性灰，不上紅綠）。
4. header 加「跳到本月」按鈕（`v-if="period.isCurrentYear"`）：`scrollToCurrentMonth()` 用 `pnlScrollRef.querySelector('th.col-current')` 的 `offsetLeft` 減 sticky 首欄寬度設定 `scrollLeft`；資料載入後 `nextTick` 自動呼叫一次。
5. thead 未來月 th 加 `title="預登錄（尚未發生）"`。
6. dark mode 修正：`.pnl-scroll` 與 `.sticky-col` 的 `background: #fff` → `var(--el-bg-color)`。

CSS：

```css
.pnl-table .col-current { background: var(--el-color-primary-light-9); }
.pnl-table thead th.col-current { background: var(--el-color-primary-light-8); }
.pnl-table .col-future { color: var(--el-text-color-placeholder); }
.pnl-table thead th.col-future { color: var(--el-text-color-placeholder); font-weight: 400; }
```

- [ ] **Step 1: Write the failing test**

在 `MonthlyPnLPanel.spec.ts` 追加（檔頭加 `beforeEach` fake timers 固定 2026-07-10；既有測試不受影響——它們不斷言月份欄 class）：

```ts
import { beforeEach } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10))
})

describe('當月高亮與未來月淡化（spec §6）', () => {
  it('檢視今年：7 月欄 col-current、8 月起 col-future', async () => {
    const w = mountPanel() // year: 2026
    await flushPromises()
    const headers = w.findAll('thead th.col-month')
    expect(headers[6].classes()).toContain('col-current')
    expect(headers[7].classes()).toContain('col-future')
    expect(headers[5].classes()).not.toContain('col-future')
  })
  it('未來月的結餘 cell 不上紅綠色（中性）', async () => {
    const w = mountPanel()
    await flushPromises()
    const netRow = w.find('[data-row-key="net_cashflow"]')
    const cells = netRow.findAll('td.cell-num')
    // mock 全年 monthly 皆 1000（正值）：7 月內上綠、8 月起中性
    expect(cells[6].classes()).toContain('cell-positive')
    expect(cells[7].classes()).not.toContain('cell-positive')
    expect(cells[7].classes()).toContain('col-future')
  })
  it('檢視今年顯示「跳到本月」按鈕；過去年不顯示', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="jump-to-current"]').exists()).toBe(true)
    const past = mount(MonthlyPnLPanel, { props: { year: 2020 }, global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } } })
    await flushPromises()
    expect(past.find('[data-test="jump-to-current"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/MonthlyPnLPanel.spec.ts`
Expected: 新測試 FAIL、既有 2 測試 PASS

- [ ] **Step 3: Write implementation**

依變更要點 1–6 實作。關鍵 script 追加：

```ts
import { computed, nextTick } from 'vue' // 併入既有 import
import { computeReportPeriod } from './useReportPeriod'

const period = computed(() => computeReportPeriod(props.year))
const currentMonthIdx = computed(() =>
  period.value.isCurrentYear && period.value.cutoffMonth >= 1 ? period.value.cutoffMonth - 1 : null)

function monthColClass(idx: number): Record<string, boolean> {
  return {
    'col-current': currentMonthIdx.value === idx,
    'col-future': idx + 1 > period.value.cutoffMonth,
  }
}

// 結餘紅綠只給已發生月份；未來月（預登錄）中性
function netCellClassAt(v: number | null | undefined, idx: number): string {
  if (idx + 1 > period.value.cutoffMonth) return ''
  return netCellClass(v)
}

const pnlScrollRef = ref<HTMLElement | null>(null)
function scrollToCurrentMonth() {
  const el = pnlScrollRef.value?.querySelector<HTMLElement>('thead th.col-current')
  const stickyw = pnlScrollRef.value?.querySelector<HTMLElement>('thead th.col-label')?.offsetWidth ?? 0
  if (el && pnlScrollRef.value) {
    pnlScrollRef.value.scrollLeft = Math.max(0, el.offsetLeft - stickyw - 16)
  }
}
```

`load()` 成功後：`await nextTick(); if (currentMonthIdx.value != null) scrollToCurrentMonth()`。

template：`.pnl-scroll` 加 `ref="pnlScrollRef"`；thead `th.col-month` 加 `:class="monthColClass(m - 1)"` 與 `:title="m > period.cutoffMonth ? '預登錄（尚未發生）' : undefined"`；tbody 月份 td 加 `:class="[...既有, monthColClass(idx)]"`；結餘列 cell 的 `netCellClass(value)` 改 `netCellClassAt(value, idx)`；header 區加：

```vue
<el-button v-if="period.isCurrentYear" size="small" data-test="jump-to-current" @click="scrollToCurrentMonth">
  跳到本月
</el-button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/MonthlyPnLPanel.spec.ts`
Expected: PASS（既有＋新增全綠）

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/MonthlyPnLPanel.vue src/views/reports/__tests__/MonthlyPnLPanel.spec.ts
git commit -m "feat(reports): 現金收支表——當月高亮/未來月淡化/跳到本月/dark 底色修正

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/MonthlyPnLPanel.vue src/views/reports/__tests__/MonthlyPnLPanel.spec.ts
```

---

### Task 10: AttendancePanel — 版面／截斷／門檻圖例／提示修正

**Files:**
- Modify: `src/views/reports/AttendancePanel.vue`
- Test: `src/views/reports/__tests__/AttendancePanel.test.ts`（新檔）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2）。

**變更要點（spec §7）**：
1. `const period = computed(() => computeReportPeriod(props.year))`；`attendanceChartData` 的四個 series 改為 `m > period.cutoffMonth → push(null)`（其餘沿用 `?? null`）。
2. 遲到/早退/缺卡三條線移除 `borderDash`，`borderWidth: 1.5`（顏色不變）。
3. 請假趨勢卡的 `el-col` 改 `:xs="24" :lg="24"`（拉滿全寬）。
4. filter 提示文字改「此篩選只影響『各班級出勤統計』圖」；自 filter-bar 移除、改放進班級圖卡 header 小字。
5. 班級圖卡 header 加靜態門檻圖例：

```vue
<template #header>
  <div class="chart-header">
    <span class="chart-title">各班級出勤統計（點擊長條開明細）</span>
    <span class="threshold-legend" data-test="threshold-legend">
      <span class="lg-item"><i class="sw sw-green" />≥95%</span>
      <span class="lg-item"><i class="sw sw-orange" />90–95%</span>
      <span class="lg-item"><i class="sw sw-red" />&lt;90%</span>
    </span>
    <span class="filter-hint" data-test="classroom-filter-hint">班級篩選只影響此圖</span>
  </div>
</template>
```

```css
.chart-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.threshold-legend { display: inline-flex; gap: 8px; font-size: 12px; color: var(--text-secondary); }
.lg-item { display: inline-flex; align-items: center; gap: 3px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.sw-green { background: #67C23A; }
.sw-orange { background: #E6A23C; }
.sw-red { background: #F56C6C; }
.filter-hint { font-size: 12px; color: var(--text-secondary); margin-left: auto; }
```

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/AttendancePanel.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

vi.mock('@/api/reports', () => ({
  getDashboard: vi.fn().mockResolvedValue({
    data: {
      // 後端補密 12 月：未來月 rate 0（懸崖來源）
      attendance_monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, rate: i < 7 ? 90 + i : 0, late: 1, early_leave: 0, missing: 0, total_records: 10,
      })),
      attendance_by_classroom: [{ classroom_id: 1, classroom: '向日葵', rate: 92 }],
      leave_monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, personal: 1, sick: 0, annual: 0 })),
    },
  }),
}))

import AttendancePanel from '@/views/reports/AttendancePanel.vue'

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10)) // cutoff=7
})

function mountPanel() {
  return mount(AttendancePanel, {
    props: { year: 2026 },
    global: { plugins: [ElementPlus], stubs: { LineChart: true, BarChart: true, AttendanceDetailDialog: true } },
  })
}

describe('出勤率截斷（spec §7）', () => {
  it('8–12 月出勤率為 null（不畫），7 月內保留原值', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'LineChart' })
    const rates = (chart.props('data') as { datasets: Array<{ data: (number | null)[] }> }).datasets[0].data
    expect(rates[6]).toBe(96)
    expect(rates[7]).toBeNull()
    expect(rates[11]).toBeNull()
  })
  it('輔助線（遲到）無 borderDash、細實線', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'LineChart' })
    const late = (chart.props('data') as { datasets: Array<Record<string, unknown>> }).datasets[1]
    expect(late.borderDash).toBeUndefined()
    expect(late.borderWidth).toBe(1.5)
  })
})

describe('版面與圖例（spec §7）', () => {
  it('門檻圖例與修正後的 filter 提示渲染於班級圖卡', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="threshold-legend"]').text()).toContain('≥95%')
    expect(w.find('[data-test="classroom-filter-hint"]').text()).toContain('只影響此圖')
    expect(w.text()).not.toContain('右下')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/AttendancePanel.test.ts`
Expected: FAIL（rates[7] 為 0 非 null、legend 不存在）

- [ ] **Step 3: Write implementation**

依變更要點 1–5 實作（`attendanceChartData` 迴圈：`if (m > period.value.cutoffMonth) { rates.push(null); late.push(null); early.push(null); miss.push(null); continue }`）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/AttendancePanel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/AttendancePanel.vue src/views/reports/__tests__/AttendancePanel.test.ts
git commit -m "feat(reports): 出勤——截斷懸崖/版面全寬/門檻圖例/提示修正

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/AttendancePanel.vue src/views/reports/__tests__/AttendancePanel.test.ts
```

---

### Task 11: SalaryPanel — 圖表編碼重整

**Files:**
- Modify: `src/views/reports/SalaryPanel.vue`
- Test: `src/views/reports/__tests__/SalaryPanel.test.ts`（新檔）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2）。

**變更要點（spec §8）**：
1. `salaryChartData` 只留兩個 dataset：長條「應發總額」＋實線「實發總額」；`bonus`/`ot` 陣列保留計算但不再作為 dataset，改供 tooltip 用。
2. tooltip `afterBody`：顯示該月「獎金合計（已計入應發總額，不可與應發相加）：$X」「加班費：$Y」（從 monthMap 取；null 顯示 $0）。
3. 所有 series 對 `m > period.cutoffMonth` 塞 null（與其他 panel 一致；已封存資料只會在過去月，屬防禦性一致化）。
4. 卡片 header 下加小字 `data-test="salary-note"`：「僅顯示已封存薪資的月份（草稿／待重算不計入）」。

- [ ] **Step 1: Write the failing test**

`src/views/reports/__tests__/SalaryPanel.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

vi.mock('@/api/reports', () => ({
  getDashboard: vi.fn().mockResolvedValue({
    data: {
      salary_monthly: [
        { month: 5, total_gross: 1200000, total_net: 1000000, total_bonus: 300000, total_overtime_pay: 20000 },
        { month: 6, total_gross: 1100000, total_net: 950000, total_bonus: 250000, total_overtime_pay: 10000 },
      ],
    },
  }),
  getFinanceSummary: vi.fn().mockResolvedValue({
    data: {
      expense_by_category: [
        { category: 'salary_gross', label: '員工應發', amount: 2576068 },
        { category: 'employer_benefit', label: '雇主保費+勞退', amount: 414896 },
      ],
    },
  }),
}))

import SalaryPanel from '@/views/reports/SalaryPanel.vue'

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10))
})

function mountPanel() {
  return mount(SalaryPanel, {
    props: { year: 2026 },
    global: { plugins: [ElementPlus], stubs: { BarChart: true, SalaryContributorsDialog: true } },
  })
}

describe('薪資圖編碼重整（spec §8）', () => {
  it('只有兩個 dataset：應發（bar）＋實發（line）；獎金/加班不再是 dataset', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'BarChart' })
    const datasets = (chart.props('data') as { datasets: Array<{ label: string }> }).datasets
    expect(datasets.map(d => d.label)).toEqual(['應發總額', '實發總額'])
  })
  it('封存月保值、其他月 null', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'BarChart' })
    const gross = (chart.props('data') as { datasets: Array<{ data: (number | null)[] }> }).datasets[0].data
    expect(gross[4]).toBe(1200000)
    expect(gross[0]).toBeNull()
    expect(gross[11]).toBeNull()
  })
  it('顯示「僅顯示已封存薪資的月份」註記', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="salary-note"]').text()).toContain('已封存')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/SalaryPanel.test.ts`
Expected: FAIL（現有 4 datasets、無 salary-note）

- [ ] **Step 3: Write implementation**

`salaryChartData` 改：

```ts
import { computeReportPeriod } from './useReportPeriod'
const period = computed(() => computeReportPeriod(props.year))

const monthMap = computed<Record<number, Record<string, number | null>>>(() => {
  const map: Record<number, Record<string, number | null>> = {}
  ;(data.value.salary_monthly || []).forEach((d: Record<string, number>) => { map[d.month] = d })
  return map
})

const salaryChartData = computed(() => {
  const gross: (number | null)[] = []
  const net: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    const d = m > period.value.cutoffMonth ? undefined : monthMap.value[m]
    gross.push(d ? (d.total_gross as number) : null)
    net.push(d ? (d.total_net as number) : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '應發總額', data: gross, backgroundColor: 'rgba(64,158,255,0.6)', borderColor: '#409EFF', borderWidth: 1, borderRadius: 4, order: 2 },
      { label: '實發總額', data: net, type: 'line', borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: false, tension: 0.3, pointRadius: 4, order: 1 },
    ],
  } as unknown as ChartData<'bar', (number | null)[]>
})
```

tooltip options 改（取代既有 label callback）：

```ts
tooltip: {
  callbacks: {
    label: (ctx: { dataset: { label: string }; parsed: { y: number | null } }) =>
      `${ctx.dataset.label}: $${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : 0}`,
    afterBody: (items: Array<{ dataIndex: number }>) => {
      const m = (items[0]?.dataIndex ?? 0) + 1
      const d = monthMap.value[m]
      if (!d) return []
      return [
        `獎金合計：$${(d.total_bonus || 0).toLocaleString()}（已計入應發總額，不可與應發相加）`,
        `加班費：$${(d.total_overtime_pay || 0).toLocaleString()}`,
      ]
    },
  },
},
```

header 下加：

```vue
<div class="salary-note" data-test="salary-note">僅顯示已封存薪資的月份（草稿／待重算不計入）</div>
```

```css
.salary-note { font-size: 12px; color: var(--text-secondary); margin: -4px 0 8px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/SalaryPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/SalaryPanel.vue src/views/reports/__tests__/SalaryPanel.test.ts
git commit -m "feat(reports): 薪資圖表編碼重整——雙系列＋tooltip 明細＋封存註記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/SalaryPanel.vue src/views/reports/__tests__/SalaryPanel.test.ts
```

---

### Task 12: MonthlyFixedCostPanel — sticky 工具列／當月欄高亮／千分位輸入

**Files:**
- Modify: `src/views/reports/MonthlyFixedCostPanel.vue`
- Modify: `src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`（追加）

**Interfaces:**
- Consumes: `computeReportPeriod`（Task 2）。

**變更要點（spec §9）**：
1. `.panel-toolbar` 加 `position: sticky; top: 0; z-index: 4; background: var(--el-bg-color); padding: 8px 0;`。
2. 當月欄高亮：`const period = computed(() => computeReportPeriod(props.year))`；thead th 與 td 加 `:class="{ 'col-current': period.isCurrentYear && m === period.cutoffMonth }"`；CSS 同 Task 9 的 `col-current` token（`--el-color-primary-light-9`）。
3. 千分位輸入：input `type="number"` 改 `type="text"`（保留 `inputmode="numeric"`）；新增 `focusedKey = ref<string | null>(null)`；`:value` 改 `focusedKey === cellKey(m, c.key) ? rawText(m, c.key) : displayText(m, c.key)`（未 focus 顯示 `1,234`、focus 顯示 `1234`）；`@focus`/`@blur` 維護 focusedKey；`setCurrent` 解析前 `String(raw).replace(/,/g, '')`。
   ```ts
   function rawText(month: number, category: string): string {
     const v = getCurrent(month, category)
     return v == null ? '' : String(v)
   }
   function displayText(month: number, category: string): string {
     const v = getCurrent(month, category)
     return v == null ? '' : amountFormatter.format(v)
   }
   ```
4. dark 修正：`.fc-scroll`、`.sticky-col` 的 `#fff` → `var(--el-bg-color)`。

- [ ] **Step 1: Write the failing test**

在 `MonthlyFixedCostPanel.test.ts` 追加（沿用檔內既有 mock/mount 慣例；fake timers 固定 2026-07-10）：

```ts
describe('千分位輸入顯示（spec §9）', () => {
  it('未 focus 的 cell 顯示千分位、focus 後切回純數字', async () => {
    const w = await mountLoaded() // 既有 helper；rent 1 月已有 500000
    const input = w.find('[data-cell-key="1-rent"] input')
    expect((input.element as HTMLInputElement).value).toBe('500,000')
    await input.trigger('focus')
    expect((input.element as HTMLInputElement).value).toBe('500000')
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('500,000')
  })
  it('輸入含逗號字串可正確解析（500,000 → 500000）', async () => {
    const w = await mountLoaded()
    const input = w.find('[data-cell-key="2-rent"] input')
    await input.trigger('focus')
    await input.setValue('500,000')
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('500,000')
  })
})

describe('當月欄高亮', () => {
  it('檢視今年時當月（7 月）th 帶 col-current', async () => {
    const w = await mountLoaded()
    const headers = w.findAll('thead th.col-month')
    expect(headers[6].classes()).toContain('col-current')
    expect(headers[5].classes()).not.toContain('col-current')
  })
})
```

（若檔內尚無 `mountLoaded` helper：建一個 mount＋`flushPromises` 的小 helper，mock `getMonthlyFixedCosts` 回 `[{ month: 1, category: 'rent', amount: 500000 }]`，抄檔內既有 mock 形狀。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`
Expected: 新測試 FAIL（value 是 `500000`、無 col-current）、既有測試 PASS

- [ ] **Step 3: Write implementation**

依變更要點 1–4 實作。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`
Expected: PASS（既有＋新增全綠；特別確認既有鍵盤導航測試不回歸——input type 改 text 後 `useGridKeyboardNav` 行為不變）

- [ ] **Step 5: Commit**

```bash
git add src/views/reports/MonthlyFixedCostPanel.vue src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts
git commit -m "feat(reports): 固定支出登錄——sticky 工具列/當月高亮/千分位輸入

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/reports/MonthlyFixedCostPanel.vue src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts
```

---

### Task 13: 收尾 gate — 全量測試／typecheck／lint／瀏覽器實測

**Files:**
- 無新檔（驗證與修復回歸）

- [ ] **Step 1: 全量測試**

Run: `cd ~/Desktop/ivy-frontend && npm run test`
Expected: 全綠（含 `tests/` 樹與 `src/**/__tests__` 樹——vitest 全量涵蓋兩棵；若有真 EP mount 檔偶發 5s timeout flaky，單獨重跑該檔確認，見 memory feedback_happydom_real_ep_mount_5s_timeout_flaky）

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 error（`no-explicit-any` gate 必過）

- [ ] **Step 3: 瀏覽器實測（dev server 由 user 的 start.sh 提供，Claude 不可自行起 start.sh）**

用 claude-in-chrome 開 `http://localhost:5173/#/reports` 逐項驗證：
1. 經營總覽：KPI 主數字 = 截至當月實際發生（對照收支彙總明細表手加 1–7 月）；MoM 非 0.0%（錨 6 月 vs 5 月）或正確顯示「— 持平」；主趨勢圖 8 月起無線；點資料點跳收支彙總該月。
2. URL：切 tab → query 變；貼 `#/reports?tab=salary&year=2025` 直達；重整不彈回。
3. 收支彙總：分類條列圖取代圓餅；明細只列到 7 月＋表尾預登錄說明。
4. 現金收支表：7 月欄高亮、8–12 月淡化、結餘未來月無紅字、「跳到本月」捲動生效、橫捲時首欄/表頭凍結。
5. 出勤：請假圖全寬；出勤率線 8 月起中斷；門檻圖例正確。
6. 薪資：兩系列圖；hover tooltip 有獎金/加班明細。
7. 固定支出登錄：千分位顯示、focus 編輯、dirty 離開保護仍作動、儲存全部 sticky。
8. Dark mode（右上主題切換）：PnL/固定支出表底色非白、chart 可讀。
9. 手機寬度（DevTools 375px）：KPI 卡堆疊、表格橫向捲動、無水平頁面捲軸。

- [ ] **Step 4: 回歸修復**

任何失敗：修復 → 重跑對應測試 → 全量再跑一次。

- [ ] **Step 5: 最終 commit（如有收尾修復）**

```bash
git add <修復的檔案們>
git commit -m "fix(reports): 改版收尾回歸修復

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- <修復的檔案們>
```

**注意**：本計畫完成 ≠ push。依 workspace 收尾紀律，push 需 user 明確授權（push = Zeabur prod 部署，且 FE repo 有平行 session 未推 commit，需整批確認）。完成後回報 user 並提示 `finish-check.sh` 狀態。

---

## Self-Review 紀錄

- Spec 覆蓋：§2→Task 2、§3→Task 5、§4→Task 7、§5→Task 8、§6→Task 9、§7→Task 10、§8→Task 11、§9→Task 12、§10 橫切→散落於各 task 的 CSS/dark 修正＋Task 13 驗證、§12 測試策略→各 task Step 1、§14 風險→Task 3（共用卡）/Task 8（cache 雙軌不動）/Task 6（segment API 降級路徑在 builder 內註記）。
- 型別一致性：`computeReportPeriod` / `ReportPeriod` / `sumTrendUpTo` / `futurePreloggedExpense` / `cutSeries` / `deltaKind` / `buildTrendChartData` / `inProgressIndex` 簽名在 Task 1/2/6 定義，Task 7–12 引用一致。
- 無 TBD/佔位符。

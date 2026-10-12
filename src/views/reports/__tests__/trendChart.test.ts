import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildMonthlyMoneyChart, resolveTrendPalette, withAlpha } from '../trendChart'
import { computeReportPeriod } from '../useReportPeriod'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 9, 12) // 10 月進行中
const PALETTE = { revenue: '#101010', refund: '#202020', expense: '#303030', net: '#404040' }
const zero = (m: number): FinanceTrendRow => ({ month: m, revenue: 0, refund: 0, expense: 0, net: 0 })

/** staging 形狀：8 月才開始記帳；10 月進行中已有一筆收入；12 月預登錄固定支出 */
function trend(): FinanceTrendRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    if (m === 8) return { month: 8, revenue: 90396, refund: 0, expense: 4, net: 90392 }
    if (m === 9) return { month: 9, revenue: 1965811, refund: 23000, expense: 94, net: 1942717 }
    if (m === 10) return { month: 10, revenue: 5000, refund: 0, expense: 0, net: 5000 }
    if (m === 12) return { month: 12, revenue: 0, refund: 0, expense: 500000, net: -500000 }
    return zero(m)
  })
}

type DS = { label?: string; type?: string; data: Array<number | null>; tension?: number; backgroundColor?: unknown; borderWidth?: unknown }

describe('buildMonthlyMoneyChart（改版提案 F3：沒資料不畫成 0）', () => {
  const period = computeReportPeriod(2026, trend(), TODAY)
  const { data, meta } = buildMonthlyMoneyChart(trend(), period, { palette: PALETTE })
  const ds = data.datasets as unknown as DS[]

  it('收入／支出長條＋淨現金折線', () => {
    expect(ds.map(d => [d.type, d.label])).toEqual([['bar', '收入'], ['bar', '支出'], ['line', '淨現金']])
  })

  it('年度第一筆收支之前的月份為 null 並列入灰帶，不畫 0', () => {
    expect(ds[0].data.slice(0, 7)).toEqual([null, null, null, null, null, null, null])
    expect(meta.noRecordMonths).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(ds[0].data[7]).toBe(90396)
  })

  it('未來月（含預登錄）為 null；本月畫長條但淨現金不連線', () => {
    expect(ds[1].data[11]).toBeNull()
    expect(ds[0].data[9]).toBe(5000)
    expect(ds[2].data[9]).toBeNull()
    expect(ds[2].data[8]).toBe(1942717)
    expect(meta.currentMonth).toBe(10)
  })

  it('折線不平滑（tension 0），本月長條用淡底加框', () => {
    expect(ds[2].tension).toBe(0)
    const bg = ds[0].backgroundColor as string[]
    expect(bg[8]).toBe('#101010')
    expect(bg[9]).toBe(withAlpha('#101010', 0.18))
    expect((ds[0].borderWidth as number[])[9]).toBeGreaterThan(0)
  })

  it('整年沒有任何資料：截止月前全部列入灰帶', () => {
    const empty = Array.from({ length: 12 }, (_, i) => zero(i + 1))
    const r = buildMonthlyMoneyChart(empty, computeReportPeriod(2026, empty, TODAY), { palette: PALETTE })
    expect(r.meta.noRecordMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('resolveTrendPalette / withAlpha（圖表色走 design tokens）', () => {
  it('依 --color-success/warning/danger/info 解析四色', () => {
    const vars: Record<string, string> = {
      '--color-success': '#111111', '--color-warning': '#222222', '--color-danger': '#333333', '--color-info': '#444444',
    }
    expect(resolveTrendPalette(n => vars[n] ?? '')).toEqual({
      revenue: '#111111', refund: '#222222', expense: '#333333', net: '#444444',
    })
  })
  it('token 缺值時退回與 design-tokens.css 對齊的 fallback（非 EP 預設色）', () => {
    const p = resolveTrendPalette(() => '')
    expect(p).toEqual({ revenue: '#10b981', refund: '#f59e0b', expense: '#ef4444', net: '#3b82f6' })
  })
  it('withAlpha 把 #rrggbb 轉成 rgba；非 hex 原樣退回', () => {
    expect(withAlpha('#10b981', 0.1)).toBe('rgba(16,185,129,0.1)')
    expect(withAlpha('rgb(1,2,3)', 0.1)).toBe('rgb(1,2,3)')
  })
})

describe('EP 預設 hex 禁令（DESIGN.md：色彩一律 var(--...)，勿寫死 #409eff）', () => {
  it('trendChart.ts 不得含 EP 預設四色 hex', () => {
    const src = readFileSync('src/views/reports/trendChart.ts', 'utf8')
    expect(src).not.toMatch(/#(409eff|67c23a|f56c6c|e6a23c)/i)
  })
})

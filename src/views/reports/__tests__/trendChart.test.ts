import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  buildTrendChartData, inProgressIndex,
  resolveTrendPalette, withAlpha, formatAxisTick,
} from '../trendChart'
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

describe('resolveTrendPalette / withAlpha（2026-08-25 稽核 C2：圖表色走 design tokens）', () => {
  it('依 --color-success/warning/danger/info 解析四色', () => {
    const vars: Record<string, string> = {
      '--color-success': '#111111',
      '--color-warning': '#222222',
      '--color-danger': '#333333',
      '--color-info': '#444444',
    }
    expect(resolveTrendPalette(n => vars[n] ?? '')).toEqual({
      revenue: '#111111', refund: '#222222', expense: '#333333', net: '#444444',
    })
  })
  it('token 缺值時退回與 design-tokens.css 對齊的 fallback（非 EP 預設色）', () => {
    const p = resolveTrendPalette(() => '')
    expect(p.revenue).toBe('#10b981')
    expect(p.refund).toBe('#f59e0b')
    expect(p.expense).toBe('#ef4444')
    expect(p.net).toBe('#3b82f6')
  })
  it('withAlpha 把 #rrggbb 轉成 rgba；非 hex 原樣退回', () => {
    expect(withAlpha('#10b981', 0.1)).toBe('rgba(16,185,129,0.1)')
    expect(withAlpha('rgb(1,2,3)', 0.1)).toBe('rgb(1,2,3)')
  })
  it('buildTrendChartData 線色/底色來自 palette（可注入覆寫）', () => {
    const p = computeReportPeriod(2026, trend(), TODAY)
    const palette = { revenue: '#101010', refund: '#202020', expense: '#303030', net: '#404040' }
    const data = buildTrendChartData(trend(), p, { palette })
    const ds = data.datasets as Array<{ label?: string; borderColor?: unknown; backgroundColor?: unknown }>
    expect(ds.find(d => d.label === '收入')?.borderColor).toBe('#101010')
    expect(ds.find(d => d.label === '收入')?.backgroundColor).toBe('rgba(16,16,16,0.1)')
    expect(ds.find(d => d.label === '淨現金')?.borderColor).toBe('#404040')
  })
})

describe('formatAxisTick（2026-08-25 稽核 m8：軸標籤與卡片同用 NT$）', () => {
  it('正/負/零值皆帶 NT$ 前綴、千元縮寫', () => {
    expect(formatAxisTick(500000)).toBe('NT$500k')
    expect(formatAxisTick(-500000)).toBe('NT$-500k')
    expect(formatAxisTick(0)).toBe('NT$0k')
  })
})

describe('EP 預設 hex 禁令（design.md：色彩一律 var(--...)，勿寫死 #409eff）', () => {
  it('trendChart.ts 與 FinanceSummaryPanel.vue 不得含 EP 預設四色 hex', () => {
    for (const f of ['src/views/reports/trendChart.ts', 'src/views/reports/FinanceSummaryPanel.vue']) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} 仍含 EP 預設 hex`).not.toMatch(/#(409eff|67c23a|f56c6c|e6a23c)/i)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import type { FixedCostStatus } from '../closeStatus'

const { state } = vi.hoisted(() => ({
  state: {
    trend: [] as Array<{ month: number; revenue: number; refund: number; expense: number; net: number }>,
    prevTrend: [] as Array<{ month: number; revenue: number; refund: number; expense: number; net: number }>,
    dashboard: {} as Record<string, unknown>,
    dashboardFails: false,
    financeFails: false,
    prevFails: false,
    monthCats: [] as Array<{ category: string; amount: number }>,
    canRead: false,
  },
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => state.canRead,
  getUserInfo: () => ({ username: 'admin' }),
}))
vi.mock('@/api/reports', () => ({
  getDashboard: vi.fn(() => (state.dashboardFails
    ? Promise.reject(new Error('boom'))
    : Promise.resolve({ data: state.dashboard }))),
  getFinanceSummary: vi.fn((year: number, month?: number) => {
    if (state.financeFails && year === 2026 && month == null) return Promise.reject(new Error('boom'))
    if (state.prevFails && year === 2025) return Promise.reject(new Error('boom'))
    if (month != null) return Promise.resolve({ data: { expense_by_category: state.monthCats } })
    return Promise.resolve({ data: { monthly_trend: year === 2026 ? state.trend : state.prevTrend } })
  }),
}))
vi.mock('@/views/reports/chartSetup', () => ({
  BarChart: { name: 'BarChart', props: ['data', 'options', 'plugins'], template: '<div class="chart-stub" />' },
}))
vi.mock('@/api/vendorPayment', () => ({ getVendorPaymentSummary: vi.fn().mockResolvedValue({ data: { pending_count: 0, pending_amount: 0 } }) }))
vi.mock('@/api/miscReceipt', () => ({ getMiscReceiptSummary: vi.fn().mockResolvedValue({ data: { pending_count: 0, pending_amount: 0 } }) }))

vi.mock('@/api/historicalPnl', () => ({
  getHistoricalPnl: vi.fn().mockResolvedValue({ data: { year: 2026, actual_status: 'unverified', months: [], totals: { revenue: '0.00', expense: '0.00', profit: '0.00' } } }),
  previewHistoricalPnl: vi.fn(),
  importHistoricalPnl: vi.fn(),
}))

import { getHistoricalPnl } from '@/api/historicalPnl'
import { getFinanceSummary } from '@/api/reports'
import OverviewPanel from '@/views/reports/OverviewPanel.vue'

const zero = (m: number) => ({ month: m, revenue: 0, refund: 0, expense: 0, net: 0 })

/** staging 形狀：8 月才開始記帳，9 月有退款，支出只有代收手續費 */
function stagingTrend() {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    if (m === 8) return { month: 8, revenue: 90396, refund: 0, expense: 4, net: 90392 }
    if (m === 9) return { month: 9, revenue: 1965811, refund: 23000, expense: 94, net: 1942717 }
    return zero(m)
  })
}
function stagingDashboard() {
  return {
    salary_monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, employee_count: 0, employee_count_pending: i === 0 ? 33 : 0,
    })),
    attendance_monthly: Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      if (m === 1) return { month: 1, total_records: 110, rate: 25.5, late: 57 }
      if (m === 9) return { month: 9, total_records: 414, rate: 41.8, late: 173 }
      return { month: m, total_records: 0, rate: 0, late: 0 }
    }),
  }
}

const NOTHING_REGISTERED: FixedCostStatus = { state: 'ok', registered: [] }

function mountPanel(props: Partial<{ focusMonth: number; fixedCost: FixedCostStatus }> = {}) {
  return mount(OverviewPanel, {
    props: { year: 2026, focusMonth: 9, fixedCost: NOTHING_REGISTERED, ...props },
    global: { plugins: [ElementPlus], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

const cellState = (w: ReturnType<typeof mountPanel>, row: string, m: number) =>
  w.find(`[data-test="cell-${row}-${m}"]`).attributes('data-state')

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12)) // 2026-10-12：10 月進行中
  state.trend = stagingTrend()
  state.prevTrend = []
  state.dashboard = stagingDashboard()
  state.dashboardFails = false
  state.financeFails = false
  state.prevFails = false
  state.monthCats = []
  state.canRead = false
  vi.mocked(getFinanceSummary).mockClear()
})
afterEach(() => { vi.useRealTimers() })

describe('收支等式（焦點月）', () => {
  it('歷史參考尚在載入時，現金收支數字仍獨立顯示', async () => {
    vi.mocked(getHistoricalPnl).mockReturnValueOnce(new Promise(() => {}))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('歷史損益參考')
    expect(w.find('[data-test="value-revenue"]').text()).toBe('1,965,811')
    expect(w.find('[data-test="value-net"]').text()).toBe('1,942,717')
  })

  it('主數字是焦點月、第二行是年初至今', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="equation-title"]').text()).toBe('9 月收支')
    expect(w.find('[data-test="value-revenue"]').text()).toBe('1,965,811')
    expect(w.find('[data-test="value-refund"]').text()).toBe('23,000')
    expect(w.find('[data-test="value-expense"]').text()).toBe('94')
    expect(w.find('[data-test="value-net"]').text()).toBe('1,942,717')
    expect(w.find('[data-test="term-revenue"]').text()).toContain('1–9 月累計 2,056,207')
    expect(w.find('[data-test="term-net"]').text()).toContain('1–9 月累計 2,033,109')
  })

  it('上月是年度第一個有收支的月份（可能不完整）時不算百分比，寫原因', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="compare-hint"]').text()).toContain('8 月是今年第一個有收支的月份')
    expect(w.find('[data-test="cmp-revenue"]').exists()).toBe(false)
    expect(w.find('[data-test="cmp-net"]').exists()).toBe(false)
    expect(w.find('[data-test="equation"]').text()).not.toContain('%') // 不再出現 +2049.2% 這類誤導百分比
  })

  it('支出缺項就地點名：固定支出未登錄、薪資未封存，並提醒淨現金偏高', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="expense-incomplete"]').exists()).toBe(true)
    const gaps = w.find('[data-test="expense-gaps"]').text()
    expect(gaps).toContain('固定支出 9 月未登錄')
    expect(gaps).toContain('薪資 9 月未封存')
    expect(w.find('[data-test="term-net"]').text()).toContain('淨現金會偏高')
  })

  it('資料齊全時：收入用百分比比較、淨現金用金額差，且不標不完整', async () => {
    state.trend = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      return m <= 9 ? { month: m, revenue: 2_000_000, refund: 20_000, expense: 1_700_000, net: 280_000 } : zero(m)
    })
    state.trend[7] = { month: 8, revenue: 1_600_000, refund: 0, expense: 1_600_000, net: 0 }
    state.dashboard = {
      ...stagingDashboard(),
      salary_monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, employee_count: i < 9 ? 30 : 0, employee_count_pending: 0 })),
    }
    const w = mountPanel({ fixedCost: { state: 'ok', registered: [1, 2, 3, 4, 5, 6, 7, 8, 9] } })
    await flushPromises()
    expect(w.find('[data-test="cmp-revenue"]').text()).toContain('vs 8 月')
    expect(w.find('[data-test="cmp-revenue"]').text()).toContain('25.0%')
    // 8 月淨現金為 0：百分比無意義，改金額差
    expect(w.find('[data-test="cmp-net"]').text()).toContain('+280,000')
    expect(w.find('[data-test="expense-incomplete"]').exists()).toBe(false)
    expect(w.find('[data-test="kpi-ratio"]').text()).toContain('1.16')
  })
})

describe('結帳狀態矩陣', () => {
  it('收入：上線前無紀錄、有資料完成、本月進行中、未來月；固定支出未登錄；1 月薪資草稿', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(cellState(w, 'revenue', 7)).toBe('none')
    expect(cellState(w, 'revenue', 9)).toBe('ok')
    expect(cellState(w, 'revenue', 10)).toBe('prog')
    expect(cellState(w, 'revenue', 11)).toBe('future')
    expect(cellState(w, 'fixed', 3)).toBe('miss')
    expect(cellState(w, 'fixed', 10)).toBe('miss')
    expect(cellState(w, 'salary', 1)).toBe('draft')
    expect(cellState(w, 'salary', 2)).toBe('miss')
    expect(cellState(w, 'salary', 10)).toBe('prog')
  })

  it('每類一行摘要取代逐月重複待辦；固定支出動作就地切到登錄分頁', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="act-fixed"]').text()).toContain('1–10 月未登錄')
    expect(w.find('[data-test="act-salary"]').text()).toContain('1 月草稿 33 人 · 2–9 月未結算')
    await w.find('[data-test="act-fixed-go"]').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual([{ tab: 'fixed-cost' }])
  })

  it('沒有固定支出讀取權限：整列無法確認，不出現登錄按鈕也不顯示完成', async () => {
    const w = mountPanel({ fixedCost: { state: 'forbidden' } })
    await flushPromises()
    expect(cellState(w, 'fixed', 3)).toBe('unknown')
    expect(w.find('[data-test="act-fixed"]').text()).toContain('需要廠商付款讀取權限')
    expect(w.find('[data-test="act-fixed-go"]').exists()).toBe(false)
    expect(w.find('[data-test="act-fixed"]').text()).not.toContain('完成')
  })

  it('出勤／薪資資料讀取失敗：薪資列無法確認、出勤指標寫無法確認（不給假的全清）', async () => {
    state.dashboardFails = true
    const w = mountPanel()
    await flushPromises()
    expect(cellState(w, 'salary', 3)).toBe('unknown')
    expect(w.find('[data-test="act-salary"]').text()).toContain('無法確認')
    expect(w.find('[data-test="kpi-attendance"]').text()).toContain('無法確認')
  })

  it('憑證：兩來源皆確知 0 筆才顯示完成', async () => {
    state.canRead = true
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="act-signoff"]').text()).toContain('憑證皆已補齊')
  })
})

describe('查不到 ≠ 已完整（審查 P2）', () => {
  it('薪資已封存但固定支出無讀取權限：支出標「未確認」、收支比無法確認', async () => {
    state.dashboard = {
      ...stagingDashboard(),
      salary_monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, employee_count: 30, employee_count_pending: 0 })),
    }
    const w = mountPanel({ fixedCost: { state: 'forbidden' } })
    await flushPromises()
    expect(w.find('[data-test="expense-incomplete"]').exists()).toBe(false)
    expect(w.find('[data-test="expense-unknown"]').exists()).toBe(true)
    expect(w.find('[data-test="expense-unknowns"]').text()).toContain('固定支出登錄狀態查不到')
    expect(w.find('[data-test="kpi-ratio"]').text()).toContain('無法確認')
  })

  it('焦點選在未來月：年初至今只算到截止月，不把預登錄當已發生', async () => {
    const w = mountPanel({ focusMonth: 12 })
    await flushPromises()
    expect(w.find('[data-test="term-revenue"]').text()).toContain('1–10 月累計 2,056,207')
    expect(w.find('[data-test="compare-hint"]').text()).toContain('12 月尚未開始')
  })

  it('1 月焦點、去年資料讀取失敗：寫讀取失敗，不說「去年 12 月沒有紀錄」', async () => {
    state.prevFails = true
    state.trend = stagingTrend().map(r => (r.month === 1 ? { month: 1, revenue: 100, refund: 0, expense: 10, net: 90 } : r))
    const w = mountPanel({ focusMonth: 1 })
    await flushPromises()
    const hint = w.find('[data-test="compare-hint"]').text()
    expect(hint).toContain('去年資料讀取失敗')
    expect(hint).not.toContain('沒有收支紀錄')
  })
})

describe('其他指標與圖表', () => {
  it('人事成本未封存、出勤率帶筆數、收支比在支出不完整時不計算', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="kpi-personnel"]').text()).toContain('尚未封存')
    expect(w.find('[data-test="kpi-attendance"]').text()).toContain('41.8%')
    expect(w.find('[data-test="kpi-attendance"]').text()).toContain('414 筆打卡')
    expect(w.find('[data-test="kpi-ratio"]').text()).toContain('暫不計算')
  })

  it('點圖上的月份會切換焦點；圖表資料上線前月份為 null 不是 0', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'BarChart' })
    const props = chart.props() as {
      data: { datasets: Array<{ data: Array<number | null> }> }
      options: { onClick: (e: unknown, els: Array<{ index: number }>) => void }
    }
    expect(props.data.datasets[0].data[6]).toBeNull()
    expect(props.data.datasets[0].data[8]).toBe(1965811)
    props.options.onClick(null, [{ index: 7 }])
    expect(w.emitted('update:focusMonth')?.[0]).toEqual([8])
  })

  it('焦點月改變：標題更新並抓該月分類（不重掛）', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.setProps({ focusMonth: 8 })
    await flushPromises()
    expect(w.find('[data-test="equation-title"]').text()).toBe('8 月收支')
    expect(vi.mocked(getFinanceSummary)).toHaveBeenCalledWith(2026, 8)
  })

  it('收支資料讀取失敗：顯示錯誤與重新載入，收入列標無法確認', async () => {
    state.financeFails = true
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="finance-error"]').exists()).toBe(true)
    expect(cellState(w, 'revenue', 9)).toBe('unknown')
  })
})

describe('報表模組樣式 token 紀律（DESIGN.md 硬規則）', () => {
  // vitest css:false 無法斷言 computed style，改斷言 SFC 原始碼的 style 段。
  const FILES = [
    'src/views/ReportsView.vue',
    'src/views/reports/OverviewPanel.vue',
    'src/views/reports/HistoricalPnlPanel.vue',
    'src/views/reports/FinanceSummaryPanel.vue',
    'src/views/reports/FinanceDetailDrawer.vue',
    'src/views/reports/ReportNotesDrawer.vue',
  ]
  it('不得出現裸 px 字級／裸 4px 圓角／裸秒數 transition／EP 預設色 hex', () => {
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} 仍有裸 font-size px`).not.toMatch(/font-size:\s*\d+px/)
      expect(src, `${f} 仍有裸 border-radius: 4px`).not.toMatch(/border-radius:\s*4px/)
      expect(src, `${f} 仍有裸 transition 時長`).not.toMatch(/transition:[^;]*\d+(\.\d+)?s/)
      expect(src, `${f} 仍含 EP 預設 hex`).not.toMatch(/#(409eff|67c23a|f56c6c|e6a23c)/i)
    }
  })
  it('分頁計數徽章以 warning-darker 底壓白字（AA 對比）', () => {
    const src = readFileSync('src/views/ReportsView.vue', 'utf8')
    const badge = /\.tab-entry__count\s*\{[^}]*\}/s.exec(src)?.[0] ?? ''
    expect(badge).toContain('var(--color-warning-darker)')
  })
})

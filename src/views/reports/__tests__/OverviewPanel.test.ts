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

// 去年（2025）：上下半年金額不同——1–6 月 revenue 各 50／expense 各 25；
// 7–12 月 revenue 各 200／expense 各 100。用來與今年 YTD（截至 cutoff=7）對齊比較
// （F1）：若誤用「去年全年」當分母，會把 7–12 月的較大值也算進去，數字明顯不同於
// 「去年同期（1–7 月）」。
const prevYearTrend = Array.from({ length: 12 }, (_, i) => {
  const m = i + 1
  return m <= 6
    ? { month: m, revenue: 50, refund: 0, expense: 25, net: 25 }
    : { month: m, revenue: 200, refund: 0, expense: 100, net: 100 }
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
  getFinanceSummary: vi.fn().mockImplementation((year: number) => {
    if (year === 2026) {
      return Promise.resolve({
        data: {
          summary: {
            total_revenue: 600, total_refund: 60, net_revenue: 540,
            total_expense: 50 * 6 + 500000 * 6, // 全年口徑（含預登錄）
            net_cashflow: 540 - (50 * 6 + 500000 * 6),
          },
          monthly_trend: monthlyTrend,
        },
      })
    }
    if (year === 2025) {
      return Promise.resolve({
        data: {
          summary: {
            total_revenue: 50 * 6 + 200 * 6, total_refund: 0, net_revenue: 50 * 6 + 200 * 6,
            total_expense: 25 * 6 + 100 * 6, // 全年口徑（去年）
            net_cashflow: (50 * 6 + 200 * 6) - (25 * 6 + 100 * 6),
          },
          monthly_trend: prevYearTrend,
        },
      })
    }
    return Promise.resolve({
      data: {
        summary: { total_revenue: 0, total_refund: 0, net_revenue: 0, total_expense: 0, net_cashflow: 0 },
        monthly_trend: [],
      },
    })
  }),
}))
vi.mock('@/api/monthlyFixedCost', () => ({ getMonthlyFixedCosts: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/vendorPayment', () => ({ getVendorPaymentSummary: vi.fn().mockResolvedValue({ data: {} }) }))
vi.mock('@/api/miscReceipt', () => ({ getMiscReceiptSummary: vi.fn().mockResolvedValue({ data: {} }) }))

import { getFinanceSummary } from '@/api/reports'
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

describe('OverviewPanel YoY 對齊 actuals cutoff（F1 修正：去年同期，非去年全年）', () => {
  it('YoY 用「今年 YTD vs 去年同期（同一 cutoffMonth）」，不是「今年全年 vs 去年全年」', async () => {
    const w = mountPanel()
    await flushPromises()

    // 今年 YTD（截至 cutoff=7）：revenue=600（1–6 月各 100，7 月僅預登錄支出無 revenue）；
    // 去年同期（1–7 月）：revenue = 6*50 + 200 = 500。
    // 正確：pctChange(600, 500) = +20.0%
    // 若誤用「去年全年」(6*50+6*200=1500) 當分母：pctChange(600, 1500) = -60.0%（錯誤方向）
    const yoyRevenue = w.find('[data-test="yoy-revenue"]')
    expect(yoyRevenue.text()).toContain('20.0%')
    expect(yoyRevenue.text()).not.toContain('60.0%')
    expect(yoyRevenue.text()).toContain('vs 去年同期')

    // 支出 YoY 分子不含今年 8–12 月預登錄：今年 YTD 支出 = 6*50 + 500000（7 月預登錄
    // 在 cutoff 內）= 500,300；若含 8–12 月未來預登錄（舊 summary 全年口徑）會是
    // 6*50 + 500000*6 = 3,000,300。去年同期支出 = 6*25 + 100 = 250。
    // 正確：pctChange(500300, 250) = +200020.0%
    // 若誤用全年兩側：pctChange(3000300, 750) = +399940.0%
    const yoyExpense = w.find('[data-test="yoy-expense"]')
    expect(yoyExpense.text()).toContain('200020.0%')
    expect(yoyExpense.text()).not.toContain('399940.0%')

    // 淨現金 YoY 同理對齊 cutoff：今年 YTD net = 6*40 - 500000 = -499,760；
    // 去年同期 net = 6*25 + 100 = 250。正確：pctChange(-499760, 250) = -200004.0%
    // 若誤用全年兩側：pctChange(-2999760, 750) = -400068.0%
    const yoyNet = w.find('[data-test="yoy-net"]')
    expect(yoyNet.text()).toContain('200004.0%')
    expect(yoyNet.text()).not.toContain('400068.0%')
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
  it('薪資摘要卡點擊 emit navigate salary', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="salary-summary-card"]').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual([{ tab: 'salary' }])
  })
  it('鍵盤可及性：出勤摘要卡可聚焦（role=button + tabindex=0）且 Enter 觸發 navigate', async () => {
    const w = mountPanel()
    await flushPromises()
    const card = w.find('[data-test="attendance-summary-card"]')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    await card.trigger('keydown.enter')
    expect(w.emitted('navigate')?.[0]).toEqual([{ tab: 'attendance' }])
  })
})

describe('OverviewPanel 異常與待辦卡獨立於 finance 可用性（F2 修正）', () => {
  it('finance 載入失敗、dashboard 正常時，異常與待辦卡仍渲染（資料源獨立於 finance）', async () => {
    // 只讓第一次呼叫（本年 finance）reject；第二次（prevYearFinance）沿用預設
    // mock 正常解析，避免污染共用的 getFinanceSummary mock 影響同檔後續測試。
    vi.mocked(getFinanceSummary).mockRejectedValueOnce(new Error('finance service down'))
    const w = mountPanel()
    await flushPromises()

    // finance 不可用 → 錯誤區塊仍顯示（KPI 卡不渲染，避免偽造 0）
    expect(w.find('[data-test="finance-error"]').exists()).toBe(true)
    expect(w.find('[data-test="kpi-total-revenue"]').exists()).toBe(false)
    // 但待辦卡不應連坐消失——資料源是 dashboard/fixedCost/signoff，與 finance 無關
    expect(w.find('[data-test="todo-list"]').exists()).toBe(true)
  })
})

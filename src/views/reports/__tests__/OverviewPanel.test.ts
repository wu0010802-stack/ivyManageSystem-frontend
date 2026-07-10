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

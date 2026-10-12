import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import type { FixedCostStatus } from '../closeStatus'

const { state } = vi.hoisted(() => ({
  state: {
    yearFails: false,
    monthFails: false,
    trend: [] as Array<{ month: number; revenue: number; refund: number; expense: number; net: number }>,
    monthData: {} as Record<number, Record<string, unknown>>,
    yearCats: {} as Record<string, unknown>,
    salaryCount: 0,
  },
}))

vi.mock('@/api/reports', () => ({
  getDashboard: vi.fn(() => Promise.resolve({
    data: { salary_monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, employee_count: state.salaryCount, employee_count_pending: 0 })) },
  })),
  getFinanceSummary: vi.fn((_year: number, month?: number) => {
    if (month == null) {
      return state.yearFails
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ data: { monthly_trend: state.trend, ...state.yearCats } })
    }
    return state.monthFails ? Promise.reject(new Error('boom')) : Promise.resolve({ data: state.monthData[month] ?? {} })
  }),
}))

import { getFinanceSummary } from '@/api/reports'
import FinanceSummaryPanel from '@/views/reports/FinanceSummaryPanel.vue'

const zero = (m: number) => ({ month: m, revenue: 0, refund: 0, expense: 0, net: 0 })
const NOTHING_REGISTERED: FixedCostStatus = { state: 'ok', registered: [] }

const drawerStub = {
  name: 'FinanceDetailDrawer',
  props: ['modelValue', 'year', 'month', 'initialGroup', 'totals'],
  template: '<div data-test="drawer-stub" />',
}

function mountPanel(props: Partial<{ focusMonth: number; fixedCost: FixedCostStatus }> = {}) {
  return mount(FinanceSummaryPanel, {
    props: { year: 2026, focusMonth: 9, fixedCost: NOTHING_REGISTERED, ...props },
    global: {
      plugins: [ElementPlus],
      stubs: { FinanceDetailDrawer: drawerStub, RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12))
  state.yearFails = false
  state.monthFails = false
  state.salaryCount = 0
  state.trend = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    if (m === 8) return { month: 8, revenue: 90396, refund: 0, expense: 4, net: 90392 }
    if (m === 9) return { month: 9, revenue: 1965811, refund: 23000, expense: 94, net: 1942717 }
    if (m === 12) return { month: 12, revenue: 0, refund: 0, expense: 500000, net: -500000 } // 預登錄
    return zero(m)
  })
  state.monthData = {
    9: {
      revenue_by_category: [
        { category: 'tuition', label: '學費', amount: 1965811, refund: 23000 },
        { category: 'activity', label: '才藝', amount: 0, refund: 0 },
        { category: 'misc_receipt', label: '雜項收款', amount: 0, refund: 0 },
      ],
      expense_by_category: [
        { category: 'salary_gross', label: '員工應發', amount: 0 },
        { category: 'collection_fee', label: '代收手續費', amount: 94 },
      ],
    },
    8: {
      revenue_by_category: [{ category: 'tuition', label: '學費', amount: 90396, refund: 0 }],
      expense_by_category: [{ category: 'collection_fee', label: '代收手續費', amount: 4 }],
    },
  }
  state.yearCats = {
    revenue_by_category: [{ category: 'tuition', label: '學費', amount: 2056207, refund: 23000 }],
    expense_by_category: [{ category: 'collection_fee', label: '代收手續費', amount: 98 }, { category: 'fixed_cost', label: '固定支出', amount: 500000 }],
  }
  vi.mocked(getFinanceSummary).mockClear()
})
afterEach(() => { vi.useRealTimers() })

describe('收入來源／支出去向', () => {
  it('焦點月範圍：0 元類別收成一行、退款另列', async () => {
    const w = mountPanel()
    await flushPromises()
    const rows = w.findAll('[data-test="income-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('學費')
    expect(rows[0].text()).toContain('1,965,811')
    expect(w.find('[data-test="income-zero"]').text()).toBe('才藝、雜項收款：本期皆為 0')
    expect(w.find('[data-test="refund-line"]').text()).toContain('−23,000')
    expect(w.findAll('[data-test="expense-row"]').map(r => r.text())).toEqual([expect.stringContaining('代收手續費')])
  })

  it('支出不完整時說明原因並給出路，不只寫「無支出資料」', async () => {
    const w = mountPanel()
    await flushPromises()
    const gap = w.find('[data-test="expense-gap"]')
    expect(gap.text()).toContain('固定支出 9 月未登錄')
    expect(gap.text()).toContain('薪資 9 月未封存')
    await gap.find('button').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual([{ tab: 'fixed-cost' }])
  })

  it('固定支出狀態查不到時不說「沒有支出紀錄」，改寫無法確認（審查 P2）', async () => {
    state.salaryCount = 30
    state.monthData[9] = { revenue_by_category: [], expense_by_category: [] }
    const w = mountPanel({ fixedCost: { state: 'forbidden' } })
    await flushPromises()
    expect(w.find('[data-test="expense-gap"]').exists()).toBe(false)
    expect(w.find('[data-test="expense-unknown"]').text()).toContain('固定支出登錄狀態查不到')
    expect(w.find('[data-test="expense-card"]').text()).not.toContain('沒有支出紀錄')
  })

  it('全年範圍：用年度資料、標出預登錄固定支出', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.findAll('[data-test="scope-toggle"] input')[1].setValue(true)
    await flushPromises()
    expect(w.find('[data-test="income-card"]').text()).toContain('2026 全年')
    expect(w.find('[data-test="prelogged-note"]').text()).toContain('12 月預登錄的固定支出 500,000')
  })

  it('焦點月改變會重抓該月且不殘留上個月的數字', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.setProps({ focusMonth: 8 })
    await flushPromises()
    expect(vi.mocked(getFinanceSummary)).toHaveBeenCalledWith(2026, 8)
    expect(w.find('[data-test="income-card"]').text()).toContain('90,396')
    expect(w.find('[data-test="income-card"]').text()).not.toContain('1,965,811')
  })

  it('該月資料讀取失敗只影響分類卡，表格照常', async () => {
    state.monthFails = true
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="income-card"]').text()).toContain('載入該月資料失敗')
    expect(w.find('[data-test="row-9"]').exists()).toBe(true)
  })
})

describe('每月明細', () => {
  it('上線前月份收成一行；未來月不列；有累計、狀態與合計', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="row-folded"]').text()).toContain('1–7 月')
    expect(w.find('[data-test="row-7"]').exists()).toBe(false)
    expect(w.find('[data-test="row-11"]').exists()).toBe(false)
    expect(w.find('[data-test="row-9"]').text()).toContain('2,033,109') // 累計
    expect(w.find('[data-test="status-gap-9"]').exists()).toBe(true)
    expect(w.find('[data-test="row-10"]').text()).toContain('進行中')
    expect(w.find('[data-test="row-total"]').text()).toContain('2,056,207')
  })

  it('0 元不是連結；點金額開抽屜並帶該月與組別、點月份切換焦點', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="row-8"]').findAll('button.amt')).toHaveLength(2) // 收入、支出；退款 0 非連結
    await w.find('[data-test="amt-expense-9"]').trigger('click')
    const drawer = w.findComponent({ name: 'FinanceDetailDrawer' })
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.props('month')).toBe(9)
    expect(drawer.props('initialGroup')).toBe('expense')
    expect(drawer.props('totals')).toEqual({ revenue: 1965811, refund: 23000, expense: 94 })
    await w.find('[data-test="row-8"] .mt__month').trigger('click')
    expect(w.emitted('update:focusMonth')?.[0]).toEqual([8])
  })

  it('固定支出狀態查不到的月份標「無法確認」，不標齊全', async () => {
    const w = mountPanel({ fixedCost: { state: 'error' } })
    await flushPromises()
    // 薪資已知未封存 → 仍是支出待補；固定支出查不到不會被當成完成
    expect(w.find('[data-test="row-9"]').text()).not.toContain('齊全')
  })

  it('年度資料讀取失敗：顯示錯誤與重新載入，不偽裝成 0', async () => {
    state.yearFails = true
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="finance-error"]').exists()).toBe(true)
    expect(w.find('[data-test="month-table"]').exists()).toBe(false)
  })
})

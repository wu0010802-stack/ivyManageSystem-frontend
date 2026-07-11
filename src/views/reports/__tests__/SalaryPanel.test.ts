import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

// chart 元件 stub 議題：global.stubs 對 chartSetup barrel import 無效
// （Task 10 已確認），直接 mock 底層 useChartJs 模組，給出帶 name 的同步替身元件。
// 比照 tests/unit/views/reports/ 兄弟樹既有 pattern（見 AttendancePanel.spec.js）。
vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', props: ['data', 'options'], template: '<div />' },
  BarChart: { name: 'BarChart', props: ['data', 'options'], template: '<div />' },
  PieChart: { name: 'PieChart', props: ['data', 'options'], template: '<div />' },
  RadarChart: { name: 'RadarChart', props: ['data', 'options'], template: '<div />' },
  MONTH_LABELS: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  ensureChartReady: vi.fn(),
}))

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
  it('tooltip afterBody 顯示該月獎金合計與加班費，並保留不可與應發相加警語', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'BarChart' })
    const afterBody = chart.props('options').plugins.tooltip.callbacks.afterBody
    const lines = afterBody([{ dataIndex: 4 }])
    expect(lines).toEqual([
      '獎金合計：$300,000（已計入應發總額，不可與應發相加）',
      '加班費：$20,000',
    ])
  })
  it('tooltip afterBody 對無資料月回傳空陣列', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'BarChart' })
    const afterBody = chart.props('options').plugins.tooltip.callbacks.afterBody
    expect(afterBody([{ dataIndex: 0 }])).toEqual([])
  })
})

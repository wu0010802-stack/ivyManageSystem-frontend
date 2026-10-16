/**
 * SalaryPanel.spec.js
 *
 * 2026-07-05 報表重構：獎金相關 tooltip 加註不可與應發相加（避免使用者誤將
 * 「應發+獎金」相加算成實際成本）。
 * 2026-07-11（spec §8 圖表編碼重整，Task 11）：獎金/加班不再是獨立 dataset
 * （改為 tooltip afterBody 顯示），警語隨之搬到 afterBody。
 * 2026-10-12（報表改版）：分頁改名「人事成本」、點長條改切月份焦點（不再開榜首彈窗）；
 * 本檔只保留「獎金不可與應發相加」這條不變式，其餘行為見兄弟樹
 * src/views/reports/__tests__/SalaryPanel.test.ts。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGetDashboard, mockGetFinanceSummary, mockGetSalaryContributors } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetFinanceSummary: vi.fn(),
  mockGetSalaryContributors: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  getDashboard: mockGetDashboard,
  getFinanceSummary: mockGetFinanceSummary,
  getSalaryContributors: mockGetSalaryContributors,
}))
vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', props: ['data', 'options'], template: '<div />' },
  BarChart: { name: 'BarChart', props: ['data', 'options'], template: '<div />' },
  PieChart: { name: 'PieChart', props: ['data', 'options'], template: '<div />' },
  MONTH_LABELS: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  ensureChartReady: vi.fn(),
}))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import SalaryPanel from '@/views/reports/SalaryPanel.vue'

// 後端回 12 個月密集陣列；1 月為已封存（employee_count > 0），其餘月份無薪資
const denseMonths = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  employee_count: i === 0 ? 10 : 0,
  employee_count_pending: 0,
  total_gross: i === 0 ? 100000 : 0,
  total_net: i === 0 ? 90000 : 0,
  total_bonus: i === 0 ? 5000 : 0,
  total_overtime_pay: i === 0 ? 1000 : 0,
}))

beforeEach(() => {
  // 只固定 Date（2026-07-10）：1 月才是「已過月份」，圖才會畫出來；其餘計時器維持真實
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 10))
  _resetCacheForTesting()
  mockGetDashboard.mockReset()
  mockGetFinanceSummary.mockReset()
  mockGetSalaryContributors.mockReset()
  mockGetDashboard.mockResolvedValue({ data: { salary_monthly: denseMonths } })
  mockGetFinanceSummary.mockResolvedValue({ data: { expense_by_category: [] } })
  mockGetSalaryContributors.mockResolvedValue({ data: { year: 2026, month: 1, top_gross: [], top_overtime: [] } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SalaryPanel 獎金 label 澄清', () => {
  it('只剩應發/實發兩個 dataset；tooltip afterBody 對獎金合計加註不可與應發相加', async () => {
    const w = mount(SalaryPanel, { props: { year: 2026, focusMonth: 1 } })
    await flushPromises()

    const bar = w.findComponent({ name: 'BarChart' })
    expect(bar.props('data').datasets.map(d => d.label)).toEqual(['應發總額', '實發總額'])

    // 應發/實發本身的 label callback 不應被誤加註不可相加警語
    const tooltipLabel = bar.props('options').plugins.tooltip.callbacks.label
    const grossLine = tooltipLabel({ dataset: { label: '應發總額' }, parsed: { y: 100000 } })
    expect(typeof grossLine).toBe('string')
    expect(grossLine).not.toContain('不可與應發相加')

    // 獎金合計改由 afterBody 顯示，警語隨之搬過去
    const afterBody = bar.props('options').plugins.tooltip.callbacks.afterBody
    const lines = afterBody([{ dataIndex: 0 }])
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('不可與應發相加')]))
  })
})

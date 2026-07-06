/**
 * SalaryPanel.spec.js
 *
 * 2026-07-05 報表重構：「獎金」系列 label 澄清為「獎金合計（含已計入應發之績效/
 * 特殊獎金）」，並在 tooltip 註明不可與應發相加（避免使用者誤將「應發+獎金」
 * 相加算成實際成本）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGetDashboard, mockGetFinanceSummary } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetFinanceSummary: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  getDashboard: mockGetDashboard,
  getFinanceSummary: mockGetFinanceSummary,
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

beforeEach(() => {
  _resetCacheForTesting()
  mockGetDashboard.mockReset()
  mockGetFinanceSummary.mockReset()
  mockGetDashboard.mockResolvedValue({
    data: {
      salary_monthly: [
        { month: 1, total_gross: 100000, total_net: 90000, total_bonus: 5000, total_overtime_pay: 1000 },
      ],
    },
  })
  mockGetFinanceSummary.mockResolvedValue({ data: { expense_by_category: [] } })
})

describe('SalaryPanel 獎金 label 澄清', () => {
  it('獎金資料集 label 含「不可相加」語意提示，且 tooltip 對獎金加註不可與應發相加', async () => {
    const w = mount(SalaryPanel, {
      props: { year: 2026 },
      // SalaryContributorsDialog（子元件，恆渲染但 modelValue=false 隱藏）用
      // el-table-column scoped slot；未解析時 Vue 會用 undefined 呼叫 slot function
      // 造成 destructure 崩潰，比照其他 panel 測試 stub 掉。
      global: { stubs: { ElTable: true, ElTableColumn: true } },
    })
    await flushPromises()

    const bar = w.findComponent({ name: 'BarChart' })
    const bonusDataset = bar.props('data').datasets.find(d => d.label.startsWith('獎金合計'))
    expect(bonusDataset).toBeTruthy()
    expect(bonusDataset.label).toContain('已計入應發之績效/特殊獎金')

    const tooltipLabel = bar.props('options').plugins.tooltip.callbacks.label
    const bonusLine = tooltipLabel({ dataset: { label: bonusDataset.label }, parsed: { y: 5000 } })
    expect(bonusLine).toEqual(expect.arrayContaining([expect.stringContaining('不可與應發相加')]))

    // 其他系列（應發總額）不應被誤加註
    const grossLine = tooltipLabel({ dataset: { label: '應發總額' }, parsed: { y: 100000 } })
    expect(typeof grossLine).toBe('string')
    expect(grossLine).not.toContain('不可與應發相加')
  })
})

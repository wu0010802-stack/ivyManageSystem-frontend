/**
 * SalaryPanel.spec.js
 *
 * 2026-07-05 報表重構：獎金相關 tooltip 加註不可與應發相加（避免使用者誤將
 * 「應發+獎金」相加算成實際成本）。
 * 2026-07-11（spec §8 圖表編碼重整，Task 11）：獎金/加班不再是獨立 dataset
 * （改為 tooltip afterBody 顯示），警語隨之搬到 afterBody；本檔斷言同步更新，
 * 新測試見兄弟樹 src/views/reports/__tests__/SalaryPanel.test.ts。
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
  it('只剩應發/實發兩個 dataset；tooltip afterBody 對獎金合計加註不可與應發相加', async () => {
    const w = mount(SalaryPanel, {
      props: { year: 2026 },
      // SalaryContributorsDialog（子元件，恆渲染但 modelValue=false 隱藏）用
      // el-table-column scoped slot；未解析時 Vue 會用 undefined 呼叫 slot function
      // 造成 destructure 崩潰，比照其他 panel 測試 stub 掉。
      global: { stubs: { ElTable: true, ElTableColumn: true } },
    })
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

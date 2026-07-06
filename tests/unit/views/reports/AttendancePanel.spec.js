/**
 * AttendancePanel.spec.js
 *
 * 2026-07-05 報表重構：leaveChartData 補 monthMap 防禦（原本直接 arr.map() 按
 * index 對應月份，若後端回傳非密集/非依序陣列會對錯月份，見稽核 P3-3）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGetDashboard } = vi.hoisted(() => ({ mockGetDashboard: vi.fn() }))

vi.mock('@/api/reports', () => ({ getDashboard: mockGetDashboard }))
vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', props: ['data', 'options'], template: '<div />' },
  BarChart: { name: 'BarChart', props: ['data', 'options'], template: '<div />' },
  PieChart: { name: 'PieChart', props: ['data', 'options'], template: '<div />' },
  MONTH_LABELS: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  ensureChartReady: vi.fn(),
}))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import AttendancePanel from '@/views/reports/AttendancePanel.vue'

beforeEach(() => {
  _resetCacheForTesting()
  mockGetDashboard.mockReset()
})

describe('AttendancePanel leaveChartData 依月份鍵值取值', () => {
  it('陣列非依月份遞增排序時仍對到正確月份（非按 index 取值）', async () => {
    mockGetDashboard.mockResolvedValue({
      data: {
        attendance_monthly: [],
        attendance_by_classroom: [],
        // 刻意打亂順序＋跳過月份，模擬非密集/非遞增陣列
        leave_monthly: [
          { month: 3, personal: 5, sick: 0, annual: 0, menstrual: 0, maternity: 0, paternity: 0 },
          { month: 1, personal: 1, sick: 2, annual: 0, menstrual: 0, maternity: 0, paternity: 0 },
        ],
      },
    })
    const w = mount(AttendancePanel, {
      props: { year: 2026 },
      // AttendanceDetailDialog（子元件，恆渲染但 modelValue=false 隱藏）用
      // el-table-column scoped slot；未解析時 Vue 會用 undefined 呼叫 slot function
      // 造成 destructure 崩潰，比照 FinanceSummaryPanel 測試 stub 掉。
      global: { stubs: { ElTable: true, ElTableColumn: true } },
    })
    await flushPromises()

    const bars = w.findAllComponents({ name: 'BarChart' })
    // attendance_by_classroom 為空陣列時「各班級出勤統計」BarChart 不渲染
    // （走 el-empty 分支），故唯一渲染的 BarChart 就是「請假趨勢分析」
    expect(bars.length).toBe(1)
    const leaveChart = bars[0]
    const personal = leaveChart.props('data').datasets[0].data
    const sick = leaveChart.props('data').datasets[1].data
    // index 0（1月）應為 personal=1（來源 month:1 那筆），非按陣列 index 0 取到 month:3 那筆
    expect(personal[0]).toBe(1)
    expect(sick[0]).toBe(2)
    // index 2（3月）應為 personal=5
    expect(personal[2]).toBe(5)
    // 未出現在資料中的月份（如 2 月）應為 0，不 crash
    expect(personal[1]).toBe(0)
  })
})

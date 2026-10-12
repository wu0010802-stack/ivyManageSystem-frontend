/**
 * AttendancePanel.spec.js
 *
 * 2026-07-05 報表重構：leaveChartData 補 monthMap 防禦（原本直接 arr.map() 按
 * index 對應月份，若後端回傳非密集/非依序陣列會對錯月份，見稽核 P3-3）。
 * 2026-10-12 出勤分頁改版：保留「依月份鍵值取值」不變式，並擴及新的每月出勤率圖
 * （其餘行為見 src/views/reports/__tests__/AttendancePanel.test.ts）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

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

// 用已結束的年度（2025）：cutoffMonth 恆為 12，結果不受執行當下日期影響。
async function mountWith(dashboard) {
  mockGetDashboard.mockResolvedValue({ data: dashboard })
  const w = mount(AttendancePanel, {
    props: { year: 2025, focusMonth: 1 },
    // AttendanceDetailDialog 恆渲染（modelValue=false 隱藏）且會打 API，stub 掉。
    global: { plugins: [ElementPlus], stubs: { AttendanceDetailDialog: true } },
  })
  await flushPromises()
  return w
}

describe('AttendancePanel 依月份鍵值取值（非按陣列 index）', () => {
  it('請假：陣列非依月份遞增排序時仍對到正確月份', async () => {
    const w = await mountWith({
      attendance_monthly: [],
      attendance_by_classroom: [],
      // 刻意打亂順序＋跳過月份，模擬非密集/非遞增陣列
      leave_monthly: [
        { month: 3, personal: 5, sick: 0, annual: 0, menstrual: 0, maternity: 0, paternity: 0 },
        { month: 1, personal: 1, sick: 2, annual: 0, menstrual: 0, maternity: 0, paternity: 0 },
      ],
    })

    const leaveChart = w.find('[data-test="leave-card"]').findComponent({ name: 'BarChart' })
    expect(leaveChart.exists()).toBe(true)
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

  it('出勤率：attendance_monthly 亂序且稀疏時，各月出勤率仍對到正確月份', async () => {
    const w = await mountWith({
      attendance_monthly: [
        { month: 3, total_records: 30, late: 2, early_leave: 0, missing: 0, rate: 92 },
        { month: 1, total_records: 10, late: 0, early_leave: 0, missing: 0, rate: 97 },
      ],
      attendance_by_classroom: [],
      leave_monthly: [],
    })

    const rateChart = w.find('[data-test="rate-card"]').findComponent({ name: 'BarChart' })
    expect(rateChart.exists()).toBe(true)
    const rates = rateChart.props('data').datasets[0].data
    // 1 月＝97（來源 month:1），3 月＝92（來源 month:3）；缺的月份是 null 而非 0
    expect(rates).toEqual([97, null, 92, null, null, null, null, null, null, null, null, null])
    // 異常次數表依月份遞增列出，不受來源順序影響
    const months = w.findAll('[data-test="anomaly-month"]').map(b => b.text())
    expect(months).toEqual(['1 月', '3 月'])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

// LineChart/BarChart 是從 `./chartSetup`（.ts barrel）具名 import 的
// defineAsyncComponent；<script setup> 編譯後這類純值 import 會直接綁在
// module scope（不進 setupState/_ctx），VTU 的 `global.stubs: { LineChart: true }`
// 名稱比對機制找不到它們（實測：即使是同模式的同步元件也一樣找不到，與 async 無關）。
// 比照本檔兄弟測試 tests/unit/views/reports/AttendancePanel.spec.js 的作法，
// 直接 mock 底層 useChartJs 模組，給出帶 name 的同步替身元件。
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
      // 後端補密 12 月：未來月 rate 0（懸崖來源）
      attendance_monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, rate: i < 7 ? 90 + i : 0, late: 1, early_leave: 0, missing: 0, total_records: 10,
      })),
      attendance_by_classroom: [{ classroom_id: 1, classroom: '向日葵', rate: 92 }],
      leave_monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, personal: 1, sick: 0, annual: 0 })),
    },
  }),
}))

import AttendancePanel from '@/views/reports/AttendancePanel.vue'

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10)) // cutoff=7
})

function mountPanel() {
  return mount(AttendancePanel, {
    props: { year: 2026 },
    global: { plugins: [ElementPlus], stubs: { LineChart: true, BarChart: true, AttendanceDetailDialog: true } },
  })
}

describe('出勤率截斷（spec §7）', () => {
  it('8–12 月出勤率為 null（不畫），7 月內保留原值', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'LineChart' })
    const rates = (chart.props('data') as { datasets: Array<{ data: (number | null)[] }> }).datasets[0].data
    expect(rates[6]).toBe(96)
    expect(rates[7]).toBeNull()
    expect(rates[11]).toBeNull()
  })
  it('輔助線（遲到）無 borderDash、細實線', async () => {
    const w = mountPanel()
    await flushPromises()
    const chart = w.findComponent({ name: 'LineChart' })
    const late = (chart.props('data') as { datasets: Array<Record<string, unknown>> }).datasets[1]
    expect(late.borderDash).toBeUndefined()
    expect(late.borderWidth).toBe(1.5)
  })
})

describe('版面與圖例（spec §7）', () => {
  it('門檻圖例與修正後的 filter 提示渲染於班級圖卡', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="threshold-legend"]').text()).toContain('≥95%')
    expect(w.find('[data-test="classroom-filter-hint"]').text()).toContain('只影響此圖')
    expect(w.text()).not.toContain('右下')
  })
})

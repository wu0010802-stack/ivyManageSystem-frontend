import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import { resolveTrendPalette, withAlpha } from '../trendChart'

// BarChart 是從 `@/composables/useChartJs` 具名 import 的 defineAsyncComponent；
// <script setup> 編譯後這類純值 import 會直接綁在 module scope（不進 setupState/_ctx），
// VTU 的 `global.stubs: { BarChart: true }` 名稱比對機制找不到它們。
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

const { getDashboardMock } = vi.hoisted(() => ({ getDashboardMock: vi.fn() }))
vi.mock('@/api/reports', () => ({ getDashboard: getDashboardMock }))

import AttendancePanel from '@/views/reports/AttendancePanel.vue'

interface MonthSeed { total: number; rate: number; late?: number; early?: number; missing?: number }

/**
 * 預設資料（系統時間 2026-07-10 → 2026 年 cutoff=7，7 月為進行中）：
 * - 2 月 95%（門檻邊界：好）、3 月 90%（邊界：警示）、4 月 89.9%（差）、7 月 100%
 * - 1、5、6 月沒有打卡紀錄（後端回 rate 0／total_records 0）
 * - 8 月塞一筆「未來月殘留資料」，驗證不會被畫出來
 */
function dashboardData(opts: {
  months?: Record<number, MonthSeed>
  leave?: Record<number, Record<string, number>>
} = {}) {
  const months: Record<number, MonthSeed> = opts.months ?? {
    2: { total: 20, rate: 95, late: 1 },
    3: { total: 30, rate: 90, late: 2, early: 1 },
    4: { total: 40, rate: 89.9, late: 3, early: 2, missing: 1 },
    7: { total: 12, rate: 100 },
    8: { total: 5, rate: 99 },
  }
  const leave = opts.leave ?? { 1: { personal: 2 }, 3: { sick: 1 }, 5: { annual: 1, maternity: 1 } }
  return {
    attendance_monthly: Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const s = months[m]
      return {
        month: m,
        total_records: s?.total ?? 0,
        normal: 0,
        late: s?.late ?? 0,
        early_leave: s?.early ?? 0,
        missing: s?.missing ?? 0,
        rate: s?.rate ?? 0,
      }
    }),
    attendance_by_classroom: [
      { classroom_id: 1, classroom: '向日葵', total_records: 5, rate: 100 },
      { classroom_id: 2, classroom: '小太陽', total_records: 40, rate: 96 },
      { classroom_id: 3, classroom: '星星', total_records: 10, rate: 91 },
      { classroom_id: 4, classroom: '月亮', total_records: 25, rate: 80 },
    ],
    leave_monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      personal: 0, sick: 0, annual: 0, menstrual: 0, maternity: 0, paternity: 0,
      ...(leave[i + 1] ?? {}),
    })),
  }
}

// 只 fake Date：EP 元件的 debounce／transition timer 不被凍結，flushPromises 也照常運作
afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 10)) // cutoff=7
  getDashboardMock.mockReset()
  getDashboardMock.mockResolvedValue({ data: dashboardData() })
})

async function mountPanel(props: { year?: number; focusMonth?: number } = {}) {
  const w = mount(AttendancePanel, {
    props: { year: 2026, focusMonth: 3, ...props },
    global: { plugins: [ElementPlus], stubs: { AttendanceDetailDialog: true } },
  })
  await flushPromises()
  return w
}

type Wrapper = Awaited<ReturnType<typeof mountPanel>>

interface RateOptions {
  scales: { y: { min: number; max: number; ticks: { callback: (v: number) => string } } }
  plugins: { tooltip: { callbacks: { label: (ctx: { dataIndex: number }) => string } } }
  onClick: (e: unknown, elements: Array<{ index: number }>) => void
}

function rateChart(w: Wrapper) {
  return w.find('[data-test="rate-card"]').findComponent({ name: 'BarChart' })
}

function rateDataset(w: Wrapper) {
  const data = rateChart(w).props('data') as {
    datasets: Array<{ data: (number | null)[]; backgroundColor: string[] }>
  }
  return data.datasets[0]
}

function tableRows(w: Wrapper, card: string) {
  return w.find(`[data-test="${card}"]`).findAll('.el-table__row')
}

describe('每月出勤率圖', () => {
  it('沒有打卡紀錄的月份與未來月資料為 null，不畫成 0%', async () => {
    const w = await mountPanel()
    expect(rateDataset(w).data).toEqual([null, 95, 90, 89.9, null, null, 100, null, null, null, null, null])
  })

  it('長條顏色依門檻（95 以上／90–95／低於 90），焦點月實色、其他月淡化', async () => {
    const w = await mountPanel({ focusMonth: 3 })
    const pal = resolveTrendPalette()
    const bg = rateDataset(w).backgroundColor
    // 3 月（90%＝警示邊界）是焦點：實色
    expect(bg[2]).toBe(pal.refund)
    // 2 月 95%＝好（邊界）、4 月 89.9%＝差、7 月 100%＝好；皆淡化
    expect(bg[1]).toBe(withAlpha(pal.revenue, 0.55))
    expect(bg[3]).toBe(withAlpha(pal.expense, 0.55))
    expect(bg[6]).toBe(withAlpha(pal.revenue, 0.55))

    await w.setProps({ focusMonth: 4 })
    const bg2 = rateDataset(w).backgroundColor
    expect(bg2[3]).toBe(pal.expense)
    expect(bg2[2]).toBe(withAlpha(pal.refund, 0.55))
  })

  it('Y 軸 0–100 且刻度加 %；tooltip 帶月份、出勤率與打卡筆數', async () => {
    const w = await mountPanel()
    const opts = rateChart(w).props('options') as unknown as RateOptions
    expect(opts.scales.y.min).toBe(0)
    expect(opts.scales.y.max).toBe(100)
    expect(opts.scales.y.ticks.callback(50)).toBe('50%')
    expect(opts.plugins.tooltip.callbacks.label({ dataIndex: 1 })).toBe('2 月｜出勤率 95%｜打卡 20 筆')
  })

  it('卡片標題列有文字圖例（色塊＋文字），標題不再寫「點擊長條」', async () => {
    const w = await mountPanel()
    const legend = w.find('[data-test="threshold-legend"]').text()
    expect(legend).toContain('95% 以上')
    expect(legend).toContain('90–95%')
    expect(legend).toContain('低於 90%')
    expect(w.find('[data-test="rate-card"]').text()).not.toContain('點擊')
  })

  it('點長條 emit update:focusMonth（月份為 1-based）；點空白處不 emit', async () => {
    const w = await mountPanel()
    const opts = rateChart(w).props('options') as unknown as RateOptions
    opts.onClick(null, [])
    expect(w.emitted('update:focusMonth')).toBeUndefined()
    opts.onClick(null, [{ index: 3 }])
    expect(w.emitted('update:focusMonth')).toEqual([[4]])
  })

  it('整年都沒有打卡紀錄：不畫圖，改顯示說明', async () => {
    getDashboardMock.mockResolvedValue({ data: dashboardData({ months: {} }) })
    const w = await mountPanel()
    expect(w.find('[data-test="rate-empty"]').text()).toContain('2026 年目前沒有教職員打卡紀錄。')
    expect(w.find('[data-test="rate-card"]').findComponent({ name: 'BarChart' }).exists()).toBe(false)
  })
})

describe('頂部說明與月份 tag', () => {
  it('說明資料來源與班級歸屬，且已移除班級篩選', async () => {
    const w = await mountPanel()
    const note = w.find('[data-test="panel-note"]').text()
    expect(note).toContain('依教職員打卡紀錄計算。班級為員工目前所屬班級，調班前的月份也算在現在的班。')
    expect(w.find('.el-select').exists()).toBe(false)
    expect(w.text()).not.toContain('班級篩選')
  })

  it('tag 跟著 focusMonth：有紀錄顯示筆數、沒有紀錄顯示沒有', async () => {
    const w = await mountPanel({ focusMonth: 3 })
    expect(w.find('[data-test="focus-tag"]').text()).toBe('3 月有 30 筆打卡紀錄')
    await w.setProps({ focusMonth: 5 })
    expect(w.find('[data-test="focus-tag"]').text()).toBe('5 月沒有打卡紀錄')
  })
})

describe('異常次數表', () => {
  it('只列有紀錄的月份（含進行中的本月），未來月殘留資料不列', async () => {
    const w = await mountPanel()
    const months = w.findAll('[data-test="anomaly-month"]').map(b => b.text())
    expect(months).toEqual(['2 月', '3 月', '4 月', '7 月'])
    const cells = tableRows(w, 'anomaly-card')[2].findAll('td').map(td => td.text())
    expect(cells).toEqual(['4 月', '40', '3', '2', '1', '89.9%'])
  })

  it('表末灰字列出沒有打卡紀錄的月份區間（已過或本月，不含未來月）', async () => {
    const w = await mountPanel()
    expect(w.find('[data-test="anomaly-empty-months"]').text()).toBe('1、5–6 月沒有打卡紀錄')
  })

  it('每月都有紀錄時不顯示灰字', async () => {
    const months: Record<number, MonthSeed> = {}
    for (let m = 1; m <= 7; m++) months[m] = { total: 10, rate: 97 }
    getDashboardMock.mockResolvedValue({ data: dashboardData({ months }) })
    const w = await mountPanel()
    expect(w.find('[data-test="anomaly-empty-months"]').exists()).toBe(false)
  })

  it('焦點月該列高亮，跟著 focusMonth 移動', async () => {
    const w = await mountPanel({ focusMonth: 3 })
    const focused = () => tableRows(w, 'anomaly-card').map(r => r.classes().includes('is-focus-row'))
    expect(focused()).toEqual([false, true, false, false])
    await w.setProps({ focusMonth: 4 })
    expect(focused()).toEqual([false, false, true, false])
  })

  it('點列開該月明細彈窗', async () => {
    const w = await mountPanel()
    await tableRows(w, 'anomaly-card')[1].trigger('click')
    const dialog = w.findComponent({ name: 'AttendanceDetailDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('month')).toBe(3)
    expect(dialog.props('classroomId')).toBeNull()
  })
})

describe('依所屬班級（全年）表', () => {
  it('打卡筆數不足 10 筆：不顯示百分比與長條，標示樣本不足', async () => {
    const w = await mountPanel()
    const row = tableRows(w, 'classroom-card')[0]
    expect(row.find('[data-test="classroom-insufficient"]').text()).toBe('樣本不足，不計算')
    expect(row.find('[data-test="classroom-rate-bar"]').exists()).toBe(false)
    expect(row.find('[data-test="classroom-rate-text"]').exists()).toBe(false)
    expect(row.text()).not.toContain('%')
    expect(row.find('[data-test="classroom-status"]').text()).toBe('樣本不足')
  })

  it('樣本足夠的班級：長條寬度＝出勤率，顏色與狀態文字依門檻', async () => {
    const w = await mountPanel()
    const rows = tableRows(w, 'classroom-card')
    const expected = [
      { row: 1, text: '96%', level: 'is-good', status: '95% 以上' },
      { row: 2, text: '91%', level: 'is-warn', status: '90–95%' }, // 10 筆＝剛好夠
      { row: 3, text: '80%', level: 'is-bad', status: '低於 90%' },
    ]
    for (const e of expected) {
      const bar = rows[e.row].find('[data-test="classroom-rate-bar"]')
      expect(rows[e.row].find('[data-test="classroom-rate-text"]').text()).toBe(e.text)
      expect(bar.classes()).toContain(e.level)
      expect(bar.attributes('style')).toContain(`width: ${e.text}`)
      expect(rows[e.row].find('[data-test="classroom-status"]').text()).toBe(e.status)
    }
  })

  it('表下註明沒有列出的班級＝沒有打卡紀錄', async () => {
    const w = await mountPanel()
    expect(w.find('[data-test="classroom-note"]').text()).toBe('表上沒有的班級，表示沒有教職員打卡紀錄。')
  })

  it('點列開該班明細彈窗', async () => {
    const w = await mountPanel()
    await tableRows(w, 'classroom-card')[1].trigger('click')
    const dialog = w.findComponent({ name: 'AttendanceDetailDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('month')).toBeNull()
    expect(dialog.props('classroomId')).toBe(2)
    expect(dialog.props('classroomName')).toBe('小太陽')
  })
})

describe('請假', () => {
  it('全年所有假別皆 0：只顯示一行字，不渲染圖', async () => {
    getDashboardMock.mockResolvedValue({ data: dashboardData({ leave: {} }) })
    const w = await mountPanel()
    const card = w.find('[data-test="leave-card"]')
    expect(card.find('[data-test="leave-empty"]').text()).toBe('2026 年目前沒有教職員請假紀錄。')
    expect(card.findComponent({ name: 'BarChart' }).exists()).toBe(false)
  })

  it('有請假資料才畫堆疊長條，刻度為整數、顏色不含寫死 hex', async () => {
    const w = await mountPanel()
    const card = w.find('[data-test="leave-card"]')
    expect(card.find('[data-test="leave-empty"]').exists()).toBe(false)
    const chart = card.findComponent({ name: 'BarChart' })
    expect(chart.exists()).toBe(true)
    const opts = chart.props('options') as { scales: { y: { ticks: { precision: number } } } }
    expect(opts.scales.y.ticks.precision).toBe(0)
    const data = chart.props('data') as { datasets: Array<{ label: string; data: number[] }> }
    expect(data.datasets.map(d => d.label)).toEqual(['事假', '病假', '特休', '其他'])
    expect(data.datasets[3].data[4]).toBe(1) // 5 月：產假併入「其他」
  })
})

describe('載入狀態', () => {
  it('載入中顯示 skeleton', async () => {
    getDashboardMock.mockReturnValue(new Promise(() => {}))
    const w = mount(AttendancePanel, {
      props: { year: 2026, focusMonth: 3 },
      global: { plugins: [ElementPlus], stubs: { AttendanceDetailDialog: true } },
    })
    await flushPromises()
    expect(w.find('[data-test="attendance-skeleton"]').exists()).toBe(true)
    expect(w.find('[data-test="panel-note"]').exists()).toBe(false)
  })

  it('dashboard 失敗且無快取：顯示錯誤訊息與重新載入，按下後重打並恢復畫面', async () => {
    getDashboardMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { displayMessage: '伺服器忙碌，請稍後再試' }))
    const w = await mountPanel()
    const err = w.find('[data-test="attendance-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('伺服器忙碌，請稍後再試')
    const retry = err.find('[data-test="attendance-retry"]')
    expect(retry.text()).toBe('重新載入')
    expect(w.find('[data-test="panel-note"]').exists()).toBe(false)

    await retry.trigger('click')
    await flushPromises()
    expect(getDashboardMock).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="attendance-error"]').exists()).toBe(false)
    expect(w.find('[data-test="panel-note"]').exists()).toBe(true)
  })
})

describe('樣式守衛（DESIGN.md：色彩一律 token，不寫死 hex）', () => {
  it('AttendancePanel.vue 不含 hex 色碼，也不用 em dash 當文案標點', () => {
    const src = readFileSync('src/views/reports/AttendancePanel.vue', 'utf8')
    expect(src).not.toMatch(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i)
    expect(src).not.toContain('—')
  })
})

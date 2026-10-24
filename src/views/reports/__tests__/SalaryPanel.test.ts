import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import { resolveTrendPalette, withAlpha } from '../trendChart'

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

const { getDashboard, getFinanceSummary, getSalaryContributors } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getFinanceSummary: vi.fn(),
  getSalaryContributors: vi.fn(),
}))
vi.mock('@/api/reports', () => ({ getDashboard, getFinanceSummary, getSalaryContributors }))

import SalaryPanel from '@/views/reports/SalaryPanel.vue'

interface MonthRow {
  month: number
  employee_count: number
  employee_count_pending: number
  total_gross: number
  total_net: number
  total_bonus: number
  total_overtime_pay: number
}

/** 後端回 12 個月密集陣列；overrides 以月份為 key 覆寫該月欄位。 */
function denseMonths(overrides: Record<number, Partial<MonthRow>> = {}): MonthRow[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    employee_count: 0,
    employee_count_pending: 0,
    total_gross: 0,
    total_net: 0,
    total_bonus: 0,
    total_overtime_pay: 0,
    ...overrides[i + 1],
  }))
}

// 固定今天＝2026-07-10：1–6 月為過去、7 月為本月、8–12 月為未來
const SEALED_5_6 = {
  5: { employee_count: 20, total_gross: 1200000, total_net: 1000000, total_bonus: 300000, total_overtime_pay: 20000 },
  6: { employee_count: 20, total_gross: 1100000, total_net: 950000, total_bonus: 250000, total_overtime_pay: 10000 },
}

const contributorsOf = (month: number, names: string[]) => ({
  data: {
    year: 2026,
    month,
    top_gross: names.map((n, i) => ({ employee_id: i + 1, employee_name: n, gross_salary: 90000 - i * 1000, is_finalized: true })),
    top_overtime: names.slice(0, 2).map((n, i) => ({ employee_id: i + 1, employee_name: n, overtime_pay: 8000 - i * 500, is_finalized: true })),
  },
})

function resolveDashboard(months: MonthRow[] = denseMonths(SEALED_5_6)) {
  getDashboard.mockResolvedValue({ data: { salary_monthly: months } })
}

// fake timers 用畢還原：無 afterEach 還原時，本檔收尾（auto-unmount、後續 hook）
// 仍在假時鐘下執行，EP 元件的 debounce/transition timer 掛著不走，是並行
// timeout flaky 的已知放大器（2026-08-11 測試架構稽核；比照 MonthlyFixedCostPanel）
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

beforeEach(() => {
  invalidateCachedAsync('reports/')
  getDashboard.mockReset()
  getFinanceSummary.mockReset()
  getSalaryContributors.mockReset()
  resolveDashboard()
  getFinanceSummary.mockResolvedValue({
    data: {
      expense_by_category: [
        { category: 'salary_gross', label: '員工應發', amount: 2576068 },
        { category: 'employer_benefit', label: '雇主保費+勞退', amount: 414896 },
      ],
    },
  })
  getSalaryContributors.mockImplementation((_year: number, month: number) =>
    Promise.resolve(contributorsOf(month, ['王小明', '李小華', '陳大文']))
  )
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10))
})

function mountPanel(props: Partial<{ year: number; focusMonth: number }> = {}) {
  return mount(SalaryPanel, {
    props: { year: 2026, focusMonth: 5, ...props },
    global: { plugins: [ElementPlus], stubs: { BarChart: true, 'router-link': RouterLinkStub } },
  })
}

type ChartDatasets = { datasets: Array<{ label: string; data: (number | null)[]; backgroundColor?: unknown }> }
type ChartOptionsLike = {
  onClick: (e: unknown, elements: Array<{ index: number }>) => void
  scales: { y: { ticks: { callback: (v: number | string) => string } } }
  plugins: { tooltip: { callbacks: {
    label: (ctx: unknown) => string
    afterBody: (items: Array<{ dataIndex: number }>) => string[]
  } } }
}

function chartOf(w: ReturnType<typeof mountPanel>) {
  const chart = w.findComponent({ name: 'BarChart' })
  return {
    data: chart.props('data') as unknown as ChartDatasets,
    options: chart.props('options') as unknown as ChartOptionsLike,
  }
}

describe('沒有任何封存月份：空狀態', () => {
  function mountEmpty() {
    // 3、4 月有草稿／待重算；其餘過去月（1、2、5、6）未結算；7 月是本月、8–12 月是未來，都不列
    resolveDashboard(denseMonths({ 3: { employee_count_pending: 12 }, 4: { employee_count_pending: 5 } }))
    return mountPanel()
  }

  it('不畫圖，顯示標題與說明', async () => {
    const w = mountEmpty()
    await flushPromises()
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(false)
    const empty = w.find('[data-test="salary-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('2026 年還沒有封存的薪資月份')
    expect(empty.text()).toContain('薪資結算封存後，這裡會顯示每月員工應發與實發。草稿與待重算的月份不計入，避免數字跟著試算跳動。')
  })

  it('草稿月逐月列人數；其餘已過未結算的月份合併成一個區間 chip', async () => {
    const w = mountEmpty()
    await flushPromises()
    expect(w.find('[data-test="chip-draft-3"]').text()).toBe('3 月 · 草稿 12 人')
    expect(w.find('[data-test="chip-draft-4"]').text()).toBe('4 月 · 草稿 5 人')
    expect(w.find('[data-test="chip-unsettled"]').text()).toBe('1–2、5–6 月 · 尚未結算')
    expect(w.findAll('[data-test="salary-chips"] li')).toHaveLength(3)
  })

  it('有「前往薪資結算」連到 /salary/settle', async () => {
    const w = mountEmpty()
    await flushPromises()
    const btn = w.find('[data-test="goto-settle"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('前往薪資結算')
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/salary/settle')
  })

  it('空狀態不顯示年度累計卡，也不抓前 5 名', async () => {
    const w = mountEmpty()
    await flushPromises()
    expect(w.find('[data-test="annual-card"]').exists()).toBe(false)
    expect(getSalaryContributors).not.toHaveBeenCalled()
  })
})

describe('有封存月份：每月應發與實發圖', () => {
  it('標題為「每月應發與實發」（人事成本另含雇主負擔，不同名），不再出現英文 top 5 contributors', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('每月應發與實發')
    expect(w.text()).not.toContain('contributors')
    expect(w.find('[data-test="salary-note"]').text()).toContain('已封存')
  })

  it('兩個 dataset：應發（bar）＋實發（line）；獎金／加班不是 dataset', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(chartOf(w).data.datasets.map(d => d.label)).toEqual(['應發總額', '實發總額'])
  })

  it('封存月保值；未封存（含草稿）、本月、未來月一律 null，不畫 0', async () => {
    resolveDashboard(denseMonths({
      ...SEALED_5_6,
      3: { employee_count_pending: 8 },
      7: { employee_count: 3, total_gross: 50000, total_net: 45000 }, // 本月：即使已有封存資料也不畫
    }))
    const w = mountPanel()
    await flushPromises()
    const { datasets } = chartOf(w).data
    const [gross, net] = [datasets[0].data, datasets[1].data]
    expect(gross[4]).toBe(1200000)
    expect(gross[5]).toBe(1100000)
    expect(net[4]).toBe(1000000)
    expect(net[5]).toBe(950000)
    for (const i of [0, 1, 2, 3, 6, 7, 11]) {
      expect(gross[i]).toBeNull()
      expect(net[i]).toBeNull()
    }
  })

  it('Y 軸刻度以「萬」為單位', async () => {
    const w = mountPanel()
    await flushPromises()
    const cb = chartOf(w).options.scales.y.ticks.callback
    expect(cb(500000)).toBe('50 萬')
    expect(cb(0)).toBe('0')
  })

  it('焦點月長條實色，其他月份 alpha 0.55', async () => {
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    const bg = chartOf(w).data.datasets[0].backgroundColor as string[]
    const base = resolveTrendPalette().net
    expect(bg[4]).toBe(base)
    expect(bg[5]).toBe(withAlpha(base, 0.55))
    await w.setProps({ focusMonth: 6 })
    const bg2 = chartOf(w).data.datasets[0].backgroundColor as string[]
    expect(bg2[5]).toBe(base)
    expect(bg2[4]).toBe(withAlpha(base, 0.55))
  })

  it('不再寫死 Element Plus 預設色，也沒有舊文案', () => {
    const src = readFileSync('src/views/reports/SalaryPanel.vue', 'utf8')
    expect(src).not.toMatch(/#409EFF|#67C23A/i)
    expect(src).not.toContain('kpi-blue')
    expect(src).not.toContain('園方真實支出')
    expect(src).not.toContain('SalaryContributorsDialog')
  })

  it('tooltip：label 用 NT$；afterBody 補該月獎金與加班費，並保留不可與應發相加警語', async () => {
    const w = mountPanel()
    await flushPromises()
    const { callbacks } = chartOf(w).options.plugins.tooltip
    expect(callbacks.label({ dataset: { label: '應發總額' }, parsed: { y: 1200000 } })).toBe('應發總額：NT$1,200,000')
    expect(callbacks.afterBody([{ dataIndex: 4 }])).toEqual([
      '獎金合計：NT$300,000（已計入應發總額，不可與應發相加）',
      '加班費：NT$20,000',
    ])
  })

  it('tooltip afterBody 對未封存月回傳空陣列', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(chartOf(w).options.plugins.tooltip.callbacks.afterBody([{ dataIndex: 0 }])).toEqual([])
  })

  it('點長條 emit update:focusMonth（月份＝index + 1）；點空白處不 emit', async () => {
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    const { onClick } = chartOf(w).options
    onClick({}, [{ index: 5 }])
    expect(w.emitted('update:focusMonth')).toEqual([[6]])
    onClick({}, [])
    expect(w.emitted('update:focusMonth')).toHaveLength(1)
  })
})

describe('焦點月前 5 名（內嵌）', () => {
  it('依 focusMonth 抓取並顯示應發與加班費兩張表', async () => {
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    expect(getSalaryContributors).toHaveBeenCalledTimes(1)
    expect(getSalaryContributors).toHaveBeenCalledWith(2026, 5)

    const gross = w.find('[data-test="top-gross"]')
    expect(gross.find('h4').text()).toBe('5 月應發金額前 5 名')
    const grossItems = gross.findAll('[data-test="rank-item"]')
    expect(grossItems).toHaveLength(3)
    expect(grossItems[0].text()).toContain('王小明')
    expect(grossItems[0].text()).toContain('90,000')
    expect(grossItems[0].text()).not.toContain('NT$')

    const overtime = w.find('[data-test="top-overtime"]')
    expect(overtime.find('h4').text()).toBe('5 月加班費前 5 名')
    expect(overtime.findAll('[data-test="rank-item"]')).toHaveLength(2)
    expect(overtime.text()).toContain('8,000')
  })

  it('改 focusMonth prop 會重新抓並換內容；不重抓 dashboard', async () => {
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    getSalaryContributors.mockResolvedValueOnce(contributorsOf(6, ['趙六']))
    await w.setProps({ focusMonth: 6 })
    await flushPromises()
    expect(getSalaryContributors).toHaveBeenLastCalledWith(2026, 6)
    expect(w.find('[data-test="top-gross"] h4').text()).toBe('6 月應發金額前 5 名')
    expect(w.find('[data-test="top-gross"]').text()).toContain('趙六')
    expect(w.find('[data-test="top-gross"]').text()).not.toContain('王小明')
    expect(getDashboard).toHaveBeenCalledTimes(1)
  })

  it('焦點月沒有封存薪資：顯示「尚未封存」且不發請求', async () => {
    const w = mountPanel({ focusMonth: 3 })
    await flushPromises()
    expect(w.find('[data-test="contrib-unsealed"]').text()).toBe('3 月薪資尚未封存')
    expect(w.find('[data-test="top-gross"]').exists()).toBe(false)
    expect(getSalaryContributors).not.toHaveBeenCalled()
    // 切到有封存的月份才開始抓
    await w.setProps({ focusMonth: 5 })
    await flushPromises()
    expect(getSalaryContributors).toHaveBeenCalledWith(2026, 5)
    expect(w.find('[data-test="contrib-unsealed"]').exists()).toBe(false)
  })

  it('快速切月時，晚到的舊回應被丟棄', async () => {
    let resolveSlow!: (v: unknown) => void
    getSalaryContributors.mockImplementationOnce(() => new Promise(r => { resolveSlow = r }))
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    getSalaryContributors.mockResolvedValueOnce(contributorsOf(6, ['新月份']))
    await w.setProps({ focusMonth: 6 })
    await flushPromises()
    expect(w.find('[data-test="top-gross"]').text()).toContain('新月份')

    resolveSlow(contributorsOf(5, ['舊月份']))
    await flushPromises()
    expect(w.find('[data-test="top-gross"]').text()).toContain('新月份')
    expect(w.find('[data-test="top-gross"]').text()).not.toContain('舊月份')
    expect(w.find('[data-test="top-gross"] h4').text()).toBe('6 月應發金額前 5 名')
  })

  it('抓取失敗：顯示一行錯誤文字，不跳 ElMessage', async () => {
    const toast = vi.spyOn(ElMessage, 'error')
    getSalaryContributors.mockRejectedValue(Object.assign(new Error('boom'), { displayMessage: '榜單暫時無法載入' }))
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    expect(w.find('[data-test="contrib-error"]').text()).toBe('榜單暫時無法載入')
    expect(w.find('[data-test="top-gross"]').exists()).toBe(false)
    expect(toast).not.toHaveBeenCalled()
    // 圖與年度累計不受影響
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(true)
    expect(w.find('[data-test="annual-card"]').exists()).toBe(true)
  })

  it('金額被後端遮罩（null）時顯示「未開放」而不是 0', async () => {
    getSalaryContributors.mockResolvedValue({
      data: {
        year: 2026, month: 5,
        top_gross: [{ employee_id: 1, employee_name: '王小明', gross_salary: null, is_finalized: true }],
        top_overtime: [],
      },
    })
    const w = mountPanel({ focusMonth: 5 })
    await flushPromises()
    expect(w.find('[data-test="top-gross"] [data-test="rank-item"]').text()).toContain('未開放')
    expect(w.find('[data-test="top-overtime"]').text()).toContain('5 月沒有加班費紀錄')
  })
})

describe('年度累計', () => {
  it('標題「人事成本（{year} 年累計）」，三個數字且合計＝前兩者相加', async () => {
    const w = mountPanel()
    await flushPromises()
    const card = w.find('[data-test="annual-card"]')
    expect(card.text()).toContain('人事成本（2026 年累計）')
    expect(card.text()).toContain('員工應發')
    expect(card.text()).toContain('雇主保費＋勞退')
    expect(card.text()).toContain('人事成本合計')
    expect(w.find('[data-test="annual-gross"]').text()).toBe('2,576,068')
    expect(w.find('[data-test="annual-benefit"]').text()).toBe('414,896')
    expect(w.find('[data-test="annual-total"]').text()).toBe('2,990,964') // 2,576,068 + 414,896
    expect(card.text()).not.toContain('NT$')
    expect(w.text()).not.toContain('園方真實支出')
  })

  it('年度累計抓取失敗：只在該卡顯示錯誤與重新載入，圖表照常', async () => {
    getFinanceSummary.mockRejectedValueOnce(Object.assign(new Error('boom'), { displayMessage: '累計暫時無法載入' }))
    const w = mountPanel()
    await flushPromises()
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(true)
    expect(w.find('[data-test="annual-card"]').exists()).toBe(false)
    expect(w.find('[data-test="annual-error"]').text()).toBe('累計暫時無法載入')
    await w.find('[data-test="annual-reload"]').trigger('click')
    await flushPromises()
    expect(getFinanceSummary).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="annual-total"]').text()).toBe('2,990,964')
  })
})

describe('載入與錯誤狀態', () => {
  it('載入中顯示 skeleton', async () => {
    getDashboard.mockReturnValue(new Promise(() => {}))
    const w = mountPanel()
    await flushPromises()
    expect(w.findComponent({ name: 'ElSkeleton' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(false)
  })

  it('dashboard 失敗（無快取）：顯示錯誤訊息與「重新載入」，按下重新呼叫 API', async () => {
    getDashboard.mockRejectedValueOnce(Object.assign(new Error('boom'), { displayMessage: '伺服器忙碌，請稍後再試' }))
    const w = mountPanel()
    await flushPromises()
    const err = w.find('[data-test="salary-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('伺服器忙碌，請稍後再試')
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(false)
    expect(getDashboard).toHaveBeenCalledTimes(1)

    await w.find('[data-test="salary-reload"]').trigger('click')
    await flushPromises()
    expect(getDashboard).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="salary-error"]').exists()).toBe(false)
    expect(w.findComponent({ name: 'BarChart' }).exists()).toBe(true)
  })
})

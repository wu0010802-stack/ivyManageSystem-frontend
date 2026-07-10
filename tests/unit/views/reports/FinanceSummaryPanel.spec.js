/**
 * FinanceSummaryPanel.spec.js
 *
 * 2026-07-05 報表重構：收支彙總頁補 P1 缺口（原本零測試覆蓋）。
 * 2026-07-11 報表 UI/UX 改版 Task 8：兩張 PieChart 換成 CategoryBarList（spec §5
 *   變更要點 4），下方「fixed_cost 分類渲染」描述區塊斷言隨之從 PieChart props
 *   改為 CategoryBarList 的 `[data-test="cat-row"]` 條列；MoM／錯誤視覺兩區塊
 *   行為未變，斷言原樣保留。
 *
 * 涵蓋：
 *  1. fixed_cost 新分類在支出分類條列圖正確渲染（後端 2026-07-05 修正
 *     build_finance_summary 納入固定支出後，expense_by_category 多一筆
 *     fixed_cost；前端 CategoryBarList 為泛用映射，無需改動，此測試防止未來回歸）
 *  2. MoM 錨定「所選年度內最後一個有資料的月份」（同 OverviewPanel 的修正，共用
 *     financeTrend.ts）
 *  3. API 錯誤與零值視覺區分（持久性錯誤區塊 vs 全 0 KPI）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const { mockGetFinanceSummary, mockGetFinanceSummaryDetail, mockFinanceSummaryExportUrl } = vi.hoisted(() => ({
  mockGetFinanceSummary: vi.fn(),
  mockGetFinanceSummaryDetail: vi.fn(),
  mockFinanceSummaryExportUrl: vi.fn(() => '/reports/finance-summary/export?year=2026'),
}))

vi.mock('@/api/reports', () => ({
  getFinanceSummary: mockGetFinanceSummary,
  getFinanceSummaryDetail: mockGetFinanceSummaryDetail,
  financeSummaryExportUrl: mockFinanceSummaryExportUrl,
}))

vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', props: ['data', 'options'], template: '<div class="line-chart-stub" />' },
  PieChart: { name: 'PieChart', props: ['data', 'options'], template: '<div class="pie-chart-stub" />' },
  BarChart: { name: 'BarChart', props: ['data', 'options'], template: '<div class="bar-chart-stub" />' },
  MONTH_LABELS: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
  ensureChartReady: vi.fn(),
}))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import FinanceSummaryPanel from '@/views/reports/FinanceSummaryPanel.vue'

const globalConfig = {
  components: {
    ElEmpty: defineComponent({
      name: 'ElEmpty',
      props: ['description', 'imageSize'],
      setup(props, { slots }) {
        return () => h('div', { class: 'el-empty' }, [slots.default?.() || props.description])
      },
    }),
  },
  // el-table-column 用 scoped slot `#default="{ row }"`：真實 Element Plus 元件會
  // 依 data 逐列呼叫該 slot 帶入 row；unplugin-vue-components 未接入 vitest.config.js，
  // 未 stub 時它變成未解析的原生自訂元素，Vue 仍會嘗試呼叫 slot function 但不帶參數，
  // 導致 `Cannot destructure property 'row' of undefined`。用自動 stub 略過，本測試
  // 不需要斷言表格逐列內容。
  stubs: {
    ElTable: true,
    ElTableColumn: true,
  },
}

function makeTrendRow(month, revenue, refund, expense) {
  return { month, revenue, refund, expense, net: revenue - refund - expense }
}

function mountPanel(year = 2026) {
  return mount(FinanceSummaryPanel, { props: { year }, global: globalConfig, attachTo: document.body })
}

beforeEach(() => {
  _resetCacheForTesting()
  mockGetFinanceSummary.mockReset()
  mockGetFinanceSummaryDetail.mockReset()
})

describe('FinanceSummaryPanel fixed_cost 分類渲染', () => {
  it('expense_by_category 含 fixed_cost 時，支出分類條列圖與月度明細正確帶入固定支出', async () => {
    mockGetFinanceSummary.mockResolvedValue({
      data: {
        summary: { total_revenue: 500000, total_refund: 0, net_revenue: 500000, total_expense: 400000, net_cashflow: 100000 },
        revenue_by_category: [{ category: 'tuition', label: '學費', amount: 500000, refund: 0 }],
        expense_by_category: [
          { category: 'salary_gross', label: '員工應發', amount: 200000 },
          { category: 'employer_benefit', label: '雇主保費+勞退', amount: 50000 },
          { category: 'vendor_payment', label: '廠商付款', amount: 80000 },
          { category: 'fixed_cost', label: '固定支出', amount: 70000 },
        ],
        monthly_trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)),
      },
    })
    const w = mountPanel()
    await flushPromises()

    // 收入 1 列（學費）+ 支出 4 列（員工應發/雇主保費+勞退/廠商付款/固定支出）= 5
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows.length).toBe(5)
    const rowTexts = rows.map(r => r.text())
    expect(rowTexts.some(t => t.includes('學費') && t.includes('NT$500,000'))).toBe(true)
    expect(rowTexts.some(t => t.includes('員工應發') && t.includes('NT$200,000'))).toBe(true)
    expect(rowTexts.some(t => t.includes('雇主保費+勞退') && t.includes('NT$50,000'))).toBe(true)
    expect(rowTexts.some(t => t.includes('廠商付款') && t.includes('NT$80,000'))).toBe(true)
    expect(rowTexts.some(t => t.includes('固定支出') && t.includes('NT$70,000'))).toBe(true)
  })
})

describe('FinanceSummaryPanel MoM 錨定邏輯', () => {
  it('錨定所選年度內最後一個有資料的月份，非瀏覽器當下真實月份', async () => {
    const trend = [
      makeTrendRow(1, 50000, 0, 20000),
      makeTrendRow(2, 60000, 0, 20000),
      makeTrendRow(3, 80000, 0, 20000),
      makeTrendRow(4, 100000, 0, 60000),
      makeTrendRow(5, 150000, 0, 60000),
      ...Array.from({ length: 7 }, (_, i) => makeTrendRow(i + 6, 0, 0, 0)),
    ]
    mockGetFinanceSummary.mockResolvedValue({
      data: {
        summary: { total_revenue: 440000, total_refund: 0, net_revenue: 440000, total_expense: 180000, net_cashflow: 260000 },
        revenue_by_category: [],
        expense_by_category: [],
        monthly_trend: trend,
      },
    })
    const w = mountPanel()
    await flushPromises()

    const text = w.text()
    expect(text).toContain('50.0%')
    expect(text).toContain('vs 上月')
  })
})

describe('FinanceSummaryPanel API 錯誤與零值視覺區分', () => {
  it('載入失敗且無快取時顯示持久性錯誤區塊，不偽裝成 NT$0', async () => {
    mockGetFinanceSummary.mockRejectedValue({ response: { data: { detail: '收支彙總服務異常' } } })
    const w = mountPanel()
    await flushPromises()

    expect(w.find('.finance-error').exists()).toBe(true)
    expect(w.find('.finance-error').text()).toContain('收支彙總服務異常')
    expect(w.text()).not.toContain('NT$0')
  })

  it('載入成功但 summary 全 0（真零值）時正常顯示 NT$0，非錯誤狀態', async () => {
    mockGetFinanceSummary.mockResolvedValue({
      data: {
        summary: { total_revenue: 0, total_refund: 0, net_revenue: 0, total_expense: 0, net_cashflow: 0 },
        revenue_by_category: [],
        expense_by_category: [],
        monthly_trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)),
      },
    })
    const w = mountPanel()
    await flushPromises()

    expect(w.find('.finance-error').exists()).toBe(false)
    expect(w.text()).toContain('NT$0')
  })
})

/**
 * OverviewPanel.spec.js
 *
 * 2026-07-05 報表重構：概況頁改為「經營摘要」，補 P1 缺口（原本零測試覆蓋，
 * 見 .scratch/reports-audit-2026-07-05/frontend-lineage.md §4）。
 *
 * 涵蓋：
 *  1. KPI 渲染（總收入/退款/總支出/淨現金）
 *  2. MoM 錨定「所選年度內最後一個有資料的月份」（非瀏覽器當下真實月份）
 *  3. YoY 無資料時顯示「無去年資料」，有資料時正確算出百分比
 *  4. 年度出勤率改加權平均（非算術平均）
 *  5. API 錯誤與「真零值」視覺區分（持久性錯誤區塊 vs NT$0）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const {
  mockGetDashboard, mockGetFinanceSummary, mockGetMonthlyFixedCosts, mockHasPermission,
  mockGetVendorPaymentSummary, mockGetMiscReceiptSummary,
} = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetFinanceSummary: vi.fn(),
  mockGetMonthlyFixedCosts: vi.fn(),
  mockHasPermission: vi.fn(),
  mockGetVendorPaymentSummary: vi.fn(),
  mockGetMiscReceiptSummary: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  getDashboard: mockGetDashboard,
  getFinanceSummary: mockGetFinanceSummary,
}))
vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: mockGetMonthlyFixedCosts,
}))
vi.mock('@/api/vendorPayment', () => ({
  getVendorPaymentSummary: mockGetVendorPaymentSummary,
}))
vi.mock('@/api/miscReceipt', () => ({
  getMiscReceiptSummary: mockGetMiscReceiptSummary,
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: mockHasPermission,
}))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import OverviewPanel from '@/views/reports/OverviewPanel.vue'

const REAL_YEAR = new Date().getFullYear()

function makeTrendRow(month, revenue, refund, expense) {
  return { month, revenue, refund, expense, net: revenue - refund - expense }
}

function makeFinanceFixture({ trend, summary }) {
  return {
    period: { year: REAL_YEAR - 1, month: null },
    summary,
    revenue_by_category: [],
    expense_by_category: [],
    monthly_trend: trend,
  }
}

function zeroSummary() {
  return { total_revenue: 0, total_refund: 0, net_revenue: 0, total_expense: 0, net_cashflow: 0 }
}

// 簽收 summary（/vendor-payments/summary、/misc-receipts/summary 同 shape，
// 不吃年度參數：全期間、全狀態拆桶 pending/signed）
function signoffSummary(pendingCount = 0, pendingAmount = 0) {
  return {
    total_count: pendingCount,
    total_amount: pendingAmount,
    pending_count: pendingCount,
    pending_amount: pendingAmount,
    signed_count: 0,
    signed_amount: 0,
  }
}

// 真實 ElEmpty 不會被 unplugin-vue-components 解析（vitest.config.js 未接該 plugin），
// 未 stub 時 `:description` prop 不會投影成可見文字（無 slot children 可渲染）。
// 比照 MonthlyPnLPanel.spec.js 的作法自建最小 stub。
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
}

function mountPanel(year = REAL_YEAR - 1) {
  return mount(OverviewPanel, { props: { year }, global: globalConfig, attachTo: document.body })
}

beforeEach(() => {
  _resetCacheForTesting()
  mockGetDashboard.mockReset()
  mockGetFinanceSummary.mockReset()
  mockGetMonthlyFixedCosts.mockReset()
  mockHasPermission.mockReset()
  mockGetVendorPaymentSummary.mockReset()
  mockGetMiscReceiptSummary.mockReset()
  mockHasPermission.mockReturnValue(true)
  mockGetMonthlyFixedCosts.mockResolvedValue([])
  mockGetDashboard.mockResolvedValue({ data: { attendance_monthly: [], salary_monthly: [] } })
  mockGetVendorPaymentSummary.mockResolvedValue({ data: signoffSummary() })
  mockGetMiscReceiptSummary.mockResolvedValue({ data: signoffSummary() })
})

describe('OverviewPanel KPI 渲染', () => {
  it('渲染本年總收入/退款/總支出/淨現金（KPI 主數字＝截至實際發生月的 monthly_trend 累加，2026-07-10 改版不再直讀 finance.summary）', async () => {
    // 過去年度 cutoff=12（全年皆「已過去」），12 個月均攤出與 summary 相同的全年總額，
    // 讓本測試同時涵蓋新舊口徑一致的情境（見 OverviewPanel.test.ts 覆蓋兩口徑分岔情境）。
    const trend = Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 100000, 2500, 75000))
    mockGetFinanceSummary.mockImplementation((year) => Promise.resolve({
      data: makeFinanceFixture({
        trend,
        summary: {
          total_revenue: 1200000,
          total_refund: 30000,
          net_revenue: 1170000,
          total_expense: 900000,
          net_cashflow: 270000,
        },
      }),
    }))
    const w = mountPanel()
    await flushPromises()

    expect(w.find('[data-test="kpi-total-revenue"]').text()).toContain('1,200,000')
    expect(w.find('[data-test="kpi-total-refund"]').text()).toContain('30,000')
    expect(w.find('[data-test="kpi-total-expense"]').text()).toContain('900,000')
    expect(w.find('[data-test="kpi-net-cashflow"]').text()).toContain('270,000')
    // KPI 帶下方應揭露支出組成，含固定支出/廠商付款，不含年終獎金
    expect(w.find('[data-test="kpi-band-note"]').text()).toContain('固定支出')
    expect(w.find('[data-test="kpi-band-note"]').text()).toContain('不含年終獎金')
  })
})

describe('OverviewPanel MoM 錨定邏輯', () => {
  it('錨定「所選年度內最後一個有資料的月份」，不是瀏覽器當下真實月份', async () => {
    // 4 月：revenue 100000／5 月：revenue 150000；6~12 月全 0（尚無資料）。
    // 若沿用舊 bug（錨定 new Date() 真實月份），因為真實月份的 trend 值是 0，
    // 會找不到有效 MoM；正確版本應找到「最後有資料」= 5 月，算出 5 vs 4 月的漲幅。
    const trend = [
      makeTrendRow(1, 50000, 0, 20000),
      makeTrendRow(2, 60000, 0, 20000),
      makeTrendRow(3, 80000, 0, 20000),
      makeTrendRow(4, 100000, 0, 60000),
      makeTrendRow(5, 150000, 0, 60000),
      ...Array.from({ length: 7 }, (_, i) => makeTrendRow(i + 6, 0, 0, 0)),
    ]
    mockGetFinanceSummary.mockImplementation(() => Promise.resolve({
      data: makeFinanceFixture({
        trend,
        summary: { total_revenue: 440000, total_refund: 0, net_revenue: 440000, total_expense: 180000, net_cashflow: 260000 },
      }),
    }))
    const w = mountPanel()
    await flushPromises()

    // (150000-100000)/100000*100 = +50.0%
    const momRevenue = w.find('[data-test="mom-revenue"]')
    expect(momRevenue.text()).toContain('50.0%')
    expect(momRevenue.text()).toContain('vs 上月')
    // expense 兩月皆 60000 → |Δ|<0.1% 視為持平，顯示「— 持平」而非 ↑/↓0.0%
    // （2026-07-10 KPI 卡改版：ReportKpiCard deltaKind 語意，見 financeTrend.ts）
    expect(w.find('[data-test="mom-expense"]').text()).toContain('— 持平')
  })

  it('全年皆無資料（monthly_trend 全 0）時 MoM 不顯示', async () => {
    const trend = Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0))
    mockGetFinanceSummary.mockImplementation(() => Promise.resolve({
      data: makeFinanceFixture({ trend, summary: zeroSummary() }),
    }))
    const w = mountPanel()
    await flushPromises()

    // mom 整體為 null（找不到任何有資料的月份）→ v-if 為 false，元素不渲染
    expect(w.find('[data-test="mom-revenue"]').exists()).toBe(false)
  })
})

describe('OverviewPanel YoY 對比', () => {
  it('去年資料為 0（無去年資料）時顯示「無去年資料」而非 -100%/Infinity', async () => {
    let call = 0
    mockGetFinanceSummary.mockImplementation((year) => {
      call += 1
      // 第一次呼叫是 finance（本年）；第二次是 prevYearFinance（去年）
      if (call === 1) {
        return Promise.resolve({
          data: makeFinanceFixture({
            trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 10000, 0, 5000)),
            summary: { total_revenue: 120000, total_refund: 0, net_revenue: 120000, total_expense: 60000, net_cashflow: 60000 },
          }),
        })
      }
      return Promise.resolve({
        data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
      })
    })
    const w = mountPanel()
    await flushPromises()

    const yoyRevenue = w.find('[data-test="yoy-revenue"]')
    expect(yoyRevenue.text()).toContain('無去年資料')
    expect(yoyRevenue.text()).not.toContain('-100')
    expect(yoyRevenue.text()).not.toContain('Infinity')
  })

  it('去年有資料時正確算出年增率', async () => {
    let call = 0
    mockGetFinanceSummary.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve({
          data: makeFinanceFixture({
            trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 100000, 0, 50000)),
            summary: { total_revenue: 1200000, total_refund: 0, net_revenue: 1200000, total_expense: 600000, net_cashflow: 600000 },
          }),
        })
      }
      return Promise.resolve({
        data: makeFinanceFixture({
          trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 80000, 0, 50000)),
          summary: { total_revenue: 960000, total_refund: 0, net_revenue: 960000, total_expense: 600000, net_cashflow: 360000 },
        }),
      })
    })
    const w = mountPanel()
    await flushPromises()

    // (1200000-960000)/960000*100 = 25.0%
    expect(w.find('[data-test="yoy-revenue"]').text()).toContain('25.0%')
    expect(w.find('[data-test="yoy-revenue"]').text()).toContain('vs 去年')
  })
})

describe('OverviewPanel 年度出勤率加權平均', () => {
  it('用 Σ(total_records×rate)/Σtotal_records，非月度算術平均', async () => {
    mockGetDashboard.mockResolvedValue({
      data: {
        attendance_monthly: [
          { month: 1, total_records: 10, rate: 50 },
          { month: 2, total_records: 1000, rate: 100 },
        ],
        salary_monthly: [],
      },
    })
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    const w = mountPanel()
    await flushPromises()

    // 加權：(10*50 + 1000*100) / 1010 = 99.505... → "99.5"
    // 算術平均（舊邏輯，錯誤值）會是 (50+100)/2 = "75.0"
    const rate = w.find('[data-test="attendance-rate"]').text()
    expect(rate).toContain('99.5%')
    expect(rate).not.toContain('75.0%')
  })
})

describe('OverviewPanel API 錯誤與零值視覺區分', () => {
  it('收支資料載入失敗且無快取時顯示持久性錯誤區塊，不偽裝成 NT$0', async () => {
    mockGetFinanceSummary.mockRejectedValue({ response: { data: { detail: '收支彙總服務異常' } } })
    const w = mountPanel()
    await flushPromises()

    expect(w.find('[data-test="finance-error"]').exists()).toBe(true)
    expect(w.find('[data-test="finance-error"]').text()).toContain('收支彙總服務異常')
    // 錯誤狀態下不應該渲染 KPI 卡（避免顯示偽造的 0）
    expect(w.find('[data-test="kpi-total-revenue"]').exists()).toBe(false)
  })

  it('收支資料為真零值（API 成功、summary 全 0）時正常顯示 NT$0，非錯誤狀態', async () => {
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    const w = mountPanel()
    await flushPromises()

    expect(w.find('[data-test="finance-error"]').exists()).toBe(false)
    expect(w.find('[data-test="kpi-total-revenue"]').text()).toContain('NT$0')
  })

  it('出勤/薪資資料載入失敗時，出勤率卡顯示持久性錯誤而非 KPI 帶連坐', async () => {
    mockGetDashboard.mockRejectedValue({ response: { data: { detail: '出勤服務異常' } } })
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 10000, 0, 5000)), summary: { total_revenue: 120000, total_refund: 0, net_revenue: 120000, total_expense: 60000, net_cashflow: 60000 } }),
    })
    const w = mountPanel()
    await flushPromises()

    expect(w.find('[data-test="attendance-rate-error"]').exists()).toBe(true)
    expect(w.find('[data-test="attendance-rate-error"]').text()).toContain('出勤服務異常')
    // 收支 KPI 帶不受影響，正常顯示
    expect(w.find('[data-test="kpi-total-revenue"]').exists()).toBe(true)
  })
})

describe('OverviewPanel 異常與待辦', () => {
  it('薪資未封存人數（最新月份）與固定支出未登錄月份皆顯示為待辦項', async () => {
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    mockGetDashboard.mockResolvedValue({
      data: {
        attendance_monthly: [],
        salary_monthly: [
          { month: 5, employee_count_pending: 0 },
          { month: 6, employee_count_pending: 3 },
        ],
      },
    })
    // year = REAL_YEAR - 1 → cutoff = 12；只登錄 1~11 月，12 月缺
    mockGetMonthlyFixedCosts.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({ month: i + 1, category: 'rent', amount: 10000 }))
    )
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    const text = w.find('[data-test="todo-list"]').text()
    expect(text).toContain('6 月尚有 3 筆薪資未封存')
    expect(text).toContain('12 月固定支出尚未登錄')
    expect(w.find('[data-test="todo-empty"]').exists()).toBe(false)
  })

  it('無異常待辦時顯示「目前無異常待辦」', async () => {
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    mockGetDashboard.mockResolvedValue({ data: { attendance_monthly: [], salary_monthly: [] } })
    mockGetMonthlyFixedCosts.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ month: i + 1, category: 'rent', amount: 10000 }))
    )
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    expect(w.find('[data-test="todo-empty"]').exists()).toBe(true)
  })

  it('無 VENDOR_PAYMENT_READ 權限時略過固定支出檢查，不呼叫 API、不報錯', async () => {
    mockHasPermission.mockReturnValue(false)
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    expect(mockGetMonthlyFixedCosts).not.toHaveBeenCalled()
    expect(w.find('[data-test="todo-empty"]').exists()).toBe(true)
  })
})

describe('OverviewPanel 待簽收數字（vendor/misc summary）', () => {
  // 讓固定支出/薪資無待辦，聚焦簽收項斷言
  function mockNoOtherTodos() {
    mockGetFinanceSummary.mockResolvedValue({
      data: makeFinanceFixture({ trend: Array.from({ length: 12 }, (_, i) => makeTrendRow(i + 1, 0, 0, 0)), summary: zeroSummary() }),
    })
    mockGetMonthlyFixedCosts.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ month: i + 1, category: 'rent', amount: 10000 }))
    )
  }

  it('pending > 0 時顯示「目前 N 筆…待簽收（NT$X）」並保留收支簽收連結', async () => {
    mockNoOtherTodos()
    mockGetVendorPaymentSummary.mockResolvedValue({ data: signoffSummary(3, 4500) })
    mockGetMiscReceiptSummary.mockResolvedValue({ data: signoffSummary(2, 800) })
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    const vendorItem = w.find('[data-test="todo-item-vendor-pending"]')
    expect(vendorItem.exists()).toBe(true)
    // 「目前」冠詞：summary 不吃年度參數（全期間），避免被誤讀為所選年度的數字
    expect(vendorItem.text()).toContain('目前 3 筆廠商付款待簽收')
    expect(vendorItem.text()).toContain('NT$4,500')

    const miscItem = w.find('[data-test="todo-item-misc-pending"]')
    expect(miscItem.exists()).toBe(true)
    expect(miscItem.text()).toContain('目前 2 筆雜項收款待簽收')
    expect(miscItem.text()).toContain('NT$800')

    // 導向 /finance-signoffs 的連結保留
    expect(w.find('[data-test="todo-signoff-link"]').exists()).toBe(true)
    expect(w.find('[data-test="todo-empty"]').exists()).toBe(false)
    // summary 不吃年度參數：呼叫時不應傳 year
    expect(mockGetVendorPaymentSummary).toHaveBeenCalledWith()
    expect(mockGetMiscReceiptSummary).toHaveBeenCalledWith()
  })

  it('無 MISC_RECEIPT_READ 權限時不呼叫 misc summary、該項不顯示（不顯示 0 假資料），vendor 項不受影響', async () => {
    mockHasPermission.mockImplementation((name) => name !== 'MISC_RECEIPT_READ')
    mockNoOtherTodos()
    mockGetVendorPaymentSummary.mockResolvedValue({ data: signoffSummary(3, 4500) })
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    expect(mockGetMiscReceiptSummary).not.toHaveBeenCalled()
    expect(w.find('[data-test="todo-item-misc-pending"]').exists()).toBe(false)
    expect(w.text()).not.toContain('雜項收款待簽收')
    // vendor 有權限且有 pending，照常顯示
    expect(w.find('[data-test="todo-item-vendor-pending"]').text()).toContain('3 筆廠商付款待簽收')
  })

  it('summary API 失敗時該項不顯示（不偽裝 0 筆），連結退為中性導覽', async () => {
    mockNoOtherTodos()
    mockGetVendorPaymentSummary.mockRejectedValue(new Error('boom'))
    mockGetMiscReceiptSummary.mockResolvedValue({ data: signoffSummary(0, 0) })
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    expect(w.find('[data-test="todo-item-vendor-pending"]').exists()).toBe(false)
    expect(w.text()).not.toContain('廠商付款待簽收')
    expect(w.text()).not.toContain('0 筆')
    // 其他來源皆無待辦 → 顯示無異常；vendor 狀態未知 → 保留中性連結（不能宣稱無待辦）
    expect(w.find('[data-test="todo-empty"]').exists()).toBe(true)
    const link = w.find('[data-test="todo-signoff-link"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('收支簽收')
  })

  it('兩來源皆確知 0 筆待簽收時省略簽收連結（無事可辦）', async () => {
    mockNoOtherTodos()
    // beforeEach 預設兩 summary 皆 pending 0
    const w = mountPanel(REAL_YEAR - 1)
    await flushPromises()

    expect(w.find('[data-test="todo-empty"]').exists()).toBe(true)
    expect(w.find('[data-test="todo-signoff-link"]').exists()).toBe(false)
  })
})

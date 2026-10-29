import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// mock getUserInfo（ReportsView 需要）
const hasPermissionMock = vi.fn((_code: string) => true)
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ display_name: '測試管理員', username: 'admin' }),
  hasPermission: (code: string) => hasPermissionMock(code),
}))

// URL 同步：useRoute/useRouter mock（hash router 不進 jsdom）
const routeQuery = ref<Record<string, string>>({})
const replaceMock = vi.fn()
const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

// 「資料截至」badge：ReportsView 自己呼叫 getFinanceSummary（panel 全 stub 所以只有這裡會打到）
// wrapper 延遲呼叫外層 mock（同 confirmMock 模式），讓個別測試能控制解析時序（競態回歸測試用）
const financeSummaryMock = vi.fn()
vi.mock('@/api/reports', () => ({
  getFinanceSummary: (...a: unknown[]) => financeSummaryMock(...a),
  financeSummaryExportUrl: (y: number, m?: number | null) => `/reports/finance-summary/export?year=${y}${m ? `&month=${m}` : ''}`,
  monthlyPnlExportUrl: (y: number) => `/reports/monthly-pnl/export?year=${y}`,
}))
const fixedCostsMock = vi.fn()
vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: (...a: unknown[]) => fixedCostsMock(...a),
}))
const downloadMock = vi.fn()
vi.mock('@/utils/download', () => ({
  downloadFile: (...a: unknown[]) => downloadMock(...a),
}))

function twoMonthTrendResp() {
  return {
    data: {
      monthly_trend: [
        { month: 1, revenue: 100, refund: 0, expense: 50, net: 50 },
        { month: 2, revenue: 100, refund: 0, expense: 50, net: 50 },
      ],
    },
  }
}

import ReportsView from '@/views/ReportsView.vue'

// Vue 3 script setup + defineExpose：透過 vm（exposeProxy）存取時 ref 會自動 unwrap
// 所以 vm.selectedYear 是 number、vm.activeTab 是 string；賦值時同樣直接賦 primitive
// 函式（onYearChange）透過 exposeProxy 拿到原始 function，不 unwrap
type ExposedVm = {
  selectedYear: number
  selectedMonth: number | null
  focusMonth: number
  setFocusMonth: (m: number) => void
  onExport: (kind: 'finance-year' | 'finance-month' | 'pnl') => Promise<void>
  activeTab: string
  onYearChange: (y: number) => void | Promise<void>
}

beforeEach(() => {
  routeQuery.value = {}
  replaceMock.mockReset()
  pushMock.mockReset()
  hasPermissionMock.mockReset()
  hasPermissionMock.mockReturnValue(true)
  financeSummaryMock.mockReset()
  financeSummaryMock.mockResolvedValue(twoMonthTrendResp())
  fixedCostsMock.mockReset()
  fixedCostsMock.mockResolvedValue([])
  downloadMock.mockReset()
  downloadMock.mockResolvedValue(undefined)
})

function mountView() {
  return mount(ReportsView, {
    global: {
      stubs: {
        OverviewPanel: true,
        FinanceSummaryPanel: true,
        MonthlyPnLPanel: true,
        AttendancePanel: true,
        SalaryPanel: true,
        ReportNotesDrawer: true,
        // Element Plus 元件也 stub（el-tabs/el-select/el-option/el-tab-pane）
        ElSelect: { template: '<div><slot /></div>', props: ['modelValue'], emits: ['change'] },
        ElOption: true,
        ElTabs: { name: 'ElTabs', template: '<div><slot /></div>', props: ['modelValue', 'type'], emits: ['update:modelValue'] },
        // 顯式 name（findAllComponents({name:...}) 依此比對，stub key 本身不會自動當 name）
        ElTabPane: { name: 'ElTabPane', template: '<div><slot name="label" /><slot /></div>', props: ['label', 'name'] },
      },
    },
    attachTo: document.body,
  })
}

describe('固定支出登錄只留收付款管理（後台 IA 重整 M2）', () => {
  it('報表頁沒有「固定支出登錄」頁籤，也沒有它的 MonthlyFixedCostPanel', () => {
    const w = mountView()
    const names = w.findAllComponents({ name: 'ElTabPane' }).map(p => p.props('name'))
    expect(names).not.toContain('fixed-cost')
    expect(w.findComponent({ name: 'MonthlyFixedCostPanel' }).exists()).toBe(false)
  })

  it('?tab=fixed-cost（無 VENDOR_PAYMENT_READ 時 router 不導走）fallback 到總覽', () => {
    routeQuery.value = { tab: 'fixed-cost' }
    const w = mountView()
    expect((w.vm as unknown as ExposedVm).activeTab).toBe('overview')
  })

  it('有收付款權限：頁首出現前往連結，點擊帶年度到 /finance-signoffs?tab=fixed-cost', async () => {
    routeQuery.value = { year: '2020' }
    const w = mountView()
    await flushPromises()
    await w.find('[data-test="goto-fixed-cost"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      path: '/finance-signoffs',
      query: { tab: 'fixed-cost', year: '2020' },
    })
  })

  it('使用者選過月份：連結一併帶 month', async () => {
    routeQuery.value = { year: '2020', month: '4' }
    const w = mountView()
    await flushPromises()
    await w.find('[data-test="goto-fixed-cost"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      path: '/finance-signoffs',
      query: { tab: 'fixed-cost', year: '2020', month: '4' },
    })
  })

  it('沒有 VENDOR_PAYMENT_READ：不顯示前往連結', async () => {
    hasPermissionMock.mockImplementation((code: string) => code !== 'VENDOR_PAYMENT_READ')
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="goto-fixed-cost"]').exists()).toBe(false)
  })

  it('總覽／收支分析的「登錄」按鈕（navigate fixed-cost）改導到收付款管理並帶指定月份', async () => {
    routeQuery.value = { year: '2020', month: '9' }
    const w = mountView()
    await flushPromises()
    w.findComponent({ name: 'OverviewPanel' }).vm.$emit('navigate', { tab: 'fixed-cost', month: 3 })
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({
      path: '/finance-signoffs',
      query: { tab: 'fixed-cost', year: '2020', month: '3' },
    })
    // 不得因此切走報表頁籤
    expect((w.vm as unknown as ExposedVm).activeTab).toBe('overview')
  })

  it('換年度不再有離開保護：直接生效、不彈 confirm', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    const currentYear = new Date().getFullYear()
    await vm.onYearChange(currentYear - 1)
    await flushPromises()
    expect(vm.selectedYear).toBe(currentYear - 1)
  })
})

describe('ReportsView 頁籤正名（2026-07-10 spec §3：tab 標籤簡化為「現金收支表」，面板內主標題維持全名）', () => {
  it('monthly-pnl 頁籤 label 已簡化為「現金收支表」', () => {
    const w = mountView()
    const pane = w.findAllComponents({ name: 'ElTabPane' })
      .find(p => p.props('name') === 'monthly-pnl')
    expect(pane?.props('label')).toBe('現金收支表')
    expect(pane?.props('label')).not.toBe('月度損益表')
    expect(pane?.props('label')).not.toBe('月度現金收支表')
  })
})

describe('URL query 同步（spec §3）', () => {
  it('query 有效值還原 tab 與 year', () => {
    routeQuery.value = { tab: 'finance', year: '2025' }
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.activeTab).toBe('finance')
    expect(vm.selectedYear).toBe(2025)
  })
  it('query 無效值 fallback 預設（overview / 當年）', () => {
    routeQuery.value = { tab: 'bogus', year: 'abc' }
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.activeTab).toBe('overview')
    expect(vm.selectedYear).toBe(new Date().getFullYear())
  })
  it('tab 切換以 router.replace 寫回 query（不塞 history）', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm
    vm.activeTab = 'salary'
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ tab: 'salary' }) }),
    )
  })
})

describe('分頁改名與順序（2026-10-12 改版 Q2；tab key 不變，舊網址可用；2026-10-29 M2 移除固定支出登錄頁籤）', () => {
  it('總覽 → 收支分析 → 現金收支表 → 人事成本 → 教職員出勤', () => {
    const w = mountView()
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map(p => p.props('name'))).toEqual(
      ['overview', 'finance', 'monthly-pnl', 'salary', 'attendance'],
    )
    expect(panes.map(p => p.props('label'))).toEqual(
      ['總覽', '收支分析', '現金收支表', '人事成本', '教職員出勤'],
    )
  })

  it('前往登錄連結顯示截止月以內的未登錄月數', async () => {
    routeQuery.value = { year: '2020' } // 過去年 → 截止月 12
    fixedCostsMock.mockResolvedValue([
      { month: 1, category: 'rent', amount: 500000 },
      { month: 2, category: 'rent', amount: 500000 },
      { month: 3, category: 'rent', amount: 0 }, // 金額 0 不算登錄
    ])
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="fixed-cost-missing-count"]').text()).toBe('10')
  })
})

describe('月份焦點（2026-10-12 改版 Q1）', () => {
  it('URL 有 month 就用，並寫回 query', async () => {
    routeQuery.value = { year: '2020', month: '3' }
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.focusMonth).toBe(3)
    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ month: '3' }) })
  })

  it('沒指定時跟著預設（最近完整月），不寫進網址', async () => {
    routeQuery.value = { year: '2020' } // 過去年、mock 只有 1–2 月資料 → 預設 2 月
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm
    expect(vm.focusMonth).toBe(2)
    const last = replaceMock.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
    expect(last.query.month).toBeUndefined()
  })

  it('換年度回到該年的預設月份', async () => {
    routeQuery.value = { year: '2020', month: '7' }
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm
    await vm.onYearChange(2021)
    await flushPromises()
    expect(vm.selectedMonth).toBeNull()
  })

  it('無效月份忽略', async () => {
    routeQuery.value = { year: '2020', month: '13' }
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm
    vm.setFocusMonth(0)
    expect(vm.selectedMonth).toBeNull()
  })
})

describe('匯出集中在頁首', () => {
  it('收支彙總（焦點月含明細）／全年／現金收支表各自帶對的網址與檔名', async () => {
    routeQuery.value = { year: '2020', month: '9' }
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm
    await vm.onExport('finance-month')
    await vm.onExport('finance-year')
    await vm.onExport('pnl')
    expect(downloadMock.mock.calls).toEqual([
      ['/reports/finance-summary/export?year=2020&month=9', '收支彙總_2020-09.xlsx'],
      ['/reports/finance-summary/export?year=2020', '收支彙總_2020-全年.xlsx'],
      ['/reports/monthly-pnl/export?year=2020', '現金收支表_2020.xlsx'],
    ])
  })
})

describe('資料截至 badge', () => {
  it('檢視過去年顯示「全年」', async () => {
    routeQuery.value = { year: '2020' } // 相對測試當下必為過去年
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="data-cutoff-badge"]').text()).toContain('全年')
  })

  it('有資料的今年顯示「資料截至 N 月」', async () => {
    routeQuery.value = { year: String(new Date().getFullYear()) }
    const w = mountView()
    await flushPromises()
    // mock trend 有 1、2 月資料；N = min(2, 當前真實月) 隨測試執行月份而異，用 regex 斷言格式
    expect(w.find('[data-test="data-cutoff-badge"]').text()).toMatch(/資料截至 \d+ 月/)
  })

  it('年度快速切換時，晚到的舊年度 response 不覆蓋 badge（stale guard 競態回歸）', async () => {
    const currentYear = new Date().getFullYear()
    // 初始 mount 用過去年，初始 fetch 走預設 mock 立即落定
    routeQuery.value = { year: '2020' }
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as ExposedVm

    // 佈署兩個 deferred：先切的舊年度 response 晚到、後切的現年 response 先到
    let resolveOld: ((v: unknown) => void) | undefined
    let resolveNew: ((v: unknown) => void) | undefined
    financeSummaryMock.mockImplementationOnce(
      () => new Promise((res) => { resolveOld = res }),
    )
    financeSummaryMock.mockImplementationOnce(
      () => new Promise((res) => { resolveNew = res }),
    )

    vm.selectedYear = 2021 // 觸發 fetch(2021) → pending
    await flushPromises()
    vm.selectedYear = currentYear // 觸發 fetch(currentYear) → pending
    await flushPromises()

    // 現年 response 先到：無資料 → 「尚無資料」
    resolveNew?.({ data: { monthly_trend: [] } })
    await flushPromises()
    expect(w.find('[data-test="data-cutoff-badge"]').text()).toContain('尚無資料')

    // 舊年度(2021) response 晚到（有 2 個月資料）：不得覆蓋現年 badge
    resolveOld?.(twoMonthTrendResp())
    await flushPromises()
    const badgeText = w.find('[data-test="data-cutoff-badge"]').text()
    expect(badgeText).toContain('尚無資料')
    expect(badgeText).not.toMatch(/資料截至/)
  })
})

describe('頁首說明列', () => {
  it('寫出口徑（含年終撥款與代收手續費）並提供口徑說明入口', async () => {
    const w = mountView()
    await flushPromises()
    const sub = w.find('.reports-sub').text()
    expect(sub).toContain('現金收付實現制')
    expect(sub).toContain('年終撥款')
    expect(sub).toContain('代收手續費')
    expect(sub).not.toContain('不含年終') // 舊版文案與後端口徑矛盾（年終自 2026-07-09 起已計入）
    expect(w.find('[data-test="open-notes"]').exists()).toBe(true)
  })
})

describe('月份預設值算出前不渲染依賴焦點的分頁（審查 P3：避免先打一輪本月再跳回）', () => {
  it('網址沒指定月份：截止月回來前不掛總覽，回來後才掛', async () => {
    let resolve: ((v: unknown) => void) | undefined
    financeSummaryMock.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    routeQuery.value = { year: '2020' }
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'OverviewPanel' }).exists()).toBe(false)
    expect(w.find('[data-test="period-loading"]').exists()).toBe(true)
    resolve?.(twoMonthTrendResp())
    await flushPromises()
    expect(w.findComponent({ name: 'OverviewPanel' }).exists()).toBe(true)
  })

  it('網址已指定月份：不必等', async () => {
    financeSummaryMock.mockImplementationOnce(() => new Promise(() => {}))
    routeQuery.value = { year: '2020', month: '5' }
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'OverviewPanel' }).exists()).toBe(true)
  })
})

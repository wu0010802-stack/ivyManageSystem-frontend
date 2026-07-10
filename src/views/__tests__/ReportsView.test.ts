import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// mock getUserInfo（ReportsView 需要）
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ display_name: '測試管理員', username: 'admin' }),
  hasPermission: () => true,
}))

// mock ElMessageBox.confirm
const confirmMock = vi.fn()
vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    ElMessageBox: {
      ...((actual.ElMessageBox as object) ?? {}),
      confirm: (...a: unknown[]) => confirmMock(...a),
    },
  }
})

// URL 同步：useRoute/useRouter mock（hash router 不進 jsdom）
const routeQuery = ref<Record<string, string>>({})
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock }),
}))

// 「資料截至」badge：ReportsView 自己呼叫 getFinanceSummary（panel 全 stub 所以只有這裡會打到）
// wrapper 延遲呼叫外層 mock（同 confirmMock 模式），讓個別測試能控制解析時序（競態回歸測試用）
const financeSummaryMock = vi.fn()
vi.mock('@/api/reports', () => ({
  getFinanceSummary: (...a: unknown[]) => financeSummaryMock(...a),
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

// 把各 panel 換成輕量 stub，只讓 fixed-cost stub 能 emit update:dirty
import ReportsView from '@/views/ReportsView.vue'

// Vue 3 script setup + defineExpose：透過 vm（exposeProxy）存取時 ref 會自動 unwrap
// 所以 vm.selectedYear 是 number、vm.activeTab 是 string；賦值時同樣直接賦 primitive
// 函式（onYearChange, onTabBeforeLeave）透過 exposeProxy 拿到原始 function，不 unwrap
type ExposedVm = {
  selectedYear: number
  activeTab: string
  fixedCostDirty: boolean
  onYearChange: (y: number) => Promise<void>
  onTabBeforeLeave: (activeName: string | number, oldName: string | number) => Promise<boolean>
}

beforeEach(() => {
  confirmMock.mockReset()
  routeQuery.value = {}
  replaceMock.mockReset()
  financeSummaryMock.mockReset()
  financeSummaryMock.mockResolvedValue(twoMonthTrendResp())
})

function mountView() {
  return mount(ReportsView, {
    global: {
      stubs: {
        MonthlyFixedCostPanel: {
          template:
            '<div data-test="fc-stub"><button data-test="make-dirty" @click="$emit(\'update:dirty\', true)">d</button></div>',
          emits: ['update:dirty'],
        },
        OverviewPanel: true,
        FinanceSummaryPanel: true,
        MonthlyPnLPanel: true,
        AttendancePanel: true,
        SalaryPanel: true,
        // Element Plus 元件也 stub（el-tabs/el-select/el-option/el-tab-pane）
        ElSelect: { template: '<div><slot /></div>', props: ['modelValue'], emits: ['change'] },
        ElOption: true,
        ElTabs: { name: 'ElTabs', template: '<div><slot /></div>', props: ['modelValue', 'type', 'beforeLeave'], emits: ['update:modelValue'] },
        // 顯式 name（findAllComponents({name:...}) 依此比對，stub key 本身不會自動當 name）
        ElTabPane: { name: 'ElTabPane', template: '<div><slot /></div>', props: ['label', 'name'] },
      },
    },
    attachTo: document.body,
  })
}

describe('ReportsView 固定費用未存攔截', () => {
  it('非 fixed-cost tab 時換年度不彈 confirm，且 selectedYear 立即變更', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    // 預設 activeTab = 'overview'，fixedCostDirty = false
    expect(vm.activeTab).toBe('overview')
    expect(vm.fixedCostDirty).toBe(false)

    confirmMock.mockResolvedValue('confirm')

    const currentYear = new Date().getFullYear()
    await vm.onYearChange(currentYear - 1)
    await flushPromises()

    // confirm 不應被呼叫（未在 fixed-cost tab）
    expect(confirmMock).not.toHaveBeenCalled()
    // 年度應已變更
    expect(vm.selectedYear).toBe(currentYear - 1)
  })

  it('fixed-cost dirty 時換年度跳 confirm；取消則年度不變', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    const currentYear = new Date().getFullYear()

    // 切到 fixed-cost tab（直接設 activeTab）
    vm.activeTab = 'fixed-cost'
    await flushPromises()

    // 讓 stub emit update:dirty = true（點按鈕觸發 emit）
    const dirtyBtn = w.find('[data-test="make-dirty"]')
    await dirtyBtn.trigger('click')
    await flushPromises()

    // 確認 fixedCostDirty 已被記錄
    expect(vm.fixedCostDirty).toBe(true)

    // 模擬 confirm 被取消（reject）
    confirmMock.mockRejectedValue('cancel')

    await vm.onYearChange(currentYear - 1)
    await flushPromises()

    // confirm 應被呼叫一次
    expect(confirmMock).toHaveBeenCalledTimes(1)
    // 年度不應改變（取消）
    expect(vm.selectedYear).toBe(currentYear)
  })

  it('fixed-cost dirty 時換年度跳 confirm；確認則年度改變', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    const currentYear = new Date().getFullYear()

    // 切到 fixed-cost tab
    vm.activeTab = 'fixed-cost'
    await flushPromises()

    // 讓 stub emit update:dirty = true
    const dirtyBtn = w.find('[data-test="make-dirty"]')
    await dirtyBtn.trigger('click')
    await flushPromises()

    // 確認 fixedCostDirty 已被記錄
    expect(vm.fixedCostDirty).toBe(true)

    // 模擬 confirm 通過（resolve）
    confirmMock.mockResolvedValue('confirm')

    await vm.onYearChange(currentYear - 1)
    await flushPromises()

    // confirm 應被呼叫一次
    expect(confirmMock).toHaveBeenCalledTimes(1)
    // 年度應已改變
    expect(vm.selectedYear).toBe(currentYear - 1)
  })

  it('fixed-cost dirty 時切離 tab，onTabBeforeLeave 取消回傳 false 阻止切換', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    // 切到 fixed-cost tab
    vm.activeTab = 'fixed-cost'
    await flushPromises()

    // 讓 stub emit update:dirty = true
    const dirtyBtn = w.find('[data-test="make-dirty"]')
    await dirtyBtn.trigger('click')
    await flushPromises()

    expect(vm.fixedCostDirty).toBe(true)

    // 取消 confirm（用戶選擇留在此頁）
    confirmMock.mockRejectedValue('cancel')

    const result = await vm.onTabBeforeLeave('overview', 'fixed-cost')

    // 阻止切換
    expect(result).toBe(false)
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it('fixed-cost dirty 時切離 tab，confirm 通過則 onTabBeforeLeave 回傳 true', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    vm.activeTab = 'fixed-cost'
    await flushPromises()

    const dirtyBtn = w.find('[data-test="make-dirty"]')
    await dirtyBtn.trigger('click')
    await flushPromises()

    expect(vm.fixedCostDirty).toBe(true)

    confirmMock.mockResolvedValue('confirm')

    const result = await vm.onTabBeforeLeave('overview', 'fixed-cost')

    // 允許切換
    expect(result).toBe(true)
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it('非 fixed-cost tab 切換時 onTabBeforeLeave 直接回傳 true，不呼叫 confirm', async () => {
    const w = mountView()
    const vm = w.vm as unknown as ExposedVm

    // 從 overview 切到 finance（old=overview，非 fixed-cost）
    const result = await vm.onTabBeforeLeave('finance', 'overview')
    expect(result).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
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

describe('tab 重組（spec §3）', () => {
  it('tab 順序：overview → finance → monthly-pnl → attendance → salary → fixed-cost（登錄殿後）', () => {
    const w = mountView()
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map(p => p.props('name'))).toEqual(
      ['overview', 'finance', 'monthly-pnl', 'attendance', 'salary', 'fixed-cost'],
    )
    expect(panes[0].props('label')).toBe('經營總覽')
    expect(panes[2].props('label')).toBe('現金收支表')
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

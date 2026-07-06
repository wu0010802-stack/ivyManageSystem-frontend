import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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

describe('ReportsView 頁籤正名（2026-07-05 owner 裁定①：月度損益表 → 月度現金收支表）', () => {
  it('monthly-pnl 頁籤 label 已改為「月度現金收支表」', () => {
    const w = mountView()
    const pane = w.findAllComponents({ name: 'ElTabPane' })
      .find(p => p.props('name') === 'monthly-pnl')
    expect(pane?.props('label')).toBe('月度現金收支表')
    expect(pane?.props('label')).not.toBe('月度損益表')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import EmployeeListView from '@/views/EmployeeListView.vue'

const employeeStore = {
  employees: [],
  fetchEmployees: vi.fn(() => Promise.resolve()),
}

const mockDeleteEmployee = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  updateEmployeeBasic: vi.fn(() => Promise.resolve({ data: {} })),
  updateEmployeeSalary: vi.fn(() => Promise.resolve({ data: {} })),
  resetPunchPin: vi.fn(() => Promise.resolve({ data: {} })),
  deleteEmployee: (...args) => mockDeleteEmployee(...args),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => employeeStore,
}))

vi.mock('@/composables', () => ({
  // EmployeeListView 改用序列化搜尋 composable（避免 out-of-order 舊回應覆蓋）；
  // result 預設 null 讓 filteredEmployees 回退到 employeeStore.employees。
  useLatestSearch: () => ({
    result: ref(null),
    search: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

// EmployeeListView onMounted 讀 route.query.search（全域搜尋導航帶入）、goDetail 用 router.push；
// 測試未裝 router plugin，需 mock 兩者否則 route/router 為 undefined 拋 TypeError。
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mockPush }),
}))

import { ElMessageBox } from 'element-plus'

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// EP 元件以最小 stub 原地渲染；EmployeeFormDialog / OffboardingModal / AdminListCards 為子元件，
// stub 掉避免拉進其 onMounted 依賴（getPositionSalary / useFormDraft 等）。
const stubs = {
  EmptyState: true,
  TableSkeleton: true,
  AdminListCards: true,
  EmployeeFormDialog: true,
  OffboardingModal: true,
  Plus: true,
  Search: true,
  ArrowDown: true,
  'el-input': { template: '<input />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': true,
  'el-card': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
}

const mountView = () =>
  mount(EmployeeListView, {
    global: { directives: { loading: () => {} }, stubs },
  })

describe('EmployeeListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    employeeStore.employees = []
  })

  it('onMounted honors store TTL by calling fetchEmployees(false)', async () => {
    mountView()
    await flushPromises()
    await nextTick()

    expect(employeeStore.fetchEmployees).toHaveBeenCalledTimes(1)
    expect(employeeStore.fetchEmployees).toHaveBeenCalledWith(false)
  })

  it('status filter narrows displayed rows while rosterStats counts the full roster', async () => {
    // active / pending(未來離職日) / resigned 各一
    employeeStore.employees = [
      { id: 1, name: 'A', is_active: true, resign_date: null },
      { id: 2, name: 'B', is_active: true, resign_date: '2999-01-01' },
      { id: 3, name: 'C', is_active: false, resign_date: '2020-01-01' },
    ]
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    // rosterStats 永遠以整份名冊計數，不受狀態篩選影響
    expect(wrapper.vm.rosterStats).toMatchObject({ total: 3, active: 1, pending: 1, resigned: 1 })

    // 預設「全部」→ 顯示全部
    expect(wrapper.vm.displayedEmployees).toHaveLength(3)

    // 切「在職」→ 只剩 active
    wrapper.vm.statusFilter = 'active'
    await nextTick()
    expect(wrapper.vm.displayedEmployees.map((e) => e.id)).toEqual([1])

    // 切「已離職」→ 只剩 resigned；統計仍是 3 全貌
    wrapper.vm.statusFilter = 'resigned'
    await nextTick()
    expect(wrapper.vm.displayedEmployees.map((e) => e.id)).toEqual([3])
    expect(wrapper.vm.rosterStats.total).toBe(3)

    // clearFilters 回復預設（含 titleFilter）
    wrapper.vm.clearFilters()
    await nextTick()
    expect(wrapper.vm.statusFilter).toBe('all')
    expect(wrapper.vm.titleFilter).toBe('all')
    expect(wrapper.vm.displayedEmployees).toHaveLength(3)
  })

  it('職稱篩選與狀態篩選可疊加（title chain 在 status 之後）', async () => {
    employeeStore.employees = [
      { id: 1, name: 'A', is_active: true, resign_date: null, title: '教師' },
      { id: 2, name: 'B', is_active: true, resign_date: null, title: '助理' },
      { id: 3, name: 'C', is_active: false, resign_date: '2020-01-01', title: '教師' },
    ]
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    // titleOptions 去重（兩筆「教師」只出現一次）
    expect(wrapper.vm.titleOptions).toEqual(['教師', '助理'])

    // 只過職稱：教師 → id 1、3
    wrapper.vm.titleFilter = '教師'
    await nextTick()
    expect(wrapper.vm.displayedEmployees.map((e) => e.id)).toEqual([1, 3])

    // 疊加狀態=在職 → 只剩 id 1
    wrapper.vm.statusFilter = 'active'
    await nextTick()
    expect(wrapper.vm.displayedEmployees.map((e) => e.id)).toEqual([1])
  })

  it('quick-resign 指令觸發確認框，確認後呼叫 deleteEmployee(id) 並重載', async () => {
    employeeStore.employees = [{ id: 7, name: '王小明', is_active: true, resign_date: null }]
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    ElMessageBox.confirm.mockResolvedValueOnce(undefined)

    // 走操作欄「更多」指令入口，確保 command 路由正確
    wrapper.vm.handleRowCommand('quick-resign', employeeStore.employees[0])
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)

    await flushPromises()
    await flushPromises()

    expect(mockDeleteEmployee).toHaveBeenCalledTimes(1)
    expect(mockDeleteEmployee).toHaveBeenCalledWith(7)
    // 成功後強制重載清單
    expect(employeeStore.fetchEmployees).toHaveBeenCalledWith(true)
  })

  it('quick-resign 取消確認框 → 不呼叫 deleteEmployee', async () => {
    employeeStore.employees = [{ id: 7, name: '王小明', is_active: true, resign_date: null }]
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    ElMessageBox.confirm.mockRejectedValueOnce(new Error('cancel'))

    wrapper.vm.handleRowCommand('quick-resign', employeeStore.employees[0])
    await flushPromises()
    await flushPromises()

    expect(mockDeleteEmployee).not.toHaveBeenCalled()
  })

  it('已離職列的「更多」下拉不再出現「快速標記離職」指令', async () => {
    employeeStore.employees = [{ id: 8, name: '已離職員工', is_active: false, resign_date: '2020-01-01' }]
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).not.toContain('快速標記離職')
  })

  it('姓名欄渲染 router-link，鍵盤使用者可循連結進詳情頁（非僅 row-click）', async () => {
    employeeStore.employees = [{ id: 7, name: '王小明', is_active: true, resign_date: null }]
    // el-table-column 預設 stub（true）不會呼叫 scoped slot（見既有測試皆用 wrapper.vm 斷言而非 DOM）；
    // 此處針對「姓名」欄位覆寫一個會實際呼叫 default slot 的 stub，注入對應 row，才能斷言 router-link 有渲染。
    const nameColumnStub = {
      props: ['prop'],
      render() {
        if (this.prop === 'name' && this.$slots.default) {
          return this.$slots.default({ row: employeeStore.employees[0] })
        }
        return null
      },
    }
    const wrapper = mount(EmployeeListView, {
      global: {
        directives: { loading: () => {} },
        stubs: { ...stubs, 'el-table-column': nameColumnStub },
      },
    })
    await flushPromises()
    await nextTick()

    // 測試環境未安裝 vue-router plugin，<router-link> 無法解析為真實 <a>，
    // 故斷言其 `to` prop（等同真實環境會渲染成的 href 目標）與文字，而非 href/a 標籤。
    const link = wrapper.find('.name-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('to')).toBe('/employees/7')
    expect(link.text()).toBe('王小明')
  })
})

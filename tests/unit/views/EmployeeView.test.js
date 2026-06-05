import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import EmployeeView from '@/views/EmployeeView.vue'

const employeeStore = {
  employees: [],
  fetchEmployees: vi.fn(() => Promise.resolve()),
}

const classroomStore = {
  classrooms: [],
  fetchClassrooms: vi.fn(() => Promise.resolve()),
}

const configStore = {
  jobTitles: [],
  fetchJobTitles: vi.fn(() => Promise.resolve()),
}

const getPositionSalary = vi.fn(() => Promise.resolve({ data: {} }))

const mockUpdateEmployeeBasic = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('@/api/employees', () => ({
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  offboard: vi.fn(),
  getFinalSalaryPreview: vi.fn(),
  updateEmployeeBasic: (...args) => mockUpdateEmployeeBasic(...args),
  updateEmployeeSalary: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/attendance', () => ({
  getRecords: vi.fn(() => Promise.resolve({ data: [] })),
  uploadCsv: vi.fn(),
  deleteEmployeeDateRecord: vi.fn(),
}))

vi.mock('@/api/config', () => ({
  getPositionSalary: (...args) => getPositionSalary(...args),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => employeeStore,
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => classroomStore,
}))

vi.mock('@/stores/config', () => ({
  useConfigStore: () => configStore,
}))

vi.mock('@/composables', () => ({
  useCrudDialog: () => ({
    dialogVisible: ref(false),
    isEdit: ref(false),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    closeDialog: vi.fn(),
  }),
  useConfirmDelete: () => ({
    confirmDelete: vi.fn(),
  }),
  // EmployeeView 改用序列化搜尋 composable（避免 out-of-order 舊回應覆蓋）；
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

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('EmployeeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    employeeStore.employees = []
    configStore.jobTitles = []
    classroomStore.classrooms = []
  })

  it('onMounted honors store TTL by calling fetchEmployees(false)', async () => {
    mount(EmployeeView, {
      global: {
        directives: { loading: () => {} },
        stubs: {
          EmptyState: true,
          TableSkeleton: true,
          Plus: true,
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-icon': true,
          'el-card': { template: '<div><slot /></div>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-row': { template: '<div><slot /></div>' },
          'el-col': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-input-number': true,
          'el-time-select': true,
          'el-date-picker': { props: ['modelValue'], template: '<input :value="modelValue || \'\'" />' },
          'el-divider': true,
          'el-tag': { template: '<span><slot /></span>' },
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}:<slot /></div>' },
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(employeeStore.fetchEmployees).toHaveBeenCalledTimes(1)
    expect(employeeStore.fetchEmployees).toHaveBeenCalledWith(false)
  })

  it('renders birthday field in form and detail dialog', async () => {
    const wrapper = mount(EmployeeView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          EmptyState: true,
          TableSkeleton: true,
          Plus: true,
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-icon': true,
          'el-card': { template: '<div><slot /></div>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': {
            props: ['label'],
            template: '<div>{{ label }}<slot /></div>',
          },
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-row': { template: '<div><slot /></div>' },
          'el-col': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-input-number': true,
          'el-time-select': true,
          'el-date-picker': {
            props: ['modelValue'],
            template: '<input :value="modelValue || \'\'" />',
          },
          'el-divider': true,
          'el-tag': { template: '<span><slot /></span>' },
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': {
            props: ['label'],
            template: '<div>{{ label }}:<slot /></div>',
          },
        },
      },
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.vm.form.birthday).toBe('')
    expect(wrapper.text()).toContain('生日')

    wrapper.vm.currentDetail = {
      name: '王小明',
      birthday: '1990-03-15',
      is_active: true,
    }

    await nextTick()

    expect(wrapper.text()).toContain('1990-03-15')
  })

  it('saveBasic only sends dirty fields — phone change yields { phone } payload', async () => {
    const wrapper = mount(EmployeeView, {
      global: {
        directives: { loading: () => {} },
        stubs: {
          EmptyState: true,
          TableSkeleton: true,
          Plus: true,
          'el-input': { template: '<input />' },
          'el-button': { template: '<button><slot /></button>' },
          'el-icon': true,
          'el-card': { template: '<div><slot /></div>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-row': { template: '<div><slot /></div>' },
          'el-col': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-input-number': true,
          'el-time-select': true,
          'el-date-picker': { props: ['modelValue'], template: '<input :value="modelValue || \'\'" />' },
          'el-divider': true,
          'el-tag': { template: '<span><slot /></span>' },
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}:<slot /></div>' },
        },
      },
    })
    await flushPromises()
    await nextTick()

    // 模擬編輯模式：先填入原始資料讓 resetDirty 建立快照
    const originalRow = {
      id: 42,
      employee_id: 'EMP001',
      name: '測試員工',
      id_number: '',
      employee_type: 'regular',
      job_title_id: null,
      position: '',
      supervisor_role: null,
      bonus_grade: null,
      department: 'Teaching',
      phone: '0912-000-000',
      address: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      hire_date: '',
      probation_end_date: '',
      birthday: '',
      classroom_id: null,
      base_salary: 30000,
      hourly_rate: 0,
      insurance_salary_level: 30000,
      pension_self_rate: 0,
      dependents: 0,
      bank_code: '',
      bank_account: '',
      bank_account_name: '',
      work_start_time: '08:00',
      work_end_time: '17:00',
    }
    // populateForm 建立 dirty 快照
    wrapper.vm.populateForm(originalRow)
    await nextTick()
    await nextTick() // 等待 resetDirty 在 nextTick 中完成

    // 只修改 phone
    wrapper.vm.form.phone = '0988-123-456'
    await nextTick()

    // 呼叫 saveBasic
    await wrapper.vm.saveBasic()
    await flushPromises()

    // 驗證只送出 { phone: '0988-123-456' }，不帶其他欄位
    expect(mockUpdateEmployeeBasic).toHaveBeenCalledTimes(1)
    expect(mockUpdateEmployeeBasic).toHaveBeenCalledWith(42, { phone: '0988-123-456' })
  })

  it('status filter narrows displayed rows while rosterStats counts the full roster', async () => {
    // active / pending(未來離職日) / resigned 各一
    employeeStore.employees = [
      { id: 1, name: 'A', is_active: true, resign_date: null },
      { id: 2, name: 'B', is_active: true, resign_date: '2999-01-01' },
      { id: 3, name: 'C', is_active: false, resign_date: '2020-01-01' },
    ]
    const stubs = {
      EmptyState: true,
      TableSkeleton: true,
      Plus: true,
      'el-input': { template: '<input />' },
      'el-button': { template: '<button><slot /></button>' },
      'el-icon': true,
      'el-card': { template: '<div><slot /></div>' },
      'el-table': { template: '<div><slot /></div>' },
      'el-table-column': true,
      'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
      'el-form': { template: '<form><slot /></form>' },
      'el-form-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
      'el-tabs': { template: '<div><slot /></div>' },
      'el-tab-pane': { template: '<div><slot /></div>' },
      'el-row': { template: '<div><slot /></div>' },
      'el-col': { template: '<div><slot /></div>' },
      'el-select': { template: '<div><slot /></div>' },
      'el-option': true,
      'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
      'el-dropdown-menu': { template: '<div><slot /></div>' },
      'el-dropdown-item': { template: '<div><slot /></div>' },
      'el-tooltip': { template: '<div><slot /></div>' },
      'el-input-number': true,
      'el-time-select': true,
      'el-date-picker': { props: ['modelValue'], template: '<input :value="modelValue || \'\'" />' },
      'el-divider': true,
      'el-tag': { template: '<span><slot /></span>' },
      'el-descriptions': { template: '<div><slot /></div>' },
      'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}:<slot /></div>' },
    }
    const wrapper = mount(EmployeeView, {
      global: { directives: { loading: () => {} }, stubs },
    })
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

    // clearFilters 回復預設
    wrapper.vm.clearFilters()
    await nextTick()
    expect(wrapper.vm.statusFilter).toBe('all')
    expect(wrapper.vm.displayedEmployees).toHaveLength(3)
  })
})

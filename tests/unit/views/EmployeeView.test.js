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

vi.mock('@/api/employees', () => ({
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  offboard: vi.fn(),
  getFinalSalaryPreview: vi.fn(),
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
})

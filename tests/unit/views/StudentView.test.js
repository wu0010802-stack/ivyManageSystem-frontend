import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentView from '@/views/StudentView.vue'

const route = reactive({
  query: {
    school_year: '2025',
    semester: '2',
    classroom_id: '8',
    action: 'create',
  },
})
const push = vi.fn()
const replace = vi.fn(() => Promise.resolve())
const getStudents = vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } }))
const getClassrooms = vi.fn(() => Promise.resolve({
  data: [
    {
      id: 8,
      name: '向日葵班',
      school_year: 2025,
      semester: 2,
      semester_label: '2025學年度下學期',
      grade_name: '中班',
    },
  ],
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/students', () => ({
  getStudents: (...args) => getStudents(...args),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  graduateStudent: vi.fn(),
  bulkTransferStudents: vi.fn(),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...args) => getClassrooms(...args),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn(),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('StudentView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    route.query = {
      school_year: '2025',
      semester: '2',
      classroom_id: '8',
      action: 'create',
    }
  })

  it('uses route query to preload academic term and classroom filters', async () => {
    shallowMount(StudentView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          TableSkeleton: true,
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-input': { template: '<input />' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-pagination': true,
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-switch': true,
          'el-button': { template: '<button><slot /></button>' },
          'el-date-picker': true,
          'el-radio-group': { template: '<div><slot /></div>' },
          'el-radio': { template: '<label><slot /></label>' },
          'el-divider': true,
          'el-tag': true,
          'el-tooltip': { template: '<div><slot /></div>' },
          'el-icon': true,
        },
      },
    })

    await flushPromises()
    await nextTick()

    expect(getClassrooms).toHaveBeenCalledWith({ current_only: false })
    expect(getStudents).toHaveBeenCalledWith(expect.objectContaining({
      school_year: 2025,
      semester: 2,
      classroom_id: 8,
      is_active: true,
    }))
    expect(replace).toHaveBeenCalledWith({
      query: {
        school_year: '2025',
        semester: '2',
        classroom_id: '8',
      },
    })
  })
})

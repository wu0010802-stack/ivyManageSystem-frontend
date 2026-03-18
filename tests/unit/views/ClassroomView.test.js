import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ClassroomView from '@/views/ClassroomView.vue'

const push = vi.fn(() => Promise.resolve())
const getClassrooms = vi.fn(() => Promise.resolve({
  data: [
    {
      id: 1,
      name: '向日葵班',
      class_code: 'SUN-01',
      school_year: 2025,
      semester: 2,
      semester_label: '2025學年度下學期',
      grade_name: '中班',
      capacity: 30,
      current_count: 4,
      student_preview: [
        { id: 11, name: '小安' },
        { id: 12, name: '小寶' },
        { id: 13, name: '小晴' },
      ],
      has_more_students: true,
      head_teacher_name: '王老師',
      assistant_teacher_name: '林老師',
      english_teacher_name: '陳老師',
      is_active: true,
    },
  ],
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/api/classrooms', () => ({
  createClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
  getClassroom: vi.fn(() => Promise.resolve({ data: { id: 1, students: [] } })),
  getClassrooms: (...args) => getClassrooms(...args),
  getGrades: vi.fn(() => Promise.resolve({ data: [] })),
  promoteAcademicYear: vi.fn(),
  getTeacherOptions: vi.fn(() => Promise.resolve({ data: [] })),
  updateClassroom: vi.fn(),
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({
    refresh: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ClassroomView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders student preview summary on classroom cards', async () => {
    const wrapper = mount(ClassroomView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-switch': true,
          'el-button': { template: '<button><slot /></button>' },
          'el-card': { template: '<div><slot /><slot name="header" /></div>' },
          'el-tag': { template: '<span><slot /></span>' },
          'el-empty': true,
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-row': { template: '<div><slot /></div>' },
          'el-col': { template: '<div><slot /></div>' },
          'el-input': true,
          'el-input-number': true,
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': { template: '<div><slot /></div>' },
          'el-drawer': { template: '<div><slot /></div>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(getClassrooms).toHaveBeenCalled()
    expect(wrapper.text()).toContain('小安')
    expect(wrapper.text()).toContain('小寶')
    expect(wrapper.text()).toContain('小晴')
    expect(wrapper.text()).toContain('還有 1 位學生')
  })
})

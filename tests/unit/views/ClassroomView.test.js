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
  getTeacherOptions: vi.fn(() => Promise.resolve({ data: [] })),
  updateClassroom: vi.fn(),
}))

// PlanStatusCard（新學年準備狀態卡）mount 後會打 status API，需 mock 避免真打網路。
vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: vi.fn(() => Promise.resolve({
    data: {
      state: 'none',
      target_school_year: 115,
      source_school_year: 114,
      blocking_count: 0,
      warning_count: 0,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  })),
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({
    refresh: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const STUBS = {
  AdminListToolbar: true,
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': true,
  'el-button': { template: '<button><slot /></button>' },
  'el-card': { template: '<div><slot /><slot name="header" /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-alert': { template: '<div><slot name="title" />{{ title }}<slot /></div>', props: ['title'] },
  'el-link': { template: '<a><slot /></a>' },
  'el-empty': { template: '<div><slot /></div>' },
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
}

function mountView() {
  return mount(ClassroomView, {
    global: {
      directives: {
        loading: () => {},
      },
      stubs: STUBS,
    },
  })
}

describe('ClassroomView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders classroom card with class info and teacher assignments', async () => {
    const wrapper = mountView()

    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(getClassrooms).toHaveBeenCalled()
    expect(wrapper.text()).toContain('SUN-01')
    expect(wrapper.text()).toContain('王老師')
    expect(wrapper.text()).toContain('林老師')
    expect(wrapper.text()).toContain('向日葵班')
  })
})

// ── 班級卡片格關鍵字搜尋（客端過濾）─────────────────────────────────────────
describe('ClassroomView 班級搜尋', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const classrooms = [
    {
      id: 1,
      name: '向日葵班',
      class_code: 'SUN-01',
      school_year: 114,
      semester: 1,
      semester_label: '114學年度上學期',
      grade_name: '中班',
      capacity: 30,
      current_count: 4,
      head_teacher_name: '王老師',
      is_active: true,
    },
    {
      id: 2,
      name: '玫瑰班',
      class_code: 'ROSE-01',
      school_year: 114,
      semester: 1,
      semester_label: '114學年度上學期',
      grade_name: '大班',
      capacity: 25,
      current_count: 10,
      head_teacher_name: '林老師',
      is_active: true,
    },
  ]

  it('依班級名稱收斂 filteredClassrooms', async () => {
    getClassrooms.mockResolvedValueOnce({ data: classrooms })
    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const state = wrapper.vm.$.setupState

    state.classroomSearch = '玫瑰'
    await nextTick()

    expect(state.filteredClassrooms).toEqual([classrooms[1]])
    expect(state.classroomShown).toBe(1)
    expect(state.classroomTotal).toBe(2)
  })

  it('依帶班老師（班導）姓名也可命中', async () => {
    getClassrooms.mockResolvedValueOnce({ data: classrooms })
    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const state = wrapper.vm.$.setupState

    state.classroomSearch = '林老師'
    await nextTick()

    expect(state.filteredClassrooms).toEqual([classrooms[1]])
  })

  it('清空搜尋字串時還原全部班級', async () => {
    getClassrooms.mockResolvedValueOnce({ data: classrooms })
    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    const state = wrapper.vm.$.setupState

    state.classroomSearch = '玫瑰'
    await nextTick()
    state.classroomSearch = ''
    await nextTick()

    expect(state.filteredClassrooms).toEqual(classrooms)
  })
})

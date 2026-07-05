import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ClassroomView from '@/views/ClassroomView.vue'

const push = vi.fn(() => Promise.resolve())

// 每個測試可換掉 getClassrooms 的回應（pending / 空 / 有資料）
let classroomsResponse: () => Promise<{ data: unknown[] }> = () => Promise.resolve({ data: [] })
const getClassrooms = vi.fn(() => classroomsResponse())
const getClassroom = vi.fn(() => Promise.resolve({ data: { id: 1, students: [] } }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/api/classrooms', () => ({
  createClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
  getClassroom: (...args: unknown[]) => getClassroom(...(args as [])),
  getClassrooms: (...args: unknown[]) => getClassrooms(...(args as [])),
  getGrades: vi.fn(() => Promise.resolve({ data: [] })),
  getTeacherOptions: vi.fn(() => Promise.resolve({ data: [] })),
  updateClassroom: vi.fn(),
}))

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ refresh: vi.fn(() => Promise.resolve()) }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))

const oneClassroom = {
  id: 1,
  name: '向日葵班',
  class_code: 'SUN-01',
  school_year: 114,
  semester: 1,
  semester_label: '114學年度上學期',
  grade_name: '中班',
  capacity: 30,
  current_count: 15,
  head_teacher_name: '王老師',
  is_active: true,
}

const stubs = {
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': true,
  'el-button': { template: '<button><slot /></button>' },
  'el-card': { template: '<div class="el-card"><slot name="header" /><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { template: '<div class="el-empty"><slot /></div>' },
  'el-skeleton': { template: '<div class="el-skeleton-stub"></div>' },
  'el-skeleton-item': true,
  'el-progress': { template: '<div class="el-progress-stub"></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-input': true,
  'el-input-number': true,
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-divider': { template: '<div><slot /></div>' },
  'el-alert': true,
  'el-drawer': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-collapse': { template: '<div><slot /></div>' },
  'el-collapse-item': { template: '<div><slot /></div>' },
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
}

function mountView() {
  return mount(ClassroomView, {
    global: {
      directives: { loading: () => {} },
      stubs,
    },
  })
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('ClassroomView UI/UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classroomsResponse = () => Promise.resolve({ data: [] })
  })

  it('A4：載入中（資料尚未回來）顯示 skeleton，不閃「尚無班級資料」空狀態', async () => {
    // getClassrooms 永不 resolve → loading 維持 true、classrooms 維持空
    classroomsResponse = () => new Promise(() => {})
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.classroom-skeleton').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('尚無班級資料')
  })

  it('A9：確定無班級（非載入中）時，空狀態提供「新增班級」CTA', async () => {
    classroomsResponse = () => Promise.resolve({ data: [] })
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.classroom-skeleton').exists()).toBe(false)
    expect(wrapper.find('.empty-create-btn').exists()).toBe(true)
  })

  it('A1：班級卡片可由鍵盤聚焦並以 Enter 開啟學生抽屜', async () => {
    classroomsResponse = () => Promise.resolve({ data: [oneClassroom] })
    const wrapper = mountView()
    await flush()

    const card = wrapper.find('.classroom-card')
    expect(card.exists()).toBe(true)
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')

    await card.trigger('keydown.enter')
    expect(getClassroom).toHaveBeenCalledWith(1)
  })

  it('A6：班級卡片以容量進度條視覺化在學/容量', async () => {
    classroomsResponse = () => Promise.resolve({ data: [oneClassroom] })
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.capacity-progress').exists()).toBe(true)
  })

  it('A2：教師資訊不使用 emoji 當圖示', async () => {
    classroomsResponse = () => Promise.resolve({ data: [oneClassroom] })
    const wrapper = mountView()
    await flush()

    const teacherText = wrapper.find('.teacher-info').text()
    expect(teacherText).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

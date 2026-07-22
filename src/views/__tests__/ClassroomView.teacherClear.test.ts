import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// P1（正確性）：編輯班級時把 clearable 的教師下拉清空 → el-select emit undefined →
// form.head_teacher_id = undefined。submitForm 直接放進 payload，JSON.stringify 丟掉
// undefined 鍵 → 後端 exclude_unset=True 跳過該欄 → 教師沒被移除（靜默失敗）。
// 修正：payload 三個教師欄補 `?? null`，清空時顯式送 null 讓後端寫入 None。

const updateClassroomMock = vi.hoisted(() => vi.fn())
const getClassroomsMock = vi.hoisted(() => vi.fn())
const getGradesMock = vi.hoisted(() => vi.fn())
const getTeacherOptionsMock = vi.hoisted(() => vi.fn())
const getIntakePlanMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
  getGrades: getGradesMock,
  getTeacherOptions: getTeacherOptionsMock,
  getClassroom: vi.fn(),
  createClassroom: vi.fn(),
  updateClassroom: updateClassroomMock,
  deleteClassroom: vi.fn(),
}))
vi.mock('@/api/recruitmentIntake', () => ({ getIntakePlan: getIntakePlanMock }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 114, semester: 1 }),
  normalizeSchoolYear: (v: number) => v,
  buildSchoolYearOptions: () => [114],
}))
vi.mock('@/utils/classroomReserved', () => ({
  mapReservedByGrade: () => ({}),
  reservedCountFor: () => 0,
}))
vi.mock('@/utils/classroomCapacity', () => ({
  capacityStatus: () => 'normal',
  capacityPercent: () => 0,
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

import ClassroomView from '../ClassroomView.vue'

const STUBS = {
  PlanStatusCard: true,
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': { template: '<input type="checkbox" />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-skeleton': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-progress': true,
  'el-icon': { template: '<span><slot /></span>' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-empty': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
}

interface SetupState {
  form: Record<string, unknown>
  isEdit: boolean
  currentClassroom: Record<string, unknown> | null
  formRef: unknown
  submitForm: () => Promise<void>
}

async function mountView() {
  getClassroomsMock.mockResolvedValue({ data: [] })
  getGradesMock.mockResolvedValue({ data: [] })
  getTeacherOptionsMock.mockResolvedValue({ data: [] })
  getIntakePlanMock.mockResolvedValue({ data: { rows: [] } })
  const wrapper = mount(ClassroomView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  return wrapper
}

describe('ClassroomView submitForm 清除教師指派（P1）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('編輯班級時清空教師下拉（undefined）→ payload 應送 null 而非丟欄', async () => {
    updateClassroomMock.mockResolvedValue({ data: {} })
    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    // 模擬：進入編輯、載入了已指派班導的班，使用者把三個教師下拉都清空
    ss.isEdit = true
    ss.currentClassroom = {
      id: 5,
      name: '小班A',
      class_code: 'A1',
      school_year: 114,
      semester: 1,
      grade_id: 1,
      capacity: 30,
      head_teacher_id: 11,
      assistant_teacher_id: 12,
      english_teacher_id: 13,
      is_active: true,
    }
    Object.assign(ss.form, {
      id: 5,
      name: '小班A',
      class_code: 'A1',
      school_year: 114,
      semester: 1,
      grade_id: 1,
      capacity: 30,
      head_teacher_id: undefined,
      assistant_teacher_id: undefined,
      english_teacher_id: undefined,
      is_active: true,
    })
    // el-form 被 stub，注入可用的 validate
    ss.formRef = { validate: async (cb: (v: boolean) => unknown) => cb(true) }

    await ss.submitForm()
    await flushPromises()

    expect(updateClassroomMock).toHaveBeenCalledTimes(1)
    const [id, payload] = updateClassroomMock.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(5)
    // 關鍵：清空後不可丟欄（undefined），要顯式 null 才能讓後端清除指派
    expect(payload.head_teacher_id).toBeNull()
    expect(payload.assistant_teacher_id).toBeNull()
    expect(payload.english_teacher_id).toBeNull()
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('is_active')
    wrapper.unmount()
  })
})

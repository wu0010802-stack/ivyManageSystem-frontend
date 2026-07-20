import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// P3：從學生完整檔案「返回班級」帶 ?selected=<classroom_id> 回來，ClassroomView 原本
// 不讀 route.query → 死參數，抽屜不重開、回不到原班。修正：onMounted 讀 ?selected= 並
// 重新開啟該班學生抽屜。

const getClassroomMock = vi.hoisted(() => vi.fn())
const getClassroomsMock = vi.hoisted(() => vi.fn())
const getGradesMock = vi.hoisted(() => vi.fn())
const getTeacherOptionsMock = vi.hoisted(() => vi.fn())
const getIntakePlanMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
  getGrades: getGradesMock,
  getTeacherOptions: getTeacherOptionsMock,
  getClassroom: getClassroomMock,
  createClassroom: vi.fn(),
  updateClassroom: vi.fn(),
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
vi.mock('@/stores/classroom', () => ({ useClassroomStore: () => ({ refresh: vi.fn() }) }))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
// 深連結：回來時帶 ?selected=5
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { selected: '5' } }) }))

import ClassroomView from '../ClassroomView.vue'

interface SetupState {
  drawerClassroom: { id: number } | null
  classroomDrawerVisible: boolean
}

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

describe('ClassroomView 深連結 ?selected= 還原抽屜（P3）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mount 時帶 ?selected=5 → 自動開啟該班學生抽屜', async () => {
    getClassroomsMock.mockResolvedValue({ data: [] })
    getGradesMock.mockResolvedValue({ data: [] })
    getTeacherOptionsMock.mockResolvedValue({ data: [] })
    getIntakePlanMock.mockResolvedValue({ data: { rows: [] } })
    getClassroomMock.mockResolvedValue({ data: { id: 5, name: '大班A' } })

    const wrapper = mount(ClassroomView, {
      global: { stubs: STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    expect(getClassroomMock).toHaveBeenCalledWith(5)
    const ss = wrapper.vm.$.setupState as SetupState
    expect(ss.classroomDrawerVisible).toBe(true)
    expect(ss.drawerClassroom?.id).toBe(5)
    wrapper.unmount()
  })
})

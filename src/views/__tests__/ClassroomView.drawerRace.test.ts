import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// P3：openStudentDrawer / openEdit 無請求序號守衛。快速點兩張班級卡片時，較慢
// （舊）的 getClassroom 回應可能覆寫較新的 drawerClassroom / currentClassroom。
// 修正：加序號，過期回應丟棄不覆寫。

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
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

import ClassroomView from '../ClassroomView.vue'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

interface SetupState {
  openStudentDrawer: (c: { id: number }) => Promise<void>
  drawerClassroom: { id: number } | null
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

describe('ClassroomView openStudentDrawer 請求序號守衛（P3）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('快速開 A(慢)→B(快)：較舊 A 回應遲到後不得覆寫 drawerClassroom', async () => {
    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    const dA = deferred<{ data: { id: number } }>()
    const dB = deferred<{ data: { id: number } }>()
    getClassroomMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const runA = ss.openStudentDrawer({ id: 1 })
    const runB = ss.openStudentDrawer({ id: 2 })

    dB.resolve({ data: { id: 2 } })
    await flushPromises()
    await runB
    expect(ss.drawerClassroom?.id).toBe(2)

    dA.resolve({ data: { id: 1 } })
    await flushPromises()
    await runA
    expect(ss.drawerClassroom?.id).toBe(2) // 未被較舊 A 覆寫
    wrapper.unmount()
  })
})

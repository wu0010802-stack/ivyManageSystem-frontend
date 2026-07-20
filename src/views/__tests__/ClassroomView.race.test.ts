import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// C3c（正確性）：fetchClassrooms 原本無請求序號守衛。快速切學期 A(慢)→B(快) 時，
// 較舊的 A 學期回應在 B 之後才 resolve，會覆寫掉最新 B 學期的班級清單 →
// 學期選擇器顯示 B 學期、卡片卻是 A 學期的班級。
// 修正：加 fetchSeq，await getClassrooms 後 if(seq !== fetchSeq) return 才寫 classrooms / loading。

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
  updateClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
}))
vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: getIntakePlanMock,
}))
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

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

interface SetupState {
  fetchClassrooms: () => Promise<void>
  classrooms: { id: number; name: string }[]
  loading: boolean
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

const classA = [{ id: 1, name: 'A 學期班' }]
const classB = [{ id: 2, name: 'B 學期班' }]

describe('ClassroomView fetchClassrooms 請求序號守衛（C3c）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('切學期 A(慢)→B(快)：較舊的 A 回應遲到 resolve 後不得覆寫最新 B 清單', async () => {
    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    const dA = deferred<{ data: typeof classA }>()
    const dB = deferred<{ data: typeof classB }>()
    getClassroomsMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const runA = ss.fetchClassrooms() // seq1（A 學期，慢）
    const runB = ss.fetchClassrooms() // seq2（B 學期，快）

    dB.resolve({ data: classB })
    await flushPromises()
    await runB
    expect(ss.classrooms.map((c) => c.id)).toEqual([2])

    dA.resolve({ data: classA }) // 遲到的舊回應
    await flushPromises()
    await runA
    // 仍為 B 學期，未被較舊的 A 回應覆寫
    expect(ss.classrooms.map((c) => c.id)).toEqual([2])
    wrapper.unmount()
  })

  it('無競態單一請求時仍正常寫入並收掉 loading', async () => {
    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    getClassroomsMock.mockResolvedValueOnce({ data: classB })
    await ss.fetchClassrooms()
    await flushPromises()

    expect(ss.classrooms.map((c) => c.id)).toEqual([2])
    expect(ss.loading).toBe(false)
    wrapper.unmount()
  })
})

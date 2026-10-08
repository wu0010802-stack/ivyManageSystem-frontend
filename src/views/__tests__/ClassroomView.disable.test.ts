import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { isVNode, render, type VNode } from 'vue'

// 停用班級防呆：
//  - 班上仍有在學生（current_count > 0）→ 不開確認框，直接警示請先改班或辦理休學／退學／畢業（後端會拒絕，不如前端先擋）
//  - 沒有在學生 → 確認框列出停用的連帶後果（清空師資指派、教師薪資需重算、清單不再顯示），
//    再呼叫 deleteClassroom
// 與四支既有 ClassroomView.*.test.ts 同樣的 mock 邊界（element-plus 只暴露 ElMessage / ElMessageBox.confirm）。

const getClassroomsMock = vi.hoisted(() => vi.fn())
const getGradesMock = vi.hoisted(() => vi.fn())
const getTeacherOptionsMock = vi.hoisted(() => vi.fn())
const getIntakePlanMock = vi.hoisted(() => vi.fn())
const getClassroomMock = vi.hoisted(() => vi.fn())
const deleteClassroomMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())
const warningMock = vi.hoisted(() => vi.fn())
const successMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
  getGrades: getGradesMock,
  getTeacherOptions: getTeacherOptionsMock,
  getClassroom: getClassroomMock,
  createClassroom: vi.fn(),
  updateClassroom: vi.fn(),
  deleteClassroom: deleteClassroomMock,
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
  ElMessage: { success: successMock, error: errorMock, warning: warningMock },
  ElMessageBox: { confirm: confirmMock },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

import ClassroomView from '../ClassroomView.vue'
import ClassroomTableView from '@/components/classroom/ClassroomTableView.vue'

const STUBS = {
  PlanStatusCard: true,
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
  EnrollmentRosterDialog: true,
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

interface Row {
  id: number
  name: string
  school_year: number
  semester: number
  grade_name: string
  capacity: number
  current_count: number
  is_active: boolean
  head_teacher_name?: string | null
  assistant_teacher_name?: string | null
  english_teacher_name?: string | null
  art_teacher_name?: string | null
}

interface SetupState {
  handleDelete: (c: Row) => Promise<void>
}

const baseRow: Row = {
  id: 7,
  name: '向日葵班',
  school_year: 114,
  semester: 1,
  grade_name: '中班',
  capacity: 30,
  current_count: 0,
  is_active: true,
}

async function mountView(rows: Row[] = [baseRow]) {
  getClassroomsMock.mockResolvedValue({ data: rows })
  getGradesMock.mockResolvedValue({ data: [] })
  getTeacherOptionsMock.mockResolvedValue({ data: [] })
  getIntakePlanMock.mockResolvedValue({ data: { rows: [] } })
  const wrapper = mount(ClassroomView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  return { wrapper, state: wrapper.vm.$.setupState as unknown as SetupState }
}

// confirm 的第一個參數是 h() 組的 VNode：直接 render 到游離節點讀文字與清單項。
// 不用 VTU mount——第二次 mount 會重設 VTU 的 stub 轉換器，讓主頁後續重繪時 PlanStatusCard 變回真元件。
const renderMessage = (message: unknown) => {
  expect(isVNode(message)).toBe(true)
  const el = document.createElement('div')
  render(message as VNode, el)
  return {
    text: () => el.textContent ?? '',
    items: () => Array.from(el.querySelectorAll('li')).map((li) => li.textContent ?? ''),
  }
}

describe('ClassroomView 停用班級防呆', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteClassroomMock.mockResolvedValue({ data: {} })
  })

  it('班上仍有在學生：警示請先改班或辦理離班，不開確認框、不呼叫 deleteClassroom', async () => {
    const { wrapper, state } = await mountView()

    await state.handleDelete({ ...baseRow, current_count: 12 })

    expect(warningMock).toHaveBeenCalledWith(
      '「向日葵班」仍有 12 名在學，請先在學生資料改班級，或按「變更狀態」辦理休學／退學／畢業後再停用',
    )
    expect(confirmMock).not.toHaveBeenCalled()
    expect(deleteClassroomMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('沒有在學生：確認框列出三項連帶後果與實際被清空的教師名單，確認後才停用', async () => {
    confirmMock.mockResolvedValue('confirm')
    const { wrapper, state } = await mountView()

    await state.handleDelete({
      ...baseRow,
      head_teacher_name: '王老師',
      assistant_teacher_name: '林老師',
      art_teacher_name: '陳老師',
    })
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    const [message, title, options] = confirmMock.mock.calls[0] as [unknown, string, Record<string, unknown>]
    expect(title).toBe('停用「向日葵班」？')
    expect(options).toMatchObject({
      type: 'warning',
      confirmButtonText: '停用班級',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
    const body = renderMessage(message)
    expect(body.text()).toContain('停用後會同時：')
    expect(body.items()).toEqual([
      '清空班導、副班導、美語老師的指派（王老師、林老師、陳老師）',
      '相關教師本月薪資會標記為需要重新計算',
      '本學期班級清單不再顯示，可在「顯示停用班級」中重新啟用',
    ])
    expect(deleteClassroomMock).toHaveBeenCalledWith(7)
    expect(successMock).toHaveBeenCalledWith('班級已停用')
    wrapper.unmount()
  })

  it('沒有任何教師指派時寫「目前無指派」；只列實際有指派的人', async () => {
    confirmMock.mockResolvedValue('confirm')
    const { wrapper, state } = await mountView()

    await state.handleDelete({ ...baseRow })
    expect(renderMessage(confirmMock.mock.calls[0][0]).items()[0])
      .toBe('清空班導、副班導、美語老師的指派（目前無指派）')

    confirmMock.mockClear()
    await state.handleDelete({ ...baseRow, head_teacher_name: '王老師', english_teacher_name: '李老師' })
    expect(renderMessage(confirmMock.mock.calls[0][0]).items()[0])
      .toBe('清空班導、副班導、美語老師的指派（王老師、李老師）')
    wrapper.unmount()
  })

  it('使用者取消確認框：不停用、不報錯', async () => {
    confirmMock.mockRejectedValue('cancel')
    const { wrapper, state } = await mountView()

    await state.handleDelete({ ...baseRow })
    await flushPromises()

    expect(deleteClassroomMock).not.toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('表格的 command 事件接上頁面動作：disable 走停用防呆、edit 載入班級詳情', async () => {
    confirmMock.mockResolvedValue('confirm')
    getClassroomMock.mockResolvedValue({ data: { ...baseRow, students: [] } })
    const full = { ...baseRow, id: 8, name: '玫瑰班', current_count: 3 }
    const { wrapper } = await mountView([baseRow, full])
    const table = wrapper.findComponent(ClassroomTableView)

    table.vm.$emit('command', 'disable', full)
    await flushPromises()
    expect(warningMock).toHaveBeenCalledWith(
      '「玫瑰班」仍有 3 名在學，請先在學生資料改班級，或按「變更狀態」辦理休學／退學／畢業後再停用',
    )
    expect(confirmMock).not.toHaveBeenCalled()

    table.vm.$emit('command', 'edit', baseRow)
    await flushPromises()
    expect(getClassroomMock).toHaveBeenCalledWith(7)
    wrapper.unmount()
  })
})

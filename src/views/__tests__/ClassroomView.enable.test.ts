import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 重新啟用已停用班級：
//  - 底座唯一的重新啟用入口（編輯框「啟用狀態」開關）已移除，⋯ 選單必須補上「重新啟用」，
//    否則誤停用後既無法復原，後端名稱／代號唯一性也算停用班，連同名重建都不行。
//  - 表格列、手機列、卡片三處共用 ClassroomRowMenu；本檔驗表格與卡片兩條路徑。
//  - 確認框說明「停用時清空的教師指派不會自動恢復」，確認後 updateClassroom(id, { is_active: true })，
//    成功重抓列表並刷新 classroom store；取消不送請求；失敗顯示後端訊息或「重新啟用失敗」。
// 與其他 ClassroomView.*.test.ts 同樣的 mock 邊界（element-plus 只暴露 ElMessage / ElMessageBox.confirm）。

const getClassroomsMock = vi.hoisted(() => vi.fn())
const getGradesMock = vi.hoisted(() => vi.fn())
const getTeacherOptionsMock = vi.hoisted(() => vi.fn())
const getIntakePlanMock = vi.hoisted(() => vi.fn())
const updateClassroomMock = vi.hoisted(() => vi.fn())
const refreshMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())
const warningMock = vi.hoisted(() => vi.fn())
const successMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())

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
  useClassroomStore: () => ({ refresh: refreshMock }),
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
import ClassroomRowMenu from '@/components/classroom/ClassroomRowMenu.vue'
import { tenantRemoveItem } from '@/utils/tenantStorage'

const VIEW_MODE_KEY = 'classrooms_view_mode'

const STUBS = {
  PlanStatusCard: true,
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
  EnrollmentRosterDialog: true,
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': { template: '<input type="checkbox" />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-card': { template: '<div class="el-card"><slot name="header" /><slot /></div>' },
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
}

const activeRow: Row = {
  id: 7,
  name: '向日葵班',
  school_year: 114,
  semester: 1,
  grade_name: '中班',
  capacity: 30,
  current_count: 0,
  is_active: true,
}
const inactiveRow: Row = { ...activeRow, id: 9, name: '舊玫瑰班', is_active: false }

async function mountView() {
  getClassroomsMock.mockResolvedValue({ data: [activeRow, inactiveRow] })
  getGradesMock.mockResolvedValue({ data: [] })
  getTeacherOptionsMock.mockResolvedValue({ data: [] })
  getIntakePlanMock.mockResolvedValue({ data: { rows: [] } })
  const wrapper = mount(ClassroomView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  return wrapper
}

const switchToCard = async (wrapper: Awaited<ReturnType<typeof mountView>>) => {
  await wrapper.find('[data-test="view-toggle-card"]').trigger('click')
  await flushPromises()
}

// 卡片檢視：找到指定班級那張卡的 ⋯ 選單元件
const menuOf = (wrapper: Awaited<ReturnType<typeof mountView>>, id: number) => {
  const menu = wrapper.findAllComponents(ClassroomRowMenu).find((m) => m.props('classroom').id === id)
  expect(menu).toBeTruthy()
  return menu!
}

describe('ClassroomView 重新啟用已停用班級', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantRemoveItem(VIEW_MODE_KEY)
    updateClassroomMock.mockResolvedValue({ data: {} })
    refreshMock.mockResolvedValue(undefined)
    confirmMock.mockResolvedValue('confirm')
  })

  it('表格：停用班選單有「重新啟用」、啟用班沒有；確認後以 { is_active: true } 更新並重抓列表', async () => {
    const wrapper = await mountView()
    const table = wrapper.findComponent(ClassroomTableView)
    const inactiveMenu = wrapper.find('[data-test="classroom-row"][data-id="9"]').text()
    const activeMenu = wrapper.find('[data-test="classroom-row"][data-id="7"]').text()
    expect(inactiveMenu).toContain('重新啟用')
    expect(activeMenu).not.toContain('重新啟用')
    expect(getClassroomsMock).toHaveBeenCalledTimes(1)

    table.vm.$emit('command', 'enable', inactiveRow)
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    const [message, title, options] = confirmMock.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(title).toBe('重新啟用「舊玫瑰班」？')
    expect(message).toBe('班級會回到本學期清單。停用時已清空的教師指派不會自動恢復，需要重新指派。')
    expect(options).toMatchObject({
      type: 'info',
      confirmButtonText: '重新啟用',
      cancelButtonText: '取消',
    })
    expect(updateClassroomMock).toHaveBeenCalledWith(9, { is_active: true })
    expect(successMock).toHaveBeenCalledWith('班級已重新啟用')
    expect(getClassroomsMock).toHaveBeenCalledTimes(2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('卡片：停用班卡片的 ⋯ 選單有「重新啟用」、啟用班沒有；確認後以 { is_active: true } 更新並重抓列表', async () => {
    const wrapper = await mountView()
    await switchToCard(wrapper)

    const cards = wrapper.findAll('.classroom-card')
    expect(cards).toHaveLength(2)
    const textOfCard = (name: string) => cards.find((c) => c.text().includes(name))!.find('.card-actions').text()
    expect(textOfCard('舊玫瑰班')).toContain('重新啟用')
    expect(textOfCard('向日葵班')).not.toContain('重新啟用')

    menuOf(wrapper, 9).vm.$emit('command', 'enable')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0][1]).toBe('重新啟用「舊玫瑰班」？')
    expect(updateClassroomMock).toHaveBeenCalledWith(9, { is_active: true })
    expect(successMock).toHaveBeenCalledWith('班級已重新啟用')
    expect(getClassroomsMock).toHaveBeenCalledTimes(2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('使用者取消確認框：不送請求、不報錯、不重抓', async () => {
    confirmMock.mockRejectedValue('cancel')
    const wrapper = await mountView()

    wrapper.findComponent(ClassroomTableView).vm.$emit('command', 'enable', inactiveRow)
    await flushPromises()

    expect(updateClassroomMock).not.toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
    expect(getClassroomsMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('後端拒絕（例如同名的啟用班已存在）：顯示後端訊息，不顯示成功、不重抓', async () => {
    updateClassroomMock.mockRejectedValue({ displayMessage: '本學期已有同名班級' })
    const wrapper = await mountView()

    wrapper.findComponent(ClassroomTableView).vm.$emit('command', 'enable', inactiveRow)
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('本學期已有同名班級')
    expect(successMock).not.toHaveBeenCalled()
    expect(getClassroomsMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('後端沒給訊息時用「重新啟用失敗」', async () => {
    updateClassroomMock.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()

    wrapper.findComponent(ClassroomTableView).vm.$emit('command', 'enable', inactiveRow)
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('重新啟用失敗')
    wrapper.unmount()
  })
})

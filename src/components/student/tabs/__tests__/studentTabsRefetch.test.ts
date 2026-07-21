import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// P1（正確性 + 隱私）：這四個分頁用 `if (active && !loaded.value) fetchData()`，
// loaded 首次載入後永久 latch。detail panel 切換學生時分頁實例被重用（無 :key、
// profile 不清 null），studentId 變不會 refetch → 顯示上一位學生的出席/教務/學費/
// 家長溝通。正解仿 ActivityTab：watch studentId 時重置 loaded 並重新載入。

const getAttendanceByStudent = vi.hoisted(() => vi.fn())
const getStudentRecordsTimeline = vi.hoisted(() => vi.fn())
const getCommunications = vi.hoisted(() => vi.fn())
const getFeeRecords = vi.hoisted(() => vi.fn())
const getFeeAdjustments = vi.hoisted(() => vi.fn())
const getFeePeriods = vi.hoisted(() => vi.fn())

vi.mock('@/api/studentAttendance', () => ({ getAttendanceByStudent }))
vi.mock('@/api/studentRecords', () => ({ getStudentRecordsTimeline }))
vi.mock('@/api/studentCommunications', () => ({
  getCommunications,
  deleteCommunication: vi.fn(),
}))
vi.mock('@/api/fees', () => ({
  getFeeRecords,
  getFeeAdjustments,
  getFeePeriods,
  payFeeRecord: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/domainBus', () => ({
  domainBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  RECORD_EVENTS: {},
  STUDENT_EVENTS: {},
}))
vi.mock('@/stores/studentRecords', () => ({ useStudentRecordsStore: () => ({}) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import AttendanceTab from '../AttendanceTab.vue'
import RecordsTab from '../RecordsTab.vue'
import CommunicationTab from '../CommunicationTab.vue'
import FeesTab from '../FeesTab.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getAttendanceByStudent.mockResolvedValue({ data: { items: [], counts: {} } })
  getStudentRecordsTimeline.mockResolvedValue({ data: { items: [] } })
  getCommunications.mockResolvedValue({ data: { items: [] } })
  getFeeRecords.mockResolvedValue({ items: [] })
  getFeeAdjustments.mockResolvedValue({ items: [] })
  getFeePeriods.mockResolvedValue([])
})

// 把 element-plus 元件 stub 成 true（不渲染 scoped slot），避免 <el-table>
// 的 #default="{ row }" 在無資料時解構 undefined 崩潰，遮蔽本測試真正要驗的
// api 呼叫次數。
const EL_STUBS: Record<string, boolean> = {}
for (const n of [
  'el-table', 'el-table-column', 'el-tag', 'el-button', 'el-select', 'el-option',
  'el-input', 'el-input-number', 'el-date-picker', 'el-empty', 'el-tabs', 'el-tab-pane',
  'el-tooltip', 'el-icon', 'el-dialog', 'el-radio-group', 'el-radio-button', 'el-card',
  'el-descriptions', 'el-descriptions-item', 'el-form', 'el-form-item', 'el-row', 'el-col',
  'el-skeleton', 'el-popconfirm', 'el-switch', 'el-segmented', 'el-divider', 'el-alert',
  'el-scrollbar', 'el-badge', 'el-avatar', 'el-image', 'el-progress',
]) EL_STUBS[n] = true

async function mountTab(Comp: unknown) {
  const wrapper = shallowMount(Comp as never, {
    props: { studentId: 1, active: true },
    global: { stubs: EL_STUBS },
  })
  await flushPromises()
  return wrapper
}

describe('學生分頁切換 studentId 時必須 refetch（P1）', () => {
  it('AttendanceTab：切換學生後重新載入新學生的出席', async () => {
    const wrapper = await mountTab(AttendanceTab)
    expect(getAttendanceByStudent).toHaveBeenCalledTimes(1)
    expect(getAttendanceByStudent.mock.calls[0][0]).toBe(1)

    await wrapper.setProps({ studentId: 2 })
    await flushPromises()

    expect(getAttendanceByStudent).toHaveBeenCalledTimes(2)
    expect(getAttendanceByStudent.mock.calls[1][0]).toBe(2)
  })

  it('RecordsTab：切換學生後重新載入新學生的教務紀錄', async () => {
    const wrapper = await mountTab(RecordsTab)
    expect(getStudentRecordsTimeline).toHaveBeenCalledTimes(1)
    expect(getStudentRecordsTimeline.mock.calls[0][0].student_id).toBe(1)

    await wrapper.setProps({ studentId: 2 })
    await flushPromises()

    expect(getStudentRecordsTimeline).toHaveBeenCalledTimes(2)
    expect(getStudentRecordsTimeline.mock.calls[1][0].student_id).toBe(2)
  })

  it('CommunicationTab：切換學生後重新載入新學生的家長溝通', async () => {
    const wrapper = await mountTab(CommunicationTab)
    expect(getCommunications).toHaveBeenCalledTimes(1)
    expect(getCommunications.mock.calls[0][0].student_id).toBe(1)

    await wrapper.setProps({ studentId: 2 })
    await flushPromises()

    expect(getCommunications).toHaveBeenCalledTimes(2)
    expect(getCommunications.mock.calls[1][0].student_id).toBe(2)
  })

  it('FeesTab：切換學生後重新載入新學生的學費', async () => {
    const wrapper = await mountTab(FeesTab)
    expect(getFeeRecords).toHaveBeenCalledTimes(1)
    expect(getFeeRecords.mock.calls[0][0].student_id).toBe(1)

    await wrapper.setProps({ studentId: 2 })
    await flushPromises()

    expect(getFeeRecords).toHaveBeenCalledTimes(2)
    expect(getFeeRecords.mock.calls[1][0].student_id).toBe(2)
  })
})

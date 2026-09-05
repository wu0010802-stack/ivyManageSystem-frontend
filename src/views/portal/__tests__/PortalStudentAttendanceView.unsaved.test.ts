import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 本頁自 2026-07-27 起會讀 route.query.classroom_id（首頁班級卡的 deep link），
// 沒有 router 也沒有 mock 時 useRoute() 會回 undefined，setup 階段就爆。
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(),
  getMyClassAttendance: vi.fn(),
  batchSaveClassAttendance: vi.fn(),
  getMyClassAttendanceMonthly: vi.fn(),
}))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/error', () => ({ apiError: (_e: unknown, fallback: string) => fallback }))
vi.mock('@/utils/offlineQueue', () => ({
  enqueueOp: vi.fn(),
  countPending: vi.fn().mockResolvedValue(0),
  listOps: vi.fn().mockResolvedValue([]),
  listOtherUsersPendingOps: vi.fn().mockResolvedValue([]),
  removeOp: vi.fn(),
  OP_KINDS: { CLASS_ATTENDANCE: 'class_attendance' },
  OP_STATUS: { NEEDS_REVIEW: 'needs_review' },
}))
vi.mock('@/utils/attendanceSync', () => ({
  flushClassAttendanceQueue: vi.fn().mockResolvedValue({ succeeded: 0, needs_review: 0, auth_failed: false }),
}))
vi.mock('@/composables/useOnlineStatus', async () => {
  const { ref } = await import('vue')
  return { useOnlineStatus: () => ({ isOnline: ref(true) }), isNetworkError: vi.fn(() => false) }
})
vi.mock('@/utils/auth', () => ({ getUserInfo: vi.fn(() => ({ id: 1 })) }))
// fetchClassrooms 以 route.query.classroom_id 做 deep-link 預選班級；未 mock 時
// useRoute() 回 undefined，存取 .query 拋錯會被 catch 吞掉，導致 classroomId 始終
// 為 null、fetchDailyAttendance/fetchMonthly 提前 return，競態行為根本測不到。
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), onBeforeRouteLeave: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  getMyStudents,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'
import { ElMessageBox } from 'element-plus'
import { enqueueOp } from '@/utils/offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'
import PortalStudentAttendanceView from '../PortalStudentAttendanceView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

async function mountView() {
  vi.mocked(getMyStudents).mockResolvedValue({
    data: { classrooms: [{ classroom_id: 1, classroom_name: '蘋果班' }] },
  } as never)
  vi.mocked(getMyClassAttendance).mockResolvedValue({ data: { records: [{ student_id: 1, status: '病假', remark: '測試備註' }, { student_id: 2, status: '事假' }, { student_id: 3 }, { student_id: 4 }] } } as never)
  vi.mocked(getMyClassAttendanceMonthly).mockResolvedValue({ data: { tag: 'init' } } as never)
  const wrapper = mount(PortalStudentAttendanceView, {
    global: {
      stubs: {
        StudentAttendanceTabs: { name: 'StudentAttendanceTabs', props: ['activeTab', 'classroomId'], template: '<div><slot name="daily" /></div>' },
        StudentRollcallTable: true,
        StudentMonthlyStats: true,
        StudentOfflinePanel: true,
        'el-alert': true,
        'el-button': { name: 'ElButton', props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
        'el-date-picker': { name: 'ElDatePicker', props: ['modelValue'], template: '<div />' },
        PortalPageHeader: true,
      },
    },
  })
  await flushPromises()
  mounted.push(wrapper)
  return wrapper
}

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => mounted.splice(0).forEach(w => w.unmount()))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(batchSaveClassAttendance).mockResolvedValue({ data: {} } as never)
  vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
  vi.mocked(isNetworkError).mockReturnValue(false)
})


function edit(w: Awaited<ReturnType<typeof mountView>>, id = 3, status = '遲到') {
  w.findComponent({ name: 'StudentRollcallTable' }).vm.$emit('update-status', { student_id: id, status, remark: '' })
}
function unloadBlocked() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('點名未儲存保護與批次操作', () => {
  it('批次只填未點名者，保留既有假別與本次手動修改', async () => {
    const w = await mountView()
    edit(w)
    w.findComponent({ name: 'StudentRollcallTable' }).vm.$emit('quick-set-all', '缺席')
    await flushPromises()
    const students = w.findComponent({ name: 'StudentRollcallTable' }).props('students')
    expect(students.map((r: { status: string }) => r.status)).toEqual(['病假', '事假', '遲到', '缺席'])
  })

  it('剛進頁不攔截，修改後重新整理需提醒', async () => {
    const w = await mountView()
    expect(unloadBlocked()).toBe(false)
    edit(w)
    await flushPromises()
    expect(unloadBlocked()).toBe(true)
  })

  it.each(['classroom', 'date', 'tab'])('取消切換 %s 保留原範圍與未存內容', async (field) => {
    const w = await mountView()
    edit(w)
    await flushPromises()
    const calls = vi.mocked(getMyClassAttendance).mock.calls.length
    const tabs = w.findComponent({ name: 'StudentAttendanceTabs' })
    const date = w.findComponent({ name: 'ElDatePicker' })
    const original = date.props('modelValue')
    if (field === 'classroom') tabs.vm.$emit('update:classroomId', 2)
    if (field === 'tab') tabs.vm.$emit('update:activeTab', 'monthly')
    if (field === 'date') date.vm.$emit('update:modelValue', '2026-09-01')
    await flushPromises()
    expect(tabs.props('classroomId')).toBe(1)
    expect(tabs.props('activeTab')).toBe('daily')
    expect(date.props('modelValue')).toBe(original)
    expect(getMyClassAttendance).toHaveBeenCalledTimes(calls)
    expect(w.findComponent({ name: 'StudentRollcallTable' }).props('students')[2].status).toBe('遲到')
  })

  it('儲存成功後解除未存保護', async () => {
    const w = await mountView()
    edit(w)
    await flushPromises()
    expect(unloadBlocked()).toBe(true)
    await (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()
    expect(unloadBlocked()).toBe(false)
    expect(batchSaveClassAttendance).toHaveBeenCalledWith(expect.objectContaining({ entries: expect.arrayContaining([{ student_id: 3, status: '遲到', remark: null }]) }))
  })

  it('儲存失敗仍保留未存保護', async () => {
    const w = await mountView()
    edit(w)
    vi.mocked(batchSaveClassAttendance).mockRejectedValueOnce(new Error('測試失敗'))
    await (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()
    expect(unloadBlocked()).toBe(true)
  })

  it('網路異常成功入離線佇列後才解除未存保護', async () => {
    const w = await mountView()
    edit(w)
    vi.mocked(batchSaveClassAttendance).mockRejectedValueOnce(new Error('離線'))
    vi.mocked(isNetworkError).mockReturnValue(true)
    vi.mocked(enqueueOp).mockResolvedValueOnce('test-op' as never)
    await (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()
    expect(enqueueOp).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }))
    expect(unloadBlocked()).toBe(false)
  })

  it('儲存中不能切換日期或修改點名，送出的班級與內容固定', async () => {
    const w = await mountView()
    edit(w)
    const pending = deferred<never>()
    vi.mocked(batchSaveClassAttendance).mockReturnValueOnce(pending.promise)
    const saving = (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()
    w.findComponent({ name: 'StudentAttendanceTabs' }).vm.$emit('update:classroomId', 2)
    edit(w, 3, '缺席')
    await flushPromises()
    expect(w.findComponent({ name: 'StudentAttendanceTabs' }).props('classroomId')).toBe(1)
    expect(w.findComponent({ name: 'StudentRollcallTable' }).props('students')[2].status).toBe('遲到')
    pending.resolve({ data: {} } as never)
    await saving
  })
})

describe('點名保護邊界', () => {
  it('批次預選出席也算待儲存，復原後回到未操作狀態', async () => {
    const w = await mountView()
    w.findComponent({ name: 'StudentRollcallTable' }).vm.$emit('quick-set-all', '出席')
    await flushPromises()
    expect(unloadBlocked()).toBe(true)
    expect(w.text()).toContain('有 2 筆未儲存')
    const undo = w.findAllComponents({ name: 'ElButton' }).find(button => button.text().includes('復原批次點名'))
    expect(undo).toBeDefined()
    await undo!.vm.$emit('click')
    await flushPromises()
    expect(unloadBlocked()).toBe(false)
    expect(w.findComponent({ name: 'StudentRollcallTable' }).props('pendingCount')).toBe(2)
  })

  it('明確捨棄後才切到新班級並解除舊草稿提醒', async () => {
    const w = await mountView()
    edit(w)
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm')
    w.findComponent({ name: 'StudentAttendanceTabs' }).vm.$emit('update:classroomId', 2)
    await flushPromises()
    expect(w.findComponent({ name: 'StudentAttendanceTabs' }).props('classroomId')).toBe(2)
    expect(getMyClassAttendance).toHaveBeenLastCalledWith(expect.objectContaining({ classroom_id: 2 }))
    expect(unloadBlocked()).toBe(false)
  })

  it('離線佇列也寫入失敗時保留修改供重試', async () => {
    const w = await mountView()
    edit(w)
    vi.mocked(batchSaveClassAttendance).mockRejectedValueOnce(new Error('離線'))
    vi.mocked(isNetworkError).mockReturnValue(true)
    vi.mocked(enqueueOp).mockRejectedValueOnce(new Error('儲存空間不足'))
    await (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()
    expect(unloadBlocked()).toBe(true)
    expect(w.findComponent({ name: 'StudentRollcallTable' }).props('students')[2].status).toBe('遲到')
  })
})

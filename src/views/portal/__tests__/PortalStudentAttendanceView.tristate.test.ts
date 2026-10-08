import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 到園點名頁的「未點名」語意（2026-09-14 UI/UX 審查 P1，業主裁定 B）。
 *
 * 改版前：載入時把 `status=null` 預選成「出席」，儲存永遠送全班 27 筆——老師
 * 什麼都不碰按下儲存，全班就被記成出席，該發的缺席通知也不會發，而首頁徽章
 * 仍顯示「到園點名 27」（兩處口徑矛盾）。
 *
 * 改版後：未點名就是未點名，儲存只送已點的，未點的不寫任何紀錄。
 */

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
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
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  getMyStudents,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'
import { ElMessageBox } from 'element-plus'
import PortalStudentAttendanceView from '../PortalStudentAttendanceView.vue'

const ROSTER = [
  { student_id: 1, student_no: '01', name: '王小明', status: '出席', remark: null },
  { student_id: 2, student_no: '02', name: '陳語彤', status: '病假', remark: '家長申請#12' },
  { student_id: 3, student_no: '03', name: '林承翰', status: null, remark: null },
  { student_id: 4, student_no: '04', name: '張詠晴', status: null, remark: null },
]

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(batchSaveClassAttendance).mockResolvedValue({ data: {} } as never)
  vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
  vi.mocked(getMyClassAttendanceMonthly).mockResolvedValue({ data: null } as never)
})

async function mountView(records = ROSTER, extra: Record<string, unknown> = {}) {
  vi.mocked(getMyStudents).mockResolvedValue({
    data: { classrooms: [{ classroom_id: 1, classroom_name: '天堂鳥' }] },
  } as never)
  vi.mocked(getMyClassAttendance).mockResolvedValue({ data: { records, ...extra } } as never)
  const wrapper = mount(PortalStudentAttendanceView, {
    global: {
      stubs: {
        StudentAttendanceTabs: {
          name: 'StudentAttendanceTabs',
          props: ['activeTab', 'classroomId', 'classrooms'],
          template: '<div><slot name="daily" /></div>',
        },
        StudentRollcallTable: { name: 'StudentRollcallTable', props: ['students', 'pendingCount', 'emptyHint'], template: '<div />' },
        StudentRollcallFilterBar: { name: 'StudentRollcallFilterBar', props: ['summary', 'modelValue', 'search'], template: '<div />' },
        StudentMonthlyStats: true,
        StudentOfflinePanel: true,
        PortalPageHeader: { name: 'PortalPageHeader', props: ['title', 'subtitle'], template: '<div />' },
        'el-alert': true,
        'el-button': { name: 'ElButton', props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
        'el-date-picker': { name: 'ElDatePicker', props: ['modelValue'], template: '<div />' },
      },
    },
  })
  await flushPromises()
  mounted.push(wrapper)
  return wrapper
}

const table = (w: Awaited<ReturnType<typeof mountView>>) =>
  w.findComponent({ name: 'StudentRollcallTable' })
const bar = (w: Awaited<ReturnType<typeof mountView>>) =>
  w.findComponent({ name: 'StudentRollcallFilterBar' })
const save = (w: Awaited<ReturnType<typeof mountView>>) =>
  (w.vm as unknown as { saveDailyAttendance(): Promise<void> }).saveDailyAttendance()

describe('載入不再預選出席', () => {
  it('後端回 null 的列在畫面上維持未點名', async () => {
    const w = await mountView()
    expect(table(w).props('students').map((r: { status: unknown }) => r.status))
      .toEqual(['出席', '病假', null, null])
  })

  it('未點名人數等於沒有狀態的列數', async () => {
    const w = await mountView()
    expect(table(w).props('pendingCount')).toBe(2)
  })
})

describe('儲存只送已點名的（裁定 B）', () => {
  it('未點名的列不進 payload', async () => {
    const w = await mountView()
    await save(w)
    const payload = vi.mocked(batchSaveClassAttendance).mock.calls[0][0] as {
      entries: { student_id: number }[]
    }
    expect(payload.entries.map((e) => e.student_id)).toEqual([1, 2])
  })

  it('全班都沒點名時不打 API，也不假裝儲存成功', async () => {
    const w = await mountView([
      { student_id: 1, student_no: '01', name: '王小明', status: null, remark: null },
    ])
    await save(w)
    expect(batchSaveClassAttendance).not.toHaveBeenCalled()
  })

  it('點過之後該列就會被送出', async () => {
    const w = await mountView()
    table(w).vm.$emit('update-status', { student_id: 3, status: '缺席', remark: '' })
    await flushPromises()
    await save(w)
    const payload = vi.mocked(batchSaveClassAttendance).mock.calls[0][0] as {
      entries: { student_id: number; status: string }[]
    }
    expect(payload.entries).toContainEqual({ student_id: 3, status: '缺席', remark: null })
  })
})

describe('儲存列講的是未點名人數', () => {
  it('還有人沒點時講還有幾位，並說明未點名不會被記錄', async () => {
    const w = await mountView()
    expect(w.text()).toContain('還有 2 位未點名')
    expect(w.text()).toContain('儲存後仍維持未點名')
  })

  it('全部點完且無未存修改時回報已點完', async () => {
    const w = await mountView([
      { student_id: 1, student_no: '01', name: '王小明', status: '出席', remark: null },
    ])
    expect(w.text()).toContain('今天已全部點完')
  })

  it('全部點完但有未存修改時講未儲存筆數', async () => {
    const w = await mountView([
      { student_id: 1, student_no: '01', name: '王小明', status: '出席', remark: null },
    ])
    table(w).vm.$emit('update-status', { student_id: 1, status: '遲到', remark: '' })
    await flushPromises()
    expect(w.text()).toContain('有 1 筆未儲存')
  })
})

describe('批次只補未點名者', () => {
  it('已點名的列不被批次覆寫', async () => {
    const w = await mountView()
    table(w).vm.$emit('quick-set-all', '出席')
    await flushPromises()
    expect(table(w).props('students').map((r: { status: unknown }) => r.status))
      .toEqual(['出席', '病假', '出席', '出席'])
  })
})

describe('篩選與搜尋', () => {
  it('篩未點名時只把未點名的交給名冊', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:modelValue', 'unmarked')
    await flushPromises()
    expect(table(w).props('students').map((r: { student_id: number }) => r.student_id)).toEqual([3, 4])
  })

  it('批次按鈕的人數用全班未點名數，不受篩選影響', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:modelValue', '出席')
    await flushPromises()
    expect(table(w).props('students')).toHaveLength(1)
    expect(table(w).props('pendingCount')).toBe(2)
  })

  it('搜尋姓名做部分比對', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:search', '語彤')
    await flushPromises()
    expect(table(w).props('students').map((r: { student_id: number }) => r.student_id)).toEqual([2])
  })

  it('篩選後沒有人時給的是篩選說明，不是「尚無學生」', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:search', '查無此人')
    await flushPromises()
    expect(table(w).props('students')).toHaveLength(0)
    expect(table(w).props('emptyHint')).toContain('沒有符合')
  })

  it('統計給的是全班數字，不是篩選後的', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:modelValue', 'unmarked')
    await flushPromises()
    expect(bar(w).props('summary')).toMatchObject({ total: 4, unmarked: 2, present: 1, leave: 1 })
  })

  it('換日期時清掉篩選與搜尋，免得新名冊看起來是空的', async () => {
    const w = await mountView()
    bar(w).vm.$emit('update:search', '語彤')
    bar(w).vm.$emit('update:modelValue', 'unmarked')
    await flushPromises()
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm')
    w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-09-15')
    await flushPromises()
    expect(bar(w).props('search')).toBe('')
    expect(bar(w).props('modelValue')).toBe('all')
  })
})

describe('上次儲存', () => {
  it('後端有回時顯示時刻與記錄者', async () => {
    const w = await mountView(ROSTER, {
      last_recorded_at: '2026-09-14T08:41:00',
      last_recorded_by: '吳逸倫',
    })
    expect(w.findComponent({ name: 'PortalPageHeader' }).props('subtitle'))
      .toContain('上次儲存 08:41・吳逸倫')
  })

  it('還沒人點過時不顯示這一行', async () => {
    const w = await mountView(ROSTER, { last_recorded_at: null, last_recorded_by: null })
    expect(w.findComponent({ name: 'PortalPageHeader' }).props('subtitle'))
      .not.toContain('上次儲存')
  })

  it('頁首帶班級與人數', async () => {
    const w = await mountView()
    expect(w.findComponent({ name: 'PortalPageHeader' }).props('subtitle')).toContain('天堂鳥')
    expect(w.findComponent({ name: 'PortalPageHeader' }).props('subtitle')).toContain('4 人')
  })
})

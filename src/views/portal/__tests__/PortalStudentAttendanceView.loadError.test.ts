import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
* （載入失敗測試沿用 tristate 的 mock 組）
 * 原註：到園點名頁的「未點名」語意（2026-09-14 UI/UX 審查 P1，業主裁定 B）。
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
  getMyClassAttendanceMonthly,
} from '@/api/portal'
import PortalStudentAttendanceView from '../PortalStudentAttendanceView.vue'

const STUBS = {
  StudentAttendanceTabs: {
    name: 'StudentAttendanceTabs',
    props: ['activeTab', 'classroomId', 'classrooms'],
    template: '<div><slot name="daily" /><slot name="monthly" /></div>',
  },
  StudentRollcallTable: { name: 'StudentRollcallTable', props: ['students', 'emptyHint'], template: '<div class="table">{{ emptyHint }}</div>' },
  StudentRollcallFilterBar: true,
  StudentMonthlyStats: { name: 'StudentMonthlyStats', template: '<div class="monthly" />' },
  StudentOfflinePanel: true,
  PortalPageHeader: true,
  'el-alert': true,
  'el-button': true,
  'el-date-picker': true,
}
const mounted: ReturnType<typeof mount>[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyStudents).mockResolvedValue({ data: { classrooms: [{ classroom_id: 1, classroom_name: '天堂鳥' }] } } as never)
  vi.mocked(getMyClassAttendance).mockResolvedValue({ data: { records: [] } } as never)
  vi.mocked(getMyClassAttendanceMonthly).mockResolvedValue({ data: null } as never)
})
async function mountView() {
  const w = mount(PortalStudentAttendanceView, { global: { stubs: STUBS } })
  await flushPromises()
  mounted.push(w)
  return w
}

describe('PortalStudentAttendanceView 載入失敗', () => {
  it('班級失敗 → 顯示班級錯誤與重試', async () => {
    vi.mocked(getMyStudents).mockRejectedValueOnce(new Error('boom'))
    const w = await mountView()
    expect(w.find('[data-test="classrooms-error"]').exists()).toBe(true)
  })

  it('當日點名失敗 → 顯示錯誤，不顯示「尚無學生」；重試成功後回到名冊', async () => {
    vi.mocked(getMyClassAttendance).mockRejectedValueOnce(new Error('boom'))
    const w = await mountView()
    expect(w.find('[data-test="daily-error"]').exists()).toBe(true)
    expect(w.find('.table').exists()).toBe(false)
    vi.mocked(getMyClassAttendance).mockResolvedValueOnce({
      data: { records: [{ student_id: 1, name: '王小明', status: null, remark: null }] },
    } as never)
    w.findAllComponents({ name: 'PortalErrorState' }).find((c) => c.attributes('data-test') === 'daily-error')!.vm.$emit('retry')
    await flushPromises()
    expect(w.find('[data-test="daily-error"]').exists()).toBe(false)
    expect(w.find('.table').exists()).toBe(true)
  })

  it('月統計失敗 → 顯示錯誤，不顯示「尚未載入月度資料」', async () => {
    vi.mocked(getMyClassAttendanceMonthly).mockRejectedValue(new Error('boom'))
    const w = await mountView()
    const vm = w.vm as unknown as { fetchMonthly: () => Promise<void> }
    await vm.fetchMonthly()
    await flushPromises()
    expect(w.find('[data-test="monthly-error"]').exists()).toBe(true)
    expect(w.find('.monthly').exists()).toBe(false)
  })
})

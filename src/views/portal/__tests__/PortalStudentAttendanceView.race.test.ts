import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: { value: true } }),
  isNetworkError: vi.fn(() => false),
}))
vi.mock('@/utils/auth', () => ({ getUserInfo: vi.fn(() => ({ id: 1 })) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  getMyStudents,
  getMyClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'
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
  vi.mocked(getMyClassAttendance).mockResolvedValue({ data: { records: [{ student_id: 99 }] } } as never)
  vi.mocked(getMyClassAttendanceMonthly).mockResolvedValue({ data: { tag: 'init' } } as never)
  const wrapper = mount(PortalStudentAttendanceView, {
    global: {
      stubs: {
        StudentAttendanceTabs: true,
        StudentRollcallTable: true,
        StudentMonthlyStats: true,
        StudentOfflinePanel: true,
        'el-alert': true,
        'el-button': true,
        'el-date-picker': true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PortalStudentAttendanceView 請求競態', () => {
  it('每日點名：切班 A(慢)→B(快)，舊班慢回應不得覆寫最新名冊', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      fetchDailyAttendance: () => Promise<void>
      dailyRecords: Array<{ student_id?: number }>
      dailyLoading: boolean
    }

    const slow = deferred<{ data: { records: Array<{ student_id: number }> } }>()
    vi.mocked(getMyClassAttendance)
      .mockReturnValueOnce(slow.promise as never) // A 班（慢）
      .mockResolvedValueOnce({ data: { records: [{ student_id: 2 }] } } as never) // B 班（快）

    const slowRun = vm.fetchDailyAttendance()
    await vm.fetchDailyAttendance()
    expect(vm.dailyRecords.map((r) => r.student_id)).toEqual([2])

    slow.resolve({ data: { records: [{ student_id: 1 }] } })
    await slowRun
    expect(vm.dailyRecords.map((r) => r.student_id)).toEqual([2])
    expect(vm.dailyLoading).toBe(false)
  })

  it('月統計：切月 A(慢)→B(快)，舊月慢回應不得覆寫最新月度資料', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      fetchMonthly: () => Promise<void>
      monthlyData: { tag?: string } | null
      monthlyLoading: boolean
    }

    const slow = deferred<{ data: { tag: string } }>()
    vi.mocked(getMyClassAttendanceMonthly)
      .mockReturnValueOnce(slow.promise as never) // A 月（慢）
      .mockResolvedValueOnce({ data: { tag: 'B' } } as never) // B 月（快）

    const slowRun = vm.fetchMonthly()
    await vm.fetchMonthly()
    expect(vm.monthlyData?.tag).toBe('B')

    slow.resolve({ data: { tag: 'A' } })
    await slowRun
    expect(vm.monthlyData?.tag).toBe('B')
    expect(vm.monthlyLoading).toBe(false)
  })
})

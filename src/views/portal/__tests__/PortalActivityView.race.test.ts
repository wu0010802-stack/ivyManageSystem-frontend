import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeMock, replaceMock } = vi.hoisted(() => ({
  routeMock: { query: { tab: 'attendance' } as Record<string, string> },
  replaceMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ replace: replaceMock }),
}))
vi.mock('@/api/activity', () => ({
  getPortalActivityRegistrations: vi.fn(),
  getPortalAttendanceSessions: vi.fn(),
  getPortalAttendanceSession: vi.fn(),
  batchUpdatePortalAttendance: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  batchUpdatePortalAttendance,
  getPortalActivityRegistrations,
  getPortalAttendanceSession,
  getPortalAttendanceSessions,
} from '@/api/activity'
import PortalActivityView from '../PortalActivityView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const SessionListStub = defineComponent({
  name: 'ActivitySessionList',
  props: ['sessions'],
  template: '<div data-test="sessions">{{ JSON.stringify(sessions) }}</div>',
})

function detail(...attendance: Array<boolean | null>) {
  const values = attendance.length > 0 ? attendance : [null]
  return {
    data: {
      id: 101,
      course_name: '音樂律動',
      session_date: '2026-07-14',
      students: values.map((isPresent, index) => ({
        registration_id: 11 + index,
        student_name: `學生${index + 1}`,
        class_name: '蘋果班',
        is_present: isPresent,
        attendance_notes: '',
      })),
    },
  }
}

async function mountView() {
  vi.mocked(getPortalActivityRegistrations).mockResolvedValue({
    data: { classrooms: [] },
  } as never)
  vi.mocked(getPortalAttendanceSessions).mockResolvedValue({
    data: [{ id: 101, course_name: '音樂律動', recorded_count: 0, present_count: 0 }],
  } as never)
  vi.mocked(getPortalAttendanceSession).mockResolvedValue(detail(null) as never)
  vi.mocked(batchUpdatePortalAttendance).mockResolvedValue({ data: { updated: 1, skipped: 0 } } as never)
  const wrapper = mount(PortalActivityView, {
    global: {
      stubs: {
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': true,
        'el-empty': true,
        ActivityRegistrationPanel: true,
        ActivitySessionList: SessionListStub,
        ActivityRollcallDrawer: true,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  routeMock.query = { tab: 'attendance' }
})

describe('PortalActivityView 場次請求競態', () => {
  it('快速切月份/日期時，較舊的慢回應不得覆寫最新場次', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      loadAttendanceSessions: () => Promise<void>
      sessions: Array<{ id: number }>
    }
    const old = deferred<{ data: Array<{ id: number; course_name: string }> }>()
    vi.mocked(getPortalAttendanceSessions)
      .mockReturnValueOnce(old.promise as never)
      .mockResolvedValueOnce({ data: [{ id: 202, course_name: '新日期' }] } as never)

    const oldRun = vm.loadAttendanceSessions()
    await vm.loadAttendanceSessions()
    expect(vm.sessions.map((s) => s.id)).toEqual([202])

    old.resolve({ data: [{ id: 101, course_name: '舊日期' }] })
    await oldRun
    expect(vm.sessions.map((s) => s.id)).toEqual([202])
  })

  it('portal 部分點名成功時重抓權威名冊，不用 skipped 輸入樂觀改 counts', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      sessions: Array<{ id: number; present_count: number; recorded_count: number }>
      drawerSession: { students: Array<{ is_present: boolean | null }> } | null
      drawerVisible: boolean
      openRollcall: (row: { id: number }) => Promise<void>
      handleSave: (callback: () => void) => Promise<void>
      loadAttendanceSessions: () => Promise<void>
    }
    vi.mocked(getPortalAttendanceSession)
      .mockResolvedValueOnce(detail(null, null) as never)
      .mockResolvedValueOnce(detail(true, null) as never)
    vi.mocked(batchUpdatePortalAttendance).mockResolvedValueOnce({
      data: { updated: 1, skipped: 1 },
    } as never)
    vi.mocked(getPortalAttendanceSessions).mockResolvedValueOnce({
      data: [{ id: 101, course_name: '音樂律動', recorded_count: 1, present_count: 1 }],
    } as never)

    await vm.openRollcall(vm.sessions[0])
    vm.drawerSession!.students[0].is_present = true
    vm.drawerSession!.students[1].is_present = true
    await vm.handleSave(vm.loadAttendanceSessions)
    await flushPromises()

    expect(getPortalAttendanceSession).toHaveBeenCalledTimes(2)
    expect(vm.sessions[0].present_count).toBe(1)
    expect(vm.sessions[0].recorded_count).toBe(1)
    expect(vm.drawerSession!.students[0].is_present).toBe(true)
    expect(vm.drawerSession!.students[1].is_present).toBeNull()
    expect(vm.drawerVisible).toBe(true)
  })

  it('完整成功後重抓場次統計，不用載入時的舊名冊覆寫其他老師點名', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      sessions: Array<{ id: number; present_count: number; recorded_count: number }>
      drawerSession: { students: Array<{ is_present: boolean | null }> } | null
      openRollcall: (row: { id: number }) => void
    }
    vi.mocked(getPortalAttendanceSession).mockResolvedValueOnce(detail(null, null) as never)
    // 另一位老師在本 drawer 載入後，已先完成第 2 位學生的點名；月列表重抓時
    // 後端權威統計應為 2，不能由本地「舊第 2 位 + 新第 1 位」算成 1。
    vi.mocked(getPortalAttendanceSessions).mockResolvedValueOnce({
      data: [{ id: 101, course_name: '音樂律動', recorded_count: 2, present_count: 2 }],
    } as never)

    vm.openRollcall(vm.sessions[0])
    await flushPromises()
    vm.drawerSession!.students[0].is_present = true
    wrapper.findComponent({ name: 'ActivityRollcallDrawer' }).vm.$emit('save')
    await flushPromises()

    expect(getPortalAttendanceSessions).toHaveBeenCalledTimes(2)
    expect(vm.sessions[0].present_count).toBe(2)
    expect(vm.sessions[0].recorded_count).toBe(2)
  })
})

import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 課程點名｜場次列表。
 *
 * 2026-09-14 改版：以「週」為單位撈、今天固定在第一屏、點名改成獨立路由。
 * 原本這裡還有兩條屬於點名 drawer 的守衛（skipped 重抓、儲存後重抓權威名冊），
 * 已隨功能搬到 PortalActivityRollcallView.test.ts，不是跟著元件刪掉。
 */
vi.mock('@/api/activity', () => ({
  getPortalAttendanceSessions: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import { getPortalAttendanceSessions } from '@/api/activity'
import PortalActivityAttendanceView from '../PortalActivityAttendanceView.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ListStub = defineComponent({
  name: 'ActivitySessionList',
  props: ['sessions', 'overdue', 'loading', 'today', 'rangeLabel', 'mode', 'filterCourseId'],
  emits: ['shift-week', 'go-today', 'open-rollcall'],
  template:
    '<div data-test="list" :data-range="rangeLabel" :data-overdue="overdue.length">{{ sessions.map(s => s.id).join(",") }}</div>',
})

const HeaderStub = defineComponent({
  props: ['title', 'subtitle'],
  template: '<header>{{ title }}｜{{ subtitle }}</header>',
})

function row(over: Record<string, unknown> = {}) {
  return {
    id: 101,
    course_id: 1,
    course_name: '音樂律動',
    session_date: '2026-09-16',
    recorded_count: 0,
    present_count: 0,
    enrolled_count: 16,
    meeting_start_time: '16:10:00',
    meeting_end_time: '17:10:00',
    ...over,
  }
}

function mountRaw() {
  return mount(PortalActivityAttendanceView, {
    global: {
      stubs: { ActivitySessionList: ListStub, PortalPageHeader: HeaderStub },
      directives: { loading: () => {} },
    },
  })
}

async function mountView() {
  vi.mocked(getPortalAttendanceSessions).mockResolvedValue({ data: [row()] } as never)
  const wrapper = mountRaw()
  await flushPromises()
  return wrapper
}

type ListVm = {
  sessions: Array<{ id: number }>
  loadSessions: () => Promise<void>
  shiftWeek: (delta: number) => void
  goToday: () => void
  applyCustom: () => void
  openRollcall: (s: { id: number }) => void
}

/** 台北時間 2026-09-16（週三）早上八點 */
function freezeOnWednesday() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
}

beforeEach(() => {
  vi.clearAllMocks()
  push.mockClear()
  vi.useRealTimers()
})

describe('PortalActivityAttendanceView 場次載入', () => {
  it('進頁即載入本週場次，並另外撈一次漏點名視窗', async () => {
    const wrapper = await mountView()

    // 一次是本週、一次是過去 14 天的漏點名
    expect(getPortalAttendanceSessions).toHaveBeenCalledTimes(2)
    expect((wrapper.vm as unknown as ListVm).sessions.map((s) => s.id)).toEqual([101])
  })

  it('本週查詢帶的是週一到週日', async () => {
    freezeOnWednesday()
    await mountView()

    expect(vi.mocked(getPortalAttendanceSessions).mock.calls[0][0]).toEqual({
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    })
    vi.useRealTimers()
  })

  it('漏點名查詢回看 14 天', async () => {
    freezeOnWednesday()
    await mountView()

    expect(vi.mocked(getPortalAttendanceSessions).mock.calls[1][0]).toEqual({
      start_date: '2026-09-02',
      end_date: '2026-09-16',
    })
    vi.useRealTimers()
  })

  it('快速切換週次時，較舊的慢回應不得覆寫最新場次', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as ListVm
    const old = deferred<{ data: Array<{ id: number }> }>()
    vi.mocked(getPortalAttendanceSessions)
      .mockReturnValueOnce(old.promise as never)
      .mockResolvedValueOnce({ data: [row({ id: 202 })] } as never)

    const oldRun = vm.loadSessions()
    await vm.loadSessions()
    expect(vm.sessions.map((s) => s.id)).toEqual([202])

    old.resolve({ data: [row({ id: 101 })] })
    await oldRun
    expect(vm.sessions.map((s) => s.id)).toEqual([202])
  })

  it('切到上一週會重新查詢，範圍往前推七天', async () => {
    freezeOnWednesday()
    const wrapper = await mountView()
    vi.mocked(getPortalAttendanceSessions).mockClear()

    ;(wrapper.vm as unknown as ListVm).shiftWeek(-1)
    await flushPromises()

    expect(vi.mocked(getPortalAttendanceSessions).mock.calls[0][0]).toEqual({
      start_date: '2026-09-07',
      end_date: '2026-09-13',
    })
    vi.useRealTimers()
  })

  it('回到今天會回到本週', async () => {
    freezeOnWednesday()
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as ListVm
    vm.shiftWeek(-2)
    await flushPromises()
    vi.mocked(getPortalAttendanceSessions).mockClear()

    vm.goToday()
    await flushPromises()

    expect(vi.mocked(getPortalAttendanceSessions).mock.calls[0][0]).toEqual({
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    })
    vi.useRealTimers()
  })

  it('自訂範圍沒填日期就不查，直接提示', async () => {
    const wrapper = await mountView()
    vi.mocked(getPortalAttendanceSessions).mockClear()

    ;(wrapper.vm as unknown as ListVm).applyCustom()
    await flushPromises()

    expect(getPortalAttendanceSessions).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('請先選擇日期範圍')
  })

  it('點名導向獨立頁面，不再開 drawer', async () => {
    const wrapper = await mountView()

    ;(wrapper.vm as unknown as ListVm).openRollcall({ id: 101 })

    expect(push).toHaveBeenCalledWith({
      name: 'portal-activity-rollcall',
      params: { sessionId: '101' },
    })
  })

  it('載入失敗時提示，不讓畫面卡在載入中', async () => {
    vi.mocked(getPortalAttendanceSessions).mockRejectedValue(new Error('boom'))

    const wrapper = mountRaw()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('載入場次失敗')
    expect(wrapper.find('[data-test="list"]').exists()).toBe(true)
  })

  it('漏點名撈失敗時只是不顯示，不再彈一次錯誤蓋掉主要訊息', async () => {
    vi.mocked(getPortalAttendanceSessions)
      .mockResolvedValueOnce({ data: [row()] } as never)
      .mockRejectedValueOnce(new Error('boom'))

    const wrapper = mountRaw()
    await flushPromises()

    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="list"]').attributes('data-overdue')).toBe('0')
  })

  it('頁首摘要說明今天有幾堂沒點完', async () => {
    freezeOnWednesday()
    vi.mocked(getPortalAttendanceSessions).mockResolvedValue({
      data: [row({ id: 1, recorded_count: 0 }), row({ id: 2, recorded_count: 16 })],
    } as never)

    const wrapper = mountRaw()
    await flushPromises()

    expect(wrapper.text()).toContain('9月16日')
    expect(wrapper.text()).toContain('今天 2 堂，1 堂還沒點完')
    vi.useRealTimers()
  })
})

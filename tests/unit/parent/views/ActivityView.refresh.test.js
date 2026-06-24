// Low（2026-06-24 code review）：家長報名 / 候補轉正成功後，只刷新 fetchMy + fetchCourses，
// 漏刷 upcoming-sessions → hero 的「即將開課」與下次上課時間不更新（剛報名/轉正的課
// 不會出現在即將開課）。本測試鎖定：兩條成功路徑都必須一併刷新 upcoming sessions。
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  myRegistrations: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  registerCourses: vi.fn(),
  confirmPromotion: vi.fn(() => Promise.resolve({ data: { status: 'ok' } })),
  getRegistrationTime: vi.fn(() => Promise.resolve({ data: { is_open: true } })),
  getUpcomingSessions: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  getActivityBootstrap: vi.fn(() =>
    Promise.resolve({
      data: {
        registrations: { items: [] },
        courses: { items: [] },
        upcoming_sessions: { items: [] },
        registration_time: { is_open: true },
      },
    }),
  ),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '阿活' }],
    load: vi.fn(() => Promise.resolve()),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))

import {
  registerCourses,
  confirmPromotion,
  getUpcomingSessions,
} from '@/parent/api/activity'
import ActivityView from '@/parent/views/ActivityView.vue'

function mountView() {
  return mount(ActivityView, {
    attachTo: document.body,
    global: {
      stubs: {
        PullToRefresh: { template: '<div><slot /></div>' },
        ActivityHero: true,
        ChildContextHeader: true,
        ActivityCardList: true,
        ActivityRegisterSheet: true,
        RegistrationStatusList: true,
        ParentIcon: true,
      },
    },
  })
}

describe('ActivityView 報名/轉正後刷新 upcoming sessions', () => {
  beforeEach(() => {
    getUpcomingSessions.mockClear()
  })

  it('報名成功後刷新 upcoming sessions（hero 即將開課）', async () => {
    registerCourses.mockResolvedValueOnce({ data: { id: 1, courses: [] } })
    const w = mountView()
    await flushPromises()
    getUpcomingSessions.mockClear() // 排除 mount 期間呼叫，只看報名後

    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    expect(getUpcomingSessions).toHaveBeenCalled()
    w.unmount()
  })

  it('候補轉正確認成功後刷新 upcoming sessions', async () => {
    const w = mountView()
    await flushPromises()
    getUpcomingSessions.mockClear()

    await w.vm.onConfirmPromotion({ id: 5, courses: [] }, { course_id: 10 })
    await flushPromises()

    expect(confirmPromotion).toHaveBeenCalledWith(5, 10)
    expect(getUpcomingSessions).toHaveBeenCalled()
    w.unmount()
  })
})

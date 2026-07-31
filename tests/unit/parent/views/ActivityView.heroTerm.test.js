// 2026-07-31 稽核：家長端 hero 的「進行中」與「待繳」直接吃 filteredRegs（只依孩子篩），
// 把所有歷史學期的舊報名一起算進去——家長會看到早就結束的才藝仍顯示「進行中」，待繳
// 金額也把舊學期的欠費加總進來。應以目錄課程的學期（後端開放中的學期）收斂。
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi } from 'vitest'

const CURRENT = { school_year: 115, semester: 1 }
const OLD = { school_year: 114, semester: 2 }

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  myRegistrations: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  registerCourses: vi.fn(),
  confirmPromotion: vi.fn(),
  declinePromotion: vi.fn(),
  getRegistrationTime: vi.fn(() => Promise.resolve({ data: { open_at: null, close_at: '2999-01-01T00:00:00Z' } })),
  getUpcomingSessions: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  getActivityBootstrap: vi.fn(() =>
    Promise.resolve({
      data: {
        registrations: {
          items: [
            {
              id: 1,
              student_id: 1,
              ...CURRENT,
              is_paid: false,
              outstanding_amount: 1000,
              courses: [{ course_id: 11, name: '圍棋', status: 'enrolled' }],
            },
            {
              // 上學期的舊報名：已結束，不該再算進 hero
              id: 2,
              student_id: 1,
              ...OLD,
              is_paid: false,
              outstanding_amount: 500,
              courses: [{ course_id: 22, name: '陶土', status: 'enrolled' }],
            },
          ],
        },
        courses: {
          items: [
            {
              id: 11,
              name: '圍棋',
              price: 1000,
              ...CURRENT,
              capacity: 30,
              enrolled_count: 1,
              is_full: false,
              allow_waitlist: true,
            },
          ],
        },
        upcoming_sessions: { items: [] },
        registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
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

import ActivityView from '@/parent/views/ActivityView.vue'

describe('家長端才藝 hero 只計本學期', () => {
  it('「進行中」不含上學期的舊報名', async () => {
    const wrapper = mount(ActivityView, { global: { stubs: { PullToRefresh: true } } })
    await flushPromises()
    // 兩筆報名都是 enrolled，但只有 115-1 那筆屬於目錄學期
    expect(wrapper.vm.activeRegistrations).toBe(1)
  })

  it('「待繳」不含上學期的欠費', async () => {
    const wrapper = mount(ActivityView, { global: { stubs: { PullToRefresh: true } } })
    await flushPromises()
    // 1000（本學期）而非 1500（含上學期 500）
    expect(wrapper.vm.unpaidActivityFee).toBe(1000)
  })
})

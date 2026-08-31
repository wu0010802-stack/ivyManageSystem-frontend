import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PortalHomeView from '@/views/portal/PortalHomeView.vue'

// mock 底層 API（store 從 @/api/portalHome import）
vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({
    data: {
      me: { name: '老師' },
      today: {
        date: '2026-08-24',
        shift: { name: '早班', work_start: '07:30', work_end: '16:30' },
        attendance: { punch_in_at: '2026-08-24T08:02:00', punch_out_at: null, is_anomaly: false },
      },
      classrooms: [],
      actions: {
        unread_messages: 0,
        pending_substitute: 0,
        pending_swap: 0,
        pending_anomaly_confirms: 0,
        unread_announcements: 0,
      },
    },
  }),
}))

// mock 班級工作台摘要（Phase 2：首頁「現在該做」置頂卡資料源）
vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn().mockResolvedValue({
    classroom_id: 1,
    classroom_name: '小蜜蜂班',
    sticky_next: {
      kind: 'medication',
      student_name: '王小明',
      detail: '餵藥',
      due_at: '2026-08-24T11:30:00',
      deep_link: '/portal/class-hub?sheet=medication&id=5',
    },
    counts: {
      attendance_pending: 4,
      medications_pending: 2,
      observations_pending: 0,
      contact_books_pending: 17,
    },
  }),
}))

// mock 補休結餘 API（預設回有資料）
vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyLeaveQuotaExpiry: vi.fn().mockResolvedValue({
    data: {
      compensatory_balance: 12.5,
      earliest_expiring_grant: { expires_at: '2026-09-01', unexpired_hours: 4.0 },
      next_anniversary: '2027-04-15',
      expected_payout_month: '2026-10',
    },
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

function mountIt() {
  return mount(PortalHomeView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        PendingActionsCard: true,
        TodayFocusCard: true,
        ClassroomOpsCard: true,
        QuickLinksCard: true,
        ElButton: { template: '<button><slot /></button>' },
        ElCard: {
          template: '<div class="el-card"><slot name="header" /><slot /></div>',
        },
        ElIcon: { template: '<span class="el-icon"><slot /></span>' },
        Warning: { template: '<svg />' },
      },
    },
  })
}

describe('PortalHomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without crashing', async () => {
    expect(() => mountIt()).not.toThrow()
    await flushPromises()
  })

  it('renders greeting', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toMatch(/早安|午安|晚安|凌晨好|中午好/)
  })

  it('shows refresh button', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('button').exists()).toBe(true)
  })

  it('renders empty state when no classrooms', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('未綁定')
  })

  it('renders classrooms section title', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('我的班級')
  })

  // ── Phase 2 任務流首頁：hero + 現在該做 ─────────────────────

  it('hero 渲染日期、班次與打卡 chip', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('.home-hero').exists()).toBe(true)
    const text = w.text()
    expect(text).toContain('早班')
    expect(text).toContain('08:02')
  })

  it('打卡 chip 點擊導向 /portal/attendance', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mountIt()
    await flushPromises()
    await w.find('.home-hero__punch').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/attendance')
  })

  it('hub 有班級時渲染 TodayFocusCard', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('today-focus-card-stub').exists()).toBe(true)
  })

  it('hub 取得失敗（無班級/無權限）時隱藏 TodayFocusCard', async () => {
    const { getTodayHub } = await import('@/api/portalClassHub')
    getTodayHub.mockRejectedValueOnce(new Error('403'))
    const w = mountIt()
    await flushPromises()
    expect(w.find('today-focus-card-stub').exists()).toBe(false)
  })

  it('hub classroom_id=0（未綁班）時隱藏 TodayFocusCard', async () => {
    const { getTodayHub } = await import('@/api/portalClassHub')
    getTodayHub.mockResolvedValueOnce({ classroom_id: 0, classroom_name: '', sticky_next: null, counts: {} })
    const w = mountIt()
    await flushPromises()
    expect(w.find('today-focus-card-stub').exists()).toBe(false)
  })

  // ── 補休結餘 widget ───────────────────────────────────────

  it('renders leave-quota balance + earliest + anniversary + payout month', async () => {
    const w = mountIt()
    await flushPromises()
    const text = w.text()
    expect(text).toContain('12.5')
    expect(text).toContain('2026-09-01')
    expect(text).toContain('2027-04-15')
    expect(text).toContain('2026-10')
  })

  it('hides warning-row when no earliest_expiring_grant', async () => {
    const { getMyLeaveQuotaExpiry } = await import('@/api/portalLeaveQuotaExpiry')
    getMyLeaveQuotaExpiry.mockResolvedValueOnce({
      data: {
        compensatory_balance: 0,
        earliest_expiring_grant: null,
        next_anniversary: '2027-04-15',
        expected_payout_month: '2027-05',
      },
    })
    const w = mountIt()
    await flushPromises()
    expect(w.find('.warning-row').exists()).toBe(false)
  })

  it('hides leave-quota-card when API returns null (error)', async () => {
    const { getMyLeaveQuotaExpiry } = await import('@/api/portalLeaveQuotaExpiry')
    getMyLeaveQuotaExpiry.mockRejectedValueOnce(new Error('network error'))
    const w = mountIt()
    await flushPromises()
    expect(w.find('.leave-quota-card').exists()).toBe(false)
  })
})

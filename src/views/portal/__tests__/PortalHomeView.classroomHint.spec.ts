/**
 * 教師首頁「未綁定任何班級」須自帶可排查的線索（2026-08-14 staging 實例）。
 *
 * staging 上同名兩筆「吳逸倫」，班導師指派到其中一筆、登入帳號綁另一筆，畫面只寫
 * 「您目前未綁定任何班級」，老師既看不出自己在系統裡是哪一位，也看不出班級掛在
 * 同名的另一筆上。後端已補 me.employee_no / me.position 與 classrooms_hint。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createWebHistory } from 'vue-router'
import { ref } from 'vue'

const state = vi.hoisted(() => ({ summary: { value: null as unknown } }))

vi.mock('@/composables/usePortalDashboard', () => ({
  usePortalDashboard: () => ({
    summary: state.summary,
    loading: ref(false),
    error: ref(null),
    refresh: vi.fn(),
  }),
  broadcastDashboardInvalidate: vi.fn(),
  PORTAL_DASHBOARD_INVALIDATE_EVENT: 'portal-dashboard-invalidate',
}))

vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyLeaveQuotaExpiry: vi.fn(() =>
    Promise.resolve({
      data: {
        compensatory_balance: 0,
        earliest_expiring_grant: null,
        next_anniversary: null,
        expected_payout_month: null,
      },
    }),
  ),
}))

// 首頁 2026-09-14 併入班級功能格後多了這些依賴；本檔只關心空班級診斷文案，
// 一律給最小假資料，避免真的打 API。
vi.mock('@/composables/usePortalClassHub', () => ({
  usePortalClassHub: () => ({
    data: ref(null),
    loading: ref(false),
    error: ref(null),
    refresh: vi.fn(() => Promise.resolve()),
    decrementCount: vi.fn(),
  }),
}))

vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({ pendingCount: ref(0) }),
}))

vi.mock('@/api/portal', () => ({
  getPortalPickupPendingCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
}))

vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn(() => Promise.resolve({ data: [] })),
}))

import PortalHomeView from '../PortalHomeView.vue'

// 功能格的量體位抽屜深連結會在 setup 立刻讀 route.query，沒有 router 直接爆。
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

function summaryWith(overrides: Record<string, unknown> = {}) {
  return {
    me: {
      user_id: 2,
      employee_id: 52,
      employee_no: '115001',
      position: '司機',
      name: '吳逸倫',
      role: 'teacher',
    },
    today: { date: '2026-08-14', shift: null, attendance: null },
    classrooms: [],
    classrooms_hint: null,
    actions: {},
    ...overrides,
  }
}

const mountHome = async () => {
  const wrapper = mount(PortalHomeView, {
    global: {
      plugins: [ElementPlus, router],
      stubs: { PortalBatchMeasurementSheet: true, TodayFocusCard: true },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  state.summary.value = summaryWith()
})

describe('PortalHomeView 空班級診斷', () => {
  it('無班級時顯示目前身分的工號與職稱', async () => {
    const w = await mountHome()

    expect(w.text()).toContain('115001')
    expect(w.text()).toContain('司機')
  })

  it('後端給了 classrooms_hint 就照實顯示', async () => {
    state.summary.value = summaryWith({
      classrooms_hint: '系統中另有 1 位同名員工；你目前的身分是工號 115001，若人事已完成班級指派，請確認指派對象是這個工號。',
    })

    const w = await mountHome()

    expect(w.text()).toContain('同名員工')
    expect(w.text()).toContain('請確認指派對象是這個工號')
  })

  it('有班級時不顯示身分與提示（不干擾正常使用）', async () => {
    state.summary.value = summaryWith({
      classrooms: [{ classroom_id: 13, classroom_name: '天堂鳥', student_count: 20 }],
      classrooms_hint: null,
    })

    const w = await mountHome()

    expect(w.text()).not.toContain('您目前未綁定任何班級')
    expect(w.text()).not.toContain('目前身分')
  })
})

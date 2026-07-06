import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: vi.fn() }),
}))
let userInfoData: Record<string, unknown> = {}
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
}))

// 隔離 session watchdog：本測試不關心其內部實作，避免看門狗 tick 打到
// 上面 partial mock 的 @/utils/auth（缺 hasStoredUserInfo）而炸測試
// （PortalLayout 為完整 mount，SessionIdleDialog 會真的渲染，故補
// useSessionWatchdogState 回傳的 ref 形狀）。
vi.mock('@/composables/useSessionWatchdog', () => ({
  startSessionWatchdog: vi.fn(),
  stopSessionWatchdog: vi.fn(),
  useSessionWatchdogState: () => ({ countdownRemainingMs: { value: null } }),
  continueSession: vi.fn(),
  logoutNow: vi.fn(),
  IDLE_LOGOUT_FLAG_KEY: 'idle_logout_notice',
  LAST_ACTIVITY_KEY: 'session_last_activity_at',
}))
vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
}))
vi.mock('@/api/dismissalCalls', () => ({
  getPortalPendingCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
}))
vi.mock('@/api/portalMessages', () => ({
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
}))
vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn(() => Promise.resolve({ counts: {} })),
}))
vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(() => Promise.resolve()),
  endImpersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
  impersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
}))
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn(() => Promise.resolve({ data: [] })) }))
vi.mock('@/composables/usePortalSearch', () => ({
  usePortalSearch: () => ({ openPalette: vi.fn() }),
  installPortalSearchKeyboard: vi.fn(),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessageBox: Object.assign(vi.fn(() => Promise.resolve()), {
      alert: vi.fn(() => Promise.resolve()),
      confirm: vi.fn(() => Promise.resolve()),
    }),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const stubs = { PortalSearchPalette: true, OfflineIndicator: true, A11yMenu: true }
import PortalLayout from '@/layouts/PortalLayout.vue'

const SEL = '[data-test="portal-sidebar-toggle"]'

describe('PortalLayout — 手機漢堡鍵恢復側欄可達（P0）', () => {
  beforeEach(() => {
    localStorage.setItem('portal_layout_v', '1') // 防 onboarding setTimeout 干擾
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  })
  // RWD P0 後 PortalLayout 的 isMobile 來自 useIsMobile()（matchMedia 驅動，
  // 非 innerWidth），測試以 mock matchMedia 控制手機/桌機判定。
  function setMobileViewport(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches,
      media: '(max-width: 767.98px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  }
  afterEach(() => {
    setMobileViewport(false)
  })

  it('手機寬度顯示漢堡鍵，點擊後側欄開啟', async () => {
    setMobileViewport(true)
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()

    const burger = wrapper.find(SEL)
    expect(burger.exists()).toBe(true)
    expect(wrapper.find('.el-aside').classes()).not.toContain('sidebar-open')

    await burger.trigger('click')
    expect(wrapper.find('.el-aside').classes()).toContain('sidebar-open')
    wrapper.unmount()
  })

  it('桌機寬度不顯示漢堡鍵', async () => {
    setMobileViewport(false)
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(wrapper.find(SEL).exists()).toBe(false)
    wrapper.unmount()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMenu } from 'element-plus'

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
  // 娃娃車入口以 BUS_TRIPS_OPERATE 過濾；本檔測的是其他區塊，一律回 false
  hasPortalPermission: vi.fn(() => false),
}))

vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
}))
vi.mock('@/api/dismissalCalls', () => ({
  getPortalPendingCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
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
    localStorage.setItem('portal_layout_v', '2') // 防 onboarding setTimeout 干擾
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


describe('PortalLayout — 桌機側邊欄收合', () => {
  function prepareViewport(mobile = false) {
    const listeners: Array<(event: { matches: boolean }) => void> = []
    window.matchMedia = vi.fn().mockReturnValue({
      matches: mobile,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    })
    localStorage.setItem('portal_layout_v', '2')
    userInfoData = { role: 'teacher' }
    return listeners
  }

  it('桌機可收合成圖示導覽並再次展開', async () => {
    prepareViewport()
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    try {
      const button = wrapper.get('button[aria-label="收合側邊欄"]')
      expect(button.attributes('aria-expanded')).toBe('true')
      expect(wrapper.get('#portal-sidebar').attributes('style')).toContain('200px')
      await button.trigger('click')
      expect(button.attributes('aria-label')).toBe('展開側邊欄')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(wrapper.get('#portal-sidebar').attributes('style')).toContain('64px')
      expect(wrapper.getComponent(ElMenu).props('collapse')).toBe(true)
      expect(wrapper.get('.portal-logo').text()).not.toContain('教師專區')
      await button.trigger('click')
      expect(wrapper.get('#portal-sidebar').attributes('style')).toContain('200px')
      expect(wrapper.getComponent(ElMenu).props('collapse')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('桌機收合後切至手機仍為完整抽屜，回桌機保留收合狀態', async () => {
    const listeners = prepareViewport()
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    try {
      await wrapper.get('button[aria-label="收合側邊欄"]').trigger('click')
      listeners.forEach(listener => listener({ matches: true }))
      await flushPromises()
      expect(wrapper.find('button[aria-label="展開側邊欄"]').exists()).toBe(false)
      expect(wrapper.get('#portal-sidebar').attributes('style')).toContain('220px')
      expect(wrapper.getComponent(ElMenu).props('collapse')).toBe(false)
      await wrapper.get(SEL).trigger('click')
      expect(wrapper.get('#portal-sidebar').classes()).toContain('sidebar-open')
      await wrapper.get('.sidebar-overlay').trigger('click')
      expect(wrapper.get('#portal-sidebar').classes()).toContain('sidebar-hidden')
      listeners.forEach(listener => listener({ matches: false }))
      await flushPromises()
      expect(wrapper.get('#portal-sidebar').attributes('style')).toContain('64px')
      expect(wrapper.getComponent(ElMenu).props('collapse')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})

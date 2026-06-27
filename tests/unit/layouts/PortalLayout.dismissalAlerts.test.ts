/**
 * tests/unit/layouts/PortalLayout.dismissalAlerts.test.ts
 *
 * Task 2：驗證 PortalLayout 在 mount 時呼叫 initPortalDismissalAlerts()
 * 並在 unmount 時呼叫 teardownPortalDismissalAlerts()，
 * 接送徽章改讀 composable 的 live pendingCount。
 *
 * 沿用 PortalLayout.test.ts 的完整 mock 套組，補 usePortalDismissalAlerts mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

// ---- vue-router mock ----
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: routerPush }),
}))

// ---- auth utils mock ----
let userInfoData: Record<string, unknown> = {}
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
}))

// ---- portal API mocks ----
vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
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

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

// ---- composable mocks ----
vi.mock('@/composables/usePortalSearch', () => ({
  usePortalSearch: () => ({ openPalette: vi.fn() }),
  installPortalSearchKeyboard: vi.fn(),
}))

// ---- ElMessageBox mock（防止 onMounted 的導航更新提示干擾）----
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessageBox: Object.assign(vi.fn(() => Promise.resolve()), {
      alert: vi.fn(() => Promise.resolve()),
      confirm: vi.fn(() => Promise.resolve()),
    }),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  }
})

// ---- usePortalDismissalAlerts mock ----
const initMock = vi.fn()
const teardownMock = vi.fn()
const pendingCount = ref(0)
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  initPortalDismissalAlerts: () => initMock(),
  teardownPortalDismissalAlerts: () => teardownMock(),
  usePortalDismissalAlerts: () => ({ pendingCount }),
}))

const stubs = {
  PortalSearchPalette: true,
  OfflineIndicator: true,
  A11yMenu: true,
}

import PortalLayout from '@/layouts/PortalLayout.vue'

describe('PortalLayout — 接送提醒 composable 接線', () => {
  beforeEach(() => {
    routerPush.mockClear()
    initMock.mockClear()
    teardownMock.mockClear()
    mockIsMobile.value = false
    pendingCount.value = 0
    // 壓制 onMounted 導航更新提示
    localStorage.setItem('portal_layout_v', '1')
    // jsdom matchMedia stub
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  })

  it('mount 時 init 接送提醒 composable 一次', async () => {
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(initMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(teardownMock).toHaveBeenCalledTimes(1)
  })

  it('接送徽章顯示 composable 的 live pendingCount', async () => {
    pendingCount.value = 3
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
    const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    const badge = wrapper.find('.announcement-badge')
    expect(badge.exists()).toBe(true)
    // el-badge 將 value 渲染於 .el-badge__content；若找到則斷言值；
    // 否則 fallback 到 badge.text()（無 slot 時 ElBadge 根元素含文字）
    const badgeContent = badge.find('.el-badge__content')
    if (badgeContent.exists()) {
      expect(badgeContent.text()).toContain('3')
    } else {
      expect(badge.text()).toContain('3')
    }
    wrapper.unmount()
  })
})

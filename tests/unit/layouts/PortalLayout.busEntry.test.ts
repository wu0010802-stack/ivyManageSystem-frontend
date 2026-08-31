import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: vi.fn() }),
}))
const hasPortalPermission = vi.fn(() => false)
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ name: '陳老師', role: 'teacher', impersonation_mode: null }),
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
  hasPortalPermission: (name: string) => hasPortalPermission(name as never),
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

async function mountLayout() {
  const wrapper = mount(PortalLayout, { global: { plugins: [ElementPlus], stubs } })
  await flushPromises()
  return wrapper
}

describe('PortalLayout — 娃娃車班次入口', () => {
  beforeEach(() => {
    localStorage.setItem('portal_layout_v', '2') // 防 onboarding setTimeout 干擾
    hasPortalPermission.mockReset()
  })

  it('沒有 BUS_TRIPS_OPERATE 時不顯示入口（避免點進去被 guard 踢回首頁）', async () => {
    hasPortalPermission.mockReturnValue(false)
    const wrapper = await mountLayout()

    expect(wrapper.text()).not.toContain('娃娃車班次')
    expect(wrapper.find('[index="/portal/bus-trip"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('有 BUS_TRIPS_OPERATE 時顯示入口', async () => {
    hasPortalPermission.mockReturnValue(true)
    const wrapper = await mountLayout()

    expect(wrapper.text()).toContain('娃娃車班次')
    wrapper.unmount()
  })

  it('查的是 BUS_TRIPS_OPERATE 這個權限碼（不是別碼順手放行）', async () => {
    hasPortalPermission.mockReturnValue(true)
    const wrapper = await mountLayout()

    expect(hasPortalPermission).toHaveBeenCalledWith('BUS_TRIPS_OPERATE')
    wrapper.unmount()
  })
})

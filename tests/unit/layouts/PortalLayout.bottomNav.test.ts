/**
 * tests/unit/layouts/PortalLayout.bottomNav.test.ts
 *
 * Phase 1 殼層改版：底部導覽重排 + 申請 FAB + ivy-portal 品牌 class。
 *
 * (a) 手機模式 5 格：今日／班級／＋申請（FAB）／出勤／我的；排班、學生退出 tab
 * (b) 班級 tab 導向 /portal/class-hub；今日 tab 導向 /portal/home
 * (c) FAB 點擊開啟 ApplySheet（modelValue true）
 * (d) 出勤 tab 承接 swapPendingCount badge（排班 tab 退場後的可見性補償）
 * (e) mount 時 html 掛 ivy-portal class、unmount 移除（EP primary 收斂 indigo 的 scope）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const routerPush = vi.fn()

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: routerPush }),
}))

let userInfoData: Record<string, unknown> = {}

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
  hasPortalPermission: vi.fn(() => false),
}))

vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 2 } })),
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

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

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

const stubs = {
  PortalSearchPalette: true,
  OfflineIndicator: true,
  A11yMenu: true,
  // ApplySheet 內部行為由自己的測試檔覆蓋；這裡只驗開關接線
  ApplySheet: {
    props: ['modelValue', 'substitutePendingCount'],
    template: '<div class="apply-sheet-stub" :data-open="String(modelValue)"></div>',
  },
}

import PortalLayout from '@/layouts/PortalLayout.vue'

const mountMobile = async () => {
  userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  mockIsMobile.value = true
  const wrapper = mount(PortalLayout, {
    global: { plugins: [ElementPlus], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PortalLayout — 底部導覽 Phase 1 殼層', () => {
  beforeEach(() => {
    routerPush.mockClear()
    mockIsMobile.value = false
    localStorage.setItem('portal_layout_v', '2')
  })

  it('(a) 手機模式 tab 為 今日/班級/出勤/我的 + 申請 FAB；工作台/排班/學生退場', async () => {
    const wrapper = await mountMobile()
    const nav = wrapper.find('.bottom-nav')
    expect(nav.exists()).toBe(true)

    const navText = nav.text()
    expect(navText).toContain('今日')
    expect(navText).toContain('班級')
    expect(navText).toContain('出勤')
    expect(navText).toContain('我的')
    expect(navText).toContain('申請')
    expect(navText).not.toContain('工作台')
    expect(navText).not.toContain('排班')
    expect(navText).not.toContain('學生')

    expect(nav.find('.bottom-fab').exists()).toBe(true)
    wrapper.unmount()
  })

  it('(b) 班級 tab push /portal/class-hub；今日 tab push /portal/home', async () => {
    const wrapper = await mountMobile()
    const tabs = wrapper.findAll('.bottom-tab')
    const byLabel = (label: string) => tabs.find((t) => t.text().includes(label))

    await byLabel('班級')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/class-hub')

    await byLabel('今日')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/home')
    wrapper.unmount()
  })

  it('(c) 點 FAB 開啟 ApplySheet', async () => {
    const wrapper = await mountMobile()
    expect(wrapper.find('.apply-sheet-stub').attributes('data-open')).toBe('false')
    await wrapper.find('.bottom-fab').trigger('click')
    expect(wrapper.find('.apply-sheet-stub').attributes('data-open')).toBe('true')
    wrapper.unmount()
  })

  it('(d) 出勤 tab 顯示 swapPendingCount badge', async () => {
    const wrapper = await mountMobile()
    const tabs = wrapper.findAll('.bottom-tab')
    const attendTab = tabs.find((t) => t.text().includes('出勤'))!
    expect(attendTab.text()).toContain('2')
    wrapper.unmount()
  })

  it('(e) mount 掛 html.ivy-portal、unmount 移除', async () => {
    const wrapper = await mountMobile()
    expect(document.documentElement.classList.contains('ivy-portal')).toBe(true)
    wrapper.unmount()
    expect(document.documentElement.classList.contains('ivy-portal')).toBe(false)
  })
})

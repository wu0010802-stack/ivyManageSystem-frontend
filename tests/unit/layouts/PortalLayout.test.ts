/**
 * tests/unit/layouts/PortalLayout.test.ts
 *
 * 驗證 Task 10：PortalLayout 常駐橫幅 + 唯讀禁用 + 移除壞掉的切換器
 *
 * (a) impersonation_mode === 'readonly' → 預覽橫幅（藍/info 樣式）
 * (b) impersonation_mode === 'write'   → 代操作橫幅（紅/warning 樣式）
 * (c) 兩種模式均有「返回後台」按鈕
 * (d) 切換器（切換視角 dropdown）在冒充模式下不再渲染
 * (e) isReadonlyImpersonation 只在 readonly 模式為 true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
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
// getUserInfo() 回傳由各測試設定的 userInfoData
let userInfoData: Record<string, unknown> = {}

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
  // 娃娃車入口以 BUS_TRIPS_OPERATE 過濾；本檔測的是其他區塊，一律回 false
  hasPortalPermission: vi.fn(() => false),
}))

// ---- portal API mocks ----
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

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

// ---- composable mocks ----
vi.mock('@/composables/usePortalSearch', () => ({
  usePortalSearch: () => ({ openPalette: vi.fn() }),
  installPortalSearchKeyboard: vi.fn(),
}))

// ---- ElMessageBox mock (prevent onMounted dialog from running) ----
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

const stubs = {
  PortalSearchPalette: true,
  OfflineIndicator: true,
  A11yMenu: true,
}

import PortalLayout from '@/layouts/PortalLayout.vue'

describe('PortalLayout — isMobile 接線', () => {
  beforeEach(() => {
    routerPush.mockClear()
    mockIsMobile.value = false
    localStorage.setItem('portal_layout_v', '2')
  })

  it('isMobile 為 true 時 .portal-layout 含 is-mobile class；切回 false 後移除', async () => {
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
    mockIsMobile.value = true

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()
    expect(wrapper.find('.portal-layout').classes()).toContain('is-mobile')

    mockIsMobile.value = false
    await nextTick()
    expect(wrapper.find('.portal-layout').classes()).not.toContain('is-mobile')

    wrapper.unmount()
  })
})

describe('PortalLayout — impersonation 橫幅', () => {
  beforeEach(() => {
    routerPush.mockClear()
    mockIsMobile.value = false
    // 每次測試前清除 onboarding 提示，防止 setTimeout ElMessageBox 干擾
    localStorage.setItem('portal_layout_v', '2')
  })

  it('(a) readonly 模式顯示藍色 info 橫幅，含「預覽中（唯讀）」與教師姓名', async () => {
    userInfoData = { name: '王小明', role: 'teacher', impersonation_mode: 'readonly' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    const bannerText = wrapper.text()
    expect(bannerText).toContain('預覽中（唯讀）')
    expect(bannerText).toContain('王小明')

    // 確認 info 樣式 alert 存在
    const infoAlert = wrapper.find('.el-alert--info')
    expect(infoAlert.exists()).toBe(true)

    wrapper.unmount()
  })

  it('(b) write 模式顯示警告橫幅，含「代操作中（操作會被記錄）」與教師姓名', async () => {
    userInfoData = { name: '李美華', role: 'teacher', impersonation_mode: 'write' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    const bannerText = wrapper.text()
    expect(bannerText).toContain('代操作中（操作會被記錄）')
    expect(bannerText).toContain('李美華')

    // 確認 warning 樣式 alert 存在
    const warningAlert = wrapper.find('.el-alert--warning')
    expect(warningAlert.exists()).toBe(true)

    wrapper.unmount()
  })

  it('(c) readonly 模式橫幅含「返回後台」按鈕', async () => {
    userInfoData = { name: '王小明', role: 'teacher', impersonation_mode: 'readonly' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('返回後台')
    wrapper.unmount()
  })

  it('(c) write 模式橫幅含「返回後台」按鈕', async () => {
    userInfoData = { name: '李美華', role: 'teacher', impersonation_mode: 'write' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('返回後台')
    wrapper.unmount()
  })

  it('(d) 冒充模式下不顯示「切換視角」下拉選單', async () => {
    userInfoData = { name: '王小明', role: 'teacher', impersonation_mode: 'readonly' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('切換視角')
    wrapper.unmount()
  })

  it('(d) write 模式下也不顯示「切換視角」下拉選單', async () => {
    userInfoData = { name: '李美華', role: 'teacher', impersonation_mode: 'write' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('切換視角')
    wrapper.unmount()
  })

  it('(d) 非冒充的 admin 也不顯示「切換視角」（已移除切換器）', async () => {
    userInfoData = { name: '管理員', role: 'admin', impersonation_mode: null }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('切換視角')
    wrapper.unmount()
  })

  it('(e) readonly 模式時不顯示 write 橫幅', async () => {
    userInfoData = { name: '王小明', role: 'teacher', impersonation_mode: 'readonly' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('代操作中（操作會被記錄）')
    wrapper.unmount()
  })

  it('(e) write 模式時不顯示 readonly 橫幅', async () => {
    userInfoData = { name: '李美華', role: 'teacher', impersonation_mode: 'write' }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('預覽中（唯讀）')
    wrapper.unmount()
  })

  it('無冒充（一般教師）時兩種橫幅都不顯示', async () => {
    userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }

    const wrapper = mount(PortalLayout, {
      global: { plugins: [ElementPlus], stubs },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('預覽中（唯讀）')
    expect(wrapper.text()).not.toContain('代操作中（操作會被記錄）')
    wrapper.unmount()
  })
})

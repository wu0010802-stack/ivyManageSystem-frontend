/**
 * LoginView 登入入口分流（2026-08-13 QA 巡檢裁定 A+D）。
 *
 * 問題：onMounted 即 initLiff → liff.login() 整頁跳轉 LINE OAuth，無 LINE
 * 家長在外部瀏覽器根本來不及點「使用設定碼登入」——設定碼入口形同不可達。
 *
 * A 案：`liff.isInClient()` 分流——LINE App 內維持自動登入（無感）；外部
 *   瀏覽器不自動跳轉，顯示「使用 LINE 登入」＋既有設定碼入口讓家長自選。
 * D 案：獨立入口 `#/device-login`（meta.deviceOnly）——完全不觸發 LIFF、
 *   設定碼表單直接展開，供園所印在設定碼單/QR 上；附「改用 LINE 登入」
 *   連結（保留 redirect query）。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

const { mockInitLiff, mockLiffLogin, mockDeviceSetup, mockLiff } = vi.hoisted(() => ({
  mockInitLiff: vi.fn(),
  mockLiffLogin: vi.fn(),
  mockDeviceSetup: vi.fn(),
  mockLiff: {
    isLoggedIn: vi.fn(() => false),
    isInClient: vi.fn(() => false),
    getIDToken: vi.fn(() => 'fake-id-token'),
    login: vi.fn(),
  },
}))

vi.mock('@/parent/services/liff', () => ({
  initLiff: mockInitLiff,
  liff: mockLiff,
  clearLiffTokenRefreshMarker: vi.fn(),
  forceLiffReloginOnce: vi.fn(() => false),
}))

vi.mock('@/parent/api/auth', () => ({
  liffLogin: mockLiffLogin,
  deviceSetup: mockDeviceSetup,
}))

vi.mock('@/components/brand/BrandMark.vue', () => ({
  default: { template: '<div data-testid="brand-mark" />' },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', component: LoginView, meta: { public: true } },
      {
        path: '/device-login',
        component: LoginView,
        meta: { public: true, deviceOnly: true },
      },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountAt(path: string) {
  const router = createTestRouter()
  await router.push(path)
  return {
    wrapper: mount(LoginView, { global: { plugins: [createPinia(), router] } }),
    router,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockInitLiff.mockReset().mockResolvedValue(undefined)
  mockLiffLogin.mockReset()
  mockDeviceSetup.mockReset()
  mockLiff.isLoggedIn.mockReset().mockReturnValue(false)
  mockLiff.isInClient.mockReset().mockReturnValue(false)
  mockLiff.login.mockReset()
})

describe('LoginView — A 案：isInClient 分流', () => {
  it('外部瀏覽器（未登入）→ 不自動 liff.login，顯示「使用 LINE 登入」與設定碼入口', async () => {
    const { wrapper } = await mountAt('/login')
    await flushPromises()

    expect(mockLiff.login).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="line-login-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="device-setup-toggle"]').exists()).toBe(true)
  })

  it('外部瀏覽器點「使用 LINE 登入」→ 才觸發 liff.login', async () => {
    const { wrapper } = await mountAt('/login')
    await flushPromises()

    await wrapper.find('[data-testid="line-login-btn"]').trigger('click')
    expect(mockLiff.login).toHaveBeenCalledTimes(1)
    expect(mockLiff.login.mock.calls[0][0]).toHaveProperty('redirectUri')
  })

  it('LINE App 內（未登入）→ 維持自動 liff.login（行為不變）', async () => {
    mockLiff.isInClient.mockReturnValue(true)
    await mountAt('/login')
    await flushPromises()

    expect(mockLiff.login).toHaveBeenCalledTimes(1)
  })
})

describe('LoginView — D 案：/device-login 獨立入口', () => {
  it('完全不觸發 LIFF；設定碼表單直接展開', async () => {
    const { wrapper } = await mountAt('/device-login')
    await flushPromises()

    expect(mockInitLiff).not.toHaveBeenCalled()
    expect(mockLiff.login).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="device-setup-input"]').exists()).toBe(true)
  })

  it('「改用 LINE 登入」導向 /login 並保留 redirect query', async () => {
    const { wrapper, router } = await mountAt('/device-login?redirect=/fees')
    await flushPromises()

    await wrapper.find('[data-testid="device-login-to-line"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/fees')
  })
})

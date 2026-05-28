/**
 * LoginView — LIFF 認證錯誤情境 friendly error 顯示。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

// ===== Module mocks (hoisted) =====
const { mockInitLiff, mockLiffLogin, mockLiff } = vi.hoisted(() => ({
  mockInitLiff: vi.fn(),
  mockLiffLogin: vi.fn(),
  mockLiff: {
    isLoggedIn: vi.fn(() => true),
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
}))

vi.mock('@/components/brand/BrandMark.vue', () => ({
  default: { template: '<div data-testid="brand-mark" />' },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountLoginView() {
  return mount(LoginView, {
    global: {
      plugins: [createPinia(), createTestRouter()],
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockInitLiff.mockReset().mockResolvedValue(undefined)
  mockLiffLogin.mockReset()
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.getIDToken.mockReset().mockReturnValue('fake-id-token')
})

describe('LoginView — friendly error', () => {
  it('LINE_BINDING_EXPIRED → 顯示 message + nextStep（重新綁定）', async () => {
    mockLiffLogin.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: { detail: { code: 'LINE_BINDING_EXPIRED', message: '您的綁定已過期' } } },
      errorDetail: { code: 'LINE_BINDING_EXPIRED', message: '您的綁定已過期' },
      displayMessage: '您的綁定已過期',
    })
    const w = mountLoginView()
    await flushPromises()
    expect(w.find('[data-testid="login-error"]').text()).toContain('您的綁定已過期')
    expect(w.find('[data-testid="login-error-next-step"]').text()).toMatch(/重新綁定|聯絡園所/)
  })

  it('LINE_BINDING_NOT_FOUND → level=error 訊息「找不到您的綁定資料」', async () => {
    mockLiffLogin.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { detail: { code: 'LINE_BINDING_NOT_FOUND', message: '找不到您的綁定資料' } } },
      errorDetail: { code: 'LINE_BINDING_NOT_FOUND', message: '找不到您的綁定資料' },
      displayMessage: '找不到您的綁定資料',
    })
    const w = mountLoginView()
    await flushPromises()
    expect(w.find('[data-testid="login-error-next-step"]').text()).toMatch(/聯絡園所/)
  })

  it('未知 code → fallback 到 displayMessage，無 nextStep', async () => {
    mockLiffLogin.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { detail: '伺服器爆了' } },
      errorDetail: null,
      displayMessage: '伺服器爆了',
    })
    const w = mountLoginView()
    await flushPromises()
    expect(w.find('[data-testid="login-error"]').text()).toContain('伺服器爆了')
    expect(w.find('[data-testid="login-error-next-step"]').exists()).toBe(false)
  })

  it('LIFF 初始化失敗 → 顯示自製 nextStep（重新開啟 LIFF）', async () => {
    mockInitLiff.mockRejectedValueOnce(new Error('liff sdk init failed'))
    const w = mountLoginView()
    await flushPromises()
    const errorBox = w.find('[data-testid="login-error"]')
    expect(errorBox.exists()).toBe(true)
    expect(errorBox.text()).toContain('liff sdk init failed')
    expect(w.find('[data-testid="login-error-next-step"]').text()).toMatch(/重新開啟 LIFF/)
  })
})

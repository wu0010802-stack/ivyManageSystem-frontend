/**
 * LoginView — 登入成功後導回原本要去的頁面（深連結保存）。
 *
 * 背景：家長端 401/未登入導向 /login 時原本完全不保存目的地，登入成功後
 * 一律寫死 router.replace('/home')。家長端入口常是 LINE 推播點進來的深連結
 * （如某則訊息、某張聯絡簿），session 過期時整個目的地會遺失。
 *
 * `redirect` 這個值來自 URL query string（使用者可控），因此這裡不重複測
 * `isSafeRedirectPath` 本身的各種惡意輸入（那些已在 safeRedirect.test.ts
 * 窮舉），只驗證 LoginView 有沒有正確接上 resolveSafeRedirect + 在對的時機
 * （登入成功 / 同意條款後）用它決定導向哪裡。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

const { mockInitLiff, mockLiffLogin, mockLiff, mockGetCurrentPolicy, mockGetMyConsents } = vi.hoisted(() => ({
  mockInitLiff: vi.fn(),
  mockLiffLogin: vi.fn(),
  mockLiff: {
    isLoggedIn: vi.fn(() => true),
    getIDToken: vi.fn(() => 'fake-id-token'),
    login: vi.fn(),
  },
  mockGetCurrentPolicy: vi.fn(),
  mockGetMyConsents: vi.fn(),
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

vi.mock('@/parent/api/consent', () => ({
  CONSENT_SCOPE_SERVICE_ESSENTIAL: 'service_essential',
  getCurrentPolicy: mockGetCurrentPolicy,
  getMyConsents: mockGetMyConsents,
}))

vi.mock('@/components/brand/BrandMark.vue', () => ({
  default: { template: '<div data-testid="brand-mark" />' },
}))

vi.mock('../../components/ConsentModal.vue', () => ({
  default: {
    props: ['policy'],
    emits: ['consented'],
    template: '<button data-testid="consent-confirm" @click="$emit(\'consented\')" />',
  },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/home', component: { template: '<div>home</div>' } },
      { path: '/fees', component: { template: '<div>fees</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountLoginViewAt(initialLocation: string) {
  const router = createTestRouter()
  await router.push(initialLocation)
  const wrapper = mount(LoginView, {
    global: { plugins: [createPinia(), router] },
  })
  return { wrapper, router }
}

function mockConsentNotRequired() {
  mockGetCurrentPolicy.mockResolvedValue({ data: { id: 1, version: 'v1', effective_at: '2026-01-01', document_path: '/x', summary: null } })
  mockGetMyConsents.mockResolvedValue({
    data: { current_status: [{ scope: 'service_essential', consented: true, policy_version_id: 1 }], history: [] },
  })
}

function mockConsentRequired() {
  mockGetCurrentPolicy.mockResolvedValue({ data: { id: 1, version: 'v1', effective_at: '2026-01-01', document_path: '/x', summary: null } })
  mockGetMyConsents.mockResolvedValue({ data: { current_status: [], history: [] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockInitLiff.mockReset().mockResolvedValue(undefined)
  mockLiffLogin.mockReset()
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.getIDToken.mockReset().mockReturnValue('fake-id-token')
  mockGetCurrentPolicy.mockReset()
  mockGetMyConsents.mockReset()
})

describe('LoginView — 登入成功後導回原頁', () => {
  it('query 帶安全的 redirect → 登入成功導向該頁，不是 /home', async () => {
    mockConsentNotRequired()
    mockLiffLogin.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { router } = await mountLoginViewAt('/login?redirect=%2Ffees')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/fees')
  })

  it('沒有 redirect query → 維持原行為，回 /home', async () => {
    mockConsentNotRequired()
    mockLiffLogin.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { router } = await mountLoginViewAt('/login')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('redirect query 是惡意絕對網址 → fallback /home（不得被當導覽目標使用）', async () => {
    mockConsentNotRequired()
    mockLiffLogin.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { router } = await mountLoginViewAt('/login?redirect=https%3A%2F%2Fevil.com')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('需要簽署同意條款：同意後（onConsented）也要導回 redirect 目標', async () => {
    mockConsentRequired()
    mockLiffLogin.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { wrapper, router } = await mountLoginViewAt('/login?redirect=%2Ffees')
    await flushPromises()
    // 尚未同意前不應該已經導頁
    expect(router.currentRoute.value.path).toBe('/login')
    await wrapper.find('[data-testid="consent-confirm"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/fees')
  })
})

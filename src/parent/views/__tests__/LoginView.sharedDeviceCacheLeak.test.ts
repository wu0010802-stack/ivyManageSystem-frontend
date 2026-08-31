/**
 * LoginView — 共用裝置換家庭登入時，不得沿用前一位家長留下的個人化快取（P1，
 * 2026-08-25 對抗式掃描）。
 *
 * 情境：園所設定碼登入（/device-login）或 LIFF 登入常用在共用裝置（如園所
 * 辦公室的平板），前一位家長（家庭 A）若未主動點「登出」就離開（token 過期
 * / 直接關頁），`useTodayStatusCache`（sessionStorage + module state）、
 * `useCachedAsync`（module-level in-memory cache）與 `useChildrenStore`
 * （Pinia store，`loaded` 旗標無 TTL）都會把家庭 A 的資料留在裝置上。
 * 家庭 B 在 60s TTL（今日狀態）或 `loaded=true`（子女 store，
 * 無 TTL、只認旗標）內完成登入時，`completeLogin` 只呼叫了
 * `authStore.setUser(user)` 就直接導頁，這些殘留全部原樣沿用 → 家庭 B 看到
 * 家庭 A 的小孩資料（PII 外洩）。
 *
 * 修法：`completeLogin` 在設定新使用者前，先呼叫既有登出流程已驗證過的
 * `clearParentPersonalizedCaches()`（從 useParentLogout.ts 的
 * `clearParentLocalState()` 抽出、不含 `authStore.clear()` 的核心清理），
 * 讓「登入」與「登出」共用同一份個人化狀態清除邏輯，不再各自維護一份、
 * 也不再只清兩個 composable 就自認清乾淨。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'
import { useChildrenStore } from '@/parent/stores/children'
import { useCachedAsync, _resetCacheForTesting } from '@/composables/useCachedAsync'

const { mockInitLiff, mockLiffLogin, mockDeviceSetup, mockLiff, mockGetCurrentPolicy, mockGetMyConsents } = vi.hoisted(() => ({
  mockInitLiff: vi.fn(),
  mockLiffLogin: vi.fn(),
  mockDeviceSetup: vi.fn(),
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
  deviceSetup: mockDeviceSetup,
}))

vi.mock('@/parent/api/consent', () => ({
  CONSENT_SCOPE_SERVICE_ESSENTIAL: 'service_essential',
  getCurrentPolicy: mockGetCurrentPolicy,
  getMyConsents: mockGetMyConsents,
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/home', component: { template: '<div>home</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountLoginView(pinia: ReturnType<typeof createPinia>) {
  const router = createTestRouter()
  await router.push('/login')
  return { wrapper: mount(LoginView, { global: { plugins: [pinia, router] } }), router }
}

function mockConsentNotRequired() {
  mockGetCurrentPolicy.mockResolvedValue({ data: { id: 1, version: 'v1', effective_at: '2026-01-01', document_path: '/x', summary: null } })
  mockGetMyConsents.mockResolvedValue({
    data: { current_status: [{ scope: 'service_essential', consented: true, policy_version_id: 1 }], history: [] },
  })
}

const TODAY_STATUS_CACHE_KEY = 'parent:today-status:v1'

beforeEach(() => {
  _resetCacheForTesting()
  mockInitLiff.mockReset().mockRejectedValue(new Error('liff not available in test'))
  mockLiffLogin.mockReset()
  mockDeviceSetup.mockReset()
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.getIDToken.mockReset().mockReturnValue('fake-id-token')
  mockGetCurrentPolicy.mockReset()
  mockGetMyConsents.mockReset()
  sessionStorage.clear()
})

describe('LoginView — 共用裝置換家庭登入清除殘留個人化快取', () => {
  it('登入完成前清掉前一位家長留下的今日狀態快取、useCachedAsync 快取與子女 store', async () => {
    // LoginView 掛載時吃這個 pinia（見 mountLoginView）；測試在此先 seed 殘留資料，
    // 必須是同一顆 pinia 實例，completeLogin 內的 useChildrenStore() 等呼叫才會
    // 命中同一份 store，而不是另開一顆互不相干的 pinia。
    const pinia = createPinia()
    setActivePinia(pinia)
    // 家庭 A 的殘留：sessionStorage 今日狀態快取
    sessionStorage.setItem(
      TODAY_STATUS_CACHE_KEY,
      JSON.stringify({ payload: { student_id: 11, name: '家庭A的小孩' }, cachedAt: Date.now() }),
    )
    // 家庭 A 的殘留：useCachedAsync module-level cache（parent/ 前綴，60s TTL 內）
    const cachedA = useCachedAsync('parent/some-widget', async () => ({ owner: 'A' }))
    await flushPromises()
    expect(cachedA.data.value).toEqual({ owner: 'A' })
    // 家庭 A 的殘留：children store（loaded=true，無 TTL，只認旗標）
    const children = useChildrenStore()
    children.items = [{ student_id: 11, name: '家庭A的小孩' }]
    children.loaded = true

    // 家庭 B 用設定碼登入（未事先登出——共用裝置常見情境：A 沒點登出就離開）
    mockConsentNotRequired()
    mockDeviceSetup.mockResolvedValueOnce({ data: { status: 'ok', user: { user_id: 2, name: '家庭B家長', role: 'parent' } } })

    const { wrapper } = await mountLoginView(pinia)
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('BFAM1234CODE')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(sessionStorage.getItem(TODAY_STATUS_CACHE_KEY)).toBeNull()
    // 同一 key 的 useCachedAsync 消費者應被清空，不得繼續拿家庭 A 的舊資料
    expect(cachedA.data.value).toBeNull()
    expect(children.items).toEqual([])
    expect(children.loaded).toBe(false)
  })
})

/**
 * LoginView — 「沒有 LINE？使用園所提供的設定碼登入」次要入口。
 *
 * 給沒有 LINE 或換新手機的家長用（後端 POST /parent/auth/device-setup）。
 * 成功後的流程必須跟 LIFF 登入成功後完全一致（consent gate + 深連結導回），
 * 不另開一條分岔——這裡故意不重複斷言 consent/redirect 的每一種分支
 * （那些在 LoginView.redirectBack.test.ts 已經窮舉過），只驗證這個入口
 * 有沒有正確接上同一條共用流程。
 *
 * 錯誤文案刻意統一，不因後端實際回傳的訊息不同而變化——後端本來就對
 * 「碼不存在/過期/已用」一律回同一個 BusinessError code 避免碼枚舉，
 * 前端如果照後端 displayMessage 原樣顯示，一旦後端訊息未來變得更具體，
 * 前端就會不小心變成枚舉 oracle，所以前端自己固定文案，不依賴後端字串。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

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
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountLoginView() {
  const router = createTestRouter()
  await router.push('/login')
  return { wrapper: mount(LoginView, { global: { plugins: [createPinia(), router] } }), router }
}

function mockConsentNotRequired() {
  mockGetCurrentPolicy.mockResolvedValue({ data: { id: 1, version: 'v1', effective_at: '2026-01-01', document_path: '/x', summary: null } })
  mockGetMyConsents.mockResolvedValue({
    data: { current_status: [{ scope: 'service_essential', consented: true, policy_version_id: 1 }], history: [] },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  // LIFF 流程在這支測試裡永遠處於「初始化失敗」讓它不干擾（重點是設定碼分支）
  mockInitLiff.mockReset().mockRejectedValue(new Error('liff not available in test'))
  mockLiffLogin.mockReset()
  mockDeviceSetup.mockReset()
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.getIDToken.mockReset().mockReturnValue('fake-id-token')
  mockGetCurrentPolicy.mockReset()
  mockGetMyConsents.mockReset()
})

describe('LoginView — 設定碼登入入口', () => {
  it('預設收合；點擊「沒有 LINE？使用園所提供的設定碼登入」展開輸入框', async () => {
    const { wrapper } = await mountLoginView()
    await flushPromises()

    expect(wrapper.find('[data-testid="device-setup-input"]').exists()).toBe(false)
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="device-setup-input"]').exists()).toBe(true)
  })

  it('成功兌換 → 走跟 LIFF 登入成功完全一樣的流程（consent 已簽過 → 直接導向 /home）', async () => {
    mockConsentNotRequired()
    mockDeviceSetup.mockResolvedValueOnce({ data: { status: 'ok', user: { user_id: 1, name: '陳媽媽', role: 'parent' } } })

    const { wrapper, router } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(mockDeviceSetup).toHaveBeenCalledWith('ABCD1234EFGH')
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('尚未簽署最新條款 → 跟 LIFF 一樣先彈 consent modal，同意後才導頁', async () => {
    mockGetCurrentPolicy.mockResolvedValue({ data: { id: 1, version: 'v1', effective_at: '2026-01-01', document_path: '/x', summary: null } })
    mockGetMyConsents.mockResolvedValue({ data: { current_status: [], history: [] } })
    mockDeviceSetup.mockResolvedValueOnce({ data: { status: 'ok', user: { user_id: 1, name: '陳媽媽', role: 'parent' } } })

    const { wrapper, router } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/login') // 還沒導頁，卡在 consent
    await wrapper.find('[data-testid="consent-confirm"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('兌換失敗（後端 400，任何原因）→ 一律顯示統一文案，不採用後端實際訊息', async () => {
    mockDeviceSetup.mockRejectedValueOnce({
      response: { status: 400, data: { detail: { code: 'DEVICE_SETUP_CODE_INVALID', message: '這是後端的原始訊息，不應該被顯示' } } },
      displayMessage: '這是後端的原始訊息，不應該被顯示',
    })

    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('WRONGCODE123')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="device-setup-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toBe('設定碼無效或已過期，請聯絡園所')
    expect(err.text()).not.toContain('不應該被顯示')
  })

  it('被限流（429）→ 顯示限流專屬訊息', async () => {
    mockDeviceSetup.mockRejectedValueOnce({ response: { status: 429 } })

    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="device-setup-error"]').text()).toContain('嘗試次數過多')
  })


  /**
   * 2026-08-26 staging 驗收：家長按下「使用設定碼登入」後請求在傳輸層被中止
   * （net::ERR_ABORTED），畫面卻顯示「設定碼無效或已過期，請聯絡園所」。
   *
   * catch 分支原本只特判 429，其餘一律套那句統一文案——但那句文案的存在理由是
   * 「後端對碼不存在/過期/已用一律回同一個 code，前端不要變成枚舉 oracle」，
   * 那個理由**只適用於後端真的回了 HTTP 回應**的情況。傳輸層失敗（斷線、逾時、
   * 請求被中止、DNS 失敗）根本沒有 err.response，不帶任何枚舉價值，卻被誤標成
   * 碼有問題，害家長白跑一趟回園所重領碼。
   */
  it('傳輸層失敗（無 err.response）→ 不可誤報「設定碼無效」，要給可重試的連線錯誤', async () => {
    mockDeviceSetup.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    )

    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="device-setup-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).not.toContain('設定碼無效')
    expect(err.text()).toContain('連線中斷')
  })

  it('逾時（ECONNABORTED，同樣沒有 response）→ 走連線錯誤分支', async () => {
    mockDeviceSetup.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }),
    )

    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="device-setup-error"]').text()).toContain('連線中斷')
  })

  it('伺服器有回應但非 429（500）→ 仍走統一文案，維持不可枚舉', async () => {
    mockDeviceSetup.mockRejectedValueOnce({ response: { status: 500, data: {} } })

    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-input"]').setValue('ABCD1234EFGH')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="device-setup-error"]').text()).toBe(
      '設定碼無效或已過期，請聯絡園所',
    )
  })

  it('空白碼不送出，顯示「請輸入設定碼」', async () => {
    const { wrapper } = await mountLoginView()
    await flushPromises()
    await wrapper.find('[data-testid="device-setup-toggle"]').trigger('click')
    await wrapper.find('[data-testid="device-setup-submit"]').trigger('click')
    await flushPromises()

    expect(mockDeviceSetup).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="device-setup-error"]').text()).toContain('請輸入設定碼')
  })
})

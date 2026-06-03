/**
 * PrivacyRightsView — opt-out granular scope 即時生效 + service_essential 不顯示 UX 測試
 * P2-4
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PrivacyRightsView from '../PrivacyRightsView.vue'

// ===== Module mocks (hoisted) =====
const { mockGetMyConsents, mockListMyDsrRequests, mockSubmitOptOutRequest } = vi.hoisted(
  () => ({
    mockGetMyConsents: vi.fn(),
    mockListMyDsrRequests: vi.fn(),
    mockSubmitOptOutRequest: vi.fn(),
  }),
)

vi.mock('@/parent/api/consent', async (importOriginal) => {
  // 保留真實常數（CONSENT_SCOPES、SCOPE_LABELS 等）
  const actual = await importOriginal<typeof import('@/parent/api/consent')>()
  return {
    ...actual,
    getMyConsents: mockGetMyConsents,
    listMyDsrRequests: mockListMyDsrRequests,
    submitOptOutRequest: mockSubmitOptOutRequest,
    // writeConsent / submitDeleteRequest / submitCorrectRequest 不在 opt-out 測試路徑上
    writeConsent: vi.fn(),
    submitDeleteRequest: vi.fn(),
    submitCorrectRequest: vi.fn(),
  }
})

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

// ===== Fixtures =====
const MOCK_CONSENTS_RESPONSE = {
  current_status: [
    { scope: 'service_essential', consented: true, consented_at: '2026-01-01', policy_version_id: 1 },
    { scope: 'photo_publish', consented: true, consented_at: '2026-01-01', policy_version_id: 1 },
    { scope: 'line_push', consented: true, consented_at: '2026-01-01', policy_version_id: 1 },
    { scope: 'cross_border_transfer', consented: true, consented_at: '2026-01-01', policy_version_id: 1 },
  ],
  history: [],
}

const MOCK_DSR_RESPONSE: [] = []

// ===== Helpers =====
function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountView() {
  return mount(PrivacyRightsView, {
    global: {
      plugins: [createPinia(), createTestRouter()],
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockGetMyConsents.mockResolvedValue({ data: MOCK_CONSENTS_RESPONSE })
  mockListMyDsrRequests.mockResolvedValue({ data: MOCK_DSR_RESPONSE })
  mockSubmitOptOutRequest.mockResolvedValue({ data: { id: 1, request_type: 'opt_out', status: 'approved', scope: 'photo_publish', submitted_at: '2026-06-03' } })
})

// ===== Tests =====
describe('PrivacyRightsView — opt-out UX (P2-4)', () => {
  it('opt-out 下拉不包含 service_essential', async () => {
    const w = mountView()
    await flushPromises()

    // 切換到停止處理 tab
    const tabs = w.findAll('[role="tab"]')
    const optOutTab = tabs.find((t) => t.text().includes('停止處理'))
    expect(optOutTab).toBeTruthy()
    await optOutTab!.trigger('click')
    await flushPromises()

    // 下拉選單不應包含 service_essential 選項文字
    const select = w.find('select')
    expect(select.exists()).toBe(true)
    const optionTexts = select
      .findAll('option')
      .map((o) => o.text())
    expect(optionTexts.some((t) => t.includes('服務必要'))).toBe(false)

    // 應包含其他三個 granular scopes
    expect(optionTexts.some((t) => t.includes('照片公開') || t.includes('兒童照片'))).toBe(true)
    expect(optionTexts.some((t) => t.includes('LINE'))).toBe(true)
    expect(optionTexts.some((t) => t.includes('跨境'))).toBe(true)
  })

  it('顯示基礎服務同意不可停止的提示文字', async () => {
    const w = mountView()
    await flushPromises()

    const tabs = w.findAll('[role="tab"]')
    const optOutTab = tabs.find((t) => t.text().includes('停止處理'))
    await optOutTab!.trigger('click')
    await flushPromises()

    expect(w.text()).toContain('基礎服務同意')
    expect(w.text()).toContain('不可停止')
    expect(w.text()).toContain('刪除申請')
  })

  it('送出 opt-out 後顯示「已即時停止」訊息並 refetch consents', async () => {
    const w = mountView()
    await flushPromises()

    // 切到 opt_out tab
    const tabs = w.findAll('[role="tab"]')
    const optOutTab = tabs.find((t) => t.text().includes('停止處理'))
    await optOutTab!.trigger('click')
    await flushPromises()

    // 清除初始載入呼叫次數，只計算 submit 後的 refetch
    const initialCallCount = mockGetMyConsents.mock.calls.length

    // 點擊確認停止處理
    const submitBtn = w.find('.submit-btn')
    expect(submitBtn.exists()).toBe(true)
    await submitBtn.trigger('click')
    await flushPromises()

    // submitOptOutRequest 應被呼叫（預設 scope = photo_publish）
    expect(mockSubmitOptOutRequest).toHaveBeenCalledOnce()
    expect(mockSubmitOptOutRequest).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'photo_publish' }),
    )

    // 成功後應再次呼叫 getMyConsents（refetch）
    expect(mockGetMyConsents.mock.calls.length).toBeGreaterThan(initialCallCount)

    // 成功訊息應為「已即時停止」，而非舊版「申請已送出」
    const successMsg = w.find('[role="status"]')
    expect(successMsg.exists()).toBe(true)
    expect(successMsg.text()).toContain('已即時停止')
    expect(successMsg.text()).not.toContain('申請已送出')
    expect(successMsg.text()).not.toContain('待審核')
  })
})

/**
 * PrivacyRightsView — 歷次申請（history）tab 對 r.submitted_at 的 null 守衛（F3）。
 *
 * 原先 line ~292 `r.submitted_at.slice(0, 10)` 無守衛（同檔 consented_at 有
 * v-if 守衛，不一致）。submitted_at 為 null（後端契約違反 / legacy）時，
 * 渲染 history tab 會 render throw → 配合無 error boundary 白屏。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PrivacyRightsView from '../PrivacyRightsView.vue'

const { mockGetMyConsents, mockListMyDsrRequests, mockSubmitOptOutRequest } = vi.hoisted(() => ({
  mockGetMyConsents: vi.fn(),
  mockListMyDsrRequests: vi.fn(),
  mockSubmitOptOutRequest: vi.fn(),
}))

vi.mock('@/parent/api/consent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/parent/api/consent')>()
  return {
    ...actual,
    getMyConsents: mockGetMyConsents,
    listMyDsrRequests: mockListMyDsrRequests,
    submitOptOutRequest: mockSubmitOptOutRequest,
    writeConsent: vi.fn(),
    submitDeleteRequest: vi.fn(),
    submitCorrectRequest: vi.fn(),
  }
})

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({ items: [], load: vi.fn().mockResolvedValue(undefined) }),
}))

const MOCK_CONSENTS_RESPONSE = { current_status: [], history: [] }

// 一筆 submitted_at 為 null 的 legacy 紀錄 + 一筆正常紀錄
const MOCK_DSR_WITH_NULL = [
  { id: 1, request_type: 'delete', status: 'pending', reason: '測試', submitted_at: null },
  { id: 2, request_type: 'correct', status: 'approved', reason: null, submitted_at: '2026-06-03T10:00:00' },
]

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountView() {
  return mount(PrivacyRightsView, {
    global: { plugins: [createPinia(), createTestRouter()] },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockGetMyConsents.mockResolvedValue({ data: MOCK_CONSENTS_RESPONSE })
  mockListMyDsrRequests.mockResolvedValue({ data: MOCK_DSR_WITH_NULL })
})

describe('PrivacyRightsView — history submitted_at null 守衛（F3）', () => {
  it('history tab 含 submitted_at=null 的紀錄時不應 render throw', async () => {
    const w = mountView()
    await flushPromises()

    const tabs = w.findAll('[role="tab"]')
    const historyTab = tabs.find((t) => t.text().includes('歷次申請'))
    expect(historyTab).toBeTruthy()

    // 切到 history tab 不應 throw
    let threw = false
    try {
      await historyTab!.trigger('click')
      await flushPromises()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)

    // 正常紀錄的日期仍渲染
    expect(w.text()).toContain('2026-06-03')
    // 兩筆紀錄都應渲染（null 那筆不崩潰、只是不顯示日期）
    expect(w.findAll('.dsr-row').length).toBe(2)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// 2026-06-29 audit P2-B：才藝退費 UI 預填「全額已繳」與後端按出席比例建議值口徑不一致。
// 修正：退費選取時抓 GET /activity/registrations/{id}/refund-suggestion，以
// total_suggested_amount 預填 amount_applied（非 paid_amount），避免簽核者盲簽超退。

vi.mock('@/api/activity', () => ({
  getPOSDailySummary: vi.fn(),
  getPOSOutstandingByStudent: vi.fn(),
  getPOSReceiptPdf: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  getRegistrations: vi.fn(),
  posCheckout: vi.fn(),
  getRefundSuggestion: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => false }))

import { getRefundSuggestion } from '@/api/activity'
import { usePOSCheckout } from '@/composables/usePOSCheckout'

function mountComposable() {
  let api: ReturnType<typeof usePOSCheckout>
  const wrapper = mount({
    setup() {
      api = usePOSCheckout()
      return () => null
    },
  })
  // @ts-expect-error 由 setup 賦值
  return { api: api as ReturnType<typeof usePOSCheckout>, wrapper }
}

function suggestion(total: number, items: unknown[]) {
  return {
    data: {
      registration_id: 42,
      computed_at: '2026-06-29T00:00:00+08:00',
      total_suggested_amount: total,
      total_amount_due: 900,
      items,
    },
  } as never
}

describe('usePOSCheckout 退費預填建議值（P2-B）', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.clearAllMocks())

  it('退費選取：預填後端建議值（按出席比例），非全額已繳', async () => {
    vi.mocked(getRefundSuggestion).mockResolvedValue(
      suggestion(300, [
        {
          type: 'course',
          target_id: 1,
          name: '美術',
          amount_due: 900,
          suggested_amount: 300,
          calc_method: 'activity_course_ratio',
          calc_payload: {},
          warnings: [],
        },
      ]),
    )
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 900 },
      '王小明',
    )
    await flushPromises()

    expect(vi.mocked(getRefundSuggestion)).toHaveBeenCalledWith(42)
    // 預填 = 建議值 300，而非全額已繳 900
    expect(api.selectedItem.value?.amount_applied).toBe(300)
    wrapper.unmount()
  })

  it('建議載入失敗：保留全額已繳 fallback，不阻斷退費', async () => {
    vi.mocked(getRefundSuggestion).mockRejectedValue(new Error('boom'))
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 900 },
      '王小明',
    )
    await flushPromises()

    // 失敗時退回 buildSelection 的 paid 預填
    expect(api.selectedItem.value?.amount_applied).toBe(900)
    wrapper.unmount()
  })

  it('收款模式不抓退費建議', async () => {
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'payment'
    await flushPromises()

    api.selectItem(
      { id: 9, student_name: '李小華', total_amount: 1000, paid_amount: 200 },
      '李小華',
    )
    await flushPromises()

    expect(vi.mocked(getRefundSuggestion)).not.toHaveBeenCalled()
    // 收款預填欠費 owed = 1000 - 200 = 800
    expect(api.selectedItem.value?.amount_applied).toBe(800)
    wrapper.unmount()
  })
})

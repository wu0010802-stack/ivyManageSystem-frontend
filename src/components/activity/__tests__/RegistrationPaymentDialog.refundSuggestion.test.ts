import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RegistrationPaymentDialog from '../RegistrationPaymentDialog.vue'

// 2026-06-29 audit P2-B：退費對話框預填「全額已繳」與後端按出席比例建議值口徑不一致。
// 修正：退費開啟時抓 getRefundSuggestion，以 total_suggested_amount 預填 form.amount。

const getRefundSuggestionMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  addRegistrationPayment: vi.fn(),
  getRefundSuggestion: getRefundSuggestionMock,
}))

function mountDialog(props: Record<string, unknown>) {
  return mount(RegistrationPaymentDialog, {
    props: { modelValue: false, ...props },
    global: { stubs: { teleport: true } },
  })
}

describe('RegistrationPaymentDialog 退費預填建議值（P2-B）', () => {
  beforeEach(() => getRefundSuggestionMock.mockReset())

  it('退費開啟：預填後端建議值（300），非全額已繳（900）', async () => {
    getRefundSuggestionMock.mockResolvedValue({
      data: { total_suggested_amount: 300, items: [] },
    })
    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 900,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(getRefundSuggestionMock).toHaveBeenCalledWith(42)
    expect(vm.form.amount).toBe(300)
  })

  it('建議值不可得（空回應）：保留全額已繳 fallback', async () => {
    // 後端回應缺 total_suggested_amount（malformed / 無法計算）→ 走 ?? paidAmount fallback。
    // 網路錯誤（reject）走同一函式的 catch 分支保留 fallback，與 usePOSCheckout 同邏輯。
    getRefundSuggestionMock.mockResolvedValue({ data: { items: [] } })
    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 900,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(vm.form.amount).toBe(900)
  })

  it('繳費開啟：預填欠費，不抓退費建議', async () => {
    const wrapper = mountDialog({
      type: 'payment',
      registrationId: 9,
      totalAmount: 1000,
      paidAmount: 200,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(getRefundSuggestionMock).not.toHaveBeenCalled()
    expect(vm.form.amount).toBe(800) // owed = 1000 - 200
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import RegistrationPaymentDialog from '../RegistrationPaymentDialog.vue'

// 2026-06-29 audit P2-B：退費對話框預填「全額已繳」與後端按出席比例建議值口徑不一致。
// 修正：退費開啟時抓 getRefundSuggestion，以 remaining_suggested_amount 預填 form.amount
//（非 total_suggested），多次退費不重複預填全額建議（audit F1）。
// F2：建議載入失敗（reject 或缺欄位）改 fail-closed——金額歸 0 + 警告，強制人工確認。

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

describe('RegistrationPaymentDialog 退費預填建議值（P2-B / F1 / F2）', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    getRefundSuggestionMock.mockReset()
    warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}) as never)
  })
  afterEach(() => warnSpy.mockRestore())

  it('退費開啟：預填剩餘建議額（300），非全額已繳（900）', async () => {
    getRefundSuggestionMock.mockResolvedValue({
      data: {
        total_suggested_amount: 300,
        prior_refunded_amount: 0,
        remaining_suggested_amount: 300,
        items: [],
      },
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

  it('多次退費：已退 600 → 預填剩餘 300（非建議總額 900）', async () => {
    getRefundSuggestionMock.mockResolvedValue({
      data: {
        total_suggested_amount: 900,
        prior_refunded_amount: 600,
        remaining_suggested_amount: 300,
        items: [],
      },
    })
    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 300,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(vm.form.amount).toBe(300)
  })

  it('建議值缺欄位（空回應）：fail-closed，金額歸 0 + 警告', async () => {
    // 後端回應缺 remaining_suggested_amount（malformed / 舊回應）→ 不再保留全額，
    // 改 fail-closed 歸 0 + 警告。
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
    expect(vm.form.amount).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('建議載入失敗（reject）：fail-closed，金額歸 0 + 警告（不保留全額）', async () => {
    getRefundSuggestionMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 900,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(vm.form.amount).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
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

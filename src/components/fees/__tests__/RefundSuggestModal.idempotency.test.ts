/**
 * RefundSuggestModal 冪等鍵回歸測試（P1 bug hunt 2026-07-02 #8）。
 *
 * 退款送出未帶 idempotency_key → 後端 refunds.py 只在 `if payload.idempotency_key:`
 * 才查重放，key=None 跳過（PG 多 NULL 互異，UNIQUE 也擋不下）。回應遺失後櫃台重按會
 * 建立第二筆退款、amount_paid 重複扣減＝多退錢。修法：開啟時產穩定 key，重送沿用同 key。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/fees', () => ({
  refundFeeRecord: vi.fn(),
  suggestRefund: vi.fn(),
}))

import { refundFeeRecord } from '@/api/fees'
import RefundSuggestModal from '../RefundSuggestModal.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

interface ModalVm {
  form: { amount: number; reason: string; notes: string }
  idempotencyKey: string
  onSubmit: () => Promise<void>
}

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(RefundSuggestModal, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      record: { id: 42, fee_type: 'monthly', amount_paid: 2000, amount_due: 2000 },
      ...overrides,
    },
  })
}

const vmOf = (w: ReturnType<typeof mountModal>) => w.vm as unknown as ModalVm

describe('RefundSuggestModal idempotency', () => {
  beforeEach(() => vi.clearAllMocks())

  it('送出退款會帶合規的 idempotency_key（^[A-Za-z0-9_-]{8,64}$）', async () => {
    asMock(refundFeeRecord).mockResolvedValue({ ok: true })
    const wrapper = mountModal()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.form.amount = 500
    vm.form.reason = '家長申請退費'
    await vm.onSubmit()
    await flushPromises()

    expect(refundFeeRecord).toHaveBeenCalledTimes(1)
    const [recordId, payload] = asMock(refundFeeRecord).mock.calls[0]
    expect(recordId).toBe(42)
    expect(payload.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(payload.amount).toBe(500)
  })

  it('回應遺失後重按沿用同一把 key（後端可回放，避免雙重退款）', async () => {
    const wrapper = mountModal()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.form.amount = 500
    vm.form.reason = '家長申請退費'

    // 第一次：模擬 commit 後回應遺失（reject）→ dialog 仍開、submitting 復位
    asMock(refundFeeRecord).mockRejectedValueOnce(new Error('network timeout'))
    await vm.onSubmit()
    await flushPromises()

    // 第二次：同一開啟期間重按（modelValue 未變）→ 應沿用同 key
    asMock(refundFeeRecord).mockResolvedValueOnce({ ok: true })
    await vm.onSubmit()
    await flushPromises()

    const key1 = asMock(refundFeeRecord).mock.calls[0][1].idempotency_key
    const key2 = asMock(refundFeeRecord).mock.calls[1][1].idempotency_key
    expect(key1).toBeTruthy()
    expect(key2).toBe(key1)
  })

  it('重新開啟 modal 產生新的 key（不同退費嘗試不共用）', async () => {
    const wrapper = mountModal()
    await flushPromises()
    const firstKey = vmOf(wrapper).idempotencyKey
    expect(firstKey).toBeTruthy()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(vmOf(wrapper).idempotencyKey).not.toBe(firstKey)
  })
})

/**
 * RefundSuggestModal review state（2026-08-17）：
 * 確認前在同一 dialog 內重述本次退費金額、原因與脈絡；
 * 第一按進 review、第二按才真正送出（payload 與 idempotency 沿用既有機制，不得改動）。
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
  reviewing: boolean
  onFooterConfirm: () => Promise<void> | void
  backToEdit: () => void
  onSubmit: () => Promise<void>
}

function mountModal() {
  return mount(RefundSuggestModal, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      record: {
        id: 42,
        student_name: '測試生',
        fee_item_name: '測試費項',
        fee_type: 'monthly',
        period: '114-2',
        classroom_name: '測試班',
        amount_paid: 2000,
        amount_due: 2000,
      },
    },
  })
}

const vmOf = (w: ReturnType<typeof mountModal>) => w.vm as unknown as ModalVm

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('RefundSuggestModal 脈絡與 review state', () => {
  it('頂部脈絡顯示學生、期別、費項、應繳、已繳', async () => {
    mountModal()
    await flushPromises()
    const ctx = document.querySelector('[data-test="refund-context"]')
    expect(ctx).toBeTruthy()
    const text = ctx!.textContent || ''
    expect(text).toContain('測試生')
    expect(text).toContain('114-2')
    expect(text).toContain('測試費項')
    expect(text).toContain('2,000')
  })

  it('第一按「確認退費」→ 進 review 重述金額與原因，尚未呼叫 API；第二按才送出', async () => {
    asMock(refundFeeRecord).mockResolvedValue({ ok: true })
    const w = mountModal()
    await flushPromises()
    const vm = vmOf(w)
    vm.form.amount = 500
    vm.form.reason = '家長申請退費'
    await flushPromises()

    await vm.onFooterConfirm()
    await flushPromises()
    expect(vm.reviewing).toBe(true)
    expect(refundFeeRecord).not.toHaveBeenCalled()

    const review = document.querySelector('[data-test="refund-review"]')
    expect(review).toBeTruthy()
    const text = review!.textContent || ''
    expect(text).toContain('500')
    expect(text).toContain('家長申請退費')

    // 最終按鈕顯示金額
    const buttons = Array.from(document.querySelectorAll('button'))
    const confirmBtn = buttons.find((b) => (b.textContent || '').includes('確認退費 NT$500'))
    expect(confirmBtn).toBeTruthy()

    await vm.onFooterConfirm()
    await flushPromises()
    expect(refundFeeRecord).toHaveBeenCalledTimes(1)
    const [, payload] = asMock(refundFeeRecord).mock.calls[0]
    expect(payload.amount).toBe(500)
    expect(payload.reason).toBe('家長申請退費')
    expect(payload.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })

  it('review 可返回修改；修改金額後 review 重述新金額', async () => {
    const w = mountModal()
    await flushPromises()
    const vm = vmOf(w)
    vm.form.amount = 500
    vm.form.reason = '家長申請退費'
    await vm.onFooterConfirm()
    await flushPromises()
    expect(vm.reviewing).toBe(true)

    vm.backToEdit()
    await flushPromises()
    expect(vm.reviewing).toBe(false)

    vm.form.amount = 700
    await vm.onFooterConfirm()
    await flushPromises()
    const review = document.querySelector('[data-test="refund-review"]')
    expect(review!.textContent).toContain('700')
    expect(refundFeeRecord).not.toHaveBeenCalled()
  })
})

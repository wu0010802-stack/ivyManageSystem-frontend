/**
 * RefundSuggestModal × 學費退費申請（FIN-F2）：
 * 直接退費因累計達簽核門檻被擋（409 REFUND_APPROVAL_REQUIRED／403 審批閾值）時，
 * 提示並改送退費申請（不扣款）；使用者取消則不送；其他錯誤維持原錯誤提示。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const ui = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: ui.success, error: ui.error, warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: ui.confirm },
  }
})

vi.mock('@/api/fees', () => ({
  refundFeeRecord: vi.fn(),
  suggestRefund: vi.fn(),
  createFeeRefundRequest: vi.fn(),
}))

import { refundFeeRecord, createFeeRefundRequest } from '@/api/fees'
import RefundSuggestModal from '../RefundSuggestModal.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

interface ModalVm {
  form: { amount: number; reason: string; notes: string }
  onSubmit: () => Promise<void>
}

function mountModal() {
  return mount(RefundSuggestModal, {
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      record: { id: 42, student_name: '測試生', fee_item_name: '月費', fee_type: 'monthly', amount_paid: 5000, amount_due: 5000 },
    },
  })
}

const APPROVAL_409 = {
  response: {
    status: 409,
    data: { detail: { code: 'REFUND_APPROVAL_REQUIRED', message: '學費累積退款 NT$1,500 達 NT$1,000 簽核門檻，請送出退費申請' } },
  },
}

async function fillAndSubmit(w: ReturnType<typeof mountModal>) {
  await flushPromises()
  const vm = w.vm as unknown as ModalVm
  vm.form.amount = 1500
  vm.form.reason = '家長申請退費'
  vm.form.notes = '備註'
  await vm.onSubmit()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RefundSuggestModal 退費申請 fallback', () => {
  it('409 REFUND_APPROVAL_REQUIRED → 確認後改送退費申請（不帶冪等鍵）並 emit requested', async () => {
    asMock(refundFeeRecord).mockRejectedValue(APPROVAL_409)
    ui.confirm.mockResolvedValue('confirm')
    asMock(createFeeRefundRequest).mockResolvedValue({ id: 9, status: 'requested' })
    const w = mountModal()
    await fillAndSubmit(w)

    expect(ui.confirm).toHaveBeenCalledTimes(1)
    expect(String(ui.confirm.mock.calls[0][0])).toContain('簽核門檻')
    expect(createFeeRefundRequest).toHaveBeenCalledWith(42, {
      amount: 1500,
      reason: '家長申請退費',
      notes: '備註',
      calc_method: undefined,
      calc_payload: undefined,
    })
    expect(w.emitted('requested')).toHaveLength(1)
    expect(w.emitted('refunded')).toBeUndefined()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('403 審批閾值（無簽核權者）同樣引導改送申請', async () => {
    asMock(refundFeeRecord).mockRejectedValue({
      response: { status: 403, data: { detail: '學費累積退款 NT$1,500 超過 NT$1,000 審批閾值，需由具備『金流簽核』權限者（ACTIVITY_PAYMENT_APPROVE）執行' } },
    })
    ui.confirm.mockResolvedValue('confirm')
    asMock(createFeeRefundRequest).mockResolvedValue({ id: 9 })
    const w = mountModal()
    await fillAndSubmit(w)
    expect(createFeeRefundRequest).toHaveBeenCalledTimes(1)
    expect(w.emitted('requested')).toHaveLength(1)
  })

  it('使用者按「返回」→ 不送申請、dialog 保持開啟', async () => {
    asMock(refundFeeRecord).mockRejectedValue(APPROVAL_409)
    ui.confirm.mockRejectedValue('cancel')
    const w = mountModal()
    await fillAndSubmit(w)
    expect(createFeeRefundRequest).not.toHaveBeenCalled()
    expect(w.emitted('requested')).toBeUndefined()
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('其他錯誤（如超過已繳）→ 直接顯示錯誤，不詢問改送申請', async () => {
    asMock(refundFeeRecord).mockRejectedValue({ response: { status: 400, data: { detail: '退款金額超過已繳金額' } } })
    const w = mountModal()
    await fillAndSubmit(w)
    expect(ui.confirm).not.toHaveBeenCalled()
    expect(ui.error).toHaveBeenCalledWith('退款金額超過已繳金額')
  })

  it('送出申請失敗 → 顯示友善錯誤、不 emit requested', async () => {
    asMock(refundFeeRecord).mockRejectedValue(APPROVAL_409)
    ui.confirm.mockResolvedValue('confirm')
    asMock(createFeeRefundRequest).mockRejectedValue({ response: { status: 400, data: { detail: '此記錄尚未有任何繳費可退' } } })
    const w = mountModal()
    await fillAndSubmit(w)
    expect(w.emitted('requested')).toBeUndefined()
    expect(String(ui.error.mock.calls[0][0])).toContain('送出退費申請失敗')
  })
})

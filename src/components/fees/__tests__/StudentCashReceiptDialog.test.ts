/**
 * SPEC-019 §8.2 收現金 dialog：
 * - 載入該生未繳／部分繳單，分「本月銀行單／現金項目／其他月份未繳」三組
 * - 前兩組預設勾選、第三組不勾；金額可改但不得超過剩餘
 * - 送出 POST /fees/cash-receipts：amount=Σ、parts 逐單、idempotency_key
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  getFeeRecords: vi.fn(),
  createCashReceipt: vi.fn(() => Promise.resolve({ receipt_id: 9, allocation_ids: [], idempotent_replay: false })),
}))
vi.mock('@/api/fees', () => apiMocks)
vi.mock('@/utils/format', () => ({ todayISO: () => '2026-08-05' }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import StudentCashReceiptDialog from '@/components/fees/StudentCashReceiptDialog.vue'

const rec = (over: Record<string, unknown>) => ({
  id: 1, student_id: 5, student_name: '王小明', classroom_name: '天堂鳥班',
  fee_item_name: '8月月費 (2026-08)', amount_due: 10800, amount_paid: 0,
  status: 'unpaid', period: '115-1', fee_type: 'monthly', source: 'bill_slip',
  target_month: '2026-08', billing_start_date: '2026-08-01', due_date: '2026-08-10',
  ...over,
})

const STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue"><p>{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-input-number': {
    props: ['modelValue', 'min', 'max'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" v-bind="$attrs" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  'el-checkbox': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" v-bind="$attrs" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  'el-alert': { props: ['title'], template: '<div v-bind="$attrs">{{ title }}</div>' },
}

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(StudentCashReceiptDialog, {
    props: { modelValue: true, studentId: 5, studentName: '王小明', month: '2026-08', ...props },
    global: { stubs: STUBS },
  })
}

describe('StudentCashReceiptDialog', () => {
  beforeEach(() => {
    apiMocks.getFeeRecords.mockReset()
    apiMocks.createCashReceipt.mockClear()
    apiMocks.getFeeRecords.mockImplementation((params: { status: string }) =>
      Promise.resolve({
        total: 3, page: 1, page_size: 100,
        items:
          params.status === 'unpaid'
            ? [
                rec({ id: 11 }),
                rec({ id: 12, fee_item_name: '115-1 註冊費', fee_type: 'registration', amount_due: 15000, target_month: null }),
                rec({ id: 13, fee_item_name: '教材費', fee_type: 'material', amount_due: 2500, source: 'cash_item', target_month: null, billing_start_date: '2026-08-03' }),
                rec({ id: 14, fee_item_name: '7月月費 (2026-07)', amount_due: 10800, target_month: '2026-07', billing_start_date: '2026-07-01' }),
              ]
            : [rec({ id: 15, fee_item_name: '6月月費 (2026-06)', amount_due: 10800, amount_paid: 800, status: 'partial', target_month: '2026-06', billing_start_date: '2026-06-01' })],
      }),
    )
  })

  it('三組分組與預設勾選；合計＝本月銀行單＋現金項目', async () => {
    const w = mountDialog()
    await flushPromises()
    expect(apiMocks.getFeeRecords).toHaveBeenCalledTimes(2)
    const groups = w.findAll('[data-test="cash-group"]').map((g) => g.attributes('data-group'))
    expect(groups).toEqual(['bank', 'cash_item', 'other'])
    const checked = w.findAll('[data-test="cash-row"]').map((r) => ({
      id: r.attributes('data-record'),
      on: (r.find('[data-test="cash-row-check"]').element as HTMLInputElement).checked,
    }))
    expect(checked).toEqual([
      { id: '11', on: true }, { id: '12', on: true }, { id: '13', on: true },
      { id: '14', on: false }, { id: '15', on: false },
    ])
    expect(w.find('[data-test="cash-total"]').text()).toContain('28,300')
  })

  it('金額上限＝剩餘應繳；改金額後合計更新；送出 payload 正確', async () => {
    const w = mountDialog()
    await flushPromises()
    const row15 = w.find('[data-test="cash-row"][data-record="15"]')
    await row15.find('[data-test="cash-row-check"]').setValue(true)
    const amt15 = row15.find('[data-test="cash-row-amount"]')
    expect(amt15.attributes('max')).toBe('10000')
    await amt15.setValue('4000')
    expect(w.find('[data-test="cash-total"]').text()).toContain('32,300')
    await w.find('[data-test="cash-submit"]').trigger('click')
    await flushPromises()
    const payload = apiMocks.createCashReceipt.mock.calls[0][0] as {
      amount: number; received_date: string; parts: unknown[]; idempotency_key: string
    }
    expect(payload.amount).toBe(32300)
    expect(payload.received_date).toBe('2026-08-05')
    expect(payload.parts).toEqual([
      { part_type: 'fee_record', fee_record_id: 11, amount: 10800 },
      { part_type: 'fee_record', fee_record_id: 12, amount: 15000 },
      { part_type: 'fee_record', fee_record_id: 13, amount: 2500 },
      { part_type: 'fee_record', fee_record_id: 15, amount: 4000 },
    ])
    expect(payload.idempotency_key).toMatch(/^cashdlg-/)
    expect(w.emitted('paid')).toBeTruthy()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('全部取消勾選時送出鈕 disabled；無未繳單顯示空狀態', async () => {
    const w = mountDialog()
    await flushPromises()
    for (const r of w.findAll('[data-test="cash-row-check"]')) {
      await r.setValue(false)
    }
    expect(w.find('[data-test="cash-submit"]').attributes('disabled')).toBeDefined()
    apiMocks.getFeeRecords.mockImplementation(() => Promise.resolve({ total: 0, page: 1, page_size: 100, items: [] }))
    const w2 = mountDialog({ studentId: 6 })
    await flushPromises()
    expect(w2.find('[data-test="cash-empty"]').exists()).toBe(true)
  })

  it('preselectRecordIds 只勾指定的單', async () => {
    const w = mountDialog({ preselectRecordIds: [13] })
    await flushPromises()
    const on = w.findAll('[data-test="cash-row"]').filter(
      (r) => (r.find('[data-test="cash-row-check"]').element as HTMLInputElement).checked,
    )
    expect(on.map((r) => r.attributes('data-record'))).toEqual(['13'])
  })

  it('後端 409（關帳／交接已提交）顯示錯誤、不 emit paid', async () => {
    apiMocks.createCashReceipt.mockRejectedValueOnce({ response: { status: 409, data: { detail: '本月已關帳' } } })
    const w = mountDialog()
    await flushPromises()
    await w.find('[data-test="cash-submit"]').trigger('click')
    await flushPromises()
    const { ElMessage } = await import('element-plus')
    expect(ElMessage.error).toHaveBeenCalled()
    expect(w.emitted('paid')).toBeFalsy()
  })
})

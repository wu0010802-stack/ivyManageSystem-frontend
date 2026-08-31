/**
 * BatchPayDialog：批次登記繳費對話框（2026-08-23）。
 *
 * 語意固定「繳清全額」；per-item idempotency_key 開啟時逐列產生、
 * 失敗重試沿用同一把 key（避免網路重送造成重複入帳，比照 RefundSuggestModal 慣例）。
 * 部分失敗時對話框不自動關閉，只送出尚未成功的列，讓使用者可重試。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/fees', () => ({
  batchPayFeeRecords: vi.fn(),
}))

import { batchPayFeeRecords } from '@/api/fees'
import BatchPayDialog from '../BatchPayDialog.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

interface Row {
  record_id: number
  student_name: string
  amount_due: number
  status: string
  error?: string | null
  idempotency_key: string
}
interface DialogVm {
  form: { payment_date: string; payment_method: string; notes: string }
  rows: Row[]
  pendingRows: Row[]
  totalDue: number
  submit: () => Promise<void>
}

const RECORDS = [
  { id: 1, student_name: '小明', classroom_name: '向日葵', fee_item_name: '學費', period: '115-1', amount_due: 1000 },
  { id: 2, student_name: '小華', classroom_name: '向日葵', fee_item_name: '學費', period: '115-1', amount_due: 2000 },
]

function mountDialog(overrides: Record<string, unknown> = {}) {
  return mount(BatchPayDialog, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      records: RECORDS,
      ...overrides,
    },
  })
}
const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

beforeEach(() => vi.clearAllMocks())

describe('BatchPayDialog 初始化', () => {
  it('開啟時依 records 建立 rows，預設繳費日期為今日、方式為現金', async () => {
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.rows.length).toBe(2)
    expect(vm.rows.map((r) => r.record_id)).toEqual([1, 2])
    expect(vm.form.payment_method).toBe('現金')
    expect(vm.form.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('每列有合規 idempotency_key（^[A-Za-z0-9_-]{8,64}$）且逐列不同', async () => {
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    for (const r of vm.rows) {
      expect(r.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    }
    expect(vm.rows[0].idempotency_key).not.toBe(vm.rows[1].idempotency_key)
  })

  it('合計為所有待送出列的應繳總和', async () => {
    const w = mountDialog()
    await flushPromises()
    expect(vmOf(w).totalDue).toBe(3000)
  })
})

describe('BatchPayDialog 送出', () => {
  it('送出 payload 帶 items(record_id+idempotency_key)、payment_date、payment_method、notes', async () => {
    asMock(batchPayFeeRecords).mockResolvedValue({
      results: [
        { record_id: 1, ok: true, amount_paid: 1000 },
        { record_id: 2, ok: true, amount_paid: 2000 },
      ],
      succeeded: 2,
      failed: 0,
    })
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    vm.form.notes = '整批入帳'
    await vm.submit()
    await flushPromises()

    expect(batchPayFeeRecords).toHaveBeenCalledTimes(1)
    const payload = asMock(batchPayFeeRecords).mock.calls[0][0]
    expect(payload.items).toEqual([
      { record_id: 1, idempotency_key: vm.rows[0].idempotency_key },
      { record_id: 2, idempotency_key: vm.rows[1].idempotency_key },
    ])
    expect(payload.payment_date).toBe(vm.form.payment_date)
    expect(payload.payment_method).toBe('現金')
    expect(payload.notes).toBe('整批入帳')
  })

  it('全部成功 → emit paid 與 update:modelValue false', async () => {
    asMock(batchPayFeeRecords).mockResolvedValue({
      results: [
        { record_id: 1, ok: true, amount_paid: 1000 },
        { record_id: 2, ok: true, amount_paid: 2000 },
      ],
      succeeded: 2,
      failed: 0,
    })
    const w = mountDialog()
    await flushPromises()
    await vmOf(w).submit()
    await flushPromises()

    expect(w.emitted('paid')).toBeTruthy()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('部分失敗 → 對話框不自動關閉，失敗列標記原因，成功列不再送出', async () => {
    asMock(batchPayFeeRecords).mockResolvedValue({
      results: [
        { record_id: 1, ok: true, amount_paid: 1000 },
        { record_id: 2, ok: false, error: '已繳清' },
      ],
      succeeded: 1,
      failed: 1,
    })
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    await vm.submit()
    await flushPromises()

    expect(w.emitted('paid')).toBeTruthy()
    expect(w.emitted('update:modelValue')).toBeFalsy()
    expect(vm.rows.find((r) => r.record_id === 2)?.status).toBe('error')
    expect(vm.rows.find((r) => r.record_id === 2)?.error).toBe('已繳清')
    expect(vm.pendingRows.length).toBe(1)
    expect(vm.pendingRows[0].record_id).toBe(2)
  })

  it('重試只送出未成功列，且沿用同一把 idempotency_key', async () => {
    asMock(batchPayFeeRecords).mockResolvedValueOnce({
      results: [
        { record_id: 1, ok: true, amount_paid: 1000 },
        { record_id: 2, ok: false, error: '已繳清' },
      ],
      succeeded: 1,
      failed: 1,
    })
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    const originalKey = vm.rows[1].idempotency_key
    await vm.submit()
    await flushPromises()

    asMock(batchPayFeeRecords).mockResolvedValueOnce({
      results: [{ record_id: 2, ok: true, amount_paid: 2000 }],
      succeeded: 1,
      failed: 0,
    })
    await vm.submit()
    await flushPromises()

    expect(batchPayFeeRecords).toHaveBeenCalledTimes(2)
    const secondPayload = asMock(batchPayFeeRecords).mock.calls[1][0]
    expect(secondPayload.items).toEqual([{ record_id: 2, idempotency_key: originalKey }])
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('API 拋錯（非部分失敗回應）不會讓 rows 全部標記失敗，對話框仍開著可重試', async () => {
    asMock(batchPayFeeRecords).mockRejectedValueOnce(new Error('network timeout'))
    const w = mountDialog()
    await flushPromises()
    const vm = vmOf(w)
    await vm.submit()
    await flushPromises()

    expect(w.emitted('update:modelValue')).toBeFalsy()
    expect(vm.pendingRows.length).toBe(2)
  })
})

describe('BatchPayDialog 重新開啟', () => {
  it('關閉後重開會重建 rows 與新的 idempotency_key（不沿用上次嘗試）', async () => {
    const w = mountDialog()
    await flushPromises()
    const firstKey = vmOf(w).rows[0].idempotency_key

    await w.setProps({ modelValue: false })
    await flushPromises()
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(vmOf(w).rows[0].idempotency_key).not.toBe(firstKey)
  })
})

/**
 * 月繳總表「檢視」彈窗（FeeCollectionDetailDialog）：
 * - 開啟即以該生本月所有 record_id 查 GET /fees/records/collections
 * - 每張帳款一段：費用項目、應繳／已繳／狀態，事件依時間列出
 * - 事件依 kind 顯示：現金收款（收款人、登錄時間、交接批簽收進度）、
 *   網銀銷帳（媒合人、媒合時間、入帳日／交易時間）、代收入帳、沖銷（負值＋原因）、
 *   繳費流水（未立據）、退款
 * - 無事件顯示「尚無收款紀錄」；載入失敗可重試
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  getFeeRecordCollections: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import FeeCollectionDetailDialog from '@/components/fees/FeeCollectionDetailDialog.vue'

const STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue"><p data-test="dlg-title">{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-skeleton': { template: '<div data-testid="coll-skeleton" />' },
}

const event = (over: Record<string, unknown>) => ({
  kind: 'cash',
  amount: 10800,
  is_reversal: false,
  occurred_at: '2026-08-05T09:30:00',
  operator_name: '王會計',
  reason: null,
  receipt_id: 7,
  receipt_status: 'confirmed',
  received_date: '2026-08-05',
  received_by_name: '王會計',
  payer_note: null,
  payment_method: 'cash',
  notes: null,
  handover: null,
  bank_transaction: null,
  collection_payment: null,
  ...over,
})

const record = (over: Record<string, unknown>) => ({
  record_id: 21,
  fee_item_name: '月費 (2026-08)',
  amount_due: 10800,
  amount_paid: 10800,
  status: 'paid',
  events: [],
  ...over,
})

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(FeeCollectionDetailDialog, {
    props: {
      modelValue: true,
      recordIds: [21, 22],
      studentName: '陳部分',
      month: '2026-08',
      ...props,
    },
    global: { stubs: STUBS },
  })
}

const rows = (w: ReturnType<typeof mountDialog>) => w.findAll('[data-test="coll-event"]')

describe('FeeCollectionDetailDialog', () => {
  beforeEach(() => {
    apiMocks.getFeeRecordCollections.mockReset()
  })

  it('開啟即以 recordIds 查詢；標題帶學生與民國月份；每張帳款一段', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({ record_id: 21 }),
        record({
          record_id: 22,
          fee_item_name: '保險費',
          amount_due: 180,
          amount_paid: 0,
          status: 'unpaid',
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    expect(apiMocks.getFeeRecordCollections).toHaveBeenCalledWith([21, 22])
    expect(w.find('[data-test="dlg-title"]').text()).toContain('陳部分')
    expect(w.find('[data-test="dlg-title"]').text()).toContain('115 年 8 月')

    const sections = w.findAll('[data-test="coll-record"]')
    expect(sections.map((s) => s.attributes('data-record'))).toEqual(['21', '22'])
    expect(sections[0].text()).toContain('月費 (2026-08)')
    expect(sections[0].text()).toContain('10,800')
    expect(sections[1].text()).toContain('保險費')
    expect(sections[1].text()).toContain('未繳')
    // 無事件的帳款明講「尚無收款紀錄」，不留空白讓人以為壞了
    expect(sections[1].find('[data-test="coll-empty"]').text()).toContain('尚無收款紀錄')
  })

  it('現金收款：顯示收款人、登錄時間、收款日與交接批簽收進度', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({
              handover: {
                id: 3,
                business_date: '2026-08-05',
                status: 'confirmed',
                submitted_at: '2026-08-05T17:00:00',
                confirmed_by_name: '陳園長',
                confirmed_at: '2026-08-05T18:30:00',
              },
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const r = rows(w)
    expect(r).toHaveLength(1)
    expect(r[0].attributes('data-kind')).toBe('cash')
    expect(r[0].find('[data-test="coll-what"]').text()).toContain('現金收款')
    expect(r[0].find('[data-test="coll-who"]').text()).toContain('王會計')
    expect(r[0].find('[data-test="coll-when"]').text()).toContain('2026-08-05 09:30')
    expect(r[0].find('[data-test="coll-amount"]').text()).toContain('10,800')
    const confirm = r[0].find('[data-test="coll-confirm"]').text()
    expect(confirm).toContain('老闆已簽收')
    expect(confirm).toContain('陳園長')
    expect(confirm).toContain('2026-08-05 18:30')
  })

  it('現金未簽收：draft 顯示「現金已登錄」、submitted 顯示「待老闆簽收」', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({
              handover: { id: 3, business_date: '2026-08-05', status: 'draft', submitted_at: null, confirmed_by_name: null, confirmed_at: null },
            }),
            event({
              occurred_at: '2026-08-06T09:30:00',
              handover: { id: 4, business_date: '2026-08-06', status: 'submitted', submitted_at: '2026-08-06T17:00:00', confirmed_by_name: null, confirmed_at: null },
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const r = rows(w)
    expect(r[0].find('[data-test="coll-confirm"]').text()).toContain('現金已登錄')
    expect(r[1].find('[data-test="coll-confirm"]').text()).toContain('待老闆簽收')
    expect(r[1].find('[data-test="coll-confirm"]').text()).toContain('2026-08-06 17:00')
  })

  it('網銀銷帳：顯示媒合人、媒合時間與銀行入帳日／交易時間／摘要', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({
              kind: 'bank',
              payment_method: 'bank_transfer',
              occurred_at: '2026-08-04T10:12:00',
              operator_name: '林出納',
              received_by_name: '林出納',
              received_date: '2026-08-03',
              bank_transaction: {
                id: 55,
                posting_date: '2026-08-03',
                transaction_at: '2026-08-03T14:30:00',
                summary: '網銀轉入',
              },
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const r = rows(w)[0]
    expect(r.attributes('data-kind')).toBe('bank')
    expect(r.find('[data-test="coll-what"]').text()).toContain('網銀銷帳')
    expect(r.find('[data-test="coll-who"]').text()).toContain('林出納')
    expect(r.find('[data-test="coll-when"]').text()).toContain('2026-08-04 10:12')
    const confirm = r.find('[data-test="coll-confirm"]').text()
    expect(confirm).toContain('2026-08-03')
    expect(confirm).toContain('14:30')
    expect(confirm).toContain('網銀轉入')
  })

  it('代收入帳：顯示客戶繳費日、入帳日與通路', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({
              kind: 'collection',
              payment_method: 'bank_transfer',
              collection_payment: {
                id: 9,
                customer_paid_date: '2026-08-02',
                posting_date: '2026-08-04',
                channel: '超商',
              },
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const r = rows(w)[0]
    expect(r.find('[data-test="coll-what"]').text()).toContain('代收入帳')
    const confirm = r.find('[data-test="coll-confirm"]').text()
    expect(confirm).toContain('2026-08-02')
    expect(confirm).toContain('2026-08-04')
    expect(confirm).toContain('超商')
  })

  it('沖銷：負值金額、標「沖銷」並顯示原因', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({ kind: 'bank', payment_method: 'bank_transfer' }),
            event({
              kind: 'bank',
              payment_method: 'bank_transfer',
              amount: -10800,
              is_reversal: true,
              occurred_at: '2026-08-07T11:00:00',
              reason: '媒合錯人，重新分配',
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const rev = rows(w)[1]
    expect(rev.attributes('data-reversal')).toBe('1')
    expect(rev.find('[data-test="coll-what"]').text()).toContain('沖銷')
    expect(rev.find('[data-test="coll-amount"]').text()).toContain('-10,800')
    expect(rev.find('[data-test="coll-note"]').text()).toContain('媒合錯人，重新分配')
  })

  it('繳費流水（未立據）與退款各有標示', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({
      records: [
        record({
          events: [
            event({
              kind: 'legacy_payment',
              amount: 5000,
              occurred_at: '2026-07-20T09:15:00',
              operator_name: '舊會計',
              receipt_id: null,
              received_by_name: null,
              payment_method: '轉帳',
              notes: '家長匯款',
            }),
            event({
              kind: 'refund',
              amount: -3000,
              occurred_at: '2026-08-21T10:00:00',
              operator_name: '王會計',
              reason: '退學按日退費',
              notes: '8/20 退學',
              receipt_id: null,
              received_date: null,
              received_by_name: null,
              payment_method: null,
            }),
          ],
        }),
      ],
    })
    const w = mountDialog()
    await flushPromises()
    const r = rows(w)
    expect(r[0].find('[data-test="coll-what"]').text()).toContain('繳費流水')
    expect(r[0].find('[data-test="coll-what"]').text()).toContain('未立據')
    expect(r[0].find('[data-test="coll-confirm"]').text()).toContain('轉帳')
    expect(r[0].find('[data-test="coll-note"]').text()).toContain('家長匯款')
    expect(r[1].find('[data-test="coll-what"]').text()).toContain('退款')
    expect(r[1].find('[data-test="coll-amount"]').text()).toContain('-3,000')
    expect(r[1].find('[data-test="coll-note"]').text()).toContain('退學按日退費')
  })

  it('載入失敗顯示錯誤與重試；重試後重新查詢', async () => {
    apiMocks.getFeeRecordCollections.mockRejectedValueOnce(new Error('boom'))
    const w = mountDialog()
    await flushPromises()
    expect(w.find('[data-test="coll-error"]').exists()).toBe(true)
    apiMocks.getFeeRecordCollections.mockResolvedValueOnce({ records: [record({})] })
    await w.find('[data-test="coll-retry"]').trigger('click')
    await flushPromises()
    expect(apiMocks.getFeeRecordCollections).toHaveBeenCalledTimes(2)
    expect(w.find('[data-test="coll-error"]').exists()).toBe(false)
    expect(w.findAll('[data-test="coll-record"]')).toHaveLength(1)
  })

  it('關閉時不查詢；換學生重新開啟時以新的 recordIds 再查', async () => {
    apiMocks.getFeeRecordCollections.mockResolvedValue({ records: [] })
    const w = mountDialog({ modelValue: false })
    await flushPromises()
    expect(apiMocks.getFeeRecordCollections).not.toHaveBeenCalled()
    await w.setProps({ modelValue: true, recordIds: [31] })
    await flushPromises()
    expect(apiMocks.getFeeRecordCollections).toHaveBeenCalledWith([31])
  })
})

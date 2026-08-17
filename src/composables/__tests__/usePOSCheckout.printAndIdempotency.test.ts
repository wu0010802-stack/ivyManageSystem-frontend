import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS bug hunt 2026-08-14，三條回歸：
// 1. 結帳後的第一次列印不得標「補印」——後端 print.pdf 端點是前端唯一列印路徑，
//    舊版無條件 is_reprint=True，家長拿到的正本印著「（補印）」。首印須傳
//    reprint=false，交易列表補印才傳 true。
// 2. idempotency_key 在首次送出時凍結、成功或 4xx 後才釋放。
//    ⚠ 2026-08-15 code review P2-06 起，payment_date 已改由**後端**以台北時區決定、
//    前端不再送該欄位（原本前端凍結 payment_date 的兩條斷言隨之調整為「不送日期」
//    ＋「key 凍結／釋放」；日期相關斷言見 usePOSCheckout.conflictAndRefresh.test.ts）。
// 3. 大額二次確認期間 submitting 必須already為 true，否則 confirm 對話框開著時
//    canSubmit 仍為 true、送出鈕未 disable。

vi.mock('@/api/activity', () => ({
  getPOSDailySummary: vi.fn(),
  getPOSOutstandingByStudent: vi.fn(),
  getPOSReceiptPdf: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  getRegistrations: vi.fn(),
  posCheckout: vi.fn(),
  getRefundSuggestion: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

vi.mock('@/utils/printPdfWindow', () => ({
  openPdfInNewTab: vi.fn(async (opts: { fetchBlob: () => Promise<unknown> }) => {
    await opts.fetchBlob()
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn() },
}))

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSReceiptPdf,
  getPOSRecentTransactions,
  posCheckout,
} from '@/api/activity'
import { ElMessageBox } from 'element-plus'
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

const ROW = {
  id: 42,
  student_name: '王小明',
  class_name: '大班',
  total_amount: 2000,
  paid_amount: 0,
  owed: 2000,
  courses: [],
  supplies: [],
}

function checkoutOk(receiptNo = 'POS-20260814-ABCDEF123456') {
  return {
    data: {
      receipt_no: receiptNo,
      type: 'payment',
      total: 2000,
      payment_method: '現金',
      payment_date: '2026-08-14',
      operator: 'admin',
      notes: '',
      created_at: '2026-08-14T10:00:00',
      items: [],
    },
  } as never
}

describe('usePOSCheckout：首印/補印標記與冪等凍結（2026-08-14）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: false, total_active: 0 },
    } as never)
    vi.mocked(getPOSDailySummary).mockResolvedValue({ data: {} } as never)
    vi.mocked(getPOSRecentTransactions).mockResolvedValue({
      data: { transactions: [] },
    } as never)
    vi.mocked(getPOSReceiptPdf).mockResolvedValue({ data: new Blob() } as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('結帳後首印：帶 reprint=false，不得標補印', async () => {
    const { api } = mountComposable()
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())

    api.selectItem(ROW, '王小明')
    await api.submit({ print: true })
    await flushPromises()

    expect(getPOSReceiptPdf).toHaveBeenCalledWith(
      'POS-20260814-ABCDEF123456',
      expect.objectContaining({ reprint: false })
    )
  })

  it('從交易列表補印：帶 reprint=true', async () => {
    const { api } = mountComposable()

    await api.reprintTransaction({
      receipt_no: 'POS-20260814-999999999999',
      type: 'payment',
      total: 500,
      items: [],
    })
    await flushPromises()

    expect(getPOSReceiptPdf).toHaveBeenCalledWith(
      'POS-20260814-999999999999',
      expect.objectContaining({ reprint: true })
    )
  })

  it('網路中斷後重試：沿用同一把 idempotency_key，且始終不送 payment_date', async () => {
    const { api } = mountComposable()

    // 首次：網路中斷（無 response → 不可釋放 key）
    vi.mocked(posCheckout).mockRejectedValueOnce(new Error('Network Error'))
    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())
    await api.submit({ print: false })
    await flushPromises()

    const first = vi.mocked(posCheckout).mock.calls[0][0] as Record<string, unknown>
    const second = vi.mocked(posCheckout).mock.calls[1][0] as Record<string, unknown>
    expect(second.idempotency_key).toBe(first.idempotency_key)
    // 日期權威在後端（P2-06）：跨午夜重試不會因前端重算日期而讓內容簽章對不上
    expect('payment_date' in first).toBe(false)
    expect('payment_date' in second).toBe(false)
  })

  it('4xx 後重新送出：換新 key（視為全新交易）', async () => {
    const { api } = mountComposable()

    vi.mocked(posCheckout).mockRejectedValueOnce({
      response: { status: 400, data: { detail: '報名 42 無應繳金額，無法收款' } },
    })
    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    // 4xx 已釋放 key，重送視為全新交易。
    // 不重新 selectItem——同 id 再點是「取消選取」語意，選取在 4xx 後本就保留。
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())
    await api.submit({ print: false })
    await flushPromises()

    const first = vi.mocked(posCheckout).mock.calls[0][0]
    const second = vi.mocked(posCheckout).mock.calls[1][0]
    expect(second.idempotency_key).not.toBe(first.idempotency_key)
  })

  it('大額二次確認期間：submitting 為 true、canSubmit 為 false', async () => {
    const { api } = mountComposable()
    let releaseConfirm: (() => void) | null = null
    vi.mocked(ElMessageBox.confirm).mockImplementation(
      () => new Promise<void>((resolve) => { releaseConfirm = () => resolve() }) as never
    )
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())

    api.selectItem(ROW, '王小明')   // amount 2000 < 10000
    api.updateSelectedAmount(50000) // 觸發大額確認
    const pending = api.submit({ print: false })
    await flushPromises()

    expect(api.submitting.value).toBe(true)
    expect(api.canSubmit.value).toBe(false)

    releaseConfirm?.()
    await pending
    await flushPromises()
    expect(api.submitting.value).toBe(false)
  })

  it('大額確認被取消：submitting 復位、不送出', async () => {
    const { api } = mountComposable()
    vi.mocked(ElMessageBox.confirm).mockRejectedValue(new Error('cancel'))
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())

    api.selectItem(ROW, '王小明')
    api.updateSelectedAmount(50000)
    await api.submit({ print: false })
    await flushPromises()

    expect(posCheckout).not.toHaveBeenCalled()
    expect(api.submitting.value).toBe(false)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS bug hunt 2026-08-14，三條回歸：
// 1. 結帳後的第一次列印不得標「補印」——後端 print.pdf 端點是前端唯一列印路徑，
//    舊版無條件 is_reprint=True，家長拿到的正本印著「（補印）」。首印須傳
//    reprint=false，交易列表補印才傳 true。
// 2. payment_date 必須與 idempotency_key 一起在首次送出時凍結。舊版每次重試都
//    重算 taipeiTodayISO()，跨午夜重試時後端內容簽章（含 payment_date）不符 →
//    409 → 前端因 4xx 釋放 key → 再送＝新 key + 新日期＝重複入帳。
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

  it('結帳成功：顯示收據 dialog 但不自動觸發列印（②收款改造，2026-08-16）', async () => {
    const { api } = mountComposable()
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())

    api.selectItem(ROW, '王小明')
    await api.submit()
    await flushPromises()

    expect(api.receiptDialogVisible.value).toBe(true)
    expect(getPOSReceiptPdf).not.toHaveBeenCalled()
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

  it('重試沿用首次凍結的 payment_date 與 idempotency_key（跨午夜不得改日期）', async () => {
    const { api } = mountComposable()

    // 台北當日以外部變數驅動：兩次送出「之間」跨過午夜
    let today = '2026-08-14'
    const dateSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockImplementation(() => today)

    // 首次：網路中斷（無 response → 不可釋放 key）
    vi.mocked(posCheckout).mockRejectedValueOnce(new Error('Network Error'))
    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    today = '2026-08-15' // ← 收銀員重試前已跨日
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())
    await api.submit({ print: false })
    await flushPromises()

    const first = vi.mocked(posCheckout).mock.calls[0][0]
    const second = vi.mocked(posCheckout).mock.calls[1][0]
    expect(first.payment_date).toBe('2026-08-14')
    expect(second.payment_date).toBe(first.payment_date)
    expect(second.idempotency_key).toBe(first.idempotency_key)
    dateSpy.mockRestore()
  })

  it('4xx 後重新送出：換新 key 且重新取當日日期', async () => {
    const { api } = mountComposable()
    let today = '2026-08-14'
    const dateSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockImplementation(() => today)

    vi.mocked(posCheckout).mockRejectedValueOnce({
      response: { status: 400, data: { detail: '報名 42 無應繳金額，無法收款' } },
    })
    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    // 4xx 已釋放 key，重送視為全新交易、取當下日期。
    // 不重新 selectItem——同 id 再點是「取消選取」語意，選取在 4xx 後本就保留。
    today = '2026-08-15'
    vi.mocked(posCheckout).mockResolvedValue(checkoutOk())
    await api.submit({ print: false })
    await flushPromises()

    const first = vi.mocked(posCheckout).mock.calls[0][0]
    const second = vi.mocked(posCheckout).mock.calls[1][0]
    expect(first.payment_date).toBe('2026-08-14')
    expect(second.idempotency_key).not.toBe(first.idempotency_key)
    expect(second.payment_date).toBe('2026-08-15')
    dateSpy.mockRestore()
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

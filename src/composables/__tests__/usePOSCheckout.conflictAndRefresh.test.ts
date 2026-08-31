import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS code review 2026-08-15，四條回歸：
//
// P2-04：409 代表「這把 idempotency_key 已經成立過一筆有效收據」——也就是前一筆
//   **已經入帳**。舊版把它併進通用 4xx：清 key、只彈幾秒就消失的 ElMessage.error、
//   不刷新任何清單。櫃台看不到那筆收據就再按一次，新 key 產生第二筆＝重複收款。
//   修法：先刷新今日交易與搜尋（讓那筆已存在的交易當場現形），再用阻斷式
//   ElMessageBox.alert 說明。
//
// P2-06：payment_date 的權威來源改為後端（台北時區當日）。前端不再送出該欄位，
//   避免收銀電腦時區/時鐘偏差寫出錯誤日期的收據。
//
// P2-07：今日交易列表上限自 20 提到 100（與日結頁一致），並消費後端新增的
//   total / truncated 讓 UI 顯示「顯示 N／共 M 張」。
//
// P3-05：日結彙總刷新失敗時必須留下錯誤旗標並清掉舊值——否則結帳成功後刷新失敗，
//   彙總條顯示的是**不含本筆**的舊金額，櫃台據此點鈔會少算。

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

// 真實 openPdfInNewTab 會開新分頁；此處只轉發 fetchBlob 的錯誤給 onError，
// 用來驗證 P3-15 的 blob 錯誤 detail 解析。
vi.mock('@/utils/printPdfWindow', () => ({
  openPdfInNewTab: vi.fn(
    async (opts: { fetchBlob: () => Promise<unknown>; onError?: (e: unknown) => unknown }) => {
      try {
        await opts.fetchBlob()
      } catch (e) {
        await opts.onError?.(e)
      }
    }
  ),
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn(() => Promise.resolve()) },
}))

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSReceiptPdf,
  getPOSRecentTransactions,
  posCheckout,
} from '@/api/activity'
import { ElMessage, ElMessageBox } from 'element-plus'
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

describe('usePOSCheckout：409 重複收款防線與刷新失敗可見性（2026-08-15）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: false, total_active: 0 },
    } as never)
    vi.mocked(getPOSDailySummary).mockResolvedValue({ data: { net: 0 } } as never)
    vi.mocked(getPOSRecentTransactions).mockResolvedValue({
      data: { transactions: [], total: 0, truncated: false },
    } as never)
    vi.mocked(getPOSReceiptPdf).mockResolvedValue({ data: new Blob() } as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('P2-04：409 走阻斷式對話框，且先刷新今日交易與搜尋讓已入帳那筆現形', async () => {
    const { api } = mountComposable()
    vi.mocked(posCheckout).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: '此 idempotency_key 已用於另一筆內容不同的交易' },
      },
    })

    const recentBefore = vi.mocked(getPOSRecentTransactions).mock.calls.length
    const searchBefore = vi.mocked(getPOSOutstandingByStudent).mock.calls.length

    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    // 阻斷式對話框（幾秒即消的 toast 不足以擋下再按一次）
    expect(ElMessageBox.alert).toHaveBeenCalled()
    const [content, title] = vi.mocked(ElMessageBox.alert).mock.calls[0]
    expect(String(content)).toContain('已成功入帳')
    expect(String(title)).toContain('重複')
    expect(ElMessage.error).not.toHaveBeenCalled()

    // 彈窗前必須刷新，否則櫃台在對話框裡被告知「去看交易列表」卻看不到那筆
    expect(vi.mocked(getPOSRecentTransactions).mock.calls.length).toBeGreaterThan(recentBefore)
    expect(vi.mocked(getPOSOutstandingByStudent).mock.calls.length).toBeGreaterThan(searchBefore)
  })

  it('P2-06：payload 不再送 payment_date（改由後端以台北時區決定）', async () => {
    const { api } = mountComposable()
    vi.mocked(posCheckout).mockResolvedValue({
      data: {
        receipt_no: 'POS-20260815-ABCDEF123456',
        type: 'payment',
        total: 2000,
        items: [],
      },
    } as never)

    api.selectItem(ROW, '王小明')
    await api.submit({ print: false })
    await flushPromises()

    const payload = vi.mocked(posCheckout).mock.calls[0][0] as Record<string, unknown>
    expect('payment_date' in payload).toBe(false)
    expect(payload.idempotency_key).toBeTruthy()
  })

  it('P2-07：今日交易上限為 100，並保留後端回的 total / truncated', async () => {
    const { api } = mountComposable()
    vi.mocked(getPOSRecentTransactions).mockResolvedValue({
      data: {
        transactions: [{ receipt_no: 'POS-1' }],
        total: 137,
        truncated: true,
      },
    } as never)

    await api.refreshRecentTransactions()
    await flushPromises()

    expect(getPOSRecentTransactions).toHaveBeenCalledWith({ limit: 100 })
    expect(api.recentTransactions.total).toBe(137)
    expect(api.recentTransactions.truncated).toBe(true)
    expect(api.recentTransactions.error).toBe(false)
  })

  it('P3-05：日結刷新失敗時清掉舊值並立錯誤旗標（不得續留少算的舊金額）', async () => {
    const { api } = mountComposable()

    await api.refreshDailySummary()
    await flushPromises()
    expect(api.dailySummary.data).not.toBeNull()

    vi.mocked(getPOSDailySummary).mockRejectedValue(new Error('Network Error'))
    await api.refreshDailySummary()
    await flushPromises()

    expect(api.dailySummary.error).toBe(true)
    expect(api.dailySummary.data).toBeNull()
  })

  it('P3-05：今日交易刷新失敗時立錯誤旗標，成功後復位', async () => {
    const { api } = mountComposable()

    vi.mocked(getPOSRecentTransactions).mockRejectedValueOnce(new Error('Network Error'))
    await api.refreshRecentTransactions()
    await flushPromises()
    expect(api.recentTransactions.error).toBe(true)

    await api.refreshRecentTransactions()
    await flushPromises()
    expect(api.recentTransactions.error).toBe(false)
  })

  it('P3-06：搜尋失敗時立 searchError 旗標，成功後復位（讓空清單能區分兩種成因）', async () => {
    const { api } = mountComposable()
    await flushPromises()
    expect(api.searchError.value).toBe(false)

    vi.mocked(getPOSOutstandingByStudent).mockRejectedValueOnce(new Error('Network Error'))
    await api.runSearch()
    await flushPromises()
    // fail-closed 清空清單的同時要留下「這是失敗、不是真的沒資料」的證據
    expect(api.searchGroups.value).toEqual([])
    expect(api.searchError.value).toBe(true)

    await api.runSearch()
    await flushPromises()
    expect(api.searchError.value).toBe(false)
  })

  it('P3-15：列印失敗時顯示後端 blob detail，而非 axios 通用訊息', async () => {
    const { api } = mountComposable()
    api.lastReceipt.value = { receipt_no: 'POS-20260815-ABCDEF123456' }

    vi.mocked(getPOSReceiptPdf).mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: new Blob([JSON.stringify({ detail: '該收據已作廢，無法列印' })], {
          type: 'application/json',
        }),
      },
    })

    await api.printReceipt({ reprint: true })
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('該收據已作廢，無法列印')
  })
})

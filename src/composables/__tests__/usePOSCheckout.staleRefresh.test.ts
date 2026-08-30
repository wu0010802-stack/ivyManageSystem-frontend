import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// CONC-03（2026-08-24 bug hunt）：結帳後的刷新被去重層吞成「結帳前」的快照。
//
// apiDedupe 對「同 key 且仍在途」的 GET 直接回傳既有 promise。POS 兩支刷新的 key 恆定，
// 櫃台只要在送出前按過「重新整理」，結帳後的 Promise.allSettled 刷新就領到結帳前的
// 舊快照——彙總條顯示不含本筆的金額，櫃台據此點鈔會少算。
//
// 本檔驗證 composable 這一側的接線：
// - 結帳成功／409 之後的刷新一律帶 force（繞過去重，見 api/activity.ts 的逃生口）
// - 一般（手動、mount）刷新不帶 force，既有呼叫契約逐字不變
// - 兩支刷新加請求序號守衛：較早發出的舊回應不得覆蓋較新的結果

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
vi.mock('@/utils/printPdfWindow', () => ({ openPdfInNewTab: vi.fn(async () => ({})) }))
vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn(() => Promise.resolve()) },
}))

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSRecentTransactions,
  posCheckout,
} from '@/api/activity'
import { usePOSCheckout } from '@/composables/usePOSCheckout'

function mountComposable() {
  let api: ReturnType<typeof usePOSCheckout>
  mount({
    setup() {
      api = usePOSCheckout()
      return () => null
    },
  })
  // @ts-expect-error 由 setup 賦值
  return api as ReturnType<typeof usePOSCheckout>
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

describe('usePOSCheckout：結帳後刷新必須繞過去重（CONC-03）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: false, total_active: 0 },
    } as never)
    vi.mocked(getPOSDailySummary).mockResolvedValue({ data: { net: 0 } } as never)
    vi.mocked(getPOSRecentTransactions).mockResolvedValue({
      data: { transactions: [], total: 0, truncated: false },
    } as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('結帳成功後的刷新帶 force，強制發出新請求', async () => {
    const api = mountComposable()
    vi.mocked(posCheckout).mockResolvedValue({
      data: { receipt_no: 'POS-20260824-A1', type: 'payment', total: 2000, items: [] },
    } as never)

    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    expect(getPOSDailySummary).toHaveBeenCalledWith(undefined, { force: true })
    expect(getPOSRecentTransactions).toHaveBeenCalledWith({ limit: 100 }, { force: true })
  })

  it('409 後的今日交易刷新也帶 force（否則櫃台看不到那筆已入帳的收據）', async () => {
    const api = mountComposable()
    vi.mocked(posCheckout).mockRejectedValue({
      response: { status: 409, data: { detail: '該筆繳費仍然有效' } },
    })

    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    expect(getPOSRecentTransactions).toHaveBeenCalledWith({ limit: 100 }, { force: true })
  })

  it('手動刷新不帶 force：既有呼叫契約逐字不變', async () => {
    const api = mountComposable()
    await flushPromises()
    vi.mocked(getPOSRecentTransactions).mockClear()
    vi.mocked(getPOSDailySummary).mockClear()

    await api.refreshRecentTransactions()
    await api.refreshDailySummary()

    expect(getPOSRecentTransactions).toHaveBeenCalledWith({ limit: 100 })
    expect(vi.mocked(getPOSRecentTransactions).mock.calls[0].length).toBe(1)
    expect(vi.mocked(getPOSDailySummary).mock.calls[0].length).toBe(0)
  })

  it('日結刷新有序號守衛：較早發出的舊回應不得覆蓋較新的結果', async () => {
    const api = mountComposable()
    await flushPromises()

    let resolveStale: (() => void) | null = null
    vi.mocked(getPOSDailySummary)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = () => resolve({ data: { net: 100 } } as never)
          }) as never
      )
      .mockImplementationOnce(async () => ({ data: { net: 999 } }) as never)

    const stalePromise = api.refreshDailySummary()
    const freshPromise = api.refreshDailySummary({ force: true })
    await freshPromise
    resolveStale?.()
    await stalePromise
    await flushPromises()

    expect((api.dailySummary.data as { net?: number } | null)?.net).toBe(999)
  })

  it('今日交易刷新有序號守衛：舊回應不得覆蓋新回應', async () => {
    const api = mountComposable()
    await flushPromises()

    let resolveStale: (() => void) | null = null
    vi.mocked(getPOSRecentTransactions)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = () =>
              resolve({ data: { transactions: [{ receipt_no: '舊' }], total: 1 } } as never)
          }) as never
      )
      .mockImplementationOnce(
        async () =>
          ({ data: { transactions: [{ receipt_no: '新' }], total: 2 } }) as never
      )

    const stalePromise = api.refreshRecentTransactions()
    const freshPromise = api.refreshRecentTransactions({ force: true })
    await freshPromise
    resolveStale?.()
    await stalePromise
    await flushPromises()

    expect(api.recentTransactions.total).toBe(2)
    expect(api.recentTransactions.items.map((t) => t.receipt_no)).toEqual(['新'])
  })
})

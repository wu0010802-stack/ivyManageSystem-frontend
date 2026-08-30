import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// STATE-03（2026-08-24 bug hunt）：結帳 409 一律說成「前一筆已成功入帳」，
// 但後端（api/activity/pos.py）在「該 idempotency_key 的紀錄**已全數作廢**」時也回 409：
//   detail = 「idempotency_key 已被使用且關聯紀錄已作廢；若需重收同筆，請使用新的
//             idempotency_key 重送」
// 此時一毛都沒入帳（spec C5 的本意正是要櫃台換 key 重收）。舊文案叫櫃台「請勿重複收款」
// → 該筆永久漏收。兩種 409 必須依 detail 分流。

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
import { ElMessageBox } from 'element-plus'
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

// 後端逐字文案（api/activity/pos.py，兩處 raise 完全一致）
const VOIDED_DETAIL =
  'idempotency_key 已被使用且關聯紀錄已作廢；若需重收同筆，請使用新的 idempotency_key 重送'
const STILL_VALID_DETAIL =
  'idempotency_key 已用於既有繳費紀錄（非 POS 收據，無法回放）；該筆繳費仍然有效，'
  + '請先確認是否重複收款；若確為新交易，請使用新的 idempotency_key 重送'

describe('usePOSCheckout：409 兩種情境必須分流（STATE-03）', () => {
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

  it('紀錄已作廢的 409：不得說成「已成功入帳」，要明講款項未有效入帳、請以新交易重收', async () => {
    const api = mountComposable()
    vi.mocked(posCheckout).mockRejectedValue({
      response: { status: 409, data: { detail: VOIDED_DETAIL } },
    })

    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    expect(ElMessageBox.alert).toHaveBeenCalled()
    const [content, title] = vi.mocked(ElMessageBox.alert).mock.calls[0]
    expect(String(content)).not.toContain('已成功入帳')
    expect(String(title)).not.toContain('請勿重複收款')
    expect(String(content)).toContain('作廢')
    expect(String(content)).toContain('未有效入帳')
    expect(String(content)).toContain('新交易')
  })

  it('紀錄已作廢的 409 之後，下一次送出必須是全新交易（換新 idempotency_key）', async () => {
    const api = mountComposable()
    vi.mocked(posCheckout).mockRejectedValueOnce({
      response: { status: 409, data: { detail: VOIDED_DETAIL } },
    })

    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    vi.mocked(posCheckout).mockResolvedValueOnce({
      data: { receipt_no: 'POS-20260824-B2', type: 'payment', total: 2000, items: [] },
    } as never)
    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    const calls = vi.mocked(posCheckout).mock.calls
    expect(calls.length).toBe(2)
    const firstKey = (calls[0][0] as Record<string, unknown>).idempotency_key
    const secondKey = (calls[1][0] as Record<string, unknown>).idempotency_key
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })

  it('紀錄仍有效的 409：維持「前一筆已入帳、請勿重複收款」文案（不得回歸）', async () => {
    const api = mountComposable()
    vi.mocked(posCheckout).mockRejectedValue({
      response: { status: 409, data: { detail: STILL_VALID_DETAIL } },
    })

    api.selectItem(ROW, '王小明')
    await api.submit({})
    await flushPromises()

    const [content, title] = vi.mocked(ElMessageBox.alert).mock.calls[0]
    expect(String(content)).toContain('已成功入帳')
    expect(String(title)).toContain('重複')
  })
})

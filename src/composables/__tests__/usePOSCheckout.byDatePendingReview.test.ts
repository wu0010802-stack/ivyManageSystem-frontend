import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// FECASH-05 / CONTRACT-04（2026-08-24 bug hunt）：「依日期」模式看不到任何待審核報名。
//
// 依學生模式走 /activity/pos/outstanding-by-student，後端 2026-08-16 起刻意放行
// 「total=0 但有待確認課程」的報名（防現場漏收）。依日期模式卻走 /activity/registrations
// 且只查 partial/unpaid——待審核報名 total_amount=0 被 _derive_payment_status 判成
// no_fee，整筆消失。同一頁的兩個搜尋模式對同一批人給出相反答案，習慣用日期模式的
// 收銀員永遠看不到待審核學生。

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
  getRegistrations,
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

/** 待審核報名：課程皆為 pending_review → 後端 total_amount 為 0、payment_status=no_fee */
const PENDING_REG = {
  id: 901,
  student_name: '新生小花',
  class_name: '',
  total_amount: 0,
  paid_amount: 0,
  pending_review: true,
  created_at: '2026-08-20T02:00:00+00:00',
}

/** 真正的空報名（課程都退掉了）：不是待審核，維持既有「丟掉空報名」行為 */
const EMPTY_REG = {
  id: 902,
  student_name: '空報名',
  class_name: '大班',
  total_amount: 0,
  paid_amount: 0,
  pending_review: false,
  created_at: '2026-08-19T02:00:00+00:00',
}

const UNPAID_REG = {
  id: 903,
  student_name: '王小明',
  class_name: '大班',
  total_amount: 2000,
  paid_amount: 0,
  pending_review: false,
  created_at: '2026-08-18T02:00:00+00:00',
}

function mockByStatus(map: Record<string, unknown[]>) {
  vi.mocked(getRegistrations).mockImplementation(((params: Record<string, unknown>) => {
    const items = map[String(params.payment_status)] || []
    return Promise.resolve({ data: { items, total: items.length } })
  }) as never)
}

describe('usePOSCheckout：依日期模式必須看得到待審核報名（FECASH-05）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: false, total_active: 0 },
    } as never)
    vi.mocked(getPOSDailySummary).mockResolvedValue({ data: { net: 0 } } as never)
    vi.mocked(getPOSRecentTransactions).mockResolvedValue({
      data: { transactions: [], total: 0, truncated: false },
    } as never)
    mockByStatus({})
  })
  afterEach(() => vi.clearAllMocks())

  it('收款模式會查 no_fee 狀態（待審核報名的實際落點）', async () => {
    const api = mountComposable()
    mockByStatus({ unpaid: [UNPAID_REG] })
    api.mode.value = 'by-registration'
    await flushPromises()

    const statuses = vi
      .mocked(getRegistrations)
      .mock.calls.map((c) => String((c[0] as Record<string, unknown>).payment_status))
    expect(statuses).toContain('unpaid')
    expect(statuses).toContain('partial')
    expect(statuses).toContain('no_fee')
  })

  it('待審核報名（total=0）留在清單，真正的空報名仍被丟掉', async () => {
    const api = mountComposable()
    mockByStatus({ unpaid: [UNPAID_REG], no_fee: [PENDING_REG, EMPTY_REG] })
    api.mode.value = 'by-registration'
    await flushPromises()

    const ids = api.searchRegistrations.value.map((r) => r.id)
    expect(ids).toContain(901) // ← 修之前：待審核學生整筆消失，櫃台永遠收不到這筆
    expect(ids).toContain(903)
    expect(ids).not.toContain(902)
  })

  it('退費模式不受影響：仍只查 paid/partial/overpaid 且以已繳 > 0 過濾', async () => {
    const api = mountComposable()
    mockByStatus({ paid: [{ ...UNPAID_REG, paid_amount: 2000 }] })
    api.mode.value = 'by-registration'
    await flushPromises()
    vi.mocked(getRegistrations).mockClear()

    api.checkoutType.value = 'refund'
    await flushPromises()

    const statuses = vi
      .mocked(getRegistrations)
      .mock.calls.map((c) => String((c[0] as Record<string, unknown>).payment_status))
    expect(statuses.sort()).toEqual(['overpaid', 'paid', 'partial'])
    expect(statuses).not.toContain('no_fee')
  })
})

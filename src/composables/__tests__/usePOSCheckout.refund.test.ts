import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS 依日期模式的「空報名過濾」回歸（code review P1）：
// - 收款模式：丟掉 total<=0 的空報名（無 enrolled 課程且無用品），避免 unpaid=paid==0 漏擋。
// - 退款模式：後端 _derive_payment_status 把 total==0 && paid>0 歸為 overpaid，且 refundable
//   口徑是 paid>0；前端若無條件 `total<=0 continue` 會把超繳報名丟掉，櫃台看不到漏退。
//   退款模式須改以 paid>0 保留。

vi.mock('@/api/activity', () => ({
  getPOSDailySummary: vi.fn(),
  getPOSOutstandingByStudent: vi.fn(),
  getPOSReceiptPdf: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  getRegistrations: vi.fn(),
  posCheckout: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => false,
}))

import { getRegistrations } from '@/api/activity'
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

describe('usePOSCheckout 依日期模式空報名過濾', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('退款模式：total_amount=0 但 paid_amount>0 的超繳報名應保留', async () => {
    // 超繳：應繳 0、已繳 500（後端 payment_status=overpaid，refundable 撈得到）
    vi.mocked(getRegistrations).mockResolvedValue({
      data: {
        items: [
          { id: 42, total_amount: 0, paid_amount: 500, created_at: '2026-06-01T00:00:00Z' },
        ],
        total: 1,
        skip: 0,
        limit: 200,
      },
    } as never)
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    api.mode.value = 'by-registration'
    await api.runSearch()
    await flushPromises()
    const ids = api.searchRegistrations.value.map((r) => r.id)
    expect(ids).toContain(42)
    wrapper.unmount()
  })

  it('收款模式：total_amount=0 的空報名仍應被丟掉（回歸）', async () => {
    vi.mocked(getRegistrations).mockResolvedValue({
      data: {
        items: [
          { id: 7, total_amount: 0, paid_amount: 0, created_at: '2026-06-01T00:00:00Z' },
        ],
        total: 1,
        skip: 0,
        limit: 200,
      },
    } as never)
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'payment'
    api.mode.value = 'by-registration'
    await api.runSearch()
    await flushPromises()
    const ids = api.searchRegistrations.value.map((r) => r.id)
    expect(ids).not.toContain(7)
    wrapper.unmount()
  })
})

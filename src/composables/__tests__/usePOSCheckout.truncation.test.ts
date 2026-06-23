import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS 截斷提示回歸（code review P1/P2）：
// - by-student 模式：後端 outstanding-by-student 回 truncated/total_active，composable
//   須透傳給 UI，否則 active/可退費母體 >2000 時清單靜默不完整。
// - by-registration（依日期）模式：/registrations 每狀態上限 200，composable 須由
//   total > 抓回筆數判定截斷，否則日曆與金額少算且無提示。

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

import { getPOSOutstandingByStudent, getRegistrations } from '@/api/activity'
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

function fakeRegRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    total_amount: 1500,
    paid_amount: 0,
    created_at: '2026-06-01T00:00:00Z',
  }))
}

describe('usePOSCheckout 截斷提示', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('by-student：後端 truncated=true 時透傳 truncated/total', async () => {
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: true, total_active: 2500 },
    } as any)
    const { api, wrapper } = mountComposable()
    await api.runSearch()
    await flushPromises()
    expect(api.searchTruncation.truncated).toBe(true)
    expect(api.searchTruncation.total).toBe(2500)
    wrapper.unmount()
  })

  it('by-student：後端 truncated=false 時不提示', async () => {
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [{ student_key: 'a' }], truncated: false, total_active: 5 },
    } as any)
    const { api, wrapper } = mountComposable()
    await api.runSearch()
    await flushPromises()
    expect(api.searchTruncation.truncated).toBe(false)
    expect(api.searchTruncation.total).toBe(5)
    wrapper.unmount()
  })

  it('依日期：任一狀態 total 超過抓回筆數即標截斷，total 為各狀態加總', async () => {
    // 每狀態回 total=350 但只抓回 200 筆 → 截斷；兩狀態加總 700
    vi.mocked(getRegistrations).mockResolvedValue({
      data: { items: fakeRegRows(200), total: 350, skip: 0, limit: 200 },
    } as any)
    const { api, wrapper } = mountComposable()
    api.mode.value = 'by-registration'
    await flushPromises() // watch(mode) 觸發 runSearch
    expect(api.searchTruncation.truncated).toBe(true)
    expect(api.searchTruncation.total).toBe(700)
    wrapper.unmount()
  })

  it('依日期：total 未超過抓回筆數時不提示', async () => {
    vi.mocked(getRegistrations).mockResolvedValue({
      data: { items: fakeRegRows(5), total: 5, skip: 0, limit: 200 },
    } as any)
    const { api, wrapper } = mountComposable()
    api.mode.value = 'by-registration'
    await flushPromises()
    expect(api.searchTruncation.truncated).toBe(false)
    expect(api.searchTruncation.total).toBe(10) // 兩狀態 5+5
    wrapper.unmount()
  })
})

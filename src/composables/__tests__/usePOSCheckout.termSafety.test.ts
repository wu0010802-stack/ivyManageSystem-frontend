import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/activity', () => ({
  getPOSDailySummary: vi.fn(),
  getPOSOutstandingByStudent: vi.fn(),
  getPOSReceiptPdf: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  getRefundSuggestion: vi.fn(),
  getRegistrations: vi.fn(),
  posCheckout: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => false,
}))

import { getPOSOutstandingByStudent } from '@/api/activity'
import { usePOSCheckout } from '@/composables/usePOSCheckout'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function mountComposable() {
  let api!: ReturnType<typeof usePOSCheckout>
  const wrapper = mount({
    setup() {
      api = usePOSCheckout()
      return () => null
    },
  })
  return { api, wrapper }
}

describe('usePOSCheckout 搜尋結果 fail-closed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('payment 切 refund 即使搜尋字串為空也會重抓可退費名單', async () => {
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValue({
      data: { groups: [], truncated: false, total_active: 0 },
    } as never)
    const { api, wrapper } = mountComposable()

    expect(api.searchQuery.value).toBe('')
    api.checkoutType.value = 'refund'
    await flushPromises()

    expect(getPOSOutstandingByStudent).toHaveBeenCalledWith(
      '',
      100,
      expect.objectContaining({ filter: 'refundable' }),
    )
    wrapper.unmount()
  })

  it('新查詢開始即清掉前一學期/前一條件結果，請求失敗後維持空清單', async () => {
    vi.mocked(getPOSOutstandingByStudent).mockResolvedValueOnce({
      data: {
        groups: [{ student_id: 1, student_name: '舊學期學生' }],
        truncated: false,
        total_active: 1,
      },
    } as never)
    const { api, wrapper } = mountComposable()
    await api.runSearch()
    expect(api.searchGroups.value).toHaveLength(1)

    const pending = deferred<never>()
    vi.mocked(getPOSOutstandingByStudent).mockReturnValueOnce(pending.promise)
    const searchRun = api.runSearch()

    expect(api.searchGroups.value).toEqual([])
    expect(api.searchRegistrations.value).toEqual([])

    pending.reject(new Error('network'))
    await searchRun
    expect(api.searchGroups.value).toEqual([])
    expect(api.searchRegistrations.value).toEqual([])
    wrapper.unmount()
  })
})

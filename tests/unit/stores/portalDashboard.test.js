import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// API mock：對齊 store 實際 import（../api/portalHome）
vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn(),
}))

import { usePortalDashboardStore } from '@/stores/portalDashboard'
import { getHomeSummary } from '@/api/portalHome'

describe('usePortalDashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial state', () => {
    const store = usePortalDashboardStore()
    expect(store.summary).toBe(null)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('fetchSummary sets summary on success', async () => {
    getHomeSummary.mockResolvedValue({ data: { me: { name: 'X' }, classrooms: [] } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    expect(store.summary).toEqual({ me: { name: 'X' }, classrooms: [] })
    expect(store.error).toBe(null)
  })

  it('fetchSummary sets error on failure', async () => {
    getHomeSummary.mockRejectedValue(new Error('boom'))
    const store = usePortalDashboardStore()
    try {
      await store.fetchSummary()
    } catch {
      // store re-throws；catch 讓測試繼續
    }
    expect(store.error).toBeInstanceOf(Error)
  })

  it('invalidate resets lastFetchedAt so next fetchSummary re-fetches even without force', async () => {
    // 第一次 fetch 填充 summary
    getHomeSummary.mockResolvedValue({ data: { v: 1 } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    expect(store.summary).toEqual({ v: 1 })

    // invalidate 不清 summary，但讓 isFresh() 回傳 false
    store.invalidate()
    expect(store.summary).toEqual({ v: 1 }) // summary 還在

    // 下次 fetchSummary() 不用 force 也會重抓
    getHomeSummary.mockResolvedValue({ data: { v: 2 } })
    await store.fetchSummary()
    expect(getHomeSummary).toHaveBeenCalledTimes(2)
    expect(store.summary).toEqual({ v: 2 })
  })

  it('fetchSummary({ force: true }) refetches when data is fresh', async () => {
    getHomeSummary.mockResolvedValue({ data: { v: 1 } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    getHomeSummary.mockResolvedValue({ data: { v: 2 } })
    await store.fetchSummary({ force: true })
    expect(getHomeSummary).toHaveBeenCalledTimes(2)
    expect(store.summary).toEqual({ v: 2 })
  })
})

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

  it('invalidate 清空 summary 並重置 lastFetchedAt，下次 fetchSummary 不用 force 也會重抓', async () => {
    // 第一次 fetch 填充 summary
    getHomeSummary.mockResolvedValue({ data: { v: 1 } })
    const store = usePortalDashboardStore()
    await store.fetchSummary()
    expect(store.summary).toEqual({ v: 1 })

    // invalidate 一併清 summary（含學生過敏/用藥/缺席 PII，共享平板登出時不可殘留），
    // 並讓 isFresh() 回傳 false。
    store.invalidate()
    expect(store.summary).toBe(null) // summary 已清空（PII 不殘留）

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

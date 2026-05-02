import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApi = vi.hoisted(() => ({ getTodayStatus: vi.fn() }))
vi.mock('@/parent/api/profile', () => mockApi)

import { useTodayStatusCache, _resetForTest } from '@/parent/composables/useTodayStatusCache'

describe('useTodayStatusCache', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockApi.getTodayStatus.mockReset()
    _resetForTest()
  })

  it('首次 refresh 打 API 並寫入 sessionStorage', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const { status, refresh } = useTodayStatusCache()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
    expect(status.value).toEqual({ items: [{ id: 1 }] })
    const cached = JSON.parse(sessionStorage.getItem('parent:today-status:v1'))
    expect(cached.payload).toEqual({ items: [{ id: 1 }] })
    expect(typeof cached.cachedAt).toBe('number')
  })

  it('60s 內再次呼叫 refresh 不打 API', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ data: { items: [] } })
    const { refresh } = useTodayStatusCache()
    await refresh()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
  })

  it('cache age 介於 60-300s：先 emit cache，再背景 fetch', async () => {
    sessionStorage.setItem(
      'parent:today-status:v1',
      JSON.stringify({ payload: { items: ['stale'] }, cachedAt: Date.now() - 90_000 }),
    )
    mockApi.getTodayStatus.mockResolvedValue({ data: { items: ['fresh'] } })

    const { status, refresh } = useTodayStatusCache()
    const p = refresh()
    expect(status.value).toEqual({ items: ['stale'] }) // SWR 先給 stale
    await p
    // 等背景 fetch 完成
    await new Promise(r => setTimeout(r, 0))
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
    expect(status.value).toEqual({ items: ['fresh'] })
  })

  it('markStale() 後下次 refresh 必打', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ data: { items: [] } })
    const { refresh, markStale } = useTodayStatusCache()
    await refresh()
    markStale()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(2)
  })

  it('無 BroadcastChannel 環境不 throw', async () => {
    const original = globalThis.BroadcastChannel
    delete globalThis.BroadcastChannel
    mockApi.getTodayStatus.mockResolvedValue({ data: { items: [] } })
    expect(() => useTodayStatusCache()).not.toThrow()
    globalThis.BroadcastChannel = original
  })
})

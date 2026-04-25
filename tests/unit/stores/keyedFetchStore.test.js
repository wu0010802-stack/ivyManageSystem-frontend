import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createKeyedFetchStore } from '@/stores/_createKeyedFetchStore'

describe('createKeyedFetchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('isLoading(key) 可區分不同 key 的載入狀態', async () => {
    let resolveA, resolveB
    const apiFn = vi.fn((params) => {
      if (params.id === 'A') return new Promise((r) => { resolveA = r })
      if (params.id === 'B') return new Promise((r) => { resolveB = r })
    })
    const useStore = createKeyedFetchStore('test-keyed', apiFn)
    const store = useStore()

    const pA = store.fetchByKey({ id: 'A' })
    const pB = store.fetchByKey({ id: 'B' })

    expect(store.isLoading({ id: 'A' })).toBe(true)
    expect(store.isLoading({ id: 'B' })).toBe(true)

    resolveA({ data: [] })
    await pA
    expect(store.isLoading({ id: 'A' })).toBe(false)
    expect(store.isLoading({ id: 'B' })).toBe(true)

    resolveB({ data: [] })
    await pB
    expect(store.isLoading({ id: 'B' })).toBe(false)
  })

  it('store.loading 在任一 key 載入中時為 true，全部完成才為 false', async () => {
    let resolveA, resolveB
    const apiFn = vi.fn((params) => {
      if (params.id === 'A') return new Promise((r) => { resolveA = r })
      if (params.id === 'B') return new Promise((r) => { resolveB = r })
    })
    const useStore = createKeyedFetchStore('test-keyed-any', apiFn)
    const store = useStore()

    const pA = store.fetchByKey({ id: 'A' })
    const pB = store.fetchByKey({ id: 'B' })

    expect(store.loading).toBe(true)

    resolveA({ data: [] })
    await pA
    expect(store.loading).toBe(true)

    resolveB({ data: [] })
    await pB
    expect(store.loading).toBe(false)
  })

  it('失敗 path 也會從 loadingKeys 移除', async () => {
    const apiFn = vi.fn(() => Promise.reject(new Error('boom')))
    const useStore = createKeyedFetchStore('test-keyed-err', apiFn)
    const store = useStore()

    await expect(store.fetchByKey({ id: 'X' })).rejects.toThrow('boom')
    expect(store.isLoading({ id: 'X' })).toBe(false)
    expect(store.loading).toBe(false)
  })
})

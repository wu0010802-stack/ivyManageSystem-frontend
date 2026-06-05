import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createFetchStore } from '@/stores/_createFetchStore'

describe('createFetchStore 快取命中（物件 vs 陣列 dataKey）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('物件型 dataKey：第二次 fetch 命中 TTL 快取，不重抓（QA P3 修補）', async () => {
    const apiFn = vi.fn().mockResolvedValue({ data: { total: 5, label: 'x' } })
    const useStore = createFetchStore('testObjStore', apiFn, { dataKey: 'summary' })
    const store = useStore()

    await store.fetch()
    await store.fetch()

    // 修補前：data.length（物件）恆 undefined → 永不命中 → 會呼叫 2 次
    expect(apiFn).toHaveBeenCalledTimes(1)
  })

  it('force=true 仍強制重抓（物件型）', async () => {
    const apiFn = vi.fn().mockResolvedValue({ data: { total: 1 } })
    const useStore = createFetchStore('testObjForceStore', apiFn, { dataKey: 'summary' })
    const store = useStore()

    await store.fetch()
    await store.fetch(true)

    expect(apiFn).toHaveBeenCalledTimes(2)
  })

  it('陣列型 dataKey：非空時第二次命中快取（行為不變）', async () => {
    const apiFn = vi.fn().mockResolvedValue({ data: [{ id: 1 }] })
    const useStore = createFetchStore('testArrStore', apiFn, { dataKey: 'items' })
    const store = useStore()

    await store.fetch()
    await store.fetch()

    expect(apiFn).toHaveBeenCalledTimes(1)
  })
})

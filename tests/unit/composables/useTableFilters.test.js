import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useTableFilters } from '@/composables/useTableFilters'

describe('useTableFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('缺少 apiFunc 時拋錯', () => {
    expect(() => useTableFilters({})).toThrow(/apiFunc/)
  })

  it('fetch 以預設參數呼叫 apiFunc', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [] })
    const t = useTableFilters({ apiFunc })
    await t.fetch()
    expect(apiFunc).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      page_size: 50,
    })
  })

  it('回應為 axios { data: { data: [], total } } 時正確展開 total', async () => {
    const apiFunc = vi.fn().mockResolvedValue({
      data: { data: [{ id: 1 }, { id: 2 }], total: 42 },
    })
    const t = useTableFilters({ apiFunc })
    await t.fetch()
    expect(t.items.value).toEqual([{ id: 1 }, { id: 2 }])
    expect(t.total.value).toBe(42)
  })

  it('回應為純 array 時 total 等於長度', async () => {
    const apiFunc = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
    const t = useTableFilters({ apiFunc })
    await t.fetch()
    expect(t.items.value).toHaveLength(3)
    expect(t.total.value).toBe(3)
  })

  it('回應為 axios 包裝 { data: { items, total } } 時正確展開', async () => {
    const apiFunc = vi.fn().mockResolvedValue({
      data: { items: [{ id: 1 }], total: 1 },
    })
    const t = useTableFilters({ apiFunc })
    await t.fetch()
    expect(t.items.value).toEqual([{ id: 1 }])
    expect(t.total.value).toBe(1)
  })

  it('setPage 呼叫 fetch 並帶入新 page', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [] })
    const t = useTableFilters({ apiFunc })
    await t.setPage(3)
    expect(apiFunc).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3 }),
    )
  })

  it('setPageSize 重設 page=1', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [] })
    const t = useTableFilters({ apiFunc })
    t.page.value = 5
    await t.setPageSize(100)
    expect(t.page.value).toBe(1)
    expect(apiFunc).toHaveBeenLastCalledWith(
      expect.objectContaining({ page_size: 100, page: 1 }),
    )
  })

  it('setExtraParams 合併到 API 參數', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [] })
    const t = useTableFilters({ apiFunc })
    await t.setExtraParams({ classroom_id: 42 })
    expect(apiFunc).toHaveBeenLastCalledWith(
      expect.objectContaining({ classroom_id: 42, page: 1 }),
    )
  })

  it('reset 清空搜尋、分頁與資料', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [{ id: 1 }], total: 1 })
    const t = useTableFilters({ apiFunc })
    t.searchQuery.value = 'foo'
    await t.fetch()
    t.reset()
    expect(t.searchQuery.value).toBe('')
    expect(t.page.value).toBe(1)
    expect(t.items.value).toEqual([])
    expect(t.total.value).toBe(0)
  })

  it('fetch 期間 loading 為 true', async () => {
    let resolve
    const apiFunc = vi
      .fn()
      .mockImplementation(() => new Promise((r) => { resolve = r }))
    const t = useTableFilters({ apiFunc })
    const p = t.fetch()
    await nextTick()
    expect(t.loading.value).toBe(true)
    resolve({ data: [] })
    await p
    expect(t.loading.value).toBe(false)
  })

  it('pageCount 依 total 與 pageSize 計算', async () => {
    // 模擬 axios-style wrapper：res.data = { data: [...], total: N }
    const apiFunc = vi.fn().mockResolvedValue({
      data: { data: [], total: 45 },
    })
    const t = useTableFilters({ apiFunc, initialPageSize: 20 })
    await t.fetch()
    expect(t.total.value).toBe(45)
    expect(t.pageCount.value).toBe(3) // ceil(45/20)=3
  })

  it('搜尋變更後會 debounce 並重設 page=1', async () => {
    const apiFunc = vi.fn().mockResolvedValue({ data: [] })
    const t = useTableFilters({ apiFunc, debounceMs: 300 })
    t.page.value = 5
    t.searchQuery.value = 'abc'
    await nextTick()
    // debounce 尚未觸發
    expect(apiFunc).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    // debounced function 內部是 async，等微任務排空
    await Promise.resolve()
    await Promise.resolve()
    expect(apiFunc).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'abc', page: 1 }),
    )
  })
})

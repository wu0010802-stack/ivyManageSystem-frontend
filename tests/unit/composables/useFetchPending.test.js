import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useFetchPending } from '@/composables'

// 分頁契約 mock helper：抄 src/api/_pagination.ts 的 PagedResult 形狀。
// 三支列表 api 自 2026-08-11 起回 PagedResult 而非 AxiosResponse，mock 若還用
// { data } 會靜默給出空清單（假綠），故一律經此 helper 建構。
const paged = (items) => ({
  items,
  total: Array.isArray(items) ? items.length : 0,
  page: 1,
  pageSize: 5000,
  hasMore: false,
})


describe('useFetchPending', () => {
  let apiFn

  beforeEach(() => {
    apiFn = vi.fn()
  })

  it('初始狀態 items 為空陣列、isLoading 為 false', () => {
    const { items, isLoading } = useFetchPending(apiFn)
    expect(items.value).toEqual([])
    expect(isLoading.value).toBe(false)
  })

  it('fetch 成功後 items 更新為回傳陣列', async () => {
    const data = [{ id: 1 }, { id: 2 }]
    apiFn.mockResolvedValue(paged(data))
    const { items, fetch } = useFetchPending(apiFn)
    await fetch()
    expect(items.value).toEqual(data)
  })

  it('API 回傳非陣列時降級為空陣列', async () => {
    apiFn.mockResolvedValue(paged(null))
    const { items, fetch } = useFetchPending(apiFn)
    await fetch()
    expect(items.value).toEqual([])
  })

  it('fetch 期間 isLoading 為 true，結束後為 false', async () => {
    let resolveApi
    apiFn.mockReturnValue(new Promise((resolve) => { resolveApi = resolve }))
    const { isLoading, fetch } = useFetchPending(apiFn)

    const fetchPromise = fetch()
    await nextTick()
    expect(isLoading.value).toBe(true)

    resolveApi(paged([]))
    await fetchPromise
    expect(isLoading.value).toBe(false)
  })

  it('API 拋出例外時靜默處理，isLoading 仍重設為 false', async () => {
    apiFn.mockRejectedValue(new Error('network error'))
    const { isLoading, fetch } = useFetchPending(apiFn)
    await fetch()
    expect(isLoading.value).toBe(false)
  })

  it('預設以 { status: "pending" } 呼叫 apiFn', async () => {
    apiFn.mockResolvedValue(paged([]))
    const { fetch } = useFetchPending(apiFn)
    await fetch()
    expect(apiFn).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('可傳入自訂 defaultParams', async () => {
    apiFn.mockResolvedValue(paged([]))
    const { fetch } = useFetchPending(apiFn, { status: 'approved', year: 2026 })
    await fetch()
    expect(apiFn).toHaveBeenCalledWith({ status: 'approved', year: 2026 })
  })
})

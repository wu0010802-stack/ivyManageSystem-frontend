import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

vi.mock('@/parent/api/childTimeline', () => ({
  fetchChildTimeline: vi.fn(),
}))

import { fetchChildTimeline } from '@/parent/api/childTimeline'
import { useChildTimeline } from '@/parent/composables/useChildTimeline'

beforeEach(() => {
  vi.clearAllMocks()
})

const PAGE1 = { data: { items: [{ id: 1 }, { id: 2 }], next_cursor: 'cur-2' } }
const PAGE2 = { data: { items: [{ id: 3 }], next_cursor: null } }

describe('useChildTimeline', () => {
  it('null student id → items 為空、不 fetch', async () => {
    const sid = ref(null)
    const { items, loading } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    expect(fetchChildTimeline).not.toHaveBeenCalled()
    expect(items.value).toEqual([])
    expect(loading.value).toBe(false)
  })

  it('初始有 sid → immediate fetch、填 items 與 nextCursor', async () => {
    fetchChildTimeline.mockResolvedValueOnce(PAGE1)
    const sid = ref(10)
    const { items, nextCursor, loading } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchChildTimeline).toHaveBeenCalledWith(10, { limit: 30 })
    expect(items.value).toEqual([{ id: 1 }, { id: 2 }])
    expect(nextCursor.value).toBe('cur-2')
    expect(loading.value).toBe(false)
  })

  it('切換 sid → 清空 items 再 reload', async () => {
    fetchChildTimeline.mockResolvedValue(PAGE1)
    const sid = ref(10)
    const { items } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(items.value.length).toBe(2)

    fetchChildTimeline.mockResolvedValueOnce({ data: { items: [{ id: 99 }], next_cursor: null } })
    sid.value = 20
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    // 新請求的資料替換掉舊的，不會 append
    expect(items.value).toEqual([{ id: 99 }])
    expect(fetchChildTimeline).toHaveBeenLastCalledWith(20, { limit: 30 })
  })

  it('loadMore：append=true 時帶 cursor、items 累加', async () => {
    fetchChildTimeline.mockResolvedValueOnce(PAGE1)
    const sid = ref(10)
    const { items, nextCursor, loadMore } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(items.value.length).toBe(2)
    expect(nextCursor.value).toBe('cur-2')

    fetchChildTimeline.mockResolvedValueOnce(PAGE2)
    loadMore()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchChildTimeline).toHaveBeenLastCalledWith(10, { limit: 30, cursor: 'cur-2' })
    expect(items.value).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(nextCursor.value).toBe(null)
  })

  it('loadMore：沒 nextCursor 時不打 API', async () => {
    fetchChildTimeline.mockResolvedValueOnce({ data: { items: [{ id: 1 }], next_cursor: null } })
    const sid = ref(10)
    const { loadMore } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchChildTimeline).toHaveBeenCalledTimes(1)

    loadMore()
    await Promise.resolve()
    expect(fetchChildTimeline).toHaveBeenCalledTimes(1)
  })

  it('reload throw → error 設值，loading=false', async () => {
    fetchChildTimeline.mockRejectedValueOnce(Object.assign(new Error('x'), { displayMessage: '無資料' }))
    const sid = ref(10)
    const { error, loading } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(error.value).toBe('無資料')
    expect(loading.value).toBe(false)
  })

  it('reload throw 無 displayMessage → 預設「載入失敗」', async () => {
    fetchChildTimeline.mockRejectedValueOnce(new Error('y'))
    const sid = ref(10)
    const { error } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(error.value).toBe('載入失敗')
  })

  it('race condition：晚回應的舊請求不會覆蓋新請求', async () => {
    let resolveOld
    fetchChildTimeline.mockImplementationOnce(
      () => new Promise((r) => { resolveOld = r }),
    )
    const sid = ref(10)
    const { items } = useChildTimeline(sid)
    await nextTick()
    await Promise.resolve()
    // 切換 student → 第二次請求
    fetchChildTimeline.mockResolvedValueOnce({ data: { items: [{ id: 99 }], next_cursor: null } })
    sid.value = 20
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    expect(items.value).toEqual([{ id: 99 }])

    // 現在舊 promise 才 resolve；不應蓋掉
    resolveOld({ data: { items: [{ id: 1 }], next_cursor: 'stale' } })
    await Promise.resolve()
    await Promise.resolve()
    expect(items.value).toEqual([{ id: 99 }])
  })
})

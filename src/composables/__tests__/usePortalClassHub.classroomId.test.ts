import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref, nextTick } from 'vue'

const { mockGetTodayHub } = vi.hoisted(() => ({
  mockGetTodayHub: vi.fn(() => Promise.resolve({ classroom_id: 1, counts: {} })),
}))

vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: mockGetTodayHub,
}))

import { usePortalClassHub } from '@/composables/usePortalClassHub'

function mountWith(classroomId: ReturnType<typeof ref<number | null>>) {
  const api: Record<string, unknown> = {}
  const Comp = defineComponent({
    setup() {
      Object.assign(api, usePortalClassHub(classroomId))
      return () => null
    },
  })
  const wrapper = mount(Comp)
  return { wrapper, api }
}

describe('usePortalClassHub classroomId', () => {
  beforeEach(() => {
    mockGetTodayHub.mockClear()
  })

  it('未指定班級時不帶參數呼叫（維持現行行為）', async () => {
    const cid = ref<number | null>(null)
    mountWith(cid)
    await flushPromises()
    expect(mockGetTodayHub).toHaveBeenCalledWith(undefined)
  })

  it('指定班級時把 id 傳進 API', async () => {
    const cid = ref<number | null>(7)
    mountWith(cid)
    await flushPromises()
    expect(mockGetTodayHub).toHaveBeenCalledWith(7)
  })

  it('切換班級會重新抓取', async () => {
    const cid = ref<number | null>(7)
    mountWith(cid)
    await flushPromises()
    expect(mockGetTodayHub).toHaveBeenCalledTimes(1)

    cid.value = 9
    await flushPromises()
    expect(mockGetTodayHub).toHaveBeenLastCalledWith(9)
    expect(mockGetTodayHub).toHaveBeenCalledTimes(2)
  })

  it('前一輪請求仍在飛行時切班，refresh() 不可沿用舊班級的 inflight promise（Minor B）', async () => {
    // 首載（cid=7）故意不 resolve，模擬切班當下前一輪仍在飛行。
    let resolveOld!: (v: { classroom_id: number; counts: Record<string, never> }) => void
    mockGetTodayHub.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const cid = ref<number | null>(7)
    const { api } = mountWith(cid)
    await flushPromises()
    expect(mockGetTodayHub).toHaveBeenCalledTimes(1)

    // 切班前先手動呼叫一次 refresh()：舊班（7）仍在飛行，理當拿到同一顆
    // inflight promise（同班內去重照常運作），不打第二次 API。
    const stalePromise = (api.refresh as () => Promise<unknown>)()
    expect(mockGetTodayHub).toHaveBeenCalledTimes(1)

    // 切班：新班（9）也故意不 resolve，模擬兩輪同時在飛。
    let resolveNew!: (v: { classroom_id: number; counts: Record<string, never> }) => void
    mockGetTodayHub.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve
        }),
    )
    cid.value = 9
    await flushPromises()
    // watch 觸發的 refresh() 必須因為 key（9）與 inflightKey（7）不同而真的
    // 打新請求，不能沿用舊班的 inflight promise。
    expect(mockGetTodayHub).toHaveBeenCalledTimes(2)
    expect(mockGetTodayHub).toHaveBeenLastCalledWith(9)

    // 此時再呼叫 refresh()：新班（9）的請求仍在飛行中，應沿用它（同班去重），
    // 且必須與切班前拿到的舊班 promise 不同。
    const freshPromise = (api.refresh as () => Promise<unknown>)()
    expect(mockGetTodayHub).toHaveBeenCalledTimes(2)
    expect(freshPromise).not.toBe(stalePromise)

    resolveNew({ classroom_id: 9, counts: {} })
    resolveOld({ classroom_id: 7, counts: {} })
    await flushPromises()

    // 原測試在此收尾、沒有斷言——把情境架好卻沒鎖住結果（2026-09-14 審查發現）。
    // 舊班（7）的回應在新班（9）之後才 resolve，不得覆寫已經切過去的新班資料：
    // 這裡斷言的是「以發出順序判定新舊」，不是「以 resolve 先後」，因為使用者
    // 最後一個動作永遠是切到 9，網路延遲不該讓畫面倒退回 7。
    expect((api.data as { value: { classroom_id: number } | null }).value?.classroom_id).toBe(9)
  })

  it('舊班回應晚到不覆寫新班資料（P1，2026-09-14 審查）', async () => {
    let resolveOld!: (v: { classroom_id: number; counts: Record<string, never> }) => void
    mockGetTodayHub.mockImplementationOnce(
      () => new Promise((resolve) => { resolveOld = resolve }),
    )
    const cid = ref<number | null>(7)
    const { api } = mountWith(cid)
    await flushPromises()

    let resolveNew!: (v: { classroom_id: number; counts: Record<string, never> }) => void
    mockGetTodayHub.mockImplementationOnce(
      () => new Promise((resolve) => { resolveNew = resolve }),
    )
    cid.value = 9
    await flushPromises()

    // 新班先 resolve、舊班後 resolve——典型的網路亂序。
    resolveNew({ classroom_id: 9, counts: { a: 1 } })
    await flushPromises()
    expect((api.data as { value: { classroom_id: number } | null }).value?.classroom_id).toBe(9)

    resolveOld({ classroom_id: 7, counts: { a: 99 } })
    await flushPromises()
    // 舊班遲到的回應不得把畫面蓋回 7。
    expect((api.data as { value: { classroom_id: number } | null }).value?.classroom_id).toBe(9)
  })

  it('切班失敗時清空舊班資料，不留著錯配的班級（P1，2026-09-14 審查）', async () => {
    mockGetTodayHub.mockResolvedValueOnce({ classroom_id: 7, counts: {} })
    const cid = ref<number | null>(7)
    const { api } = mountWith(cid)
    await flushPromises()
    expect((api.data as { value: unknown }).value).toEqual({ classroom_id: 7, counts: {} })

    mockGetTodayHub.mockRejectedValueOnce(new Error('403'))
    cid.value = 9
    await flushPromises()

    // 切到 9 卻失敗：不得繼續顯示 7 的資料（標題與功能格深連結都會錯配到 7）。
    expect((api.data as { value: unknown }).value).toBeNull()
    expect((api.error as { value: unknown }).value).toBeInstanceOf(Error)
  })

  it('同班重試失敗時保留舊資料，避免每次網路抖動就閃爍清空（2026-09-14 審查）', async () => {
    mockGetTodayHub.mockResolvedValueOnce({ classroom_id: 7, counts: {} })
    const cid = ref<number | null>(7)
    const { api } = mountWith(cid)
    await flushPromises()

    mockGetTodayHub.mockRejectedValueOnce(new Error('network blip'))
    await (api.refresh as () => Promise<unknown>)().catch(() => {})
    await nextTick()

    // 同一班重試失敗：舊資料仍屬於「目前選的班級」，不該被清空造成閃爍。
    expect((api.data as { value: unknown }).value).toEqual({ classroom_id: 7, counts: {} })
    expect((api.error as { value: unknown }).value).toBeInstanceOf(Error)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

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
  })
})

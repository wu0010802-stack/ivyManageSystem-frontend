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
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/activity', () => ({
  getInquiries: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  markInquiryRead: vi.fn().mockResolvedValue({}),
  deleteInquiry: vi.fn().mockResolvedValue({}),
  replyInquiry: vi.fn().mockResolvedValue({}),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})
vi.mock('@/stores/activity', () => ({
  useActivityStore: () => ({ fetchSummary: vi.fn() }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import ActivityInquiryView from '@/views/activity/ActivityInquiryView.vue'
import { getInquiries } from '@/api/activity'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

type Vm = {
  page: number
  list: Array<{ id: number; is_read: boolean }>
  total: number
  fetchList: () => Promise<void>
  onFilterChange: () => void
}

describe('ActivityInquiryView 篩選/分頁', () => {
  beforeEach(() => vi.clearAllMocks())

  it('切換讀取狀態篩選時把頁碼重置為第 1 頁（避免落在越界空白頁）', async () => {
    ;(getInquiries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { items: [], total: 0 },
    })
    const wrapper = shallowMount(ActivityInquiryView, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as Vm
    vm.page = 3
    ;(getInquiries as ReturnType<typeof vi.fn>).mockClear()

    vm.onFilterChange()
    await flushPromises()

    // 重置回第 1 頁 → skip = 0
    expect(vm.page).toBe(1)
    expect(getInquiries).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }))
  })

  it('request guard：較慢的舊回應到達時不得覆寫較新查詢的結果', async () => {
    const first = deferred<{ data: { items: unknown[]; total: number } }>()
    const second = deferred<{ data: { items: unknown[]; total: number } }>()
    ;(getInquiries as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(first.promise) // onMounted 觸發的第一次查詢
      .mockReturnValueOnce(second.promise) // 手動觸發的較新查詢

    const wrapper = shallowMount(ActivityInquiryView, { global: globalConfig })
    const vm = wrapper.vm as unknown as Vm
    // onMounted 已發出 #1（pending）；再發一次較新的 #2
    vm.fetchList()

    // 先回較新的 #2
    second.resolve({ data: { items: [{ id: 2, is_read: false }], total: 1 } })
    await flushPromises()
    // 再回較慢的舊 #1
    first.resolve({ data: { items: [{ id: 1, is_read: true }], total: 99 } })
    await flushPromises()

    // 結果必須是 #2，不被較慢的 #1 覆寫
    expect(vm.list.map((i) => i.id)).toEqual([2])
    expect(vm.total).toBe(1)
  })
})

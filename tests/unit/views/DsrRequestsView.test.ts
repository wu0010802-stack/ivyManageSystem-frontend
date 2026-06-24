import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DsrRequestsView from '@/views/DsrRequestsView.vue'

// 產生 n 筆 pending DSR 假資料
const makeRecords = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    request_type: 'delete',
    status: 'pending',
    subject_entity_type: 'Guardian',
    subject_entity_id: i + 1,
    reason: `原因 ${i + 1}`,
    submitted_at: '2026-06-24T09:00:00',
  }))

const listDsrRequests = vi.fn()

vi.mock('@/api/dsr', () => ({
  listDsrRequests: (...args: unknown[]) => listDsrRequests(...args),
  approveDsrRequest: vi.fn(),
  rejectDsrRequest: vi.fn(),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// 捕捉傳進 el-table 的 data prop（pagination 切片後當頁資料）
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    return () => h('div', { class: 'el-table-stub', 'data-rows': (props.data as unknown[]).length })
  },
})

const mountView = () =>
  mount(DsrRequestsView, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        teleport: true,
        AdminListToolbar: { template: '<div class="admin-list-toolbar-stub"><slot name="actions" /></div>' },
        'el-table': ElTableStub,
        'el-table-column': true,
        'el-tag': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-pagination': true,
        'el-dialog': true,
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': true,
      },
    },
  })

describe('DsrRequestsView 真實分頁切片（消除假分頁全量渲染）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('資料 > pageSize 時，el-table 只收到當頁筆數（非全量）', async () => {
    listDsrRequests.mockResolvedValueOnce({ data: makeRecords(25) })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    await flushPromises()

    const table = wrapper.findComponent(ElTableStub)
    // pageSize 預設 20 → 25 筆資料當頁只應有 20 筆，而非全量 25 筆
    expect((table.props('data') as unknown[]).length).toBe(20)
  })

  it('records 仍保有全量（total 計數用），第二頁切到剩餘筆數', async () => {
    listDsrRequests.mockResolvedValueOnce({ data: makeRecords(25) })

    const wrapper = mountView()
    await flushPromises()
    await nextTick()
    await flushPromises()

    // 全量保留在 records（toolbar :total 用）
    expect((wrapper.vm as unknown as { records: unknown[] }).records.length).toBe(25)

    // 換到第 2 頁 → 當頁剩 5 筆
    ;(wrapper.vm as unknown as { currentPage: number }).currentPage = 2
    await nextTick()
    const table = wrapper.findComponent(ElTableStub)
    expect((table.props('data') as unknown[]).length).toBe(5)
  })
})

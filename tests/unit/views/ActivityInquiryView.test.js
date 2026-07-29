/**
 * ActivityInquiryView — 未讀 badge 全量計數
 *
 * 原本 unreadCount 由「當頁」list filter 而來（分頁 20 筆），跨頁未讀不計。
 * 後端契約：list 回應頂層 `unread_count: int`（全量未讀數）；
 * 前端優先讀該欄位，欄位缺席時 fallback 回當頁計算（平滑過渡）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getInquiries: vi.fn(),
  markInquiryRead: vi.fn(),
  deleteInquiry: vi.fn(),
  replyInquiry: vi.fn(),
}))

// ── store mock ─────────────────────────────────────────────────────────────
vi.mock('@/stores/activity', () => ({
  useActivityStore: () => ({ fetchSummary: vi.fn() }),
}))

// ── element-plus 訊息 mock ─────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getInquiries, markInquiryRead } from '@/api/activity'
import ActivityInquiryView from '@/views/activity/ActivityInquiryView.vue'

// ── 可傳遞 row 資料的 table stubs（同 ActivityCourseView.promote.test.js）──
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

// el-button stub：inheritAttrs:false 避免 $attrs.onClick fallthrough 造成雙觸發
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { emit, slots }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

const GLOBAL_STUBS = {
  'el-badge': {
    props: ['value'],
    template: '<span data-test="unread-badge">{{ value }}</span>',
  },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-pagination': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-input': { template: '<input />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span />' },
}

function mountView() {
  return mount(ActivityInquiryView, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })
}

const pageItems = [
  { id: 1, is_read: false, question: 'q1' },
  { id: 2, is_read: true, question: 'q2' },
]

describe('ActivityInquiryView — 未讀 badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('後端回 unread_count 時以全量未讀數顯示（非當頁計算）', async () => {
    getInquiries.mockResolvedValue({
      data: { items: pageItems, total: 42, unread_count: 35 },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('35')
  })

  it('unread_count 缺席時 fallback 回當頁計算（平滑過渡）', async () => {
    getInquiries.mockResolvedValue({
      data: { items: pageItems, total: 42 },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('1')
  })

  it('標記已讀後全量未讀數本地遞減（不等下次重抓）', async () => {
    getInquiries.mockResolvedValue({
      data: { items: pageItems, total: 42, unread_count: 35 },
    })
    markInquiryRead.mockResolvedValue({ data: {} })

    const wrapper = mountView()
    await flushPromises()

    const markBtn = wrapper.findAll('button').find((b) => b.text() === '標記已讀')
    expect(markBtn).toBeTruthy()
    await markBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('34')
  })

  it('同一列標記已讀 pending 時忽略重複操作，badge 只扣一次', async () => {
    const items = [
      { id: 91, is_read: false, question: 'q91' },
      { id: 92, is_read: true, question: 'q92' },
    ]
    getInquiries.mockResolvedValue({
      data: { items, total: 2, unread_count: 5 },
    })
    let resolveMark
    markInquiryRead.mockReturnValue(new Promise((resolve) => {
      resolveMark = resolve
    }))

    const wrapper = mountView()
    await flushPromises()

    const row = wrapper.vm.list[0]
    const first = wrapper.vm.handleMarkRead(row)
    const second = wrapper.vm.handleMarkRead(row)
    expect(markInquiryRead).toHaveBeenCalledTimes(1)

    resolveMark({ data: {} })
    await Promise.all([first, second])
    await flushPromises()

    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('4')
  })

  it('標記已讀 pending 期間刷新已取得最新計數時，不會再重複扣 badge', async () => {
    const staleRow = { id: 93, is_read: false, question: 'q93' }
    const refreshedRow = { id: 93, is_read: true, question: 'q93' }
    getInquiries
      .mockResolvedValueOnce({
        data: { items: [staleRow], total: 1, unread_count: 5 },
      })
      .mockResolvedValueOnce({
        data: { items: [refreshedRow], total: 1, unread_count: 4 },
      })
    let resolveMark
    markInquiryRead.mockReturnValue(new Promise((resolve) => {
      resolveMark = resolve
    }))

    const wrapper = mountView()
    await flushPromises()

    const pendingMark = wrapper.vm.handleMarkRead(wrapper.vm.list[0])
    await wrapper.vm.fetchList()
    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('4')

    resolveMark({ data: {} })
    await pendingMark
    await flushPromises()

    expect(wrapper.vm.list[0]).toStrictEqual(refreshedRow)
    expect(wrapper.vm.list[0].is_read).toBe(true)
    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('4')
  })

  it('標記已讀 pending 期間切頁使該列消失，成功後重抓權威未讀數', async () => {
    const staleRow = { id: 94, is_read: false, question: 'q94' }
    getInquiries
      .mockResolvedValueOnce({
        data: { items: [staleRow], total: 21, unread_count: 5 },
      })
      // 模擬 mutation commit 前，使用者已切到不含該列的下一頁。
      .mockResolvedValueOnce({
        data: { items: [], total: 21, unread_count: 5 },
      })
      // mutation 成功後重新取得權威全量計數。
      .mockResolvedValueOnce({
        data: { items: [], total: 21, unread_count: 4 },
      })
    let resolveMark
    markInquiryRead.mockReturnValue(new Promise((resolve) => {
      resolveMark = resolve
    }))

    const wrapper = mountView()
    await flushPromises()

    const pendingMark = wrapper.vm.handleMarkRead(wrapper.vm.list[0])
    await wrapper.vm.fetchList()
    expect(wrapper.vm.list).toHaveLength(0)
    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('5')

    resolveMark({ data: {} })
    await pendingMark
    await flushPromises()

    expect(getInquiries).toHaveBeenCalledTimes(3)
    expect(wrapper.find('[data-test="unread-badge"]').text()).toBe('4')
  })
})

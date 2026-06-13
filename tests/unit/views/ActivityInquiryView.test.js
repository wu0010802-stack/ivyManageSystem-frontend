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
})

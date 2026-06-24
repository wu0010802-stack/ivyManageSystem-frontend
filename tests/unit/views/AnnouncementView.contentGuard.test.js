import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AnnouncementView from '@/views/AnnouncementView.vue'

// content 為 null（legacy / 契約違反）時，內容預覽 cell 對 row.content 直接
// .length/.slice → render throw。本檔覆蓋此防護（F2）。
const getAnnouncements = vi.fn(() => Promise.resolve({
  data: {
    items: [
      {
        id: 1,
        title: '無內容公告',
        content: null, // ← 觸發 crash 的 legacy row
        priority: 'normal',
        is_pinned: false,
        status: 'active',
        created_by_name: '園長',
        created_at: '2026-03-14T09:00:00',
        read_count: 0,
        recipient_count: 0,
      },
    ],
  },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: (...args) => getAnnouncements(...args),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementParentRecipients: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  getAnnouncementRecipients: vi.fn(() => Promise.resolve({ data: { employee_ids: [] } })),
  getAnnouncementReaders: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  replaceAnnouncementParentRecipients: vi.fn(),
  uploadAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) => h('div', { key: index }, slots.default ? slots.default({ row }) : [])),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      (slots.default?.() || []).map((vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children)),
    )
  },
})

function mountView() {
  return mount(AnnouncementView, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        teleport: true,
        'el-button': { template: '<button><slot /></button>' },
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-tag': { template: '<span><slot /></span>' },
        'el-icon': { template: '<i><slot /></i>' },
        'el-popover': { template: '<div><slot name="reference" /><slot /></div>' },
        'el-dialog': true,
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': true,
        'el-select': { template: '<div><slot /></div>' },
        'el-option': true,
        'el-switch': true,
      },
    },
  })
}

describe('AnnouncementView 內容預覽 null 守衛（F2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('content 為 null 時不應在 render 期間 throw，且照常顯示標題', async () => {
    let wrapper
    expect(() => {
      wrapper = mountView()
    }).not.toThrow()
    await flushPromises()
    await nextTick()
    await flushPromises()
    // 標題仍渲染（代表 row 成功 render，沒有因 content null 崩潰整個 table）
    expect(wrapper.text()).toContain('無內容公告')
  })
})

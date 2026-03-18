import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import AnnouncementView from '@/views/AnnouncementView.vue'

const getAnnouncements = vi.fn(() => Promise.resolve({
  data: {
    items: [
      {
        id: 1,
        title: '公告測試',
        content: '公告內容',
        priority: 'important',
        is_pinned: false,
        created_by_name: '園長',
        created_at: '2026-03-14T09:00:00',
        read_count: 4,
        read_preview: [
          { employee_id: 11, name: '王老師', read_at: '2026-03-14T09:05:00' },
          { employee_id: 12, name: '林老師', read_at: '2026-03-14T09:06:00' },
          { employee_id: 13, name: '陳老師', read_at: '2026-03-14T09:07:00' },
        ],
        readers: [
          { employee_id: 11, name: '王老師', read_at: '2026-03-14T09:05:00' },
          { employee_id: 12, name: '林老師', read_at: '2026-03-14T09:06:00' },
          { employee_id: 13, name: '陳老師', read_at: '2026-03-14T09:07:00' },
          { employee_id: 14, name: '黃老師', read_at: '2026-03-14T09:08:00' },
        ],
      },
    ],
  },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: (...args) => getAnnouncements(...args),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
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
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
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
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      (slots.default?.() || []).map((vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children)),
    )
  },
})

describe('AnnouncementView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders read preview names and overflow summary', async () => {
    const wrapper = mount(AnnouncementView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          'el-button': { template: '<button><slot /></button>' },
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-tag': { template: '<span><slot /></span>' },
          'el-icon': { template: '<i><slot /></i>' },
          'el-popover': { template: '<div><slot name="reference" /><slot /></div>' },
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
          'el-input': true,
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-switch': true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(wrapper.text()).toContain('王老師')
    expect(wrapper.text()).toContain('林老師')
    expect(wrapper.text()).toContain('陳老師')
    expect(wrapper.text()).toContain('已讀 4 人')
    expect(wrapper.text()).toContain('再顯示 1 人')
  })
})

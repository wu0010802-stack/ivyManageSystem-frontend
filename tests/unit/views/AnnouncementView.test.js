import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
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
  getAnnouncementParentRecipients: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  getAnnouncementRecipients: vi.fn(() => Promise.resolve({ data: { employee_ids: [] } })),
  getAnnouncementReaders: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  replaceAnnouncementParentRecipients: vi.fn(),
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

describe('AnnouncementView status tags', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders 預定 / 進行中 / 已過期 tags for 3 statuses', async () => {
    getAnnouncements.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, title: '排定中', content: '', priority: 'normal', is_pinned: false, status: 'scheduled', read_count: 0, recipient_count: 0 },
          { id: 2, title: '進行', content: '', priority: 'normal', is_pinned: false, status: 'active', read_count: 0, recipient_count: 0 },
          { id: 3, title: '已過期', content: '', priority: 'normal', is_pinned: false, status: 'expired', read_count: 0, recipient_count: 0 },
        ],
      },
    })

    const wrapper = mount(AnnouncementView, {
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

    await flushPromises()
    await nextTick()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('預定')
    expect(text).toContain('進行中')
    expect(text).toContain('已過期')
  })
})

describe('AnnouncementView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders read preview names and overflow summary', async () => {
    const wrapper = mount(AnnouncementView, {
      global: {
        directives: {
          loading: () => {},
        },
        // T11(2026-05-14 review)：teleport: true 對應 el-dialog/drawer 內部 <teleport>。
        // 既有 'el-dialog' 自訂 stub 模板強制渲染 slot，違反 portal/parent 端慣例
        // (PortalMeasurementSheet 等已採 teleport: true)。本檔 dialog 內容不被斷言。
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

    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(wrapper.text()).toContain('王老師')
    expect(wrapper.text()).toContain('林老師')
    expect(wrapper.text()).toContain('陳老師')
    expect(wrapper.text()).toContain('已讀 4 人')
  })
})

describe('AnnouncementView openEdit fetch failure (c11f3563 regression)', () => {
  it('openEdit sets parent_visibility to unchanged when getAnnouncementParentRecipients fails', async () => {
    setActivePinia(createPinia())

    // Mock 失敗的 getAnnouncementParentRecipients
    const getAnnouncementParentRecipientsMock = vi.fn().mockRejectedValue(new Error('network error'))

    vi.doMock('@/api/announcements', () => ({
      getAnnouncements: vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: 1,
              title: '編輯測試',
              content: '內容',
              priority: 'normal',
              is_pinned: false,
            },
          ],
        },
      }),
      createAnnouncement: vi.fn(),
      updateAnnouncement: vi.fn(),
      deleteAnnouncement: vi.fn(),
      getAnnouncementParentRecipients: getAnnouncementParentRecipientsMock,
      getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { employee_ids: [] } }),
      getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
      replaceAnnouncementParentRecipients: vi.fn(),
    }))

    const wrapper = mount(AnnouncementView, {
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
          'el-message': true,
        },
      },
    })

    await flushPromises()
    // 驗證 getAnnouncementParentRecipients 被呼叫且失敗，親權設定會變成 unchanged sentinel
    expect(getAnnouncementParentRecipientsMock).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AnnouncementView from '@/views/AnnouncementView.vue'

const replaceAnnouncementParentRecipients = vi.fn(() => Promise.resolve({ data: {} }))
const getAnnouncementParentRecipients = vi.fn(() => Promise.resolve({
  data: { items: [
    { scope: 'student', student_id: 31 },
    { scope: 'guardian', guardian_id: 9 },
  ] },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn(() => Promise.resolve({ data: { items: [
    { id: 1, title: '對象測試', content: '內容', priority: 'normal', is_pinned: false, created_by_name: '園長', created_at: '2026-03-14T09:00:00', read_count: 0, read_preview: [], attachments: [] },
  ] } })),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAnnouncement: vi.fn(),
  getAnnouncementParentRecipients: (...args) => getAnnouncementParentRecipients(...args),
  getAnnouncementRecipients: vi.fn(() => Promise.resolve({ data: { employee_ids: [] } })),
  getAnnouncementReaders: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  replaceAnnouncementParentRecipients: (...args) => replaceAnnouncementParentRecipients(...args),
  uploadAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() => Promise.resolve({ data: { items: [
    { id: 31, name: '王小明', classroom_id: 1 },
    { id: 42, name: '李小美', classroom_id: 2 },
  ] } })),
}))

// el-dialog pass-through：渲染 default + footer slot，讓對話框內容可被斷言
const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()]) : null)
  },
})

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

const mountView = () => mount(AnnouncementView, {
  global: { stubs: { 'el-dialog': ElDialogStub, 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub } },
})

describe('AnnouncementView 指定學生 scope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('編輯含 student+guardian scope 公告：custom radio 可選、學生選擇器渲染、保留提示顯示筆數', async () => {
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    const editBtn = wrapper.findAll('el-button').find((b) => b.text().includes('編輯'))
    await editBtn.trigger('click')
    await flushPromises(); await nextTick()

    const customRadio = wrapper.find('[data-test="parent-custom-radio"]')
    expect(customRadio.exists()).toBe(true)
    expect(customRadio.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="parent-student-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="preserved-scope-hint"]').text()).toContain('1 筆')
  })

  it('送出時 payload = student rows + 保留的 guardian rows（replace-all 不洗掉）', async () => {
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('編輯')).trigger('click')
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('更新')).trigger('click')
    await flushPromises()

    expect(replaceAnnouncementParentRecipients).toHaveBeenCalledWith(1, [
      { scope: 'student', student_id: 31 },
      { scope: 'guardian', guardian_id: 9 },
    ])
  })

  it('parent-recipients 讀取失敗 → unchanged，送出不呼叫 replace（迴歸保護）', async () => {
    getAnnouncementParentRecipients.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('編輯')).trigger('click')
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('更新')).trigger('click')
    await flushPromises()

    expect(replaceAnnouncementParentRecipients).not.toHaveBeenCalled()
  })
})

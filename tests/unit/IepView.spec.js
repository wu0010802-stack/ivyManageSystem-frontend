import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import IepView from '@/views/admin/gov-reports/IepView.vue'

vi.mock('@/api/govMoe', () => ({
  listIeps: vi.fn().mockResolvedValue({ data: [] }),
  createIep: vi.fn(),
  updateIep: vi.fn(),
  cloneIep: vi.fn(),
  submitIep: vi.fn(),
  approveIep: vi.fn(),
  closeIep: vi.fn(),
  exportIepPdf: vi.fn(),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({
    data: [{ id: 1, name: '王小明', classroom_id: 1, disability_type: '自閉症' }],
  }),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({
    data: [{ id: 1, name: 'A 班' }],
  }),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: 'admin', supervisor_role: null }),
}))

const makeStub = (tag) =>
  defineComponent({ name: tag, setup(_, { slots }) { return () => h('div', slots.default?.()) } })

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props) {
    return () => h('div', { class: 'el-table' },
      (props.data || []).map((row, idx) =>
        h('div', { class: 'el-table-row', key: idx }, [
          h('span', row.goal || ''),
        ])
      )
    )
  },
})

const globalConfig = {
  components: {
    ElSelect: makeStub('ElSelect'),
    ElOption: makeStub('ElOption'),
    ElTag: makeStub('ElTag'),
    ElButton: makeStub('ElButton'),
    ElTabs: makeStub('ElTabs'),
    ElTabPane: makeStub('ElTabPane'),
    ElForm: makeStub('ElForm'),
    ElFormItem: makeStub('ElFormItem'),
    ElInput: makeStub('ElInput'),
    ElDatePicker: makeStub('ElDatePicker'),
    ElTable,
    ElTableColumn: makeStub('ElTableColumn'),
  },
}

describe('IepView', () => {
  it('renders student list', async () => {
    const w = mount(IepView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('王小明')
  })

  it('shows empty state when no student selected', async () => {
    const w = mount(IepView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('請從左側選擇學生')
  })
})

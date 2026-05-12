import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import SubsidiesView from '@/views/admin/gov-reports/SubsidiesView.vue'

vi.mock('@/api/govMoe', () => ({
  listSubsidies: vi.fn().mockResolvedValue({
    data: [{ id: 1, subsidy_type: 'teacher_extra', employee_id: 7,
             period_start: '2026-05-01', period_end: '2026-05-31',
             amount_requested: '3000', status: 'submitted' }]
  }),
  createSubsidy: vi.fn(),
  submitSubsidy: vi.fn(),
  approveSubsidy: vi.fn(),
  markSubsidyPaid: vi.fn(),
  rejectSubsidy: vi.fn(),
  exportSubsidies: vi.fn(),
}))

const makeStub = (tag) =>
  defineComponent({ name: tag, setup(_, { slots }) { return () => h('div', slots.default?.()) } })

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props) {
    return () => h('div', { class: 'el-table' },
      (props.data || []).map((row) =>
        h('div', { class: 'el-table-row' }, [
          h('span', row.subsidy_type),
        ])
      )
    )
  },
})

const globalConfig = {
  components: {
    ElCard: makeStub('ElCard'),
    ElForm: makeStub('ElForm'),
    ElFormItem: makeStub('ElFormItem'),
    ElInput: makeStub('ElInput'),
    ElInputNumber: makeStub('ElInputNumber'),
    ElSelect: makeStub('ElSelect'),
    ElOption: makeStub('ElOption'),
    ElDatePicker: makeStub('ElDatePicker'),
    ElButton: makeStub('ElButton'),
    ElTag: makeStub('ElTag'),
    ElDialog: makeStub('ElDialog'),
    ElTable,
    ElTableColumn: makeStub('ElTableColumn'),
  },
}

describe('SubsidiesView', () => {
  it('renders summary cards + table rows', async () => {
    const w = mount(SubsidiesView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('teacher_extra')
  })
})

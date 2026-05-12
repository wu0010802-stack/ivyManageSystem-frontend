import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import CertificatesView from '@/views/admin/gov-reports/CertificatesView.vue'

vi.mock('@/api/govMoe', () => ({
  listCertificateHistory: vi.fn().mockResolvedValue({
    data: [{ id: 1, serial: 'EC-2026-0001', student_id: 7,
             issue_date: '2026-05-12', purpose: 'p', copies: 1 }],
  }),
}))

// Minimal stubs for Element Plus components not registered in test env
const makeStub = (tag) =>
  defineComponent({ name: tag, setup(_, { slots }) { return () => h('div', slots.default?.()) } })

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props) {
    return () => h('div', { class: 'el-table' },
      (props.data || []).map((row) =>
        h('div', { class: 'el-table-row' }, [
          h('span', row.serial),
        ])
      )
    )
  },
})

const globalConfig = {
  components: {
    ElForm: makeStub('ElForm'),
    ElFormItem: makeStub('ElFormItem'),
    ElInput: makeStub('ElInput'),
    ElDatePicker: makeStub('ElDatePicker'),
    ElButton: makeStub('ElButton'),
    ElTable,
    ElTableColumn: makeStub('ElTableColumn'),
  },
}

describe('CertificatesView', () => {
  it('loads history rows on mount', async () => {
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('EC-2026-0001')
  })
})

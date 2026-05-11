import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { ElButton } from 'element-plus'
import StudentDisabilityDocsPanel from '@/components/student/StudentDisabilityDocsPanel.vue'
import * as govMoe from '@/api/govMoe'

vi.mock('@/api/govMoe')

// Minimal stubs so Vue doesn't throw on unknown EP components
const ElEmpty = defineComponent({
  name: 'ElEmpty',
  props: ['description'],
  setup(props) {
    return () => h('div', { class: 'el-empty' }, props.description)
  },
})

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table' }, [
      // Render columns (for header labels and structure)
      h('div', { class: 'el-table__header' }, slots.default?.()),
      // Render each data row's values as plain text so assertions can find them
      ...(props.data ?? []).map((row) =>
        h('div', { class: 'el-table__row' },
          Object.values(row)
            .filter((v) => v !== null && v !== undefined)
            .map((v) => h('span', {}, String(v)))
        )
      ),
    ])
  },
})

const ElTableColumn = defineComponent({
  name: 'ElTableColumn',
  props: ['prop', 'label', 'width', 'showOverflowTooltip'],
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table-column' }, [
      h('span', {}, props.label ?? ''),
      slots.default?.({ row: {} }),
    ])
  },
})

const globalStubs = {
  plugins: [],
  components: { ElButton, ElEmpty, ElTable, ElTableColumn },
}

describe('StudentDisabilityDocsPanel', () => {
  it('shows empty state when no docs', async () => {
    govMoe.listDisabilityDocs = vi.fn().mockResolvedValue({ data: [] })
    const wrapper = mount(StudentDisabilityDocsPanel, {
      props: { studentId: 1 },
      global: globalStubs,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('尚無鑑定文件')
  })

  it('renders list of docs', async () => {
    govMoe.listDisabilityDocs = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          student_id: 1,
          doc_type: '鑑定證明',
          file_path: '/uploads/a.pdf',
          issued_date: '2026-01-01',
          expiry_date: '2027-12-31',
          notes: '備註',
        },
      ],
    })
    const wrapper = mount(StudentDisabilityDocsPanel, {
      props: { studentId: 1 },
      global: globalStubs,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('鑑定證明')
  })
})

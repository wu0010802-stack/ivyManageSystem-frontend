import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, provide, inject } from 'vue'
import StudentDetailTable from '@/components/gov-reports/StudentDetailTable.vue'

// ── El 元件 mock ──────────────────────────────────────────────────────────
// 策略：RowWrapper provide row → ElTableColumn inject row → 呼叫 #default slot({ row })

const ROW_KEY = Symbol('currentRow')

const ElTableColumn = defineComponent({
  name: 'ElTableColumn',
  props: ['prop', 'label', 'width', 'align', 'sortable'],
  setup(props, { slots }) {
    const row = inject(ROW_KEY, {})
    return () => {
      if (slots.default) {
        return h('span', { class: 'el-table-column' }, slots.default({ row }))
      }
      const val = props.prop ? (row)[props.prop] : ''
      return h('span', { class: 'el-table-column' }, val != null ? String(val) : '')
    }
  },
})

const ElTag = defineComponent({
  name: 'ElTag',
  props: ['type', 'size'],
  setup(_, { slots }) {
    return () => h('span', { class: 'el-tag' }, slots.default?.())
  },
})

const RowWrapper = defineComponent({
  name: 'RowWrapper',
  props: ['row'],
  setup(props, { slots }) {
    provide(ROW_KEY, props.row)
    return () => h('div', { class: 'el-table__row' }, slots.default?.())
  },
})

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data', 'border', 'stripe', 'size', 'maxHeight'],
  setup(props, { slots }) {
    return () =>
      h('div', { class: 'el-table' },
        (props.data ?? []).map((row, idx) =>
          h(RowWrapper, { row, key: idx }, slots.default ? { default: () => slots.default?.() } : {}),
        ),
      )
  },
})

const globalConfig = {
  components: { ElTable, ElTableColumn, ElTag },
}

// ── 測試資料 ───────────────────────────────────────────────────────────────

const baseRow = {
  student_id: 1,
  student_no: 'S001',
  name: '王小明',
  id_number: 'A123456789',
  classroom_name: '蘋果班',
  age_group: '4-5',
  expected_days: 22,
  actual_days: 20,
  attendance_rate_pct: 90.91,
  is_disadvantaged: false,
}

// ── 測試 ───────────────────────────────────────────────────────────────────

describe('StudentDetailTable', () => {
  it('renders student name and id_number', () => {
    const wrapper = mount(StudentDetailTable, {
      props: { rows: [baseRow] },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('A123456789')
  })

  it('shows dash (-) for null id_number', () => {
    const wrapper = mount(StudentDetailTable, {
      props: { rows: [{ ...baseRow, id_number: null }] },
      global: globalConfig,
    })
    // 身分證欄位透過 slot 渲染，null → '-'
    expect(wrapper.text()).toContain('-')
    expect(wrapper.text()).not.toContain('null')
  })

  it('shows 弱勢 tag when is_disadvantaged is true', () => {
    const wrapper = mount(StudentDetailTable, {
      props: { rows: [{ ...baseRow, is_disadvantaged: true }] },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('是')
  })

  it('shows 否 when is_disadvantaged is false', () => {
    const wrapper = mount(StudentDetailTable, {
      props: { rows: [baseRow] },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('否')
  })
})

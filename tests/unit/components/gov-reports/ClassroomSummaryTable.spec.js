import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, provide, inject } from 'vue'
import ClassroomSummaryTable from '@/components/gov-reports/ClassroomSummaryTable.vue'

// ── El 元件 mock ──────────────────────────────────────────────────────────
// 策略：
// 1. ElTable 透過 provide 把每個 row 給子 ElTableColumn；同時渲染 #append slot
// 2. ElTableColumn 透過 inject 拿 row，再呼叫自己的 #default slot({ row })
//    若無 slot 則渲染 row[prop]
// 為了渲染多筆 row，ElTable 對每筆 row 個別渲染一份欄位結構

const ROW_KEY = Symbol('currentRow')

const ElTableColumn = defineComponent({
  name: 'ElTableColumn',
  props: ['prop', 'label', 'width', 'align', 'sortable', 'minWidth'],
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

// 包裝每筆 row 的容器：provide row，再渲染 slots.default（即 ElTableColumn 們）
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
  props: ['data', 'border', 'stripe', 'size'],
  setup(props, { slots }) {
    return () =>
      h('div', { class: 'el-table' }, [
        // 每筆 row 用 RowWrapper 包，provide row 給 ElTableColumn
        ...(props.data ?? []).map((row, idx) =>
          h(RowWrapper, { row, key: idx }, slots.default ? { default: () => slots.default?.() } : {}),
        ),
        // append slot（合計列）
        slots.append ? h('div', { class: 'el-table__append' }, slots.append()) : null,
      ])
  },
})

const globalConfig = {
  components: { ElTable, ElTableColumn },
}

// ── 測試資料 ───────────────────────────────────────────────────────────────

const row1 = {
  classroom_id: 1,
  classroom_name: '蘋果班',
  age_group: '4-5',
  expected_days: 100,
  actual_days: 95,
  attendance_rate_pct: 95.0,
  total_count: 5,
  male_count: 3,
  female_count: 2,
  disadvantaged_count: 1,
  disability_count: 0,
  indigenous_count: 0,
  foreign_count: 0,
}

const row2 = {
  ...row1,
  classroom_id: 2,
  classroom_name: '芒果班',
  expected_days: 50,
  actual_days: 48,
  attendance_rate_pct: 96.0,
}

// ── 測試 ───────────────────────────────────────────────────────────────────

describe('ClassroomSummaryTable', () => {
  it('renders one row per data entry', () => {
    const wrapper = mount(ClassroomSummaryTable, {
      props: { rows: [row1, row2] },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('蘋果班')
    expect(wrapper.text()).toContain('芒果班')
  })

  it('shows totals in append slot with correct sums', () => {
    const wrapper = mount(ClassroomSummaryTable, {
      props: { rows: [row1, row2] },
      global: globalConfig,
    })
    const appendEl = wrapper.find('.el-table__append')
    expect(appendEl.exists()).toBe(true)
    // expected_days 100 + 50 = 150
    expect(appendEl.text()).toContain('150')
    // actual_days 95 + 48 = 143
    expect(appendEl.text()).toContain('143')
    // 合計 label
    expect(appendEl.text()).toContain('合計')
  })

  it('handles empty rows without error', () => {
    const wrapper = mount(ClassroomSummaryTable, {
      props: { rows: [] },
      global: globalConfig,
    })
    const appendEl = wrapper.find('.el-table__append')
    expect(appendEl.exists()).toBe(true)
    expect(appendEl.text()).toContain('合計')
    // 空資料合計出席率為 0.00%
    expect(appendEl.text()).toContain('0.00%')
  })
})

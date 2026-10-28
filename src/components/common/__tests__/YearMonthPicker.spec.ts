import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import YearMonthPicker from '../YearMonthPicker.vue'

// el-select／el-option 以輕量 stub 取代：保留 v-model 與 option 值/標籤供斷言。
const ElSelectStub = defineComponent({
  name: 'ElSelect',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots, attrs }) {
    return () => h('div', { class: 'select-stub', 'aria-label': attrs['aria-label'], 'data-disabled': String(!!props.disabled) }, slots.default?.())
  },
})
const ElOptionStub = defineComponent({
  name: 'ElOption',
  props: ['value', 'label'],
  setup(props) {
    return () => h('span', { class: 'option-stub', 'data-value': String(props.value) }, props.label)
  },
})
const stubs = { 'el-select': ElSelectStub, 'el-option': ElOptionStub }

const mountPicker = (props: Record<string, unknown>) =>
  mount(YearMonthPicker, { props: { year: 2026, month: 8, ...props }, global: { stubs } })

describe('YearMonthPicker（人事薪資頁共用年月選擇器）', () => {
  it('預設年份選項為當前年 ±1，月份 1–12', () => {
    const w = mountPicker({})
    const selects = w.findAllComponents(ElSelectStub)
    expect(selects).toHaveLength(2)
    expect(selects[0].attributes('aria-label')).toBe('年份')
    expect(selects[1].attributes('aria-label')).toBe('月份')
    const years = selects[0].findAll('.option-stub').map((o) => o.text())
    expect(years).toEqual(['2025 年', '2026 年', '2027 年'])
    const months = selects[1].findAll('.option-stub').map((o) => o.attributes('data-value'))
    expect(months).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)))
    expect(selects[1].findAll('.option-stub')[0].text()).toBe('1 月')
  })

  it('yearsBefore／yearsAfter 調整年份視窗（薪資總覽為 -2..+1）', () => {
    const w = mountPicker({ yearsBefore: 2 })
    const years = w.findAllComponents(ElSelectStub)[0].findAll('.option-stub').map((o) => o.text())
    expect(years).toEqual(['2024 年', '2025 年', '2026 年', '2027 年'])
  })

  it('選擇後以 update:year／update:month 回傳數字', async () => {
    const w = mountPicker({})
    const selects = w.findAllComponents(ElSelectStub)
    selects[0].vm.$emit('update:modelValue', 2025)
    selects[1].vm.$emit('update:modelValue', 3)
    expect(w.emitted('update:year')?.[0]).toEqual([2025])
    expect(w.emitted('update:month')?.[0]).toEqual([3])
  })

  it('disabled 同時鎖住年與月', () => {
    const w = mountPicker({ disabled: true })
    const selects = w.findAllComponents(ElSelectStub)
    expect(selects.every((s) => s.attributes('data-disabled') === 'true')).toBe(true)
  })
})

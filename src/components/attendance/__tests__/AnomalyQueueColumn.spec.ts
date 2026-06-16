// src/components/attendance/__tests__/AnomalyQueueColumn.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnomalyQueueColumn from '../AnomalyQueueColumn.vue'
import type { AnomalyItem } from '@/composables/useAttendanceWorkspace'

// ── fixture data ───────────────────────────────────────────────────────────────
const itemLate: AnomalyItem = {
  id: 10,
  employee_name: '王遲到',
  employee_number: 'E002',
  date: '2026-06-01',
  weekday: '一',
  type: 'late',
  type_label: '遲到',
  detail: '遲到 15 分',
  estimated_deduction: 300,
  confirmed_action: null,
}

const itemMissing: AnomalyItem = {
  id: 20,
  employee_name: '李缺卡',
  employee_number: 'E003',
  date: '2026-06-02',
  weekday: '二',
  type: 'missing_punch',
  type_label: '未打卡',
  detail: '缺打卡',
  estimated_deduction: 0,
  confirmed_action: null,
}

const itemEarly: AnomalyItem = {
  id: 30,
  employee_name: '陳早退',
  employee_number: 'E001',
  date: '2026-06-03',
  weekday: '三',
  type: 'early_leave',
  type_label: '早退',
  detail: '早退 30 分',
  estimated_deduction: 0,
  confirmed_action: '已確認',
}

const defaultItems: AnomalyItem[] = [itemLate, itemMissing, itemEarly]

// ── stubs ──────────────────────────────────────────────────────────────────────
// el-select stub: emits 'change' when native select changes
const ElSelect = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue', 'change'],
  template: `<select
    :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
  ><slot /></select>`,
}

const ElOption = {
  props: ['value', 'label'],
  template: `<option :value="value">{{ label }}</option>`,
}

const ElEmpty = {
  props: ['description'],
  template: `<div class="el-empty">{{ description }}</div>`,
}

const EmptyStateStub = {
  props: ['variant', 'title', 'description'],
  template: `<div class="empty-state-stub">{{ title }}</div>`,
}

const stubs = {
  ElSelect,
  ElOption,
  ElEmpty,
  EmptyState: EmptyStateStub,
}

function mountQueue(overrides: {
  items?: AnomalyItem[]
  selectedIndex?: number
  loading?: boolean
}) {
  return mount(AnomalyQueueColumn, {
    props: {
      items: overrides.items ?? defaultItems,
      selectedIndex: overrides.selectedIndex ?? -1,
      loading: overrides.loading ?? false,
    },
    global: {
      stubs,
      directives: {
        loading: { mounted() {}, updated() {} },
      },
    },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('AnomalyQueueColumn', () => {
  it('renders all items — names and type_labels visible', () => {
    const wrapper = mountQueue({})
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('遲到')
    expect(wrapper.text()).toContain('李缺卡')
    expect(wrapper.text()).toContain('未打卡')
    expect(wrapper.text()).toContain('陳早退')
    expect(wrapper.text()).toContain('早退')
  })

  it('filters locally by type select — only late items remain', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    // first select is type filter
    await selects[0].setValue('late')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('王遲到')
    expect(wrapper.text()).not.toContain('李缺卡')
    expect(wrapper.text()).not.toContain('陳早退')
  })

  it('emits filterChange when status select changes, with type and status payload', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    // second select is status filter
    await selects[1].setValue('pending')
    await nextTick()
    const emitted = wrapper.emitted('filterChange')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { type: string; status: string }
    expect(payload).toHaveProperty('type')
    expect(payload).toHaveProperty('status', 'pending')
  })

  it('emits filterChange when type select changes, with type and status payload', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('missing_punch')
    await nextTick()
    const emitted = wrapper.emitted('filterChange')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { type: string; status: string }
    expect(payload).toHaveProperty('type', 'missing_punch')
    expect(payload).toHaveProperty('status')
  })

  it('emits select with ORIGINAL items index — not filtered index', async () => {
    // items = [itemLate(idx=0), itemMissing(idx=1), itemEarly(idx=2)]
    // filter by type='missing_punch' → only itemMissing shown (filtered idx=0)
    // clicking it should emit original index = 1
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('missing_punch')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    await rows[0].trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    // original index of itemMissing in props.items is 1
    expect(emitted![0]).toEqual([1])
  })

  it('shows estimated deduction amount (red) for itemLate (deduction > 0)', () => {
    const wrapper = mountQueue({})
    // look for the deduction amount text
    expect(wrapper.text()).toContain('300')
  })

  it('does NOT show deduction amount when estimated_deduction is 0', () => {
    // Only itemLate has deduction > 0; itemMissing and itemEarly have 0
    const wrapper = mountQueue({ items: [itemMissing] })
    // deduction of 0 should not render amount
    expect(wrapper.text()).not.toContain('NT$0')
    expect(wrapper.text()).not.toContain('$0')
  })

  it('highlights the row matching selectedIndex', () => {
    // selectedIndex=0 → itemLate should be highlighted
    const wrapper = mountQueue({ selectedIndex: 0 })
    const rows = wrapper.findAll('.anomaly-item')
    // row 0 should have selected class
    expect(rows[0].classes()).toContain('anomaly-item--selected')
    // others should not
    expect(rows[1].classes()).not.toContain('anomaly-item--selected')
  })

  it('shows pending marker (red dot) for items with confirmed_action === null', () => {
    const wrapper = mountQueue({})
    // itemLate and itemMissing have confirmed_action null, itemEarly has value
    const rows = wrapper.findAll('.anomaly-item')
    const lateRow = rows.find((r) => r.text().includes('王遲到'))
    expect(lateRow?.find('.anomaly-item__pending').exists()).toBe(true)
    const earlyRow = rows.find((r) => r.text().includes('陳早退'))
    expect(earlyRow?.find('.anomaly-item__pending').exists()).toBe(false)
  })

  it('shows empty state when filtered list is empty (non-loading)', async () => {
    // items only has 'late' type; filter to 'early_leave' → 0 results
    const wrapper = mountQueue({ items: [itemLate] })
    const selects = wrapper.findAll('select')
    await selects[0].setValue('early_leave')
    await nextTick()
    const empty = wrapper.find('.empty-state-stub')
    expect(empty.exists()).toBe(true)
  })
})

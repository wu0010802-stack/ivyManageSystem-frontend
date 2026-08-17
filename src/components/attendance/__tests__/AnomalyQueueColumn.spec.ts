// src/components/attendance/__tests__/AnomalyQueueColumn.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnomalyQueueColumn from '../AnomalyQueueColumn.vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── fixture data（P1-4：一天一張卡）────────────────────────────────────────────
const cardLate: AnomalyDayCard = {
  id: 10,
  employee_name: '王遲到',
  employee_number: 'E002',
  date: '2026-06-01',
  weekday: '一',
  confirmed_action: null,
  items: [
    { type: 'late', type_label: '遲到', detail: '遲到 15 分', estimated_deduction: 300 },
  ],
}

const cardMulti: AnomalyDayCard = {
  id: 20,
  employee_name: '李缺卡',
  employee_number: 'E003',
  date: '2026-06-02',
  weekday: '二',
  confirmed_action: null,
  items: [
    { type: 'missing_punch', type_label: '未打卡', detail: '缺打卡', estimated_deduction: 0 },
    { type: 'late', type_label: '遲到', detail: '遲到 5 分', estimated_deduction: 100 },
  ],
}

const cardConfirmed: AnomalyDayCard = {
  id: 30,
  employee_name: '陳早退',
  employee_number: 'E001',
  date: '2026-06-03',
  weekday: '三',
  confirmed_action: 'admin_accept',
  items: [
    { type: 'early_leave', type_label: '早退', detail: '早退 30 分', estimated_deduction: 0 },
  ],
}

const defaultItems: AnomalyDayCard[] = [cardLate, cardMulti, cardConfirmed]

// ── stubs ──────────────────────────────────────────────────────────────────────
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

const EmptyStateStub = {
  props: ['variant', 'title', 'description'],
  template: `<div class="empty-state-stub">{{ title }}</div>`,
}

const stubs = {
  ElSelect,
  ElOption,
  EmptyState: EmptyStateStub,
}

function mountQueue(overrides: {
  items?: AnomalyDayCard[]
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
  it('預設只顯示未處理卡（statusFilter=pending）', () => {
    const wrapper = mountQueue({})
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
    expect(wrapper.text()).not.toContain('陳早退')
  })

  it('日卡列出當日所有異常的 type_label（同卡多異常）', () => {
    const wrapper = mountQueue({})
    const multiRow = wrapper.findAll('.anomaly-item').find((r) => r.text().includes('李缺卡'))
    expect(multiRow?.text()).toContain('未打卡')
    expect(multiRow?.text()).toContain('遲到')
  })

  it('status filter=all → 已處理卡也顯示（篩選真的生效）', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('all')
    await nextTick()
    expect(wrapper.text()).toContain('陳早退')
    expect(wrapper.findAll('.anomaly-item').length).toBe(3)
  })

  it('status filter=confirmed → 只顯示已處理卡', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('confirmed')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('陳早退')
  })

  it('type filter：卡內任一異常符合即顯示', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('late')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    // cardLate 與 cardMulti（含 late 項）皆符合
    expect(rows.length).toBe(2)
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
  })

  it('emits filterChange when status select changes, with type and status payload', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('confirmed')
    await nextTick()
    const emitted = wrapper.emitted('filterChange')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { type: string; status: string }
    expect(payload).toHaveProperty('type')
    expect(payload).toHaveProperty('status', 'confirmed')
  })

  it('emits select with ORIGINAL items index — not filtered index', async () => {
    // filter type='missing_punch' → 只剩 cardMulti（原始 index=1）
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('missing_punch')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    await rows[0].trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([1])
  })

  it('卡片扣款＝卡內項目合計（遮罩 null 不列入）', () => {
    const wrapper = mountQueue({
      items: [
        {
          ...cardMulti,
          items: [
            { type: 'late', type_label: '遲到', detail: 'x', estimated_deduction: 100 },
            { type: 'early_leave', type_label: '早退', detail: 'y', estimated_deduction: null },
          ],
        },
      ],
    })
    expect(wrapper.text()).toContain('100')
  })

  it('does NOT show deduction amount when合計為 0', () => {
    const wrapper = mountQueue({
      items: [
        {
          ...cardMulti,
          items: [
            { type: 'missing_punch', type_label: '未打卡', detail: 'x', estimated_deduction: 0 },
          ],
        },
      ],
    })
    expect(wrapper.text()).not.toContain('NT$0')
    expect(wrapper.text()).not.toContain('$0')
  })

  it('highlights the row matching selectedIndex', () => {
    const wrapper = mountQueue({ selectedIndex: 0 })
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows[0].classes()).toContain('anomaly-item--selected')
    expect(rows[1].classes()).not.toContain('anomaly-item--selected')
  })

  it('shows pending marker (red dot) for cards with confirmed_action === null', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('all')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    const lateRow = rows.find((r) => r.text().includes('王遲到'))
    expect(lateRow?.find('.anomaly-item__pending').exists()).toBe(true)
    const earlyRow = rows.find((r) => r.text().includes('陳早退'))
    expect(earlyRow?.find('.anomaly-item__pending').exists()).toBe(false)
  })

  it('shows empty state when filtered list is empty (non-loading)', async () => {
    const wrapper = mountQueue({ items: [cardLate] })
    const selects = wrapper.findAll('select')
    await selects[0].setValue('early_leave')
    await nextTick()
    const empty = wrapper.find('.empty-state-stub')
    expect(empty.exists()).toBe(true)
  })
})

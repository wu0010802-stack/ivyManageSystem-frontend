// src/components/attendance/__tests__/RosterColumn.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RosterColumn from '../RosterColumn.vue'
import type { RosterRow } from '@/composables/useAttendanceWorkspace'

// ── fixture data ──────────────────────────────────────────────────────────────
const rowFull: RosterRow = {
  employee_id: 1,
  employee_name: '陳全勤',
  employee_number: 'E001',
  normal_days: 22,
  late_count: 0,
  early_leave_count: 0,
  missing_punch_in: 0,
  missing_punch_out: 0,
  total_late_minutes: 0,
}
const rowLate: RosterRow = {
  employee_id: 2,
  employee_name: '王遲到',
  employee_number: 'E002',
  normal_days: 20,
  late_count: 2,
  early_leave_count: 1,
  missing_punch_in: 0,
  missing_punch_out: 0,
  total_late_minutes: 45,
}
const rowMissing: RosterRow = {
  employee_id: 3,
  employee_name: '李缺卡',
  employee_number: 'E003',
  normal_days: 18,
  late_count: 0,
  early_leave_count: 0,
  missing_punch_in: 3,
  missing_punch_out: 2,
  total_late_minutes: 0,
}

// anomalyCount: rowFull=0, rowLate=3 (2+1+0+0), rowMissing=5 (0+0+3+2)
// expected sort order: rowMissing (5) > rowLate (3) > rowFull (0)

// ── stubs ─────────────────────────────────────────────────────────────────────
const ElInput = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: `<input
    :value="modelValue"
    :placeholder="placeholder"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

const ElTag = {
  props: ['type'],
  template: `<span :data-type="type"><slot /></span>`,
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
  ElInput,
  ElTag,
  ElEmpty,
  EmptyState: EmptyStateStub,
  // directive stub: v-loading just renders children
  vLoading: {}, // directives handled below
}

function mountRoster(props: {
  roster?: RosterRow[]
  selectedEmployeeId?: number | null
  loading?: boolean
}) {
  return mount(RosterColumn, {
    props: {
      roster: props.roster ?? [rowFull, rowLate, rowMissing],
      selectedEmployeeId: props.selectedEmployeeId ?? null,
      loading: props.loading ?? false,
    },
    global: {
      stubs,
      directives: {
        loading: {
          // no-op directive stub
          mounted() {},
          updated() {},
        },
      },
    },
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('RosterColumn', () => {
  it('renders all roster names', () => {
    const wrapper = mountRoster({})
    expect(wrapper.text()).toContain('陳全勤')
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
  })

  it('sorts by anomalyCount descending — most anomalies first', () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(3)
    // rowMissing has anomalyCount=5, should be first
    expect(items[0].text()).toContain('李缺卡')
    // rowLate has anomalyCount=3, should be second
    expect(items[1].text()).toContain('王遲到')
    // rowFull has anomalyCount=0, should be last
    expect(items[2].text()).toContain('陳全勤')
  })

  it('filters roster by name search input', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('王')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('王遲到')
  })

  it('filters by employee_number', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('E001')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('陳全勤')
  })

  it('emits select with correct employee_id on row click', async () => {
    const wrapper = mountRoster({})
    // sorted order: [李缺卡(3), 王遲到(2), 陳全勤(1)]
    const items = wrapper.findAll('.roster-item')
    // click second item (王遲到, id=2)
    await items[1].trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([2])
  })

  it('emits select with employee_id of first item (李缺卡, id=3)', async () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    await items[0].trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual([3])
  })

  it('applies selected class to the row matching selectedEmployeeId', () => {
    const wrapper = mountRoster({ selectedEmployeeId: 1 })
    // rowFull (id=1) is last after sorting
    const items = wrapper.findAll('.roster-item')
    const selectedItem = items.find((i) => i.text().includes('陳全勤'))
    expect(selectedItem?.classes()).toContain('roster-item--selected')
    // others should not have selected class
    const unselected = items.find((i) => i.text().includes('李缺卡'))
    expect(unselected?.classes()).not.toContain('roster-item--selected')
  })

  it('shows full-attendance badge for rowFull (anomalyCount=0)', () => {
    const wrapper = mountRoster({})
    // rowFull is last item; find it
    const items = wrapper.findAll('.roster-item')
    const fullItem = items.find((i) => i.text().includes('陳全勤'))
    // should have a success tag
    const tag = fullItem?.find('[data-type="success"]')
    expect(tag).toBeTruthy()
  })

  it('shows warning/danger badges for rowMissing (missing punches)', () => {
    const wrapper = mountRoster({})
    const items = wrapper.findAll('.roster-item')
    const missingItem = items.find((i) => i.text().includes('李缺卡'))
    const dangerTag = missingItem?.find('[data-type="danger"]')
    expect(dangerTag).toBeTruthy()
  })

  it('shows empty state when roster is empty and not loading', async () => {
    const wrapper = mountRoster({ roster: [] })
    await nextTick()
    // EmptyState stub renders with class empty-state-stub
    const empty = wrapper.find('.empty-state-stub')
    expect(empty.exists()).toBe(true)
  })

  it('search is case-insensitive and also searches employee_number', async () => {
    const wrapper = mountRoster({})
    await wrapper.find('input').setValue('e002')
    await nextTick()
    const items = wrapper.findAll('.roster-item')
    expect(items.length).toBe(1)
    expect(items[0].text()).toContain('王遲到')
  })
})

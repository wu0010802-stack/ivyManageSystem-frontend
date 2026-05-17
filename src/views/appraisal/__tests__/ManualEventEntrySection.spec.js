import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

vi.mock('@/api/appraisal', () => ({
  getManualEventCounts: vi.fn(),
  batchUpsertManualEventCounts: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

import * as api from '@/api/appraisal'
import ManualEventEntrySection from '@/views/appraisal/components/ManualEventEntrySection.vue'

// ── Element Plus stubs (pattern lifted from CurrentSemesterOverview.spec.js) ─
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'button',
        {
          ...dataAttrs,
          ...(props.disabled || props.loading ? { disabled: 'disabled' } : {}),
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const ElAlertStub = defineComponent({
  name: 'ElAlertStub',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('div', { class: 'el-alert', ...dataAttrs },
        [slots.title?.(), slots.default?.()].filter(Boolean))
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        props.data.map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})

// Walk default-slot vnodes and flatten Fragments (from v-for).
function flattenSlotVnodes(vnodes) {
  const out = []
  for (const v of vnodes || []) {
    // Fragment (v-for) has Symbol(Fragment) type and array children
    if (v && typeof v.type === 'symbol' && Array.isArray(v.children)) {
      out.push(...flattenSlotVnodes(v.children))
    } else if (v && v.type) {
      out.push(v)
    }
  }
  return out
}

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  inheritAttrs: false,
  setup(props, { slots, attrs }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => {
      const flat = flattenSlotVnodes(slots.default?.() || [])
      return h(
        'div',
        { class: 'el-table', ...dataAttrs },
        flat.map((vnode, index) =>
          h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
        ),
      )
    }
  },
})

const ElInputNumberStub = defineComponent({
  name: 'ElInputNumberStub',
  props: ['modelValue', 'disabled', 'min', 'step', 'precision'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('input', {
        ...dataAttrs,
        type: 'number',
        value: props.modelValue ?? 0,
        ...(props.disabled ? { disabled: 'disabled' } : {}),
        onInput: (e) =>
          emit('update:modelValue', Number(e.target.value)),
      })
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-alert': ElAlertStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-input-number': ElInputNumberStub,
}

const mountOpts = (props = {}) => ({
  props: {
    cycleId: 10,
    participants: [
      { participant_id: 1, employee_name: '王雅玲', role_group: 'HEAD_TEACHER' },
    ],
    readonly: false,
    ...props,
  },
  global: {
    stubs: GLOBAL_STUBS,
    directives: { loading: () => {} },
  },
})

describe('ManualEventEntrySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getManualEventCounts.mockResolvedValue({ data: { cycle_id: 10, entries: [] } })
    api.batchUpsertManualEventCounts.mockResolvedValue({ data: { ok: true } })
  })

  it('loads counts on mount via cycleId', async () => {
    mount(ManualEventEntrySection, mountOpts())
    await flushPromises()
    expect(api.getManualEventCounts).toHaveBeenCalledWith(10)
  })

  it('editing increments dirty count', async () => {
    api.getManualEventCounts.mockResolvedValueOnce({
      data: {
        cycle_id: 10,
        entries: [
          { participant_id: 1, item_code: 'OTHER', count: '0' },
        ],
      },
    })
    const wrapper = mount(ManualEventEntrySection, mountOpts())
    await flushPromises()
    const inp = wrapper.find('[data-test="count-1-OTHER"]')
    expect(inp.exists()).toBe(true)
    await inp.setValue('3')
    await nextTick()
    const btn = wrapper.find('[data-test="save-all-btn"]')
    expect(btn.text()).toMatch(/\(1\)/)
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('saveAll calls batchUpsert with dirtyEntries', async () => {
    const wrapper = mount(ManualEventEntrySection, mountOpts())
    await flushPromises()
    const inp = wrapper.find('[data-test="count-1-OTHER"]')
    expect(inp.exists()).toBe(true)
    await inp.setValue('2')
    await nextTick()
    await wrapper.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()
    expect(api.batchUpsertManualEventCounts).toHaveBeenCalledTimes(1)
    const [calledCycleId, entries] = api.batchUpsertManualEventCounts.mock.calls[0]
    expect(calledCycleId).toBe(10)
    expect(entries).toEqual([
      { participant_id: 1, item_code: 'OTHER', count: 2 },
    ])
  })

  it('disables save button when readonly', async () => {
    const wrapper = mount(ManualEventEntrySection, mountOpts({ readonly: true }))
    await flushPromises()
    const btn = wrapper.find('[data-test="save-all-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.el-alert').exists()).toBe(true)
  })

  it('reloads when cycleId changes', async () => {
    const wrapper = mount(ManualEventEntrySection, mountOpts())
    await flushPromises()
    expect(api.getManualEventCounts).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ cycleId: 20 })
    await flushPromises()
    expect(api.getManualEventCounts).toHaveBeenCalledTimes(2)
    expect(api.getManualEventCounts).toHaveBeenLastCalledWith(20)
  })
})

/**
 * P1-13：ManualEventEntrySection 計數限正整數。
 *
 * el-input-number 應為 step:1 / min:0 / precision:0，
 * 避免「事件次數」這種離散計數出現 0.5 浮點破值。
 *
 * Task A6：元件改從 manualColumnGroups.MANUAL_COLUMN_GROUPS 讀欄位
 * （巢狀 el-table-column group→leaf），mock 需同步更新。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

const { useManualEventEntryMock } = vi.hoisted(() => ({
  useManualEventEntryMock: vi.fn(),
}))

vi.mock('../../../src/views/appraisal/composables/useManualEventEntry', () => ({
  useManualEventEntry: useManualEventEntryMock,
  MANUAL_ITEM_CODES: ['SCHOOL_MEETING_ABSENCE'],
  MANUAL_LABEL: { SCHOOL_MEETING_ABSENCE: '園務會議' },
}))

// Task A6：mock manualColumnGroups，回傳單一測試組只含 min:0 計數碼
vi.mock('../../../src/views/appraisal/manualColumnGroups', () => ({
  MANUAL_COLUMN_GROUPS: [
    {
      label: '會議',
      codes: ['SCHOOL_MEETING_ABSENCE'],
    },
  ],
}))

import ManualEventEntrySection from '@/views/appraisal/components/ManualEventEntrySection.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

// Task A6：採用成熟的巢狀欄位 stub（比照 src/__tests__/ManualEventEntrySection.spec.js）
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      if (!slots.default) {
        return h('div', {}, props.data.map((_row, index) => h('div', { key: index })))
      }
      const probe = flattenSlotVnodes(slots.default({ row: {}, $index: 0 }))
      const isGroup = probe.length > 0 && probe.every((v) => v?.type?.name === 'ElTableColumnStub')
      if (isGroup) {
        return h(
          'div',
          {},
          probe.map((vnode, i) =>
            h(vnode.type, { ...vnode.props, data: props.data, key: i }, vnode.children),
          ),
        )
      }
      return h(
        'div',
        {},
        props.data.map((row, index) => h('div', { key: index }, slots.default({ row, $index: index }))),
      )
    }
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

const tableStubs = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': transparentStub(),
  'el-alert': transparentStub(),
  'el-input-number': {
    props: ['step', 'min', 'precision', 'modelValue', 'disabled'],
    inheritAttrs: false,
    template: `<input
      :data-test="$attrs['data-test']"
      :data-step="step"
      :data-min="min"
      :data-precision="precision"
      :value="modelValue"
    />`,
  },
}

describe('P1-13 ManualEventEntrySection 計數限正整數', () => {
  it('el-input-number 應為 step:1 / min:0 / precision:0', () => {
    useManualEventEntryMock.mockReturnValue({
      dirtyEntries: ref([]),
      loading: ref(false),
      saving: ref(false),
      getCount: () => 0,
      setCount: vi.fn(),
      saveAll: vi.fn(),
      // 元件 render 於 cell 比對原值（v-if getOriginal !== getCount）、並提供「沿用上一週期」；
      // mock 必須補這兩個 export，否則 getOriginal 為 undefined → render 於 :114 拋。
      getOriginal: () => 0,
      inheritFromPreviousCycle: vi.fn(),
      // 2026-07-07 起 cell 另呼叫 getNote 顯示機構活動「自動同步」溯源 tag，同上須補。
      getNote: () => null,
    })

    const w = mount(ManualEventEntrySection, {
      props: {
        cycleId: 1,
        participants: [
          { id: 1, participant_id: 10, employee_name: '張三', role_group: 'TEACHER' },
        ],
        readonly: false,
      },
      global: { stubs: tableStubs },
    })

    const inputs = w.findAll('input[data-test^="count-"]')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((input) => {
      expect(input.attributes('data-step')).toBe('1')
      expect(input.attributes('data-min')).toBe('0')
      expect(input.attributes('data-precision')).toBe('0')
    })
  })
})

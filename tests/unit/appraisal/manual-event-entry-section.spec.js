/**
 * P1-13：ManualEventEntrySection 計數限正整數。
 *
 * el-input-number 應為 step:1 / min:0 / precision:0，
 * 避免「事件次數」這種離散計數出現 0.5 浮點破值。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, provide, inject, ref } from 'vue'

const { useManualEventEntryMock } = vi.hoisted(() => ({
  useManualEventEntryMock: vi.fn(),
}))

vi.mock('../../../src/views/appraisal/composables/useManualEventEntry', () => ({
  useManualEventEntry: useManualEventEntryMock,
  MANUAL_ITEM_CODES: ['REWARD_PUNISH'],
  MANUAL_LABEL: { REWARD_PUNISH: '獎懲' },
}))

import ManualEventEntrySection from '@/views/appraisal/components/ManualEventEntrySection.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const tableStubs = {
  'el-table': {
    props: ['data'],
    setup(props, { slots }) {
      return () => {
        const rows = props.data || []
        return h(
          'div',
          rows.map((row) => {
            const RowProvider = {
              setup(_, { slots: rowSlots }) {
                provide('current-row', row)
                return () => h('div', rowSlots.default?.())
              },
            }
            return h(RowProvider, null, { default: () => slots.default?.() })
          }),
        )
      }
    },
  },
  'el-table-column': {
    setup(_, { slots }) {
      return () => {
        const row = inject('current-row', null)
        return h('div', slots.default ? slots.default({ row }) : null)
      }
    },
  },
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

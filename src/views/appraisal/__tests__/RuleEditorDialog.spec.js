import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks ─────────────────────────────────────────────
vi.mock('@/api/appraisal', () => ({
  createScoringRule: vi.fn().mockResolvedValue({ data: { id: 99 } }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { createScoringRule } from '@/api/appraisal'
import RuleEditorDialog from '../components/RuleEditorDialog.vue'

// ── Element Plus stubs ────────────────────────────────────
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        ...(props.disabled ? { disabled: 'disabled' } : {}),
        onClick: () => emit('click'),
      },
      slots.default?.(),
    )
  },
})

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    return () =>
      props.modelValue
        ? h(
            'div',
            { class: 'el-dialog-stub', ...attrs },
            [slots.default?.(), slots.footer?.()].filter(Boolean),
          )
        : null
  },
})

const ElInputStub = defineComponent({
  name: 'ElInputStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('input', {
        ...dataAttrs,
        value: props.modelValue,
        onInput: (e) => emit('update:modelValue', e.target.value),
      })
  },
})

const ElInputNumberStub = defineComponent({
  name: 'ElInputNumberStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('input', {
        ...dataAttrs,
        type: 'number',
        value: props.modelValue,
        onInput: (e) => emit('update:modelValue', Number(e.target.value)),
      })
  },
})

const ElDatePickerStub = defineComponent({
  name: 'ElDatePickerStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('input', {
        ...dataAttrs,
        value: props.modelValue,
        onInput: (e) => emit('update:modelValue', e.target.value),
      })
  },
})

const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'select',
        {
          ...dataAttrs,
          value: props.modelValue,
          onChange: (e) => emit('update:modelValue', e.target.value),
        },
        slots.default?.(),
      )
  },
})

const ElOptionStub = defineComponent({
  name: 'ElOptionStub',
  props: ['value', 'label'],
  setup(props) {
    return () => h('option', { value: props.value }, props.label)
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-dialog': ElDialogStub,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': ElInputStub,
  'el-input-number': ElInputNumberStub,
  'el-date-picker': ElDatePickerStub,
  'el-select': ElSelectStub,
  'el-option': ElOptionStub,
  'el-icon': { template: '<span />' },
}

async function mountDialog({ itemCode = 'LATE_EARLY', existingRule = null } = {}) {
  const wrapper = mount(RuleEditorDialog, {
    props: { visible: true, itemCode, existingRule },
    global: { stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return wrapper
}

async function setRuleType(wrapper, value) {
  const sel = wrapper.find('[data-test="rule-type-select"]')
  await sel.setValue(value)
  await flushPromises()
}

async function setEffectiveFrom(wrapper, date = '2027-01-01') {
  await wrapper.find('[data-test="effective-from-input"]').setValue(date)
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  createScoringRule.mockResolvedValue({ data: { id: 99 } })
})

describe('RuleEditorDialog', () => {
  // ── PER_UNIT（3 case）────────────────────────────────────
  describe('PER_UNIT', () => {
    it('預設 rule_type=PER_UNIT 時渲染 per-unit-delta-input', async () => {
      const wrapper = await mountDialog()
      expect(wrapper.find('[data-test="per-unit-section"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="per-unit-delta-input"]').exists()).toBe(true)
    })

    it('修改 per_unit_delta 後 form 跟著變', async () => {
      const wrapper = await mountDialog()
      const input = wrapper.find('[data-test="per-unit-delta-input"]')
      await input.setValue(-1.25)
      await flushPromises()
      expect(input.element.value).toBe('-1.25')
    })

    it('submit 帶出 PER_UNIT 正確 payload', async () => {
      const wrapper = await mountDialog({ itemCode: 'LATE_EARLY' })
      await setEffectiveFrom(wrapper, '2027-01-01')
      await wrapper.find('[data-test="per-unit-delta-input"]').setValue(-0.5)
      await flushPromises()
      await wrapper.find('[data-test="submit-btn"]').trigger('click')
      await flushPromises()

      expect(createScoringRule).toHaveBeenCalledTimes(1)
      const payload = createScoringRule.mock.calls[0][0]
      expect(payload.item_code).toBe('LATE_EARLY')
      expect(payload.effective_from).toBe('2027-01-01')
      expect(payload.rule_type).toBe('PER_UNIT')
      expect(payload.rule_config).toEqual({ per_unit_delta: -0.5 })
    })
  })

  // ── TIER（3 case）───────────────────────────────────────
  describe('TIER', () => {
    it('切到 TIER 後渲染 input_field + tiers list 預設一條 min=0', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'TIER')
      expect(wrapper.find('[data-test="tier-section"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="tier-input-field"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="tier-row-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="tier-row-1"]').exists()).toBe(false)
    })

    it('add + remove tier 動態增減', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'TIER')

      await wrapper.find('[data-test="add-tier-btn"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="tier-row-1"]').exists()).toBe(true)

      await wrapper.find('[data-test="add-tier-btn"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="tier-row-2"]').exists()).toBe(true)

      await wrapper.find('[data-test="remove-tier-2"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="tier-row-2"]').exists()).toBe(false)
    })

    it('submit 帶出 TIER 正確 payload（含 input_field + tiers）', async () => {
      const wrapper = await mountDialog({ itemCode: 'RETURNING_RATE_0915' })
      await setRuleType(wrapper, 'TIER')
      await setEffectiveFrom(wrapper, '2027-02-01')

      await wrapper.find('[data-test="tier-input-field"]').setValue('retention_rate')
      await wrapper.find('[data-test="tier-min-0"]').setValue(0)
      await wrapper.find('[data-test="tier-delta-0"]').setValue(-2)

      await wrapper.find('[data-test="add-tier-btn"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-test="tier-min-1"]').setValue(80)
      await wrapper.find('[data-test="tier-delta-1"]').setValue(0)

      await wrapper.find('[data-test="submit-btn"]').trigger('click')
      await flushPromises()

      expect(createScoringRule).toHaveBeenCalledTimes(1)
      const payload = createScoringRule.mock.calls[0][0]
      expect(payload.item_code).toBe('RETURNING_RATE_0915')
      expect(payload.rule_type).toBe('TIER')
      expect(payload.rule_config.input_field).toBe('retention_rate')
      expect(payload.rule_config.tiers).toEqual([
        { min: 0, delta: -2 },
        { min: 80, delta: 0 },
      ])
    })
  })

  // ── FLAT_THRESHOLD（3 case）─────────────────────────────
  describe('FLAT_THRESHOLD', () => {
    it('切到 FLAT_THRESHOLD 後渲染 4 個欄位', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'FLAT_THRESHOLD')
      expect(wrapper.find('[data-test="flat-section"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="flat-input-field"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="threshold-input"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="above-delta-input"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="below-delta-input"]').exists()).toBe(true)
    })

    it('修改 threshold/above/below 後 form 跟著變', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'FLAT_THRESHOLD')

      const threshold = wrapper.find('[data-test="threshold-input"]')
      await threshold.setValue(50)
      const above = wrapper.find('[data-test="above-delta-input"]')
      await above.setValue(1)
      const below = wrapper.find('[data-test="below-delta-input"]')
      await below.setValue(-1)
      await flushPromises()

      expect(threshold.element.value).toBe('50')
      expect(above.element.value).toBe('1')
      expect(below.element.value).toBe('-1')
    })

    it('submit 帶出 FLAT_THRESHOLD 正確 payload', async () => {
      const wrapper = await mountDialog({ itemCode: 'AFTER_CLASS_RATE' })
      await setRuleType(wrapper, 'FLAT_THRESHOLD')
      await setEffectiveFrom(wrapper, '2027-03-01')

      await wrapper.find('[data-test="flat-input-field"]').setValue('activity_rate')
      await wrapper.find('[data-test="threshold-input"]').setValue(50)
      await wrapper.find('[data-test="above-delta-input"]').setValue(1)
      await wrapper.find('[data-test="below-delta-input"]').setValue(-1)
      await flushPromises()

      await wrapper.find('[data-test="submit-btn"]').trigger('click')
      await flushPromises()

      const payload = createScoringRule.mock.calls[0][0]
      expect(payload.rule_type).toBe('FLAT_THRESHOLD')
      expect(payload.rule_config).toEqual({
        input_field: 'activity_rate',
        threshold: 50,
        above_delta: 1,
        below_delta: -1,
      })
    })
  })

  // ── DISCIPLINARY_TIERED（3 case）────────────────────────
  describe('DISCIPLINARY_TIERED', () => {
    it('切到 DISCIPLINARY_TIERED 後渲染警告/小過/大過 3 欄', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'DISCIPLINARY_TIERED')
      expect(wrapper.find('[data-test="disciplinary-section"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="warning-delta-input"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="minor-delta-input"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="major-delta-input"]').exists()).toBe(true)
    })

    it('修改 3 欄後 form 跟著變', async () => {
      const wrapper = await mountDialog()
      await setRuleType(wrapper, 'DISCIPLINARY_TIERED')
      const w = wrapper.find('[data-test="warning-delta-input"]')
      const m = wrapper.find('[data-test="minor-delta-input"]')
      const j = wrapper.find('[data-test="major-delta-input"]')
      await w.setValue(-1)
      await m.setValue(-3)
      await j.setValue(-9)
      await flushPromises()
      expect(w.element.value).toBe('-1')
      expect(m.element.value).toBe('-3')
      expect(j.element.value).toBe('-9')
    })

    it('submit 帶出 DISCIPLINARY_TIERED 正確 payload', async () => {
      const wrapper = await mountDialog({ itemCode: 'REWARD_PUNISH' })
      await setRuleType(wrapper, 'DISCIPLINARY_TIERED')
      await setEffectiveFrom(wrapper, '2027-04-01')

      await wrapper.find('[data-test="warning-delta-input"]').setValue(-1)
      await wrapper.find('[data-test="minor-delta-input"]').setValue(-3)
      await wrapper.find('[data-test="major-delta-input"]').setValue(-9)
      await flushPromises()

      await wrapper.find('[data-test="submit-btn"]').trigger('click')
      await flushPromises()

      const payload = createScoringRule.mock.calls[0][0]
      expect(payload.item_code).toBe('REWARD_PUNISH')
      expect(payload.rule_type).toBe('DISCIPLINARY_TIERED')
      expect(payload.rule_config).toEqual({
        warning_delta: -1,
        minor_delta: -3,
        major_delta: -9,
      })
    })
  })
})

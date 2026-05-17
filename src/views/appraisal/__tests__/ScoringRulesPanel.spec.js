import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks（先 mock 再 import view）────────────────────
vi.mock('@/api/appraisal', () => ({
  listScoringRules: vi.fn(),
  createScoringRule: vi.fn().mockResolvedValue({ data: {} }),
  getScoringRuleHistory: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { listScoringRules } from '@/api/appraisal'
import ScoringRulesPanel from '../components/ScoringRulesPanel.vue'

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

const ElDatePickerStub = defineComponent({
  name: 'ElDatePickerStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('input', {
      ...dataAttrs,
      value: props.modelValue,
      onInput: (e) => {
        emit('update:modelValue', e.target.value)
        emit('change', e.target.value)
      },
    })
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-date-picker': ElDatePickerStub,
  'el-form-item': { template: '<label><slot /></label>' },
  'el-tag': defineComponent({
    name: 'ElTagStub',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const dataAttrs = Object.fromEntries(
        Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
      )
      return () => h('span', dataAttrs, slots.default?.())
    },
  }),
  'el-icon': { template: '<span />' },
  RuleEditorDialog: defineComponent({
    name: 'RuleEditorDialogStub',
    props: ['visible', 'itemCode', 'existingRule'],
    emits: ['update:visible', 'created'],
    inheritAttrs: false,
    setup(props) {
      return () =>
        h(
          'div',
          {
            'data-test': 'rule-editor-dialog-stub',
            'data-visible': String(!!props.visible),
            'data-item-code': props.itemCode || '',
          },
          [],
        )
    },
  }),
  RuleHistoryDrawer: defineComponent({
    name: 'RuleHistoryDrawerStub',
    props: ['visible', 'itemCode'],
    emits: ['update:visible'],
    inheritAttrs: false,
    setup(props) {
      return () =>
        h(
          'div',
          {
            'data-test': 'rule-history-drawer-stub',
            'data-visible': String(!!props.visible),
            'data-item-code': props.itemCode || '',
          },
          [],
        )
    },
  }),
}

const directives = { loading: () => {} }

function makeRules() {
  return [
    {
      id: 1,
      item_code: 'LATE_EARLY',
      rule_type: 'PER_UNIT',
      rule_config: { per_unit_delta: -0.5 },
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
    },
    {
      id: 2,
      item_code: 'RETURNING_RATE_0915',
      rule_type: 'TIER',
      rule_config: {
        input_field: 'retention_rate',
        tiers: [
          { min: 0, delta: -2 },
          { min: 80, delta: 0 },
          { min: 95, delta: 2 },
        ],
      },
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
    },
    {
      id: 3,
      item_code: 'AFTER_CLASS_RATE',
      rule_type: 'FLAT_THRESHOLD',
      rule_config: {
        input_field: 'activity_rate',
        threshold: 50,
        above_delta: 1,
        below_delta: -1,
      },
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
    },
    {
      id: 4,
      item_code: 'REWARD_PUNISH',
      rule_type: 'DISCIPLINARY_TIERED',
      rule_config: {
        warning_delta: -1,
        minor_delta: -3,
        major_delta: -9,
      },
      effective_from: '2026-01-01',
      effective_to: null,
      notes: null,
    },
  ]
}

async function mountPanel({ rulesData = makeRules() } = {}) {
  listScoringRules.mockResolvedValue({ data: rulesData })
  const wrapper = mount(ScoringRulesPanel, {
    global: {
      stubs: GLOBAL_STUBS,
      directives,
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ScoringRulesPanel', () => {
  it('載入後渲染 14 張規則卡', async () => {
    const wrapper = await mountPanel()
    const codes = [
      'LATE_EARLY', 'MISSING_PUNCH', 'LEAVE',
      'RETURNING_RATE_0915', 'RETURNING_RATE_0315',
      'AFTER_CLASS_RATE', 'REWARD_PUNISH',
      'SCHOOL_MEETING_ABSENCE',
      'INSTITUTION_MEETING_0913', 'INSTITUTION_MEETING_1115',
      'SELF_IMPROVEMENT_ACTIVITY', 'CHILD_ACCIDENT',
      'CLASS_HEADCOUNT_BONUS', 'OTHER',
    ]
    expect(codes).toHaveLength(14)
    for (const code of codes) {
      expect(wrapper.find(`[data-test="rule-card-${code}"]`).exists()).toBe(true)
    }
  })

  it('每張卡 4 種 rule_type 的 summary 字串都正確', async () => {
    const wrapper = await mountPanel()

    // PER_UNIT
    expect(wrapper.find('[data-test="rule-summary-LATE_EARLY"]').text())
      .toContain('每次 -0.5 分')

    // TIER（3 階）
    expect(wrapper.find('[data-test="rule-summary-RETURNING_RATE_0915"]').text())
      .toContain('階梯式（3 階）')

    // FLAT_THRESHOLD
    const flatText = wrapper.find('[data-test="rule-summary-AFTER_CLASS_RATE"]').text()
    expect(flatText).toContain('≥50')
    expect(flatText).toContain('1')
    expect(flatText).toContain('-1')

    // DISCIPLINARY_TIERED
    const discText = wrapper.find('[data-test="rule-summary-REWARD_PUNISH"]').text()
    expect(discText).toContain('警告 -1')
    expect(discText).toContain('小過 -3')
    expect(discText).toContain('大過 -9')

    // 沒有規則的項目顯示「尚未設定」
    expect(wrapper.find('[data-test="rule-summary-OTHER"]').text())
      .toContain('尚未設定')
  })

  it('點 [編輯] 按鈕開啟 RuleEditorDialog 並傳對 itemCode', async () => {
    const wrapper = await mountPanel()
    const editor = wrapper.find('[data-test="rule-editor-dialog-stub"]')
    expect(editor.attributes('data-visible')).toBe('false')

    await wrapper.find('[data-test="edit-btn-LATE_EARLY"]').trigger('click')
    await flushPromises()

    const editor2 = wrapper.find('[data-test="rule-editor-dialog-stub"]')
    expect(editor2.attributes('data-visible')).toBe('true')
    expect(editor2.attributes('data-item-code')).toBe('LATE_EARLY')
  })

  it('點 [歷史] 按鈕開啟 RuleHistoryDrawer 並傳對 itemCode', async () => {
    const wrapper = await mountPanel()
    const drawer = wrapper.find('[data-test="rule-history-drawer-stub"]')
    expect(drawer.attributes('data-visible')).toBe('false')

    await wrapper.find('[data-test="history-btn-MISSING_PUNCH"]').trigger('click')
    await flushPromises()

    const drawer2 = wrapper.find('[data-test="rule-history-drawer-stub"]')
    expect(drawer2.attributes('data-visible')).toBe('true')
    expect(drawer2.attributes('data-item-code')).toBe('MISSING_PUNCH')
  })

  it('切換生效日重新呼叫 listScoringRules', async () => {
    const wrapper = await mountPanel()
    expect(listScoringRules).toHaveBeenCalledTimes(1)

    // 模擬 date-picker change
    const input = wrapper.find('[data-test="effective-on-picker"]')
    await input.setValue('2026-08-01')
    await flushPromises()

    expect(listScoringRules).toHaveBeenCalledTimes(2)
    expect(listScoringRules).toHaveBeenLastCalledWith('2026-08-01')
  })

  it('點 [重新整理] 觸發再次載入', async () => {
    const wrapper = await mountPanel()
    expect(listScoringRules).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="refresh-btn"]').trigger('click')
    await flushPromises()

    expect(listScoringRules).toHaveBeenCalledTimes(2)
  })
})

/**
 * 薪資邏輯頁「級距表版本」卡（spec 2026-08-18 §3.6）。
 *
 * 需求：結算頁勞健保細項的備註會標明級距表年度與來源，此頁要能對應查到同一份
 * 版本資訊。來源為程式內建（DB 漏 seed 的 fallback）時必須是紅字警告，不可與
 * 正常的 DB 來源長得一樣——那正是「保費靜默算錯卻無訊號」的故障指紋。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import SalaryLogicPanel from '@/views/salary/SalaryLogicPanel.vue'

const getSalaryLogic = vi.fn()

vi.mock('@/api/salary', () => ({
  getSalaryLogic: (...a: unknown[]) => getSalaryLogic(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

const PassthroughTable = defineComponent({
  name: 'PassthroughTable',
  setup(_, { slots }) {
    return () => h('div', {}, slots.default?.() ?? [])
  },
})

const GLOBAL_STUBS = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': PassthroughTable,
  'el-table-column': true,
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': {
    props: ['label'],
    template: '<div><span>{{ label }}</span><slot /></div>',
  },
  'el-tag': {
    props: ['type'],
    template: '<span class="el-tag-stub" :data-type="type"><slot /></span>',
  },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="el-alert-stub" :data-type="type">{{ title }}<slot /></div>',
  },
  'el-link': { template: '<a><slot /></a>' },
  'el-icon': true,
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function logicPayload(insuranceRuntime: Record<string, unknown>) {
  return {
    data: {
      salary_formula: {},
      leave_deduction_rules: {},
      shift_types: [],
      grade_targets_db: [],
      attendance_policy_db: null,
      insurance_runtime_config: insuranceRuntime,
      engine_runtime_config: {},
      formula_verification: {
        attendance_formulas: [],
        insurance_formulas: [],
        official_checks: [],
        sample_bracket_checks: [],
        official_sources: [],
        runtime_note: '薪資實算以 DB 為權威……',
      },
    },
  }
}

async function mountPanel(insuranceRuntime: Record<string, unknown>) {
  getSalaryLogic.mockResolvedValue(logicPayload(insuranceRuntime))
  const wrapper = mount(SalaryLogicPanel, {
    global: { directives: { loading: {} }, stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return wrapper
}

describe('SalaryLogicPanel — 級距表版本', () => {
  beforeEach(() => {
    getSalaryLogic.mockReset()
  })

  it('來源為 DB 時顯示生效年度與列數，不出現警告', async () => {
    const wrapper = await mountPanel({
      brackets_year: 2026,
      brackets_source: 'db',
      bracket_count: 82,
      labor_rate: 0.125,
    })

    const text = wrapper.text()
    expect(text).toContain('勞健保級距表版本')
    expect(text).toContain('2026 年')
    expect(text).toContain('82 列')
    expect(text).toContain('insurance_brackets')
    expect(text).not.toContain('程式內建')
  })

  it('來源為程式內建時必須紅字警告（DB 漏 seed 的故障指紋）', async () => {
    const wrapper = await mountPanel({
      brackets_year: 2026,
      brackets_source: 'builtin',
      bracket_count: 82,
      labor_rate: 0.125,
    })

    const text = wrapper.text()
    expect(text).toContain('程式內建')
    // 警示語氣，而非與正常來源同樣的中性標示
    const tags = wrapper.findAll('.el-tag-stub')
    const dangerTag = tags.find(t => t.attributes('data-type') === 'danger')
    expect(dangerTag).toBeTruthy()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks（先 mock 再 import view）────────────────────
vi.mock('@/api/appraisal', () => ({
  getAppraisalCyclesByYear: vi.fn(),
  createAppraisalCycle: vi.fn(),
  patchAppraisalCycle: vi.fn(),
}))

// ── academic util mock：固定當前學年度 114 ─────────────────
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 114, semester: 1 }),
  buildSchoolYearOptions: (current, range = 5) => {
    const arr = []
    for (let i = -range; i <= range; i++) arr.push(current + i)
    return arr.sort((a, b) => b - a)
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

import {
  getAppraisalCyclesByYear,
  createAppraisalCycle,
} from '@/api/appraisal'

import YearlyEnrollmentTargetSection from '../YearlyEnrollmentTargetSection.vue'

// ── Element Plus 元件 stubs ───────────────────────────────
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      { ...dataAttrs, onClick: () => emit('click') },
      slots.default?.(),
    )
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-select': {
    template: '<select><slot /></select>',
  },
  'el-option': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span />' },
  'el-empty': {
    template: '<div data-test-stub="el-empty"><slot /></div>',
  },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
}

const FIRST_CYCLE = {
  id: 12,
  academic_year: 114,
  semester: 'FIRST',
  start_date: '2025-08-01',
  end_date: '2026-01-31',
  base_score_calc_date: '2025-09-15',
  base_score: '90.00',
  enrollment_target: 100,
  enrollment_actual: 92,
  status: 'OPEN',
}

const SECOND_CYCLE = {
  id: 13,
  academic_year: 114,
  semester: 'SECOND',
  start_date: '2026-02-01',
  end_date: '2026-07-31',
  base_score_calc_date: '2026-03-15',
  base_score: '90.00',
  enrollment_target: 110,
  enrollment_actual: null,
  status: 'OPEN',
}

async function mountView() {
  const wrapper = mount(YearlyEnrollmentTargetSection, {
    global: {
      stubs: GLOBAL_STUBS,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

describe('YearlyEnrollmentTargetSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('兩學期都有 cycle 時兩張卡都渲染目標人數', async () => {
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="card-first"]').text()).toContain('100')
    expect(wrapper.find('[data-test="card-second"]').text()).toContain('110')
    // 兩張都不該顯示 create 按鈕（已建立）
    expect(wrapper.find('[data-test="create-first-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="create-second-btn"]').exists()).toBe(false)
    // 兩張應該都有編輯按鈕
    expect(wrapper.find('[data-test="edit-first-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-second-btn"]').exists()).toBe(true)
  })

  it('缺一學期 cycle 時 placeholder 顯示「建立本學期週期」按鈕', async () => {
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE] })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="edit-first-btn"]').exists()).toBe(true)
    // 下學期沒 cycle → 顯示 create 按鈕
    expect(wrapper.find('[data-test="create-second-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-second-btn"]').exists()).toBe(false)
  })

  it('點 placeholder 建立 → 呼叫 createAppraisalCycle（日期不再由前端計算送出，交由後端推算）', async () => {
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE] })
    createAppraisalCycle.mockResolvedValue({ data: SECOND_CYCLE })

    const wrapper = await mountView()
    await wrapper.find('[data-test="create-second-btn"]').trigger('click')
    await flushPromises()

    expect(createAppraisalCycle).toHaveBeenCalledTimes(1)
    const arg = createAppraisalCycle.mock.calls[0][0]
    expect(arg).toMatchObject({
      academic_year: 114,
      semester: 'SECOND',
    })
    expect(arg).not.toHaveProperty('start_date')
    expect(arg).not.toHaveProperty('end_date')
    expect(arg).not.toHaveProperty('base_score_calc_date')
  })
})

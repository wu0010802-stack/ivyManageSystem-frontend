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

// Task A7：CreateCycleDialog（經 useCreateCycle）需要 academicTerm store 帶當前學年學期。
const termState = { school_year: 114, semester: 1 }
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    get school_year() { return termState.school_year },
    get semester() { return termState.semester },
  }),
}))

// Task A7：canCreateCycle 對齊 APPRAISAL_FINALIZE（傳給共用 CreateCycleDialog 的 canWrite）
const permState = { finalize: true }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn((p) => p === 'APPRAISAL_FINALIZE' && permState.finalize),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

// Task B4：目標人數修改改走共用 confirmWithReason（確認＋原因）；mock 掉以獨立驗證
// saveEdit() 有呼叫它、以及取消時（回傳 null）不送 PATCH。
const confirmWithReasonMock = vi.fn()
vi.mock('../confirmWithReason', () => ({
  confirmWithReason: (...args) => confirmWithReasonMock(...args),
  RULE_CHANGE_REASON_TEMPLATES: ['年度政策調整', '主管裁示', '校正錯誤設定', '配合法規更新'],
}))

import {
  getAppraisalCyclesByYear,
  createAppraisalCycle,
  patchAppraisalCycle,
} from '@/api/appraisal'

import YearlyEnrollmentTargetSection from '../YearlyEnrollmentTargetSection.vue'

// ── Element Plus 元件 stubs ───────────────────────────────
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

// Task B4：編輯按鈕改用 el-tooltip 包 disabled span（比照 CreateCycleDialog.spec.ts stub）
const ElTooltipStub = defineComponent({
  name: 'ElTooltipStub',
  props: ['content', 'disabled'],
  inheritAttrs: false,
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-tooltip-stub', 'data-content': props.content, 'data-disabled': String(!!props.disabled) },
      slots.default?.(),
    )
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-tooltip': ElTooltipStub,
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
  // Task A7：兩顆「建立本學期週期」按鈕改開共用 CreateCycleDialog；實際表單/
  // canWrite gate/送出流程已在 CreateCycleDialog.spec.ts 用真實元件測過，這裡只驗證
  // parent wiring（開關 + canWrite 傳遞 + @created 觸發 reload）。
  CreateCycleDialog: {
    props: ['visible', 'canWrite', 'defaultYear', 'defaultSemester'],
    emits: ['update:visible', 'created'],
    template:
      '<div v-if="visible" data-test="create-cycle-dialog-stub" :data-can-write="canWrite" ' +
      ':data-default-year="defaultYear" :data-default-semester="defaultSemester">' +
      '<button data-test="create-cycle-dialog-stub-created-btn" ' +
      '@click="$emit(\'created\', { id: 12, academic_year: 114, semester: \'SECOND\' })" />' +
      '</div>',
  },
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
    termState.school_year = 114
    termState.semester = 1
    permState.finalize = true
    confirmWithReasonMock.mockReset().mockResolvedValue('年度政策調整：目標人數校正')
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

  it('Task A7：點 placeholder 建立 → 開啟統一 CreateCycleDialog（不再直接呼叫 API/自算日期）', async () => {
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE] })

    const wrapper = await mountView()
    expect(wrapper.find('[data-test="create-cycle-dialog-stub"]').exists()).toBe(false)
    await wrapper.find('[data-test="create-second-btn"]').trigger('click')
    await flushPromises()

    const dialogStub = wrapper.find('[data-test="create-cycle-dialog-stub"]')
    expect(dialogStub.exists()).toBe(true)
    expect(dialogStub.attributes('data-can-write')).toBe('true')
    expect(createAppraisalCycle).not.toHaveBeenCalled()
  })

  it('Task A7：canWrite 反映 hasPermission(APPRAISAL_FINALIZE)（矩陣：false 態）', async () => {
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE] })
    permState.finalize = false

    const wrapper = await mountView()
    await wrapper.find('[data-test="create-second-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="create-cycle-dialog-stub"]').attributes('data-can-write')).toBe('false')
  })

  it('Task A7 fix：點上學期卡建立 → default-year 用 selectedYear、default-semester 為 FIRST（非 termStore 值）', async () => {
    // cycles 只有 SECOND_CYCLE → 上學期卡顯示「建立」按鈕。
    getAppraisalCyclesByYear.mockResolvedValue({ data: [SECOND_CYCLE] })
    // termStore 刻意設為與 selectedYear(114，來自 getCurrentAcademicTerm mock)及
    // 點擊卡片語意(FIRST)皆不同的值，用來抓回歸：bug 版會把 dialog 重置為
    // termStore 的 113/SECOND，與畫面上下文（114 學年度／上學期卡）不符。
    termState.school_year = 113
    termState.semester = 2 // SECOND

    const wrapper = await mountView()
    await wrapper.find('[data-test="create-first-btn"]').trigger('click')
    await flushPromises()

    const dialogStub = wrapper.find('[data-test="create-cycle-dialog-stub"]')
    expect(dialogStub.attributes('data-default-year')).toBe('114')
    expect(dialogStub.attributes('data-default-semester')).toBe('FIRST')
  })

  it('Task A7 fix：點下學期卡建立 → default-year 用 selectedYear、default-semester 為 SECOND（非 termStore 值）', async () => {
    // cycles 只有 FIRST_CYCLE → 下學期卡顯示「建立」按鈕。
    getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE] })
    termState.school_year = 113
    termState.semester = 1 // FIRST

    const wrapper = await mountView()
    await wrapper.find('[data-test="create-second-btn"]').trigger('click')
    await flushPromises()

    const dialogStub = wrapper.find('[data-test="create-cycle-dialog-stub"]')
    expect(dialogStub.attributes('data-default-year')).toBe('114')
    expect(dialogStub.attributes('data-default-semester')).toBe('SECOND')
  })

  it('Task A7：CreateCycleDialog emit created 後 reload 清單', async () => {
    getAppraisalCyclesByYear.mockResolvedValueOnce({ data: [FIRST_CYCLE] })
    const wrapper = await mountView()
    await wrapper.find('[data-test="create-second-btn"]').trigger('click')
    await flushPromises()

    getAppraisalCyclesByYear.mockResolvedValueOnce({ data: [FIRST_CYCLE, SECOND_CYCLE] })
    await wrapper.find('[data-test="create-cycle-dialog-stub-created-btn"]').trigger('click')
    await flushPromises()

    expect(getAppraisalCyclesByYear).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="card-second"]').text()).toContain('110')
  })

  // Task B4：目標人數修改（PATCH /appraisal/cycles/{id}）補權限 gate + 確認＋原因，
  // 對齊後端 update_cycle 守衛（Permission.APPRAISAL_FINALIZE，同 CreateCycleDialog）。
  describe('Task B4：目標人數編輯權限 gate（矩陣：APPRAISAL_FINALIZE true/false）', () => {
    it('canEditTarget=true：編輯按鈕可用', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      permState.finalize = true

      const wrapper = await mountView()

      const btn = wrapper.find('[data-test="edit-first-btn"]')
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('disabled')).toBeUndefined()
    })

    it('canEditTarget=false：編輯按鈕 disabled', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      permState.finalize = false

      const wrapper = await mountView()

      const btn = wrapper.find('[data-test="edit-first-btn"]')
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('canEditTarget=false：直接呼叫 startEdit() 也不進入編輯模式（防止繞過 disabled）', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      permState.finalize = false

      const wrapper = await mountView()
      wrapper.vm.startEdit(FIRST_CYCLE)
      await flushPromises()

      expect(wrapper.find('[data-test="edit-first-target"]').exists()).toBe(false)
    })

    it('canEditTarget=false：直接呼叫 saveEdit() 也不送出（防止繞過 disabled）', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      permState.finalize = false

      const wrapper = await mountView()
      await wrapper.vm.saveEdit(FIRST_CYCLE)
      await flushPromises()

      expect(confirmWithReasonMock).not.toHaveBeenCalled()
      expect(patchAppraisalCycle).not.toHaveBeenCalled()
    })
  })

  describe('Task B4：儲存目標人數前 confirmWithReason 確認＋原因', () => {
    it('點編輯 → 改目標人數 → 點儲存：先呼叫 confirmWithReason，確認後才送 PATCH', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      patchAppraisalCycle.mockResolvedValue({ data: { ...FIRST_CYCLE, enrollment_target: 120 } })

      const wrapper = await mountView()
      await wrapper.find('[data-test="edit-first-btn"]').trigger('click')
      await flushPromises()

      // el-input-number stub 未接 v-model 事件，直接改內部 reactive state
      // （比照本 repo 其餘 script-setup 元件測試慣例，經 wrapper.vm 存取）。
      wrapper.vm.editForm.FIRST.enrollment_target = 120
      await flushPromises()
      await wrapper.find('[data-test="save-first-btn"]').trigger('click')
      await flushPromises()

      expect(confirmWithReasonMock).toHaveBeenCalledTimes(1)
      const opts = confirmWithReasonMock.mock.calls[0][0]
      expect(opts.minLength).toBe(10)
      expect(patchAppraisalCycle).toHaveBeenCalledTimes(1)
      expect(patchAppraisalCycle).toHaveBeenCalledWith(
        FIRST_CYCLE.id,
        expect.objectContaining({ enrollment_target: 120 }),
      )
    })

    it('使用者取消原因輸入（confirmWithReason 回 null）→ 不送 PATCH，維持編輯模式', async () => {
      getAppraisalCyclesByYear.mockResolvedValue({ data: [FIRST_CYCLE, SECOND_CYCLE] })
      confirmWithReasonMock.mockResolvedValue(null)

      const wrapper = await mountView()
      await wrapper.find('[data-test="edit-first-btn"]').trigger('click')
      await flushPromises()

      await wrapper.find('[data-test="save-first-btn"]').trigger('click')
      await flushPromises()

      expect(confirmWithReasonMock).toHaveBeenCalledTimes(1)
      expect(patchAppraisalCycle).not.toHaveBeenCalled()
      // 仍在編輯模式（未被 saveEdit 的 editing.value[semester] = false 關閉）
      expect(wrapper.find('[data-test="edit-first-target"]').exists()).toBe(true)
    })
  })
})

/**
 * SPEC-019 §7.1 建批：年級金額 → preview 展開逐生（可改金額／移除）→ 建立。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  previewCashFeeBatch: vi.fn(),
  createCashFeeBatch: vi.fn(() => Promise.resolve({ id: 3, title: '教材費', student_count: 2 })),
}))
vi.mock('@/api/fees', () => apiMocks)
const gradesApi = vi.hoisted(() => ({
  getGrades: vi.fn(() =>
    Promise.resolve({
      data: [
        { id: 1, name: '大班', sort_order: 4 },
        { id: 2, name: '小班', sort_order: 2 },
      ],
    }),
  ),
}))
vi.mock('@/api/classrooms', () => gradesApi)
vi.mock('@/utils/academic', () => ({ getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import CashFeeBatchDialog from '@/components/fees/CashFeeBatchDialog.vue'

const STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': {
    template:
      '<input v-bind="$attrs" :value="$attrs.modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-input-number': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  'el-select': {
    template:
      '<select v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-alert': { props: ['title'], template: '<div v-bind="$attrs">{{ title }}</div>' },
}

describe('CashFeeBatchDialog', () => {
  beforeEach(() => {
    apiMocks.previewCashFeeBatch.mockReset()
    apiMocks.createCashFeeBatch.mockClear()
    apiMocks.previewCashFeeBatch.mockResolvedValue({
      entries: [
        { student_id: 5, student_name: '王小明', classroom_name: '天堂鳥班', grade_name: '大班', amount: 2500 },
        { student_id: 6, student_name: '陳小美', classroom_name: '芙蓉班', grade_name: '小班', amount: 2000 },
      ],
      total_amount: 4500,
      student_count: 2,
    })
  })

  it('載入年級列、填金額後預覽、改金額與移除後建立', async () => {
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    const gradeInputs = w.findAll('[data-test="cfb-grade-amount"]')
    expect(gradeInputs).toHaveLength(2)
    await gradeInputs[0].setValue('2500')
    await gradeInputs[1].setValue('2000')
    await w.find('[data-test="cfb-title"]').setValue('115-1 教材費')
    await w.find('[data-test="cfb-preview"]').trigger('click')
    await flushPromises()
    expect(apiMocks.previewCashFeeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'material',
        school_year: 115,
        semester: 1,
        amounts_by_grade: { 1: 2500, 2: 2000 },
      }),
    )
    const rows = w.findAll('[data-test="cfb-row"]')
    expect(rows).toHaveLength(2)
    await rows[1].find('[data-test="cfb-row-amount"]').setValue('1800')
    await rows[0].find('[data-test="cfb-row-remove"]').trigger('click')
    expect(w.find('[data-test="cfb-total"]').text()).toContain('1,800')
    await w.find('[data-test="cfb-create"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createCashFeeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'material',
        title: '115-1 教材費',
        school_year: 115,
        semester: 1,
        entries: [{ student_id: 6, amount: 1800 }],
      }),
    )
    expect(w.emitted('created')).toBeTruthy()
  })

  it('未預覽或清單為空時不可建立', async () => {
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    expect(w.find('[data-test="cfb-create"]').attributes('disabled')).toBeDefined()
  })
})

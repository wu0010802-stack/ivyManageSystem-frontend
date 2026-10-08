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
const authMocks = vi.hoisted(() => ({ studentRead: true }))
vi.mock('@/utils/auth', () => ({ hasPermission: (name: string) => name !== 'STUDENTS_READ' || authMocks.studentRead }))
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
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) } }))

vi.mock('@/components/fees/StudentPickerDialog.vue', () => ({ default: { name: 'StudentPickerDialog', template: '<div />', emits: ['pick'] } }))

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
    authMocks.studentRead = true
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
    await w.find('[data-test="cfb-mode"]').setValue('grade')
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
  it('承接選定學期，選學生後必須填正金額才可建立', async () => {
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true, schoolYear: 114, semester: 2 }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="cfb-title"]').setValue('耗材費')
    w.findComponent({ name: 'StudentPickerDialog' }).vm.$emit('pick', { id: 8, name: '測試學生' })
    await flushPromises()
    expect(w.find('[data-test="cfb-create"]').attributes('disabled')).toBeDefined()
    await w.find('[data-test="cfb-row-amount"]').setValue('100')
    await w.find('[data-test="cfb-create"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createCashFeeBatch).toHaveBeenCalledWith(expect.objectContaining({ school_year: 114, semester: 2, entries: [{ student_id: 8, amount: 100 }] }))
  })

  it('關閉後回來的預覽不能填回重新開啟的表單', async () => {
    let resolvePreview!: (value: unknown) => void
    apiMocks.previewCashFeeBatch.mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve }))
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="cfb-mode"]').setValue('grade')
    await w.find('[data-test="cfb-grade-amount"]').setValue('100')
    await w.find('[data-test="cfb-preview"]').trigger('click')
    await w.setProps({ modelValue: false })
    await w.setProps({ modelValue: true })
    resolvePreview({ entries: [{ student_id: 8, student_name: '測試學生', amount: 100 }] })
    await flushPromises()
    expect(w.findAll('[data-test="cfb-row"]')).toHaveLength(0)
  })

  it('年級金額改動保留人工名單並禁止建立，重新帶入後恢復', async () => {
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="cfb-mode"]').setValue('grade')
    await w.find('[data-test="cfb-title"]').setValue('耗材費')
    await w.find('[data-test="cfb-grade-amount"]').setValue('100')
    await w.find('[data-test="cfb-preview"]').trigger('click')
    await flushPromises()
    await w.find('[data-test="cfb-row-amount"]').setValue('120')
    await w.find('[data-test="cfb-grade-amount"]').setValue('200')
    expect(w.findAll('[data-test="cfb-row"]')).toHaveLength(2)
    expect(w.find('[data-test="cfb-create"]').attributes('disabled')).toBeDefined()
    await w.find('[data-test="cfb-preview"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="cfb-create"]').attributes('disabled')).toBeUndefined()
  })

  it('小數、負值與非有限金額均不可建立', async () => {
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="cfb-title"]').setValue('耗材費')
    w.findComponent({ name: 'StudentPickerDialog' }).vm.$emit('pick', { id: 8, name: '測試學生', classroom_name: '測試班' })
    await flushPromises()
    expect(w.find('[data-test="cfb-row"]').text()).toContain('測試班')
    for (const amount of ['1.5', '-1', '0']) {
      await w.find('[data-test="cfb-row-amount"]').setValue(amount)
      expect(w.find('[data-test="cfb-create"]').attributes('disabled')).toBeDefined()
    }
  })

  it('沒有學生檢視權限時仍能依年級帶入，且不掛載學生搜尋', async () => {
    authMocks.studentRead = false
    const w = mount(CashFeeBatchDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    expect(w.findComponent({ name: 'StudentPickerDialog' }).exists()).toBe(false)
    expect(w.find('[data-test="cfb-pick"]').exists()).toBe(false)
    expect(w.text()).toContain('指定學生需具備學生檢視權限')
    await w.find('[data-test="cfb-grade-amount"]').setValue('100')
    await w.find('[data-test="cfb-preview"]').trigger('click')
    await flushPromises()
    expect(apiMocks.previewCashFeeBatch).toHaveBeenCalled()
    expect(w.findAll('[data-test="cfb-row"]')).toHaveLength(2)
  })

})

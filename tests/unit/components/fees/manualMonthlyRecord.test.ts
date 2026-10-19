import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { validateManualMonthly } from '@/components/fees/manualMonthlyRecord'
import ManualMonthlyRecordDialog from '@/components/fees/ManualMonthlyRecordDialog.vue'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getStudents: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}))
vi.mock('@/api/fees', () => ({ createManualMonthlyRecord: mocks.create }))
vi.mock('@/api/students', () => ({ getStudents: mocks.getStudents }))
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, success: mocks.success } }))

const valid = { student_id: 7, target_month: '2026-10', amount_due: 5000, reason: '中途轉入補建本月月費' }

describe('validateManualMonthly', () => {
  it('合法 → null', () => {
    expect(validateManualMonthly(valid)).toBeNull()
  })
  it('未選學生', () => {
    expect(validateManualMonthly({ ...valid, student_id: null })).toBe('請選擇學生')
  })
  it.each([0, -1, 0.5, undefined])('金額 %s → 金額需大於 0', (amount) => {
    expect(validateManualMonthly({ ...valid, amount_due: amount as number })).toBe('金額需大於 0')
  })
  it('原因 9 字 → 原因至少 10 字', () => {
    expect(validateManualMonthly({ ...valid, reason: '一二三四五六七八九' })).toBe('原因至少 10 字')
  })
  it('原因前後空白不算字數', () => {
    expect(validateManualMonthly({ ...valid, reason: '  一二三四五六七八九  ' })).toBe('原因至少 10 字')
  })
  it('原因超過 200 字', () => {
    expect(validateManualMonthly({ ...valid, reason: '字'.repeat(201) })).toBe('原因至多 200 字')
  })
  it.each(['2026-1', '202610', '2026-13', '2026-00', ''])('月份 %s 格式錯', (m) => {
    expect(validateManualMonthly({ ...valid, target_month: m })).toBe('月份格式需為 YYYY-MM')
  })
})

function render() {
  return mount(ManualMonthlyRecordDialog, {
    props: {
      modelValue: true,
      month: '2026-10',
      classroomName: '向日葵班',
      classroomId: 3,
      statementStudents: [{ id: 7, name: '小明' }],
    },
    global: {
      stubs: {
        FormDialog: { template: '<div><slot/><slot name="footer"/></div>' },
        'el-form': { template: '<form @submit.prevent><slot/></form>' },
        'el-form-item': { template: '<div><slot/></div>' },
        'el-select': { props: ['modelValue'], template: '<div data-test="mm-student"><slot/></div>' },
        'el-option': { template: '<i/>' },
        'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        'el-input-number': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />' },
        'el-date-picker': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        'el-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot/></button>' },
        StudentPickerDialog: { template: '<div/>' },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStudents.mockResolvedValue({ data: { items: [] } })
})

describe('ManualMonthlyRecordDialog', () => {
  it('409 MONTHLY_RECORD_EXISTS → 顯示「此學生該月已有月費單」且不關閉', async () => {
    mocks.create.mockRejectedValue({
      response: { status: 409, data: { detail: { code: 'MONTHLY_RECORD_EXISTS', message: 'x' } } },
    })
    const wrapper = render()
    ;(wrapper.vm as unknown as { form: Record<string, unknown> }).form.student_id = 7
    await wrapper.get('[data-test="mm-amount"]').setValue('5000')
    await wrapper.get('[data-test="mm-reason"]').setValue('中途轉入補建本月月費')
    await wrapper.get('[data-test="mm-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({
      student_id: 7, target_month: '2026-10', amount_due: 5000, reason: '中途轉入補建本月月費',
    })
    expect(mocks.error).toHaveBeenCalledWith('此學生該月已有月費單')
    expect(wrapper.emitted('created')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('成功 → emit created 並關閉', async () => {
    mocks.create.mockResolvedValue({ data: { id: 1 } })
    const wrapper = render()
    ;(wrapper.vm as unknown as { form: Record<string, unknown> }).form.student_id = 7
    await wrapper.get('[data-test="mm-amount"]').setValue('5000')
    await wrapper.get('[data-test="mm-reason"]').setValue('中途轉入補建本月月費')
    await wrapper.get('[data-test="mm-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('created')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})

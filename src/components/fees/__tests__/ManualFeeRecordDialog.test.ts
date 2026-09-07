import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ManualFeeRecordDialog from '../ManualFeeRecordDialog.vue'

const mocks = vi.hoisted(() => ({ create: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('@/api/fees', () => ({ createManualFeeRecord: mocks.create }))
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, success: mocks.success } }))

function render() {
  return mount(ManualFeeRecordDialog, {
    props: { modelValue: true },
    global: { stubs: {
      'el-dialog': { props: ['modelValue', 'closeOnClickModal', 'closeOnPressEscape', 'showClose'], template: '<div><slot/><slot name="footer"/></div>' },
      'el-form': { template: '<form @submit.prevent><slot/></form>' },
      'el-form-item': { template: '<div><slot/></div>' },
      'el-input': { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      'el-input-number': { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', Number($event.target.value))" />' },
      'el-date-picker': { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      'el-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot/></button>' },
      StudentPickerDialog: { name: 'StudentPickerDialog', props: ['modelValue'], emits: ['pick'], template: '<div/>' },
    } },
  })
}
async function fill(wrapper: ReturnType<typeof render>) {
  wrapper.findComponent({ name: 'StudentPickerDialog' }).vm.$emit('pick', { id: 7, name: '測試學生', classroom_name: '測試班' })
  await wrapper.get('[data-test="manual-fee-name"]').setValue(' 衣服 ')
  await wrapper.get('[data-test="manual-fee-amount"]').setValue('350')
  await wrapper.get('[data-test="manual-fee-date"]').setValue('2026-09-07')
}
beforeEach(() => vi.clearAllMocks())

describe('單筆費用補登', () => {
  it('指定學生與合法金額才可送出，成功送出trim欄位並關閉', async () => {
    const record = { id: 1, student_id: 7, student_name: '測試學生', period: '115-1' }
    mocks.create.mockResolvedValue({ data: record })
    const wrapper = render()
    expect(wrapper.get('[data-test="manual-fee-submit"]').attributes('disabled')).toBeDefined()
    await fill(wrapper)
    await wrapper.get('[data-test="manual-fee-notes"]').setValue(' 制服追加 ')
    await wrapper.get('[data-test="manual-fee-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({ student_id: 7, fee_item_name: '衣服', amount_due: 350, billing_start_date: '2026-09-07', due_date: null, notes: '制服追加' })
    expect(wrapper.emitted('created')).toEqual([[record]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it.each([0, -1, 0.5, 1000000])('拒絕非法金額 %s', async (amount) => {
    const wrapper = render()
    await fill(wrapper)
    await wrapper.get('[data-test="manual-fee-amount"]').setValue(String(amount))
    expect(wrapper.get('[data-test="manual-fee-submit"]').attributes('disabled')).toBeDefined()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('拒絕空白名稱、無效日期與早於收費日期的期限', async () => {
    const wrapper = render()
    await fill(wrapper)
    for (const [field, value] of [['name', ' '], ['date', '2026-02-30'], ['due-date', '2026-09-06']]) {
      await fill(wrapper)
      await wrapper.get(`[data-test="manual-fee-${field}"]`).setValue(value)
      expect(wrapper.get('[data-test="manual-fee-submit"]').attributes('disabled')).toBeDefined()
    }
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('送出期間鎖定欄位與關閉，連點只送一次；失敗保留內容', async () => {
    let reject!: (error: Error) => void
    mocks.create.mockReturnValue(new Promise((_, rejectPromise) => { reject = rejectPromise }))
    const wrapper = render()
    await fill(wrapper)
    await wrapper.get('[data-test="manual-fee-submit"]').trigger('click')
    await wrapper.get('[data-test="manual-fee-submit"]').trigger('click')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="manual-fee-name"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="manual-fee-cancel"]').attributes('disabled')).toBeDefined()
    reject(new Error('暫時無法建立'))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((wrapper.get('[data-test="manual-fee-name"]').element as HTMLInputElement).value).toBe(' 衣服 ')
    expect(mocks.error).toHaveBeenCalled()
  })
})

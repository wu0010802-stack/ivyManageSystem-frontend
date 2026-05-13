import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/fees', () => ({
  suggestRefund: vi.fn(),
  refundFeeRecord: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

import { suggestRefund, refundFeeRecord } from '@/api/fees'
import RefundSuggestModal from '@/components/fees/RefundSuggestModal.vue'

const stubs = {
  ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElDatePicker: { template: '<input />' },
  ElInputNumber: { template: '<input />' },
  ElInput: { template: '<input />' },
  // 不接收 fallthrough attrs（避免 disabled 屬性直接傳到原生 <button>，導致 click 被瀏覽器/jsdom 吃掉）
  ElButton: {
    inheritAttrs: false,
    emits: ['click'],
    template: '<button type="button" @click.stop="$emit(\'click\')"><slot /></button>',
  },
  // title 是 prop 不是 slot；測試需要看到 title 文字
  ElAlert: {
    inheritAttrs: false,
    props: ['title'],
    template: '<div>{{ title }}<slot /></div>',
  },
}

describe('RefundSuggestModal', () => {
  beforeEach(() => vi.resetAllMocks())

  it('material 類型顯示阻擋訊息', () => {
    const wrapper = mount(RefundSuggestModal, {
      props: {
        modelValue: true,
        record: { id: 1, fee_type: 'material', amount_due: 2000, amount_paid: 2000 },
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('代購品依規定不予退費')
  })

  it('註冊費點自動計算後 suggestRefund 被呼叫', async () => {
    suggestRefund.mockResolvedValue({
      suggested_amount: 12667, calc_method: 'enrollment_ratio',
      calc_payload: { formula: '19000 × 2/3 = 12667' }, warnings: [],
    })
    const wrapper = mount(RefundSuggestModal, {
      props: {
        modelValue: true,
        record: { id: 5, fee_type: 'registration', amount_due: 19000, amount_paid: 19000 },
      },
      global: { stubs },
    })
    wrapper.vm.form.withdrawal_date = new Date('2025-09-15')
    await nextTick()
    const buttons = wrapper.findAll('button')
    // 第一個 button 是「自動計算建議」
    await buttons[0].trigger('click')
    await nextTick()
    await nextTick()
    expect(suggestRefund).toHaveBeenCalledWith(5, expect.objectContaining({
      withdrawal_date: '2025-09-15',
    }))
  })

  it('confirm 帶 calc_method/calc_payload 給 refundFeeRecord', async () => {
    refundFeeRecord.mockResolvedValue({})
    const wrapper = mount(RefundSuggestModal, {
      props: {
        modelValue: true,
        record: { id: 5, fee_type: 'registration', amount_due: 19000, amount_paid: 19000 },
      },
      global: { stubs },
    })
    wrapper.vm.suggestion = {
      calc_method: 'enrollment_ratio',
      calc_payload: { ratio: '<1/3' },
      suggested_amount: 12667,
    }
    wrapper.vm.form.amount = 12667
    wrapper.vm.form.reason = '中途離園'
    await nextTick()
    const buttons = wrapper.findAll('button')
    // 最後一個 button 是 footer 確認退費
    await buttons[buttons.length - 1].trigger('click')
    await nextTick()
    await nextTick()
    expect(refundFeeRecord).toHaveBeenCalledWith(5, expect.objectContaining({
      calc_method: 'enrollment_ratio',
      calc_payload: { ratio: '<1/3' },
    }))
  })
})

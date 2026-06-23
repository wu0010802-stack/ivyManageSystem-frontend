/**
 * RegistrationPaymentDialog —— 兩個 P3 修補（2026-06-23 audit）：
 *
 * 1) 付款摘要「已繳清」第三態：paidAmount === totalAmount 時，原本三元判斷落入
 *    else 顯示「尚欠 NT$0」（已繳清卻顯示欠費）。補第三態「已繳清」。
 *
 * 2) 退費金額前端上限守衛：handleSubmit 原本只擋 amount<=0，未擋
 *    amount > paidAmount（僅靠 el-input-number 軟 clamp，貼上/程式化輸入可繞），
 *    送出後才被後端 422。對齊 POS canSubmit 的顯式守衛。
 *
 * 本檔自帶可 v-model 的 amount/notes stub（既有 RegistrationPaymentDialog.test.js
 * 的 amount stub 不支援 v-model，無法設定超額金額）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const addRegistrationPayment = vi.fn()
vi.mock('@/api/activity', () => ({
  addRegistrationPayment: (...a) => addRegistrationPayment(...a),
}))

const ElMessageWarning = vi.fn()
const ElMessageSuccess = vi.fn()
const ElMessageError = vi.fn()
const ElMessageBoxConfirm = vi.fn()
vi.mock('element-plus', () => ({
  ElMessage: {
    warning: (...a) => ElMessageWarning(...a),
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
  },
  ElMessageBox: {
    confirm: (...a) => ElMessageBoxConfirm(...a),
  },
}))

import RegistrationPaymentDialog from '@/components/activity/RegistrationPaymentDialog.vue'

const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  // 可 v-model 的金額輸入，供設定超額退費金額
  'el-input-number': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input class="amount" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  'el-date-picker': { template: '<input class="date" />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea class="notes" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
  },
  'el-alert': true,
  'el-button': {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
}

async function mountDialog(props = {}) {
  const wrapper = mount(RegistrationPaymentDialog, {
    props: {
      modelValue: false,
      registrationId: 1,
      totalAmount: 1000,
      paidAmount: 500,
      ...props,
    },
    global: { stubs: STUBS },
  })
  await wrapper.setProps({ modelValue: true })
  await nextTick()
  return wrapper
}

function submitButton(wrapper) {
  return wrapper.findAll('button').at(-1)
}

describe('RegistrationPaymentDialog 付款摘要第三態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addRegistrationPayment.mockResolvedValue({ data: {} })
    ElMessageBoxConfirm.mockResolvedValue(true)
  })

  it('已繳清（paidAmount === totalAmount）顯示「已繳清」而非「尚欠 NT$0」', async () => {
    const wrapper = await mountDialog({ totalAmount: 1000, paidAmount: 1000 })
    const text = wrapper.text()
    expect(text).toContain('已繳清')
    expect(text).not.toContain('尚欠')
  })

  it('未繳清仍顯示「尚欠」金額', async () => {
    const wrapper = await mountDialog({ totalAmount: 1000, paidAmount: 500 })
    const text = wrapper.text()
    expect(text).toContain('尚欠')
    expect(text).not.toContain('已繳清')
  })

  it('超繳（paidAmount > totalAmount）顯示「超繳」金額', async () => {
    const wrapper = await mountDialog({ totalAmount: 1000, paidAmount: 1200 })
    const text = wrapper.text()
    expect(text).toContain('超繳')
    expect(text).not.toContain('已繳清')
  })
})

describe('RegistrationPaymentDialog 退費金額上限守衛', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addRegistrationPayment.mockResolvedValue({ data: {} })
    ElMessageBoxConfirm.mockResolvedValue(true)
  })

  it('退費金額 > 已繳 → 顯示警告、不打 API（即使原因合法）', async () => {
    const wrapper = await mountDialog({ type: 'refund', paidAmount: 500 })
    // 原因填合法（≥15 字），確保 reason guard 放行，單獨驗證 cap guard
    await wrapper
      .find('.notes')
      .setValue('家長申請退費因課程衝堂無法參加共識退費')
    // 把金額改成超過已繳（500）的 600（模擬貼上/程式化輸入繞過軟 clamp）
    await wrapper.find('.amount').setValue('600')
    await submitButton(wrapper).trigger('click')
    await nextTick()

    expect(ElMessageWarning).toHaveBeenCalled()
    expect(addRegistrationPayment).not.toHaveBeenCalled()
  })

  it('退費金額 == 已繳 → 通過（全額退費合法）', async () => {
    const wrapper = await mountDialog({ type: 'refund', paidAmount: 500 })
    await wrapper
      .find('.notes')
      .setValue('家長申請退費因課程衝堂無法參加共識退費')
    await wrapper.find('.amount').setValue('500')
    await submitButton(wrapper).trigger('click')
    await nextTick()
    await nextTick()

    expect(addRegistrationPayment).toHaveBeenCalledTimes(1)
    expect(addRegistrationPayment.mock.calls[0][1].amount).toBe(500)
  })
})

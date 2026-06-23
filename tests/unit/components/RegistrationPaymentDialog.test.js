import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── API mock ─────────────────────────────────────────────────────────────────
const addRegistrationPayment = vi.fn()
vi.mock('@/api/activity', () => ({
  addRegistrationPayment: (...a) => addRegistrationPayment(...a),
}))

// ── element-plus mock ────────────────────────────────────────────────────────
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

// 只有「備註 / 退費原因」是 el-input；其餘為 el-input-number / el-date-picker /
// el-select，故 el-input stub 唯一對應 notes 欄位，支援 v-model 以便 setValue。
const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input-number': { template: '<input class="amount" />' },
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
  // 宣告 emits:['click']，避免父層 @click 同時走原生 fallthrough + 元件事件而觸發兩次。
  'el-button': {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
}

async function mountDialog(props = {}) {
  // watch 非 immediate：須由 false→true 觸發才會初始化 form（amount/date）。
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
  // footer 兩顆按鈕：取消、確認送出
  return wrapper.findAll('button').at(-1)
}

describe('RegistrationPaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addRegistrationPayment.mockResolvedValue({ data: {} })
    ElMessageBoxConfirm.mockResolvedValue(true)
  })

  it('退費：原因 < 15 字 → 顯示警告、不打 API（後端 AddPaymentRequest 退費硬限 15 字）', async () => {
    const wrapper = await mountDialog({ type: 'refund' })
    // 預設 notes='' (< 15)
    await submitButton(wrapper).trigger('click')
    await nextTick()

    expect(ElMessageWarning).toHaveBeenCalled()
    expect(addRegistrationPayment).not.toHaveBeenCalled()
  })

  it('退費：原因 5-14 字 → 仍顯示警告、不打 API（過去誤過前端被後端 422）', async () => {
    const wrapper = await mountDialog({ type: 'refund' })
    await wrapper.find('.notes').setValue('一二三四五六七八') // 8 字
    await submitButton(wrapper).trigger('click')
    await nextTick()

    expect(ElMessageWarning).toHaveBeenCalled()
    expect(addRegistrationPayment).not.toHaveBeenCalled()
  })

  it('退費：原因 ≥ 15 字 → 通過驗證並打 API', async () => {
    const wrapper = await mountDialog({ type: 'refund' })
    await wrapper.find('.notes').setValue('家長申請退費因課程衝堂無法參加共識退費') // ≥15 字
    await submitButton(wrapper).trigger('click')
    await nextTick()
    await nextTick()

    expect(addRegistrationPayment).toHaveBeenCalledTimes(1)
    const [, body] = addRegistrationPayment.mock.calls[0]
    expect(body.type).toBe('refund')
    expect(body.notes.length).toBeGreaterThanOrEqual(15)
  })

  it('繳費：不要求退費原因，空備註也能送出', async () => {
    const wrapper = await mountDialog({ type: 'payment' })
    await submitButton(wrapper).trigger('click')
    await nextTick()
    await nextTick()

    expect(ElMessageWarning).not.toHaveBeenCalled()
    expect(addRegistrationPayment).toHaveBeenCalledTimes(1)
    expect(addRegistrationPayment.mock.calls[0][1].type).toBe('payment')
  })
})

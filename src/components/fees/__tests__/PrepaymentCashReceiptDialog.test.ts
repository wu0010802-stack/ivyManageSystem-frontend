/**
 * SPEC-019 §7.2 新生預繳現金登記：挑學生或招生訪視 → 固定 5,000 → POST /fees/cash-receipts（part=prepayment）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  createCashReceipt: vi.fn(() =>
    Promise.resolve({ receipt_id: 1, allocation_ids: [], idempotent_replay: false }),
  ),
}))
vi.mock('@/api/fees', () => apiMocks)
const recruitApi = vi.hoisted(() => ({
  getRecruitmentRecords: vi.fn(() =>
    Promise.resolve({ data: { records: [{ id: 77, child_name: '新生甲', has_deposit: false }] } }),
  ),
}))
vi.mock('@/api/recruitment', () => recruitApi)
vi.mock('@/utils/format', () => ({ todayISO: () => '2026-06-10' }))
vi.mock('@/utils/academic', () => ({ getCurrentAcademicTerm: () => ({ school_year: 114, semester: 2 }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/fees/StudentPickerDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'StudentPickerDialog',
    props: { modelValue: Boolean },
    emits: ['update:modelValue', 'pick'],
    template: '<div v-if="modelValue" data-testid="picker" />',
  },
}))

import PrepaymentCashReceiptDialog from '@/components/fees/PrepaymentCashReceiptDialog.vue'

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
  'el-radio-group': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-radio-button': {
    props: ['value', 'label'],
    template:
      '<button type="button" :data-value="value" @click="$parent.$emit(\'update:modelValue\', value)"><slot /></button>',
  },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-select': {
    template:
      '<select v-bind="$attrs" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
  },
  'el-option': { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
}

describe('PrepaymentCashReceiptDialog', () => {
  beforeEach(() => apiMocks.createCashReceipt.mockClear())

  it('挑學生後送出 part=prepayment、amount=5000、目標學期預設下一學期', async () => {
    const w = mount(PrepaymentCashReceiptDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="ppd-pick-student"]').trigger('click')
    w.findComponent({ name: 'StudentPickerDialog' }).vm.$emit('pick', {
      id: 5,
      name: '王小明',
      classroom_name: null,
    })
    await flushPromises()
    expect(w.find('[data-test="ppd-target"]').text()).toContain('王小明')
    await w.find('[data-test="ppd-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        received_date: '2026-06-10',
        parts: [{ part_type: 'prepayment', student_id: 5, amount: 5000, target_school_year: 115, target_semester: 1 }],
      }),
    )
    expect(w.emitted('received')).toBeTruthy()
  })

  it('招生訪視模式：關鍵字搜尋後選訪視，送出帶 recruitment_visit_id', async () => {
    const w = mount(PrepaymentCashReceiptDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    await w.find('[data-test="ppd-mode-visit"]').trigger('click')
    await w.find('[data-test="ppd-visit-keyword"]').setValue('新生')
    await w.find('[data-test="ppd-visit-search"]').trigger('click')
    await flushPromises()
    expect(recruitApi.getRecruitmentRecords).toHaveBeenCalledWith(expect.objectContaining({ keyword: '新生' }))
    await w.find('[data-test="ppd-visit-row"] [data-test="ppd-visit-pick"]').trigger('click')
    await w.find('[data-test="ppd-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createCashReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          { part_type: 'prepayment', recruitment_visit_id: 77, amount: 5000, target_school_year: 115, target_semester: 1 },
        ],
      }),
    )
  })

  it('未選對象時不可送出', async () => {
    const w = mount(PrepaymentCashReceiptDialog, { props: { modelValue: true }, global: { stubs: STUBS } })
    await flushPromises()
    expect(w.find('[data-test="ppd-submit"]').attributes('disabled')).toBeDefined()
  })
})

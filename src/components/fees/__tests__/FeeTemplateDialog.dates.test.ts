/**
 * SPEC-015 範本收費日期欄：
 * - 非月費：billing_start_date/overdue_date 成對驗證＋payload 只帶日期組
 * - 月費：payload 帶 monthly_billing_day/monthly_due_day、日期組歸 null
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import FeeTemplateDialog from '@/components/fees/FeeTemplateDialog.vue'

const createFeeTemplate = vi.fn(() => Promise.resolve({}))
const updateFeeTemplate = vi.fn(() => Promise.resolve({}))
vi.mock('@/api/fees', () => ({
  createFeeTemplate: (...args: unknown[]) => createFeeTemplate(...args),
  updateFeeTemplate: (...args: unknown[]) => updateFeeTemplate(...args),
}))

const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null)
  },
})
const ElFormStub = defineComponent({
  setup(_, { slots, expose }) {
    expose({ validate: () => Promise.resolve(true) })
    return () => h('form', {}, slots.default?.())
  },
})

const regTemplate = {
  id: 11, grade_id: 2, school_year: 115, semester: 1, fee_type: 'registration',
  name: '註冊費', amount: 17000, due_date_offset_days: 14,
  billing_start_date: '2026-08-01', overdue_date: '2026-08-15',
}
const monthlyTemplate = {
  id: 12, grade_id: 2, school_year: 115, semester: 1, fee_type: 'monthly',
  name: '月費', amount: 9000, due_date_offset_days: 14,
  monthly_billing_day: 5, monthly_due_day: 10,
  breakdown: { tuition: 5000, meal: 3000, transport: 1000 },
}

type TemplateProp = typeof regTemplate | typeof monthlyTemplate | null

const mountDialog = (template: TemplateProp = null) => mount(FeeTemplateDialog, {
  props: { modelValue: true, template, grades: [{ id: 2, name: '中班' }] },
  global: { stubs: { 'el-dialog': ElDialogStub, 'el-form': ElFormStub } },
})

const saveBtn = (wrapper: ReturnType<typeof mountDialog>) =>
  wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!

describe('FeeTemplateDialog — SPEC-015 收費日期', () => {
  beforeEach(() => vi.clearAllMocks())

  it('非月費編輯：payload 帶日期組、monthly 組為 null', async () => {
    const wrapper = mountDialog(regTemplate)
    await nextTick()
    await saveBtn(wrapper).trigger('click')
    await nextTick(); await Promise.resolve()
    const [, payload] = updateFeeTemplate.mock.calls[0] as [number, Record<string, unknown>]
    expect(payload.billing_start_date).toBe('2026-08-01')
    expect(payload.overdue_date).toBe('2026-08-15')
    expect(payload.monthly_billing_day).toBeNull()
    expect(payload.monthly_due_day).toBeNull()
  })

  it('月費編輯：payload 帶每月幾號組、日期組為 null', async () => {
    const wrapper = mountDialog(monthlyTemplate)
    await nextTick()
    await saveBtn(wrapper).trigger('click')
    await nextTick(); await Promise.resolve()
    const [, payload] = updateFeeTemplate.mock.calls[0] as [number, Record<string, unknown>]
    expect(payload.monthly_billing_day).toBe(5)
    expect(payload.monthly_due_day).toBe(10)
    expect(payload.billing_start_date).toBeNull()
    expect(payload.overdue_date).toBeNull()
  })

  it('非月費日期只填一欄 → 儲存鈕 disabled 並顯示配對錯誤', async () => {
    const wrapper = mountDialog(regTemplate)
    await nextTick()
    const vm = wrapper.vm as unknown as { form: Record<string, unknown> }
    vm.form.overdue_date = null
    await nextTick()
    expect(saveBtn(wrapper).attributes('disabled')).toBe('true')
    expect(wrapper.find('[data-test="date-pair-error"]').text()).toContain('成對填寫')
  })

  it('逾期日早於收費開始日 → 儲存鈕 disabled', async () => {
    const wrapper = mountDialog(regTemplate)
    await nextTick()
    const vm = wrapper.vm as unknown as { form: Record<string, unknown> }
    vm.form.overdue_date = '2026-07-31'
    await nextTick()
    expect(saveBtn(wrapper).attributes('disabled')).toBe('true')
    expect(wrapper.find('[data-test="date-pair-error"]').text()).toContain('不得早於')
  })

  it('兩欄皆空（沿用舊制）→ 可儲存', async () => {
    const wrapper = mountDialog({
      ...regTemplate, billing_start_date: null as unknown as string, overdue_date: null as unknown as string,
    })
    await nextTick()
    expect(saveBtn(wrapper).attributes('disabled')).toBe('false')
  })

  it('非月費顯示日期欄、月費顯示每月幾號欄', async () => {
    const reg = mountDialog(regTemplate)
    await nextTick()
    expect(reg.find('[data-test="billing-start-date"]').exists()).toBe(true)
    expect(reg.find('[data-test="monthly-billing-day"]').exists()).toBe(false)

    const monthly = mountDialog(monthlyTemplate)
    await nextTick()
    expect(monthly.find('[data-test="monthly-billing-day"]').exists()).toBe(true)
    expect(monthly.find('[data-test="billing-start-date"]').exists()).toBe(false)
  })
})

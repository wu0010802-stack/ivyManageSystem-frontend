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

const baseTemplate = {
  id: 7, grade_id: 2, school_year: 115, semester: 1, fee_type: 'monthly',
  name: '月費', amount: 9000, due_date_offset_days: 14,
  breakdown: { tuition: 5000, meal: 3000, transport: 1000 },
}

const mountDialog = (template: typeof baseTemplate | null = null) => mount(FeeTemplateDialog, {
  props: { modelValue: true, template, grades: [{ id: 2, name: '中班' }] },
  global: { stubs: { 'el-dialog': ElDialogStub, 'el-form': ElFormStub } },
})

describe('FeeTemplateDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('編輯模式只送可變欄位（識別四欄不進 payload）', async () => {
    const wrapper = mountDialog(baseTemplate)
    await wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!.trigger('click')
    await nextTick(); await Promise.resolve()
    expect(updateFeeTemplate).toHaveBeenCalledTimes(1)
    const [id, payload] = updateFeeTemplate.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(7)
    expect(payload).not.toHaveProperty('grade_id')
    expect(payload).not.toHaveProperty('school_year')
    expect(payload).not.toHaveProperty('semester')
    expect(payload).not.toHaveProperty('fee_type')
    expect(payload.breakdown).toEqual({ tuition: 5000, meal: 3000, transport: 1000 })
  })

  it('月費組成總和≠金額 → 儲存鈕 disabled', async () => {
    const wrapper = mountDialog({ ...baseTemplate, amount: 9999 })
    await nextTick()
    const saveBtn = wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  it('金額達 50,000 → 顯示財務簽核門檻提示', async () => {
    const wrapper = mountDialog({ ...baseTemplate, fee_type: 'registration', amount: 60000, breakdown: undefined })
    await nextTick()
    expect(wrapper.find('[data-test="finance-approve-hint"]').exists()).toBe(true)
  })

  it('固定顯示快照語意警語', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('僅影響之後產生的費用單')
  })
})

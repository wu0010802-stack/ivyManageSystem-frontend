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

// F-2 回歸測試用：el-input 未註冊時無法真的雙向綁定，補一個最小 stub
// 讓測試能直接觸發 form.name 改變，模擬使用者在「新增模式」輸入過內容。
const ElInputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      'data-test': 'name-input',
      value: props.modelValue,
      onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
    })
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
    // 陷阱：未註冊 Element Plus 時 el-button 是未解析元素，:disabled 綁定的布林值
    // 一律會被渲染成字串屬性（"true"/"false"），attributes('disabled') 恆為已定義字串，
    // toBeDefined() 對 enabled 狀態也會恆真；必須用 toBe('true') 精準比對值本身。
    expect(saveBtn.attributes('disabled')).toBe('true')
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

  it('F-2: 連續兩次以 template=null 開啟 → 表單重置為預設值（不殘留上次輸入）', async () => {
    const wrapper = mount(FeeTemplateDialog, {
      props: { modelValue: false, template: null, grades: [{ id: 2, name: '中班' }] },
      global: {
        stubs: { 'el-dialog': ElDialogStub, 'el-form': ElFormStub, 'el-input': ElInputStub },
      },
    })

    // 第一次 openCreate()：父層把 modelValue 由 false 轉 true
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await wrapper.find('[data-test="name-input"]').setValue('殘留輸入')
    await nextTick()
    expect((wrapper.find('[data-test="name-input"]').element as HTMLInputElement).value).toBe('殘留輸入')

    // 使用者取消關閉；父層再次 openCreate()（template 仍是 null，唯一變化是 modelValue 再次轉 true）
    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    expect((wrapper.find('[data-test="name-input"]').element as HTMLInputElement).value).toBe('')

    await wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!.trigger('click')
    await nextTick(); await Promise.resolve()
    const payload = createFeeTemplate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.name).toBe('')
    expect(payload.amount).toBe(0)
    expect(payload.grade_id).toBe(null)
  })
})

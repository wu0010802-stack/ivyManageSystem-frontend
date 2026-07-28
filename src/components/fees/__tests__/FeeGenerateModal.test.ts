import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'

const generateFeeRecords = vi.fn(() => Promise.resolve({ created: 12, skipped: 3, preview: [] }))
vi.mock('@/api/fees', () => ({
  generateFeeRecords: (...args: unknown[]) => generateFeeRecords(...args),
}))

const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null)
  },
})

// F-1 回歸測試用：el-input-number 未註冊時無法真的雙向綁定，補一個最小 stub
// 讓測試能直接觸發 form.school_year 改變，驅動 watch(form, ...) 清空 preview。
const ElInputNumberStub = defineComponent({
  props: { modelValue: { type: Number, default: 0 } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      'data-test': 'school-year-input',
      value: props.modelValue,
      onInput: (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value)),
    })
  },
})

const flushPromises = async () => { await Promise.resolve(); await Promise.resolve() }

describe('FeeGenerateModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('預覽 → dry_run: true；確認 → dry_run: false 並 emit generated', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽'))!.trigger('click')
    await flushPromises(); await nextTick()
    expect(generateFeeRecords).toHaveBeenCalledTimes(1)
    expect((generateFeeRecords.mock.calls[0][0] as { dry_run: boolean }).dry_run).toBe(true)

    await wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))!.trigger('click')
    await flushPromises()
    expect(generateFeeRecords).toHaveBeenCalledTimes(2)
    expect((generateFeeRecords.mock.calls[1][0] as { dry_run: boolean }).dry_run).toBe(false)
    expect(wrapper.emitted('generated')).toBeTruthy()
  })

  it('未預覽前確認鈕 disabled', () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    const confirmBtn = wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))!
    // 陷阱：未註冊 Element Plus 時 el-button 是未解析元素，:disabled 綁定的布林值
    // 一律會被渲染成字串屬性（"true"/"false"），attributes('disabled') 恆為已定義字串，
    // toBeDefined() 對 enabled 狀態也會恆真；必須用 toBe('true') 精準比對值本身。
    expect(confirmBtn.attributes('disabled')).toBe('true')
  })

  it('F-1: 預覽後改動表單（學年）→ 舊預覽失效，確認鈕回到 disabled', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub, 'el-input-number': ElInputNumberStub } },
    })
    const confirmBtn = () => wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))!

    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽'))!.trigger('click')
    await flushPromises(); await nextTick()
    // 預覽成功後（created: 12）確認鈕應可按
    expect(confirmBtn().attributes('disabled')).toBe('false')

    await wrapper.find('[data-test="school-year-input"]').setValue(116)
    await nextTick()

    // 表單改動後，舊 preview 是用過期參數換來的，確認鈕必須回到 disabled
    expect(confirmBtn().attributes('disabled')).toBe('true')
  })
})

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

  it('兩階段 footer：未預覽時只有「預覽產單」，無確認鈕', () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    const buttons = wrapper.findAll('el-button')
    expect(buttons.find((b) => b.text().includes('預覽產單'))).toBeTruthy()
    expect(buttons.find((b) => b.text().includes('確認產生'))).toBeUndefined()
  })

  it('已預覽 → footer primary 為「確認產生 N 筆」，並顯示學年/學期/類型/跳過摘要', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽產單'))!.trigger('click')
    await flushPromises(); await nextTick()

    const confirmBtn = wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn!.text()).toContain('確認產生 12 筆')

    const summary = wrapper.find('[data-test="generate-preview-summary"]')
    expect(summary.exists()).toBe(true)
    const text = summary.text()
    expect(text).toContain('學年度')
    expect(text).toContain('學期')
    expect(text).toContain('12')
    expect(text).toContain('3') // skipped
  })

  it('F-1: 預覽後改動表單（學年）→ 舊預覽失效，footer 回到「預覽產單」', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub, 'el-input-number': ElInputNumberStub } },
    })
    const confirmBtn = () => wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))

    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽產單'))!.trigger('click')
    await flushPromises(); await nextTick()
    // 預覽成功後（created: 12）確認鈕出現
    expect(confirmBtn()).toBeTruthy()

    await wrapper.find('[data-test="school-year-input"]').setValue(116)
    await nextTick()

    // 表單改動後，舊 preview 是用過期參數換來的 → 確認鈕消失、回到預覽階段
    expect(confirmBtn()).toBeUndefined()
    expect(wrapper.findAll('el-button').find((b) => b.text().includes('預覽產單'))).toBeTruthy()
  })

  it('開啟時繼承 schoolYear/semester props 並清除舊 preview', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: false, schoolYear: 116, semester: 2 },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽產單'))!.trigger('click')
    await flushPromises()
    const payload = generateFeeRecords.mock.calls[0][0] as { school_year: number; semester: number }
    expect(payload.school_year).toBe(116)
    expect(payload.semester).toBe(2)
  })
})

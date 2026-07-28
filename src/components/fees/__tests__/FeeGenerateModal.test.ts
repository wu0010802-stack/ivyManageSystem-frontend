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
    expect(confirmBtn.attributes('disabled')).toBeDefined()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/fees', () => ({
  generateFeesFromTemplates: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import { generateFeesFromTemplates } from '@/api/fees'
import { ElMessage } from 'element-plus'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'

const stubs = {
  ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElInputNumber: { template: '<input />' },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadio: { template: '<label><slot /></label>' },
  ElCheckboxGroup: { template: '<div><slot /></div>' },
  ElCheckbox: { template: '<label><slot /></label>' },
  ElButton: {
    emits: ['click'],
    template: '<button type="button" @click.stop="$emit(\'click\')"><slot /></button>',
  },
  ElAlert: { template: '<div><slot /></div>' },
  ElTable: { template: '<table></table>' },
  ElTableColumn: { template: '<td></td>' },
}

describe('FeeGenerateModal', () => {
  beforeEach(() => vi.resetAllMocks())

  it('preview calls API with dry_run=true', async () => {
    generateFeesFromTemplates.mockResolvedValue({ created: 10, skipped: 2, preview: [] })
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs },
    })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')  // 預覽
    await nextTick()
    expect(generateFeesFromTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ dry_run: true })
    )
  })

  it('confirm calls API with dry_run=false then emits generated', async () => {
    generateFeesFromTemplates
      .mockResolvedValueOnce({ created: 10, skipped: 2, preview: [] }) // preview
      .mockResolvedValueOnce({ created: 10, skipped: 2, preview: [] }) // confirm
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs },
    })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')  // preview
    await nextTick()
    await nextTick()
    await buttons[buttons.length - 1].trigger('click')  // 最後一個是 footer 確認
    await nextTick()
    await nextTick()
    expect(generateFeesFromTemplates).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('generated')).toBeTruthy()
  })
})

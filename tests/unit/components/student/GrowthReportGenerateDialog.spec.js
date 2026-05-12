import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentGrowthReports', () => ({
  createGrowthReport: vi.fn().mockResolvedValue({ data: { id: 1, status: 'pending' } }),
}))

import GrowthReportGenerateDialog from '@/components/student/GrowthReportGenerateDialog.vue'

describe('GrowthReportGenerateDialog', () => {
  it('renders create dialog when opened', async () => {
    const wrapper = mount(GrowthReportGenerateDialog, {
      props: { modelValue: true, studentId: 1 },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('生成成長報告')
    wrapper.unmount()
  })

  it('default period_label includes current year after opening', async () => {
    // The watcher fires on visible transition false→true, so mount closed then open.
    const wrapper = mount(GrowthReportGenerateDialog, {
      props: { modelValue: false, studentId: 1 },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()
    const yyyy = new Date().getFullYear()
    expect(wrapper.vm.form.period_label).toContain(String(yyyy))
    wrapper.unmount()
  })
})

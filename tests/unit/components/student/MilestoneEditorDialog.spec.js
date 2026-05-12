import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneEditorDialog from '@/components/student/MilestoneEditorDialog.vue'

vi.mock('@/api/studentMilestones', async () => {
  const actual = await vi.importActual('@/api/studentMilestones')
  return {
    ...actual,
    createMilestone: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    updateMilestone: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  }
})

describe('MilestoneEditorDialog', () => {
  it('renders create dialog with "新增里程碑" title when milestone prop is null', async () => {
    const wrapper = mount(MilestoneEditorDialog, {
      props: { modelValue: true, studentId: 1 },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('新增里程碑')
    wrapper.unmount()
  })

  it('handleTypeChange("birthday") updates form.icon to 🎂', async () => {
    const wrapper = mount(MilestoneEditorDialog, {
      props: { modelValue: true, studentId: 1 },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()
    wrapper.vm.handleTypeChange('birthday')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.form.icon).toBe('🎂')
    wrapper.unmount()
  })
})

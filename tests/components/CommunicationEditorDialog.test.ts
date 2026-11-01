import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentCommunications', () => ({
  createCommunication: vi.fn(() => Promise.resolve({ data: {} })),
  updateCommunication: vi.fn(() => Promise.resolve({ data: {} })),
}))

import CommunicationEditorDialog from '@/components/student/CommunicationEditorDialog.vue'
import { COMMUNICATION_PARENT_VISIBILITY_HINT } from '@/constants/studentRecords'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }

describe('CommunicationEditorDialog — 家長可見性提示（HEALTH-F13）', () => {
  it('表單頂端提示：親師溝通紀錄為園內紀錄，家長端看不到', () => {
    const wrapper = mount(CommunicationEditorDialog, {
      global: {
        plugins: [ElementPlus],
        stubs: { 'el-dialog': ElDialogStub, 'el-select': true, 'el-option': true, 'el-date-picker': true },
      },
      props: { visible: true, mode: 'create', defaultStudentId: 1 },
    })
    const hint = wrapper.find('[data-test="parent-visibility-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(COMMUNICATION_PARENT_VISIBILITY_HINT)
    expect(COMMUNICATION_PARENT_VISIBILITY_HINT).toContain('家長看不到')
  })
})

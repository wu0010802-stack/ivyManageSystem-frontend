import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/students', () => ({ getStudents: vi.fn(() => Promise.resolve({ data: { items: [] } })) }))
vi.mock('@/api/studentIncidents', () => ({
  getIncidents: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  createIncident: vi.fn(() => Promise.resolve({ data: {} })),
  updateIncident: vi.fn(() => Promise.resolve({ data: {} })),
  deleteIncident: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/studentAssessments', () => ({
  createAssessment: vi.fn(() => Promise.resolve({ data: {} })),
  updateAssessment: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAssessment: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/studentChangeLogs', () => ({
  createChangeLog: vi.fn(() => Promise.resolve({ data: {} })),
  updateChangeLog: vi.fn(() => Promise.resolve({ data: {} })),
  deleteChangeLog: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/studentRecords', () => ({ getStudentRecordsTimeline: vi.fn(() => Promise.resolve({ data: { items: [] } })) }))

import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = { 'el-dialog': ElDialogStub, 'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-checkbox': true } as const

function mountDialog(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  return mount(IncidentEditorDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { visible: true, mode: 'create', ...props },
  })
}
function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  if (!body.exists()) return false
  return (body.element as HTMLElement).style.display === 'none'
}

describe('IncidentEditorDialog — A+C', () => {
  it('核心必填常駐、補充選填收合', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('事件描述')
    expect(isBodyHidden(wrapper, 'section-extra')).toBe(true)
  })
})

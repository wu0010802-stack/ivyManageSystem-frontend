import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() => Promise.resolve({ data: [] })),
}))

describe('TodayTasksPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the panel subtitle and the 4 sections', () => {
    const wrapper = shallowMount(TodayTasksPanel, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot /></div>' },
          'el-select': true,
          'el-option': true,
          'el-date-picker': true,
        },
      },
    })

    // 標題 h2「今日任務池」於後續重構移除，改以 panel-subtitle 描述列為穩定錨點
    expect(wrapper.find('.panel-subtitle').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AttendanceSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'LeaveSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AssessmentSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IncidentSection' }).exists()).toBe(true)
  })
})

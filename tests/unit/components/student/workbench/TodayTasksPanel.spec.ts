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

// 使用者改紀錄區間時，點名日期不可跟著結束日跳動。
it('點名日期與紀錄查詢區間各自獨立', async () => {
  setActivePinia(createPinia())
  const wrapper = shallowMount(TodayTasksPanel, { global: { stubs: {
    'el-card': { template: '<div><slot /></div>' }, 'el-select': true,
    'el-option': true, 'el-date-picker': true,
  } } })
  const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
  const single = pickers.find(p => p.attributes('type') === 'date')
  const range = pickers.find(p => p.attributes('type') === 'daterange')
  expect(single).toBeTruthy()
  single!.vm.$emit('update:modelValue', '2026-09-06')
  await wrapper.vm.$nextTick()
  range!.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-31'])
  await wrapper.vm.$nextTick()
  expect(wrapper.findComponent({ name: 'AttendanceSection' }).props('attendanceDate')).toBe('2026-09-06')
  wrapper.unmount()
})

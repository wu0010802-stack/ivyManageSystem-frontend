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

const globalStubs = {
  'el-card': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-date-picker': true,
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}

const mountPanel = () => shallowMount(TodayTasksPanel, { global: { stubs: globalStubs } })

describe('TodayTasksPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the panel subtitle and the record sections', () => {
    const wrapper = mountPanel()

    // 標題 h2「今日任務池」於後續重構移除，改以 panel-subtitle 描述列為穩定錨點
    expect(wrapper.find('.panel-subtitle').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'LeaveSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AssessmentSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IncidentSection' }).exists()).toBe(true)
  })

  // 2026-11-03 每日點名抽成側欄獨立頁（/students/rollcall）：儀表板不再放點名表，只留導引連結。
  it('不再內嵌每日點名，改留前往每日點名頁的連結', () => {
    const wrapper = mountPanel()
    expect(wrapper.findComponent({ name: 'AttendanceSection' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('點名日期')
    const link = wrapper.find('.rollcall-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/students/rollcall')
  })

  it('紀錄查詢區間併入上方篩選列，改區間會更新篩選', async () => {
    const wrapper = mountPanel()
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    // 點名日期已隨每日點名移走，只剩紀錄查詢區間這一個日期控制項
    expect(pickers).toHaveLength(1)
    const range = pickers[0]
    expect(range.attributes('type')).toBe('daterange')
    expect(range.element.closest('.filter-row')).not.toBeNull()

    const shortcuts = (range.vm.$attrs.shortcuts as Array<{ text: string }>).map(item => item.text)
    expect(shortcuts).toContain('近 90 天')
    expect(shortcuts).not.toContain('本學期 (近 90 天)')

    range.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-31'])
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ElDatePicker' }).attributes('model-value')).toBe('2026-08-01,2026-08-31')
    wrapper.unmount()
  })
})

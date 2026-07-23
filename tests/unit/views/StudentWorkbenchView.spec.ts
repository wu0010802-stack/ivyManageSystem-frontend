import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentWorkbenchView from '@/views/StudentWorkbenchView.vue'

const { routeMock } = vi.hoisted(() => ({
  routeMock: { query: {} as Record<string, unknown> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(() => Promise.resolve()) }),
}))

const stubs = { TodayTasksPanel: true, StudentListPanel: true }

describe('StudentWorkbenchView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routeMock.query = {}
    vi.clearAllMocks()
  })

  it('renders TodayTasksPanel and StudentListPanel without enrollment statistics', () => {
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })

    expect(wrapper.findComponent({ name: 'TodayTasksPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'StudentListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('在籍統計')
  })

  it('defaults activeTab to "tasks" with no query', () => {
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })
    expect(wrapper.vm.$.setupState.activeTab).toBe('tasks')
  })

  it('selects "roster" tab when deep-linked with action query', () => {
    routeMock.query = { action: 'transfer' }
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })
    expect(wrapper.vm.$.setupState.activeTab).toBe('roster')
  })

  it('ignores the retired tab=enrollment query', () => {
    routeMock.query = { tab: 'enrollment' }
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })
    expect(wrapper.vm.$.setupState.activeTab).toBe('tasks')
  })
})

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

  it('renders both TodayTasksPanel and StudentListPanel', () => {
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })

    expect(wrapper.findComponent({ name: 'TodayTasksPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'StudentListPanel' }).exists()).toBe(true)
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

  it('selects "enrollment" tab when deep-linked with tab=enrollment query', () => {
    routeMock.query = { tab: 'enrollment' }
    const wrapper = shallowMount(StudentWorkbenchView, { global: { stubs } })
    expect(wrapper.vm.$.setupState.activeTab).toBe('enrollment')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentWorkbenchView from '@/views/StudentWorkbenchView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(() => Promise.resolve()) }),
}))

describe('StudentWorkbenchView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders both TodayTasksPanel and StudentListPanel', () => {
    const wrapper = shallowMount(StudentWorkbenchView, {
      global: {
        stubs: {
          TodayTasksPanel: true,
          StudentListPanel: true,
        },
      },
    })

    expect(wrapper.findComponent({ name: 'TodayTasksPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'StudentListPanel' }).exists()).toBe(true)
  })
})

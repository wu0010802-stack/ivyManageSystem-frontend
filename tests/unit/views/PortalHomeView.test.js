import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PortalHomeView from '@/views/portal/PortalHomeView.vue'

// mock 底層 API（store 從 @/api/portalHome import）
vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({
    data: {
      me: { name: '老師' },
      today: {
        shift: null,
        attendance: { punch_in_at: null, punch_out_at: null, is_anomaly: false },
      },
      classrooms: [],
      actions: {
        unread_messages: 0,
        pending_substitute: 0,
        pending_swap: 0,
        pending_anomaly_confirms: 0,
        unread_announcements: 0,
      },
    },
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

function mountIt() {
  return mount(PortalHomeView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        PendingActionsCard: true,
        TodayShiftCard: true,
        ClassroomOpsCard: true,
        QuickLinksCard: true,
        ElButton: { template: '<button><slot /></button>' },
      },
    },
  })
}

describe('PortalHomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without crashing', async () => {
    expect(() => mountIt()).not.toThrow()
    await flushPromises()
  })

  it('renders greeting', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toMatch(/早安|午安|晚安|凌晨好|中午好/)
  })

  it('shows refresh button', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('button').exists()).toBe(true)
  })

  it('renders empty state when no classrooms', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('未綁定')
  })

  it('renders classrooms section title', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.text()).toContain('我的班級')
  })
})

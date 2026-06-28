import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}

// 頁面實際 import：getMyClassIncidents、createPortalIncident（@/api/studentIncidents）
vi.mock('@/api/studentIncidents', () => ({
  getMyClassIncidents: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  createPortalIncident: vi.fn(() => Promise.resolve({ data: {} })),
}))

// api/index（用於 fetchMyStudents 的 api.get('/portal/my-students')）
vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { classrooms: [] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// usePortalFromHub composable
vi.mock('@/composables/usePortalFromHub', () => ({
  usePortalFromHub: () => ({ fromHub: false, backToHub: vi.fn() }),
}))

import PortalIncidentView from '@/views/portal/PortalIncidentView.vue'

const stubs = {
  AdminListCards: {
    name: 'AdminListCards',
    props: ['items', 'columns', 'rowKey'],
    template: '<div class="alc-stub" :data-count="items.length"><slot name="title" :item="items[0]||{}"/></div>',
  },
}

describe('PortalIncidentView 手機卡片視圖', () => {
  beforeEach(() => setMobile(false))

  it('桌機渲染 el-table、不渲染 AdminListCards', async () => {
    setMobile(false)
    const w = mount(PortalIncidentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.alc-stub').exists()).toBe(false)
    w.unmount()
  })

  it('手機渲染 AdminListCards、不渲染 el-table', async () => {
    setMobile(true)
    const w = mount(PortalIncidentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.alc-stub').exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
    w.unmount()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeIncident = {
  id: 1,
  student_id: 7,
  student_name: '測試學生',
  incident_type: '衝突',
  severity: '輕微',
  occurred_at: '2026-08-03T10:30:00',
  description: '午休時與同學爭執玩具',
  parent_notified: false,
}
vi.mock('@/api/studentIncidents', () => ({
  getIncidents: vi.fn(() => Promise.resolve({ data: { items: [fakeIncident], total: 1 } })),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn(() => Promise.resolve({ data: { items: [] } })) }))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import StudentIncidentView from '@/views/StudentIncidentView.vue'

const globalStubs = {
  stubs: {
    'el-card': { template: '<div><slot /></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('StudentIncidentView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(StudentIncidentView, { global: globalStubs })
    await flushPromises()
    await nextTick()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeAnnouncement = {
  id: 1,
  title: '暑期照顧班報名開始',
  content: '請家長於本週五前完成報名，逾期恕不受理。',
  priority: 'normal',
  status: 'active',
  is_pinned: false,
  created_by_name: '行政組',
  created_at: '2026-08-01T09:00:00',
  recipient_count: 0,
  read_count: 0,
  read_preview: [],
}
vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn(() => Promise.resolve({ data: { items: [fakeAnnouncement], total: 1 } })),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementParentRecipients: vi.fn(() => Promise.resolve({ data: [] })),
  replaceAnnouncementParentRecipients: vi.fn(),
  getAnnouncementRecipients: vi.fn(() => Promise.resolve({ data: [] })),
  getAnnouncementReaders: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn(() => Promise.resolve({ data: { items: [] } })) }))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn(() => Promise.resolve()) }),
}))

import AnnouncementView from '@/views/AnnouncementView.vue'

const globalStubs = {
  stubs: {
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('AnnouncementView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(AnnouncementView, { global: globalStubs })
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

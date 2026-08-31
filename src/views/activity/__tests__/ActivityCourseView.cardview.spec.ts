import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeCourse = {
  id: 1,
  name: '創意美術',
  price: 3600,
  sessions: 12,
  capacity: 15,
  enrolled: 8,
  waitlist_count: 0,
  allow_waitlist: true,
  allowed_grades: [],
  instructor_name: '王老師',
  status: 'active',
}
vi.mock('@/api/activity', () => ({
  // 端點回 { courses: [...] } 而非裸陣列（見 ActivityCourseView fetchCourses）
  getCourses: vi.fn(() => Promise.resolve({ data: { courses: [fakeCourse] } })),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  getCourseWaitlist: vi.fn(() => Promise.resolve({ data: [] })),
  getCourseEnrolled: vi.fn(() => Promise.resolve({ data: [] })),
  reorderCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  reorderCourses: vi.fn(),
  sweepExpiredWaitlist: vi.fn(),
}))
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn(() => Promise.resolve({ data: [] })) }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ currentTerm: null, terms: [], fetchTerms: vi.fn(() => Promise.resolve()) }),
}))

import ActivityCourseView from '@/views/activity/ActivityCourseView.vue'

const globalStubs = {
  stubs: {
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
    // 候補/報名 drawer 內另有表格，且 drawer 預設不開；避免其內容干擾主表斷言
    'el-drawer': { template: '<div></div>' },
    'el-dialog': { template: '<div></div>' },
  },
}

describe('ActivityCourseView 手機卡片切換', () => {
  it('桌機顯示課程 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(ActivityCourseView, { global: globalStubs })
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

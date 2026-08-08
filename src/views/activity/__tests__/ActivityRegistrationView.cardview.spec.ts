import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeRegistration = {
  id: 1,
  student_name: '測試學生',
  parent_phone: '0912345678',
  class_name: '向日葵班',
  grade_name: '中班',
  grade_mismatch_courses: [],
  match_status: 'matched',
  course_names: '創意美術',
  total_amount: 3600,
  paid_amount: 0,
  remark: '',
  internal_note: '',
  created_at: '2026-08-01T10:00:00',
  query_token: 'ABC123',
}
vi.mock('@/api/activity', () => ({
  getRegistrations: vi.fn(() => Promise.resolve({ data: { items: [fakeRegistration], total: 1 } })),
  getRegistrationDetail: vi.fn(() => Promise.resolve({ data: {} })),
  rejectRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  matchRegistration: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  rematchRegistrations: vi.fn(),
  getCourses: vi.fn(() => Promise.resolve({ data: { courses: [] } })),
  exportRegistrations: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ currentTerm: null, terms: [], fetchTerms: vi.fn(() => Promise.resolve()) }),
}))

import ActivityRegistrationView from '@/views/activity/ActivityRegistrationView.vue'

const globalStubs = {
  stubs: {
    'el-card': { template: '<div><slot /></div>' },
    // 詳情抽屜/對話框內另有表格，預設不開；stub 掉避免干擾主表斷言
    'el-drawer': { template: '<div></div>' },
    'el-dialog': { template: '<div></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('ActivityRegistrationView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(ActivityRegistrationView, { global: globalStubs })
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

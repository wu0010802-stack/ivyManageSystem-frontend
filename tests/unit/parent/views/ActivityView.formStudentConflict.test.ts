import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn(),
  myRegistrations: vi.fn(),
  registerCourses: vi.fn(),
  confirmPromotion: vi.fn(),
  getUpcomingSessions: vi.fn(),
  getActivityBootstrap: vi.fn(),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [
      { student_id: 1, name: '大寶' },
      { student_id: 2, name: '二寶' },
    ],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))

import { getActivityBootstrap } from '@/parent/api/activity'
import ActivityView from '@/parent/views/ActivityView.vue'

const candidate = {
  id: 100,
  name: '足球',
  school_year: 114,
  semester: 1,
  capacity: 20,
  enrolled_count: 0,
  is_full: false,
  allow_waitlist: true,
  meeting_weekday: 1,
  meeting_start_time: '09:00',
  meeting_end_time: '10:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActivityBootstrap).mockResolvedValue({
    data: {
      courses: { items: [candidate] },
      registrations: {
        items: [{
          id: 9,
          student_id: 2,
          school_year: 114,
          semester: 1,
          is_paid: false,
          courses: [{
            course_id: 99,
            course_name: '鋼琴',
            status: 'enrolled',
            meeting_weekday: 1,
            meeting_start_time: '09:30',
            meeting_end_time: '10:30',
          }],
        }],
      },
      upcoming_sessions: { items: [] },
      registration_time: { is_open: true },
    },
  } as never)
})

describe('ActivityView 報名 sheet 衝堂孩子來源', () => {
  it('sheet 改選二寶後，衝堂依 form.student_id 而非頁首大寶計算', async () => {
    const wrapper = mount(ActivityView, {
      global: {
        stubs: {
          PullToRefresh: { template: '<div><slot /></div>' },
          ActivityHero: true,
          ChildContextHeader: true,
          ActivityCardList: true,
          ActivityRegisterSheet: defineComponent({
            props: {
              modelValue: Boolean,
              formData: Object,
              children: Array,
              availableCourses: Array,
              conflictIds: Object,
            },
            template: '<div />',
          }),
          RegistrationStatusList: true,
          ParentIcon: true,
          M3SegmentedButton: true,
        },
      },
    })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      form: { student_id?: number; school_year?: number; semester?: string; course_ids?: number[] }
      formConflictIds: Set<number>
    }

    vm.form.student_id = 2
    vm.form.school_year = 114
    vm.form.semester = '1'
    vm.form.course_ids = [100]
    await wrapper.vm.$nextTick()

    expect(vm.formConflictIds.has(100)).toBe(true)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { cloneVNode, defineComponent, h, nextTick, type PropType } from 'vue'
import ActivityCourseView from '../ActivityCourseView.vue'

// 待審候補（pending_review_waitlist）：報名尚待身分審核且排在候補區，後端
// OCCUPYING_STATUSES 不含它 → 不佔容量；點「升正式」後端必回 400，須先完成審核。
// 課程列表容量欄下方要能把這個人數單獨標示出來（此欄位長期沒被後端回傳，提示形同死區塊）。

vi.mock('@/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/activity')>()
  return {
    ...actual,
    getCourses: vi.fn(),
  }
})

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { getCourses } from '@/api/activity'

type CourseRow = Record<string, unknown>

// el-table / el-table-column 的預設 stub 不會跑 column 的 default slot，容量欄的
// 儲存格內容就完全渲染不到；沿用 ActivityCourseView.promote.test.js 既有的
// 「table stub 把 data 灌進每個 column stub」寫法。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: {
    data: { type: Array as PropType<CourseRow[]>, default: () => [] },
    label: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'column-stub', 'data-label': props.label },
        props.data.map((row, index) =>
          h('div', { class: 'cell-stub', key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array as PropType<CourseRow[]>, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'table-stub' },
        (slots.default?.() || []).map((vnode, index) =>
          cloneVNode(vnode, { data: props.data, key: index }),
        ),
      )
  },
})

const STUBS = {
  AcademicTermSelector: true,
  AdminListToolbar: true,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-empty': { template: '<div />' },
  'el-dialog': { template: '<div />' },
  'el-drawer': { template: '<div />' },
}

// production 形狀：後端 count 迴圈把 pending_review_waitlist 也併進 waitlist_map，
// 所以 waitlist_count（QUEUE_STATUSES 合計）必定 >= pending_review_waitlist。
function makeCourse(overrides: CourseRow = {}): CourseRow {
  return {
    id: 1,
    name: '音樂律動',
    price: 3000,
    sessions: 10,
    capacity: 20,
    enrolled: 18,
    pending_review: 1,
    promoted_pending: 0,
    pending_review_waitlist: 0,
    waitlist_count: 0,
    allow_waitlist: true,
    video_url: '',
    description: '',
    meeting_weekdays: null,
    meeting_start_time: null,
    meeting_end_time: null,
    instructor_name: null,
    instructor_employee_id: null,
    allowed_grades: [],
    dm_url: null,
    dm_pages: null,
    ...overrides,
  }
}

async function mountWithCourses(courses: CourseRow[]) {
  vi.mocked(getCourses).mockResolvedValue({ data: { courses } } as never)
  const wrapper = mount(ActivityCourseView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

const HINT = '[data-test="pending-review-waitlist-hint"]'

describe('ActivityCourseView — 容量欄「待審候補（不佔位）」提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('後端回傳 pending_review_waitlist > 0 時顯示人數提示', async () => {
    const wrapper = await mountWithCourses([
      makeCourse({ pending_review_waitlist: 2, waitlist_count: 3 }),
    ])

    const hint = wrapper.find(HINT)
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('2 待審候補（不佔位）')
  })

  it('提示要講清楚「不佔位」且「須先完成審核才能升正式」', async () => {
    const wrapper = await mountWithCourses([
      makeCourse({ pending_review_waitlist: 1, waitlist_count: 1 }),
    ])

    const hint = wrapper.find(HINT)
    expect(hint.text()).toContain('不佔位')
    expect(hint.text()).toContain('須先完成審核才能升正式')
  })

  it('待審候補不計入容量佔位（佔位數仍為 enrolled + pending_review + promoted_pending）', async () => {
    const wrapper = await mountWithCourses([
      makeCourse({ enrolled: 18, pending_review: 1, promoted_pending: 0, pending_review_waitlist: 2, waitlist_count: 2 }),
    ])

    const capacityCell = wrapper.findAll('.column-stub')
      .find((c) => c.attributes('data-label') === '容量')
    expect(capacityCell?.text()).toContain('19/20')
  })

  it('pending_review_waitlist 為 0 時不顯示提示', async () => {
    const wrapper = await mountWithCourses([
      makeCourse({ pending_review_waitlist: 0, waitlist_count: 0 }),
    ])

    expect(wrapper.find(HINT).exists()).toBe(false)
  })

  it('舊版後端未回傳該欄位時不顯示提示、也不出現 NaN', async () => {
    const legacy = makeCourse({ waitlist_count: 2 })
    delete legacy.pending_review_waitlist
    const wrapper = await mountWithCourses([legacy])

    expect(wrapper.find(HINT).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('NaN')
  })
})

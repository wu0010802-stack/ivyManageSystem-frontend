import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks（先 mock 再 import view）──────────────────────────────────────
vi.mock('@/api/activity', () => ({
  promoteWaitlist: vi.fn(),
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

// ── Pinia store mock ──────────────────────────────────────────────────────
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

// ── auth mock（升位按鈕自 canWrite 閘後需要 ACTIVITY_WRITE）─────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

// ── element-plus 訊息 mock ────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── vuedraggable stub：渲染 item slot（佔位名單 Drawer 改拖拉列表後需要）────
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'group', 'disabled', 'animation', 'ghostClass'],
    emits: ['update:modelValue', 'end'],
    template: `<div><template v-for="(el, i) in modelValue" :key="i"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
}))

import {
  promoteWaitlist,
  getCourseWaitlist,
  getCourseEnrolled,
  getCourses,
} from '@/api/activity'
import ActivityCourseView from '../ActivityCourseView.vue'

// ── 可正確傳遞 row 資料的 table stubs ────────────────────────────────────
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

// ── Element Plus 元件 stubs ───────────────────────────────────────────────
// el-button stub：只傳遞 data-* 非事件屬性，避免 $attrs.onClick 雙觸發問題
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        onClick: () => emit('click'),
      },
      slots.default?.(),
    )
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': { template: '<input type="checkbox" />' },
  'el-time-picker': { template: '<input />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span />' },
  'el-empty': { template: '<div />' },
  'el-divider': { template: '<hr />' },
  'el-alert': { template: '<div />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<label><slot /></label>' },
  'AcademicTermSelector': true,
}

const sampleWaitlistRow = {
  registration_id: 11,
  course_record_id: 999,
  student_name: '陳小華',
  class_name: '小班',
  waitlist_position: 2,
}

const sampleCourse = {
  id: 1,
  name: '音樂律動',
  price: 3000,
  sessions: 10,
  capacity: 20,
  enrolled: 20,
  waitlist_count: 1,
  allow_waitlist: true,
  video_url: '',
  description: '',
  meeting_weekday: null,
  meeting_start_time: '',
  meeting_end_time: '',
}

async function mountAndOpenWaitlistDrawer() {
  getCourses.mockResolvedValue({ data: { courses: [sampleCourse] } })
  getCourseWaitlist.mockResolvedValue({ data: { items: [sampleWaitlistRow] } })

  const wrapper = mount(ActivityCourseView, {
    global: {
      stubs: GLOBAL_STUBS,
      directives: { loading: () => {} },
    },
  })
  // 等 onMounted fetchCourses 完成
  await flushPromises()

  // 點擊候補人數按鈕（文字「1」）以開啟候補 Drawer 並載入清單
  const btns = wrapper.findAll('button')
  const waitlistBtn = btns.find(b => b.text() === '1')
  if (waitlistBtn) {
    await waitlistBtn.trigger('click')
    await flushPromises()
  }

  return wrapper
}

describe('ActivityCourseView — 候補 Drawer 手動升位', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('點擊升位按鈕顯示確認 dialog', async () => {
    const wrapper = await mountAndOpenWaitlistDrawer()

    const btn = wrapper.find('[data-test="promote-waitlist-btn-11"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')

    expect(wrapper.text()).toContain('跳過順序')
    expect(wrapper.text()).toContain('正式報名')
  })

  it('確認後呼叫 promoteWaitlist 並刷新 Drawer', async () => {
    promoteWaitlist.mockResolvedValue({ data: { message: '成功升為正式報名' } })

    const wrapper = await mountAndOpenWaitlistDrawer()
    await wrapper.find('[data-test="promote-waitlist-btn-11"]').trigger('click')
    await wrapper.find('[data-test="promote-confirm"]').trigger('click')
    await flushPromises()

    expect(promoteWaitlist).toHaveBeenCalledWith(11, 1)
  })

  it('API 失敗時顯示錯誤訊息', async () => {
    promoteWaitlist.mockRejectedValueOnce({
      response: { data: { detail: '該家長已被前一個升位' } },
    })

    const wrapper = await mountAndOpenWaitlistDrawer()
    await wrapper.find('[data-test="promote-waitlist-btn-11"]').trigger('click')
    await wrapper.find('[data-test="promote-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('該家長已被前一個升位')
  })
})

describe('ActivityCourseView — 容量欄含 promoted_pending 佔位（audit C-5，2026-07-02）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountList = async (course) => {
    getCourses.mockResolvedValue({ data: { courses: [course] } })
    const wrapper = mount(ActivityCourseView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()
    return wrapper
  }

  it('29 enrolled + 1 promoted_pending / 30 → 顯示佔位 30/30 並標示待確認', async () => {
    // 後端容量閘以佔位數（enrolled + promoted_pending）擋升位：只顯示 29/30
    // 會讓管理者以為有位，點升位卻吃 400「容量已滿」
    const wrapper = await mountList({
      ...sampleCourse,
      capacity: 30,
      enrolled: 29,
      promoted_pending: 1,
      waitlist_count: 0,
    })
    const text = wrapper.text()
    expect(text).toContain('30/30')
    expect(text).toContain('待確認')
  })

  it('無 promoted_pending → 維持原顯示、無待確認標示', async () => {
    const wrapper = await mountList({
      ...sampleCourse,
      capacity: 20,
      enrolled: 12,
      promoted_pending: 0,
      waitlist_count: 0,
    })
    const text = wrapper.text()
    expect(text).toContain('12/20')
    expect(text).not.toContain('待確認')
  })

  it('pending_review 與 promoted_pending 納入容量；pending_review_waitlist 獨立顯示但不佔位', async () => {
    const wrapper = await mountList({
      ...sampleCourse,
      capacity: 30,
      enrolled: 27,
      promoted_pending: 1,
      pending_review: 2,
      pending_review_waitlist: 3,
      waitlist_count: 0,
    })

    const text = wrapper.text()
    expect(text).toContain('30/30')
    expect(text).toContain('2 待審核')
    expect(text).toContain('1 待確認')
    expect(text).toContain('3 待審候補（不佔位）')
  })
})

describe('ActivityCourseView — 容量佔位名單 drilldown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('點擊 3/30 後顯示三種佔位者與中文狀態，不再只顯示 enrolled', async () => {
    getCourses.mockResolvedValue({
      data: {
        courses: [{
          ...sampleCourse,
          capacity: 30,
          enrolled: 1,
          promoted_pending: 1,
          pending_review: 1,
          waitlist_count: 0,
        }],
      },
    })
    getCourseEnrolled.mockResolvedValue({
      data: {
        course_id: 1,
        course_name: '音樂律動',
        items: [
          {
            position: 1,
            course_record_id: 101,
            registration_id: 201,
            student_name: '正式生',
            class_name: '大班',
            status: 'enrolled',
          },
          {
            position: 2,
            course_record_id: 102,
            registration_id: 202,
            student_name: '待確認生',
            class_name: '中班',
            status: 'promoted_pending',
          },
          {
            position: 3,
            course_record_id: 103,
            registration_id: 203,
            student_name: '待審核生',
            class_name: '小班',
            status: 'pending_review',
          },
        ],
      },
    })

    const wrapper = mount(ActivityCourseView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    const occupiedButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '3/30')
    expect(occupiedButton).toBeDefined()
    await occupiedButton.trigger('click')
    await flushPromises()

    expect(getCourseEnrolled).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('正式生')
    expect(wrapper.text()).toContain('待確認生')
    expect(wrapper.text()).toContain('待審核生')
    expect(wrapper.get('[data-test="occupancy-status-201"]').text()).toContain('正式')
    expect(wrapper.get('[data-test="occupancy-status-202"]').text()).toContain('待家長確認')
    expect(wrapper.get('[data-test="occupancy-status-203"]').text()).toContain('待審核')
  })
})

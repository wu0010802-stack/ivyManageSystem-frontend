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

// ── Pinia store mock ──────────────────────────────────────────────────────
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

// ── element-plus 訊息 mock ────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { promoteWaitlist, getCourseWaitlist, getCourses } from '@/api/activity'
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
  min_age_months: null,
  max_age_months: null,
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

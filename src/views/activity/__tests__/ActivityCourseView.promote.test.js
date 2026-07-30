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

// ── auth mock（升位按鈕自 canWrite 閘後需要 ACTIVITY_WRITE）─────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

// ── element-plus 訊息 mock ────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { promoteWaitlist, getCourseWaitlist, getCourses } from '@/api/activity'
import { ElMessage } from 'element-plus'
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
  'el-tooltip': { template: '<div><slot /></div>' },
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
  // status（2026-07-30 #8）：一般候補（可升正式）；pending_review_waitlist 子狀態
  // 另見下方「候補待審」describe block。
  status: 'waitlist',
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

  // 競態修復：升正式視窗送出中取消。cancelPromote 若無 submitting 守衛會把
  // promoteDialog.registration 清成 null，confirmPromote await 成功後讀
  // registration.student_name 對 null 取值拋錯 → 誤報「升位失敗」且後續刷新
  // （getCourseWaitlist + fetchCourses）永不執行。
  it('送出中點取消鈕不會關閉 dialog／不清 registration，promote resolve 後顯示成功訊息且正常刷新', async () => {
    let resolvePromote
    promoteWaitlist.mockImplementation(
      () => new Promise((resolve) => { resolvePromote = resolve }),
    )
    getCourseWaitlist.mockResolvedValue({ data: { items: [sampleWaitlistRow] } })
    getCourses.mockResolvedValue({ data: { courses: [sampleCourse] } })

    const wrapper = await mountAndOpenWaitlistDrawer()
    await wrapper.find('[data-test="promote-waitlist-btn-11"]').trigger('click')
    await wrapper.find('[data-test="promote-confirm"]').trigger('click')
    await flushPromises()
    // 此時 confirmPromote 仍在 await promoteWaitlist（尚未 resolve），submitting=true

    const ss = wrapper.vm.$.setupState
    expect(ss.promoteDialog.submitting).toBe(true)

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === '取消')
    expect(cancelBtn).toBeTruthy()
    await cancelBtn.trigger('click')
    await flushPromises()

    // 送出中點取消：dialog 不關閉、registration 不被清空
    expect(ss.promoteDialog.open).toBe(true)
    expect(ss.promoteDialog.registration).not.toBe(null)

    // promoteWaitlist 此時才 resolve：應正常顯示成功訊息並完成刷新（不因剛才誤觸
    // 取消而讀到 null registration 拋錯、誤報升位失敗）
    resolvePromote({ data: { message: '成功升為正式報名' } })
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('陳小華 已升為正式報名')
    expect(ss.promoteDialog.open).toBe(false)
    expect(ss.promoteDialog.registration).toBe(null)
    // 開啟 Drawer 時 1 次 + 升位成功後刷新 1 次
    expect(getCourseWaitlist).toHaveBeenCalledTimes(2)
    // mounted 時 1 次 + 升位成功後刷新 1 次
    expect(getCourses).toHaveBeenCalledTimes(2)
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
})

// status（2026-07-30 #8）：候補清單混含一般候補與「候補待審」（報名本身尚待身分審核，
// 點升正式後端必回 400）兩種子狀態；操作欄需依 status 分流，不能一律顯示升正式鈕。
describe('ActivityCourseView — 候補待審子狀態（#8 2026-07-30）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('一般候補（status=waitlist）仍顯示升正式鈕', async () => {
    const wrapper = await mountAndOpenWaitlistDrawer()
    expect(wrapper.find('[data-test="promote-waitlist-btn-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="waitlist-pending-review-tag-11"]').exists()).toBe(false)
  })

  it('候補待審（status=pending_review_waitlist）不顯示升正式鈕，改顯示待審核標示', async () => {
    getCourses.mockResolvedValue({ data: { courses: [sampleCourse] } })
    getCourseWaitlist.mockResolvedValue({
      data: {
        items: [{ ...sampleWaitlistRow, status: 'pending_review_waitlist' }],
      },
    })

    const wrapper = mount(ActivityCourseView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()
    const btns = wrapper.findAll('button')
    const waitlistBtn = btns.find((b) => b.text() === '1')
    await waitlistBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="promote-waitlist-btn-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="waitlist-pending-review-tag-11"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('待審核')
  })

  it('缺 status 欄位（舊資料／舊呼叫端）預設視同一般候補，仍顯示升正式鈕', async () => {
    getCourses.mockResolvedValue({ data: { courses: [sampleCourse] } })
    const { status: _status, ...rowWithoutStatus } = sampleWaitlistRow
    getCourseWaitlist.mockResolvedValue({ data: { items: [rowWithoutStatus] } })

    const wrapper = mount(ActivityCourseView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()
    const btns = wrapper.findAll('button')
    const waitlistBtn = btns.find((b) => b.text() === '1')
    await waitlistBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="promote-waitlist-btn-11"]').exists()).toBe(true)
  })
})

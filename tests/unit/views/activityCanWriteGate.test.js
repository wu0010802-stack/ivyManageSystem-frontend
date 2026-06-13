/**
 * Course / Supply / Inquiry 頁 canWrite 閘 — READ-only 使用者隱藏 mutation 按鈕
 *
 * 對齊 ActivityRegistrationView 既有慣例：
 * `const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))` + `v-if="canWrite"`。
 * 標記已讀後端只要 ACTIVITY_READ，不蓋。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── auth mock（可控）────────────────────────────────────────────────────────
const { mockHasPermission } = vi.hoisted(() => ({ mockHasPermission: vi.fn() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a) => mockHasPermission(...a),
}))

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  getSupplies: vi.fn(),
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  deleteSupply: vi.fn(),
  getInquiries: vi.fn(),
  markInquiryRead: vi.fn(),
  deleteInquiry: vi.fn(),
  replyInquiry: vi.fn(),
}))

// ── store mocks ────────────────────────────────────────────────────────────
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/stores/activity', () => ({
  useActivityStore: () => ({ fetchSummary: vi.fn() }),
}))

// ── element-plus 訊息 mock ─────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getCourses, getCourseWaitlist, getSupplies, getInquiries } from '@/api/activity'
import ActivityCourseView from '@/views/activity/ActivityCourseView.vue'
import ActivitySupplyView from '@/views/activity/ActivitySupplyView.vue'
import ActivityInquiryView from '@/views/activity/ActivityInquiryView.vue'

// ── 可傳遞 row 資料的 table stubs ──────────────────────────────────────────
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

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('button', { ...dataAttrs, onClick: () => emit('click') }, slots.default?.())
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-drawer': { template: '<div><slot /></div>' },
  // dialog 渲染空殼：未開啟的 dialog footer（取消/送出回覆）不應干擾文字斷言
  'el-dialog': { template: '<div />' },
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
  'el-badge': { template: '<span><slot /></span>' },
  'el-pagination': true,
  'AcademicTermSelector': true,
}

const MOUNT_OPTS = {
  global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
}

const sampleCourse = {
  id: 1, name: '音樂律動', price: 3000, sessions: 10, capacity: 20,
  enrolled: 20, waitlist_count: 1, allow_waitlist: true,
}

describe('課後才藝 canWrite 閘（READ-only 隱藏 mutation 按鈕）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCourses.mockResolvedValue({ data: { courses: [sampleCourse] } })
    getCourseWaitlist.mockResolvedValue({
      data: { items: [{ registration_id: 11, student_name: '陳小華', waitlist_position: 1 }] },
    })
    getSupplies.mockResolvedValue({ data: { supplies: [{ id: 5, name: '畫具組', price: 500 }] } })
    getInquiries.mockResolvedValue({
      data: { items: [{ id: 9, is_read: false, question: 'q' }], total: 1 },
    })
  })

  describe('ActivityCourseView', () => {
    it('READ-only：新增/複製/編輯/停用/升正式全部隱藏', async () => {
      mockHasPermission.mockReturnValue(false)
      const wrapper = mount(ActivityCourseView, MOUNT_OPTS)
      await flushPromises()

      expect(wrapper.text()).not.toContain('新增課程')
      expect(wrapper.text()).not.toContain('複製上學期')
      expect(wrapper.text()).not.toContain('編輯')
      expect(wrapper.text()).not.toContain('停用')

      // 開候補 Drawer（讀取行為仍允許）後，升正式按鈕不可見
      const waitlistBtn = wrapper.findAll('button').find((b) => b.text() === '1')
      expect(waitlistBtn).toBeTruthy()
      await waitlistBtn.trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="promote-waitlist-btn-11"]').exists()).toBe(false)
    })

    it('有 ACTIVITY_WRITE：mutation 按鈕可見', async () => {
      mockHasPermission.mockReturnValue(true)
      const wrapper = mount(ActivityCourseView, MOUNT_OPTS)
      await flushPromises()

      expect(mockHasPermission).toHaveBeenCalledWith('ACTIVITY_WRITE')
      expect(wrapper.text()).toContain('新增課程')
      expect(wrapper.text()).toContain('複製上學期')
      expect(wrapper.text()).toContain('編輯')

      const waitlistBtn = wrapper.findAll('button').find((b) => b.text() === '1')
      await waitlistBtn.trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="promote-waitlist-btn-11"]').exists()).toBe(true)
    })
  })

  describe('ActivitySupplyView', () => {
    it('READ-only：新增/編輯/停用全部隱藏', async () => {
      mockHasPermission.mockReturnValue(false)
      const wrapper = mount(ActivitySupplyView, MOUNT_OPTS)
      await flushPromises()

      expect(wrapper.text()).not.toContain('新增用品')
      expect(wrapper.text()).not.toContain('編輯')
      expect(wrapper.text()).not.toContain('停用')
    })

    it('有 ACTIVITY_WRITE：mutation 按鈕可見', async () => {
      mockHasPermission.mockReturnValue(true)
      const wrapper = mount(ActivitySupplyView, MOUNT_OPTS)
      await flushPromises()

      expect(wrapper.text()).toContain('新增用品')
      expect(wrapper.text()).toContain('編輯')
      expect(wrapper.text()).toContain('停用')
    })
  })

  describe('ActivityInquiryView', () => {
    it('READ-only：回覆/刪除隱藏，標記已讀保留（後端只要 READ）', async () => {
      mockHasPermission.mockReturnValue(false)
      const wrapper = mount(ActivityInquiryView, MOUNT_OPTS)
      await flushPromises()

      expect(wrapper.text()).not.toContain('回覆')
      expect(wrapper.text()).not.toContain('刪除')
      expect(wrapper.text()).toContain('標記已讀')
    })

    it('有 ACTIVITY_WRITE：回覆/刪除可見', async () => {
      mockHasPermission.mockReturnValue(true)
      const wrapper = mount(ActivityInquiryView, MOUNT_OPTS)
      await flushPromises()

      expect(wrapper.text()).toContain('回覆')
      expect(wrapper.text()).toContain('刪除')
    })
  })
})

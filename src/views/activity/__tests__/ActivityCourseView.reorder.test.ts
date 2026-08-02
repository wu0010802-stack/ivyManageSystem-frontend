import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks（先 mock 再 import view）──────────────────────────────────────
vi.mock('@/api/activity', () => ({
  promoteWaitlist: vi.fn(),
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  reorderCourseEnrolled: vi.fn(),
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  sweepExpiredWaitlist: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

// 報名排序（拖拉）自 canWrite 閘後需要 ACTIVITY_WRITE
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// vuedraggable stub：渲染 item slot、v-model 直通（拖拉重排以 emit
// update:modelValue + end 模擬，與 ApprovalChainEditor.test.ts 同慣例）
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'group', 'disabled', 'animation', 'ghostClass'],
    emits: ['update:modelValue', 'end'],
    template: `<div><template v-for="(el, i) in modelValue" :key="i"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
}))

import {
  getCourseEnrolled,
  reorderCourseEnrolled,
  getCourses,
} from '@/api/activity'
import { ElMessage, ElMessageBox } from 'element-plus'
import ActivityCourseView from '../ActivityCourseView.vue'

const mockedGetCourses = vi.mocked(getCourses)
const mockedGetCourseEnrolled = vi.mocked(getCourseEnrolled)
const mockedReorderCourseEnrolled = vi.mocked(reorderCourseEnrolled)
const mockedConfirm = vi.mocked(ElMessageBox.confirm)

// ── Element Plus 元件 stubs（比照 promote.test.js）───────────────────────────
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

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      (props.data as Record<string, unknown>[]).map((row, index) =>
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
        h(vnode.type as string, { ...vnode.props, data: props.data, key: index }, vnode.children as undefined),
      ),
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

const sampleCourse = {
  id: 1,
  name: 'test',
  price: 3000,
  sessions: 10,
  capacity: 20,
  enrolled: 2,
  waitlist_count: 1,
  allow_waitlist: true,
  video_url: '',
  description: '',
  meeting_weekdays: null,
  meeting_start_time: '',
  meeting_end_time: '',
}

const occ1 = { position: 1, course_record_id: 101, registration_id: 11, student_name: '吳逸倫', class_name: '向日葵', status: 'enrolled' }
const occ2 = { position: 2, course_record_id: 102, registration_id: 12, student_name: '羅尚文', class_name: '向日葵', status: 'pending_review' }
const wait1 = { position: 3, course_record_id: 103, registration_id: 13, student_name: '林候補', class_name: '玫瑰', status: 'waitlist' }

async function mountAndOpenDrawer() {
  mockedGetCourses.mockResolvedValue({ data: { courses: [sampleCourse] } } as never)
  mockedGetCourseEnrolled.mockResolvedValue({
    data: { course_id: 1, course_name: 'test', items: [occ1, occ2, wait1] },
  } as never)

  const wrapper = mount(ActivityCourseView, {
    global: {
      stubs: GLOBAL_STUBS,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()

  await wrapper.find('[data-test="reorder-enrolled-btn-1"]').trigger('click')
  await flushPromises()
  return wrapper
}

/** 取兩個拖拉區（[0]=正式佔位、[1]=候補） */
function rosterZones(wrapper: VueWrapper<unknown>) {
  const zones = wrapper.findAllComponents({ name: 'draggable' })
  return { occupying: zones[0], queue: zones[1] }
}

/** 模擬拖放：v-model 直通新順序後 emit end（vuedraggable 拖放結束時序） */
async function drop(
  wrapper: VueWrapper<unknown>,
  occItems: Record<string, unknown>[],
  queueItems: Record<string, unknown>[],
) {
  const { occupying, queue } = rosterZones(wrapper)
  occupying.vm.$emit('update:modelValue', occItems)
  queue.vm.$emit('update:modelValue', queueItems)
  occupying.vm.$emit('end')
  await flushPromises()
}

describe('ActivityCourseView — 容量佔位名單 Drawer 拖拉排序', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('點擊報名排序按鈕開啟 Drawer，佔位／候補分區渲染', async () => {
    const wrapper = await mountAndOpenDrawer()

    expect(mockedGetCourseEnrolled).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-test="roster-row-101"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-row-103"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('正式（佔位）')
    expect(wrapper.text()).toContain('候補')
    expect(wrapper.get('[data-test="occupancy-status-11"]').text()).toContain('正式')
    expect(wrapper.get('[data-test="occupancy-status-13"]').text()).toContain('候補')
  })

  it('區內重排：不跳確認、立即以新順序呼叫 reorderCourseEnrolled', async () => {
    mockedReorderCourseEnrolled.mockResolvedValue({ data: { message: '排序已儲存' } } as never)
    const wrapper = await mountAndOpenDrawer()

    await drop(wrapper, [occ2, occ1], [wait1])

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(mockedReorderCourseEnrolled).toHaveBeenCalledWith(1, [102, 101], [103])
    expect(ElMessage.success).toHaveBeenCalled()
    // 純重排不需重載名單
    expect(mockedGetCourseEnrolled).toHaveBeenCalledTimes(1)
  })

  it('原地放下（順序未變）不打 API', async () => {
    const wrapper = await mountAndOpenDrawer()

    await drop(wrapper, [occ1, occ2], [wait1])

    expect(mockedReorderCourseEnrolled).not.toHaveBeenCalled()
  })

  it('跨區拖拉：跳確認提示，確認後儲存並重載名單與課程列表', async () => {
    mockedConfirm.mockResolvedValue('confirm' as never)
    mockedReorderCourseEnrolled.mockResolvedValue({
      data: { message: '排序已儲存；候補轉正式：林候補；正式轉候補：吳逸倫' },
    } as never)
    const wrapper = await mountAndOpenDrawer()
    expect(mockedGetCourses).toHaveBeenCalledTimes(1)

    // 候補林候補拖入佔位區、吳逸倫拖去候補區（交換）
    await drop(wrapper, [wait1, occ2], [occ1])

    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    const confirmMsg = String(mockedConfirm.mock.calls[0][0])
    expect(confirmMsg).toContain('林候補')
    expect(confirmMsg).toContain('吳逸倫')
    expect(mockedReorderCourseEnrolled).toHaveBeenCalledWith(1, [103, 102], [101])
    // 身分已變：以後端為準重載名單 + 刷新課程列表計數
    expect(mockedGetCourseEnrolled).toHaveBeenCalledTimes(2)
    expect(mockedGetCourses).toHaveBeenCalledTimes(2)
  })

  it('跨區拖拉取消確認：不打 API 並還原順序', async () => {
    mockedConfirm.mockRejectedValueOnce('cancel')
    const wrapper = await mountAndOpenDrawer()

    await drop(wrapper, [wait1, occ2], [occ1])

    expect(mockedReorderCourseEnrolled).not.toHaveBeenCalled()
    // 還原：吳逸倫回到佔位區第一列
    const { occupying } = rosterZones(wrapper)
    expect(
      (occupying.props('modelValue') as { course_record_id: number }[]).map((i) => i.course_record_id),
    ).toEqual([101, 102])
  })

  it('儲存失敗（如 409 名單過期）顯示後端 detail 並重載', async () => {
    mockedReorderCourseEnrolled.mockRejectedValueOnce({
      response: { data: { detail: '佔位名單已變動，請重新整理後再調整排序' } },
    })
    const wrapper = await mountAndOpenDrawer()

    await drop(wrapper, [occ2, occ1], [wait1])

    expect(ElMessage.error).toHaveBeenCalledWith('佔位名單已變動，請重新整理後再調整排序')
    expect(mockedGetCourseEnrolled).toHaveBeenCalledTimes(2)
  })
})

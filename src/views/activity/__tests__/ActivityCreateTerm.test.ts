import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// P1 回歸：在「非當前學期」（由 AcademicTermSelector 切換）新增課程/用品時，
// create payload 必須帶上 selector 的 school_year/semester，否則後端缺省成當前
// 學期 → 新增後在選定學期消失、污染當前學期資料。

vi.mock('@/api/activity', () => ({
  // course view 用到
  copyCoursesFromPrevious: vi.fn(),
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  // supply view 用到
  getSupplies: vi.fn(),
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  deleteSupply: vi.fn(),
}))

// 關鍵：term store 回「非當前學期」113/2
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 113, semester: 2 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))

import {
  getCourses,
  createCourse,
  getSupplies,
  createSupply,
} from '@/api/activity'
import ActivityCourseView from '../ActivityCourseView.vue'
import ActivitySupplyView from '../ActivitySupplyView.vue'

// 智慧 table stub：依 data 逐列以 { row } 呼叫 default slot；空資料時不呼叫 slot，
// 避免 scoped slot 解構 undefined row（與 ActivityCourseView.promote.test.js 一致）。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as unknown[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table' },
        (slots.default?.() || []).map((vnode: any, index: number) =>
          h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
        ),
      )
  },
})

const GLOBAL_STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
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
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-popconfirm': { template: '<div><slot /></div>' },
  AcademicTermSelector: true,
}

const MOUNT_OPTS = {
  global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
}

// 取 <script setup> 內部 bindings（未 defineExpose，用 setupState proxy）
function setupOf(wrapper: ReturnType<typeof mount>) {
  // @ts-expect-error 內部 setupState（測試用）
  return wrapper.vm.$.setupState as Record<string, any>
}

describe('課程/用品在非當前學期新增帶上選定學期（P1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createCourse payload 帶 school_year/semester=selector', async () => {
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [] } } as any)
    vi.mocked(createCourse).mockResolvedValue({ data: { message: 'ok', id: 1 } } as any)

    const wrapper = mount(ActivityCourseView, MOUNT_OPTS)
    await flushPromises()

    const setup = setupOf(wrapper)
    setup.openCreate()
    setup.form.name = '新課程'
    setup.form.price = 100
    await setup.handleSave()
    await flushPromises()

    expect(createCourse).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createCourse).mock.calls[0][0] as Record<string, unknown>
    expect(payload.school_year).toBe(113)
    expect(payload.semester).toBe(2)
    wrapper.unmount()
  })

  it('createSupply payload 帶 school_year/semester=selector', async () => {
    vi.mocked(getSupplies).mockResolvedValue({ data: { supplies: [] } } as any)
    vi.mocked(createSupply).mockResolvedValue({ data: { message: 'ok', id: 1 } } as any)

    const wrapper = mount(ActivitySupplyView, MOUNT_OPTS)
    await flushPromises()

    const setup = setupOf(wrapper)
    setup.openCreate()
    setup.form.name = '新用品'
    setup.form.price = 50
    await setup.handleSave()
    await flushPromises()

    expect(createSupply).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createSupply).mock.calls[0][0] as Record<string, unknown>
    expect(payload.school_year).toBe(113)
    expect(payload.semester).toBe(2)
    wrapper.unmount()
  })
})

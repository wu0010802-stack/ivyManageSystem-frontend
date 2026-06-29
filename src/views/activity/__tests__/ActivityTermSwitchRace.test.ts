import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// 第三輪才藝 review F5（中）：課程/用品頁切換學期存在舊回應覆蓋。
// fetchCourses / fetchSupplies 沒有 request-sequence 守衛，快速切學期時較慢的
// 舊請求可能最後落地、覆寫較新請求的結果 → 頁面顯示新學期但資料屬於舊學期。
// 修正：每次 fetch 遞增序號，回應落地前比對序號，非當前請求即丟棄。

vi.mock('@/api/activity', () => ({
  copyCoursesFromPrevious: vi.fn(),
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  getSupplies: vi.fn(),
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  deleteSupply: vi.fn(),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 113, semester: 2 }),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))

import { getCourses, getSupplies } from '@/api/activity'
import ActivityCourseView from '../ActivityCourseView.vue'
import ActivitySupplyView from '../ActivitySupplyView.vue'

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

function setupOf(wrapper: ReturnType<typeof mount>) {
  // @ts-expect-error 內部 setupState（測試用）
  return wrapper.vm.$.setupState as Record<string, any>
}

/** 產生可手動 resolve 的受控 promise 工廠 */
function deferredFactory() {
  const resolvers: Array<(v: unknown) => void> = []
  const fn = vi.fn(
    () => new Promise(resolve => { resolvers.push(resolve as (v: unknown) => void) }),
  )
  return { fn, resolvers }
}

describe('課程/用品切換學期舊回應覆蓋守衛（F5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchCourses：較舊請求後回不得覆寫較新請求的結果', async () => {
    const { resolvers } = deferredFactory()
    // 初次 mount 會觸發一次 fetch；先讓它有 resolver
    vi.mocked(getCourses).mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve as (v: unknown) => void) }) as any,
    )

    const wrapper = mount(ActivityCourseView, MOUNT_OPTS)
    // mount 觸發的初次載入先 resolve 掉（空）
    resolvers[0]({ data: { courses: [] } })
    await flushPromises()

    const setup = setupOf(wrapper)

    // 連續兩次切學期（兩個 in-flight 請求）
    const p1 = setup.fetchCourses() // 舊學期請求
    const p2 = setup.fetchCourses() // 新學期請求（較新）
    // 新請求（index 2）先回新資料
    resolvers[2]({ data: { courses: [{ id: 2, name: '新學期課' }] } })
    // 舊請求（index 1）後回舊資料 → 必須被丟棄
    resolvers[1]({ data: { courses: [{ id: 1, name: '舊學期課' }] } })
    await Promise.all([p1, p2])
    await flushPromises()

    const names = (setup.courses as Array<{ name: string }>).map(c => c.name)
    expect(names).toEqual(['新學期課'])
    wrapper.unmount()
  })

  it('fetchSupplies：較舊請求後回不得覆寫較新請求的結果', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    vi.mocked(getSupplies).mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve as (v: unknown) => void) }) as any,
    )

    const wrapper = mount(ActivitySupplyView, MOUNT_OPTS)
    resolvers[0]({ data: { supplies: [] } })
    await flushPromises()

    const setup = setupOf(wrapper)

    const p1 = setup.fetchSupplies()
    const p2 = setup.fetchSupplies()
    resolvers[2]({ data: { supplies: [{ id: 2, name: '新學期品', price: 10 }] } })
    resolvers[1]({ data: { supplies: [{ id: 1, name: '舊學期品', price: 20 }] } })
    await Promise.all([p1, p2])
    await flushPromises()

    const names = (setup.supplies as Array<{ name: string }>).map(s => s.name)
    expect(names).toEqual(['新學期品'])
    wrapper.unmount()
  })
})

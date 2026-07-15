import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'

// ── API mocks（先 mock 再 import view）──────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getAttendanceSessions: vi.fn(),
  createAttendanceSession: vi.fn(),
  createAttendanceSessionsBatch: vi.fn(),
  deleteAttendanceSession: vi.fn(),
  getAttendanceSession: vi.fn(),
  batchUpdateAttendance: vi.fn(),
  exportAttendanceSession: vi.fn(),
  getAttendanceSessionRollPdf: vi.fn(),
  getCourses: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

vi.mock('@/utils/printPdfWindow', () => ({
  openPdfInNewTab: vi.fn(),
}))

// loadCourses 現帶 termStore 學期（口徑對齊他頁）→ mock store 提供固定學期
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  getAttendanceSessions,
  getAttendanceSession,
  batchUpdateAttendance,
  createAttendanceSessionsBatch,
  getCourses,
} from '@/api/activity'
import { hasPermission } from '@/utils/auth'
import ActivityAttendanceView from '../ActivityAttendanceView.vue'

const asMock = (fn: unknown): Mock => fn as Mock

function makeDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

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
      (slots.default?.() || []).map((vnode: VNode, index: number) =>
        h(vnode.type as string, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
      ),
    )
  },
})

// el-button stub：帶原生 event 物件 emit，支援 @click.stop
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        onClick: (e: Event) => emit('click', e),
      },
      slots.default?.(),
    )
  },
})

const ElSwitchStub = defineComponent({
  name: 'ElSwitchStub',
  props: {
    modelValue: { type: [Boolean, String, Number], default: null },
    activeValue: { type: [Boolean, String, Number], default: true },
    inactiveValue: { type: [Boolean, String, Number], default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'change'],
  template: '<input type="checkbox" :disabled="disabled" />',
})

const ElPaginationStub = defineComponent({
  name: 'ElPaginationStub',
  props: {
    total: { type: Number, default: 0 },
    currentPage: { type: Number, default: 1 },
    pageSize: { type: Number, default: 20 },
  },
  emits: ['update:currentPage', 'update:pageSize', 'change'],
  template: '<div class="el-pagination" />',
})

const GLOBAL_STUBS = {
  teleport: true,
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-switch': ElSwitchStub,
  'el-pagination': ElPaginationStub,
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-select': defineComponent({
    name: 'ElSelectStub',
    emits: ['change', 'update:modelValue'],
    template: '<div><slot /></div>',
  }),
  'el-option': true,
  'el-date-picker': { template: '<input />' },
  'el-button-group': { template: '<div><slot /></div>' },
  'el-space': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-progress': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-collapse': { template: '<div><slot /></div>' },
  'el-collapse-item': { template: '<div><slot name="title" /><slot /></div>' },
}

const sampleSessionRow = {
  id: 101,
  course_name: '音樂律動',
  session_date: '2026-06-13',
  recorded_count: 0,
  present_count: 0,
  notes: '',
  created_by: 'admin',
}

/** 模擬後端 JSON：students 與 groups 為兩棵獨立物件樹 */
function buildSessionDetail() {
  const students = [
    { registration_id: 11, student_id: 1, classroom_id: 1, student_name: '王小明', class_name: '蘋果班', is_present: null, attendance_notes: '' },
    { registration_id: 12, student_id: 2, classroom_id: 1, student_name: '李小華', class_name: '蘋果班', is_present: null, attendance_notes: '' },
    { registration_id: 13, student_id: 3, classroom_id: null, student_name: '陳小美', class_name: '', is_present: null, attendance_notes: '' },
  ]
  return {
    id: 101,
    course_id: 1,
    course_name: '音樂律動',
    session_date: '2026-06-13',
    notes: '',
    created_by: 'admin',
    students,
    total: students.length,
    present_count: 0,
    absent_count: 0,
    groups: [
      { classroom_id: 1, classroom_name: '蘋果班', students: students.slice(0, 2).map(s => ({ ...s })) },
      { classroom_id: null, classroom_name: '未分班', students: [{ ...students[2] }] },
    ],
  }
}

async function mountView({ total = 1 }: { total?: number } = {}) {
  asMock(getCourses).mockResolvedValue({ data: { courses: [{ id: 1, name: '音樂律動' }] } })
  asMock(getAttendanceSessions).mockResolvedValue({ data: { items: [sampleSessionRow], total } })
  asMock(getAttendanceSession).mockImplementation(async () => ({ data: buildSessionDetail() }))
  asMock(batchUpdateAttendance).mockResolvedValue({ data: { ok: true } })

  const wrapper = mount(ActivityAttendanceView, {
    global: {
      stubs: GLOBAL_STUBS,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

async function openDrawer(wrapper: Awaited<ReturnType<typeof mountView>>) {
  const btn = wrapper.findAll('button').find(b => b.text() === '點名')
  expect(btn).toBeTruthy()
  await btn!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  asMock(hasPermission).mockReturnValue(true)
})

describe('ActivityAttendanceView — 分組點名單一資料源（A1）', () => {
  it('開 drawer 不再帶 group_by 參數（分組為純前端視圖）', async () => {
    const wrapper = await mountView()
    await openDrawer(wrapper)
    expect(getAttendanceSession).toHaveBeenCalledWith(101, {})
  })

  it('分組模式「全班出席」後儲存，payload 含該班全部異動（修前靜默丟失）', async () => {
    const wrapper = await mountView()
    await openDrawer(wrapper)

    // 分組模式預設開啟，渲染出每班「全班出席」
    const groupBtns = wrapper.findAll('button').filter(b => b.text() === '全班出席')
    expect(groupBtns.length).toBe(2)
    await groupBtns[0].trigger('click') // 蘋果班（zh-Hant 排序在前，未分班最後）

    const saveBtn = wrapper.findAll('button').find(b => b.text() === '儲存點名')
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(batchUpdateAttendance).toHaveBeenCalledTimes(1)
    const [sessionId, records] = asMock(batchUpdateAttendance).mock.calls[0] as [number, Array<{ registration_id: number; is_present: boolean }>]
    expect(sessionId).toBe(101)
    expect(records.map(r => r.registration_id).sort()).toEqual([11, 12])
    expect(records.every(r => r.is_present === true)).toBe(true)
  })

  it('部分成功時 admin 入口重抓權威名冊，且不以被略過的輸入刷新列表統計', async () => {
    const wrapper = await mountView()
    await openDrawer(wrapper)
    asMock(getAttendanceSessions).mockClear()
    asMock(batchUpdateAttendance).mockResolvedValueOnce({
      data: { ok: true, updated: 0, skipped: 1 },
    })
    asMock(getAttendanceSession).mockResolvedValueOnce({ data: buildSessionDetail() })

    const allPresent = wrapper.findAll('button').find(b => b.text() === '全部出席')
    await allPresent!.trigger('click')
    const saveBtn = wrapper.findAll('button').find(b => b.text() === '儲存點名')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(getAttendanceSession).toHaveBeenCalledTimes(2)
    expect(getAttendanceSessions).toHaveBeenCalledTimes(1)
    expect((wrapper.vm as unknown as { drawerVisible: boolean }).drawerVisible).toBe(true)
    expect((wrapper.vm as unknown as { drawerPresentCount: number }).drawerPresentCount).toBe(0)
  })
})

describe('ActivityAttendanceView — drawer 寫入按鈕蓋 canWrite（A2）', () => {
  it('READ-only 使用者看不到儲存點名/全部出席/全班出席等寫入按鈕', async () => {
    asMock(hasPermission).mockReturnValue(false)
    const wrapper = await mountView()
    await openDrawer(wrapper)

    const texts = wrapper.findAll('button').map(b => b.text())
    expect(texts).not.toContain('儲存點名')
    expect(texts).not.toContain('全部出席')
    expect(texts).not.toContain('全部缺席')
    expect(texts).not.toContain('全班出席')
    expect(texts).not.toContain('全班缺席')
    // 唯讀仍可列印/匯出
    expect(texts).toContain('列印點名單')
    expect(texts).toContain('匯出 Excel')
    // 點名 switch 一併 disabled（排除頂部分組切換 switch）
    const studentSwitches = wrapper.findAllComponents(ElSwitchStub).filter(s => s.props('modelValue') !== true && s.props('modelValue') !== false)
    expect(studentSwitches.length).toBeGreaterThan(0)
    expect(studentSwitches.every(s => s.props('disabled') === true)).toBe(true)
  })

  it('有寫入權限時按鈕照常顯示', async () => {
    const wrapper = await mountView()
    await openDrawer(wrapper)

    const texts = wrapper.findAll('button').map(b => b.text())
    expect(texts).toContain('儲存點名')
    expect(texts).toContain('全部出席')
    expect(texts).toContain('全班出席')
  })
})

describe('ActivityAttendanceView — 場次列表分頁（A3）', () => {
  it('初始載入帶 skip=0 / limit=20，並把 total 接到分頁器', async () => {
    const wrapper = await mountView({ total: 45 })
    expect(getAttendanceSessions).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, limit: 20 }),
    )
    const pagination = wrapper.findComponent(ElPaginationStub)
    expect(pagination.exists()).toBe(true)
    expect(pagination.props('total')).toBe(45)
  })

  it('換頁時以新 skip 重新載入', async () => {
    const wrapper = await mountView({ total: 45 })
    const pagination = wrapper.findComponent(ElPaginationStub)
    pagination.vm.$emit('update:currentPage', 2)
    pagination.vm.$emit('change')
    await flushPromises()
    expect(asMock(getAttendanceSessions).mock.lastCall?.[0]).toMatchObject({ skip: 20, limit: 20 })
  })

  it('變更篩選條件時回到第一頁', async () => {
    const wrapper = await mountView({ total: 45 })
    const pagination = wrapper.findComponent(ElPaginationStub)
    pagination.vm.$emit('update:currentPage', 2)
    pagination.vm.$emit('change')
    await flushPromises()

    // 第一個 el-select 是課程篩選
    const select = wrapper.findComponent({ name: 'ElSelectStub' })
    select.vm.$emit('change')
    await flushPromises()
    expect(asMock(getAttendanceSessions).mock.lastCall?.[0]).toMatchObject({ skip: 0, limit: 20 })
  })

  it('total 為 0 時不渲染分頁器', async () => {
    asMock(getCourses).mockResolvedValue({ data: { courses: [] } })
    asMock(getAttendanceSessions).mockResolvedValue({ data: { items: [], total: 0 } })
    const wrapper = mount(ActivityAttendanceView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()
    expect(wrapper.findComponent(ElPaginationStub).exists()).toBe(false)
  })
})

describe('ActivityAttendanceView — 切學期亂序回應守衛（P2）', () => {
  it('舊學期 loadSessions 慢回應不得覆蓋新學期場次列表', async () => {
    // 快速切學期時，舊學期的 loadSessions 慢回應可能晚於新學期回來；若無守衛會
    // 覆蓋新學期列表，使用者遂能依 row ID 刪到舊學期場次。守衛須丟棄過時回應。
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      loadSessions: () => Promise<void>
      sessions: Array<{ id: number }>
    }

    // 第一次（舊學期）：回應卡住
    const deferredOld = makeDeferred<{ data: { items: Array<{ id: number }>; total: number } }>()
    asMock(getAttendanceSessions).mockReturnValueOnce(deferredOld.promise)
    vm.loadSessions()

    // 第二次（新學期）：快速回應，帶新學期場次
    asMock(getAttendanceSessions).mockResolvedValueOnce({
      data: { items: [{ ...sampleSessionRow, id: 202, course_name: '新學期場次' }], total: 1 },
    })
    await vm.loadSessions()
    await flushPromises()
    expect(vm.sessions.map((s) => s.id)).toEqual([202])

    // 舊學期慢回應此刻才回來
    deferredOld.resolve({
      data: { items: [{ ...sampleSessionRow, id: 101, course_name: '舊學期場次' }], total: 1 },
    })
    await flushPromises()

    // 守衛應丟棄舊學期回應，列表仍為新學期
    expect(vm.sessions.map((s) => s.id)).toEqual([202])
  })

  it('舊學期 loadCourses 慢回應不得覆蓋新學期課程下拉', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      loadCourses: () => Promise<void>
      courses: Array<{ id: number }>
    }

    const deferredOld = makeDeferred<{ data: { courses: Array<{ id: number }> } }>()
    asMock(getCourses).mockReturnValueOnce(deferredOld.promise)
    vm.loadCourses()

    asMock(getCourses).mockResolvedValueOnce({
      data: { courses: [{ id: 2, name: '新學期課程' }] },
    })
    await vm.loadCourses()
    await flushPromises()
    expect(vm.courses.map((c) => c.id)).toEqual([2])

    deferredOld.resolve({ data: { courses: [{ id: 1, name: '舊學期課程' }] } })
    await flushPromises()

    expect(vm.courses.map((c) => c.id)).toEqual([2])
  })
})

describe('ActivityAttendanceView — 批次產生場次（A4）', () => {
  it('有寫入權限時顯示「批次產生場次」按鈕', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('button').map(b => b.text())).toContain('批次產生場次')
  })

  it('填妥表單送出：帶 weekday payload + 重載列表', async () => {
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 4, skipped_existing: 1 } })
    const wrapper = await mountView()
    asMock(getAttendanceSessions).mockClear()
    // @ts-expect-error script-setup 內部 ref 經 test-utils 暴露於 vm
    wrapper.vm.batchForm = { course_id: 1, weekday: 2, start_date: '2026-06-01', end_date: '2026-06-30', notes: 'x' }
    // @ts-expect-error 同上
    await wrapper.vm.handleBatchCreate()
    await flushPromises()
    expect(createAttendanceSessionsBatch).toHaveBeenCalledWith({
      course_id: 1, start_date: '2026-06-01', end_date: '2026-06-30', notes: 'x', weekday: 2,
    })
    expect(getAttendanceSessions).toHaveBeenCalled()
  })

  it('weekday 留空 → payload 不帶 weekday（後端用課程預設）', async () => {
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 2, skipped_existing: 0 } })
    const wrapper = await mountView()
    // @ts-expect-error 同上
    wrapper.vm.batchForm = { course_id: 1, weekday: null, start_date: '2026-06-01', end_date: '2026-06-30', notes: '' }
    // @ts-expect-error 同上
    await wrapper.vm.handleBatchCreate()
    await flushPromises()
    const payload = asMock(createAttendanceSessionsBatch).mock.calls[0][0] as Record<string, unknown>
    expect('weekday' in payload).toBe(false)
  })

  it('缺課程 → 不呼叫 API', async () => {
    const wrapper = await mountView()
    // @ts-expect-error 同上
    wrapper.vm.batchForm = { course_id: null, weekday: null, start_date: '2026-06-01', end_date: '2026-06-30', notes: '' }
    // @ts-expect-error 同上
    await wrapper.vm.handleBatchCreate()
    expect(createAttendanceSessionsBatch).not.toHaveBeenCalled()
  })
})

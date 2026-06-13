import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'

// ── API mocks（先 mock 再 import view）──────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getAttendanceSessions: vi.fn(),
  createAttendanceSession: vi.fn(),
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

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  getAttendanceSessions,
  getAttendanceSession,
  batchUpdateAttendance,
  getCourses,
} from '@/api/activity'
import { hasPermission } from '@/utils/auth'
import ActivityAttendanceView from '../ActivityAttendanceView.vue'

const asMock = (fn: unknown): Mock => fn as Mock

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

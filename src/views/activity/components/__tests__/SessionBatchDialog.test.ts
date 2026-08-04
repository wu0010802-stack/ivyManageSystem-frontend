/**
 * SessionBatchDialog — 批次產生場次的預覽 → 勾選 → 建立流程（actbatchauto01）。
 *
 * 重點行為：開啟即預覽（起訖日交給後端取學期範圍）、日期可個別取消、
 * 只送 status='new' 的日期、行事曆未同步時要誠實提示未排除假日。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'

vi.mock('@/api/activity', () => ({
  previewAttendanceSessionsBatch: vi.fn(),
  createAttendanceSessionsBatch: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import {
  previewAttendanceSessionsBatch,
  createAttendanceSessionsBatch,
} from '@/api/activity'
import SessionBatchDialog from '../SessionBatchDialog.vue'

const asMock = (fn: unknown): Mock => fn as Mock

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

const GLOBAL_STUBS = {
  teleport: true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-date-picker': { template: '<input />' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-alert': { template: '<div class="el-alert" :data-title="title" />', props: ['title'] },
  'el-check-tag': { template: '<span class="check-tag"><slot /></span>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
}

const COURSES = [
  { id: 1, name: '音樂律動' },
  { id: 2, name: '陶土' },
]

function previewPayload(overrides: Record<string, unknown> = {}) {
  return {
    resolved_start_date: '2026-06-01',
    resolved_end_date: '2026-06-30',
    range_source: 'term',
    calendar_synced: true,
    total_new: 3,
    courses: [
      {
        course_id: 1,
        course_name: '音樂律動',
        weekdays: [2],
        dates: [
          { date: '2026-06-03', status: 'new', holiday_name: null },
          { date: '2026-06-10', status: 'exists', holiday_name: null },
          { date: '2026-06-17', status: 'holiday', holiday_name: '端午節' },
          { date: '2026-06-24', status: 'new', holiday_name: null },
        ],
        new_count: 2,
        exists_count: 1,
        holiday_count: 1,
        expected_sessions: null,
        warning: null,
      },
      {
        course_id: 2,
        course_name: '陶土',
        weekdays: [0],
        dates: [{ date: '2026-06-01', status: 'new', holiday_name: null }],
        new_count: 1,
        exists_count: 0,
        holiday_count: 0,
        expected_sessions: null,
        warning: null,
      },
    ],
    ...overrides,
  }
}

async function mountDialog(preview = previewPayload()) {
  asMock(previewAttendanceSessionsBatch).mockResolvedValue({ data: preview })
  const wrapper = mount(SessionBatchDialog, {
    props: { modelValue: true, courses: COURSES },
    global: { stubs: GLOBAL_STUBS },
  })
  // el-dialog 被 stub 掉不會發 open 事件，直接呼叫初始化（等同開啟）
  // @ts-expect-error script-setup 內部函式經 test-utils 暴露於 vm
  wrapper.vm.onOpen()
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SessionBatchDialog — 開啟即預覽', () => {
  it('預設全選課程、不帶日期（讓後端取學期範圍）', async () => {
    await mountDialog()
    expect(previewAttendanceSessionsBatch).toHaveBeenCalledWith({
      course_ids: [1, 2],
      skip_holidays: true,
    })
  })

  it('只預選單一課程時只帶該課程', async () => {
    asMock(previewAttendanceSessionsBatch).mockResolvedValue({ data: previewPayload() })
    const wrapper = mount(SessionBatchDialog, {
      props: { modelValue: true, courses: COURSES, defaultCourseId: 2 },
      global: { stubs: GLOBAL_STUBS },
    })
    // @ts-expect-error 同上
    wrapper.vm.onOpen()
    await flushPromises()
    expect(previewAttendanceSessionsBatch).toHaveBeenCalledWith({
      course_ids: [2],
      skip_holidays: true,
    })
  })

  it('日期選擇器顯示後端回傳的學期起訖', async () => {
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    expect(wrapper.vm.displayStartDate).toBe('2026-06-01')
    // @ts-expect-error 同上
    expect(wrapper.vm.displayEndDate).toBe('2026-06-30')
  })

  it('總計只算 status=new 的日期', async () => {
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    expect(wrapper.vm.totalSelected).toBe(3)
  })
})

describe('SessionBatchDialog — 送出', () => {
  it('只送 new 日期，已存在與假日不進 payload', async () => {
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 3, skipped_existing: 0 } })
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    await wrapper.vm.handleSubmit()
    await flushPromises()
    expect(createAttendanceSessionsBatch).toHaveBeenCalledWith({
      items: [
        { course_id: 1, dates: ['2026-06-03', '2026-06-24'] },
        { course_id: 2, dates: ['2026-06-01'] },
      ],
    })
  })

  it('取消勾選某日期後該日不進 payload', async () => {
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 2, skipped_existing: 0 } })
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    wrapper.vm.toggleDate(1, { date: '2026-06-03', status: 'new', holiday_name: null })
    await flushPromises()
    // @ts-expect-error 同上
    expect(wrapper.vm.totalSelected).toBe(2)
    // @ts-expect-error 同上
    await wrapper.vm.handleSubmit()
    const payload = asMock(createAttendanceSessionsBatch).mock.calls[0][0] as { items: { course_id: number; dates: string[] }[] }
    expect(payload.items[0].dates).toEqual(['2026-06-24'])
  })

  it('已存在／假日的日期無法被勾選（toggle 無效）', async () => {
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    wrapper.vm.toggleDate(1, { date: '2026-06-17', status: 'holiday', holiday_name: '端午節' })
    // @ts-expect-error 同上
    expect(wrapper.vm.totalSelected).toBe(3)
  })

  it('全部取消後不呼叫建立 API', async () => {
    const wrapper = await mountDialog()
    for (const [courseId, iso] of [[1, '2026-06-03'], [1, '2026-06-24'], [2, '2026-06-01']] as const) {
      // @ts-expect-error 同上
      wrapper.vm.toggleDate(courseId, { date: iso, status: 'new', holiday_name: null })
    }
    // @ts-expect-error 同上
    await wrapper.vm.handleSubmit()
    expect(createAttendanceSessionsBatch).not.toHaveBeenCalled()
  })

  it('建立成功後關閉 dialog 並通知父層重載', async () => {
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 3, skipped_existing: 1 } })
    const wrapper = await mountDialog()
    // @ts-expect-error 同上
    await wrapper.vm.handleSubmit()
    await flushPromises()
    expect(wrapper.emitted('created')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('SessionBatchDialog — 行事曆未同步', () => {
  it('calendar_synced=false 時顯示未排除假日警告', async () => {
    const wrapper = await mountDialog(previewPayload({ calendar_synced: false }))
    const titles = wrapper.findAll('.el-alert').map(el => el.attributes('data-title'))
    expect(titles.some(t => t?.includes('未排除國定假日'))).toBe(true)
  })

  it('calendar_synced=true 時不顯示該警告', async () => {
    const wrapper = await mountDialog()
    const titles = wrapper.findAll('.el-alert').map(el => el.attributes('data-title'))
    expect(titles.some(t => t?.includes('未排除國定假日'))).toBe(false)
  })
})

describe('SessionBatchDialog — 單課問題不擋整批', () => {
  it('有 warning 的課程不計入總數，其他課程照常可送出', async () => {
    const payload = previewPayload()
    payload.courses[0] = {
      ...payload.courses[0],
      dates: [],
      new_count: 0,
      exists_count: 0,
      holiday_count: 0,
      warning: '未設定每週上課星期，請先於課程設定，或在上方指定上課星期',
    }
    asMock(createAttendanceSessionsBatch).mockResolvedValue({ data: { created_count: 1, skipped_existing: 0 } })
    const wrapper = await mountDialog(payload)
    // @ts-expect-error 同上
    expect(wrapper.vm.totalSelected).toBe(1)
    // @ts-expect-error 同上
    await wrapper.vm.handleSubmit()
    expect(createAttendanceSessionsBatch).toHaveBeenCalledWith({
      items: [{ course_id: 2, dates: ['2026-06-01'] }],
    })
  })
})

describe('SessionBatchDialog — 參數變更', () => {
  it('手動填齊起訖日後預覽帶上日期', async () => {
    const wrapper = await mountDialog()
    asMock(previewAttendanceSessionsBatch).mockClear()
    // @ts-expect-error 同上
    wrapper.vm.onStartDateChange('2026-06-05')
    // @ts-expect-error 同上
    wrapper.vm.onEndDateChange('2026-06-20')
    await new Promise(resolve => setTimeout(resolve, 350))
    await flushPromises()
    expect(previewAttendanceSessionsBatch).toHaveBeenLastCalledWith({
      course_ids: [1, 2],
      start_date: '2026-06-05',
      end_date: '2026-06-20',
      skip_holidays: true,
    })
  })

  it('只填起始日（未填結束日）→ 不帶日期，仍交給後端取學期範圍', async () => {
    const wrapper = await mountDialog()
    asMock(previewAttendanceSessionsBatch).mockClear()
    // @ts-expect-error 同上
    wrapper.vm.onStartDateChange('2026-06-05')
    await new Promise(resolve => setTimeout(resolve, 350))
    await flushPromises()
    expect(previewAttendanceSessionsBatch).toHaveBeenLastCalledWith({
      course_ids: [1, 2],
      skip_holidays: true,
    })
  })
})

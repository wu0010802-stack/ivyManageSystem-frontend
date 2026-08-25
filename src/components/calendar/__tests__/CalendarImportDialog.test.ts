/**
 * calimp01 分校行事曆匯入 dialog：
 * - preview → commit 兩段式；error row 永不進 commit payload
 * - visibility=parent 必須明確確認（逐列 checkbox 或批次按鈕）才可送出
 * - Excel/preview 回傳的 admin 預設值原樣送出（不會被自動改成 parent）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import CalendarImportDialog from '@/components/calendar/CalendarImportDialog.vue'

const apiMocks = vi.hoisted(() => ({
  importEventsPreview: vi.fn(),
  importEventsCommit: vi.fn(),
}))
vi.mock('@/api/events', () => apiMocks)

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// table stub：data 灌給 column stub、column 逐 row 呼叫 default slot
const ElTableColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (slots.default?.() || []).map((vnode, index) =>
          h(
            vnode.type as never,
            { ...vnode.props, data: props.data, key: index },
            vnode.children as never,
          ),
        ),
      )
  },
})
const DialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () =>
      props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null
  },
})

// el-* 未全域註冊（tests/setup.js 不裝 ElementPlus）——互動元件用自訂 stub
const UploadStub = defineComponent({
  name: 'UploadStub',
  props: { onChange: { type: Function, default: null } },
  setup(props, { slots }) {
    return () => h('div', { 'data-test': 'upload-stub' }, slots.default?.())
  },
})
const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { slots, emit, attrs }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          onClick: () => {
            if (!props.disabled) emit('click')
          },
        },
        slots.default?.(),
      )
  },
})
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean, size: String },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () =>
      h('input', {
        ...attrs,
        type: 'checkbox',
        checked: props.modelValue,
        onChange: (e: Event) =>
          emit('update:modelValue', (e.target as HTMLInputElement).checked),
      })
  },
})

const globalStubs = {
  'el-dialog': DialogStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-upload': UploadStub,
  'el-button': ButtonStub,
  'el-checkbox': CheckboxStub,
}

const PREVIEW_ROWS = [
  {
    row_number: 2,
    source_row_key: 'k-admin',
    title: '計算薪資',
    start_date: '2026-08-28',
    end_date: '2026-09-03',
    description: null,
    category: 'administration',
    visibility: 'admin',
    academic_year: 115,
    semester: 'first',
    week_no: 2,
    owner_employee_no: null,
    owner_employee_id: null,
    owner_employee_name: null,
    event_type: 'general',
    location: null,
    requires_acknowledgment: false,
    ack_deadline: null,
    is_duplicate: false,
    errors: [],
    warnings: [],
  },
  {
    row_number: 3,
    source_row_key: 'k-parent',
    title: '開學日',
    start_date: '2026-08-03',
    end_date: null,
    description: null,
    category: 'activity',
    visibility: 'parent',
    academic_year: 115,
    semester: 'first',
    week_no: null,
    owner_employee_no: null,
    owner_employee_id: null,
    owner_employee_name: null,
    event_type: 'activity',
    location: null,
    requires_acknowledgment: false,
    ack_deadline: null,
    is_duplicate: false,
    errors: [],
    warnings: ['家長可見候選'],
  },
  {
    row_number: 4,
    source_row_key: 'k-error',
    title: '10//6教室清潔檢查',
    start_date: null,
    end_date: null,
    description: null,
    category: 'environment',
    visibility: 'staff',
    academic_year: 115,
    semester: 'first',
    week_no: null,
    owner_employee_no: null,
    owner_employee_id: null,
    owner_employee_name: null,
    event_type: 'general',
    location: null,
    requires_acknowledgment: false,
    ack_deadline: null,
    is_duplicate: false,
    errors: ['start_date 必填（日期缺漏或原文疑似錯字，請人工修正）'],
    warnings: [],
  },
]

const SUMMARY = {
  total: 3,
  importable: 2,
  error_rows: 1,
  warning_rows: 1,
  duplicates: 0,
  parent_candidates: 1,
}

async function mountToPreview() {
  const wrapper = mount(CalendarImportDialog, {
    props: { modelValue: true },
    global: { stubs: globalStubs },
  })
  apiMocks.importEventsPreview.mockResolvedValue({
    data: { rows: PREVIEW_ROWS, summary: SUMMARY },
  })
  // 模擬選檔（透過 upload stub 的 on-change prop）
  const upload = wrapper.findComponent(UploadStub)
  const onChange = upload.props('onChange') as (f: { raw: File }) => void
  onChange({ raw: new File(['x'], 'cal.xlsx') })
  await wrapper.vm.$nextTick()
  await wrapper.find('[data-test="preview-button"]').trigger('click')
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CalendarImportDialog', () => {
  it('preview 後顯示摘要，錯誤列標示且 commit 數量只算可匯入列', async () => {
    const wrapper = await mountToPreview()
    expect(apiMocks.importEventsPreview).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="import-summary"]').text()).toContain('共 3 列')
    expect(wrapper.find('[data-test="row-errors"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="commit-button"]').text()).toContain('2 列')
  })

  it('有未確認的 parent 列時 commit 按鈕 disabled；批次確認後才可送出', async () => {
    const wrapper = await mountToPreview()
    const commitBtn = wrapper.find('[data-test="commit-button"]')
    expect(commitBtn.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-test="confirm-all-parents"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(
      wrapper.find('[data-test="commit-button"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('commit payload：排除 error 列、admin 列原樣、parent 列帶明確確認 flag', async () => {
    apiMocks.importEventsCommit.mockResolvedValue({
      data: { message: 'ok', created: 2, updated: 0, total: 2 },
    })
    const wrapper = await mountToPreview()
    await wrapper.find('[data-test="confirm-all-parents"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="commit-button"]').trigger('click')
    await flushPromises()

    expect(apiMocks.importEventsCommit).toHaveBeenCalledTimes(1)
    const payload = apiMocks.importEventsCommit.mock.calls[0][0] as {
      rows: Record<string, unknown>[]
    }
    const keys = payload.rows.map((r) => r.source_row_key)
    expect(keys).toEqual(['k-admin', 'k-parent'])
    const adminRow = payload.rows[0]
    expect(adminRow.visibility).toBe('admin')
    expect(adminRow.parent_visibility_confirmed).toBe(false)
    expect(adminRow.category).toBe('administration')
    const parentRow = payload.rows[1]
    expect(parentRow.visibility).toBe('parent')
    expect(parentRow.parent_visibility_confirmed).toBe(true)
    // 匯入成功後通知父層刷新
    expect(wrapper.emitted('imported')).toBeTruthy()
  })

  it('沒有 parent 列時 commit 直接可用（visibility 預設 admin 安全）', async () => {
    const wrapper = mount(CalendarImportDialog, {
      props: { modelValue: true },
      global: { stubs: globalStubs },
    })
    apiMocks.importEventsPreview.mockResolvedValue({
      data: {
        rows: [PREVIEW_ROWS[0]],
        summary: { ...SUMMARY, total: 1, importable: 1, error_rows: 0, parent_candidates: 0 },
      },
    })
    const upload = wrapper.findComponent(UploadStub)
    const onChange = upload.props('onChange') as (f: { raw: File }) => void
    onChange({ raw: new File(['x'], 'cal.xlsx') })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="preview-button"]').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(
      wrapper.find('[data-test="commit-button"]').attributes('disabled'),
    ).toBeUndefined()
  })
})

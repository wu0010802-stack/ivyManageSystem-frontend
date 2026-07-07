import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

// ── API mocks（先 mock 再 import 元件）─────────────────────
vi.mock('@/api/institutionEvents', () => ({
  listInstitutionEvents: vi.fn(),
  getInstitutionEvent: vi.fn(),
  createInstitutionEvent: vi.fn(),
  updateInstitutionEvent: vi.fn(),
  deleteInstitutionEvent: vi.fn(),
  replaceInstitutionEventAbsences: vi.fn(),
  syncInstitutionEventsToAppraisal: vi.fn(),
}))
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

// ── store mocks ────────────────────────────────────────────
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1, setTerm: vi.fn() }),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    employees: [
      { id: 1, name: '王雅玲', is_active: true },
      { id: 2, name: '李行政', is_active: true },
    ],
    fetchEmployees: vi.fn(),
  }),
}))

// ── 權限 mock（可切換）─────────────────────────────────────
const permState = { canWrite: true }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn((name: string) => name === 'APPRAISAL_EVENT_WRITE' && permState.canWrite),
}))

import {
  listInstitutionEvents,
  getInstitutionEvent,
  createInstitutionEvent,
  updateInstitutionEvent,
  deleteInstitutionEvent,
  replaceInstitutionEventAbsences,
  syncInstitutionEventsToAppraisal,
} from '@/api/institutionEvents'
import { getAppraisalCurrentCycle } from '@/api/appraisal'
import { ElMessage } from 'element-plus'
import InstitutionEventPanel from '@/views/appraisal/components/InstitutionEventPanel.vue'

const mockList = vi.mocked(listInstitutionEvents)
const mockDetail = vi.mocked(getInstitutionEvent)
const mockCreate = vi.mocked(createInstitutionEvent)
const mockUpdate = vi.mocked(updateInstitutionEvent)
const mockDelete = vi.mocked(deleteInstitutionEvent)
const mockReplace = vi.mocked(replaceInstitutionEventAbsences)
const mockSync = vi.mocked(syncInstitutionEventsToAppraisal)
const mockCurrentCycle = vi.mocked(getAppraisalCurrentCycle)

// ── 逐欄抄後端契約（InstitutionEventOut：hours 為 Decimal 序列化字串）──
const EVENT_ROW = {
  id: 5,
  title: '自我提升講座',
  event_type: 'self_improvement',
  event_date: '2026-10-01',
  hours: '2.0',
  score_item_code: 'SELF_IMPROVEMENT_ACTIVITY',
  note: null,
  created_by: 1,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  absence_count: 1,
}

// InstitutionEventDetailOut = Out + absences（AbsenceOut）
const EVENT_DETAIL = {
  ...EVENT_ROW,
  absences: [
    { employee_id: 2, employee_name: '李行政', is_exempt: false, exempt_reason: null },
  ],
}

// ── Element Plus stubs（仿 ManualEventEntrySection.spec.js）──
const dataAttrsOf = (attrs: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading'],
  emits: ['click'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...dataAttrsOf(attrs),
          ...(props.disabled || props.loading ? { disabled: 'disabled' } : {}),
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    return () =>
      props.modelValue
        ? h('div', { ...dataAttrsOf(attrs) }, [slots.default?.(), slots.footer?.()])
        : null
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] }, label: { type: String, default: '' }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row, $index: index }) : [String(row[props.prop] ?? '')]),
        ),
      )
  },
})

function flattenSlotVnodes(vnodes: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const v of (vnodes || []) as Record<string, unknown>[]) {
    if (v && typeof v.type === 'symbol' && Array.isArray(v.children)) {
      out.push(...flattenSlotVnodes(v.children as unknown[]))
    } else if (v && v.type) {
      out.push(v)
    }
  }
  return out
}

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  inheritAttrs: false,
  setup(props, { slots, attrs }) {
    return () => {
      const flat = flattenSlotVnodes(slots.default?.() || [])
      return h(
        'div',
        { class: 'el-table', ...dataAttrsOf(attrs) },
        flat.map((vnode, index) =>
          h(vnode.type as never, { ...(vnode.props as object), data: props.data, key: index }, vnode.children as never),
        ),
      )
    }
  },
})

const ElInputStub = defineComponent({
  name: 'ElInputStub',
  props: ['modelValue', 'maxlength', 'placeholder', 'type', 'rows'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...dataAttrsOf(attrs),
        value: props.modelValue ?? '',
        ...(props.maxlength != null ? { maxlength: String(props.maxlength) } : {}),
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      })
  },
})

const ElDatePickerStub = defineComponent({
  name: 'ElDatePickerStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...dataAttrsOf(attrs),
        value: props.modelValue ?? '',
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      })
  },
})

const ElInputNumberStub = defineComponent({
  name: 'ElInputNumberStub',
  props: ['modelValue', 'min', 'max', 'precision', 'step'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...dataAttrsOf(attrs),
        type: 'number',
        value: props.modelValue ?? 0,
        onInput: (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value)),
      })
  },
})

const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: ['modelValue', 'clearable'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(_props, { attrs }) {
    // 不渲染 option；測試以 findComponent().vm.$emit 驅動（含 clearable × → undefined 路徑）
    return () => h('div', { ...dataAttrsOf(attrs), class: 'el-select-stub' })
  },
})

const ElSwitchStub = defineComponent({
  name: 'ElSwitchStub',
  props: ['modelValue', 'activeText', 'inactiveText'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...dataAttrsOf(attrs),
        type: 'checkbox',
        checked: !!props.modelValue,
        onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked),
      })
  },
})

const Passthrough = (name: string) =>
  defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('div', { ...dataAttrsOf(attrs) }, slots.default?.())
    },
  })

const ElAlertStub = defineComponent({
  name: 'ElAlertStub',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () =>
      h('div', { class: 'el-alert', ...dataAttrsOf(attrs) },
        [slots.title?.(), slots.default?.()].filter(Boolean))
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-dialog': ElDialogStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-input': ElInputStub,
  'el-input-number': ElInputNumberStub,
  'el-date-picker': ElDatePickerStub,
  'el-select': ElSelectStub,
  'el-option': Passthrough('ElOptionStub'),
  'el-switch': ElSwitchStub,
  'el-card': Passthrough('ElCardStub'),
  'el-form': Passthrough('ElFormStub'),
  'el-form-item': Passthrough('ElFormItemStub'),
  'el-alert': ElAlertStub,
  'el-tag': Passthrough('ElTagStub'),
  'el-empty': Passthrough('ElEmptyStub'),
  'el-divider': Passthrough('ElDividerStub'),
  AcademicTermSelector: true,
}

const mountPanel = () =>
  mount(InstitutionEventPanel, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })

beforeEach(() => {
  vi.clearAllMocks()
  permState.canWrite = true
  mockList.mockResolvedValue({ data: [EVENT_ROW] } as never)
  mockDetail.mockResolvedValue({ data: EVENT_DETAIL } as never)
})

describe('InstitutionEventPanel 列表', () => {
  it('掛載即以 termStore 學期查詢並渲染列表', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(mockList).toHaveBeenCalledWith({ school_year: 114, semester: 1 })
    expect(w.text()).toContain('自我提升講座')
    // event_type=self_improvement 與 score_item_code=SELF_IMPROVEMENT_ACTIVITY
    // 統一顯示既有考核詞彙「自強活動」（對映修正後兩者同名）
    expect(w.text()).toContain('自強活動')
    expect(w.text()).not.toContain('自我提升活動')
  })
})

describe('InstitutionEventPanel 建立', () => {
  it('建立活動：POST 主檔後以 PUT replace-set 送缺席名單（is_exempt 送 null 走自動豁免）', async () => {
    mockCreate.mockResolvedValue({ data: { ...EVENT_ROW, id: 33, title: '尾牙', absence_count: 0 } } as never)
    mockReplace.mockResolvedValue({
      data: {
        event_id: 33,
        entries: [{ employee_id: 2, employee_name: '李行政', is_exempt: true, exempt_reason: '當日有核准婚假' }],
      },
    } as never)

    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="create-btn"]').trigger('click')
    await nextTick()
    expect(w.find('[data-test="create-dialog"]').exists()).toBe(true)

    await w.find('[data-test="create-title"]').setValue('尾牙')
    await w.find('[data-test="create-date"]').setValue('2027-01-15')
    w.findComponent('[data-test="create-type-select"]').vm.$emit('update:modelValue', 'year_end_party')
    await w.find('[data-test="absent-switch-2"]').setValue(true)
    await w.find('[data-test="create-submit-btn"]').trigger('click')
    await flushPromises()

    expect(mockCreate).toHaveBeenCalledWith({
      title: '尾牙',
      event_type: 'year_end_party',
      event_date: '2027-01-15',
      hours: 2,
      score_item_code: null,
      note: null,
    })
    expect(mockReplace).toHaveBeenCalledWith(33, {
      entries: [{ employee_id: 2, is_exempt: null, exempt_reason: null }],
    })
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('豁免 1'))
  })

  it('缺標題不送出', async () => {
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="create-btn"]').trigger('click')
    await nextTick()
    await w.find('[data-test="create-submit-btn"]').trigger('click')
    await flushPromises()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('InstitutionEventPanel 編輯（score_item_code 清空防丟欄）', () => {
  it('el-select clearable × 產生 undefined 時，PATCH payload 仍帶顯式 score_item_code: null', async () => {
    mockUpdate.mockResolvedValue({ data: { ...EVENT_ROW, score_item_code: null } } as never)
    const w = mountPanel()
    await flushPromises()

    await w.find('[data-test="edit-btn-5"]').trigger('click')
    await nextTick()
    expect(w.find('[data-test="edit-dialog"]').exists()).toBe(true)

    // 模擬 clearable × 把 model 設成 undefined（repo 判例：不可只測 null 假綠）
    w.findComponent('[data-test="edit-score-select"]').vm.$emit('update:modelValue', undefined)
    await nextTick()
    await w.find('[data-test="edit-submit-btn"]').trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [eventId, payload] = mockUpdate.mock.calls[0]
    expect(eventId).toBe(5)
    // JSON round-trip 後欄位必須存活且為 null（undefined 會被 JSON.stringify 丟欄）
    const wireJson = JSON.parse(JSON.stringify(payload))
    expect('score_item_code' in wireJson).toBe(true)
    expect(wireJson.score_item_code).toBeNull()
    expect(wireJson.title).toBe('自我提升講座')
  })
})

describe('InstitutionEventPanel 缺席名單（replace-set）', () => {
  it('整包送出：既有列保留顯式 is_exempt、新勾列送 null，回應顯示自動豁免結果', async () => {
    mockReplace.mockResolvedValue({
      data: {
        event_id: 5,
        entries: [
          { employee_id: 1, employee_name: '王雅玲', is_exempt: true, exempt_reason: '當日有核准婚假' },
          { employee_id: 2, employee_name: '李行政', is_exempt: false, exempt_reason: null },
        ],
      },
    } as never)

    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="absence-btn-5"]').trigger('click')
    await flushPromises()
    expect(mockDetail).toHaveBeenCalledWith(5)
    expect(w.find('[data-test="absence-dialog"]').exists()).toBe(true)

    // 既有缺席者（emp 2）開關應為勾選
    expect((w.find('[data-test="abs-switch-2"]').element as HTMLInputElement).checked).toBe(true)

    // 新勾 emp 1 缺席（未指定豁免 → 送 null）
    await w.find('[data-test="abs-switch-1"]').setValue(true)
    await w.find('[data-test="absence-submit-btn"]').trigger('click')
    await flushPromises()

    expect(mockReplace).toHaveBeenCalledWith(5, {
      entries: [
        { employee_id: 1, is_exempt: null, exempt_reason: null },
        { employee_id: 2, is_exempt: false, exempt_reason: null },
      ],
    })

    // 回應套回列狀態：emp 1 顯示後端自動建議（可覆寫）
    expect(w.findComponent('[data-test="exempt-select-1"]').props('modelValue')).toBe('exempt')
    expect(w.findComponent('[data-test="exempt-reason-1"]').props('modelValue')).toBe('當日有核准婚假')
  })
})

describe('InstitutionEventPanel 考核同步', () => {
  it('dry-run 預覽：取當期週期 → 同步預覽 → item_code 轉中文 + skipped_equal 顯示', async () => {
    mockCurrentCycle.mockResolvedValue({ data: { id: 12, status: 'OPEN' } } as never)
    mockSync.mockResolvedValue({
      data: {
        applied: false,
        changes: [
          {
            participant_id: 1,
            employee_id: 1,
            employee_name: '王雅玲',
            item_code: 'SELF_IMPROVEMENT_ACTIVITY',
            old_count: '1',
            new_count: '2',
            old_note: null,
          },
        ],
        skipped_equal: 3,
      },
    } as never)

    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="sync-btn"]').trigger('click')
    await flushPromises()

    expect(mockCurrentCycle).toHaveBeenCalledWith({ school_year: 114, semester: 1 })
    expect(mockSync).toHaveBeenCalledWith(12, { dryRun: true })
    const dialog = w.find('[data-test="sync-dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('自強活動')
    expect(dialog.text()).toContain('王雅玲')
    expect(dialog.text()).toContain('3')
  })

  it('確認套用：dryRun=false 後關閉並提示', async () => {
    mockCurrentCycle.mockResolvedValue({ data: { id: 12, status: 'OPEN' } } as never)
    mockSync
      .mockResolvedValueOnce({
        data: { applied: false, changes: [], skipped_equal: 0 },
      } as never)
      .mockResolvedValueOnce({
        data: { applied: true, changes: [], skipped_equal: 0 },
      } as never)

    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="sync-btn"]').trigger('click')
    await flushPromises()
    await w.find('[data-test="sync-confirm-btn"]').trigger('click')
    await flushPromises()

    expect(mockSync).toHaveBeenLastCalledWith(12, { dryRun: false })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(w.find('[data-test="sync-dialog"]').exists()).toBe(false)
  })
})

describe('InstitutionEventPanel 刪除與權限', () => {
  it('刪除：確認後呼叫 DELETE 並刷新列表', async () => {
    mockDelete.mockResolvedValue({ data: { message: '已刪除機構活動', id: 5 } } as never)
    const w = mountPanel()
    await flushPromises()
    mockList.mockClear()
    await w.find('[data-test="delete-btn-5"]').trigger('click')
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith(5)
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('無 APPRAISAL_EVENT_WRITE：建立/同步/編輯/刪除按鈕不渲染，名單（唯讀入口）仍可見', async () => {
    permState.canWrite = false
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="create-btn"]').exists()).toBe(false)
    expect(w.find('[data-test="sync-btn"]').exists()).toBe(false)
    expect(w.find('[data-test="edit-btn-5"]').exists()).toBe(false)
    expect(w.find('[data-test="delete-btn-5"]').exists()).toBe(false)
    expect(w.find('[data-test="absence-btn-5"]').exists()).toBe(true)
  })
})

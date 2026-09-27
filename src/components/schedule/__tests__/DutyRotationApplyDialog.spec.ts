/**
 * 套用預覽 dialog：開啟即 dry-run；只覆寫勾選的手動列（Review Focus #4）。
 *
 * Final fix FE-1（最終審查 I3）追加鎖定：
 * - 每列顯示「目前 X → 輪值表 Y」（班別名稱，含已停用；查不到顯示 #id）
 * - 選起始週（含「全部週」）變更會重新 dry-run
 * - 本週以前的變動列分到獨立群組並顯示警示
 * - 已封存／已有打卡略過列收成計數（可展開明細），手動略過列仍逐筆列出
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockApply } = vi.hoisted(() => ({ mockApply: vi.fn() }))
vi.mock('@/api/dutyRotations', () => ({ applyDutyRotation: mockApply }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({
    shiftTypes: [
      { id: 5, name: '晚車', work_start: '09:00', work_end: '18:00', is_active: true },
      { id: 6, name: '早車', work_start: '07:00', work_end: '16:30', is_active: true },
      { id: 9, name: '停用班別', work_start: '08:00', work_end: '17:00', is_active: false },
    ],
    fetchShiftTypes: vi.fn(),
  }),
}))

import DutyRotationApplyDialog from '../DutyRotationApplyDialog.vue'

// 比照 src/views/__tests__/ScheduleView.test.ts 的 stub 慣例（EP 元件在測試不註冊）
const globalConfig = {
  stubs: {
    'el-dialog': {
      props: ['modelValue', 'title', 'width'],
      template: '<div v-if="modelValue" class="dlg"><slot /><slot name="footer" /></div>',
    },
    'el-button': {
      props: ['type', 'loading', 'disabled', 'size', 'link'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-select': {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div class="sel" :data-value="String(modelValue)"><slot /></div>',
    },
    'el-option': {
      props: ['label', 'value'],
      template: '<div class="opt" :data-value="String(value)">{{ label }}</div>',
    },
  },
}

const WEEKS = [
  { week_start_date: '2026-09-14', label: '05' },
  { week_start_date: '2026-09-21', label: '06' },
]

const change = (over: Record<string, unknown>) => ({
  employee_id: 1, employee_name: '王老師', week_start_date: '2026-09-14',
  from_shift_type_id: 5, to_shift_type_id: 6, label: '早車', action: 'create', skip_reason: null, ...over,
})

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(DutyRotationApplyDialog, {
    props: { modelValue: true, rotationId: 7, fromWeekStart: null, weeks: WEEKS, ...props },
    global: globalConfig,
  })

describe('DutyRotationApplyDialog', () => {
  beforeEach(() => {
    // 固定「今天」＝ 2026-09-23（週三）→ 本週一 = 2026-09-21，讓「本週以前」分組
    // 判定不受實跑當下真實日期影響（Final fix FE-1 要求）。
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T09:00:00'))
    mockApply.mockReset()
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { create: 1, skip: 1 },
        changes: [
          change({}),
          change({ employee_id: 2, employee_name: '李老師', action: 'skip', skip_reason: 'manual' }),
          change({ employee_id: 3, employee_name: '陳老師', week_start_date: '2026-09-21', action: 'skip', skip_reason: 'manual' }),
        ],
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('開啟即 dry-run 並顯示手動列', async () => {
    const wrapper = mountDialog({ fromWeekStart: '2026-09-14' })
    await flushPromises()
    expect(mockApply).toHaveBeenCalledWith(7, { dry_run: true, from_week_start: '2026-09-14', overwrite_manual: [] })
    expect(wrapper.findAll('[data-test="overwrite-checkbox"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('行政手動設定過')
  })

  it('overwrites only checked manual rows', async () => {
    const wrapper = mountDialog({ fromWeekStart: null })
    await flushPromises()
    await wrapper.findAll('[data-test="overwrite-checkbox"]')[1].setValue(true)
    mockApply.mockResolvedValueOnce({ data: { applied: true, counts: {}, changes: [] } })
    await wrapper.find('[data-test="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(mockApply).toHaveBeenLastCalledWith(7, {
      dry_run: false,
      from_week_start: null,
      overwrite_manual: [{ employee_id: 3, week_start_date: '2026-09-21' }],
    })
    expect(wrapper.emitted('applied')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('每列顯示「目前 X → 輪值表 Y」（班別名稱；create 無目前顯示（無））', async () => {
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { create: 1, removed: 1 },
        changes: [
          change({ employee_id: 1, from_shift_type_id: null, to_shift_type_id: 6, action: 'create' }),
          change({ employee_id: 2, week_start_date: '2026-09-21', from_shift_type_id: 9, to_shift_type_id: null, action: 'removed' }),
          change({ employee_id: 3, week_start_date: '2026-09-21', from_shift_type_id: 5, to_shift_type_id: 999, action: 'update' }),
        ],
      },
    })
    const wrapper = mountDialog()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('目前 （無） → 輪值表 早車') // create：無目前
    expect(text).toContain('目前 停用班別 → 輪值表 （無）') // removed：無輪值表；停用班別仍可查到名稱
    expect(text).toContain('目前 晚車 → 輪值表 #999') // 查不到的 id 顯示 #id
  })

  it('選起始週會以新值重新 dry-run', async () => {
    const wrapper = mountDialog({ fromWeekStart: null })
    await flushPromises()
    expect(mockApply).toHaveBeenCalledTimes(1)
    const select = wrapper.findComponent('[data-test="from-week-select"]')
    await select.vm.$emit('update:modelValue', '2026-09-21')
    await flushPromises()
    expect(mockApply).toHaveBeenLastCalledWith(7, {
      dry_run: true, from_week_start: '2026-09-21', overwrite_manual: [],
    })
    // 確認套用時要送目前選到的起始週，不是 props 原始值
    mockApply.mockResolvedValueOnce({ data: { applied: true, counts: {}, changes: [] } })
    await wrapper.find('[data-test="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(mockApply).toHaveBeenLastCalledWith(7, {
      dry_run: false, from_week_start: '2026-09-21', overwrite_manual: [],
    })
  })

  it('本週以前的變動列分到獨立群組並顯示警示', async () => {
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { create: 2 },
        changes: [
          change({ employee_id: 1, week_start_date: '2026-09-14', action: 'create' }), // 本週以前
          change({ employee_id: 2, week_start_date: '2026-09-21', action: 'create' }), // 本週
        ],
      },
    })
    const wrapper = mountDialog()
    await flushPromises()
    const warning = wrapper.find('[data-test="before-this-week-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('將改動 1 筆本週以前的週班表，會以目前的班級老師展開')
  })

  it('沒有本週以前的變動時不顯示警示', async () => {
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { create: 1 },
        changes: [change({ employee_id: 1, week_start_date: '2026-09-21', action: 'create' })],
      },
    })
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('[data-test="before-this-week-warning"]').exists()).toBe(false)
  })

  it('finalized/recorded 略過列收成計數，可展開明細；manual 略過列仍逐筆列出並保留勾選', async () => {
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { skip: 4 },
        changes: [
          change({ employee_id: 1, employee_name: '王老師', action: 'skip', skip_reason: 'finalized' }),
          change({ employee_id: 2, employee_name: '李老師', action: 'skip', skip_reason: 'finalized' }),
          change({ employee_id: 3, employee_name: '陳老師', action: 'skip', skip_reason: 'recorded' }),
          change({ employee_id: 4, employee_name: '林老師', action: 'skip', skip_reason: 'manual' }),
        ],
      },
    })
    const wrapper = mountDialog()
    await flushPromises()

    const collapsed = wrapper.find('[data-test="collapsed-skips"]')
    expect(collapsed.exists()).toBe(true)
    expect(collapsed.text()).toContain('已封存略過 2 筆')
    expect(collapsed.text()).toContain('已有打卡略過 1 筆')
    // finalized/recorded 不逐筆列出（不能在展開前就看到姓名）
    expect(wrapper.find('[data-test="collapsed-skip-list"]').exists()).toBe(false)
    // manual 略過列仍逐筆列出且保留 checkbox
    expect(wrapper.findAll('[data-test="overwrite-checkbox"]')).toHaveLength(1)

    await wrapper.find('[data-test="toggle-collapsed-skips"]').trigger('click')
    const list = wrapper.find('[data-test="collapsed-skip-list"]')
    expect(list.exists()).toBe(true)
    expect(list.text()).toContain('王老師')
    expect(list.text()).toContain('李老師')
    expect(list.text()).toContain('陳老師')
  })
})

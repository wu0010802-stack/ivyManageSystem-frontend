import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { cell, grid, WEEK, W1 } from '@/components/schedule-attendance/__tests__/gridFixtures'
import type { ApplyChange } from '@/utils/dutyRotationGrid'

const api = vi.hoisted(() => ({ grid: vi.fn(), saveDaily: vi.fn() }))
const ui = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/shifts', () => ({ saveDaily: api.saveDaily }))
vi.mock('element-plus', async (orig) => ({
  ...(await orig<typeof import('element-plus')>()),
  ElMessage: { success: ui.success, warning: ui.warning, error: ui.error },
}))

import RecordedFollowUpDialog from '../RecordedFollowUpDialog.vue'

const BatchStub = { name: 'BatchConfirmDialog', props: ['modelValue', 'units', 'employeeNames', 'shiftNames'], emits: ['done', 'update:modelValue'], template: '<div data-test="batch-stub" />' }
const CHANGE: ApplyChange = {
  employee_id: 1, employee_name: '林班導', week_start_date: W1, from_shift_type_id: 1, to_shift_type_id: 2,
  label: '晚車', action: 'skip', skip_reason: 'recorded', recorded_dates: ['2026-09-15', '2026-09-16'],
}
const RECORDED = { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' as const }
// 沒有出勤寫入權限時，後端對已打卡格回 confirm=false、locked_reason='no_permission'
const RECORDED_NO_PERMISSION = { plan: false, confirm: false, recorded: true, locked_reason: 'no_permission' as const }

function weekGrid(overrides: { canConfirm?: boolean } = {}) {
  const canConfirm = overrides.canConfirm ?? true
  return grid({
    caller: { can_view_attendance: true, can_edit_plan: true, can_confirm: canConfirm, can_edit_attendance: true },
    cells: [
      cell(1, WEEK[0]), // 9/14 未打卡、可改
      cell(1, WEEK[1], { edit: canConfirm ? RECORDED : RECORDED_NO_PERMISSION, actual: { version: 'v'.repeat(64) } }), // 9/15 已打卡
      cell(1, WEEK[2], { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'self' }, actual: {} }), // 9/16 本人
      cell(1, WEEK[3], { edit: { plan: false, confirm: false, recorded: false, locked_reason: 'finalized' } }), // 9/17 已封存
      cell(1, WEEK[4]), // 9/18 未打卡、可改
      cell(1, WEEK[5], { plan: { expected: false } }), // 週六：不處理
    ],
  })
}

function mountDialog() {
  return mount(RecordedFollowUpDialog, {
    props: { modelValue: true, change: CHANGE, shiftNames: { 1: '早車', 2: '晚車' } },
    global: {
      plugins: [ElementPlus],
      stubs: {
        BatchConfirmDialog: BatchStub,
        ElDialog: { name: 'ElDialog', props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>' },
      },
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.grid.mockResolvedValue({ data: weekGrid() })
  api.saveDaily.mockResolvedValue({ data: {} })
})

describe('RecordedFollowUpDialog（D-08）', () => {
  it('讀該週格子，工作日拆成：未打卡＝每日調整、已打卡＝逐日確認、本人／已封存＝無法處理', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: W1, end_date: '2026-09-20' })
    expect(wrapper.find('[data-test="rfu-daily"]').text()).toContain('9/14、9/18')
    expect(wrapper.find('[data-test="rfu-confirm"]').text()).toContain('9/15')
    expect(wrapper.find('[data-test="rfu-blocked"]').text()).toContain('9/16、9/17')
  })

  it('送出每日調整：逐日送輪值表班別，成功後通知並重讀', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="rfu-daily-submit"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily.mock.calls.map((c) => c[0])).toEqual([
      { employee_id: 1, date: '2026-09-14', shift_type_id: 2 },
      { employee_id: 1, date: '2026-09-18', shift_type_id: 2 },
    ])
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(api.grid).toHaveBeenCalledTimes(2)
  })

  it('某天剛好變成已打卡（409）：其餘照送，提示改用逐日確認，不顯示原始錯誤（Review Focus #5）', async () => {
    api.saveDaily
      .mockRejectedValueOnce({ response: { status: 409 }, displayMessage: '該日已有出勤紀錄，請至「班表與打卡核對」確認當日班別' })
      .mockResolvedValueOnce({ data: {} })
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="rfu-daily-submit"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily).toHaveBeenCalledTimes(2)
    expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining('9/14 剛有打卡'))
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('已打卡日開批次確認：以各格版本組 units', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="rfu-confirm-open"]').trigger('click')
    const batch = wrapper.findComponent(BatchStub)
    expect(batch.props('modelValue')).toBe(true)
    expect(batch.props('units')).toEqual([
      { items: [{ employee_id: 1, date: '2026-09-15', shift_type_id: 2, day_off: false, version: 'v'.repeat(64) }] },
    ])
    batch.vm.$emit('done', 1)
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('沒有出勤寫入權限：已打卡日照列出，但確認鈕停用並說明', async () => {
    api.grid.mockResolvedValue({ data: weekGrid({ canConfirm: false }) })
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('[data-test="rfu-confirm"]').text()).toContain('9/15')
    expect(wrapper.find('[data-test="rfu-confirm-open"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="rfu-confirm-denied"]').exists()).toBe(true)
    // no_permission 的已打卡格仍歸「逐日確認（停用）」，不被當成無法處理
    expect(wrapper.find('[data-test="rfu-blocked"]').text()).not.toContain('9/15')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { cell, grid, WEEK, W1 } from '@/components/schedule-attendance/__tests__/gridFixtures'
import type { ApplyChange } from '@/utils/dutyRotationGrid'

const api = vi.hoisted(() => ({ grid: vi.fn(), saveDaily: vi.fn(), batch: vi.fn() }))
const ui = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/shifts', () => ({ saveDaily: api.saveDaily }))
vi.mock('@/api/attendanceReconciliation', () => ({ confirmReconciliationShiftBatch: api.batch }))
vi.mock('element-plus', async (orig) => ({
  ...(await orig<typeof import('element-plus')>()),
  ElMessage: { success: ui.success, warning: ui.warning, error: ui.error },
}))

import RecordedFollowUpDialog from '../RecordedFollowUpDialog.vue'

const BatchStub = { name: 'BatchConfirmDialog', props: ['modelValue', 'units', 'employeeNames', 'shiftNames', 'appendToBody'], emits: ['done', 'update:modelValue'], template: '<div data-test="batch-stub" />' }
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
    expect(wrapper.find('[data-test="rfu-kept"]').exists()).toBe(false) // 沒有個別調整的日子就不顯示這段
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

  it('批次確認部分失敗（對話框保持開啟）後 RFU 重讀格子：傳給批次確認的 units 仍是開啟當下的快照，結果列不錯位', async () => {
    const OPENED = [{ items: [{ employee_id: 1, date: '2026-09-15', shift_type_id: 2, day_off: false, version: 'v'.repeat(64) }] }]
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="rfu-confirm-open"]').trigger('click')
    expect(wrapper.findComponent(BatchStub).props('units')).toEqual(OPENED)
    // 9/15 已確認成功：重讀後來源變每日調整，移到「已有個別調整」，live 的 units 縮成空
    api.grid.mockResolvedValue({
      data: grid({
        cells: [
          cell(1, WEEK[0]),
          cell(1, WEEK[1], { plan: { source: 'daily' }, edit: RECORDED, actual: { version: 'v'.repeat(64) } }),
          cell(1, WEEK[2], { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'self' }, actual: {} }),
          cell(1, WEEK[3], { edit: { plan: false, confirm: false, recorded: false, locked_reason: 'finalized' } }),
          cell(1, WEEK[4]),
          cell(1, WEEK[5], { plan: { expected: false } }),
        ],
      }),
    })
    wrapper.findComponent(BatchStub).vm.$emit('done', 1)
    await flushPromises()
    expect(wrapper.find('[data-test="rfu-kept"]').text()).toContain('9/15（每日調整）') // 畫面已是重讀後的結果
    expect(wrapper.find('[data-test="rfu-confirm-open"]').attributes('disabled')).toBeDefined() // 開啟鈕仍看 live units
    const batch = wrapper.findComponent(BatchStub)
    expect(batch.props('modelValue')).toBe(true)
    expect(batch.props('units')).toEqual(OPENED)
  })

  it('已有個別調整（換班／排休／每日調整）的日子不更動：兩桶都排除，另列「已有個別調整」，送出每日調整與批次確認都不含它們', async () => {
    api.grid.mockResolvedValue({
      data: grid({
        cells: [
          cell(1, WEEK[0], { plan: { source: 'swap' } }), // 9/14 未打卡、換班
          cell(1, WEEK[1], { plan: { source: 'daily_off', day_off: true } }), // 9/15 未打卡、排休
          cell(1, WEEK[2], { plan: { source: 'daily' }, edit: RECORDED, actual: { version: 'k'.repeat(64) } }), // 9/16 已打卡、每日調整
          cell(1, WEEK[3]), // 9/17 未打卡、週排班 → 每日調整
          cell(1, WEEK[4], { edit: RECORDED, actual: { version: 'w'.repeat(64) } }), // 9/18 已打卡、週排班 → 逐日確認
          cell(1, WEEK[5], { plan: { expected: false } }),
        ],
      }),
    })
    const wrapper = mountDialog()
    await flushPromises()
    const kept = wrapper.find('[data-test="rfu-kept"]').text()
    expect(kept).toContain('9/14（換班）')
    expect(kept).toContain('9/15（排休）')
    expect(kept).toContain('9/16（每日調整）')
    const daily = wrapper.find('[data-test="rfu-daily"]').text()
    expect(daily).toContain('9/17')
    for (const d of ['9/14', '9/15', '9/16']) expect(daily).not.toContain(d)
    const confirm = wrapper.find('[data-test="rfu-confirm"]').text()
    expect(confirm).toContain('9/18')
    for (const d of ['9/14', '9/15', '9/16']) expect(confirm).not.toContain(d)

    await wrapper.find('[data-test="rfu-daily-submit"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily.mock.calls.map((c) => c[0])).toEqual([{ employee_id: 1, date: '2026-09-17', shift_type_id: 2 }])

    await wrapper.find('[data-test="rfu-confirm-open"]').trigger('click')
    expect(wrapper.findComponent(BatchStub).props('units')).toEqual([
      { items: [{ employee_id: 1, date: '2026-09-18', shift_type_id: 2, day_off: false, version: 'w'.repeat(64) }] },
    ])
  })

  it('批次確認對話框要 append-to-body：RFU 本身巢狀在套用對話框的遮罩裡，不 teleport 會被蓋住', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.findComponent(BatchStub).props('appendToBody')).toBe(true)
  })

  it('append-to-body 一路透傳到真正的 el-dialog（BatchConfirmDialog → FormDialog → el-dialog）', async () => {
    api.batch.mockResolvedValue({ data: { dry_run: true, applied_count: 0, results: [] } })
    const wrapper = mount(RecordedFollowUpDialog, {
      props: { modelValue: true, change: CHANGE, shiftNames: { 1: '早車', 2: '晚車' } },
      global: {
        plugins: [ElementPlus],
        // 不 stub BatchConfirmDialog／FormDialog；ElDialog 以標題區分 RFU 與批次確認，並暴露 appendToBody
        stubs: {
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue', 'title', 'appendToBody'],
            template: '<section v-if="modelValue" :data-title="title" :data-append="String(appendToBody)"><slot /><slot name="footer" /></section>',
          },
        },
      },
    })
    await flushPromises()
    await wrapper.find('[data-test="rfu-confirm-open"]').trigger('click')
    await flushPromises()
    const batchDialog = wrapper.find('[data-title="逐日確認當日班別"]')
    expect(batchDialog.exists()).toBe(true)
    expect(batchDialog.attributes('data-append')).toBe('true')
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

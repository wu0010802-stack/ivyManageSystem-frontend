import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BatchConfirmDialog from '../BatchConfirmDialog.vue'
import type { BatchUnit } from '@/utils/scheduleAttendanceGrid'
import { WEEK } from './gridFixtures'

const api = vi.hoisted(() => ({ batch: vi.fn() }))
const message = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ confirmReconciliationShiftBatch: api.batch }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message }))

const unit = (employeeId: number, date: string): BatchUnit => ({
  items: [{ employee_id: employeeId, date, shift_type_id: 2, day_off: false, version: 'a'.repeat(64) }],
})

function respond(units: BatchUnit[], dryRun: boolean, outcome: (i: number) => 'ok' | 'conflict' = () => 'ok') {
  const results = units.map((u, i) => {
    const kind = outcome(i)
    return {
      unit_index: i,
      date: u.items[0].date,
      employee_ids: u.items.map((it) => it.employee_id),
      outcome: kind,
      code: kind === 'ok' ? null : 'VERSION_MISMATCH',
      message: kind === 'ok' ? null : '班表、打卡或請假已更新，請重新核對',
      before: [{ employee_id: u.items[0].employee_id, status: 'possible_shift_change', late_minutes: 90, early_leave_minutes: 0 }],
      after: kind === 'ok' ? [{ employee_id: u.items[0].employee_id, status: 'matched', late_minutes: 0, early_leave_minutes: 0 }] : [],
    }
  })
  return { data: { dry_run: dryRun, applied_count: dryRun ? 0 : results.filter((r) => r.outcome === 'ok').length, results } }
}

function mountDialog(units: BatchUnit[]) {
  return mount(BatchConfirmDialog, {
    props: { modelValue: true, units, employeeNames: { 1: '林班導', 2: '王副導' }, shiftNames: { 2: '晚車' } },
    global: {
      plugins: [ElementPlus],
      stubs: {
        FormDialog: {
          props: ['modelValue', 'title', 'disabled', 'loading', 'submitText'],
          emits: ['submit', 'update:modelValue'],
          template:
            '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot />' +
            '<button data-test="form-dialog-submit" :disabled="disabled" @click="$emit(\'submit\')">{{ submitText }}</button></section>',
        },
      },
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.batch.mockImplementation(async (body: { units: BatchUnit[]; dry_run: boolean }) => respond(body.units, body.dry_run))
})

describe('BatchConfirmDialog', () => {
  it('開啟即以 dry_run 試算，表格列出前後差異', async () => {
    const wrapper = mountDialog([unit(1, WEEK[0]), unit(2, WEEK[1])])
    await flushPromises()
    expect(api.batch).toHaveBeenCalledWith(expect.objectContaining({ dry_run: true }))
    const text = wrapper.find('[data-test="batch-confirm-table"]').text()
    expect(text).toContain('林班導')
    expect(text).toContain('晚車')
    expect(text).toContain('疑似換班・遲到 90 分')
    expect(text).toContain('符合原班表')
    expect(text).toContain('可套用')
  })

  it('超過 100 個人日時預覽與送出用相同分批', async () => {
    const units = Array.from({ length: 101 }, (_, i) => unit(1, `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`))
    mountDialog(units)
    await flushPromises()
    expect(api.batch.mock.calls.map(([body]) => body.units.length)).toEqual([100, 1])
  })

  it('原因必填；送出時用同一組 units、dry_run=false，全數成功即關閉並回報套用數', async () => {
    const units = [unit(1, WEEK[0])]
    const wrapper = mountDialog(units)
    await flushPromises()
    const submit = wrapper.find('[data-test="form-dialog-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.find('textarea[data-test="batch-confirm-reason"]').setValue('  依打卡改晚車  ')
    expect(submit.attributes('disabled')).toBeUndefined()
    await submit.trigger('click')
    await flushPromises()
    expect(api.batch).toHaveBeenLastCalledWith({ units, reason: '依打卡改晚車', dry_run: false })
    expect(wrapper.emitted('done')).toEqual([[1]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(message.success).toHaveBeenCalled()
  })

  it('部分衝突：保留對話框並顯示原因', async () => {
    api.batch.mockImplementation(async (body: { units: BatchUnit[]; dry_run: boolean }) =>
      respond(body.units, body.dry_run, (i) => (!body.dry_run && i === 1 ? 'conflict' : 'ok')),
    )
    const wrapper = mountDialog([unit(1, WEEK[0]), unit(2, WEEK[0])])
    await flushPromises()
    await wrapper.find('textarea[data-test="batch-confirm-reason"]').setValue('確認')
    await wrapper.find('[data-test="form-dialog-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(message.warning).toHaveBeenCalled()
    const outcomes = wrapper.findAll('[data-test="batch-confirm-outcome"]').map((w) => w.text())
    expect(outcomes).toEqual(['已套用', '資料已更新，請重新整理'])
  })
})

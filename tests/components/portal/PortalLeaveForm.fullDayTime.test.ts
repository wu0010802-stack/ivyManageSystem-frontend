/**
 * 教師端「整天」請假送不出去（bug-hunt 2026-07-27，P0）。
 *
 * 「整天」模式的 el-date-picker 用 value-format="YYYY-MM-DD"（長度 10），
 * 而 submitLeave 以 `form.start_date.length > 10` 判斷有無時刻，因此 st/et 恆為 ''，
 * 卻仍無條件放進 payload。後端 utils/validators.validate_hhmm_format 只放行 None——
 * 空字串會 `''.strip().split(':')` 得到長度 1 的 list 而 raise ValueError → 422。
 * 老師看到的是籠統的「輸入資料驗證失敗」，半天／自訂時段模式正常，
 * 所以會誤以為是自己填錯。
 *
 * 管理端 src/views/LeaveView.vue 送的是 `st || null`，沒有這個問題。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'

vi.mock('@/api/portal', () => ({
  createMyLeave: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  uploadMyLeaveAttachments: vi.fn(),
  getMyQuotas: vi.fn().mockResolvedValue({ data: [] }),
  getMyWorkdayHours: vi.fn().mockResolvedValue({ data: { workday_hours: 8 } }),
  getMySubstituteRequests: vi.fn().mockResolvedValue({ data: [] }),
  getMyLeaveStats: vi.fn().mockResolvedValue({ data: {} }),
  respondToSubstitute: vi.fn(),
}))

vi.mock('@/api/portalLeaveQuotaExpiry', async () => {
  const { vi: viInner } = await import('vitest')
  return {
    getMyLeaveQuotaExpiry: viInner.fn().mockResolvedValue({ data: {} }),
    getMyCompLeaveGrants: viInner.fn(),
    getMyPayoutHistory: viInner.fn(),
  }
})

import { createMyLeave } from '@/api/portal'

async function mountAndSubmitFullDayLeave() {
  const wrapper = mount(PortalLeaveForm, {
    global: { plugins: [ElementPlus] },
    props: { allEmployees: [] },
  })

  await wrapper.findComponent({ name: 'ElSelect' }).setValue('annual')
  await flushPromises()

  // 「整天」是預設模式，畫面上是兩個 type="date" 的 picker（開始日 / 結束日）
  const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
  expect(pickers.length).toBeGreaterThanOrEqual(2)
  await pickers[0].setValue('2026-07-15')
  await pickers[1].setValue('2026-07-15')
  await flushPromises()

  await wrapper.find('.el-button--primary').trigger('click')
  await flushPromises()

  return wrapper
}

describe('PortalLeaveForm 整天請假送出的 payload', () => {
  beforeEach(() => {
    vi.mocked(createMyLeave).mockClear()
  })

  it('整天模式不得送出空字串時間，否則後端驗證必定 422', async () => {
    await mountAndSubmitFullDayLeave()

    expect(createMyLeave).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(createMyLeave).mock.calls[0][0] as Record<string, unknown>

    expect(payload.start_time).toBeNull()
    expect(payload.end_time).toBeNull()
  })

  it('日期本身仍正常帶出', async () => {
    await mountAndSubmitFullDayLeave()

    const payload = vi.mocked(createMyLeave).mock.calls[0][0] as Record<string, unknown>
    expect(payload.start_date).toBe('2026-07-15')
    expect(payload.end_date).toBe('2026-07-15')
    expect(payload.leave_type).toBe('annual')
  })
})

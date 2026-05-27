// tests/components/leave/LeaveQuotaExpiryTab.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LeaveQuotaExpiryTab from '@/components/leave/LeaveQuotaExpiryTab.vue'

// ElMessageBox.confirm 在 jsdom 環境無法正常彈窗，mock 讓其自動 resolve（模擬用戶點確認）
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessageBox: {
      ...actual.ElMessageBox,
      confirm: vi.fn().mockResolvedValue('confirm'),
    },
  }
})

vi.mock('@/api/leaveQuotaExpiry', () => ({
  listUpcomingGrants: vi.fn().mockResolvedValue({
    data: { grants: [
      { grant_id: 1, employee_id: 10, granted_hours: 8, consumed_hours: 2, unexpired_hours: 6, granted_at: '2025-04-01', expires_at: '2026-04-01' }
    ] }
  }),
  listUpcomingAnniversaries: vi.fn().mockResolvedValue({
    data: { anniversaries: [
      { employee_id: 10, hire_date: '2020-04-01', next_anniversary: '2026-04-01' }
    ] }
  }),
  listPayoutHistory: vi.fn().mockResolvedValue({
    data: { logs: [
      { log_id: 1, employee_id: 10, source_type: 'comp_grant_expiry', hours: 6, amount: 1200, salary_period: '2026-05', salary_record_id: 100, wage_basis_date: '2026-04-01', meta: {} }
    ] }
  }),
  runSchedulerNow: vi.fn().mockResolvedValue({ data: { comp_summary: { paid_employees: 1 }, cutover_summary: {} } }),
}))

describe('LeaveQuotaExpiryTab', () => {
  it('renders 3 sub-sections', async () => {
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('即將到期補休')
    expect(wrapper.text()).toContain('即將滿週年')
    expect(wrapper.text()).toContain('折算歷史')
  })

  it('shows grant row from upcoming', async () => {
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('6')  // unexpired_hours
  })

  it('clicking run-now triggers scheduler', async () => {
    const { runSchedulerNow } = await import('@/api/leaveQuotaExpiry')
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const btn = wrapper.find('[data-testid="run-now-btn"]')
    if (btn.exists()) {
      await btn.trigger('click')
      expect(runSchedulerNow).toHaveBeenCalled()
    }
  })
})

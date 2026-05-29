// tests/components/portal/PortalLeaveForm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'

// mock portal API（getMyQuotas、getMyWorkdayHours）
vi.mock('@/api/portal', () => ({
  createMyLeave: vi.fn(),
  uploadMyLeaveAttachments: vi.fn(),
  getMyQuotas: vi.fn().mockResolvedValue({ data: [] }),
  getMyWorkdayHours: vi.fn().mockResolvedValue({ data: { workday_hours: 8 } }),
  getMySubstituteRequests: vi.fn().mockResolvedValue({ data: [] }),
  getMyLeaveStats: vi.fn().mockResolvedValue({ data: {} }),
  respondToSubstitute: vi.fn(),
}))

// mock portalLeaveQuotaExpiry — use async import to avoid hoisting issue
vi.mock('@/api/portalLeaveQuotaExpiry', async () => {
  const { vi: viInner } = await import('vitest')
  return {
    getMyLeaveQuotaExpiry: viInner.fn().mockResolvedValue({
      data: {
        compensatory_balance: 12.5,
        earliest_expiring_grant: {
          expires_at: '2026-07-31',
          unexpired_hours: 8.0,
        },
        next_anniversary: null,
        expected_payout_month: null,
      },
    }),
    getMyCompLeaveGrants: viInner.fn(),
    getMyPayoutHistory: viInner.fn(),
  }
})

describe('PortalLeaveForm — 補休到期 warning', () => {
  it('選擇補休後顯示結餘和最早到期 grant warning', async () => {
    const wrapper = mount(PortalLeaveForm, {
      global: { plugins: [ElementPlus] },
      props: { allEmployees: [] },
    })

    // 預設不顯示 warning
    expect(wrapper.find('.comp-expiry-warning').exists()).toBe(false)

    // 選擇補休假別
    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.setValue('compensatory')
    await flushPromises()

    // 應顯示 warning
    const alert = wrapper.find('.comp-expiry-warning')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('12.5 h')
    expect(alert.text()).toContain('2026-07-31')
    expect(alert.text()).toContain('8.0 h')
  })

  it('選其他假別不顯示補休 warning', async () => {
    const wrapper = mount(PortalLeaveForm, {
      global: { plugins: [ElementPlus] },
      props: { allEmployees: [] },
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.setValue('annual')
    await flushPromises()

    expect(wrapper.find('.comp-expiry-warning').exists()).toBe(false)
  })
})

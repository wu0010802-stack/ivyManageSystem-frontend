import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyCompLeaveGrants: vi.fn().mockResolvedValue({
    data: {
      grants: [
        {
          grant_id: 1,
          granted_hours: 8,
          consumed_hours: 2,
          remaining_hours: 6,
          granted_at: '2026-04-01',
          expires_at: '2027-04-01',
          status: 'active',
          expired_at: null,
        },
      ],
    },
  }),
  getMyPayoutHistory: vi.fn().mockResolvedValue({
    data: {
      logs: [
        {
          log_id: 1,
          source_type: 'comp_grant_expiry',
          hours: 4,
          hourly_wage: 200,
          amount: 800,
          wage_basis_date: '2026-04-01',
          salary_period: '2026-05',
          meta: {},
        },
      ],
    },
  }),
}))

import PortalLeaveHistoryView from '@/views/portal/PortalLeaveHistoryView.vue'

describe('PortalLeaveHistoryView', () => {
  it('renders grants and logs sections with chinese labels', async () => {
    const wrapper = mount(PortalLeaveHistoryView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('補休發放紀錄')
    expect(text).toContain('折算歷史')
    expect(text).toContain('有效') // status active → '有效'
    expect(text).toContain('補休到期') // source comp_grant_expiry → '補休到期'
    expect(text).toContain('800') // amount
  })

  it('shows page title', async () => {
    const wrapper = mount(PortalLeaveHistoryView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('補休歷史明細')
  })
})

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

  it('手機改渲染卡片：不再出現被擠窄的表格，狀態與來源標籤可見', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, media: '(max-width: 767.98px)', onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })
    try {
      const wrapper = mount(PortalLeaveHistoryView, {
        global: { plugins: [ElementPlus] },
      })
      await flushPromises()
      expect(wrapper.find('.el-table').exists()).toBe(false)
      expect(wrapper.findAll('.admin-list-cards').length).toBe(2)
      const text = wrapper.text()
      expect(text).toContain('2026-04-01 發放')
      expect(text).toContain('8h（已用 2h，剩 6h）')
      expect(text).toContain('有效')
      expect(text).toContain('補休到期')
      expect(text).toContain('$800')
      wrapper.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})

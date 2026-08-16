import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.setConfig({ testTimeout: 15000 })

// mock 形狀抄 RecruitmentBonusRosterOut 真實契約
const ROSTER = {
  campaign_id: 1,
  campaign_name: '115.03',
  account_masked: true,
  total_amount: 18438,
  rows: [
    {
      employee_id: 11,
      employee_name: '王雅玲',
      bank_code: '013',
      bank_account: '＊＊＊＊＊＊＊＊＊6436',
      bank_account_name: '王雅玲',
      amount: 12720,
      missing_account: false,
    },
    {
      employee_id: 12,
      employee_name: '孔祥盈',
      bank_code: null,
      bank_account: null,
      bank_account_name: null,
      amount: 1302,
      missing_account: true,
    },
  ],
}

vi.mock('@/api/recruitmentBonus', () => ({
  getTransferRoster: vi.fn(() => Promise.resolve({ data: ROSTER })),
}))

import TransferRosterTab from '../TransferRosterTab.vue'

describe('TransferRosterTab', () => {
  it('渲染名冊列與合計，缺帳號列有警示', async () => {
    const wrapper = mount(TransferRosterTab, { props: { campaignId: 1 } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('王雅玲')
    expect(text).toContain('6436')
    expect(text).toContain('18,438')
    expect(text).toContain('未填帳號')
  })

  it('account_masked 時顯示遮罩說明', async () => {
    const wrapper = mount(TransferRosterTab, { props: { campaignId: 1 } })
    await flushPromises()
    expect(wrapper.text()).toContain('帳號已遮罩')
  })
})

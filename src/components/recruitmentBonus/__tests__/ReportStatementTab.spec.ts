import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.setConfig({ testTimeout: 15000 })

// mock 形狀抄 RecruitmentBonusReportOut 真實契約
const REPORT = {
  campaign_id: 1,
  campaign_name: '115.03',
  status: 'open',
  total_amount: 12720,
  settled_mismatches: [],
  unassigned_rows: [],
  blocks: [
    {
      employee_id: 11,
      employee_name: '王雅玲',
      resigned: false,
      counted_persons: 15,
      unit_price: 2000,
      gross_amount: 12720,
      share_in: 0,
      share_out: 0,
      total_amount: 12720,
      formula_text: '(2000*13*0.3*1.5+2000*1*0.3*1+2000*1*0.3*0.7)',
      rows: [
        {
          attribution_id: 1,
          child_name: '黃翊睿',
          visit_grade: '幼幼班',
          point_code: 'self_report',
          point_label: '自報生（廣告／鄰居／網路／假日活動）',
          points: 0.3,
          grade_multiplier: 1.5,
          status: 'confirmed',
          employee_assigned: true,
          uncategorized: false,
        },
      ],
      deferred_rows: [
        {
          attribution_id: 2,
          child_name: '陳緒騰',
          visit_grade: null,
          point_code: 'self_report',
          point_label: '自報生（廣告／鄰居／網路／假日活動）',
          points: 0.3,
          grade_multiplier: 1.5,
          status: 'deferred',
          employee_assigned: true,
          uncategorized: false,
        },
      ],
    },
  ],
}

vi.mock('@/api/recruitmentBonus', () => ({
  getCampaignReport: vi.fn(() => Promise.resolve({ data: REPORT })),
}))

import ReportStatementTab from '../ReportStatementTab.vue'

describe('ReportStatementTab', () => {
  it('渲染每師區塊：師名/人數/單價/計算式/合計與下次核算', async () => {
    const wrapper = mount(ReportStatementTab, { props: { campaignId: 1 } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('王雅玲')
    expect(text).toContain('(2000*13*0.3*1.5+2000*1*0.3*1+2000*1*0.3*0.7)')
    expect(text).toContain('黃翊睿')
    expect(text).toContain('下次核算')
    expect(text).toContain('陳緒騰')
  })

  it('逐生欄位顯示點數與班別倍數', async () => {
    const wrapper = mount(ReportStatementTab, { props: { campaignId: 1 } })
    await flushPromises()
    expect(wrapper.text()).toContain('0.3')
    expect(wrapper.text()).toContain('1.5')
  })
})

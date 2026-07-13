import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecruitmentNoDepositTab from '../RecruitmentNoDepositTab.vue'

const baseProps = {
  showCharts: false,
  noDepositReasonBarData: null,
  noDepositGradeBarData: null,
  horizBarOptions: {},
  noDepositGradeOptions: {},
  barComponent: { template: '<div />' },
  reasonOptions: [],
  grades: ['幼幼班', '小班'],
  summary: {},
  page: 1,
  pageSize: 50,
  total: 0,
  records: [],
  loading: false,
}

describe('RecruitmentNoDepositTab 空狀態', () => {
  it('高潛力篩選下無資料時顯示「改看全部潛力」並可一鍵清除', async () => {
    const wrapper = mount(RecruitmentNoDepositTab, {
      props: { ...baseProps, priority: 'high' },
      global: { plugins: [ElementPlus] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('改看全部潛力'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('update:priority')?.[0]).toEqual([''])
    expect(wrapper.emitted('filter-change')).toBeTruthy()
  })

  it('未套潛力篩選且無資料時不顯示清除按鈕', () => {
    const wrapper = mount(RecruitmentNoDepositTab, {
      props: { ...baseProps, priority: '' },
      global: { plugins: [ElementPlus] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('改看全部潛力'))
    expect(btn).toBeFalsy()
  })

  it('KPI 為 0 時數值標記為中性樣式', () => {
    const wrapper = mount(RecruitmentNoDepositTab, {
      props: { ...baseProps, summary: { high_potential_count: 0, overdue_followup_count: 3, cold_count: 0 } },
      global: { plugins: [ElementPlus] },
    })
    const values = wrapper.findAll('.summary-value')
    expect(values[0].classes()).toContain('summary-value--zero')
    expect(values[1].classes()).not.toContain('summary-value--zero')
    expect(values[2].classes()).toContain('summary-value--zero')
  })
})

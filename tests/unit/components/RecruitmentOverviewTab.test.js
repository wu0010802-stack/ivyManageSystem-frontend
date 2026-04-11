import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentOverviewTab from '@/components/recruitment/RecruitmentOverviewTab.vue'

const makeWrapper = () => mount(RecruitmentOverviewTab, {
  props: {
    stats: {
      total_visit: 10,
      total_deposit: 4,
      total_enrolled: 3,
      total_transfer_term: 1,
      total_pending_deposit: 1,
      total_effective_deposit: 3,
      unique_visit: 9,
      unique_deposit: 4,
      visit_to_deposit_rate: 40,
      visit_to_enrolled_rate: 30,
      effective_to_enrolled_rate: 100,
      by_year: [],
    },
    referenceMonth: '115.05',
    decisionSummary: {
      current_month: { visit: 7, deposit: 2, enrolled: 1, visit_to_deposit_rate: 28.6, visit_to_enrolled_rate: 14.3 },
      rolling_30d: { visit: 7, deposit: 2, enrolled: 1, visit_to_deposit_rate: 28.6, visit_to_enrolled_rate: 14.3 },
      rolling_90d: { visit: 12, deposit: 4, enrolled: 3, visit_to_deposit_rate: 33.3, visit_to_enrolled_rate: 25 },
      ytd: { visit: 12, deposit: 4, enrolled: 3, visit_to_deposit_rate: 33.3, visit_to_enrolled_rate: 25 },
    },
    funnelSnapshot: {
      visit: 7,
      deposit: 2,
      enrolled: 1,
      transfer_term: 0,
      effective_deposit: 2,
      pending_deposit: 1,
    },
    monthOverMonth: {
      current_month: '115.05',
      previous_month: '115.04',
      visit_to_deposit_rate: { delta: -51.4 },
      visit_to_enrolled_rate: { delta: -25.7 },
    },
    alerts: [
      {
        code: 'FUNNEL_DROP',
        level: 'warning',
        title: '本月漏斗轉換下滑',
        message: '115.05 參觀轉預繳下滑',
        target_tab: 'detail',
        target_filter: { month: '115.05' },
      },
    ],
    topActionQueue: [
      {
        code: 'FOLLOW_HIGH_POTENTIAL',
        title: '查看高風險未預繳',
        description: '目前有 5 筆高潛力名單逾期未追。',
        target_tab: 'nodeposit',
        target_filter: { priority: 'high', overdue_days: 14 },
      },
    ],
    showCharts: false,
    monthlyTableData: [],
    monthlyBarData: null,
    monthlyRateData: null,
    barOptions: {},
    monthlyBarOptions: {},
    lineOptions: {},
    barComponent: { template: '<div />' },
    lineComponent: { template: '<div />' },
    fmtRate: (value) => `${Number(value || 0).toFixed(1)}%`,
  },
  global: {
    stubs: {
      'el-card': { template: '<div><slot name="header" /><slot /></div>' },
      'el-tag': { template: '<span><slot /></span>' },
      'el-empty': { template: '<div />' },
      'el-table': { template: '<div><slot /></div>' },
      'el-table-column': true,
    },
  },
})

describe('RecruitmentOverviewTab', () => {
  it('renders the decision summary and dashboard signals', () => {
    const wrapper = makeWrapper()

    expect(wrapper.text()).toContain('主管決策摘要')
    expect(wrapper.text()).toContain('參考月份：115.05')
    expect(wrapper.text()).toContain('本月漏斗轉換下滑')
    expect(wrapper.text()).toContain('查看高風險未預繳')
  })

  it('emits navigate when an alert or action is clicked', async () => {
    const wrapper = makeWrapper()

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('navigate')).toHaveLength(2)
    expect(wrapper.emitted('navigate')[0][0]).toMatchObject({ code: 'FUNNEL_DROP', target_tab: 'detail' })
    expect(wrapper.emitted('navigate')[1][0]).toMatchObject({ code: 'FOLLOW_HIGH_POTENTIAL', target_tab: 'nodeposit' })
  })
})

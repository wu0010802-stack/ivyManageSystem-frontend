import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentDecisionSummary from '../RecruitmentDecisionSummary.vue'

const fmtRate = (rate: unknown) => `${Number(rate || 0).toFixed(1)}%`

const mountSummary = (summary: Record<string, unknown>) =>
  mount(RecruitmentDecisionSummary, {
    props: { summary, referenceMonth: '115.07', monthOverMonth: {}, fmtRate },
  })

describe('RecruitmentDecisionSummary', () => {
  it('visit=0 時預繳率/註冊率顯示「—」而非紅色 0%', () => {
    const wrapper = mountSummary({
      current_month: { visit: 0, deposit: 0, enrolled: 0, visit_to_deposit_rate: 0, visit_to_enrolled_rate: 0 },
    })
    const card = wrapper.find('.decision-card--current_month')
    const rates = card.findAll('.dc-rate-value')
    expect(rates.map((r) => r.text())).toEqual(['—', '—'])
    expect(rates.every((r) => r.classes().includes('dc-rate-value--none'))).toBe(true)
  })

  it('visit>0 時正常顯示格式化比率', () => {
    const wrapper = mountSummary({
      current_month: { visit: 2, deposit: 1, enrolled: 1, visit_to_deposit_rate: 50, visit_to_enrolled_rate: 50 },
    })
    const card = wrapper.find('.decision-card--current_month')
    const rates = card.findAll('.dc-rate-value')
    expect(rates.map((r) => r.text())).toEqual(['50.0%', '50.0%'])
  })
})

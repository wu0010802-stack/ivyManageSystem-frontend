import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/appraisal', () => ({
  listAppraisalBonusRates: vi.fn().mockResolvedValue({
    data: [{ id: 1, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '6000' }],
  }),
  getSummaryLogs: vi.fn().mockResolvedValue({ data: [] }),
}))

import EmployeeSummaryDrawer from '@/views/appraisal/components/EmployeeSummaryDrawer.vue'

const baseParticipant = { employee_name: '王小明', role_group: 'HOMEROOM', attendance: {}, retention: null, activity: null, disciplinary: {} }
const baseSummary = { id: 1, base_score: 75, event_score_sum: 5, total_score: 80, grade: 'OUTSTANDING', bonus_amount: 4800, status: 'FINALIZED' }

const mountDrawer = (props = {}) =>
  mount(EmployeeSummaryDrawer, {
    props: { visible: true, participant: baseParticipant, summary: baseSummary, ...props },
    global: { plugins: [ElementPlus] },
  })

describe('EmployeeSummaryDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('顯示①結果摘要（總分/等第/獎金/狀態）', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const section = wrapper.find('[data-test="esd-section-summary"]')
    expect(section.text()).toContain('80.00')
    expect(section.text()).toContain('FINALIZED')
  })

  it('顯示②自動衍生證據（沿用 AggregatedStatusContent）', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.find('[data-test="esd-section-evidence"]').find('.detail-tabs').exists()).toBe(true)
  })

  it('顯示④計算軌跡五步驟，含基準額查表公式', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const section = wrapper.find('[data-test="esd-section-trail"]')
    expect(section.text()).toContain('基準額 6,000')
  })

  it('無獎金等第時④計算軌跡顯示「此等第無獎金」，不查表', async () => {
    const wrapper = mountDrawer({ summary: { ...baseSummary, grade: 'PASS', bonus_amount: 0 } })
    await flushPromises()
    expect(wrapper.find('[data-test="esd-section-trail"]').text()).toContain('此等第無獎金')
  })

  it('顯示⑤異動紀錄（沿用 SummaryLogTimeline，summaryId 對齊 summary.id）', async () => {
    const { getSummaryLogs } = await import('@/api/appraisal')
    mountDrawer()
    await flushPromises()
    expect(getSummaryLogs).toHaveBeenCalledWith(1)
  })

  it('participant/summary 皆為 null 時顯示「找不到明細資料」', async () => {
    const wrapper = mountDrawer({ participant: null, summary: null })
    await flushPromises()
    expect(wrapper.text()).toContain('找不到明細資料')
  })
})

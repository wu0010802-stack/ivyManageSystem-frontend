import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OverviewWorkbenchView from '../OverviewWorkbenchView.vue'

// mock 兩支把手 API（沿用既有 spec 的 vi.mock 寫法與回傳形狀，見 OverviewWorkbenchView.spec.ts）
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn().mockResolvedValue({
    data: { id: 1, academic_year: 115, semester: 'FIRST', status: 'OPEN' },
  }),
}))
vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn().mockResolvedValue({
    data: [{ id: 9, academic_year: 114, status: 'OPEN' }],
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

describe('OverviewWorkbenchView 下一步主卡', () => {
  it('卡片 stats 到齊後主卡依優先序顯示年終待簽', async () => {
    const wrapper = mount(OverviewWorkbenchView, {
      global: {
        stubs: {
          WorkbenchAppraisalCard: true,
          WorkbenchYearEndCard: true,
          WorkbenchExceptionsCard: true,
          WorkbenchPayoutCard: true,
        },
      },
    })
    await new Promise((r) => setTimeout(r))
    wrapper.findComponent({ name: 'WorkbenchAppraisalCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchYearEndCard' }).vm.$emit('stats', 5)
    wrapper.findComponent({ name: 'WorkbenchExceptionsCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchPayoutCard' }).vm.$emit('stats', 0)
    await wrapper.vm.$nextTick()
    const card = wrapper.find('[data-test="next-step-card"]')
    expect(card.text()).toContain('年終結算還有 5 筆未核定')
  })

  it('卡片重試成功後 partialError 警示應自癒消失（非永久殘留）', async () => {
    const wrapper = mount(OverviewWorkbenchView, {
      global: {
        stubs: {
          WorkbenchAppraisalCard: true,
          WorkbenchYearEndCard: true,
          WorkbenchExceptionsCard: true,
          WorkbenchPayoutCard: true,
        },
      },
    })
    await new Promise((r) => setTimeout(r))
    // 年終卡先失敗 → 主卡應顯示「部分卡片載入失敗」
    wrapper.findComponent({ name: 'WorkbenchAppraisalCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchYearEndCard' }).vm.$emit('stats-error')
    wrapper.findComponent({ name: 'WorkbenchExceptionsCard' }).vm.$emit('stats', 0)
    wrapper.findComponent({ name: 'WorkbenchPayoutCard' }).vm.$emit('stats', 0)
    await wrapper.vm.$nextTick()
    const card = wrapper.find('[data-test="next-step-card"]')
    expect(card.text()).toContain('部分卡片載入失敗')

    // 使用者重試、年終卡重新成功 emit stats → 警示應清除
    wrapper.findComponent({ name: 'WorkbenchYearEndCard' }).vm.$emit('stats', 5)
    await wrapper.vm.$nextTick()
    expect(card.text()).not.toContain('部分卡片載入失敗')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AllChannelSummaryCard from '@/components/recruitment/AllChannelSummaryCard.vue'

vi.mock('@/api/recruitmentIvykids', () => ({
  getRecruitmentIvykidsStats: vi.fn().mockResolvedValue({
    data: { total_visit: 4, total_deposit: 2, total_enrolled: 1 },
  }),
}))

describe('AllChannelSummaryCard', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows internal + ivykids + combined totals', async () => {
    const wrapper = mount(AllChannelSummaryCard, {
      props: { internalSnapshot: { visit: 10, deposit: 6, enrolled: 3 } },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('全管道彙整')
    expect(text).toContain('官網報名')
    expect(text).toContain('14') // 合計 visit 10+4
  })
})

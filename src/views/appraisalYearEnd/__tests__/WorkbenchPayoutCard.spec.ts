import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/yearEnd', () => ({
  previewAppraisalPayout: vi.fn(),
}))

import WorkbenchPayoutCard from '../components/WorkbenchPayoutCard.vue'
import { previewAppraisalPayout } from '@/api/yearEnd'

const mountCard = () =>
  mount(WorkbenchPayoutCard, {
    props: { year: 2026 },
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
  })

// axios 錯誤形狀（interceptor 未觸發時 apiError 直讀 response.data.detail）
const axiosErr = (status: number, detail?: string) => ({ response: { status, data: { detail } } })

beforeEach(() => vi.clearAllMocks())

describe('WorkbenchPayoutCard', () => {
  it('成功且有列 → 顯示筆數合計', async () => {
    vi.mocked(previewAppraisalPayout).mockResolvedValue({
      data: [{ total_amount: '1000' }, { total_amount: '2500' }],
    } as Awaited<ReturnType<typeof previewAppraisalPayout>>)
    const w = mountCard()
    await flushPromises()
    expect(w.text()).toContain('可發放 2 筆')
    expect(w.emitted('stats')?.[0]).toEqual([2])
  })

  it('422（來源 cycle 未建立）→ 顯示友善空狀態（非後端內部 detail 原文）、不觸發 stats-error、回報 stats 0', async () => {
    // 2026-07-31 QA 缺陷修正：後端 detail 是給開發者看的內部訊息（含 cycle 代號如
    // 「appraisal_cycle academic_year=113 FIRST 不存在」），不應直接丟給使用者；
    // 卡片改顯示固定的友善空狀態文案。
    const detail = 'appraisal_cycle academic_year=113 FIRST 不存在；請先在考核管理建立此 cycle'
    vi.mocked(previewAppraisalPayout).mockRejectedValue(axiosErr(422, detail))
    const w = mountCard()
    await flushPromises()
    expect(w.text()).not.toContain(detail)
    expect(w.text()).not.toContain('載入失敗')
    expect(w.text()).toContain('尚無可發放的考核年終資料')
    // 不該點亮父層「部分卡片載入失敗」橫幅
    expect(w.emitted('stats-error')).toBeUndefined()
    expect(w.emitted('stats')?.[0]).toEqual([0])
  })

  it('非 422 錯誤 → 顯示錯誤訊息與重試、觸發 stats-error', async () => {
    vi.mocked(previewAppraisalPayout).mockRejectedValue(axiosErr(500))
    const w = mountCard()
    await flushPromises()
    expect(w.text()).toContain('載入失敗')
    expect(w.text()).toContain('重試')
    expect(w.emitted('stats-error')).toHaveLength(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AppraisalCycleExceptionsSummary from '../AppraisalCycleExceptionsSummary.vue'

vi.mock('@/api/appraisal', () => ({
  getAppraisalCycleExceptions: vi.fn(),
}))
import { getAppraisalCycleExceptions } from '@/api/appraisal'

const mockedGet = vi.mocked(getAppraisalCycleExceptions)

function mountPanel(cycleId = 7) {
  return mount(AppraisalCycleExceptionsSummary, {
    props: { cycleId },
    global: { plugins: [ElementPlus] },
  })
}

describe('AppraisalCycleExceptionsSummary', () => {
  beforeEach(() => { mockedGet.mockReset() })

  it('載入中顯示骨架', async () => {
    mockedGet.mockReturnValue(new Promise(() => {})) // 永不 resolve
    const w = mountPanel()
    expect(w.findComponent({ name: 'TableSkeleton' }).exists()).toBe(true)
  })

  it('載入成功且有項目時，依 cycleId 呼叫 API 並渲染每一列', async () => {
    mockedGet.mockResolvedValue({
      data: {
        cycle_id: 7,
        generated_at: '2026-08-16T10:00:00+08:00',
        counts_by_type: { missing_data: 1 },
        items: [{
          type: 'missing_data', severity: 'warning', entity_type: 'employee', entity_id: '12',
          target_name: '林靜宜', reason: '才藝點名 10 月後無紀錄', impact: '±2 分',
          suggested_action: '補點名或人工認定', deep_link: '/appraisal-year-end/appraisal/institution-events',
        }],
      },
    })
    const w = mountPanel(7)
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledWith(7)
    expect(w.text()).toContain('林靜宜')
    expect(w.text()).toContain('補點名或人工認定')
    expect(w.findComponent({ name: 'TableSkeleton' }).exists()).toBe(false)
  })

  it('載入成功但無項目時顯示空狀態，不顯示表格', async () => {
    mockedGet.mockResolvedValue({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    const w = mountPanel()
    await flushPromises()
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(w.find('table').exists()).toBe(false)
  })

  it('載入失敗顯示錯誤與重試按鈕，點擊重試會再次呼叫 API', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network'))
    const w = mountPanel()
    await flushPromises()
    const retryBtn = w.find('[data-test="exceptions-summary-retry"]')
    expect(retryBtn.exists()).toBe(true)

    mockedGet.mockResolvedValueOnce({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    await retryBtn.trigger('click')
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('cycleId 改變時不會自動重新載入（props 變動由父層控制何時重掛，避免隱性重複請求）', async () => {
    mockedGet.mockResolvedValue({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    const w = mountPanel(7)
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
    await w.setProps({ cycleId: 8 })
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})

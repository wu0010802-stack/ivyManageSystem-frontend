/**
 * 教師處理出勤異常：送出後後端冪等、不能改選，所以送出前要確認並講清楚後果
 * （特休抵銷＝送整天 8 小時特休假單）。mock 沿用 PortalAnomalyDisputeRemark.test.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

// 本頁會讀 route.query 決定查詢年月（見 PortalAnomalyMonthQuery.test.ts）
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/portal', () => ({
  getAnomalies: vi.fn().mockResolvedValue({
    data: [
      {
        id: 42,
        type: 'late',
        type_label: '遲到',
        date: '2026-07-15',
        weekday: '三',
        detail: '遲到 10 分鐘',
        estimated_deduction: 120,
        confirmed: false,
      },
    ],
  }),
  confirmAnomaly: vi.fn().mockResolvedValue({ data: { message: '申訴已提交' } }),
}))

vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({ data: { actions: {} } }),
}))

import { createPinia, setActivePinia } from 'pinia'
import { getAnomalies, confirmAnomaly } from '@/api/portal'
import PortalAnomalyView from '@/views/portal/PortalAnomalyView.vue'

async function mountAndPick(index: number) {
  const wrapper = mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  await wrapper.findAll('input[type="radio"]')[index].setValue(true)
  await flushPromises()
  await wrapper.find('.anomaly-actions .el-button').trigger('click')
  await flushPromises()
  return wrapper
}

describe('教師端出勤異常：送出前確認', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(confirmAnomaly).mockClear()
    vi.mocked(getAnomalies).mockClear()
  })

  it('取消確認 → 不送出', async () => {
    const spy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await mountAndPick(1)
    expect(spy).toHaveBeenCalled()
    expect(confirmAnomaly).not.toHaveBeenCalled()
  })

  it('使用特休：說明會送整天 8 小時特休假單', async () => {
    const spy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await mountAndPick(0)
    expect(spy.mock.calls.at(-1)![0]).toContain('整天（8 小時）')
    expect(confirmAnomaly).toHaveBeenCalledTimes(1)
  })

  it('接受扣款：寫出預估扣款金額', async () => {
    const spy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await mountAndPick(1)
    expect(spy.mock.calls.at(-1)![0]).toContain('NT$ 120')
  })
})

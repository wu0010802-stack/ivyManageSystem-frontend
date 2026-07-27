/**
 * 異常確認選「提出申訴」時，老師打的理由沒送到後端（bug-hunt 2026-07-27）。
 *
 * 畫面要求「請說明申訴原因」並把輸入綁到 anomaly.remark，但送出時只呼叫
 * confirmAnomalyApi(id, action)，api/portal.ts 的 body 也只有 { action }。
 * 後端 api/portal/_shared.AnomalyConfirm 早就定義了 remark、anomalies.py 也在用它
 * （寫成 " [申訴: {remark}]"），所以落庫的永遠是字面上的「 [申訴: ]」——
 * 理由 100% 遺失，管理員看到空白申訴無從處理。契約允許送，是前端沒接。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

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

import { getAnomalies, confirmAnomaly } from '@/api/portal'
import PortalAnomalyView from '@/views/portal/PortalAnomalyView.vue'

async function mountWithDispute(remark: string) {
  const wrapper = mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  expect(vi.mocked(getAnomalies)).toHaveBeenCalled()

  const radios = wrapper.findAll('input[type="radio"]')
  const disputeRadio = radios[2]
  expect(disputeRadio, '找不到「提出申訴」選項，測試前提已失效').toBeTruthy()
  await disputeRadio.setValue(true)
  await flushPromises()

  if (remark) {
    await wrapper.find('textarea').setValue(remark)
  }

  await wrapper.find('.anomaly-actions .el-button').trigger('click')
  await flushPromises()
  return wrapper
}

describe('教師端出勤異常申訴', () => {
  beforeEach(() => {
    vi.mocked(confirmAnomaly).mockClear()
  })

  it('申訴理由必須隨請求送出，不可只送 action', async () => {
    await mountWithDispute('我當天有打卡，機器沒讀到')

    expect(confirmAnomaly).toHaveBeenCalledTimes(1)
    const call = vi.mocked(confirmAnomaly).mock.calls[0]
    expect(call[1]).toBe('dispute')
    expect(call[2]).toBe('我當天有打卡，機器沒讀到')
  })

  it('選申訴卻沒填理由時擋下，不送出空申訴', async () => {
    await mountWithDispute('')

    expect(confirmAnomaly).not.toHaveBeenCalled()
  })
})

/**
 * 首頁「異常待確認」badge 的數字永遠消不掉（bug-hunt 2026-07-27）。
 *
 * 後端 _count_pending_anomalies 統計「全期間」未確認的異常（數字本身是對的），
 * 但 GET /portal/anomalies 的 year/month 是必填、前端 PortalAnomalyView 又固定用
 * 「當月」且完全不讀 route.query，PendingActionsCard 也只 push 一個沒有 query 的路徑。
 *
 * 結果：首頁顯示「異常待確認 1」，點進去卻是「本月無出勤異常」的空狀態，badge 也不會
 * 減少。UI 完全沒提示該翻哪個月份，實務上等同盲找。
 *
 * 本檔驗前端這一半：異常頁必須尊重網址帶進來的年月，否則就算 badge 帶了正確的月份
 * 也沒用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const routeQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: routeQuery }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/portal', () => ({
  getAnomalies: vi.fn().mockResolvedValue({ data: [] }),
  confirmAnomaly: vi.fn(),
}))

import { getAnomalies } from '@/api/portal'
import PortalAnomalyView from '@/views/portal/PortalAnomalyView.vue'

describe('教師端異常頁的年月來源', () => {
  beforeEach(() => {
    for (const k of Object.keys(routeQuery)) delete routeQuery[k]
    vi.mocked(getAnomalies).mockClear()
  })

  it('網址帶 year/month 時要查該月，而不是固定查當月', async () => {
    routeQuery.year = '2026'
    routeQuery.month = '5'

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledWith({ year: 2026, month: 5 })
  })

  it('網址沒帶時仍預設當月（維持既有行為）', async () => {
    const now = new Date()

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledWith({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    })
  })
})

describe('首頁待辦卡片的異常連結', () => {
  it('有最早待確認月份時，連結必須帶上 year/month', async () => {
    const PendingActionsCard = (
      await import('@/components/portal/home/PendingActionsCard.vue')
    ).default
    const wrapper = mount(PendingActionsCard, {
      global: { plugins: [ElementPlus] },
      props: {
        actions: {
          pending_anomaly_confirms: 1,
          pending_anomaly_earliest: { year: 2026, month: 3 },
        },
      },
    })

    const item = (
      wrapper.vm as unknown as { items: { key: string; to: string }[] }
    ).items.find((i) => i.key === 'pending_anomaly_confirms')
    expect(item?.to).toBe('/portal/anomalies?year=2026&month=3')
  })

  it('沒有待確認時退回原本的路徑', async () => {
    const PendingActionsCard = (
      await import('@/components/portal/home/PendingActionsCard.vue')
    ).default
    const wrapper = mount(PendingActionsCard, {
      global: { plugins: [ElementPlus] },
      props: { actions: { pending_anomaly_confirms: 0 } },
    })

    const item = (
      wrapper.vm as unknown as { items: { key: string; to: string }[] }
    ).items.find((i) => i.key === 'pending_anomaly_confirms')
    expect(item?.to).toBe('/portal/anomalies')
  })
})

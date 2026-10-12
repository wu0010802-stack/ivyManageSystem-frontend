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

// 首頁摘要（含全期間待確認數與最早月份）；本頁沒帶年月時以它決定落點
vi.mock('@/api/portalHome', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({ data: { actions: {} } }),
}))

import { createPinia, setActivePinia } from 'pinia'
import { getAnomalies } from '@/api/portal'
import { getHomeSummary } from '@/api/portalHome'
import PortalAnomalyView from '@/views/portal/PortalAnomalyView.vue'

describe('教師端異常頁的年月來源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const k of Object.keys(routeQuery)) delete routeQuery[k]
    vi.mocked(getAnomalies).mockClear()
    vi.mocked(getHomeSummary).mockResolvedValue({ data: { actions: {} } } as never)
  })

  it('網址帶 year/month 時要查該月，而不是固定查當月', async () => {
    routeQuery.year = '2026'
    routeQuery.month = '5'

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledWith({ year: 2026, month: 5 })
  })

  it('網址沒帶、也沒有待確認異常時預設當月', async () => {
    const now = new Date()

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledWith({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    })
  })

  // 2026-10-12：側欄與「我要申請」選單都直連 /portal/anomalies 不帶年月，
  // 首頁格子寫「異常待確認 17」，從側欄點進來卻是「本月無出勤異常」。
  it('網址沒帶年月時落在最早待確認的月份（側欄／申請選單入口）', async () => {
    vi.mocked(getHomeSummary).mockResolvedValue({
      data: { actions: { pending_anomaly_confirms: 17, pending_anomaly_earliest: { year: 2026, month: 8 } } },
    } as never)

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledTimes(1)
    expect(getAnomalies).toHaveBeenCalledWith({ year: 2026, month: 8 })
  })

  it('查的月份沒有異常、但其他月份還有待確認時，空狀態要給前往的出口', async () => {
    routeQuery.year = '2026'
    routeQuery.month = '10'
    vi.mocked(getHomeSummary).mockResolvedValue({
      data: { actions: { pending_anomaly_confirms: 17, pending_anomaly_earliest: { year: 2026, month: 8 } } },
    } as never)

    const w = mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(w.find('[data-test="anomaly-jump-earliest"]').exists()).toBe(true)
    expect(w.text()).toContain('其他月份還有 17 筆待確認')
    const jump = w.find('[data-test="anomaly-jump-earliest"]')
    expect(jump.exists()).toBe(true)
    expect(jump.text()).toContain('2026 年 8 月')

    vi.mocked(getAnomalies).mockClear()
    await jump.trigger('click')
    await flushPromises()
    expect(getAnomalies).toHaveBeenCalledWith({ year: 2026, month: 8 })
  })

  it('首頁摘要讀取失敗時退回當月，不擋住本頁', async () => {
    const now = new Date()
    vi.mocked(getHomeSummary).mockRejectedValue(new Error('network'))

    mount(PortalAnomalyView, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(getAnomalies).toHaveBeenCalledWith({ year: now.getFullYear(), month: now.getMonth() + 1 })
  })
})

// 本檔原本的第二個 describe 測「首頁待辦卡」的異常連結有沒有帶 year/month。
// PendingActionsCard 已於 2026-09-14 併入首頁功能格（同一功能不留兩個入口），
// 等價且更貼近實際操作的斷言改在
// src/views/portal/__tests__/PortalHomeView.features.test.ts：
//   -「異常待確認帶最早待確認月份，否則舊異常永遠找不到、badge 也消不掉」
//   -「沒有最早待確認月份時退回不帶 query 的異常頁」
// 那兩條測的是真的點下去 router.push 收到什麼，而不是元件內部的 items 陣列。

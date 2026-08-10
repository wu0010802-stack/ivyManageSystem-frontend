/**
 * 才藝儀表板摘要卡片的口徑說明（2026-08-10）。
 *
 * 起因：業主看到「報名率 63.1%」以為是「全園有幾成學生報了才藝」，實際是
 * 正式報名席次 ÷ 課程容量加總的**容量占用率**。同一排卡片裡「總報名數」（報名單）
 * 與「正式報名」（課程席次）單位也不同，容易被當成同一種東西比較。
 *
 * 本測試釘住：每張卡片都必須帶說明，且最易誤讀的三張要講清楚各自的分母／單位，
 * 避免日後新增卡片時漏寫 hint。
 */
import { describe, it, expect } from 'vitest'
import { buildStatCards } from '../activityDashboardStatCards'

const STATS = {
  totalRegistrations: 101,
  totalEnrollments: 157,
  totalWaitlist: 9,
  todayNewRegistrations: 0,
  totalRevenue: 0,
  totalUnpaid: 887200,
  enrollmentRate: 63.1,
  unreadInquiries: 0,
}

describe('buildStatCards', () => {
  it('每張卡片都有非空的口徑說明', () => {
    const cards = buildStatCards(STATS, '0%')

    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.hint, `卡片「${card.label}」缺少說明`).toBeTruthy()
      expect(card.hint.length, `卡片「${card.label}」的說明過短`).toBeGreaterThan(10)
    }
  })

  it('報名率說明點明分母是課程容量，並否掉「全園學生比例」的誤讀', () => {
    const rate = buildStatCards(STATS, '0%').find((c) => c.label === '報名率')

    expect(rate?.hint).toContain('容量')
    expect(rate?.hint).toContain('候補不計入')
  })

  it('總報名數與正式報名的說明點出單位不同（報名單 vs 課程席次）', () => {
    const cards = buildStatCards(STATS, '0%')

    expect(cards.find((c) => c.label === '總報名數')?.hint).toContain('報名單')
    expect(cards.find((c) => c.label === '正式報名')?.hint).toContain('席次')
  })

  it('數值格式維持原樣：金額加千分位與 $，比率加 %', () => {
    const cards = buildStatCards(STATS, '87%')

    expect(cards.find((c) => c.label === '待繳金額')?.value).toBe('$887,200')
    expect(cards.find((c) => c.label === '報名率')?.value).toBe('63.1%')
    expect(cards.find((c) => c.label === '平均出席率')?.value).toBe('87%')
  })

  it('後端欄位缺值時顯示 "-" 而非 0 或 undefined', () => {
    const cards = buildStatCards({}, '-')

    expect(cards.find((c) => c.label === '總報名數')?.value).toBe('-')
    expect(cards.find((c) => c.label === '待繳金額')?.value).toBe('-')
    expect(cards.find((c) => c.label === '報名率')?.value).toBe('-')
  })
})

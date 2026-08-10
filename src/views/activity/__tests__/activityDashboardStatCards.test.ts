/**
 * 才藝儀表板摘要卡片的口徑說明與衍生指標（2026-08-10）。
 *
 * 起因：業主看到「報名率 63.1%」以為是「全園有幾成學生報了才藝」，實際是
 * 正式報名人次 ÷ 課程容量加總的**容量占用率**。同一排卡片裡「總報名數」（報名單）
 * 與「正式報名」（課程人次）單位也不同，容易被當成同一種東西比較。
 *
 * 本測試釘住：
 * 1. 每張卡片都必須帶說明，避免日後新增卡片時漏寫 hint。
 * 2. 全園參與率／收款完成率／待審核人次三個衍生指標的算法與缺值行為。
 * 3. 用語一律「人次」（對齊後端 Excel 匯出與統計表欄名），不得回退成「席次」。
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

const GRAND_TOTAL = {
  student_count: 210,
  total_enrollments: 157,
  ratio: 44,
  enrollment_ratio: 75,
  total_pending_review: 3,
}

const cardsOf = (
  st = STATS,
  avg = '0%',
  gt: Record<string, unknown> | null = GRAND_TOTAL,
) => buildStatCards(st, avg, gt)

const findCard = (label: string, ...args: Parameters<typeof cardsOf>) =>
  cardsOf(...args).find((c) => c.label === label)

describe('buildStatCards：說明文字', () => {
  it('每張卡片都有非空的口徑說明', () => {
    const cards = cardsOf()

    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.hint, `卡片「${card.label}」缺少說明`).toBeTruthy()
      expect(card.hint.length, `卡片「${card.label}」的說明過短`).toBeGreaterThan(10)
    }
  })

  it('一律用「人次」，不得出現「席次」', () => {
    for (const card of cardsOf()) {
      expect(card.hint, `卡片「${card.label}」用了「席次」`).not.toContain('席次')
    }
  })

  it('報名率說明點明分母是課程容量，並否掉「全園學生比例」的誤讀', () => {
    const hint = findCard('報名率')?.hint

    expect(hint).toContain('容量')
    expect(hint).toContain('候補不計入')
  })

  it('總報名數與正式報名的說明點出單位不同（報名單 vs 課程人次）', () => {
    expect(findCard('總報名數')?.hint).toContain('報名單')
    expect(findCard('正式報名')?.hint).toContain('人次')
  })
})

describe('buildStatCards：原有數值格式', () => {
  it('金額加千分位與 $，比率加 %', () => {
    expect(findCard('待繳金額', STATS, '87%')?.value).toBe('$887,200')
    expect(findCard('報名率', STATS, '87%')?.value).toBe('63.1%')
    expect(findCard('平均出席率', STATS, '87%')?.value).toBe('87%')
  })

  it('後端欄位缺值時顯示 "-" 而非 0 或 undefined', () => {
    expect(findCard('總報名數', {}, '-')?.value).toBe('-')
    expect(findCard('待繳金額', {}, '-')?.value).toBe('-')
    expect(findCard('報名率', {}, '-')?.value).toBe('-')
  })
})

describe('buildStatCards：全園參與率（滲透率）', () => {
  it('直接採用統計表總計列的 ratio，與表格底下的總計數字一致', () => {
    // Why 不自行計算：分子是「不重複參與學生數」，摘要端點沒有這個數，
    // 自行用人次除在籍數會算出另一個（更大的）數字，畫面上兩個「參與率」打架。
    expect(findCard('全園參與率')?.value).toBe('44%')
  })

  it('統計表尚未載入時顯示 "-"，不顯示 0%', () => {
    expect(findCard('全園參與率', STATS, '0%', null)?.value).toBe('-')
  })

  it('在籍數為 0（歷史學期無班級快照）時顯示 "-"，不謊報 0%', () => {
    // 後端已知限制：歷史學期分母取不到，ratio 會是 0。0% 會被讀成「沒人報名」。
    const gt = { ...GRAND_TOTAL, student_count: 0, ratio: 0 }

    expect(findCard('全園參與率', STATS, '0%', gt)?.value).toBe('-')
  })

  it('說明點出分子是不重複學生、且校外生不計入', () => {
    const hint = findCard('全園參與率')?.hint

    expect(hint).toContain('不重複')
    expect(hint).toContain('校外生')
  })
})

describe('buildStatCards：收款完成率', () => {
  it('＝已繳 ÷（已繳＋待繳），四捨五入到整數百分比', () => {
    const st = { ...STATS, totalRevenue: 300000, totalUnpaid: 100000 }

    expect(findCard('收款完成率', st)?.value).toBe('75%')
  })

  it('完全未收款時為 0%（而非 "-"）', () => {
    expect(findCard('收款完成率')?.value).toBe('0%')
  })

  it('應收總額為 0（尚未開始收費）時顯示 "-"，避免 0/0', () => {
    const st = { ...STATS, totalRevenue: 0, totalUnpaid: 0 }

    expect(findCard('收款完成率', st)?.value).toBe('-')
  })

  it('任一金額欄缺值時顯示 "-"', () => {
    expect(findCard('收款完成率', {}, '-')?.value).toBe('-')
  })
})

describe('buildStatCards：待審核人次', () => {
  it('採用統計表總計列的 total_pending_review', () => {
    expect(findCard('待審核人次')?.value).toBe(3)
  })

  it('統計表尚未載入時顯示 "-"', () => {
    expect(findCard('待審核人次', STATS, '0%', null)?.value).toBe('-')
  })

  it('說明點出待審核不計入報名率與參與率', () => {
    const hint = findCard('待審核人次')?.hint

    expect(hint).toContain('不計入')
  })
})

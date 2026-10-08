/**
 * 「待你處理」清單（utils/pendingItems.ts）與服務目錄（utils/parentServices.ts）。
 *
 * 2026-10-08 首頁/待辦改版：首頁「待你處理」與待辦 tab 共用這份清單，取代原本
 * 散在 banner／Bento／今日動態「晚一些」桶的待辦呈現。路由 parity 比照
 * useTodayTimeline.routeParity：每一個 path 都要能被家長端 router 解析成具名路由。
 */
import { describe, it, expect } from 'vitest'
import router from '@/parent/router'
import { buildPendingItems } from '@/parent/utils/pendingItems'
import { ALL_SERVICES_ORDER, PARENT_SERVICES } from '@/parent/utils/parentServices'

const FULL_SUMMARY = {
  fees: { outstanding: 8500, overdue: 3000, outstanding_count: 2 },
  pending_event_acks: 1,
  pending_activity_promotions: 1,
  pending_survey_count: 2,
  recent_leave_reviews: 1,
  unread_announcements: 3,
}

describe('buildPendingItems — 內容與排序', () => {
  it('summary 為 null／全 0：空清單', () => {
    expect(buildPendingItems({ summary: null })).toEqual([])
    expect(buildPendingItems({ summary: { fees: { outstanding_count: 0 }, pending_event_acks: 0 } })).toEqual([])
  })

  it('依急迫度排序：逾期款項 → 才藝候補 → 簽收 → 入學文件 → 調查 → 請假結果 → 公告', () => {
    const items = buildPendingItems({ summary: FULL_SUMMARY, enrollDocCount: 1 })
    expect(items.map((i) => i.key)).toEqual([
      'fees', 'promotions', 'acks', 'enrollDocs', 'surveys', 'leaveReviews', 'announcements',
    ])
  })

  it('沒逾期的待繳排在有期限的項目之後', () => {
    const items = buildPendingItems({
      summary: { fees: { outstanding: 8500, overdue: 0, outstanding_count: 1 }, pending_survey_count: 1 },
    })
    expect(items.map((i) => i.key)).toEqual(['surveys', 'fees'])
    expect(items[1].tone).toBe('action')
    expect(items[1].detail).toBe('1 筆待繳 · 共 NT$8,500')
  })

  it('逾期款項：tone=urgent、說明帶逾期金額（canonical NT$ 格式）', () => {
    const [fees] = buildPendingItems({ summary: FULL_SUMMARY })
    expect(fees.tone).toBe('urgent')
    expect(fees.title).toBe('繳費')
    expect(fees.detail).toBe('2 筆待繳 · 逾期 NT$3,000')
    expect(fees.count).toBe(2)
  })

  it('白話動詞標題，且 /events 與 /sign 不再撞名「待簽文件」', () => {
    const items = buildPendingItems({ summary: FULL_SUMMARY, enrollDocCount: 1 })
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
    expect(byKey.acks.title).toBe('簽收通知')
    expect(byKey.acks.path).toBe('/events')
    expect(byKey.enrollDocs.title).toBe('簽署入學文件')
    expect(byKey.enrollDocs.path).toBe('/sign')
    expect(byKey.surveys.title).toBe('填活動調查')
    expect(byKey.promotions.title).toBe('確認才藝候補')
    expect(items.some((i) => i.title.includes('待簽文件'))).toBe(false)
  })

  it('請假結果與未讀公告是資訊性（info），不算待辦', () => {
    const items = buildPendingItems({ summary: FULL_SUMMARY })
    const info = items.filter((i) => i.tone === 'info').map((i) => i.key)
    expect(info).toEqual(['leaveReviews', 'announcements'])
  })

  it('入學文件待簽數為 0 或未提供：不出現該項', () => {
    expect(buildPendingItems({ summary: FULL_SUMMARY }).some((i) => i.key === 'enrollDocs')).toBe(false)
    expect(buildPendingItems({ summary: FULL_SUMMARY, enrollDocCount: 0 }).some((i) => i.key === 'enrollDocs')).toBe(false)
  })

  it('非數字／負數欄位視為 0（後端缺欄位時不炸、不出現「-1 份」）', () => {
    const items = buildPendingItems({
      summary: { pending_event_acks: '3', pending_survey_count: -1, fees: { outstanding_count: null } },
    })
    expect(items).toEqual([])
  })
})

describe('路由 parity：每個入口都能被家長端 router 解析成具名路由', () => {
  it('buildPendingItems 產生的 path', () => {
    const items = buildPendingItems({ summary: FULL_SUMMARY, enrollDocCount: 1 })
    const offenders = items.filter((i) => !router.resolve(i.path).name).map((i) => `${i.key} → ${i.path}`)
    expect(offenders).toEqual([])
  })

  it('PARENT_SERVICES 的 route（:studentId 代入假 id）', () => {
    const offenders = Object.entries(PARENT_SERVICES)
      .map(([key, s]) => ({ key, path: s.route.replace(':studentId', '1') }))
      .filter((r) => !router.resolve(r.path).name)
      .map((r) => `${r.key} → ${r.path}`)
    expect(offenders).toEqual([])
  })

  it('公告入口導向聯絡簿 tab 的公告分頁（不是獨立 /announcements 頁）', () => {
    const resolved = router.resolve(PARENT_SERVICES.announce.route)
    expect(resolved.name).toBe('parent-contact-book')
    expect(resolved.query.tab).toBe('announcements')
  })

  it('所有服務格：每個 key 都在目錄內且不重複', () => {
    expect(new Set(ALL_SERVICES_ORDER).size).toBe(ALL_SERVICES_ORDER.length)
    ALL_SERVICES_ORDER.forEach((k) => expect(PARENT_SERVICES[k]).toBeTruthy())
  })

  it('同一路由只有一個名稱（/pickup-notice 的「我到了」是同頁不同動作，例外）', () => {
    const byRoute = new Map<string, string[]>()
    Object.values(PARENT_SERVICES).forEach((s) => {
      byRoute.set(s.route, [...(byRoute.get(s.route) || []), s.label])
    })
    const dupes = [...byRoute.entries()]
      .filter(([route, labels]) => labels.length > 1 && route !== '/pickup-notice')
    expect(dupes).toEqual([])
  })
})

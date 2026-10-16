/**
 * useTodayTimeline 瘦身（2026-09-02）。
 *
 * 重整前五種 summary 衍生事件（待繳/待簽/才藝候補/未讀公告/請假結果）被
 * 硬編碼塞進 later 桶，讓「今日動態」實際上是第二份待辦清單，且與首頁
 * bento、頂部橫幅三處重複。這些改由 HomeTodoList 承載。
 *
 * 「尚未到校」占位事件同理移除：頂部聯絡簿按鈕的狀態 pill 已經寫著同一句。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTodayTimeline } from '@/parent/composables/useTodayTimeline'

interface TimelineEventShape {
  id: string
  primary: string
  secondary: string | null
}

function collect(
  summary: Record<string, unknown> | null,
  children: Record<string, unknown>[],
): TimelineEventShape[] {
  const { buckets } = useTodayTimeline({
    summary: ref(summary),
    todayChildren: ref(children),
  })
  // buckets 的每個桶是 { key, label, items }；items 才是事件陣列。
  return buckets.value.flatMap((b) => b.items) as unknown as TimelineEventShape[]
}

describe('useTodayTimeline 不再產生待辦事件', () => {
  const fullSummary = {
    fees: { outstanding_count: 2, outstanding: 3600, overdue: 1200 },
    pending_event_acks: 3,
    pending_activity_promotions: 1,
    unread_announcements: 5,
    recent_leave_reviews: 2,
  }

  it('待繳費事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'fees')).toBeUndefined()
  })

  it('待簽閱事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'acks')).toBeUndefined()
  })

  it('才藝候補事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'promotions')).toBeUndefined()
  })

  it('未讀公告事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'announcements')).toBeUndefined()
  })

  it('請假審核結果事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'leaveReviews')).toBeUndefined()
  })

  it('summary 齊全但沒有孩子事件時，時間軸為空', () => {
    expect(collect(fullSummary, [])).toEqual([])
  })
})

describe('useTodayTimeline 孩子事件保留', () => {
  it('有出席紀錄：照常產生事件並保留後端狀態文字', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', classroom_name: '天堂鳥', attendance: { status: '遲到' } },
    ])
    const att = events.find((e) => e.id === 'att:1')
    expect(att).toBeTruthy()
    expect(att!.primary).toContain('遲到')
  })

  it('請假：照常產生事件', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', leave: { type: '病假' } },
    ])
    expect(events.find((e) => e.id === 'leave:1')).toBeTruthy()
  })

  it('沒有出席也沒有請假：不再產生「尚未到校」占位事件', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', classroom_name: '天堂鳥' },
    ])
    expect(events.find((e) => e.id === 'pending:1')).toBeUndefined()
    expect(events.map((e) => e.primary).join(' ')).not.toContain('尚未到校')
  })

  it('用藥與接送事件照常產生', () => {
    const events = collect(null, [
      {
        student_id: 1, name: '小明',
        medication: { has_order: true, order_count: 2 },
        dismissal: { status: 'completed', completed_at: '2026-09-02T16:10:00' },
      },
    ])
    expect(events.find((e) => e.id === 'med:1')).toBeTruthy()
    expect(events.find((e) => e.id === 'dismissal:1')).toBeTruthy()
  })
})

describe('useTodayTimeline 用詞', () => {
  it('離園完成的接送事件 secondary 為「已離園」，不再是「已接送」', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', dismissal: { status: 'completed', completed_at: '2026-09-02T16:10:00' } },
    ])
    const d = events.find((e) => e.id === 'dismissal:1')
    expect(d!.secondary).toBe('已離園')
  })

  it('later 桶標籤為「傍晚」', () => {
    const { buckets } = useTodayTimeline({
      summary: ref(null),
      todayChildren: ref([
        { student_id: 1, name: '小明', dismissal: { status: 'completed', completed_at: '2026-09-02T19:30:00' } },
      ]),
    })
    const labels = buckets.value.map((b) => b.label)
    expect(labels).toContain('傍晚')
    expect(labels).not.toContain('晚一些')
  })
})

import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTodayTimeline } from '@/parent/composables/useTodayTimeline'

function setup({ summaryValue = null, childrenValue = [] } = {}) {
  const summary = ref(summaryValue)
  const todayChildren = ref(childrenValue)
  return useTodayTimeline({ summary, todayChildren })
}

describe('useTodayTimeline — bucket 分組', () => {
  it('空資料 → buckets 為空陣列', () => {
    const { buckets } = setup()
    expect(buckets.value).toEqual([])
  })

  it('attendance / leave → morning bucket', () => {
    const { buckets } = setup({
      childrenValue: [
        { student_id: 1, name: '小明', attendance: { status: '出席' } },
        { student_id: 2, name: '小華', leave: { type: '病假' } },
        // 2026-09-02 瘦身：無 attendance/leave 的孩子不再產生「尚未到校」占位事件，
        // 這筆 fixture 保留是為了證明它確實不再進時間軸。
        { student_id: 3, name: '小芬' },
      ],
    })
    const morning = buckets.value.find((b) => b.key === 'morning')
    expect(morning).toBeDefined()
    expect(morning.items.map((i) => i.id)).toEqual(['att:1', 'leave:2'])
    expect(morning.label).toBe('早上')
  })

  it('medication → noon bucket', () => {
    const { buckets } = setup({
      childrenValue: [
        { student_id: 1, name: '小明', medication: { has_order: true, order_count: 2 } },
      ],
    })
    const noon = buckets.value.find((b) => b.key === 'noon')
    expect(noon.items[0].primary).toContain('用藥')
  })

  it('dismissal completed → afternoon bucket，依 completed_at 推 bucket 與 time', () => {
    const { buckets } = setup({
      childrenValue: [
        {
          student_id: 1,
          name: '小明',
          dismissal: {
            id: 5,
            status: 'completed',
            requested_at: '2026-05-13T14:30:00',
            completed_at: '2026-05-13T16:30:00',
          },
        },
      ],
    })
    const afternoon = buckets.value.find((b) => b.key === 'afternoon')
    expect(afternoon).toBeDefined()
    const item = afternoon.items.find((e) => e.id === 'dismissal:1')
    expect(item.variant).toBe('past')
    expect(item.time).toBe('16:30')
  })

  it('dismissal pending → 用 acknowledged_at fallback requested_at 推 bucket', () => {
    const { buckets } = setup({
      childrenValue: [
        {
          student_id: 1,
          name: '小明',
          dismissal: {
            id: 5,
            status: 'pending',
            requested_at: '2026-05-13T15:00:00',
            acknowledged_at: null,
          },
        },
      ],
    })
    const afternoon = buckets.value.find((b) => b.key === 'afternoon')
    const item = afternoon.items.find((e) => e.id === 'dismissal:1')
    expect(item.variant).toBe('pending')
    expect(item.time).toBe('15:00')
  })

  it('接送時間台北時區錨定：帶 Z 的 UTC completed_at 換算成台北（裝置時區無關）', () => {
    // 08:00 UTC = 16:00 台北 → 下午桶、time 16:00。舊版 new Date().getHours()
    // 會隨執行機器時區飄移（非台灣裝置差 8 小時），新版顯式錨定 Asia/Taipei 才恆正確。
    const { buckets } = setup({
      childrenValue: [
        {
          student_id: 1,
          name: '小明',
          dismissal: {
            id: 7,
            status: 'completed',
            requested_at: '2026-05-13T06:00:00Z',
            completed_at: '2026-05-13T08:00:00Z',
          },
        },
      ],
    })
    const afternoon = buckets.value.find((b) => b.key === 'afternoon')
    expect(afternoon).toBeDefined()
    const item = afternoon.items.find((e) => e.id === 'dismissal:1')
    expect(item.time).toBe('16:00')
    expect(item.variant).toBe('past')
  })

  // 2026-09-02 瘦身：原本這裡有三個案例（fees/acks/promotions → later pending、
  // fees 逾期 tone=danger、announcements/leaveReviews → later info），測的都是五種
  // summary 衍生待辦事件。那些事件已移交 HomeTodoList（useParentTodos），本
  // composable 不再讀 summary，三個案例合併成下面這條反向斷言。
  it('summary 齊全也不再產生任何 later 桶待辦事件', () => {
    const { buckets } = setup({
      summaryValue: {
        fees: { outstanding: 5200, overdue: 3000, outstanding_count: 1 },
        pending_event_acks: 2,
        unread_messages: 1,
        pending_activity_promotions: 1,
        unread_announcements: 3,
        recent_leave_reviews: 1,
      },
    })
    expect(buckets.value).toEqual([])
  })

  it('生日當天 → motif=crown', () => {
    const today = new Date()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const { buckets } = setup({
      childrenValue: [
        {
          student_id: 1,
          name: '小明',
          birthday: `2020-${mm}-${dd}`,
          attendance: { status: '出席' },
        },
      ],
    })
    const morning = buckets.value.find((b) => b.key === 'morning')
    expect(morning.items[0].motif).toBe('crown')
  })

  // 2026-09-02 瘦身：本案例原以 summary 衍生事件造出 pending/info 兩種 variant，
  // 那些事件已移除，改用同一桶內的接送事件驗同一條排序規則（past 先於 pending，
  // 同 variant 依 time 升冪）。排序函式對 info 的處理保留但目前已無事件產生 info。
  it('桶內排序：past → pending；同類別有 time 則升冪', () => {
    const { buckets } = setup({
      childrenValue: [
        // 刻意把時間最早的 pending 放在最前面，證明 variant 優先於 time
        {
          student_id: 1,
          name: '小明',
          dismissal: { status: 'pending', requested_at: '2026-05-13T14:30:00' },
        },
        {
          student_id: 2,
          name: '小華',
          dismissal: {
            status: 'completed',
            requested_at: '2026-05-13T15:00:00',
            completed_at: '2026-05-13T16:30:00',
          },
        },
        {
          student_id: 3,
          name: '小芬',
          dismissal: {
            status: 'completed',
            requested_at: '2026-05-13T14:00:00',
            completed_at: '2026-05-13T15:10:00',
          },
        },
      ],
    })
    const afternoon = buckets.value.find((b) => b.key === 'afternoon')
    expect(afternoon.items.map((i) => i.variant)).toEqual(['past', 'past', 'pending'])
    expect(afternoon.items.map((i) => i.time)).toEqual(['15:10', '16:30', '14:30'])
  })

  it('空桶不渲染（later 全空時不存在）', () => {
    const { buckets } = setup({
      childrenValue: [{ student_id: 1, name: '小明', attendance: { status: '出席' } }],
    })
    expect(buckets.value.find((b) => b.key === 'later')).toBeUndefined()
  })
})

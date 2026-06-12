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

  it('attendance / leave / 尚未到校 → morning bucket', () => {
    const { buckets } = setup({
      childrenValue: [
        { student_id: 1, name: '小明', attendance: { status: '出席' } },
        { student_id: 2, name: '小華', leave: { type: '病假' } },
        { student_id: 3, name: '小芬' },
      ],
    })
    const morning = buckets.value.find((b) => b.key === 'morning')
    expect(morning).toBeDefined()
    expect(morning.items.length).toBe(3)
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

  it('summary 待辦（fees / acks / messages / promotions） → later bucket pending', () => {
    const { buckets } = setup({
      summaryValue: {
        fees: { outstanding: 5200, overdue: 0, outstanding_count: 1 },
        pending_event_acks: 2,
        unread_messages: 1,
        pending_activity_promotions: 1,
      },
    })
    const later = buckets.value.find((b) => b.key === 'later')
    expect(later.items.length).toBe(4)
    expect(later.items.every((i) => i.variant === 'pending')).toBe(true)
  })

  it('fees 逾期 → tone=danger 並顯示「逾期」secondary', () => {
    const { buckets } = setup({
      summaryValue: {
        fees: { outstanding: 5200, overdue: 3000, outstanding_count: 1 },
      },
    })
    const later = buckets.value.find((b) => b.key === 'later')
    const fees = later.items.find((i) => i.id === 'fees')
    expect(fees.tone).toBe('danger')
    expect(fees.secondary).toContain('逾期')
    // 金額走全站 canonical 格式 NT$1,234（無空格，src/utils/currency.ts）
    expect(fees.primary).toBe('待繳費 NT$5,200')
    expect(fees.secondary).toBe('逾期 NT$3,000')
  })

  it('announcements / leaveReviews → later bucket info', () => {
    const { buckets } = setup({
      summaryValue: {
        unread_announcements: 3,
        recent_leave_reviews: 1,
      },
    })
    const later = buckets.value.find((b) => b.key === 'later')
    expect(later.items.length).toBe(2)
    expect(later.items.every((i) => i.variant === 'info')).toBe(true)
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

  it('桶內排序：past → pending → info；同類別有 time 則升冪', () => {
    const { buckets } = setup({
      summaryValue: {
        unread_announcements: 1,
        pending_event_acks: 1,
      },
      childrenValue: [
        { student_id: 1, name: '小明', attendance: { status: '出席' } },
      ],
    })
    const morning = buckets.value.find((b) => b.key === 'morning')
    const later = buckets.value.find((b) => b.key === 'later')
    expect(morning.items[0].variant).toBe('past')
    expect(later.items[0].variant).toBe('pending')
    expect(later.items[1].variant).toBe('info')
  })

  it('空桶不渲染（later 全空時不存在）', () => {
    const { buckets } = setup({
      childrenValue: [{ student_id: 1, name: '小明', attendance: { status: '出席' } }],
    })
    expect(buckets.value.find((b) => b.key === 'later')).toBeUndefined()
  })
})

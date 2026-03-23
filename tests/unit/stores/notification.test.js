import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationStore } from '@/stores/notification'
import { getNotificationSummary } from '@/api/notifications'

vi.mock('@/api/notifications', () => ({
  getNotificationSummary: vi.fn(),
}))

describe('notification store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates concurrent summary requests', async () => {
    let resolveRequest
    getNotificationSummary.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const store = useNotificationStore()
    const firstRequest = store.fetchSummary()
    const secondRequest = store.fetchSummary()

    expect(getNotificationSummary).toHaveBeenCalledTimes(1)

    resolveRequest({ data: { total_badge: 4, action_items: [], reminders: [] } })
    await Promise.all([firstRequest, secondRequest])

    expect(store.badgeCount).toBe(4)
  })

  it('maps action items to badge and legacy sidebar counts', async () => {
    getNotificationSummary.mockResolvedValue({
      data: {
        total_badge: 5,
        action_items: [
          {
            type: 'approval',
            count: 4,
            route: '/approvals',
            breakdown: {
              leaves: 2,
              overtimes: 1,
              punch_corrections: 1,
              this_month_pending_leaves: 1,
              this_month_pending_overtimes: 1,
            },
          },
          { type: 'activity_inquiry', count: 1, route: '/activity/inquiries' },
        ],
        reminders: [
          { type: 'calendar', items: [{ id: 1, label: '校外教學', date: '2026-03-20' }] },
        ],
      },
    })

    const store = useNotificationStore()
    await store.fetchSummary()

    expect(store.badgeCount).toBe(5)
    expect(store.approvalCount).toBe(4)
    expect(store.activityInquiryCount).toBe(1)
    expect(store.approvalSummary).toEqual({
      pending_leaves: 2,
      pending_overtimes: 1,
      pending_punch_corrections: 1,
      total: 4,
      this_month_pending_leaves: 1,
      this_month_pending_overtimes: 1,
    })
    expect(store.actionItems).toHaveLength(2)
    expect(store.reminders).toHaveLength(1)
  })

  it('reminders passthrough: type 與 items 原封保留', async () => {
    const calendarItems = [
      { id: 10, label: '親師座談', date: '2026-04-01' },
      { id: 11, label: '運動會', date: '2026-04-15' },
    ]

    getNotificationSummary.mockResolvedValue({
      data: {
        total_badge: 0,
        action_items: [],
        reminders: [
          { type: 'calendar', route: '/calendar', items: calendarItems },
        ],
      },
    })

    const store = useNotificationStore()
    await store.fetchSummary()

    expect(store.reminders).toHaveLength(1)
    const calendarReminder = store.reminders.find((r) => r.type === 'calendar')
    expect(calendarReminder.items).toEqual(calendarItems)
    // reminders 不計入 badge
    expect(store.badgeCount).toBe(0)
  })

  it('API 失敗時保留上次成功的 summary，不清零 badge', async () => {
    getNotificationSummary.mockResolvedValue({
      data: {
        total_badge: 3,
        action_items: [{ type: 'approval', count: 3, route: '/approvals', breakdown: {} }],
        reminders: [],
      },
    })

    const store = useNotificationStore()
    await store.fetchSummary()
    expect(store.badgeCount).toBe(3)

    // 第二次呼叫（force）模擬 API 錯誤
    getNotificationSummary.mockRejectedValue(new Error('Network Error'))
    await store.fetchSummary({ force: true })

    // badge 應保留上次值，不變為 0
    expect(store.badgeCount).toBe(3)
    expect(store.error).toBeTruthy()
  })

  it('approval breakdown 缺欄時各項目預設為 0', async () => {
    getNotificationSummary.mockResolvedValue({
      data: {
        total_badge: 2,
        action_items: [
          {
            type: 'approval',
            count: 2,
            route: '/approvals',
            breakdown: { leaves: 2 }, // overtimes / punch_corrections 未提供
          },
        ],
        reminders: [],
      },
    })

    const store = useNotificationStore()
    await store.fetchSummary()

    expect(store.approvalSummary).toMatchObject({
      pending_leaves: 2,
      pending_overtimes: 0,
      pending_punch_corrections: 0,
      this_month_pending_leaves: 0,
      this_month_pending_overtimes: 0,
      total: 2,
    })
  })

  it('回應中無 action_items 欄位時不崩潰，回傳空陣列', async () => {
    getNotificationSummary.mockResolvedValue({
      data: { total_badge: 0 }, // 故意缺少 action_items / reminders
    })

    const store = useNotificationStore()
    await store.fetchSummary()

    expect(store.actionItems).toEqual([])
    expect(store.reminders).toEqual([])
    expect(store.badgeCount).toBe(0)
  })
})

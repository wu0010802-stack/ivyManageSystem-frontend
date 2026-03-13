import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApprovalStore } from '@/stores/approval'
import { useNotificationStore } from '@/stores/notification'
import { getNotificationSummary } from '@/api/notifications'

vi.mock('@/api/notifications', () => ({
  getNotificationSummary: vi.fn(),
}))

describe('approval store', () => {
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

    const store = useApprovalStore()
    const firstRequest = store.fetchSummary()
    const secondRequest = store.fetchSummary()

    expect(getNotificationSummary).toHaveBeenCalledTimes(1)

    resolveRequest({
      data: {
        total_badge: 7,
        action_items: [{ type: 'approval', count: 7, route: '/approvals' }],
        reminders: [],
      },
    })

    await Promise.all([firstRequest, secondRequest])

    expect(store.pendingTotal).toBe(7)
  })

  it('reuses fresh data unless force is set', async () => {
    getNotificationSummary.mockResolvedValue({
      data: {
        total_badge: 3,
        action_items: [{ type: 'approval', count: 3, route: '/approvals' }],
        reminders: [],
      },
    })

    const store = useApprovalStore()
    const notificationStore = useNotificationStore()

    await store.fetchSummary()
    await store.fetchSummary()

    expect(getNotificationSummary).toHaveBeenCalledTimes(1)
    expect(notificationStore.approvalCount).toBe(3)

    await store.fetchSummary({ force: true })

    expect(getNotificationSummary).toHaveBeenCalledTimes(2)
  })
})

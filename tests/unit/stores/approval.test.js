import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApprovalStore } from '@/stores/approval'
import { getApprovalSummary } from '@/api/home'

vi.mock('@/api/home', () => ({
  getApprovalSummary: vi.fn(),
}))

describe('approval store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates concurrent summary requests', async () => {
    let resolveRequest
    getApprovalSummary.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const store = useApprovalStore()
    const firstRequest = store.fetchSummary()
    const secondRequest = store.fetchSummary()

    expect(getApprovalSummary).toHaveBeenCalledTimes(1)

    resolveRequest({ data: { total: 7 } })

    await Promise.all([firstRequest, secondRequest])

    expect(store.pendingTotal).toBe(7)
  })

  it('reuses fresh data unless force is set', async () => {
    getApprovalSummary.mockResolvedValue({ data: { total: 3 } })

    const store = useApprovalStore()

    await store.fetchSummary()
    await store.fetchSummary()

    expect(getApprovalSummary).toHaveBeenCalledTimes(1)

    await store.fetchSummary({ force: true })

    expect(getApprovalSummary).toHaveBeenCalledTimes(2)
  })
})

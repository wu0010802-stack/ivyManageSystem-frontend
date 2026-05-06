import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const fetchSummaryMock = vi.fn().mockResolvedValue({})
const invalidateMock = vi.fn()

vi.mock('@/stores/portalDashboard', () => ({
  usePortalDashboardStore: () => ({
    summary: { value: null },
    loading: { value: false },
    error: { value: null },
    fetchSummary: fetchSummaryMock,
    invalidate: invalidateMock,
  }),
}))

import {
  usePortalDashboard,
  broadcastDashboardInvalidate,
  PORTAL_DASHBOARD_INVALIDATE_EVENT,
} from '@/composables/usePortalDashboard'

describe('usePortalDashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('exports invalidate event name', () => {
    expect(PORTAL_DASHBOARD_INVALIDATE_EVENT).toBe('portal-dashboard-invalidate')
  })

  it('broadcastDashboardInvalidate dispatches CustomEvent with correct type', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    broadcastDashboardInvalidate()
    expect(spy).toHaveBeenCalled()
    const call = spy.mock.calls[0][0]
    expect(call).toBeInstanceOf(CustomEvent)
    expect(call.type).toBe('portal-dashboard-invalidate')
    spy.mockRestore()
  })

  it('returns summary/loading/error/refresh', () => {
    const result = usePortalDashboard({ autoFetch: false })
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('loading')
    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('refresh')
    expect(typeof result.refresh).toBe('function')
  })

  it('refresh() calls store.fetchSummary with force=true', async () => {
    const { refresh } = usePortalDashboard({ autoFetch: false })
    await refresh()
    expect(fetchSummaryMock).toHaveBeenCalledWith({ force: true })
  })
})

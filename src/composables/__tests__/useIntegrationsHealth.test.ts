import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/integrationsHealth', () => ({
  getIntegrationsHealth: vi.fn(),
}))

import { getIntegrationsHealth } from '@/api/integrationsHealth'
import { useIntegrationsHealth } from '@/composables/useIntegrationsHealth'
import { _resetCacheForTesting } from '@/composables/useCachedAsync'

function fakeHealthy() {
  return {
    line: {
      breaker: 'closed',
      token_healthy: true,
      token_last_check_at: '2026-05-28T00:00:00Z',
      token_consecutive_failures: 0,
      retry_pending: 0,
      retry_final_failed_24h: 0,
    },
    supabase: { breaker: 'closed', pending_uploads: 0 },
    external_http: { breaker: 'closed' },
  }
}

describe('useIntegrationsHealth', () => {
  beforeEach(() => {
    _resetCacheForTesting()
    vi.mocked(getIntegrationsHealth).mockResolvedValue({ data: fakeHealthy() } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('初次 mount 拉一次資料並暴露 data', async () => {
    const TestComp = {
      setup() {
        return useIntegrationsHealth()
      },
      template: '<div>{{ data?.line?.breaker }}</div>',
    }
    const wrapper = mount(TestComp)
    await flushPromises()
    expect(getIntegrationsHealth).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toBe('closed')
    wrapper.unmount()
  })

  it('refresh(true) 強制重新 fetch', async () => {
    const TestComp = {
      setup() {
        return useIntegrationsHealth()
      },
      template: '<div></div>',
    }
    const wrapper = mount(TestComp)
    await flushPromises()
    expect(getIntegrationsHealth).toHaveBeenCalledTimes(1)
    const { refresh } = useIntegrationsHealth()
    await refresh(true)
    expect(getIntegrationsHealth).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('API 失敗時 error 暴露但不拋', async () => {
    vi.mocked(getIntegrationsHealth).mockRejectedValueOnce(new Error('boom'))
    const TestComp = {
      setup() {
        return useIntegrationsHealth()
      },
      template: '<div>{{ error ? "err" : "ok" }}</div>',
    }
    const wrapper = mount(TestComp)
    await flushPromises()
    expect(wrapper.text()).toBe('err')
    wrapper.unmount()
  })
})

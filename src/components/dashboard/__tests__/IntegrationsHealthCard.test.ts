import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/integrationsHealth', () => ({
  getIntegrationsHealth: vi.fn(),
}))

import { getIntegrationsHealth } from '@/api/integrationsHealth'
import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import IntegrationsHealthCard from '@/components/dashboard/IntegrationsHealthCard.vue'

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
    storage: { breaker: 'closed', pending_uploads: 0, final_failed: 0 },
    external_http: { breaker: 'closed' },
  }
}

function fakeDegraded() {
  return {
    line: {
      breaker: 'open',
      token_healthy: false,
      token_last_check_at: '2026-05-28T00:00:00Z',
      token_consecutive_failures: 3,
      retry_pending: 5,
      retry_final_failed_24h: 1,
    },
    storage: { breaker: 'half_open', pending_uploads: 2, final_failed: 0 },
    external_http: { breaker: 'closed' },
  }
}

const mountOpts = { global: { plugins: [ElementPlus] } }

describe('IntegrationsHealthCard', () => {
  beforeEach(() => {
    _resetCacheForTesting()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('healthy 狀態顯示「所有外部整合運作正常」', async () => {
    vi.mocked(getIntegrationsHealth).mockResolvedValueOnce({ data: fakeHealthy() } as any)
    const wrapper = mount(IntegrationsHealthCard, mountOpts)
    await flushPromises()
    expect(wrapper.text()).toContain('所有外部整合運作正常')
    expect(wrapper.text()).toContain('LINE 推送')
    expect(wrapper.text()).toContain('正常')
    wrapper.unmount()
  })

  it('degraded 狀態以園所聽得懂的詞顯示（不出現「熔斷」等工程術語）', async () => {
    vi.mocked(getIntegrationsHealth).mockResolvedValueOnce({ data: fakeDegraded() } as any)
    const wrapper = mount(IntegrationsHealthCard, mountOpts)
    await flushPromises()
    const text = wrapper.text()
    expect(text).not.toContain('熔斷')
    expect(text).toContain('已暫停')          // open
    expect(text).toContain('恢復中')          // half_open
    expect(text).toContain('24 小時內發送失敗') // 取代「24h 終局失敗」
    expect(text).toContain('5 筆')    // retry_pending
    expect(text).toContain('1 筆')    // final_failed_24h
    expect(text).toContain('2 筆')    // pending_uploads
    expect(text).toContain('部分整合異常')
    wrapper.unmount()
  })

  it('API fail 顯示錯誤訊息並指向重新整理', async () => {
    vi.mocked(getIntegrationsHealth).mockRejectedValueOnce(new Error('500'))
    const wrapper = mount(IntegrationsHealthCard, mountOpts)
    await flushPromises()
    expect(wrapper.text()).toContain('載入失敗')
    expect(wrapper.text()).toContain('重新整理')
    wrapper.unmount()
  })
})

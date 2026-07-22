import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// #9（qa-loop 全掃 2026-06-17）：後端 StorageHealth.final_failed（永久失敗上傳數）
// 已存在，但整合健康卡原本只顯示 pending_uploads，永久失敗數對 admin 完全不可見、
// 也不觸發整體告警。此測試鎖住「final_failed > 0 時要顯示且納入 hasAnyIssue」。

const state = vi.hoisted(() => ({ data: null as unknown }))

vi.mock('@/composables/useIntegrationsHealth', async () => {
  const { computed, ref } = await import('vue')
  return {
    useIntegrationsHealth: () => ({
      data: computed(() => state.data),
      pending: ref(false),
      error: ref(null),
      refresh: () => {},
    }),
  }
})

import IntegrationsHealthCard from '@/components/dashboard/IntegrationsHealthCard.vue'

function makeHealth(storageOverrides: Record<string, unknown> = {}) {
  return {
    line: {
      breaker: 'closed',
      token_healthy: true,
      retry_pending: 0,
      retry_final_failed_24h: 0,
    },
    storage: { breaker: 'closed', pending_uploads: 0, final_failed: 0, ...storageOverrides },
    external_http: { breaker: 'closed' },
  }
}

describe('IntegrationsHealthCard — storage final_failed', () => {
  it('final_failed > 0 時顯示「同步失敗（已停止重試）」筆數並觸發整體告警', () => {
    state.data = makeHealth({ final_failed: 3 })
    const wrapper = mount(IntegrationsHealthCard)
    const text = wrapper.text()
    expect(text).toContain('同步失敗（已停止重試）')
    expect(text).toContain('3')
    expect(text).toContain('部分整合異常')
  })

  it('final_failed = 0 且無其他異常時不顯示同步失敗列', () => {
    state.data = makeHealth()
    const wrapper = mount(IntegrationsHealthCard)
    const text = wrapper.text()
    expect(text).not.toContain('同步失敗')
    expect(text).toContain('所有外部整合運作正常')
  })
})

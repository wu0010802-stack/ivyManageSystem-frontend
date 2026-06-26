/**
 * 共享平板登出後離職結算 PII 殘留（quick-win 2026-06-26）：clearAuth 應重置 offboarding store。
 *
 * 問題：clearAuth → _resetStores 對 setup store 的 fallback 是「零參數呼叫 store.invalidate?.()」，
 * 但 offboarding store 的 invalidate(id) 需要 employee_id → 零參數呼叫等於 cache.delete(undefined)
 * 刪不到任何東西。離職詳情快取（含資遣費 / 離職結算金額等 HR 財務 PII）跨換人存活於記憶體；
 * 登出 / 登入皆 SPA router.push 不 reload，記憶體不會被自然清掉，下一位 admin 在 refetch 前可讀到。
 * 與 2026-06-25 P1 的 portalMessages / portalDashboard PII 殘留同類，只是漏網到另一個 store。
 *
 * 修法：offboarding store 的 invalidate() 無參數時清空整個 cache（對齊 _resetStores 的零參數契約）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { clearAuth } from '@/utils/auth'
import { useOffboardingStore, type OffboardingDetail } from '@/stores/offboarding'

describe('clearAuth 重置 offboarding store（共享平板離職結算 PII 殘留）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('登出時清空 offboarding 的離職詳情快取（含資遣費等 HR 財務 PII）', () => {
    const store = useOffboardingStore()
    // 灌入前一位 admin 查過的離職結算（含資遣費 PII）
    store.cache.set(
      7,
      { employee_id: 7, severance_pay: 80000 } as unknown as OffboardingDetail,
    )
    expect(store.getDetail(7)).toBeDefined()

    clearAuth({ notifyServer: false })

    expect(store.getDetail(7)).toBeUndefined()
    expect(store.cache.size).toBe(0)
  })
})

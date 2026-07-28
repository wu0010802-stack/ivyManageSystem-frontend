/**
 * 共享平板教師端 PII 殘留・正式版復發（bug-hunt 2026-07-27，P0）
 *
 * 問題：`_resetStores()` 靠「setup store 的 $reset() 會 throw」來分流，throw 才 fallback
 * 呼叫 invalidate()。但 pinia 3.0.4 只在非 production 才給那個會 throw 的實作
 * （node_modules/pinia/dist/pinia.mjs）：
 *
 *     const $reset = isOptionsStore
 *       ? function $reset() { ... }
 *       : (process.env.NODE_ENV !== 'production')
 *           ? () => { throw new Error('...does not implement $reset().') }
 *           : noop;
 *
 * `vite build` 會把 NODE_ENV 換成 'production'，setup store 的 $reset 變成 noop →
 * 不 throw → catch 永不執行 → invalidate() 一次都沒被呼叫 → 教師 A 登出、B 登入後
 * 仍讀得到 A 的家長對話與學生過敏/用藥/缺席。
 *
 * 姊妹測試 clearAuth_resets_setup_stores_2026_06_25.test.ts 跑在 NODE_ENV=test，
 * 走的正是唯一會正常運作的那條分支，因此恆綠、遮蔽本問題。
 * 本檔改以 production 語意建立 store，鎖住正式版行為。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { clearAuth } from '@/utils/auth'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { usePortalDashboardStore } from '@/stores/portalDashboard'

describe('clearAuth 在正式版語意下仍需清空 setup store', () => {
  beforeEach(() => {
    // 必須早於 store 實例化：pinia 在 createSetupStore 當下決定 $reset 是 throw 還是 noop
    vi.stubEnv('NODE_ENV', 'production')
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('setup store 的 $reset 在 production 是 noop（釘住前提，避免 pinia 改版後本檔失去意義）', () => {
    const store = usePortalMessagesStore()
    expect(() => store.$reset()).not.toThrow()
  })

  it('登出時清空 portalMessages 的 threads / threadsLoaded / messagesByThread', () => {
    const store = usePortalMessagesStore()
    // 灌入前一位教師的家長訊息串（含學生姓名 + 對話 PII）
    store.threads = [{ id: 1, student_name: '王小明', last_body: '請假事宜' }]
    store.threadsLoaded = true
    store.messagesByThread = {
      1: { items: [{ id: 10, body: '收到' }], next_cursor: null, hasMore: false },
    }

    clearAuth({ notifyServer: false })

    expect(store.threads).toEqual([])
    expect(store.threadsLoaded).toBe(false)
    expect(store.messagesByThread).toEqual({})
  })

  it('登出時清空 portalDashboard 的 summary（含過敏/用藥/缺席）', () => {
    const store = usePortalDashboardStore()
    store.summary = { allergies: ['花生'], medications: ['退燒藥'], absences: 2 }

    clearAuth({ notifyServer: false })

    expect(store.summary).toBeNull()
  })
})

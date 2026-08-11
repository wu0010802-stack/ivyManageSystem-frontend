import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'
import ElementPlus from 'element-plus'

/**
 * 降頻輪詢（30s）期間，新 op 入列不可等到下一次降頻 tick 才被發現——必須靠
 * onOpsEnqueued 事件立即補一次 refresh，確保「使用者剛離線入佇時 indicator 出現
 * 的延遲不可明顯變差」。本檔用真實 enqueueOp（fake-indexeddb）+ 真實計時器，不
 * mock offlineQueue，驗證事件真的有串起來，而不是只驗證 mock 呼叫次數。
 *
 * ⚠ 刻意不用 vi.useFakeTimers()：fake-indexeddb 的請求完成內部靠計時器排程，
 * 與 fake timers 搭配會卡死（enqueueOp 等計時器推進、測試等 enqueueOp resolve，
 * 兩邊互卡）。改用 vi.waitFor 搭配短 timeout：若沒有事件喚醒，indicator 要等到
 * 下一次 30s 降頻 tick 才會出現，遠超過這裡的短 timeout，測試會如預期失敗。
 */
vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))

vi.mock('@/parent/utils/parentOfflineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/parent/utils/parentOfflineQueue')>('@/parent/utils/parentOfflineQueue')
  return { ...actual, flushAllParent: vi.fn().mockResolvedValue({ succeeded: 0, needs_review: 0, kept: 0, auth_failed: false }) }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { enqueueOp, clearAll, OP_KINDS } from '@/utils/offlineQueue'

describe('ParentOfflineIndicator 降頻期間的即時喚醒', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await clearAll()
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as unknown as ReturnType<typeof useParentAuthStore>)
  })

  it('佇列空進入降頻後，enqueueOp 立即讓 indicator 顯示，不必等到下一次降頻 tick', async () => {
    const wrapper = mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.waitFor(() => {
      expect(wrapper.text()).not.toContain('等待同步')
    })

    // 模擬離線寫入：不等待降頻 tick，直接入列一筆。
    await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { content: 'x' }, userId: 7 })

    // 短 timeout（遠小於 30s 降頻間隔）：若沒有事件驅動的立即 refresh，這裡必然逾時。
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('1 筆等待同步')
    }, { timeout: 1000 })
  })
})

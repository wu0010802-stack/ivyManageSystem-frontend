import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import 'fake-indexeddb/auto'

// 強制離線，banner 才會顯示
vi.mock('@/composables/useOnlineStatus', async () => {
  const { ref } = await import('vue')
  return { useOnlineStatus: () => ({ isOnline: ref(false) }) }
})

// 當前登入者 = id 7
vi.mock('@/utils/auth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/auth')>('@/utils/auth')
  return { ...actual, getUserInfo: vi.fn(() => ({ id: 7 })) }
})

import OfflineIndicator from '../OfflineIndicator.vue'
import { enqueueOp, OP_KINDS, clearAll } from '@/utils/offlineQueue'

describe('OfflineIndicator 待同步 badge', () => {
  beforeEach(async () => {
    await clearAll()
  })

  it('共享裝置上只計算「當前使用者」的 pending（P2-5）', async () => {
    // 當前使用者 7：2 筆
    await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { x: 1 }, userId: 7 })
    await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { x: 2 }, userId: 7 })
    // 其他使用者 99：3 筆（不應被算進來）
    await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { x: 3 }, userId: 99 })
    await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { x: 4 }, userId: 99 })
    await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { x: 5 }, userId: 99 })

    const wrapper = mount(OfflineIndicator)
    await new Promise((r) => setTimeout(r, 100))

    expect(wrapper.text()).toContain('待同步 2 筆')
    expect(wrapper.text()).not.toContain('待同步 5 筆')
  })
})

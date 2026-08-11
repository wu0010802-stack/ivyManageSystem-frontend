import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'
import ElementPlus from 'element-plus'

/**
 * P2（全分支審查抓到）：輪詢改遞迴 setTimeout 後缺 unmount continuation guard。
 *
 * tick() 內 `await refresh()` 進行中若撞上 unmount，`onUnmounted` 清掉的是
 * 「已經觸發、value 已消耗」的舊 timer id——refresh() 事後才 resolve 時，
 * tick() 仍會照常呼叫 scheduleNext() 建立一個新 timer，而這個新 timer 沒有
 * 任何人會再清掉（onUnmounted 已經跑過一次），形成殭屍輪詢。
 *
 * ⚠ listOpsForKinds mock（同 bgPoll.test.ts 手法）+ vi.useFakeTimers() 搭配：
 * fake-indexeddb 只是 side-effect import 供 polyfill 存在，實際 IO 走 mock，
 * 不會撞上 idleWake.test.ts 註解描述的「fake timers 與 fake-indexeddb 真實計時
 * 器互卡」問題（那是走真實 enqueueOp 才會發生）。
 */
vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))

vi.mock('@/parent/utils/parentOfflineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/parent/utils/parentOfflineQueue')>('@/parent/utils/parentOfflineQueue')
  return { ...actual, flushAllParent: vi.fn().mockResolvedValue({ succeeded: 0, needs_review: 0, kept: 0, auth_failed: false }) }
})

// onOpsEnqueued 是純記憶體 pub/sub（無 IndexedDB 依賴），但仍需要 mock 成可從測試
// 手動觸發，才能在不依賴真實 enqueueOp（會撞上 idleWake.test.ts 註解描述的
// fake timers × fake-indexeddb 真實計時器互卡）的情況下模擬「事件回呼中 refresh()
// 進行中」的窗口。
const { onOpsEnqueuedMock, triggerEnqueued } = vi.hoisted(() => {
  let listener: (() => void) | null = null
  return {
    onOpsEnqueuedMock: vi.fn((l: () => void) => {
      listener = l
      return () => { listener = null }
    }),
    triggerEnqueued: () => listener?.(),
  }
})

vi.mock('@/utils/offlineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/utils/offlineQueue')>('@/utils/offlineQueue')
  return { ...actual, listOpsForKinds: vi.fn(() => Promise.resolve({})), onOpsEnqueued: onOpsEnqueuedMock }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { listOpsForKinds } from '@/utils/offlineQueue'
import { PARENT_KINDS } from '@/parent/utils/parentOfflineQueue'

function emptyGrouped() {
  return Object.fromEntries(PARENT_KINDS.map((k) => [k, { pending: [], needs_review: [] }]))
}

describe('ParentOfflineIndicator unmount continuation guard（P2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as unknown as ReturnType<typeof useParentAuthStore>)
    vi.mocked(listOpsForKinds).mockResolvedValue(emptyGrouped())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('unmount 撞上 tick() 中 await refresh() 進行中的窗口，resolve 後不會重建殭屍輪詢 timer', async () => {
    const wrapper = mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0) // onMounted 首載 refresh
    expect(listOpsForKinds).toHaveBeenCalledTimes(1)

    // 佇列全空 → 降頻 30s；推進到下一次 tick，讓它卡在 await refresh() 中
    let resolveSecond!: (v: unknown) => void
    const pendingSecond = new Promise((r) => { resolveSecond = r })
    vi.mocked(listOpsForKinds).mockReturnValueOnce(pendingSecond as ReturnType<typeof listOpsForKinds>)
    await vi.advanceTimersByTimeAsync(30000)
    expect(listOpsForKinds).toHaveBeenCalledTimes(2) // 第二次 tick 已呼叫，卡在 await 中

    // 這時 unmount：元件被銷毀，但 tick() 的 await refresh() 仍在進行中
    wrapper.unmount()

    // refresh() 姍姍來遲才 resolve（模擬 unmount 撞上 in-flight 的窗口）
    resolveSecond(emptyGrouped())
    await flushPromises()

    // 修復前：resolve 後 tick() 照常呼叫 scheduleNext() 重建一個沒人清的 timer，
    // 30s/60s 後會再呼叫一次 listOpsForKinds（殭屍輪詢）。
    // 修復後：disposed guard 讓 unmount 後不再重建 timer，往後怎麼推進時間都
    // 不該再呼叫。
    await vi.advanceTimersByTimeAsync(60000)
    expect(listOpsForKinds).toHaveBeenCalledTimes(2)
  })

  it('unmount 撞上 onOpsEnqueued 回呼中的 refresh() 進行中窗口，resolve 後不會重建殭屍輪詢 timer', async () => {
    const wrapper = mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0) // onMounted 首載 refresh，並向 onOpsEnqueuedMock 註冊 listener
    expect(listOpsForKinds).toHaveBeenCalledTimes(1)
    expect(onOpsEnqueuedMock).toHaveBeenCalledTimes(1)

    let resolveEnqueued!: (v: unknown) => void
    const pendingEnqueued = new Promise((r) => { resolveEnqueued = r })
    vi.mocked(listOpsForKinds).mockReturnValueOnce(pendingEnqueued as ReturnType<typeof listOpsForKinds>)
    triggerEnqueued() // 模擬「有新 op 入列」事件，觸發 onMounted 內註冊的 enqueued callback
    expect(listOpsForKinds).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    resolveEnqueued(emptyGrouped())
    await flushPromises()

    await vi.advanceTimersByTimeAsync(60000)
    expect(listOpsForKinds).toHaveBeenCalledTimes(2)
  })
})

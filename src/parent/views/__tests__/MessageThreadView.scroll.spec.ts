import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

// vue-router：保留實際 createRouter/createWebHashHistory 供 router.ts 使用，
// 僅覆寫 useRoute 回傳固定 params
vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRoute: () => ({ params: { threadId: '1' } }) }
})

// useKeyboardInset：解耦 Task 1，mock 回傳 keyboardInset=0
vi.mock('../../composables/useKeyboardInset', () => ({ useKeyboardInset: () => ({ keyboardInset: ref(0) }) }))

// messages store（可控 messages）
//
// fetchMessages / markRead 改成可從外部個別 mockResolvedValueOnce /
// mockRejectedValueOnce 的持久 vi.fn()——原本寫死在 factory 裡的
// `vi.fn(() => Promise.resolve())` 每次 useMessagesStore() 呼叫都是新實例，
// 外部拿不到控制權，結構上測不到任何失敗路徑（三態測試因此完全缺角）。
const messageItems = ref<{ id: number }[]>([])
const mockFetchMessages = vi.fn()
const mockMarkRead = vi.fn()
vi.mock('../../stores/messages', () => ({
  useMessagesStore: () => ({
    get messagesByThread() { return { 1: { items: messageItems.value, hasMore: false } } },
    fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
    markRead: (...args: unknown[]) => mockMarkRead(...args),
  }),
}))

const mockGetMessageThread = vi.fn()
vi.mock('../../api/messages', () => ({ getMessageThread: (...args: unknown[]) => mockGetMessageThread(...args) }))

vi.mock('@/parent/utils/parentOfflineQueue', () => ({ enqueueParent: vi.fn(), flushParentQueue: vi.fn(() => Promise.resolve()) }))

vi.mock('../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const stubs = { MessageBubble: true, MessageComposer: true, ConfirmDialog: true }
import MessageThreadView from '../MessageThreadView.vue'
import router from '../../router'

const SUCCESS_THREAD = { data: { teacher_name: '王老師', student_name: '小明' } }

beforeEach(() => {
  mockGetMessageThread.mockReset().mockResolvedValue(SUCCESS_THREAD)
  mockFetchMessages.mockReset().mockResolvedValue(undefined)
  mockMarkRead.mockReset().mockResolvedValue(undefined)
})

describe('MessageThreadView 自動捲底 + route', () => {
  beforeEach(() => { messageItems.value = [{ id: 1 }, { id: 2 }] })

  it('route /messages/:threadId 設 hideTabBar', () => {
    const rec = router.getRoutes().find((r) => r.path.includes('/messages/:threadId'))
    expect(rec?.meta?.hideTabBar).toBe(true)
  })

  it('新訊息到達後 .messages 捲到底', async () => {
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()
    const el = wrapper.find('.messages').element as HTMLElement
    Object.defineProperty(el, 'scrollHeight', { value: 1500, configurable: true })
    // 模擬收到新訊息
    messageItems.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
    await nextTick(); await nextTick()
    expect(el.scrollTop).toBe(1500)
  })

  it('loadMore 時不捲底（保留閱讀位置）', async () => {
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()
    const el = wrapper.find('.messages').element as HTMLElement
    // 設 loadingMore=true（載入更早訊息）
    (wrapper.vm as any).loadingMore = true
    // 記錄初始 scrollTop
    const beforeScrollTop = el.scrollTop
    // 追加舊訊息（前面）
    messageItems.value = [{ id: 0 }, ...messageItems.value]
    await nextTick(); await nextTick()
    // 驗證未自動捲底（scrollTop 應保持不變）
    expect(el.scrollTop).toBe(beforeScrollTop)
  })
})

describe('MessageThreadView 三態', () => {
  // 三態測試模擬「這串對話還沒成功載入過任何訊息」，跟自動捲底測試的
  // 「已經有訊息、驗證捲動行為」是不同前提，這裡故意從空陣列開始。
  beforeEach(() => { messageItems.value = [] })

  it('載入中：getMessageThread 尚未 resolve 時顯示 SkeletonBlock，不顯示訊息列表', async () => {
    mockGetMessageThread.mockReturnValue(new Promise(() => {})) // 永不 resolve，凍結在 pending
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(wrapper.find('.messages').exists()).toBe(false)
  })

  it('getMessageThread 失敗 → 顯示 MobileErrorRetry（原本只丟一個會消失的 toast，畫面留白）', async () => {
    mockGetMessageThread.mockRejectedValueOnce({ displayMessage: '網路錯誤' })
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()

    const errComp = wrapper.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(wrapper.find('.messages').exists()).toBe(false)
  })

  it('fetchMessages 失敗（thread 資訊拿得到但訊息拿不到）→ 同樣顯示 MobileErrorRetry', async () => {
    mockGetMessageThread.mockResolvedValueOnce(SUCCESS_THREAD)
    mockFetchMessages.mockRejectedValueOnce({ displayMessage: '網路錯誤' })
    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(true)
  })

  it('按「重試」成功後恢復正常畫面（訊息列表出現、錯誤態消失）', async () => {
    mockGetMessageThread
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_THREAD)

    const wrapper = mount(MessageThreadView, { global: { stubs } })
    await flushPromises()

    const errComp = wrapper.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(mockGetMessageThread).toHaveBeenCalledTimes(1)

    await errComp.find('button').trigger('click')
    await flushPromises()

    expect(mockGetMessageThread).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(wrapper.find('.messages').exists()).toBe(true)
  })
})

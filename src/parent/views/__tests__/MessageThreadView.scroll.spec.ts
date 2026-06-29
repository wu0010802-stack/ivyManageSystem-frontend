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
const messageItems = ref<{ id: number }[]>([])
vi.mock('../../stores/messages', () => ({
  useMessagesStore: () => ({
    get messagesByThread() { return { 1: { items: messageItems.value, hasMore: false } } },
    fetchMessages: vi.fn(() => Promise.resolve()),
    markRead: vi.fn(() => Promise.resolve()),
  }),
}))
vi.mock('../../api/messages', () => ({ getMessageThread: vi.fn(() => Promise.resolve({ data: { teacher_name: '王老師', student_name: '小明' } })) }))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({ enqueueParent: vi.fn(), flushParentQueue: vi.fn(() => Promise.resolve()) }))

const stubs = { MessageBubble: true, MessageComposer: true, ConfirmDialog: true }
import MessageThreadView from '../MessageThreadView.vue'
import router from '../../router'

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

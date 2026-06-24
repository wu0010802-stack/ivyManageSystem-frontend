/**
 * MessagesView 三態測試：載入中（skeleton）/ 錯誤（MobileErrorRetry）/ 成功
 * Task 10: 訊息頁載入失敗顯示錯誤態（修落空態 bug）+ 冷調重塑（Bento P4）
 *
 * Bug 描述：fetchThreads / listAnnouncements 皆 reject 時，finally 仍設 loaded=true，
 * 導致 UI 落到「目前沒有訊息」的 EmptyState（應顯示 MobileErrorRetry）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── 可控的 mock ────────────────────────────────────────────────────────────
const fetchThreadsMock = vi.fn()
const listAnnouncementsMock = vi.fn()

// 讓 threadsLoaded 可反應 fetchThreads 的結果（模擬 store 行為）
const mockThreads = ref<unknown[]>([])
const mockThreadsLoaded = ref(false)

vi.mock('@/parent/stores/messages', () => ({
  useMessagesStore: () => ({
    get threads() { return mockThreads.value },
    get threadsLoaded() { return mockThreadsLoaded.value },
    fetchThreads: async (...args: unknown[]) => {
      try {
        const result = await fetchThreadsMock(...args)
        // 模擬 store 成功後設 threadsLoaded=true 並填充 threads
        if ((result as { data?: { items?: unknown[] } })?.data?.items) {
          mockThreads.value = (result as { data: { items: unknown[] } }).data.items
        }
        mockThreadsLoaded.value = true
        return result
      } catch (err) {
        // 模擬 store fetch 失敗時仍標 threadsLoaded=true（store 的 finally 行為）
        mockThreadsLoaded.value = true
        throw err
      }
    },
  }),
}))

vi.mock('@/parent/api/announcements', () => ({
  listAnnouncements: (...args: unknown[]) => listAnnouncementsMock(...args),
  markRead: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// 元件 stubs：PullToRefresh 必須渲染 slot；其餘 heavy 元件 stub 掉
const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  MessagesSearchBar: true,
  AnnouncementDetailModal: true,
  KawaiiStar: true,
}

// 成功回應預設值
const SUCCESS_THREADS = {
  data: {
    items: [{ id: 1, teacher_name: '王老師', student_name: '小明', last_message_at: '2026-06-01T10:00:00', last_message_preview: '您好', unread_count: 1 }],
  },
}
const SUCCESS_ANNOUNCEMENTS = {
  data: {
    items: [{ id: 1, priority: 'normal', is_read: false, created_at: '2026-06-01T09:00:00', title: '校慶通知', content: '本月底舉行校慶' }],
  },
}

beforeEach(() => {
  fetchThreadsMock.mockReset()
  listAnnouncementsMock.mockReset()
  // 重置響應式 store 狀態
  mockThreads.value = []
  mockThreadsLoaded.value = false
})

describe('MessagesView 三態（Task 10）', () => {
  it('threads / announcements 載入失敗時顯示錯誤態而非空態', async () => {
    // 兩個 API 都 reject（模擬網路錯誤）
    fetchThreadsMock.mockRejectedValue(new Error('網路錯誤'))
    listAnnouncementsMock.mockRejectedValue(new Error('網路錯誤'))

    setActivePinia(createPinia())
    const MessagesView = (await import('@/parent/views/MessagesView.vue')).default
    const w = mount(MessagesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // MobileErrorRetry 應出現（loadError=true）
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(true)

    // EmptyState 不應出現（bug 修前：EmptyState 顯示，因 finally 設 loaded=true 但資料為空）
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

    w.unmount()
  })

  it('載入中：fullyLoaded=false 時顯示 SkeletonBlock', async () => {
    // 兩個 API 永不 resolve（模擬無限 pending）
    fetchThreadsMock.mockReturnValue(new Promise(() => {}))
    listAnnouncementsMock.mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const MessagesView = (await import('@/parent/views/MessagesView.vue')).default
    const w = mount(MessagesView, {
      global: { stubs: STUBS },
    })
    // 不 await flushPromises → 仍 pending → loading=true

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)

    w.unmount()
  })

  it('重試後成功：MobileErrorRetry 消失，列表顯示', async () => {
    // 第一次都 reject，第二次都 resolve（模擬重試成功）
    fetchThreadsMock
      .mockRejectedValueOnce(new Error('網路錯誤'))
      .mockResolvedValueOnce(SUCCESS_THREADS)
    listAnnouncementsMock
      .mockRejectedValueOnce(new Error('網路錯誤'))
      .mockResolvedValueOnce(SUCCESS_ANNOUNCEMENTS)

    setActivePinia(createPinia())
    const MessagesView = (await import('@/parent/views/MessagesView.vue')).default
    const w = mount(MessagesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 初始失敗 → MobileErrorRetry 出現
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    // 點「重試」
    await errComp.find('button').trigger('click')
    await flushPromises()

    // 重試成功後 MobileErrorRetry 消失
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    // EmptyState 也不應出現（有資料）
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

    w.unmount()
  })

  it('重試期間（re-fetch pending）顯示 SkeletonBlock', async () => {
    // 第一次兩 API 都 reject
    fetchThreadsMock.mockRejectedValueOnce(new Error('網路錯誤'))
    listAnnouncementsMock.mockRejectedValueOnce(new Error('網路錯誤'))

    setActivePinia(createPinia())
    const MessagesView = (await import('@/parent/views/MessagesView.vue')).default
    const w = mount(MessagesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 初始失敗 → MobileErrorRetry 出現
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    // 重試：兩 API 永不 resolve（模擬 re-fetch 仍 pending）
    fetchThreadsMock.mockReturnValue(new Promise(() => {}))
    listAnnouncementsMock.mockReturnValue(new Promise(() => {}))

    // 點「重試」，不 await flushPromises → re-fetch 仍 pending
    await errComp.find('button').trigger('click')

    // re-fetch pending 期間應顯示 SkeletonBlock（announcementsLoaded 已重設為 false）
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('成功載入後 SkeletonBlock 消失、MobileErrorRetry 不存在', async () => {
    fetchThreadsMock.mockResolvedValue(SUCCESS_THREADS)
    listAnnouncementsMock.mockResolvedValue(SUCCESS_ANNOUNCEMENTS)

    setActivePinia(createPinia())
    const MessagesView = (await import('@/parent/views/MessagesView.vue')).default
    const w = mount(MessagesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })
})

/**
 * 家長端「假線上」（navigator.onLine === true 但實際網路不通）寫入回歸測試。
 *
 * `src/composables/useOnlineStatus.ts` 檔頭明訂：`navigator.onLine` 只看網卡，
 * 連得到 wifi／行動網路但打不到 server 時仍為 true，所以寫入在實際 POST 失敗
 * （ERR_NETWORK）時**也要 fallback 進離線佇列**，不可只靠 `!navigator.onLine` 分流。
 * 教師端點名（PortalStudentAttendanceView）早已這樣做，家長端 5 個入列點原本沒有
 * ——手機在電梯／地下室／弱訊號送出的請假、聯絡簿回覆會直接丟失。
 *
 * 這裡一律 **mount 真 view**，讓 production code 自己跑分流。
 * ⚠ 不可退回「測試內手抄 view 邏輯再斷言自己呼叫的 mock」的寫法
 * （`parent-offline-views.test.ts` 舊採此法 → 永遠不會紅，抓不到本 bug）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

// vi.mock factory 會被 hoist 到檔案頂端，內部不可引用一般頂層變數 → 全部走 vi.hoisted。
const h = vi.hoisted(() => ({
  getContactBookDetail: vi.fn(),
  ackContactBook: vi.fn(),
  replyContactBook: vi.fn(),
  createLeave: vi.fn(),
  listEvents: vi.fn(),
  acknowledgeEvent: vi.fn(),
  storeSend: vi.fn(),
  getMessageThread: vi.fn(),
  childrenLoad: vi.fn(),
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn(),
  flushAllParent: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarn: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}))

/** 假線上的網路層失敗（axios ERR_NETWORK 形狀：無 response）。 */
function networkError() {
  return Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
}

const mockRoute = reactive<{ params: Record<string, string>; query: Record<string, string> }>({
  params: { entryId: '1', eventId: '7', threadId: '5' },
  query: {},
})
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: h.routerPush, replace: h.routerReplace }),
}))

vi.mock('@/parent/api/contactBook', () => ({
  getContactBookDetail: h.getContactBookDetail,
  ackContactBook: h.ackContactBook,
  replyContactBook: h.replyContactBook,
  deleteContactBookReply: vi.fn(),
}))

vi.mock('@/parent/api/leaves', () => ({
  createLeave: h.createLeave,
  listLeaves: vi.fn().mockResolvedValue({ data: { items: [] } }),
  cancelLeave: vi.fn(),
  uploadLeaveAttachment: vi.fn(),
  deleteLeaveAttachment: vi.fn(),
  getLeave: vi.fn().mockResolvedValue({ data: { id: 1 } }),
}))

vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: h.enqueueParent,
  flushParentQueue: h.flushParentQueue,
  flushAllParent: h.flushAllParent,
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: h.toastError, success: h.toastSuccess, warn: h.toastWarn, info: vi.fn() },
}))

vi.mock('@/parent/api/events', () => ({
  listEvents: h.listEvents,
  acknowledgeEvent: h.acknowledgeEvent,
}))

vi.mock('@/parent/api/medications', () => ({
  uploadAckSignature: vi.fn(),
}))

vi.mock('@/parent/api/messages', () => ({
  getMessageThread: h.getMessageThread,
  sendThreadMessage: vi.fn(),
  attachToMessage: vi.fn(),
}))

vi.mock('@/parent/stores/messages', () => ({
  useMessagesStore: () => ({
    send: h.storeSend,
    messagesByThread: { 5: { items: [], hasMore: false } },
    threads: [],
    threadsLoaded: true,
    unreadCount: 0,
    fetchMessages: vi.fn().mockResolvedValue(undefined),
    fetchThreads: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue(undefined),
    refreshUnread: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 3, name: '王小明', classroom_name: '小班' }],
    loaded: true,
    loading: false,
    error: null,
    load: h.childrenLoad,
    invalidate: vi.fn(),
    clear: vi.fn(),
  }),
}))

import { OP_KINDS } from '@/utils/offlineQueue'
import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'
import EventAckView from '@/parent/views/EventAckView.vue'
import MessageThreadView from '@/parent/views/MessageThreadView.vue'
import MessageComposer from '@/parent/components/MessageComposer.vue'
import LeavesView from '@/parent/views/LeavesView.vue'
import LeaveForm from '@/parent/components/leaves/LeaveForm.vue'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true })
}

function cbEntry({ isRead }: { isRead: boolean }) {
  return {
    data: {
      id: 1,
      student_id: 1,
      log_date: '2026-08-13',
      mood: 'happy',
      teacher_note: '今天很棒',
      isRead,
      readAt: isRead ? '2026-08-12T00:00:00Z' : null,
      photos: [],
      replies: [],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.enqueueParent.mockResolvedValue({ id: 'op-1', payload: {} })
  h.flushParentQueue.mockResolvedValue({ succeeded: 0, needs_review: 0, kept: 0, auth_failed: false })
  h.flushAllParent.mockResolvedValue({ succeeded: 0, needs_review: 0, kept: 0, auth_failed: false })
  h.childrenLoad.mockResolvedValue(undefined)
  h.getMessageThread.mockResolvedValue({ data: { id: 5, subject: '測試主旨', messages: [] } })
  h.listEvents.mockResolvedValue({
    data: { items: [{ id: 7, title: '校外教學同意書', require_signature: false, content: '內容' }] },
  })
  mockRoute.params.entryId = '1'
  // 關鍵前提：瀏覽器自認為「線上」
  setOnline(true)
})

describe('家長端假線上 → 寫入必須 fallback 進離線佇列', () => {
  it('聯絡簿標記已讀：ackContactBook 丟 ERR_NETWORK → enqueue CONTACT_BOOK_ACK', async () => {
    h.getContactBookDetail.mockResolvedValue(cbEntry({ isRead: false }))
    h.ackContactBook.mockRejectedValue(networkError())

    mount(ContactBookDetailView)
    await flushPromises()

    // 未讀 entry mount 後會自動 markAsRead
    expect(h.ackContactBook).toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.CONTACT_BOOK_ACK,
        payload: expect.objectContaining({ entry_id: 1 }),
      })
    )
  })

  it('聯絡簿回覆：replyContactBook 丟 ERR_NETWORK → enqueue CONTACT_BOOK_REPLY，內容不遺失', async () => {
    h.getContactBookDetail.mockResolvedValue(cbEntry({ isRead: true }))
    h.replyContactBook.mockRejectedValue(networkError())

    const w = mount(ContactBookDetailView)
    await flushPromises()

    const textarea = w.find('textarea')
    expect(textarea.exists()).toBe(true)
    await textarea.setValue('老師好，明天請假')

    const sendBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(sendBtn).toBeTruthy()
    await sendBtn!.trigger('click')
    await flushPromises()

    expect(h.replyContactBook).toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.CONTACT_BOOK_REPLY,
        payload: expect.objectContaining({ entry_id: 1, body: '老師好，明天請假' }),
      })
    )
  })

  it('事件簽收：acknowledgeEvent 丟 ERR_NETWORK → enqueue EVENT_ACK', async () => {
    h.acknowledgeEvent.mockRejectedValue(networkError())

    const w = mount(EventAckView)
    await flushPromises()

    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出簽收'))
    expect(submitBtn).toBeTruthy()
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(h.acknowledgeEvent).toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.EVENT_ACK,
        payload: expect.objectContaining({ event_id: 7, student_id: 3 }),
      })
    )
  })

  it('訊息送出：store.send 丟 ERR_NETWORK → enqueue PARENT_MESSAGE，訊息不遺失', async () => {
    h.storeSend.mockRejectedValue(networkError())

    const w = mount(MessageThreadView)
    await flushPromises()

    const composer = w.findComponent(MessageComposer)
    expect(composer.exists()).toBe(true)
    const done = vi.fn()
    composer.vm.$emit('send', { body: '老師午安', attachments: [], done })
    await flushPromises()

    expect(h.storeSend).toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.PARENT_MESSAGE,
        payload: expect.objectContaining({ thread_id: 5, body: '老師午安' }),
      })
    )
  })

  it('請假送出：createLeave 丟 ERR_NETWORK → enqueue PARENT_LEAVE_REQUEST', async () => {
    h.createLeave.mockRejectedValue(networkError())

    const w = mount(LeavesView)
    await flushPromises()

    // 開表單（openForm 會用 children store 的第一位子女填入預設值）
    const openBtn = w.findAll('button').find((b) => b.text().includes('請假'))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    await flushPromises()

    const form = w.findComponent(LeaveForm)
    expect(form.exists()).toBe(true)
    form.vm.$emit('submit')
    await flushPromises()

    expect(h.createLeave).toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.PARENT_LEAVE_REQUEST,
        payload: expect.objectContaining({ student_id: 3 }),
      })
    )
  })

  it('伺服器回 4xx（非網路層）→ 不入列，維持錯誤提示', async () => {
    // 守住 fallback 的邊界：只有網路層失敗才進佇列，業務錯誤照常報錯，
    // 否則會把「後端已明確拒絕」的操作反覆重送。
    h.getContactBookDetail.mockResolvedValue(cbEntry({ isRead: true }))
    h.replyContactBook.mockRejectedValue(
      Object.assign(new Error('Bad Request'), { response: { status: 400, data: { detail: '內容不合法' } } })
    )

    const w = mount(ContactBookDetailView)
    await flushPromises()
    await w.find('textarea').setValue('測試回覆')
    await w.findAll('button').find((b) => b.text().includes('送出'))!.trigger('click')
    await flushPromises()

    expect(h.replyContactBook).toHaveBeenCalled()
    expect(h.enqueueParent).not.toHaveBeenCalled()
    expect(h.toastError).toHaveBeenCalled()
  })
})

describe('家長端離線（navigator.onLine === false）→ 直接入列不打 API', () => {
  beforeEach(() => {
    setOnline(false)
  })

  it('聯絡簿標記已讀 → enqueue CONTACT_BOOK_ACK，不呼叫 ackContactBook', async () => {
    h.getContactBookDetail.mockResolvedValue(cbEntry({ isRead: false }))

    mount(ContactBookDetailView)
    await flushPromises()

    expect(h.ackContactBook).not.toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: OP_KINDS.CONTACT_BOOK_ACK })
    )
  })

  it('聯絡簿回覆 → enqueue CONTACT_BOOK_REPLY，不呼叫 replyContactBook', async () => {
    h.getContactBookDetail.mockResolvedValue(cbEntry({ isRead: true }))

    const w = mount(ContactBookDetailView)
    await flushPromises()
    await w.find('textarea').setValue('離線回覆')
    await w.findAll('button').find((b) => b.text().includes('送出'))!.trigger('click')
    await flushPromises()

    expect(h.replyContactBook).not.toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.CONTACT_BOOK_REPLY,
        payload: expect.objectContaining({ body: '離線回覆' }),
      })
    )
  })

  it('事件簽收（無手寫簽名）→ enqueue EVENT_ACK，不呼叫 acknowledgeEvent', async () => {
    const w = mount(EventAckView)
    await flushPromises()
    await w.findAll('button').find((b) => b.text().includes('送出簽收'))!.trigger('click')
    await flushPromises()

    expect(h.acknowledgeEvent).not.toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: OP_KINDS.EVENT_ACK })
    )
  })

  it('純文字訊息 → enqueue PARENT_MESSAGE，不呼叫 store.send', async () => {
    const w = mount(MessageThreadView)
    await flushPromises()

    const done = vi.fn()
    w.findComponent(MessageComposer).vm.$emit('send', { body: '離線訊息', attachments: [], done })
    await flushPromises()

    expect(h.storeSend).not.toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: OP_KINDS.PARENT_MESSAGE,
        payload: expect.objectContaining({ body: '離線訊息' }),
      })
    )
    expect(done).toHaveBeenCalledWith(true)
  })

  it('帶附件的訊息 → 阻擋不入列（佇列無法帶檔案）', async () => {
    const w = mount(MessageThreadView)
    await flushPromises()

    const done = vi.fn()
    w.findComponent(MessageComposer).vm.$emit('send', {
      body: '照片',
      attachments: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })],
      done,
    })
    await flushPromises()

    expect(h.enqueueParent).not.toHaveBeenCalled()
    expect(h.storeSend).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledWith(false)
  })

  it('請假送出 → enqueue PARENT_LEAVE_REQUEST，不呼叫 createLeave', async () => {
    const w = mount(LeavesView)
    await flushPromises()
    await w.findAll('button').find((b) => b.text().includes('請假'))!.trigger('click')
    await flushPromises()
    w.findComponent(LeaveForm).vm.$emit('submit')
    await flushPromises()

    expect(h.createLeave).not.toHaveBeenCalled()
    expect(h.enqueueParent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: OP_KINDS.PARENT_LEAVE_REQUEST })
    )
  })
})

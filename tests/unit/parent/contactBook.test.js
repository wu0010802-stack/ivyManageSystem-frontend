/**
 * 家長端聯絡簿 API 與 view smoke 測試（v3.1 Phase 1）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/parent/api/index', () => ({ default: apiMock }))

import {
  ackContactBook,
  deleteContactBookReply,
  getContactBookDetail,
  getTodayContactBook,
  listContactBook,
  replyContactBook,
} from '@/parent/api/contactBook'

describe('parent contact-book API', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.delete.mockReset()
  })

  it('getTodayContactBook 帶 student_id', async () => {
    apiMock.get.mockResolvedValue({ data: {} })
    await getTodayContactBook(42)
    expect(apiMock.get).toHaveBeenCalledWith('/parent/contact-book/today', {
      params: { student_id: 42 },
    })
  })

  it('listContactBook 帶 from/to/limit', async () => {
    apiMock.get.mockResolvedValue({ data: {} })
    await listContactBook(7, { from: '2026-04-01', to: '2026-05-01', limit: 10 })
    expect(apiMock.get).toHaveBeenCalledWith('/parent/contact-book', {
      params: { student_id: 7, from: '2026-04-01', to: '2026-05-01', limit: 10 },
    })
  })

  it('getContactBookDetail / ackContactBook / replyContactBook', async () => {
    apiMock.get.mockResolvedValue({ data: {} })
    apiMock.post.mockResolvedValue({ data: {} })
    await getContactBookDetail(99)
    expect(apiMock.get).toHaveBeenCalledWith('/parent/contact-book/99')

    await ackContactBook(99)
    expect(apiMock.post).toHaveBeenCalledWith('/parent/contact-book/99/ack')

    await replyContactBook(99, '謝謝老師')
    expect(apiMock.post).toHaveBeenCalledWith('/parent/contact-book/99/reply', {
      body: '謝謝老師',
    })
  })

  it('deleteContactBookReply', async () => {
    apiMock.delete.mockResolvedValue({ data: {} })
    await deleteContactBookReply(99, 5)
    expect(apiMock.delete).toHaveBeenCalledWith(
      '/parent/contact-book/99/replies/5',
    )
  })
})


// ─── View：自動標記已讀 ───────────────────────────────────────────────────

vi.mock('@/parent/utils/toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}))

import { useRoute } from 'vue-router'
import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'

describe('ContactBookDetailView 自動標記已讀', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.delete.mockReset()
    useRoute.mockReturnValue({ params: { entryId: '11' } })
  })

  it('掛載後若尚未已讀，會呼叫 ack endpoint', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        id: 11,
        log_date: '2026-05-02',
        mood: 'normal',
        teacher_note: 'note',
        photos: [],
        replies: [],
        my_acknowledged_at: null,
      },
    })
    apiMock.post.mockResolvedValue({
      data: { read_at: '2026-05-02T10:00:00', already_marked: false },
    })
    mount(ContactBookDetailView)
    await flushPromises()
    expect(apiMock.post).toHaveBeenCalledWith('/parent/contact-book/11/ack')
  })

  it('已讀過的 entry 不會重複呼叫 ack', async () => {
    useRoute.mockReturnValue({ params: { entryId: '12' } })
    apiMock.get.mockResolvedValue({
      data: {
        id: 12,
        log_date: '2026-05-02',
        teacher_note: 'note',
        photos: [],
        replies: [],
        my_acknowledged_at: '2026-05-02T08:00:00',
      },
    })
    apiMock.post.mockResolvedValue({ data: {} })
    mount(ContactBookDetailView)
    await flushPromises()
    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('回覆超過 500 字觸發 warn 不送 API', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        id: 11,
        log_date: '2026-05-02',
        teacher_note: '',
        photos: [],
        replies: [],
        my_acknowledged_at: '2026-05-02T08:00:00',
      },
    })
    const wrapper = mount(ContactBookDetailView)
    await flushPromises()
    apiMock.post.mockClear()
    const tooLong = 'x'.repeat(501)
    wrapper.vm.newReply = tooLong
    await wrapper.vm.submitReply()
    expect(apiMock.post).not.toHaveBeenCalled()
  })
})

/**
 * ContactBookDetailView 載入失敗分流：斷線／5xx 給可重試錯誤態，只有 404 才說「找不到」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const mockRoute = reactive({ params: { entryId: '1' } })
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn() }),
}))

const getDetailMock = vi.fn()
vi.mock('@/parent/api/contactBook', () => ({
  getContactBookDetail: (...a: unknown[]) => getDetailMock(...a),
  ackContactBook: vi.fn(),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn().mockResolvedValue(undefined),
  flushParentQueue: vi.fn().mockResolvedValue(undefined),
}))

import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'

beforeEach(() => {
  mockRoute.params.entryId = '1'
  getDetailMock.mockReset()
})

describe('ContactBookDetailView 載入失敗三態', () => {
  it('連線失敗 → 可重試錯誤態，不說「找不到」；重試成功顯示內容', async () => {
    getDetailMock.mockRejectedValueOnce({ displayMessage: '網路連線異常' })
    const w = mount(ContactBookDetailView)
    await flushPromises()
    expect(w.text()).not.toContain('找不到')
    expect(w.find('[role="alert"]').text()).toContain('網路連線異常')

    getDetailMock.mockResolvedValueOnce({
      data: { id: 1, student_id: 1, log_date: '2026-08-11', teacher_note: '今天很棒', isRead: true, readAt: null, photos: [] },
    })
    await w.find('.mobile-error-retry__btn').trigger('click')
    await flushPromises()
    expect(w.find('.note-body').text()).toBe('今天很棒')
  })

  it('後端 404 → 「找不到這篇聯絡簿」，不顯示重試', async () => {
    getDetailMock.mockRejectedValueOnce({ response: { status: 404 } })
    const w = mount(ContactBookDetailView)
    await flushPromises()
    expect(w.text()).toContain('找不到這篇聯絡簿')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

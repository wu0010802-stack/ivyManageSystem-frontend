/**
 * ContactBookDetailView — F6 reqId guard 回歸測試。
 *
 * App.vue 的 `:key="route.fullPath"` 讓 entryId 改變時整棵元件樹強制
 * destroy+recreate，理論上本檔的 watch(entryId) 不可達；但為了「若日後那道
 * app 級防線被移除」不讓 fetchData() 變成活的 race，補了 reqId guard。
 * 這裡繞過 App.vue 的 key 機制，直接在單一元件實例內把 entryId 從 1 改成
 * 2（模擬 guard 真正要防的情境），驗證較舊 entry 姍姍來遲的回應不會蓋掉
 * 新 entry 的畫面。
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
  ackContactBook: vi.fn().mockResolvedValue({ data: { readAt: '2026-08-11T00:00:00Z' } }),
  replyContactBook: vi.fn(),
  deleteContactBookReply: vi.fn(),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn().mockResolvedValue(undefined),
  flushParentQueue: vi.fn().mockResolvedValue(undefined),
}))

import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'

function entryPayload(id: number, teacherNote: string) {
  return {
    data: {
      id,
      student_id: 1,
      log_date: '2026-08-11',
      mood: 'happy',
      teacher_note: teacherNote,
      isRead: true,
      readAt: '2026-08-10T00:00:00Z',
      photos: [],
      replies: [],
    },
  }
}

beforeEach(() => {
  mockRoute.params.entryId = '1'
  getDetailMock.mockReset()
})

describe('ContactBookDetailView F6 — fetchData reqId guard', () => {
  it('entry 1（尚未回應）→ 改成 entry 2（已顯示）之後，entry 1 姍姍來遲的舊回應不可蓋回畫面', async () => {
    let resolveEntry1!: (v: unknown) => void
    const pendingEntry1 = new Promise((r) => { resolveEntry1 = r })
    getDetailMock.mockImplementation((id: number) => {
      if (id === 1) return pendingEntry1
      return Promise.resolve(entryPayload(2, '第二篇留言'))
    })

    const w = mount(ContactBookDetailView)
    await flushPromises()

    // entry 1 尚未回應，畫面仍是骨架
    expect(w.find('.note-body').exists()).toBe(false)

    // 直接改變 entryId（繞過 App.vue key 機制，模擬 guard 要防的情境）
    mockRoute.params.entryId = '2'
    await flushPromises()

    expect(w.find('.note-body').text()).toBe('第二篇留言')

    // entry 1 這時才姍姍來遲
    resolveEntry1(entryPayload(1, '第一篇留言（舊）'))
    await flushPromises()

    // 不可被舊回應蓋回 entry 1 的內容
    expect(w.find('.note-body').text()).toBe('第二篇留言')
  })
})

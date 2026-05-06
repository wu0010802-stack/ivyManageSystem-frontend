import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  getContactBookDetail: vi.fn(),
  ackContactBook: vi.fn(),
  replyContactBook: vi.fn(),
  deleteContactBookReply: vi.fn(),
}))
vi.mock('@/parent/api/contactBook', () => mockApi)

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { entryId: '1' } }),
}))

import ContactBookDetailView from '@/parent/views/ContactBookDetailView.vue'
import ConfirmDialog from '@/parent/components/ConfirmDialog.vue'

describe('ContactBookDetailView 刪除回覆', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi.getContactBookDetail.mockResolvedValue({
      data: {
        id: 1,
        log_date: '2026-05-06',
        my_acknowledged_at: '2026-05-06T08:00:00',
        replies: [
          { id: 10, body: '謝謝老師', created_at: '2026-05-06T09:00:00' },
        ],
      },
    })
    mockApi.deleteContactBookReply.mockResolvedValue({ data: { ok: true } })
    mockApi.ackContactBook.mockResolvedValue({ data: {} })
  })

  it('點刪除按鈕後跳出 ConfirmDialog 而非直接 API call', async () => {
    const wrapper = mount(ContactBookDetailView, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteBtn = wrapper.find('.link-btn')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')

    expect(mockApi.deleteContactBookReply).not.toHaveBeenCalled()
    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('open')).toBe(true)

    wrapper.unmount()
  })

  it('confirm 後才呼叫 API', async () => {
    const wrapper = mount(ContactBookDetailView, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.find('.link-btn').trigger('click')

    const dialog = wrapper.findComponent(ConfirmDialog)
    await dialog.vm.$emit('confirm')
    await flushPromises()

    expect(mockApi.deleteContactBookReply).toHaveBeenCalledWith(1, 10)

    wrapper.unmount()
  })
})

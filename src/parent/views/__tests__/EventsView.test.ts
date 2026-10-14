/**
 * EventsView：三態（載入中不寫「目前沒有事件」、失敗可重試）與快速簽閱。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }, { student_id: 2, name: '小華' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
const listEvents = vi.fn()
const acknowledgeEvent = vi.fn()
vi.mock('@/parent/api/events', () => ({
  listEvents: (...a: unknown[]) => listEvents(...a),
  acknowledgeEvent: (...a: unknown[]) => acknowledgeEvent(...a),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import EventsView from '@/parent/views/EventsView.vue'

const ackEvent = {
  id: 3,
  title: '親師座談',
  event_type: 'meeting',
  event_date: '2026-10-20',
  requires_acknowledgment: true,
  need_ack_student_ids: [1],
  acked_student_ids: [],
}

function mountView() {
  return mount(EventsView, {
    global: { stubs: { AppModal: { template: '<div class="modal-stub"><slot /></div>' } } },
  })
}

beforeEach(() => {
  listEvents.mockReset()
  acknowledgeEvent.mockReset()
})

describe('EventsView 三態', () => {
  it('載入中不寫「目前沒有事件」', async () => {
    let resolve!: (v: unknown) => void
    listEvents.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('目前沒有事件')
    expect(w.text()).not.toContain('尚無事件')
    resolve({ data: { items: [] } })
    await flushPromises()
    expect(w.text()).toContain('目前沒有事件')
  })

  it('載入失敗 → 可重試錯誤態，不畫成「尚無事件」；重試成功顯示清單', async () => {
    listEvents.mockRejectedValueOnce({ displayMessage: '網路連線異常' })
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('尚無事件')
    expect(w.text()).not.toContain('目前沒有事件')
    expect(w.find('[role="alert"]').text()).toContain('網路連線異常')

    listEvents.mockResolvedValueOnce({ data: { items: [ackEvent] } })
    await w.find('.mobile-error-retry__btn').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('親師座談')
  })
})

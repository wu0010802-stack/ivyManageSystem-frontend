/**
 * EventAckView：只列待簽的孩子、事件類型顯示中文、手寫簽名上傳失敗時留在原頁重傳
 * （先前叫家長「到事件詳情頁補上」，但該頁不存在）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'

const h = vi.hoisted(() => ({
  listEvents: vi.fn(),
  acknowledgeEvent: vi.fn(),
  uploadAckSignature: vi.fn(),
  replace: vi.fn(),
  toastWarn: vi.fn(),
  toastSuccess: vi.fn(),
  query: {} as Record<string, string>,
  /** 替身簽名板狀態：empty=家長按了「清除」；blobNull=畫布匯出失敗 */
  pad: { empty: false, blobNull: false },
}))

vi.mock('@/parent/api/events', () => ({ listEvents: h.listEvents, acknowledgeEvent: h.acknowledgeEvent }))
vi.mock('@/parent/api/medications', () => ({ uploadAckSignature: h.uploadAckSignature }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [
      { student_id: 1, name: '小明' },
      { student_id: 2, name: '小華' },
      { student_id: 3, name: '小安' },
    ],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), warn: h.toastWarn, success: h.toastSuccess, info: vi.fn() },
}))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn().mockResolvedValue({}),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { eventId: '7' }, query: h.query }),
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))

import EventAckView from '@/parent/views/EventAckView.vue'
import { onBeforeRouteLeave } from 'vue-router'

/** 已簽名的替身畫布（jsdom/happy-dom 沒有 canvas 2d context）。 */
const InkedPad = defineComponent({
  setup(_, { expose }) {
    expose({
      isEmpty: () => h.pad.empty,
      toBlob: () => Promise.resolve(
        h.pad.blobNull ? null : new Blob([new Uint8Array([1])], { type: 'image/png' }),
      ),
    })
    return {}
  },
  template: '<div class="fake-pad" />',
})

function event(extra: Record<string, unknown> = {}) {
  return {
    id: 7, title: '親師座談', event_type: 'meeting', event_date: '2026-10-20',
    requires_acknowledgment: true, need_ack_student_ids: [2, 3], ...extra,
  }
}

function mountView() {
  return mount(EventAckView, { global: { stubs: { SignaturePad: InkedPad } } })
}

beforeEach(() => {
  Object.values(h).forEach((v) => { if (typeof v === 'function' && 'mockReset' in v) v.mockReset() })
  for (const k of Object.keys(h.query)) delete h.query[k]
  h.pad.empty = false
  h.pad.blobNull = false
})

describe('EventAckView', () => {
  it('子女下拉只列還沒簽的孩子，事件類型顯示中文', async () => {
    h.listEvents.mockResolvedValue({ data: { items: [event()] } })
    const w = mountView()
    await flushPromises()
    const options = w.findAll('#ack-student option').map((o) => o.text())
    expect(options).toEqual(['小華', '小安'])
    expect(w.text()).toContain('會議')
    expect(w.text()).not.toContain('meeting')
  })

  it('只剩一位待簽時直接寫出名字；網址指定的孩子已簽過則不採用', async () => {
    h.query.student_id = '1'
    h.listEvents.mockResolvedValue({ data: { items: [event({ need_ack_student_ids: [3] })] } })
    h.acknowledgeEvent.mockResolvedValue({})
    h.uploadAckSignature.mockResolvedValue({})
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="ack-single-child"]').text()).toContain('小安')
    await w.find('.submit-btn').trigger('click')
    await flushPromises()
    expect(h.acknowledgeEvent).toHaveBeenCalledWith(7, expect.objectContaining({ student_id: 3 }))
  })

  it('全部孩子都簽過 → 顯示已全部簽收，不給送出', async () => {
    h.listEvents.mockResolvedValue({ data: { items: [event({ need_ack_student_ids: [] })] } })
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="ack-all-signed"]').exists()).toBe(true)
    expect(w.find('.submit-btn').exists()).toBe(false)
  })

  it('簽名上傳失敗 → 留在原頁、可重新上傳；不再指引不存在的「事件詳情頁」', async () => {
    h.listEvents.mockResolvedValue({ data: { items: [event()] } })
    h.acknowledgeEvent.mockResolvedValue({})
    h.uploadAckSignature.mockRejectedValueOnce({ displayMessage: '網路連線異常' })
    const w = mountView()
    await flushPromises()

    await w.find('.submit-btn').trigger('click')
    await flushPromises()
    expect(h.replace).not.toHaveBeenCalled()
    const warn = String(h.toastWarn.mock.calls[0]?.[0] ?? '')
    expect(warn).not.toContain('詳情頁')
    expect(warn).toContain('重新上傳簽名')
    const retry = w.find('[data-testid="retry-signature"]')
    expect(retry.exists()).toBe(true)

    h.uploadAckSignature.mockResolvedValueOnce({})
    await retry.trigger('click')
    await flushPromises()
    // 只重傳簽名，不重複簽收
    expect(h.acknowledgeEvent).toHaveBeenCalledTimes(1)
    expect(h.uploadAckSignature).toHaveBeenCalledTimes(2)
    expect(h.replace).toHaveBeenCalledWith({ path: '/events' })
  })
})

describe('EventAckView 重新上傳簽名：空白或匯出失敗不算成功', () => {
  async function failFirstUpload() {
    h.listEvents.mockResolvedValue({ data: { items: [event()] } })
    h.acknowledgeEvent.mockResolvedValue({})
    h.uploadAckSignature.mockRejectedValueOnce({ displayMessage: '網路連線異常' })
    const w = mountView()
    await flushPromises()
    await w.find('.submit-btn').trigger('click')
    await flushPromises()
    h.toastWarn.mockClear()
    return w
  }

  it('重傳前把簽名清掉 → 提示先簽名、不呼叫上傳、不離開頁面', async () => {
    const w = await failFirstUpload()
    h.pad.empty = true
    await w.find('[data-testid="retry-signature"]').trigger('click')
    await flushPromises()
    expect(h.uploadAckSignature).toHaveBeenCalledTimes(1)
    expect(h.toastSuccess).not.toHaveBeenCalledWith('手寫簽名已上傳')
    expect(h.replace).not.toHaveBeenCalled()
    expect(String(h.toastWarn.mock.calls[0]?.[0] ?? '')).toContain('簽名')
    expect(w.find('[data-testid="retry-signature"]').exists()).toBe(true)
  })

  it('畫布匯出失敗（toBlob 回 null）→ 視為上傳失敗、留在原頁', async () => {
    const w = await failFirstUpload()
    h.pad.blobNull = true
    await w.find('[data-testid="retry-signature"]').trigger('click')
    await flushPromises()
    expect(h.uploadAckSignature).toHaveBeenCalledTimes(1)
    expect(h.toastSuccess).not.toHaveBeenCalledWith('手寫簽名已上傳')
    expect(h.replace).not.toHaveBeenCalled()
    expect(w.find('[data-testid="retry-signature"]').exists()).toBe(true)
  })
})

describe('EventAckView 離開保護', () => {
  type Guard = () => boolean | Promise<boolean>
  const lastGuard = () => vi.mocked(onBeforeRouteLeave).mock.calls.at(-1)![0] as unknown as Guard

  it('已手寫簽名但還沒送出 → 離開前要確認；送出成功後導頁不再確認', async () => {
    h.listEvents.mockResolvedValue({ data: { items: [event()] } })
    h.acknowledgeEvent.mockResolvedValue({})
    h.uploadAckSignature.mockResolvedValue({})
    const w = mountView()
    await flushPromises()

    const pending = lastGuard()()
    expect(pending).toBeInstanceOf(Promise)

    await w.find('.submit-btn').trigger('click')
    await flushPromises()
    expect(h.replace).toHaveBeenCalledWith({ path: '/events' })
    expect(lastGuard()()).toBe(true)
  })
})

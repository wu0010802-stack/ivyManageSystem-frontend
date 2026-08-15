/**
 * PickupNoticeView（預告接送）— 建立表單 / 防連點 / 冪等 key / 追蹤卡 / arrive / cancel。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PickupNoticeView from '@/parent/views/PickupNoticeView.vue'

vi.mock('@/parent/stores/children', () => {
  const useChildrenStore = vi.fn()
  return { useChildrenStore }
})

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: vi.fn(),
}))

const createMock = vi.fn()
const listMock = vi.fn()
const arriveMock = vi.fn()
const cancelMock = vi.fn()
vi.mock('@/parent/api/dismissalCalls', () => ({
  createDismissalNotice: (...a: unknown[]) => createMock(...a),
  listDismissalNotices: (...a: unknown[]) => listMock(...a),
  arriveDismissalNotice: (...a: unknown[]) => arriveMock(...a),
  cancelDismissalNotice: (...a: unknown[]) => cancelMock(...a),
}))

import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'
import { ref } from 'vue'

const CHILD = { student_id: 11, name: '王小明', classroom_name: '幼幼班' }

const ACTIVE_NOTICE = {
  id: 900,
  student_id: 11,
  student_name: '王小明',
  classroom_id: 1,
  classroom_name: '幼幼班',
  status: 'pending',
  request_source: 'parent',
  requested_at: '2026-08-14T15:00:00',
  expected_arrival_at: '2026-08-14T15:15:00',
  arrived_at: null,
  cancelled_at: null,
  acknowledged_at: null,
  completed_at: null,
  requested_by_name: '王媽媽',
  note: null,
}

function setupStores() {
  ;(useChildrenStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    items: [CHILD],
    loading: false,
    load: vi.fn().mockResolvedValue(undefined),
  })
  ;(useChildSelection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    selectedId: ref(11),
    setSelected: vi.fn(),
    ensureSelected: vi.fn(),
  })
}

const STUBS = {
  'router-link': { template: '<a class="rl-stub"><slot /></a>' },
}

let wrapper: VueWrapper | null = null
async function mountView() {
  wrapper = mount(PickupNoticeView, { global: { stubs: STUBS } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  setupStores()
  createMock.mockReset()
  listMock.mockReset()
  arriveMock.mockReset()
  cancelMock.mockReset()
  listMock.mockResolvedValue({ data: { items: [], total: 0 } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('建立表單', () => {
  it('渲染 7 個 ETA chips（5/10/15/20/30/45/60）與辨異提示文案', async () => {
    const w = await mountView()
    for (const m of [5, 10, 15, 20, 30, 45, 60]) {
      expect(w.find(`[data-testid="pn-eta-chip-${m}"]`).exists()).toBe(true)
    }
    expect(w.text()).toContain('這只會通知園所您即將抵達')
    expect(w.text()).toContain('臨時接送授權')
    // 顯示目前選中的學生與班級
    expect(w.text()).toContain('王小明')
    expect(w.text()).toContain('幼幼班')
  })

  it('選 ETA chip 後送出 payload 帶 eta_minutes 與 client_request_id', async () => {
    createMock.mockResolvedValue({ data: { ...ACTIVE_NOTICE } })
    const w = await mountView()
    await w.find('[data-testid="pn-eta-chip-30"]').trigger('click')
    await w.find('[data-testid="pn-note-input"]').setValue('  開白色轎車  ')
    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalledTimes(1)
    const payload = createMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload.student_id).toBe(11)
    expect(payload.eta_minutes).toBe(30)
    expect(payload.note).toBe('開白色轎車')
    expect(typeof payload.client_request_id).toBe('string')
    expect((payload.client_request_id as string).length).toBeGreaterThan(8)
  })

  it('防連點：送出中重複點擊只會呼叫一次', async () => {
    let resolveCreate: (v: unknown) => void = () => {}
    createMock.mockImplementation(() => new Promise((r) => { resolveCreate = r }))
    const w = await mountView()
    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    resolveCreate({ data: { ...ACTIVE_NOTICE } })
    await flushPromises()
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('失敗重試沿用同一 client_request_id（冪等），錯誤誠實呈現', async () => {
    createMock.mockRejectedValueOnce({ displayMessage: '連線失敗' })
    createMock.mockResolvedValueOnce({ data: { ...ACTIVE_NOTICE } })
    const w = await mountView()

    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('連線失敗')

    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalledTimes(2)
    const id1 = (createMock.mock.calls[0][0] as { client_request_id: string }).client_request_id
    const id2 = (createMock.mock.calls[1][0] as { client_request_id: string }).client_request_id
    expect(id1).toBe(id2)
  })

  it('409（已有進行中）→ 補抓現況改顯示追蹤卡', async () => {
    createMock.mockRejectedValueOnce({
      displayMessage: '今天已有進行中的接送通知',
      response: { status: 409 },
    })
    const w = await mountView()
    listMock.mockResolvedValue({ data: { items: [ACTIVE_NOTICE], total: 1 } })
    await w.find('[data-testid="pn-submit-btn"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="pn-tracking-card"]').exists()).toBe(true)
    expect(w.text()).toContain('今天已有進行中的接送通知')
  })
})

describe('追蹤卡', () => {
  it('active 預告：顯示四階段（已送達園方 done）、ETA 行、操作按鈕', async () => {
    listMock.mockResolvedValue({ data: { items: [ACTIVE_NOTICE], total: 1 } })
    const w = await mountView()
    expect(w.find('[data-testid="pn-tracking-card"]').exists()).toBe(true)
    expect(w.find('[data-testid="pn-create-form"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-step-sent"]').classes()).toContain('is-done')
    expect(w.find('[data-testid="pn-step-arrived"]').classes()).not.toContain('is-done')
    expect(w.find('[data-testid="pn-eta-line"]').text()).toContain('預計 15:15')
    expect(w.find('[data-testid="pn-arrive-btn"]').exists()).toBe(true)
    expect(w.find('[data-testid="pn-cancel-btn"]').exists()).toBe(true)
  })

  it('我已到門口：呼叫 arrive 並更新步驟', async () => {
    listMock.mockResolvedValue({ data: { items: [ACTIVE_NOTICE], total: 1 } })
    arriveMock.mockResolvedValue({
      data: { ...ACTIVE_NOTICE, arrived_at: '2026-08-14T15:14:00' },
    })
    const w = await mountView()
    await w.find('[data-testid="pn-arrive-btn"]').trigger('click')
    await flushPromises()
    expect(arriveMock).toHaveBeenCalledWith(900)
    expect(w.find('[data-testid="pn-step-arrived"]').classes()).toContain('is-done')
    // 已抵達後不再顯示「我已到門口」
    expect(w.find('[data-testid="pn-arrive-btn"]').exists()).toBe(false)
  })

  it('取消預告：兩段式確認後呼叫 cancel、回到建立表單', async () => {
    listMock.mockResolvedValueOnce({ data: { items: [ACTIVE_NOTICE], total: 1 } })
    cancelMock.mockResolvedValue({ data: { ...ACTIVE_NOTICE, status: 'cancelled' } })
    const w = await mountView()

    await w.find('[data-testid="pn-cancel-btn"]').trigger('click')
    expect(cancelMock).not.toHaveBeenCalled() // 第一段只展開確認
    listMock.mockResolvedValue({
      data: { items: [{ ...ACTIVE_NOTICE, status: 'cancelled', cancelled_at: '2026-08-14T15:05:00' }], total: 1 },
    })
    await w.find('[data-testid="pn-cancel-confirm-btn"]').trigger('click')
    await flushPromises()
    expect(cancelMock).toHaveBeenCalledWith(900)
    expect(w.find('[data-testid="pn-create-form"]').exists()).toBe(true)
  })

  it('已完成：顯示完成文案且無操作按鈕，仍可再建立', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [{
          ...ACTIVE_NOTICE,
          status: 'completed',
          arrived_at: '2026-08-14T15:14:00',
          acknowledged_at: '2026-08-14T15:10:00',
          completed_at: '2026-08-14T15:20:00',
        }],
        total: 1,
      },
    })
    const w = await mountView()
    expect(w.text()).toContain('今天的接送已完成')
    expect(w.find('[data-testid="pn-arrive-btn"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-cancel-btn"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-create-form"]').exists()).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'

import PortalDismissalCallsView from '@/views/portal/PortalDismissalCallsView.vue'

// ─── Mock API ────────────────────────────────────────────
const getPortalDismissalCalls = vi.fn(() => Promise.resolve({ data: [] }))
const acknowledgeDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const completeDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: (...args) => getPortalDismissalCalls(...args),
  acknowledgeDismissalCall: (...args) => acknowledgeDismissalCall(...args),
  completeDismissalCall: (...args) => completeDismissalCall(...args),
}))

// ─── Mock WebSocket（不連線）─────────────────────────────
const mockWs = {
  readyState: 1, // OPEN
  close: vi.fn(),
  send: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
}
vi.stubGlobal('WebSocket', vi.fn(function () { return mockWs }))
// jsdom 沒有 Notification，給個 no-op stub
vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })

// ─── Helpers ─────────────────────────────────────────────
const SAMPLE_CALL = {
  id: 1,
  student_id: 10,
  student_name: '小明',
  classroom_id: 5,
  classroom_name: '向日葵班',
  status: 'pending',
  requested_at: new Date().toISOString(),
  note: null,
}

function mountView() {
  return shallowMount(PortalDismissalCallsView, {
    global: {
      stubs: {
        'el-card': { template: '<div><slot /></div>' },
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-empty': { template: '<div />' },
      },
    },
  })
}

// ─── Tests ───────────────────────────────────────────────
describe('PortalDismissalCallsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs.send.mockClear()
    mockWs.close.mockClear()
    getPortalDismissalCalls.mockResolvedValue({ data: [] })
  })

  it('掛載後應呼叫 getPortalDismissalCalls', async () => {
    mountView()
    await nextTick()
    expect(getPortalDismissalCalls).toHaveBeenCalled()
  })

  it('收到後端 ping 訊息時應回送 pong，避免被 90 秒 idle 心跳踢掉', async () => {
    mountView()
    await nextTick()
    mockWs.onmessage({ data: JSON.stringify({ type: 'ping' }) })
    expect(mockWs.send).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mockWs.send.mock.calls[0][0])
    expect(payload).toEqual({ type: 'pong' })
  })

  it('handleWsEvent: dismissal_call_created 應 prepend 待處理列表', async () => {
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.activeCalls = []
    wrapper.vm.handleWsEvent({ type: 'dismissal_call_created', payload: SAMPLE_CALL })
    expect(wrapper.vm.activeCalls).toHaveLength(1)
    expect(wrapper.vm.activeCalls[0].id).toBe(SAMPLE_CALL.id)
  })

  it('handleWsEvent: dismissal_call_updated 為 completed 時應從列表移除', async () => {
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.activeCalls = [{ ...SAMPLE_CALL }]
    wrapper.vm.handleWsEvent({
      type: 'dismissal_call_updated',
      payload: { ...SAMPLE_CALL, status: 'completed' },
    })
    expect(wrapper.vm.activeCalls).toHaveLength(0)
  })

  it('handleWsEvent: dismissal_call_cancelled 應移除該筆', async () => {
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.activeCalls = [{ ...SAMPLE_CALL }]
    wrapper.vm.handleWsEvent({ type: 'dismissal_call_cancelled', payload: SAMPLE_CALL })
    expect(wrapper.vm.activeCalls).toHaveLength(0)
  })

  // ─── liveness watchdog（半開連線偵測）──────────────────────
  it('逾 45s 未收到任何訊息應判定半開死連線並主動關閉重連', async () => {
    vi.useFakeTimers()
    try {
      mountView()
      await flushPromises()          // 等 onMounted 的 fetch + connectWs 跑完
      mockWs.onopen()                // 模擬連線建立 → 啟動 liveness watchdog
      mockWs.close.mockClear()
      vi.advanceTimersByTime(45000)  // 45s 完全沒有任何訊息（含 ping）
      expect(mockWs.close).toHaveBeenCalled() // watchdog 主動踢掉半開死連線
    } finally {
      vi.useRealTimers()
    }
  })

  it('持續收到後端 ping 應續命，不誤判半開斷線', async () => {
    vi.useFakeTimers()
    try {
      mountView()
      await flushPromises()
      mockWs.onopen()
      mockWs.close.mockClear()
      vi.advanceTimersByTime(30000)
      mockWs.onmessage({ data: JSON.stringify({ type: 'ping' }) }) // 收到 ping → 續命
      vi.advanceTimersByTime(30000)
      expect(mockWs.close).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

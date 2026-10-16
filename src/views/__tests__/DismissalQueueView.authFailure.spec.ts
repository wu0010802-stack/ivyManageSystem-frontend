import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 登入逾期後的輪詢死循環守衛（與教師端 usePortalDismissalAlerts 同型守衛，見
// src/composables/__tests__/usePortalDismissalAlerts.spec.ts 的「認證逾期即停」）。
// 本頁 fetchCalls 原本 catch 一律 ElMessage.error 並靜默排程下一輪；401/403（登入已
// 逾期、refresh 已失敗過一輪）應停止 polling 與 WS 重連，不再重播必敗請求。

// ── mock WebSocket（可控 open/close，避免 happy-dom 對 /api/ws/* 嘗試真連線）──
let lastWs: MockWS | null = null
class MockWS {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  constructor(public url: string) { lastWs = this }
  send(): void { /* noop */ }
  close(): void { this.readyState = 3 }
}

const getCallsMock = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: (...args: unknown[]) => getCallsMock(...args),
  cancelDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  createDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  arriveDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

import DismissalQueueView from '../DismissalQueueView.vue'

describe('DismissalQueueView：認證逾期即停輪詢', () => {
  beforeEach(() => {
    lastWs = null
    getCallsMock.mockClear()
    getCallsMock.mockImplementation(() => Promise.resolve({ data: [] }))
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('WS 耗盡轉為輪詢後，fetchCalls 收到 401 → 停止輪詢，計時器不再打 API', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(DismissalQueueView, { global: { plugins: [ElementPlus] } })
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()

      // 驅動 WS 連續 6 次連線失敗（scheduleReconnect 對 WS_MAX_RETRIES=5 的語意：
      // 前 5 次個別排程重試，第 6 次判定 exhausted）轉為 15s HTTP 輪詢 fallback。
      for (let i = 0; i < 6; i++) {
        lastWs!.onclose?.({ code: 1006, reason: '' })
        await vi.advanceTimersByTimeAsync(30000) // 覆蓋任何 exponential backoff（cap 30s）
      }

      // exhausted 期間輪詢已在跑：先確認呼叫次數確實隨時間增加，
      // 否則下面「不再增加」的斷言會是修法前也通過的假綠。
      const callCountWhilePolling = getCallsMock.mock.calls.length
      expect(callCountWhilePolling).toBeGreaterThan(1)

      // 換成 401（登入已逾期）：下一個輪詢週期應觸發停止。
      getCallsMock.mockImplementation(() =>
        Promise.reject(Object.assign(new Error('unauthorized'), { response: { status: 401 } })),
      )
      await vi.advanceTimersByTimeAsync(15000)
      const callCountAfterFirst401 = getCallsMock.mock.calls.length
      expect(callCountAfterFirst401).toBeGreaterThan(callCountWhilePolling)

      // 再推進三個輪詢週期：呼叫次數不應再增加，也沒有新的 WS 重連嘗試。
      const wsAfterStop = lastWs
      await vi.advanceTimersByTimeAsync(15000 * 3)
      expect(getCallsMock.mock.calls.length).toBe(callCountAfterFirst401)
      expect(lastWs).toBe(wsAfterStop)

      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

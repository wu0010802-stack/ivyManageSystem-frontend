import { describe, it, expect } from 'vitest'
import {
  classifyWebSocketClose,
  closeWebSocketSafely,
  WS_LIVENESS_TIMEOUT_MS,
  WS_RECOVERY_RETRY_MS,
} from '../ws'

// QA 2026-06-04 P2-5：dismissal view onUnmounted 直接 ws.close() 會觸發 onclose →
// scheduleReconnect，在元件卸載後建立殭屍重連 / 輪詢。closeWebSocketSafely 須先卸
// onclose/onerror/onmessage 再 close，使 close() 不再觸發重連 handler。

function makeFakeSocket() {
  const calls = { closed: 0, oncloseFired: 0 }
  const sock = {
    onclose: null as null | (() => void),
    onerror: null as null | (() => void),
    onmessage: null as null | (() => void),
    onopen: null as null | (() => void),
    close() {
      calls.closed++
      // 真實 WebSocket close() 會觸發 onclose（若仍掛著）
      if (this.onclose) this.onclose()
    },
  }
  return { sock, calls }
}

describe('closeWebSocketSafely', () => {
  it('卸載 onclose/onerror/onmessage 後再 close → close 不再觸發重連 handler', () => {
    const { sock, calls } = makeFakeSocket()
    let reconnectScheduled = false
    sock.onclose = () => {
      reconnectScheduled = true
    }

    closeWebSocketSafely(sock as unknown as WebSocket)

    expect(sock.onclose).toBeNull()
    expect(sock.onerror).toBeNull()
    expect(sock.onmessage).toBeNull()
    expect(calls.closed).toBe(1)
    expect(reconnectScheduled).toBe(false) // 關鍵：close 未觸發殭屍重連
  })

  it('傳 null 安全 no-op', () => {
    expect(() => closeWebSocketSafely(null)).not.toThrow()
  })
})

describe('WebSocket 關閉原因與恢復時序', () => {
  // 400x 只有在 Upgrade 完成後由 server 關閉時才會到達瀏覽器；pre-accept
  // websocket.close 會被 Uvicorn 轉為 HTTP 403，瀏覽器端只能收到 1006。
  it.each([
    [4001, 'token missing', 'auth'],
    [4003, 'token expired', 'auth'],
    [4007, 'permission denied', 'permission'],
    [4403, 'origin forbidden', 'permission'],
    [4029, 'handshake rate limited', 'rate-limit'],
    [1008, 'too many connections', 'rate-limit'],
    [1006, '', 'transport'],
  ] as const)('可觀測 close code=%i reason=%s 分類為 %s', (code, reason, expectedKind) => {
    expect(classifyWebSocketClose({ code, reason })).toMatchObject({
      code,
      kind: expectedKind,
    })
  })

  it('1006 顯示握手／網路提示，且不回傳可能含 token 或個資的原始 reason', () => {
    const info = classifyWebSocketClose({
      code: 1006,
      reason: 'token=secret phone=0912345678',
    })

    expect(info.message).toContain('握手')
    expect(info.message).toContain('網路')
    expect(JSON.stringify(info)).not.toContain('secret')
    expect(JSON.stringify(info)).not.toContain('0912345678')
  })

  it('liveness 至少容忍兩個 30 秒 ping 週期，耗盡後以低頻恢復', () => {
    expect(WS_LIVENESS_TIMEOUT_MS).toBeGreaterThanOrEqual(90000)
    expect(WS_RECOVERY_RETRY_MS).toBeGreaterThanOrEqual(60000)
  })
})

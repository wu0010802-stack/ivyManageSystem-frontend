import { describe, it, expect } from 'vitest'
import { closeWebSocketSafely } from '../ws'

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

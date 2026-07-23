import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInboxNotifications } from '../useInboxNotifications'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  disconnect() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }
}

describe('useInboxNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects to the authenticated same-origin inbox endpoint', () => {
    const client = useInboxNotifications(vi.fn())

    client.start()

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].url).toMatch(/^ws(s)?:\/\/.*\/api\/ws\/inbox$/)
    client.stop()
  })

  it('forces a summary refresh for every notification message', () => {
    const refresh = vi.fn()
    const client = useInboxNotifications(refresh)
    client.start()

    FakeWebSocket.instances[0].onmessage?.()

    expect(refresh).toHaveBeenCalledTimes(1)
    client.stop()
  })

  it('reconnects with backoff after an unexpected disconnect', () => {
    const client = useInboxNotifications(vi.fn())
    client.start()
    const first = FakeWebSocket.instances[0]
    first.open()

    first.disconnect()
    expect(FakeWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(1_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    client.stop()
  })

  it('stop closes the active socket and prevents stale reconnects', () => {
    const client = useInboxNotifications(vi.fn())
    client.start()
    const socket = FakeWebSocket.instances[0]

    client.stop()
    socket.onclose?.()
    vi.runAllTimers()

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  reportClientEvent,
  resetForTests,
  CLIENT_EVENT_TYPES,
  type ClientEventType,
} from '@/parent/utils/clientEvents'

/** 送出的 body 只該有這八個欄位；後端 `ClientEventIn` 是 `extra="forbid"`。 */
const ALLOWED_KEYS = [
  'event_type',
  'occurred_at',
  'route_name',
  'status_code',
  'error_code',
  'message',
  'app_build',
  'request_id',
].sort()

/** 六個一律由後端自己算、前端送了會被 422 拒絕的身分／UA 衍生欄位。 */
const FORBIDDEN_KEYS = ['line_version', 'os', 'in_line_client', 'user_hash', 'ip_hash', 'received_at']

type FetchInit = { method?: string; keepalive?: boolean; body?: string; headers?: Record<string, string> }

function lastSentEvent(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, FetchInit]
  const body = JSON.parse(call[1].body ?? '{}') as { events: Array<Record<string, unknown>> }
  return body.events[0]
}

describe('reportClientEvent', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetForTests()
    fetchSpy = vi.fn().mockResolvedValue({ ok: true } as Response)
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('送出用 POST + keepalive:true，打 /parent/client-events', () => {
    reportClientEvent('chunk_load_failed', { message: 'boom' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, FetchInit]
    expect(url).toContain('/parent/client-events')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
  })

  it('同一 event_type 60 秒內只送一筆，過窗後可再送', () => {
    vi.useFakeTimers()
    reportClientEvent('api_5xx', { status_code: 500 })
    reportClientEvent('api_5xx', { status_code: 500 })
    reportClientEvent('api_5xx', { status_code: 500 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // 還在 60 秒窗內（59s）→ 仍不送
    vi.advanceTimersByTime(59_000)
    reportClientEvent('api_5xx', { status_code: 500 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // 累積跨過 60 秒 → 可以再送一次
    vi.advanceTimersByTime(2_000)
    reportClientEvent('api_5xx', { status_code: 500 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // 不同 event_type 不受同窗口影響
    reportClientEvent('api_timeout', { message: 'timeout' })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('每 session 最多送 20 筆，超過即直接丟棄', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 25; i++) {
      reportClientEvent('error_boundary', { message: `e${i}` })
      // 每次都跳過 60 秒去重窗口，讓這個測試單純只測「session 上限」這一條防線。
      vi.advanceTimersByTime(61_000)
    }
    expect(fetchSpy).toHaveBeenCalledTimes(20)
  })

  it('離線時（navigator.onLine === false）不呼叫 fetch、不拋例外', () => {
    // happy-dom 的 `onLine` 是 Navigator.prototype 的 getter，不是 navigator 自己的
    // own property——用 defineProperty 疊一個 own property 蓋過去即可模擬離線，
    // 事後用 Reflect.deleteProperty 拆掉這個 own property，讓存取重新落回
    // prototype 的原始 getter（若改用「存 descriptor 再 defineProperty 回去」，
    // `getOwnPropertyDescriptor(navigator, 'onLine')` 在改之前是 undefined，
    // 會導致「回復」動作變成 no-op，把 false 永久卡死給後面所有測試）。
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      expect(() => reportClientEvent('api_timeout', { message: 'offline' })).not.toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(navigator, 'onLine')
    }
  })

  it('fetch reject 時不拋例外、不產生 unhandled rejection', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'))
    expect(() => reportClientEvent('api_5xx', { status_code: 500 })).not.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // 讓 fetch 的 rejected promise 有機會被內部 .catch(() => {}) 消化；
    // 若模組漏掉 .catch，這裡之後會冒出 unhandledRejection 讓整個測試檔失敗。
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('payload 不含任何身分/UA 衍生欄位，且只送允許的八個欄位', () => {
    reportClientEvent('login_failed', { message: '取得 id_token 失敗' })
    const event = lastSentEvent(fetchSpy)
    const keys = Object.keys(event).sort()
    expect(keys).toEqual(ALLOWED_KEYS)
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('白名單外的 event_type 不送出', () => {
    reportClientEvent('not_a_real_event_type' as ClientEventType, { message: 'x' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('白名單七種型別皆可送出', () => {
    vi.useFakeTimers()
    for (const type of CLIENT_EVENT_TYPES) {
      reportClientEvent(type, { message: type })
      vi.advanceTimersByTime(61_000)
    }
    expect(fetchSpy).toHaveBeenCalledTimes(CLIENT_EVENT_TYPES.length)
  })

  it('超長欄位被截斷到後端上限，不依賴後端 422 擋', () => {
    reportClientEvent('error_boundary', {
      route_name: 'r'.repeat(100),
      error_code: 'e'.repeat(100),
      message: 'm'.repeat(400),
      app_build: 'b'.repeat(80),
      request_id: 'i'.repeat(80),
    })
    const event = lastSentEvent(fetchSpy)
    expect((event.route_name as string).length).toBe(64)
    expect((event.error_code as string).length).toBe(64)
    expect((event.message as string).length).toBe(300)
    expect((event.app_build as string).length).toBe(40)
    expect((event.request_id as string).length).toBe(32)
  })

  it('message 預設空字串（未提供時）', () => {
    reportClientEvent('maintenance_hit', {})
    const event = lastSentEvent(fetchSpy)
    expect(event.message).toBe('')
  })

  it('occurred_at 是合法 ISO 8601 字串', () => {
    reportClientEvent('api_timeout', {})
    const event = lastSentEvent(fetchSpy)
    expect(() => new Date(event.occurred_at as string).toISOString()).not.toThrow()
    expect(new Date(event.occurred_at as string).toISOString()).toBe(event.occurred_at)
  })
})

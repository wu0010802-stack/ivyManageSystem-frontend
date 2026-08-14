/**
 * usePortalDismissalAlerts — 家長預告接送（pnotice01）事件語意測試。
 *
 * - created（parent 預告、arrived_at=null）→ 柔和提示：不震動、liveAnnounce 帶 ETA
 * - created（staff 舊流程、arrived_at=requested_at）→ 強提醒行為不變（震動）
 * - dismissal_call_arrived → 此刻才強提醒（震動 + 「已到門口」播報）；重複事件不重播
 * - created 重複事件（重連補送）→ 不重複插卡、不重播
 * - cancelled → 移卡
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

let getCallsImpl: () => Promise<{ data: unknown[] }> = () => Promise.resolve({ data: [] })
vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: () => getCallsImpl(),
}))

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []
  url: string
  readyState: number = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(d: string): void {
    this.sent.push(d)
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSING
  }
  emit(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
}

type AlertsModule = typeof import('@/composables/usePortalDismissalAlerts')
let mod: AlertsModule | null = null

async function loadFreshModule(): Promise<AlertsModule> {
  vi.resetModules()
  mod = await import('@/composables/usePortalDismissalAlerts')
  return mod
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  mod?.teardownPortalDismissalAlerts()
  mod = null
  getCallsImpl = () => Promise.resolve({ data: [] })
  FakeWebSocket.instances = []
})

const PARENT_NOTICE = {
  id: 101,
  student_name: '王小明',
  classroom_name: '幼幼班',
  status: 'pending',
  request_source: 'parent',
  requested_at: '2026-08-14T15:00:00',
  expected_arrival_at: '2026-08-14T15:15:00',
  arrived_at: null,
}

const STAFF_CALL = {
  id: 202,
  student_name: '李小華',
  classroom_name: '大班',
  status: 'pending',
  request_source: 'staff',
  requested_at: '2026-08-14T15:00:00',
  expected_arrival_at: '2026-08-14T15:00:00',
  arrived_at: '2026-08-14T15:00:00',
}

async function setup() {
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  const vibrate = vi.fn()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
  const m = await loadFreshModule()
  m.initPortalDismissalAlerts()
  await flush()
  const socket = FakeWebSocket.instances[0]
  return { m, socket, vibrate, api: m.usePortalDismissalAlerts() }
}

describe('created：預告 vs staff 的提醒強度分流', () => {
  it('parent 預告（未抵達）：插卡、柔和提示（不震動）、liveAnnounce 帶預計時間', async () => {
    const { socket, vibrate, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: PARENT_NOTICE })
    expect(api.activeCalls.value.some((c) => c.id === 101)).toBe(true)
    expect(vibrate).not.toHaveBeenCalled()
    expect(api.liveAnnounce.value).toContain('預告接送')
    expect(api.liveAnnounce.value).toContain('王小明家長')
    expect(api.liveAnnounce.value).not.toContain('等待接送')
  })

  it('staff 建立（舊流程）：強提醒行為不變（震動 + 等待接送播報）', async () => {
    const { socket, vibrate, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: STAFF_CALL })
    expect(api.activeCalls.value.some((c) => c.id === 202)).toBe(true)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(api.liveAnnounce.value).toContain('等待接送')
  })

  it('created 重複事件（重連補送/echo）：不重複插卡、不重播提醒', async () => {
    const { socket, vibrate, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: STAFF_CALL })
    socket.emit({ type: 'dismissal_call_created', payload: STAFF_CALL })
    expect(api.activeCalls.value.filter((c) => c.id === 202)).toHaveLength(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('dismissal_call_arrived：到門口才強提醒', () => {
  it('預告卡收到 arrived → 更新卡片 + 強提醒（震動、「已到門口」播報）', async () => {
    const { socket, vibrate, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: PARENT_NOTICE })
    expect(vibrate).not.toHaveBeenCalled()

    const arrived = { ...PARENT_NOTICE, arrived_at: '2026-08-14T15:14:00' }
    socket.emit({ type: 'dismissal_call_arrived', payload: arrived })
    expect(api.activeCalls.value.filter((c) => c.id === 101)).toHaveLength(1)
    expect(api.activeCalls.value.find((c) => c.id === 101)?.arrived_at).toBe(
      '2026-08-14T15:14:00',
    )
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(api.liveAnnounce.value).toContain('已到門口')
  })

  it('arrived 重複事件 → idempotent：不重複插卡、不重播強提醒', async () => {
    const { socket, vibrate, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: PARENT_NOTICE })
    const arrived = { ...PARENT_NOTICE, arrived_at: '2026-08-14T15:14:00' }
    socket.emit({ type: 'dismissal_call_arrived', payload: arrived })
    socket.emit({ type: 'dismissal_call_arrived', payload: arrived })
    expect(api.activeCalls.value.filter((c) => c.id === 101)).toHaveLength(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('斷線錯過 created、先收到 arrived → 補插卡並強提醒一次', async () => {
    const { socket, vibrate, api } = await setup()
    const arrived = { ...PARENT_NOTICE, arrived_at: '2026-08-14T15:14:00' }
    socket.emit({ type: 'dismissal_call_arrived', payload: arrived })
    expect(api.activeCalls.value.filter((c) => c.id === 101)).toHaveLength(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('updated / cancelled 既有語意不受影響', () => {
  it('updated → 換卡內容；cancelled → 移卡', async () => {
    const { socket, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: PARENT_NOTICE })
    socket.emit({
      type: 'dismissal_call_updated',
      payload: { ...PARENT_NOTICE, status: 'acknowledged' },
    })
    expect(api.activeCalls.value.find((c) => c.id === 101)?.status).toBe('acknowledged')

    socket.emit({ type: 'dismissal_call_cancelled', payload: { ...PARENT_NOTICE, status: 'cancelled' } })
    expect(api.activeCalls.value.some((c) => c.id === 101)).toBe(false)
  })
})

describe('排序：與管理端共用 sortActiveQueue', () => {
  it('已抵達優先於預告；預告依 expected_arrival_at 近→遠', async () => {
    const { socket, api } = await setup()
    socket.emit({ type: 'dismissal_call_created', payload: { ...PARENT_NOTICE, id: 1, expected_arrival_at: '2026-08-14T15:50:00' } })
    socket.emit({ type: 'dismissal_call_created', payload: { ...PARENT_NOTICE, id: 2, expected_arrival_at: '2026-08-14T15:10:00' } })
    socket.emit({ type: 'dismissal_call_created', payload: STAFF_CALL }) // arrived=15:00
    expect(api.sortedCalls.value.map((c) => c.id)).toEqual([202, 2, 1])
  })
})

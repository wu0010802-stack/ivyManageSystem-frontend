// F07：手足分屬不同班次時，別班次的位置／站點事件不得覆寫目前班次畫面。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ today: vi.fn() }))
vi.mock('@/parent/api/bus', () => ({ getBusToday: h.today }))
vi.mock('@/parent/composables/useConnectionStatus', () => ({
  useConnectionStatus: () => ({ registerWs: vi.fn(), unregisterWs: vi.fn() }),
}))
class SyntheticWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: SyntheticWebSocket[] = []
  readyState = SyntheticWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  constructor(_url: string) { SyntheticWebSocket.instances.push(this) }
  send(_data: string) {}
  addEventListener(_type: string, _handler: unknown) {}
  removeEventListener(_type: string, _handler: unknown) {}
  close() { this.readyState = SyntheticWebSocket.CLOSED }
  emit(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }) }
}
import { useBusTracking, __resetForTest } from '@/parent/composables/useBusTracking'
beforeEach(() => {
  vi.stubGlobal('WebSocket', SyntheticWebSocket)
  h.today.mockResolvedValue({ data: {
    trip: { id: 1, direction: 'morning', status: 'in_progress', auto_closed: false, started_at: '2026-10-04T07:00:00' },
    position: { lat: 22.6, lng: 120.3, at: '2026-10-04T07:10:00' },
    stale: false, school: null,
    children: [{ student_id: 1, student_name: '合成孩子甲', stop_status: 'pending', stops_ahead: 2, eta: '2026-10-04T07:20:00' }],
  } })
})
afterEach(() => {
  __resetForTest()
  SyntheticWebSocket.instances = []
  vi.unstubAllGlobals()
})
describe('useBusTracking 位置／站點事件比對 trip_id（F07）', () => {
  it('別班次位置事件不得把目前班次位置與新鮮度覆蓋', async () => {
    const bus = useBusTracking()
    await bus.init()
    bus.state.stale = true
    SyntheticWebSocket.instances[0].emit({ type: 'bus_position', payload: {
      trip_id: 2, lat: 23.1, lng: 121.1, at: '2026-10-04T07:12:00',
    } })
    expect(bus.state.trip?.id).toBe(1)
    expect(bus.state.position?.lat).toBe(22.6)
    expect(bus.state.stale).toBe(true)
  })
  it('別班次站點事件不得把孩子乙的站數與 ETA 裝到目前班次', async () => {
    const bus = useBusTracking()
    await bus.init()
    SyntheticWebSocket.instances[0].emit({ type: 'bus_stop_update', payload: {
      trip_id: 2,
      children: [{ student_id: 2, student_name: '合成孩子乙', stop_status: 'pending', stops_ahead: 7, eta: '2026-10-04T08:00:00' }],
    } })
    expect(bus.state.trip?.id).toBe(1)
    expect(bus.state.children.map((child) => child.student_id)).toEqual([1])
    expect(bus.state.children[0].stops_ahead).toBe(2)
  })
})

/**
 * 管理端娃娃車監看 composable 的守衛測試。
 *
 * 這一頁的核心風險不是「畫面好不好看」，而是**admin WS channel 是全園共用的**：
 * 所有路線的事件都會進到同一條連線。少一道班次比對，畫面上 A 線的車就會被 B 線的
 * GPS 拖著跑、站點清單被別條路線的名冊整包換掉，而管理者完全看不出來。
 *
 * 另一半風險在「新班次發車」怎麼被看見。後端 `91f055f0` 已補上 admin 端的
 * `bus_trip_started`（payload 與 admin 的 `bus_stop_update` 逐欄位相同），但那則事件
 * **只在 WS 當下連著才收得到**：退避重連期與降級輪詢期間漏掉的事件沒有補發。
 * 因此「不認識的班次事件就回頭探測」仍是必要的 fallback——且探測必須節流，
 * 否則別條路線每 5 秒一顆的 GPS 會變成每 5 秒一次快照請求。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/bus', () => ({
  listBusRoutes: vi.fn(),
  getBusTripToday: vi.fn(),
}))

import { listBusRoutes, getBusTripToday } from '@/api/bus'
import {
  useBusMonitor, UNKNOWN_TRIP_PROBE_INTERVAL_MS, POLL_INTERVAL_MS, STALE_AFTER_MS,
} from '@/composables/useBusMonitor'

// ── mock WebSocket ──
class MockWS {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  sent: string[] = []
  closed = false
  constructor(public url: string) { sockets.push(this) }
  send(d: string) { this.sent.push(d) }
  close() { this.closed = true; this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  fire(code = 1006, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }) }
}
let sockets: MockWS[] = []
const lastSocket = () => sockets[sockets.length - 1]

// 測試時間軸固定在台北 2026-07-29 09:00:00（naive 字串即台北牆鐘）
const LOCAL_NOW_MS = Date.UTC(2026, 6, 29, 1, 0, 0) // = 台北 09:00
const TAIPEI_0900 = '2026-07-29T09:00:00'
const TAIPEI_0858 = '2026-07-29T08:58:00'

function routesPayload() {
  return {
    data: {
      routes: [
        // 端點會連站點名冊一起回；本 composable 必須只留 id/name/is_active
        {
          id: 3,
          name: 'A 線',
          is_active: true,
          stops: {
            morning: [{ student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31 }],
            afternoon: [],
          },
        },
        { id: 4, name: 'B 線', is_active: true, stops: { morning: [], afternoon: [] } },
      ],
    },
  }
}

function tripPayload(overrides: Record<string, unknown> = {}, stops?: unknown[]) {
  return {
    data: {
      trip: {
        id: 7,
        route_id: 3,
        direction: 'morning',
        trip_date: '2026-07-29',
        status: 'in_progress',
        auto_closed: false,
        started_at: TAIPEI_0900,
        last_ping_at: TAIPEI_0900,
        last_lat: 22.6,
        last_lng: 120.3,
        ...overrides,
      },
      stops: stops ?? [
        {
          stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
          status: 'pending', lat: 22.61, lng: 120.31, departed_at: null,
        },
      ],
    },
  }
}

const monitors: Array<ReturnType<typeof useBusMonitor>> = []
function createMonitor() {
  const m = useBusMonitor()
  monitors.push(m)
  return m
}

/** 走完「進頁 → 路線清單 → 快照 → WS open」的完整開場。 */
async function bootMonitor() {
  const m = createMonitor()
  const p = m.init()
  await flushPromises()
  lastSocket().open()
  await flushPromises()
  await p
  return m
}

beforeEach(() => {
  sockets = []
  vi.useFakeTimers()
  vi.setSystemTime(LOCAL_NOW_MS)
  vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  vi.mocked(listBusRoutes).mockResolvedValue(routesPayload() as never)
  vi.mocked(getBusTripToday).mockResolvedValue(tripPayload() as never)
})

afterEach(() => {
  monitors.splice(0).forEach((m) => m.teardown())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('家長取消乘車事件（bus_ride_cancellation_changed）', () => {
  it('同方向事件 → 重抓一次快照（站點 excused 狀態只在快照裡）', async () => {
    await bootMonitor()
    const before = vi.mocked(getBusTripToday).mock.calls.length
    lastSocket().emit({
      type: 'bus_ride_cancellation_changed',
      payload: { student_id: 101, date: '2026-07-29', direction: 'morning', action: 'created' },
    })
    await flushPromises()
    expect(vi.mocked(getBusTripToday).mock.calls.length).toBe(before + 1)
  })

  it('別方向的事件不重抓', async () => {
    await bootMonitor()
    const before = vi.mocked(getBusTripToday).mock.calls.length
    lastSocket().emit({
      type: 'bus_ride_cancellation_changed',
      payload: { student_id: 101, date: '2026-07-29', direction: 'afternoon', action: 'revoked' },
    })
    await flushPromises()
    expect(vi.mocked(getBusTripToday).mock.calls.length).toBe(before)
  })
})

describe('進頁與快照', () => {
  it('快照一律帶 route_id（不帶是全域查詢，會回到別條路線的班次與名冊）', async () => {
    await bootMonitor()
    expect(vi.mocked(getBusTripToday).mock.calls.length).toBeGreaterThan(0)
    for (const call of vi.mocked(getBusTripToday).mock.calls) {
      expect(call[0]).toBe(3)
    }
  })

  it('路線清單只留 id/name/is_active，端點一併回傳的站點名冊與座標不進狀態', async () => {
    const m = await bootMonitor()
    expect(m.routes.value).toEqual([
      { id: 3, name: 'A 線', is_active: true },
      { id: 4, name: 'B 線', is_active: true },
    ])
    expect(JSON.stringify(m.routes.value)).not.toContain('120.31')
  })

  it('快照失敗不得謊稱「今天沒有班次」——snapshotFailed 亮起且不進地圖', async () => {
    vi.mocked(getBusTripToday).mockRejectedValue(new Error('boom'))
    const m = await bootMonitor()
    expect(m.snapshotFailed.value).toBe(true)
    expect(m.showMap.value).toBe(false)
    expect(m.loading.value).toBe(false)
  })

  it('換路線會清掉前一條路線的班次並以新 route_id 重抓', async () => {
    const m = await bootMonitor()
    vi.mocked(getBusTripToday).mockResolvedValue(
      tripPayload({ id: 9, route_id: 4 }) as never,
    )
    await m.selectRoute(4)
    await flushPromises()
    expect(m.trip.value?.id).toBe(9)
    const last = vi.mocked(getBusTripToday).mock.calls.at(-1)
    expect(last?.[0]).toBe(4)
  })
})

describe('roster_out_of_sync（名單落後路線設定，提示去調度頁重設）', () => {
  it('快照帶 roster_out_of_sync=true 時透傳給 view', async () => {
    vi.mocked(getBusTripToday).mockResolvedValue({
      data: { ...tripPayload().data, roster_out_of_sync: true },
    } as never)
    const m = await bootMonitor()
    expect(m.rosterOutOfSync.value).toBe(true)
  })

  it('預設（後端沒帶或 false）不亮提示', async () => {
    const m = await bootMonitor()
    expect(m.rosterOutOfSync.value).toBe(false)
  })

  it('換路線先樂觀清成 false，等新路線的快照回來才校正', async () => {
    vi.mocked(getBusTripToday).mockResolvedValue({
      data: { ...tripPayload().data, roster_out_of_sync: true },
    } as never)
    const m = await bootMonitor()
    expect(m.rosterOutOfSync.value).toBe(true)

    vi.mocked(getBusTripToday).mockResolvedValue({
      data: { ...tripPayload({ id: 9, route_id: 4 }).data, roster_out_of_sync: false },
    } as never)
    await m.selectRoute(4)
    await flushPromises()
    expect(m.rosterOutOfSync.value).toBe(false)
  })
})

// ── 第二期契約（FE-DISPATCH-07）──
// `on_leave` 即時衍生旗標退場，excused 落庫欄位接手；ETA 由 eta_planned（當日平移）
// 與 eta_live（行進間重算）兩層構成。normalize 漏欄位的後果不是崩潰而是**靜默少一
// 欄**——畫面照樣渲染，只是永遠顯示「—」，所以這幾條斷言必須逐欄檢查。
describe('excused 與 ETA 欄位（第二期契約破壞：on_leave 退場）', () => {
  it('站點 normalize 帶出 excuse_reason／eta_planned／eta_live，且不再有 on_leave', async () => {
    vi.mocked(getBusTripToday).mockResolvedValue(tripPayload({}, [
      {
        stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
        status: 'excused', excuse_reason: 'parent', lat: 22.61, lng: 120.31,
        eta_planned: '2026-07-29T09:10:00', eta_live: null, departed_at: null,
      },
    ]) as never)
    const m = await bootMonitor()
    expect(m.stops.value[0]).toEqual({
      stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
      status: 'excused', excuse_reason: 'parent', lat: 22.61, lng: 120.31,
      eta_planned: '2026-07-29T09:10:00', eta_live: null, departed_at: null,
    })
    expect(m.stops.value[0]).not.toHaveProperty('on_leave')
  })

  it('缺席欄位一律 null，不會變成 undefined 而在畫面上印出空白以外的東西', async () => {
    const m = await bootMonitor()
    expect(m.stops.value[0].excuse_reason).toBeNull()
    expect(m.stops.value[0].eta_planned).toBeNull()
    expect(m.stops.value[0].eta_live).toBeNull()
  })

  it('trip 帶出 end_time_estimated（行進間重算的預計回園時間）', async () => {
    vi.mocked(getBusTripToday).mockResolvedValue(
      tripPayload({ end_time_estimated: '2026-07-29T09:45:00' }) as never,
    )
    const m = await bootMonitor()
    expect(m.trip.value?.end_time_estimated).toBe('2026-07-29T09:45:00')
  })

  it('WS bus_stop_update 的 eta_live 會覆寫快照值（行進間重算是較新的事實）', async () => {
    const m = await bootMonitor()
    lastSocket().emit({
      type: 'bus_stop_update',
      payload: {
        trip: { ...tripPayload().data.trip, end_time_estimated: '2026-07-29T09:50:00' },
        stops: [{
          stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
          status: 'pending', lat: 22.61, lng: 120.31, departed_at: null,
          eta_planned: '2026-07-29T09:10:00', eta_live: '2026-07-29T09:18:00',
        }],
      },
    })
    await flushPromises()
    expect(m.stops.value[0].eta_live).toBe('2026-07-29T09:18:00')
    expect(m.trip.value?.end_time_estimated).toBe('2026-07-29T09:50:00')
  })
})

describe('WS 事件的班次比對（admin channel 是全園共用）', () => {
  it('別條路線的位置事件不得覆寫目前班次的座標', async () => {
    const m = await bootMonitor()
    // 先讓 8 號班次被判定為「非本路線」：探測後快照仍回 7 號
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 8, lat: 25.0, lng: 121.5, at: TAIPEI_0900 } })
    await flushPromises()
    expect(m.trip.value?.last_lat).toBe(22.6)
    expect(m.trip.value?.last_lng).toBe(120.3)
  })

  it('本班次的位置事件會更新座標與回報時間', async () => {
    const m = await bootMonitor()
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 7, lat: 22.65, lng: 120.35, at: TAIPEI_0900 } })
    await flushPromises()
    expect(m.trip.value?.last_lat).toBe(22.65)
    expect(m.trip.value?.last_lng).toBe(120.35)
    expect(m.trip.value?.last_ping_at).toBe(TAIPEI_0900)
  })

  it('別條路線的 bus_stop_update 不得換掉站點清單（那是另一車的學生名冊）', async () => {
    const m = await bootMonitor()
    lastSocket().emit({
      type: 'bus_stop_update',
      payload: {
        trip: { id: 8, route_id: 4, direction: 'morning', status: 'in_progress', started_at: TAIPEI_0900 },
        stops: [{ stop_id: 99, student_id: 999, student_name: '別班小孩', seq: 1, status: 'pending' }],
      },
    })
    await flushPromises()
    expect(m.stops.value.map((s) => s.student_name)).toEqual(['小明'])
    expect(m.trip.value?.id).toBe(7)
  })

  it('同路線的 bus_stop_update 直接接手（含 WS 漏掉發車事件時、由站點事件補接手的新班次）', async () => {
    const m = await bootMonitor()
    lastSocket().emit({
      type: 'bus_stop_update',
      payload: {
        trip: { id: 12, route_id: 3, direction: 'afternoon', status: 'in_progress', started_at: TAIPEI_0900 },
        stops: [{ stop_id: 21, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
      },
    })
    await flushPromises()
    expect(m.trip.value?.id).toBe(12)
    expect(m.stops.value[0].status).toBe('departed')
  })

  it('別班次的結束事件不得把目前顯示的班次標成已結束', async () => {
    const m = await bootMonitor()
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 8 } })
    await flushPromises()
    expect(m.trip.value?.status).toBe('in_progress')
    expect(m.isLive.value).toBe(true)
  })

  it('首次快照還在 in-flight 時抵達的結束事件，不得被整則丟棄（晚到的快照會讓車復活）', async () => {
    // reviewer 的探針測試（scoped 再審抓到的漏移植）：家長端 useBusTracking:276-291
    // 是「先記錄、才早退」，本檔原本做反了 → `trip.value` 為 null 時整則丟棄。
    // 後果不只是漏一則事件：此後不會再有該班次的事件來修正，畫面會顯示地圖與
    // 「行駛中」直到 60 秒後 stale 介入，而 stale 的文案是「位置訊號暫時中斷」
    // ——車已回校卻說成訊號中斷，比單純的錯更難診斷。
    // ⚠ 收「所有」in-flight 的 resolver：`init()` 發一次快照、`onopen` 還會補發一次，
    // 只留最後一個 resolver 的話 `await p` 會永遠等不到 → 測試逾時（掛住不是紅）。
    const pending: Array<(v: unknown) => void> = []
    vi.mocked(getBusTripToday).mockImplementation(
      () => new Promise((resolve) => { pending.push(resolve) }) as never,
    )
    const m = createMonitor()
    const p = m.init()
    await flushPromises()
    lastSocket().open()
    await flushPromises()
    // 前置條件：快照尚未回來，trip 仍是 null（若這條不成立，本測試就是空轉）
    expect(m.trip.value).toBeNull()
    expect(pending.length).toBeGreaterThan(0)

    // ⚠ 呼叫次數要在事件之前先取樣：`pending` 是由 mock 自己 push 的，
    // 事後拿 `pending.length` 當期望值會連 mutation 多打的那一次也一起算進去（恆真斷言）。
    const callsBefore = vi.mocked(getBusTripToday).mock.calls.length
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 7 } })
    await flushPromises()

    // `if (!current) return`：此時該由 in-flight 的快照收尾。
    // 拿掉那行的話 `{ ...null }` 在 JS 是 `{}` —— trip 會變成缺 id/route_id 的殘缺物件，
    // 摘要卡在快照回來前短暫渲染「路線 #undefined・」與「班次已結束」，還多打一次快照。
    expect(m.trip.value).toBeNull()
    expect(getBusTripToday).toHaveBeenCalledTimes(callsBefore)

    // 晚到的快照仍是 in_progress（司機在快照 in-flight 期間按了結束）
    pending.forEach((resolve) => resolve(tripPayload()))
    await flushPromises()
    await p
    expect(m.trip.value?.status).toBe('completed')
    expect(m.showMap.value).toBe(false)
  })

  it('結束事件只帶 trip_id，要補抓快照才知道是不是「逾時自動關閉」', async () => {
    // bus_maintenance_scheduler 的自動關班與司機手動結束共用同一個 {trip_id} payload。
    // 不補抓的話 auto_closed 會沿用舊值 false，「司機忘了按結束」這則營運告警就被吞掉，
    // 而 WS 正常時沒有其他路徑會修正它（不重連就不 refresh、不降級就不輪詢）。
    const m = await bootMonitor()
    vi.mocked(getBusTripToday).mockClear()
    vi.mocked(getBusTripToday).mockResolvedValue(
      tripPayload({ status: 'completed', auto_closed: true }) as never,
    )
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 7 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(1)
    expect(m.trip.value?.auto_closed).toBe(true)
  })

  it('別班次的結束事件不得觸發快照（那是別條路線的事）', async () => {
    await bootMonitor()
    vi.mocked(getBusTripToday).mockClear()
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 8 } })
    await flushPromises()
    expect(getBusTripToday).not.toHaveBeenCalled()
  })

  it('結束後補抓的快照若仍讀到 in_progress，不得把已回校的車復活成行駛中', async () => {
    const m = await bootMonitor()
    // 補抓的快照還是舊狀態（DB 讀到結束前的資料 / 晚到的舊快照）
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 7 } })
    await flushPromises()
    expect(m.trip.value?.status).toBe('completed')
    expect(m.showMap.value).toBe(false)
    // 之後的輪詢／重連再抓一次也一樣不得復活
    await m.refresh()
    expect(m.trip.value?.status).toBe('completed')
  })

  it('本班次結束後不再把最後座標當即時位置呈現', async () => {
    const m = await bootMonitor()
    lastSocket().emit({ type: 'bus_trip_completed', payload: { trip_id: 7 } })
    await flushPromises()
    expect(m.trip.value?.status).toBe('completed')
    expect(m.showMap.value).toBe(false)
  })
})

describe('admin channel 的 bus_trip_started（後端 91f055f0 / b2021a79 補上）', () => {
  // payload 與 admin 的 bus_stop_update **逐欄位相同**（`{trip, stops}`，＝ HTTP 201 的 body），
  // 因此併入同一條分支處理。探測機制仍保留為 fallback：WS 沒有補發機制，退避重連期
  // 與降級輪詢期間的事件是永久遺失的。
  function startedEvent(tripOverrides: Record<string, unknown> = {}, stops?: unknown[]) {
    return {
      type: 'bus_trip_started',
      payload: {
        trip: {
          id: 30, route_id: 3, direction: 'morning', trip_date: '2026-07-29',
          status: 'in_progress', auto_closed: false, started_at: TAIPEI_0900,
          last_ping_at: null, last_lat: null, last_lng: null, ...tripOverrides,
        },
        stops: stops ?? [{
          stop_id: 41, student_id: 101, student_name: '小明', seq: 1,
          status: 'pending', lat: 22.61, lng: 120.31, departed_at: null,
        }],
      },
    }
  }

  it('本路線發車：直接接手新班次與站點，不必再打一次快照', async () => {
    // 進頁時今天還沒發車——這正是探測補不到的那一段（快照無班次、之後才發車）
    vi.mocked(getBusTripToday).mockResolvedValue({ data: { trip: null, stops: [] } } as never)
    const m = await bootMonitor()
    expect(m.trip.value).toBeNull()
    vi.mocked(getBusTripToday).mockClear()

    lastSocket().emit(startedEvent())
    await flushPromises()

    expect(m.trip.value?.id).toBe(30)
    expect(m.isLive.value).toBe(true)
    expect(m.stops.value.map((s) => s.student_name)).toEqual(['小明'])
    expect(getBusTripToday).not.toHaveBeenCalled()
  })

  it('別條路線發車：不得接手，並連帶記入負向快取（之後它的位置事件不必再探測）', async () => {
    const m = await bootMonitor()
    const ws = lastSocket()

    ws.emit(startedEvent({ id: 31, route_id: 4 }, [
      { stop_id: 99, student_id: 999, student_name: '別班小孩', seq: 1, status: 'pending' },
    ]))
    await flushPromises()

    expect(m.trip.value?.id).toBe(7)
    expect(m.stops.value.map((s) => s.student_name)).toEqual(['小明'])

    // 節流窗之外仍不該探測——開班事件已經證明它不是本路線
    vi.mocked(getBusTripToday).mockClear()
    vi.setSystemTime(LOCAL_NOW_MS + UNKNOWN_TRIP_PROBE_INTERVAL_MS + 1000)
    ws.emit({ type: 'bus_position', payload: { trip_id: 31, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).not.toHaveBeenCalled()
  })
})

describe('不認識的班次：探測（WS 斷線期間漏掉的發車事件之 fallback）', () => {
  it('本路線剛發車時，位置事件會觸發一次快照並接手新班次', async () => {
    const m = await bootMonitor()
    vi.mocked(getBusTripToday).mockClear()
    vi.mocked(getBusTripToday).mockResolvedValue(tripPayload({ id: 21 }) as never)
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 21, lat: 22.7, lng: 120.4, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(1)
    expect(m.trip.value?.id).toBe(21)
  })

  it('確認過不是本路線的班次，之後的位置事件一律丟棄，不再打快照', async () => {
    await bootMonitor()
    const ws = lastSocket()
    ws.emit({ type: 'bus_position', payload: { trip_id: 8, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    vi.mocked(getBusTripToday).mockClear()
    // 節流窗之外，但 8 號已被記為別條路線 → 不該再探測
    vi.setSystemTime(LOCAL_NOW_MS + UNKNOWN_TRIP_PROBE_INTERVAL_MS + 1000)
    ws.emit({ type: 'bus_position', payload: { trip_id: 8, lat: 25.1, lng: 121.1, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).not.toHaveBeenCalled()
  })

  it('節流：不同的未知班次在節流窗內只探測一次', async () => {
    await bootMonitor()
    const ws = lastSocket()
    vi.mocked(getBusTripToday).mockClear()
    ws.emit({ type: 'bus_position', payload: { trip_id: 31, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    ws.emit({ type: 'bus_position', payload: { trip_id: 32, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(1)
    // 節流窗過後才允許下一次
    vi.setSystemTime(LOCAL_NOW_MS + UNKNOWN_TRIP_PROBE_INTERVAL_MS + 1)
    ws.emit({ type: 'bus_position', payload: { trip_id: 32, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(2)
  })

  it('換路線後負向快取要作廢：原本判定為「別條路線」的班次要能被重新探測', async () => {
    const m = await bootMonitor()
    const ws = lastSocket()
    // 在 3 號路線時把 9 號班次判定為別條路線
    ws.emit({ type: 'bus_position', payload: { trip_id: 9, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    // 換到 4 號路線，此時 4 號今天還沒發車 → 快照回空
    vi.mocked(getBusTripToday).mockResolvedValue({ data: { trip: null, stops: [] } } as never)
    await m.selectRoute(4)
    await flushPromises()
    // 4 號路線發車，但發車事件落在 WS 斷線期間（沒有補發），第一則收得到的 admin
    // 事件是位置。負向快取沒清掉的話，這一則會被直接丟棄，監看頁永遠停在「今日尚無班次」。
    vi.mocked(getBusTripToday).mockClear()
    vi.mocked(getBusTripToday).mockResolvedValue(tripPayload({ id: 9, route_id: 4 }) as never)
    ws.emit({ type: 'bus_position', payload: { trip_id: 9, lat: 22.8, lng: 120.8, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(1)
    expect(m.trip.value?.id).toBe(9)
  })

  it('探測時快照失敗不得把班次記進負向快取（它可能正是本路線剛發車的那一班）', async () => {
    await bootMonitor()
    const ws = lastSocket()
    vi.mocked(getBusTripToday).mockRejectedValue(new Error('boom'))
    ws.emit({ type: 'bus_position', payload: { trip_id: 41, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    vi.mocked(getBusTripToday).mockClear()
    vi.mocked(getBusTripToday).mockResolvedValue(tripPayload({ id: 41 }) as never)
    vi.setSystemTime(LOCAL_NOW_MS + UNKNOWN_TRIP_PROBE_INTERVAL_MS + 1)
    ws.emit({ type: 'bus_position', payload: { trip_id: 41, lat: 25, lng: 121, at: TAIPEI_0900 } })
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalledTimes(1)
  })
})

describe('連線', () => {
  it('連到 admin channel，且 token 不進 URL query', async () => {
    await bootMonitor()
    expect(lastSocket().url).toContain('/api/ws/admin/bus')
    expect(lastSocket().url).not.toContain('token')
    expect(lastSocket().url).not.toContain('?')
  })

  it('回應後端 ping（90 秒收不到 client 訊息後端會主動斷線）', async () => {
    await bootMonitor()
    lastSocket().emit({ type: 'ping' })
    expect(lastSocket().sent).toEqual([JSON.stringify({ type: 'pong' })])
  })

  it('進頁尚未 open 時不得顯示「重新連線中」（否則每次進頁都閃一次）', async () => {
    const m = createMonitor()
    const p = m.init()
    await flushPromises()
    expect(m.reconnecting.value).toBe(false)
    lastSocket().open()
    await p
    expect(m.reconnecting.value).toBe(false)
  })

  it('斷線後亮起重連中，並在退避後重新連線', async () => {
    const m = await bootMonitor()
    lastSocket().fire(1006)
    expect(m.reconnecting.value).toBe(true)
    const before = sockets.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets.length).toBe(before + 1)
    lastSocket().open()
    await flushPromises()
    expect(m.reconnecting.value).toBe(false)
  })

  it('被替換掉的舊 socket 延遲吐出的事件一律忽略', async () => {
    const m = await bootMonitor()
    const stale = lastSocket()
    stale.fire(1006)
    await vi.advanceTimersByTimeAsync(1000)
    lastSocket().open()
    await flushPromises()
    stale.emit({ type: 'bus_position', payload: { trip_id: 7, lat: 1.1, lng: 2.2, at: TAIPEI_0900 } })
    await flushPromises()
    expect(m.trip.value?.last_lat).toBe(22.6)
  })

  it('重試用盡後退化為定時抓快照', async () => {
    await bootMonitor()
    // 5 次快速重試（1s/2s/4s/8s/16s）全部立刻再斷
    for (let i = 0; i < 5; i += 1) {
      lastSocket().fire(1006)
      await vi.advanceTimersByTimeAsync(2 ** i * 1000)
      await flushPromises()
    }
    lastSocket().fire(1006)
    await flushPromises()
    vi.mocked(getBusTripToday).mockClear()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await flushPromises()
    expect(getBusTripToday).toHaveBeenCalled()
  })

  it('teardown 時仍在飛的 auth 復原不得在事後長出殭屍連線', async () => {
    // 4003（token 週期重驗失敗）會先重抓快照借道 401 攔截器 refresh，再重連。
    // 若 teardown 沒有切斷生命週期，這條 in-flight 的復原會在元件卸載後才回來，
    // 於是排出一條沒人管的重連——分頁切走後仍持續連線。
    const m = await bootMonitor()
    let resolveSnapshot: ((v: unknown) => void) | null = null
    vi.mocked(getBusTripToday).mockImplementation(
      () => new Promise((resolve) => { resolveSnapshot = resolve }) as never,
    )
    lastSocket().fire(4003)
    await flushPromises()
    const before = sockets.length
    m.teardown()
    monitors.length = 0
    resolveSnapshot?.(tripPayload())
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60000)
    await flushPromises()
    expect(sockets.length).toBe(before)
  })

  it('teardown 後不再重連、也不再輪詢', async () => {
    const m = await bootMonitor()
    lastSocket().fire(1006)
    m.teardown()
    monitors.length = 0
    const before = sockets.length
    vi.mocked(getBusTripToday).mockClear()
    await vi.advanceTimersByTimeAsync(60000)
    await flushPromises()
    expect(sockets.length).toBe(before)
    expect(getBusTripToday).not.toHaveBeenCalled()
  })
})

describe('不新鮮的位置不得呈現為即時', () => {
  it('超過 60 秒沒有回報就收起地圖', async () => {
    vi.mocked(getBusTripToday).mockResolvedValue(
      tripPayload({ last_ping_at: TAIPEI_0858 }) as never,
    )
    const m = await bootMonitor()
    expect(m.stale.value).toBe(true)
    expect(m.showMap.value).toBe(false)
  })

  it('剛回報的位置是新鮮的', async () => {
    const m = await bootMonitor()
    expect(m.stale.value).toBe(false)
    expect(m.showMap.value).toBe(true)
  })

  it('時間差剛好跨過門檻才算過時（naive 字串以台北時區錨定）', async () => {
    const m = await bootMonitor()
    // 門檻內：不算過時
    vi.setSystemTime(LOCAL_NOW_MS + STALE_AFTER_MS)
    await vi.advanceTimersByTimeAsync(0)
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 7, lat: 22.6, lng: 120.3, at: TAIPEI_0900 } })
    await flushPromises()
    expect(m.stale.value).toBe(false)
    // 超過門檻 1ms：算過時
    vi.setSystemTime(LOCAL_NOW_MS + STALE_AFTER_MS + 1)
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 7, lat: 22.6, lng: 120.3, at: TAIPEI_0900 } })
    await flushPromises()
    expect(m.stale.value).toBe(true)
  })
})

/**
 * storage 守衛的兩個陷阱（都會讓斷言恆綠）：
 * - `tests/setup.js` 把全域 `localStorage` 換成**純物件 mock**，不是 Storage 實例
 *   → `vi.spyOn(Storage.prototype, 'setItem')` 永遠不會被呼叫。
 * - happy-dom 的 `sessionStorage` 是 Proxy，`vi.spyOn(sessionStorage, 'setItem')`
 *   的賦值會被吞掉，spy 同樣抓不到。
 * 因此 localStorage 對實際物件下 spy，sessionStorage 整個換掉。下方有自檢。
 */
function installStorageSpies() {
  const localSpy = vi.spyOn(localStorage, 'setItem')
  const sessionSpy = vi.fn()
  const originalSession = globalThis.sessionStorage
  vi.stubGlobal('sessionStorage', {
    setItem: sessionSpy,
    getItem: () => null,
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
  return {
    localSpy,
    sessionSpy,
    restore() {
      localSpy.mockRestore()
      vi.stubGlobal('sessionStorage', originalSession)
    },
  }
}

describe('隱私', () => {
  it('全流程不得把座標寫進 console 或任何 storage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = installStorageSpies()
    const m = await bootMonitor()
    lastSocket().emit({ type: 'bus_position', payload: { trip_id: 7, lat: 22.65, lng: 120.35, at: TAIPEI_0900 } })
    await flushPromises()
    await m.selectRoute(4)
    await flushPromises()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(storage.localSpy).not.toHaveBeenCalled()
    expect(storage.sessionSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    storage.restore()
  })

  it('守衛自檢：storage spy 真的抓得到寫入', () => {
    const storage = installStorageSpies()
    localStorage.setItem('probe', '1')
    sessionStorage.setItem('probe', '1')
    expect(storage.localSpy).toHaveBeenCalled()
    expect(storage.sessionSpy).toHaveBeenCalled()
    storage.restore()
  })
})

// ── 測試輔助函式自檢（helper 本身也可能有 bug）──
describe('測試輔助函式自檢', () => {
  it('LOCAL_NOW_MS 對應的台北牆鐘正是 TAIPEI_0900，且 TAIPEI_0858 早兩分鐘', () => {
    expect(new Date(LOCAL_NOW_MS).toISOString()).toBe('2026-07-29T01:00:00.000Z')
    expect(new Date(`${TAIPEI_0900}+08:00`).getTime()).toBe(LOCAL_NOW_MS)
    expect(LOCAL_NOW_MS - new Date(`${TAIPEI_0858}+08:00`).getTime()).toBe(120000)
  })

  it('MockWS 的 fire() 真的會觸發 onclose，emit() 真的會送進 onmessage', () => {
    const ws = new MockWS('ws://x')
    const seen: string[] = []
    ws.onclose = (e) => seen.push(`close:${e.code}`)
    ws.onmessage = (e) => seen.push(`msg:${e.data}`)
    ws.emit({ a: 1 })
    ws.fire(4003)
    expect(seen).toEqual(['msg:{"a":1}', 'close:4003'])
  })
})

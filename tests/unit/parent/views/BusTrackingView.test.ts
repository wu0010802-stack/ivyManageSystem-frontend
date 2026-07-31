/**
 * BusTrackingView — 家長端娃娃車地圖頁。
 *
 * 這頁的核心不變式是「不得把不新鮮的位置呈現成即時的」：
 *  - `stale`（server 60 秒沒收到回報）
 *  - `lastFetchFailedAt`（快照 403 / 500，Task 9 F4 承接）
 * 兩者任一成立時都必須收起地圖並明說，而不是靜靜留著舊座標。
 *
 * 連線狀態只有兩態（Task 9 F1 更正）：正常 / 斷線重連中。4001/4007/4029/1008 全在
 * `ws.accept()` 之前 close，瀏覽器只看得到 1006，因此**不做**「權限不足」之類的 UI。
 *
 * 隱私：站點座標＝家庭住址，不得進 console / storage / document.title / URL。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

interface TrackingState {
  loading: boolean
  trip: Record<string, unknown> | null
  position: Record<string, unknown> | null
  children: Record<string, unknown>[]
  stale: boolean
  school: Record<string, unknown> | null
  wsConnected: boolean
  wsExhausted: boolean
  wsBlocked: boolean
  lastWsClose: Record<string, unknown> | null
  lastFetchFailedAt: number | null
}

const trackingMock = vi.hoisted(() => {
  const init = (): TrackingState => ({
    loading: false,
    trip: null,
    position: null,
    children: [],
    stale: false,
    school: null,
    wsConnected: true,
    wsExhausted: false,
    wsBlocked: false,
    lastWsClose: null,
    lastFetchFailedAt: null,
  })
  return {
    state: init() as TrackingState,
    reset: init,
    init: vi.fn(() => Promise.resolve()),
    teardown: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    retryWs: vi.fn(),
  }
})

vi.mock('@/parent/composables/useBusTracking', () => ({
  useBusTracking: () => trackingMock,
}))

// Leaflet 動態 import 的替身：只要求「不炸」，地圖本身不是本測試的斷言對象
const leafletMock = vi.hoisted(() => {
  const marker = () => {
    const m = { addTo: () => m, setLatLng: () => m, remove: () => {} }
    return m
  }
  const map = () => {
    const m = { setView: () => m, remove: () => {}, invalidateSize: () => {}, fitBounds: () => m }
    return m
  }
  return {
    default: {
      map,
      marker,
      tileLayer: () => ({ addTo: () => ({}) }),
      divIcon: () => ({}),
      latLngBounds: () => ({ extend: () => {}, isValid: () => true }),
    },
  }
})
vi.mock('leaflet', () => leafletMock)

import BusTrackingView from '@/parent/views/BusTrackingView.vue'

const IN_PROGRESS_TRIP = { id: 1, direction: 'morning', status: 'in_progress', auto_closed: false, started_at: '2026-07-29T07:20:00' }
const POSITION = { lat: 22.63, lng: 120.3, at: '2026-07-29T07:31:05' }
const CHILD_PENDING = { student_id: 3, student_name: '王小明', stop_status: 'pending', stops_ahead: 2, stop_lat: 22.61, stop_lng: 120.28 }

function setState(patch: Partial<TrackingState>): void {
  Object.assign(trackingMock.state, patch)
}

async function mountView() {
  const w = mount(BusTrackingView, {
    global: { stubs: { RouterLink: true } },
  })
  await flushPromises()
  return w
}

beforeEach(() => {
  Object.assign(trackingMock.state, trackingMock.reset())
  trackingMock.init.mockClear()
  trackingMock.teardown.mockClear()
  trackingMock.refresh.mockClear()
})

afterEach(() => {
  document.title = ''
})

describe('BusTrackingView — 四態', () => {
  it('載入中顯示骨架，不誤閃空狀態', async () => {
    setState({ loading: true })
    const w = await mountView()
    expect(w.find('[data-testid="bus-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="bus-empty"]').exists()).toBe(false)
  })

  it('無班次顯示空狀態', async () => {
    const w = await mountView()
    expect(w.find('[data-testid="bus-empty"]').exists()).toBe(true)
    expect(w.text()).toContain('目前沒有進行中的娃娃車班次')
  })

  it('進行中顯示地圖與進度（前面還有 N 站）', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, children: [CHILD_PENDING] })
    const w = await mountView()
    expect(w.find('[data-testid="bus-map"]').exists()).toBe(true)
    expect(w.text()).toContain('王小明')
    expect(w.text()).toContain('前面還有 2 站')
  })

  it('已上車 / 略過站的文案各自正確', async () => {
    setState({
      trip: IN_PROGRESS_TRIP,
      position: POSITION,
      children: [
        { ...CHILD_PENDING, student_id: 3, student_name: '王小明', stop_status: 'departed', stops_ahead: 0 },
        { ...CHILD_PENDING, student_id: 4, student_name: '王小美', stop_status: 'skipped', stops_ahead: 0 },
      ],
    })
    const w = await mountView()
    // 逐卡比對：只斷言「兩句話都出現」會讓 departed / skipped 對調的錯誤存活
    const cards = w.findAll('.bus-progress-card')
    const textOf = (name: string) => cards.find((c) => c.text().includes(name))?.text() ?? ''
    expect(textOf('王小明')).toContain('已上車前往學校')
    expect(textOf('王小美')).toContain('今日略過此站')
  })

  it('班次已結束顯示完成狀態且不渲染地圖', async () => {
    setState({ trip: { ...IN_PROGRESS_TRIP, status: 'completed' }, position: null })
    const w = await mountView()
    expect(w.text()).toContain('班次已結束')
    expect(w.find('[data-testid="bus-map"]').exists()).toBe(false)
    // 司機正常結束的班次不得亂扣「系統自動結束」的帽子
    expect(w.text()).not.toContain('系統自動結束')
  })

  it('系統自動結束的班次明白告知（司機忘記按結束）', async () => {
    setState({ trip: { ...IN_PROGRESS_TRIP, status: 'completed', auto_closed: true }, position: null })
    const w = await mountView()
    expect(w.text()).toContain('系統自動結束')
  })
})

describe('BusTrackingView — 不得把不新鮮的位置當即時', () => {
  it('stale 時收起地圖並明說訊號中斷', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, children: [CHILD_PENDING], stale: true })
    const w = await mountView()
    expect(w.text()).toContain('位置訊號暫時中斷')
    expect(w.find('[data-testid="bus-map"]').exists()).toBe(false)
    // 進度仍要看得到（那是 stop_status，不隨座標過時而失效）
    expect(w.text()).toContain('前面還有 2 站')
  })

  it('快照失敗（F4）時收起地圖並明說無法取得最新位置，而非靜靜顯示舊座標', async () => {
    setState({
      trip: IN_PROGRESS_TRIP,
      position: POSITION,
      children: [CHILD_PENDING],
      stale: false,
      lastFetchFailedAt: Date.now(),
    })
    const w = await mountView()
    expect(w.find('[data-testid="bus-fetch-error"]').exists()).toBe(true)
    expect(w.text()).toContain('無法取得最新位置')
    expect(w.find('[data-testid="bus-map"]').exists()).toBe(false)
  })

  it('快照失敗時提供重試，按下即重抓快照', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, lastFetchFailedAt: Date.now() })
    const w = await mountView()
    await w.find('[data-testid="bus-retry"]').trigger('click')
    expect(trackingMock.refresh).toHaveBeenCalled()
  })

  it('資料正常時不得出現任何降級提示', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, children: [CHILD_PENDING] })
    const w = await mountView()
    expect(w.find('[data-testid="bus-fetch-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="bus-stale"]').exists()).toBe(false)
  })
})

describe('BusTrackingView — 連線狀態只有兩態', () => {
  it('WS 斷線時提示重新連線中', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, wsConnected: false })
    const w = await mountView()
    expect(w.find('[data-testid="bus-conn"]').exists()).toBe(true)
    expect(w.text()).toContain('重新連線')
  })

  it('WS 正常時不顯示連線提示', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, wsConnected: true })
    const w = await mountView()
    expect(w.find('[data-testid="bus-conn"]').exists()).toBe(false)
  })

  it('不得為永遠不會發生的 4007 權限拒絕做 UI（死程式）', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, wsConnected: false, wsBlocked: true })
    const w = await mountView()
    expect(w.text()).not.toContain('權限')
    expect(w.text()).not.toContain('聯絡管理員')
  })
})

describe('BusTrackingView — 生命週期與隱私', () => {
  it('mount 時 init、unmount 時 teardown', async () => {
    const w = await mountView()
    expect(trackingMock.init).toHaveBeenCalledTimes(1)
    w.unmount()
    expect(trackingMock.teardown).toHaveBeenCalledTimes(1)
  })

  it('座標不得出現在畫面文字、document.title、URL 或 console／儲存', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
    const localSetItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {})
    const realSessionStorage = globalThis.sessionStorage
    const sessionSetItem = vi.fn()
    vi.stubGlobal('sessionStorage', { setItem: sessionSetItem, getItem: () => null, removeItem: () => {} })
    try {
      setState({
        trip: IN_PROGRESS_TRIP,
        position: POSITION,
        children: [CHILD_PENDING],
        school: { lat: 22.6, lng: 120.29 },
      })
      const w = await mountView()

      // 站點座標（家庭住址）不得以任何形式外顯
      expect(w.text()).not.toContain('22.61')
      expect(w.text()).not.toContain('120.28')
      expect(w.html()).not.toContain('22.61')
      expect(w.html()).not.toContain('120.28')
      expect(document.title).not.toContain('22.61')
      expect(window.location.href).not.toContain('22.61')

      const printed = [...spies, localSetItem, sessionSetItem]
        .flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join(' ')
      expect(printed).not.toContain('22.61')
      expect(printed).not.toContain('120.28')
      expect(localSetItem).not.toHaveBeenCalled()
      expect(sessionSetItem).not.toHaveBeenCalled()
    } finally {
      vi.stubGlobal('sessionStorage', realSessionStorage)
      ;[...spies, localSetItem].forEach((s) => { s.mockRestore() })
    }
  })
})

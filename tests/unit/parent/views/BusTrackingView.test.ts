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

  it('冷啟動快照失敗時不得謊稱「今天沒有班次」', async () => {
    // trip 還是 null 只是因為快照根本沒抓到，不代表今天沒有娃娃車。
    // 這比凍結的地圖更糟——家長會直接不看了。
    setState({ trip: null, lastFetchFailedAt: Date.now() })
    const w = await mountView()
    expect(w.text()).not.toContain('目前沒有進行中的娃娃車班次')
    expect(w.find('[data-testid="bus-empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="bus-fetch-error"]').exists()).toBe(true)
  })

  it('快照失敗時不得宣稱「班次已結束」（可能只是抓不到新班次）', async () => {
    setState({ trip: { ...IN_PROGRESS_TRIP, status: 'completed' }, lastFetchFailedAt: Date.now() })
    const w = await mountView()
    expect(w.text()).not.toContain('班次已結束')
    expect(w.find('[data-testid="bus-done"]').exists()).toBe(false)
    expect(w.find('[data-testid="bus-fetch-error"]').exists()).toBe(true)
  })

  it('快照失敗時提供重試，按下即重抓快照並重連 WS', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, lastFetchFailedAt: Date.now() })
    const w = await mountView()
    await w.find('[data-testid="bus-retry"]').trigger('click')
    expect(trackingMock.refresh).toHaveBeenCalled()
    // WS 若同時死著，只重抓快照仍然回不到即時
    expect(trackingMock.retryWs).toHaveBeenCalled()
  })

  it('重試進行中按鈕 disable，連點不得併發多次', async () => {
    let release: (() => void) | null = null
    trackingMock.refresh.mockImplementationOnce(
      () => new Promise<void>((r) => { release = r }),
    )
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, lastFetchFailedAt: Date.now() })
    const w = await mountView()
    const btn = w.find('[data-testid="bus-retry"]')
    await btn.trigger('click')
    await btn.trigger('click')
    await btn.trigger('click')

    expect(trackingMock.refresh).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="bus-retry"]').attributes('disabled')).toBeDefined()
    release?.()
    await flushPromises()
    expect(w.find('[data-testid="bus-retry"]').attributes('disabled')).toBeUndefined()
  })

  it('資料正常時不得出現任何降級提示', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, children: [CHILD_PENDING] })
    const w = await mountView()
    expect(w.find('[data-testid="bus-fetch-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="bus-stale"]').exists()).toBe(false)
  })
})

describe('BusTrackingView — 連線狀態只有兩態', () => {
  it('WS 真的斷過才提示重新連線中', async () => {
    setState({
      trip: IN_PROGRESS_TRIP,
      position: POSITION,
      wsConnected: false,
      lastWsClose: { code: 1006, kind: 'transient', message: '連線中斷' },
    })
    const w = await mountView()
    expect(w.find('[data-testid="bus-conn"]').exists()).toBe(true)
    expect(w.text()).toContain('重新連線')
  })

  it('進頁瞬間（尚未握手完成、從未斷過）不得閃斷線提示', async () => {
    // wsConnected 初值就是 false，init() 先 await 快照、onopen 更晚；
    // 只看 wsConnected 會讓每次進頁都閃一次「連線中斷」。
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, wsConnected: false, lastWsClose: null })
    const w = await mountView()
    expect(w.find('[data-testid="bus-conn"]').exists()).toBe(false)
  })

  it('WS 正常時不顯示連線提示', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, wsConnected: true })
    const w = await mountView()
    expect(w.find('[data-testid="bus-conn"]').exists()).toBe(false)
  })

  it('不得為永遠不會發生的 4007 權限拒絕做 UI（死程式）', async () => {
    setState({
      trip: IN_PROGRESS_TRIP,
      position: POSITION,
      wsConnected: false,
      wsBlocked: true,
      lastWsClose: { code: 1006, kind: 'transient', message: '連線中斷' },
    })
    const w = await mountView()
    expect(w.text()).not.toContain('權限')
    expect(w.text()).not.toContain('聯絡管理員')
  })
})

describe('BusTrackingView — 無障礙', () => {
  it('地圖容器不得用 role="img"（會把 Leaflet 的縮放鈕與 OSM 授權連結一起藏起來）', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION })
    const w = await mountView()
    const map = w.find('[data-testid="bus-map"]')
    expect(map.attributes('role')).toBeUndefined()
    expect(map.attributes('aria-label')).toBeTruthy()
  })

  it('三種動態降級提示都要 role="status"，螢幕閱讀器才收得到', async () => {
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, lastFetchFailedAt: Date.now() })
    const failed = await mountView()
    expect(failed.find('[data-testid="bus-fetch-error"]').attributes('role')).toBe('status')

    Object.assign(trackingMock.state, trackingMock.reset())
    setState({ trip: IN_PROGRESS_TRIP, position: POSITION, stale: true })
    const stale = await mountView()
    expect(stale.find('[data-testid="bus-stale"]').attributes('role')).toBe('status')

    Object.assign(trackingMock.state, trackingMock.reset())
    setState({
      trip: IN_PROGRESS_TRIP,
      position: POSITION,
      wsConnected: false,
      lastWsClose: { code: 1006, kind: 'transient', message: '連線中斷' },
    })
    const conn = await mountView()
    expect(conn.find('[data-testid="bus-conn"]').attributes('role')).toBe('status')
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

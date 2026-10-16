/**
 * 監看頁地圖底圖的 provider 契約。
 *
 * 兩條規則，兩條都有代價：
 * - **Google 只是加分項**：沒設金鑰、SDK 載不起來時必須安靜地畫 Leaflet + OSM，
 *   不得整塊地圖消失（管理者要靠它判斷車在哪）。
 * - **地圖實例不得重建**：Google 的計費單位是「建立一次 Map 實例」，位置每
 *   幾秒更新一次，若每次更新都 new 一顆，帳單會是預估的數十倍。所以位置變動
 *   只准移動 marker。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const mocks = vi.hoisted(() => {
  const { ref: r, computed: c } = require('vue') as typeof import('vue')
  const trip = r<Record<string, unknown> | null>(null)
  const stops = r<Array<Record<string, unknown>>>([])
  const snapshotFailed = r(false)
  const stale = r(false)
  const isLive = c(() => trip.value?.status === 'in_progress')
  const leaflet = {
    map: vi.fn(),
    tileLayer: vi.fn(),
    marker: vi.fn(),
  }
  return {
    leaflet,
    api: {
      routes: r<Array<Record<string, unknown>>>([]),
      selectedRouteId: r<number | null>(null),
      trip,
      stops,
      loading: r(false),
      snapshotFailed,
      rosterOutOfSync: r(false),
      stale,
      isLive,
      reconnecting: r(false),
      showMap: c(
        () => isLive.value && trip.value?.last_lat != null && !stale.value && !snapshotFailed.value,
      ),
      tripSummary: r('A 線・早上接學生'),
      init: vi.fn(),
      refresh: vi.fn(),
      selectRoute: vi.fn(),
      retryWs: vi.fn(),
      teardown: vi.fn(),
    },
  }
})

vi.mock('@/composables/useBusMonitor', async () => {
  const actual = await vi.importActual<typeof import('@/composables/useBusMonitor')>(
    '@/composables/useBusMonitor',
  )
  return { ...actual, useBusMonitor: () => mocks.api }
})

vi.mock('leaflet', () => ({ default: mocks.leaflet }))

import BusMonitorView from '@/views/BusMonitorView.vue'

const s = mocks.api
const L = mocks.leaflet

// ── Leaflet 替身 ──
function installLeafletMock() {
  const leafletMap = { setView: vi.fn(), remove: vi.fn() }
  const leafletMarker = () => ({ addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn(), remove: vi.fn() })
  L.map.mockReturnValue({ ...leafletMap, setView: vi.fn().mockReturnValue(leafletMap) })
  L.map.mockImplementation(() => {
    const m: Record<string, unknown> = { remove: vi.fn() }
    m.setView = vi.fn().mockReturnValue(m)
    return m
  })
  L.tileLayer.mockImplementation(() => ({ addTo: vi.fn() }))
  L.marker.mockImplementation(() => leafletMarker())
}

// ── Google Maps 替身 ──
type GoogleMocks = { Map: ReturnType<typeof vi.fn>; Marker: ReturnType<typeof vi.fn> }
function installGoogleMapsMock(): GoogleMocks {
  const Map = vi.fn(function MockMap(this: Record<string, unknown>, el: unknown, opts: unknown) {
    this.el = el
    this.opts = opts
    this.setCenter = vi.fn()
    this.setZoom = vi.fn()
  })
  const Marker = vi.fn(function MockMarker(this: Record<string, unknown>, opts: Record<string, unknown>) {
    this.opts = opts
    this.setPosition = vi.fn()
    this.setMap = vi.fn()
  })
  const maps = { Map, Marker }
  ;(window as unknown as { google?: unknown }).google = { maps }
  return maps as unknown as GoogleMocks
}

const GLOBAL_STUBS = {
  'el-table': true,
  'el-table-column': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-icon': { template: '<span />' },
  'el-alert': true,
  'el-empty': true,
  'el-skeleton': true,
}
const mountView = () => mount(BusMonitorView, { global: { stubs: GLOBAL_STUBS } })

/**
 * renderMap 走動態 import（leaflet / Google SDK），一輪 microtask 不夠讓它落地。
 * 比照 tests/unit/components/RecruitmentAddressHeatmap.google.test.js 的既有做法。
 */
const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 20))
}

function inProgressTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, route_id: 3, direction: 'morning', status: 'in_progress', auto_closed: false,
    started_at: '2026-07-29T09:00:00', last_ping_at: '2026-07-29T09:00:00',
    last_lat: 22.6, last_lng: 120.3, ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete (window as unknown as { google?: unknown }).google
  installLeafletMock()
  s.routes.value = [{ id: 3, name: 'A 線', is_active: true }]
  s.selectedRouteId.value = 3
  s.trip.value = null
  s.stops.value = []
  s.loading.value = false
  s.snapshotFailed.value = false
  s.rosterOutOfSync.value = false
  s.stale.value = false
  s.reconnecting.value = false
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('BusMonitorView 地圖 provider', () => {
  it('未設 Google 金鑰時用 Leaflet + OpenStreetMap', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    s.trip.value = inProgressTrip()

    mountView()
    await flushPromises()

    expect(L.map).toHaveBeenCalledTimes(1)
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining('tile.openstreetmap.org'),
      expect.anything(),
    )
  })

  it('設了金鑰且 SDK 可用時改用 Google Maps，不再建 Leaflet 地圖', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const gmaps = installGoogleMapsMock()
    s.trip.value = inProgressTrip()

    mountView()
    await flushPromises()

    expect(gmaps.Map).toHaveBeenCalledTimes(1)
    expect(L.map).not.toHaveBeenCalled()
  })

  it('Google SDK 載不起來時退回 Leaflet（金鑰有設但 SDK 不存在）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    // 不安裝 window.google：載入器插入 script 後 happy-dom 立刻回 error
    s.trip.value = inProgressTrip()

    mountView()
    await flushPromises()

    expect(L.map).toHaveBeenCalledTimes(1)
  })

  it('位置更新只移動 marker，**不得**重建 Google 地圖（每建一次就計費一次）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const gmaps = installGoogleMapsMock()
    s.trip.value = inProgressTrip()

    mountView()
    await flushPromises()
    expect(gmaps.Map).toHaveBeenCalledTimes(1)

    s.trip.value = inProgressTrip({ last_lat: 22.61, last_lng: 120.31 })
    await flushPromises()
    s.trip.value = inProgressTrip({ last_lat: 22.62, last_lng: 120.32 })
    await flushPromises()

    expect(gmaps.Map).toHaveBeenCalledTimes(1)
    const busMarker = gmaps.Marker.mock.instances[0] as unknown as { setPosition: ReturnType<typeof vi.fn> }
    expect(busMarker.setPosition).toHaveBeenCalled()
  })

  it('Google 模式下站點也要畫出來（否則管理者看不到接送順序）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const gmaps = installGoogleMapsMock()
    s.trip.value = inProgressTrip()
    s.stops.value = [
      { seq: 1, student_name: '小明', lat: 22.61, lng: 120.31, stop_status: 'pending' },
      { seq: 2, student_name: '小華', lat: 22.62, lng: 120.32, stop_status: 'pending' },
    ]

    mountView()
    await flushPromises()

    // 娃娃車 1 個 + 站點 2 個
    expect(gmaps.Marker).toHaveBeenCalledTimes(3)
  })

  it('地圖收起時丟掉 Google 實例，恢復顯示時重建（容器 DOM 已換新）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const gmaps = installGoogleMapsMock()
    s.trip.value = inProgressTrip()

    mountView()
    await flushPromises()
    expect(gmaps.Map).toHaveBeenCalledTimes(1)

    s.stale.value = true
    await flushPromises()
    s.stale.value = false
    await flushPromises()

    expect(gmaps.Map).toHaveBeenCalledTimes(2)
  })
})

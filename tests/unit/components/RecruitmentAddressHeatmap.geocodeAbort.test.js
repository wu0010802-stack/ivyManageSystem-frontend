import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// F5：handleGeocodeCompetitors 的 while(true) 批次 loop 在元件卸載後應中止，
// 不再對已銷毀元件繼續打 geocode API。

// ── Leaflet mock（與既有測試一致，避免 import 真實地圖庫）──
const mockMap = {
  remove: vi.fn(), fitBounds: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn(),
  on: vi.fn(() => mockMap), off: vi.fn(() => mockMap),
  getBounds: vi.fn(() => ({ getSouth: () => 0, getWest: () => 0, getNorth: () => 1, getEast: () => 1 })),
  getZoom: vi.fn(() => 13),
}
const mockLayer = { addTo: vi.fn(() => mockLayer), addLayer: vi.fn(), clearLayers: vi.fn() }
vi.mock('leaflet', () => {
  const L = {
    map: vi.fn(() => mockMap),
    tileLayer: vi.fn(() => mockLayer),
    layerGroup: vi.fn(() => mockLayer),
    markerClusterGroup: vi.fn(() => mockLayer),
    circleMarker: vi.fn(() => ({ bindPopup: vi.fn().mockReturnThis() })),
    circle: vi.fn(() => ({ bindPopup: vi.fn().mockReturnThis() })),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ bindPopup: vi.fn().mockReturnThis(), addListener: vi.fn() })),
  }
  return { default: L, ...L }
})
vi.mock('leaflet.markercluster', () => ({}))

// ── recruitment API mock：用可控的 deferred 控制每批 geocode 何時 resolve ──
let pendingResolvers = []
const geocodeCompetitorSchools = vi.fn(() => {
  return new Promise((resolve) => {
    pendingResolvers.push(resolve)
  })
})
const getGeocodePendingCount = vi.fn(() => Promise.resolve({ data: { pending: 5 } }))
const getGovKindergartensSyncStatus = vi.fn(() =>
  // last_synced_at 設為「現在」→ isGovSyncStale() 為 false → 不觸發 handleGovSync，
  // 直接走 autoGeocodeIfNeeded（避免 govSyncing 擋掉 geocode）
  Promise.resolve({
    data: { last_synced_at: new Date().toISOString(), sync_in_progress: false, last_sync_status: 'ok' },
  }),
)
const syncKiangData = vi.fn(() => Promise.resolve({ data: {} }))
const syncGovKindergartens = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('@/api/recruitment', () => ({
  geocodeCompetitorSchools: (...a) => geocodeCompetitorSchools(...a),
  getGeocodePendingCount: (...a) => getGeocodePendingCount(...a),
  getGovKindergartensSyncStatus: (...a) => getGovKindergartensSyncStatus(...a),
  syncKiangData: (...a) => syncKiangData(...a),
  syncGovKindergartens: (...a) => syncGovKindergartens(...a),
  getGovKindergartens: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))

// 解掉最後一批，模擬「還有更多待處理」，loop 會排下一批
function resolveLastBatchKeepGoing() {
  const r = pendingResolvers.shift()
  if (r) r({ data: { geocoded: 10, failed: 0, total: 500 } })
}

import RecruitmentAddressHeatmap from '@/components/recruitment/RecruitmentAddressHeatmap.vue'

const ElStub = { template: '<div><slot /></div>' }

function mountComponent() {
  return mount(RecruitmentAddressHeatmap, {
    props: {
      hotspots: [],
      recordsWithAddress: 0,
      geocodedHotspots: 0,
      pendingHotspots: 0,
      staleHotspots: 0,
      failedHotspots: 0,
      providerAvailable: true,
      providerName: 'nominatim',
      schoolLat: 22.64,
      schoolLng: 120.32,
      canWrite: true,
      syncingMode: '',
      fmtPct: () => '0%',
      nearbySchools: [],
      nearbySchoolsLoading: false,
      nearbySchoolsAvailable: true,
      nearbySchoolsMessage: '',
    },
    global: {
      stubs: {
        'el-button': ElStub, 'el-empty': ElStub, 'el-tag': ElStub,
        'el-select': ElStub, 'el-option': ElStub, 'el-input': ElStub,
        'el-icon': ElStub,
      },
    },
  })
}

describe('RecruitmentAddressHeatmap geocode loop 卸載中止（F5）', () => {
  beforeEach(() => {
    pendingResolvers = []
    vi.clearAllMocks()
    getGeocodePendingCount.mockResolvedValue({ data: { pending: 5 } })
  })
  afterEach(() => {
    pendingResolvers = []
  })

  it('卸載後不再排下一批 geocode（while loop 中止）', async () => {
    const wrapper = mountComponent()
    await flushPromises() // onMounted → fetchGovSyncStatus → autoGeocodeIfNeeded → handleGeocodeCompetitors

    // 第一批已發出（在 await geocodeCompetitorSchools 暫停）
    expect(geocodeCompetitorSchools).toHaveBeenCalledTimes(1)

    // 完成第一批 → loop 因 total>0 會排第二批
    resolveLastBatchKeepGoing()
    await flushPromises()
    expect(geocodeCompetitorSchools).toHaveBeenCalledTimes(2)

    // 卸載元件（loop 仍在第二批 await 中暫停）
    wrapper.unmount()

    // 完成第二批 → 若無中止旗標會排第三批；有旗標則 break
    resolveLastBatchKeepGoing()
    await flushPromises()

    expect(geocodeCompetitorSchools).toHaveBeenCalledTimes(2) // 沒有第三批
  })
})

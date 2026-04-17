import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const leafletHandlers = {}
const mockMap = {
  remove: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
  invalidateSize: vi.fn(),
  on: vi.fn((event, handler) => {
    leafletHandlers[event] = handler
    return mockMap
  }),
  off: vi.fn((event) => {
    delete leafletHandlers[event]
    return mockMap
  }),
  getBounds: vi.fn(() => ({
    getSouth: () => 22.62,
    getWest: () => 120.29,
    getNorth: () => 22.69,
    getEast: () => 120.35,
  })),
  getZoom: vi.fn(() => 13),
}

const mockTileLayer = {
  addTo: vi.fn(() => mockTileLayer),
}

const mockMarkerLayer = {
  addLayer: vi.fn(),
  clearLayers: vi.fn(),
  addTo: vi.fn(() => mockMarkerLayer),
}

const leafletMap = vi.fn(() => mockMap)
const leafletTileLayer = vi.fn(() => mockTileLayer)
const leafletLayerGroup = vi.fn(() => mockMarkerLayer)
const circleMarker = vi.fn(() => ({
  bindPopup: vi.fn().mockReturnThis(),
}))
const circle = vi.fn(() => ({
  bindPopup: vi.fn().mockReturnThis(),
}))
const divIcon = vi.fn(() => ({}))
const leafletMarker = vi.fn(() => ({
  bindPopup: vi.fn().mockReturnThis(),
  addListener: vi.fn(),
}))

vi.mock('leaflet', () => ({
  default: {
    map: leafletMap,
    tileLayer: leafletTileLayer,
    layerGroup: leafletLayerGroup,
    circleMarker,
    circle,
    divIcon,
    marker: leafletMarker,
  },
  map: leafletMap,
  tileLayer: leafletTileLayer,
  layerGroup: leafletLayerGroup,
  circleMarker,
  circle,
  divIcon,
  marker: leafletMarker,
}))

const ElButton = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { class: 'el-button', onClick: () => emit('click') }, slots.default?.())
  },
})

const ElEmpty = defineComponent({
  name: 'ElEmpty',
  props: ['description'],
  setup(props) {
    return () => h('div', { class: 'el-empty' }, props.description)
  },
})

const ElTag = defineComponent({
  name: 'ElTag',
  setup(_props, { slots }) {
    return () => h('span', { class: 'el-tag' }, slots.default?.())
  },
})

const ElSelect = defineComponent({
  name: 'ElSelect',
  props: ['modelValue', 'placeholder', 'size', 'clearable'],
  emits: ['update:modelValue', 'change'],
  setup(_props, { slots }) {
    return () => h('select', { class: 'el-select' }, slots.default?.())
  },
})

const ElOption = defineComponent({
  name: 'ElOption',
  props: ['label', 'value'],
  setup(props) {
    return () => h('option', { value: props.value }, props.label)
  },
})

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 20))
}

const loadComponent = async (googleMapsApiKey = '') => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', googleMapsApiKey)
  vi.resetModules()
  const module = await import('@/components/recruitment/RecruitmentAddressHeatmap.vue')
  return module.default
}

beforeEach(() => {
  delete window.google
  Object.keys(leafletHandlers).forEach((key) => delete leafletHandlers[key])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('RecruitmentAddressHeatmap', () => {
  it('initializes the map after async hotspot data inserts the map container', async () => {
    const RecruitmentAddressHeatmap = await loadComponent()
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()
    circle.mockClear()

    const wrapper = mount(RecruitmentAddressHeatmap, {
      props: {
        hotspots: [],
        recordsWithAddress: 2,
        totalHotspots: 2,
        geocodedHotspots: 0,
        pendingHotspots: 2,
        staleHotspots: 0,
        failedHotspots: 0,
        providerAvailable: true,
        providerName: 'nominatim',
        schoolLat: 22.6420,
        schoolLng: 120.3243,
        canWrite: true,
        syncingMode: '',
        fmtPct: (deposit, visit) => (visit ? `${(deposit / visit * 100).toFixed(1)}%` : '0%'),
        nearbySchools: [],
        nearbySchoolsLoading: false,
        nearbySchoolsAvailable: true,
        nearbySchoolsMessage: '',
      },
      global: {
        components: { ElButton, ElEmpty, ElTag, ElSelect, ElOption },
      },
    })

    await flushPromises()
    expect(leafletMap).not.toHaveBeenCalled()

    await wrapper.setProps({
      hotspots: [
        {
          address: '高雄市三民區九如一路819號',
          formatted_address: '819號, 九如一路, 安發里, 三民區, 高雄市, 807, 臺灣',
          district: '三民區',
          visit: 2,
          deposit: 2,
          lat: 22.6396127,
          lng: 120.3201354,
          geocode_status: 'resolved',
        },
      ],
      geocodedHotspots: 1,
      pendingHotspots: 1,
    })
    await flushPromises()

    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    // 2026-04 重構：舊版 UI label「地圖：OpenStreetMap」已改為說明句。
    expect(wrapper.text()).toContain('OpenStreetMap')
  })

  it('renders nearby schools, emits sync requests, and uses smaller hotspot circles', async () => {
    const RecruitmentAddressHeatmap = await loadComponent()
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()
    circle.mockClear()

    // 以 URL-based mock 統一管理 fetch：
    //   - kiang.github.io/preschools.json → 解析成功（供 loadPreschoolFeatures 快取）
    //   - kiang.github.io/punish_all.json → 解析成功（供 loadPunish 快取）
    //   - 其餘（後端 API）→ 快速拒絕，讓 loadGovDbData 立即失敗並重置 promise
    const mockPreschoolFeature = {
      type: 'Feature',
      properties: {
        title: '高雄市三民區私立本園旁幼兒園',
        owner: '王小明',
        tel: '07-3881234',
        address: '[807]高雄市三民區民族一路100號',
        type: '私立',
        city: '高雄市',
        count_approved: '300',
        monthly: 11057,
        is_active: 1,
      },
      geometry: { type: 'Point', coordinates: [120.3209, 22.6461] },
    }
    // kiang 前端查詢已移到後端，不再需要 mock preschools.json / punish_all.json
    global.fetch = vi.fn(() => Promise.reject(new Error('fetch blocked in test')))

    const wrapper = mount(RecruitmentAddressHeatmap, {
      props: {
        hotspots: [
          {
            address: '高雄市三民區民族一路100號',
            formatted_address: 'TW 高雄市三民區民族一路100號',
            district: '三民區',
            visit: 3,
            deposit: 2,
            lat: 22.6461,
            lng: 120.3209,
            geocode_status: 'resolved',
          },
          {
            address: '高雄市鳳山區光遠路50號',
            district: '鳳山區',
            visit: 1,
            deposit: 0,
            geocode_status: 'pending',
          },
        ],
        recordsWithAddress: 4,
        totalHotspots: 2,
        geocodedHotspots: 1,
        pendingHotspots: 1,
        staleHotspots: 2,
        failedHotspots: 0,
        providerAvailable: true,
        providerName: 'google',
        schoolLat: 22.6420,
        schoolLng: 120.3243,
        canWrite: true,
        syncingMode: '',
        fmtPct: (deposit, visit) => (visit ? `${(deposit / visit * 100).toFixed(1)}%` : '0%'),
        nearbySchools: [
          {
            place_id: 'place-1',
            name: '本園旁幼兒園',
            formatted_address: '高雄市三民區民族一路100號',
            lat: 22.6461,
            lng: 120.3209,
            distance_km: 0,
            google_maps_uri: 'https://maps.google.com/?cid=1',
            school_type: '私立',
            owner_name: '王小明',
            phone: '07-3881234',
            approved_capacity: 300,
            monthly_fee: 11057,
            has_penalty: false,
            indoor_area_sqm: 200,
            outdoor_area_sqm: 100,
          },
          {
            place_id: 'place-2',
            name: '另一間幼兒園',
            formatted_address: '高雄市三民區建國一路10號',
            lat: 22.6401,
            lng: 120.3159,
            distance_km: 1.1,
            google_maps_uri: 'https://maps.google.com/?cid=2',
          },
        ],
        nearbySchoolsLoading: false,
        nearbySchoolsAvailable: true,
        nearbySchoolsMessage: '',
      },
      global: {
        components: { ElButton, ElEmpty, ElTag, ElSelect, ElOption },
      },
    })

    await flushPromises()

    // 2026-04 重構：移除「Geocoding：GOOGLE」「地圖：OpenStreetMap」label 與
    // viewport-change 事件；改為顯示說明句，OpenStreetMap 字樣仍保留於狀態說明。
    expect(wrapper.text()).toContain('OpenStreetMap')
    // 模板已從「個待升級」改為「待升級」
    expect(wrapper.text()).toContain('待升級')
    // 熱點的 formatted_address 現在只顯示在地圖彈出視窗，不在側邊欄
    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    expect(wrapper.vm.mappedHotspotCount).toBe(1)
    expect(wrapper.vm.mapRenderRequested).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('附近幼兒園')
    expect(wrapper.text()).toContain('本園旁幼兒園')
    expect(wrapper.text()).toContain('目前視野 2 間')
    // 熱點 marker 使用 radius: 3 渲染
    expect(
      circleMarker.mock.calls.some(([, options]) => options?.radius === 3)
    ).toBe(true)

    const buttons = wrapper.findAll('button')
    // 2026-04 重構：「全台幼兒園地圖切換」按鈕已移除。
    // 當前 DOM 順序：
    // 0: sync incremental ("同步全部地址")
    // 1: sync resync_google ("Google 重同步")
    // 2: 詳細資料(school[0])
    // 3: 詳細資料(school[1])
    expect(buttons).toHaveLength(4)

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('sync')).toEqual([
      ['incremental'],
      ['resync_google'],
    ])

    // 點第一所學校的「詳細資料」展開政府資料面板
    // fetch mock 已在掛載前設定（URL-based），preschool/punish 資料已快取
    await buttons[2].trigger('click')
    await flushPromises()
    const govDetail = wrapper.find('.preschool-gov-detail')
    expect(govDetail.exists()).toBe(true)
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('私立')
  })

  it('falls back to OpenStreetMap when Google Maps SDK fails to load', async () => {
    const RecruitmentAddressHeatmap = await loadComponent('broken-browser-key')
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()
    circle.mockClear()

    const appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          node.dispatchEvent(new Event('error'))
        }, 0)
      }
      return node
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const wrapper = mount(RecruitmentAddressHeatmap, {
      props: {
        hotspots: [
          {
            address: '高雄市三民區民族一路100號',
            formatted_address: 'TW 高雄市三民區民族一路100號',
            district: '三民區',
            visit: 2,
            deposit: 1,
            lat: 22.6461,
            lng: 120.3209,
            geocode_status: 'resolved',
          },
        ],
        campus: {
          campus_name: '本園',
          campus_address: '高雄市三民區民族一路100號',
          campus_lat: 22.6420,
          campus_lng: 120.3243,
          travel_mode: 'driving',
        },
        recordsWithAddress: 2,
        totalHotspots: 1,
        geocodedHotspots: 1,
        pendingHotspots: 0,
        staleHotspots: 0,
        failedHotspots: 0,
        providerAvailable: true,
        providerName: 'google',
        schoolLat: 22.6420,
        schoolLng: 120.3243,
        canWrite: true,
        syncingMode: '',
        fmtPct: (deposit, visit) => (visit ? `${(deposit / visit * 100).toFixed(1)}%` : '0%'),
        nearbySchools: [],
        nearbySchoolsLoading: false,
        nearbySchoolsAvailable: true,
        nearbySchoolsMessage: '',
      },
      global: {
        components: { ElButton, ElEmpty, ElTag, ElSelect, ElOption },
      },
    })

    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    // 2026-04 重構：舊版 label「地圖：OpenStreetMap」已移除，fallback 說明保留。
    expect(wrapper.text()).toContain('Google Maps 載入失敗，已自動改用 OpenStreetMap。')
    expect(leafletMap).toHaveBeenCalledTimes(1)
    // 確認 Google Maps 失敗警告有被記錄（不限制總次數，因元件可能有其他 Vue 警告）
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Google Maps SDK 載入失敗'),
      expect.anything(),
    )

    warnSpy.mockRestore()
    appendChildSpy.mockRestore()
  })
})

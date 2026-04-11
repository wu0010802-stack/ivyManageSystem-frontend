import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const leafletHandlers = {}
const mockMap = {
  remove: vi.fn(),
  fitBounds: vi.fn(),
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

vi.mock('leaflet', () => ({
  default: {
    map: leafletMap,
    tileLayer: leafletTileLayer,
    layerGroup: leafletLayerGroup,
    circleMarker,
    circle,
  },
  map: leafletMap,
  tileLayer: leafletTileLayer,
  layerGroup: leafletLayerGroup,
  circleMarker,
  circle,
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

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 20))
}

const loadComponent = async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
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
        components: { ElButton, ElEmpty, ElTag },
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
    expect(wrapper.text()).toContain('地圖：OpenStreetMap')
  })

  it('renders nearby schools, emits sync requests, and uses smaller hotspot circles', async () => {
    const RecruitmentAddressHeatmap = await loadComponent()
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()
    circle.mockClear()

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
        components: { ElButton, ElEmpty, ElTag },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Geocoding：GOOGLE')
    expect(wrapper.text()).toContain('地圖：OpenStreetMap')
    expect(wrapper.text()).toContain('個待升級')
    expect(wrapper.text()).toContain('TW 高雄市三民區民族一路100號')
    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    expect(wrapper.vm.mappedHotspotCount).toBe(1)
    expect(wrapper.vm.mapRenderRequested).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('附近幼兒園')
    expect(wrapper.text()).toContain('本園旁幼兒園')
    expect(wrapper.text()).toContain('目前視野 2 間')
    expect(
      circleMarker.mock.calls.some(([, options]) => options?.radius === 12)
    ).toBe(true)
    expect(wrapper.emitted('viewport-change')?.at(-1)?.[0]).toEqual({
      south: 22.62,
      west: 120.29,
      north: 22.69,
      east: 120.35,
      zoom: 13,
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('sync')).toEqual([
      ['incremental'],
      ['resync_google'],
    ])
  })
})

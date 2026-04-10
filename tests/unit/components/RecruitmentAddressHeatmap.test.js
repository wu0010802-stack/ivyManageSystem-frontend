import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const mockMap = {
  remove: vi.fn(),
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
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

vi.mock('leaflet', () => ({
  default: {
    map: leafletMap,
    tileLayer: leafletTileLayer,
    layerGroup: leafletLayerGroup,
    circleMarker,
  },
  map: leafletMap,
  tileLayer: leafletTileLayer,
  layerGroup: leafletLayerGroup,
  circleMarker,
}))

import RecruitmentAddressHeatmap from '@/components/recruitment/RecruitmentAddressHeatmap.vue'

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
}

describe('RecruitmentAddressHeatmap', () => {
  it('initializes the map after async hotspot data inserts the map container', async () => {
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()

    const wrapper = mount(RecruitmentAddressHeatmap, {
      props: {
        hotspots: [],
        recordsWithAddress: 2,
        totalHotspots: 2,
        geocodedHotspots: 0,
        pendingHotspots: 2,
        failedHotspots: 0,
        providerAvailable: true,
        providerName: 'nominatim',
        schoolLat: 22.6420,
        schoolLng: 120.3243,
        canWrite: true,
        syncing: false,
        fmtPct: (deposit, visit) => (visit ? `${(deposit / visit * 100).toFixed(1)}%` : '0%'),
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
    expect(wrapper.vm.mapRenderRequested).toBeGreaterThan(0)
  })

  it('renders a real map summary and emits sync requests', async () => {
    leafletMap.mockClear()
    leafletTileLayer.mockClear()
    leafletLayerGroup.mockClear()
    circleMarker.mockClear()

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
        failedHotspots: 0,
        providerAvailable: true,
        providerName: 'google',
        schoolLat: 22.6420,
        schoolLng: 120.3243,
        canWrite: true,
        syncing: false,
        fmtPct: (deposit, visit) => (visit ? `${(deposit / visit * 100).toFixed(1)}%` : '0%'),
      },
      global: {
        components: { ElButton, ElEmpty, ElTag },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Geocoding：GOOGLE')
    expect(wrapper.text()).toContain('TW 高雄市三民區民族一路100號')
    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    expect(wrapper.vm.mappedHotspotCount).toBe(1)
    expect(wrapper.vm.mapInitialized).toBe(true)

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('sync')).toHaveLength(1)
  })
})

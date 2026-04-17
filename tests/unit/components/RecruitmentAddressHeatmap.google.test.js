import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

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

const installGoogleMapsMock = () => {
  const maps = {}

  maps.SymbolPath = { CIRCLE: 'CIRCLE' }
  maps.Point = vi.fn(function MockPoint(x, y) { this.x = x; this.y = y })
  maps.Size = vi.fn(function MockSize(w, h) { this.width = w; this.height = h })
  maps.LatLngBounds = vi.fn(function MockLatLngBounds() {
    this.extend = vi.fn()
  })
  maps.Map = vi.fn(function MockMap(_element, options) {
    this.options = options
    this.listeners = {}
    this.fitBounds = vi.fn()
    this.setCenter = vi.fn()
    this.setZoom = vi.fn()
    this.getZoom = vi.fn(() => 13)
    this.getBounds = vi.fn(() => ({
      getSouthWest: () => ({ lat: () => 22.62, lng: () => 120.29 }),
      getNorthEast: () => ({ lat: () => 22.69, lng: () => 120.35 }),
    }))
    this.addListener = vi.fn((event, handler) => {
      this.listeners[event] = handler
    })
  })
  maps.InfoWindow = vi.fn(function MockInfoWindow() {
    this.setContent = vi.fn()
    this.setPosition = vi.fn()
    this.open = vi.fn()
    this.close = vi.fn()
  })
  maps.Marker = vi.fn(function MockMarker(options) {
    this.options = options
    this.listeners = {}
    this.addListener = vi.fn((event, handler) => {
      this.listeners[event] = handler
    })
    this.getPosition = vi.fn(() => options.position)
    this.setMap = vi.fn()
  })
  maps.Circle = vi.fn(function MockCircle(options) {
    this.options = options
    this.listeners = {}
    this.addListener = vi.fn((event, handler) => {
      this.listeners[event] = handler
    })
    this.getCenter = vi.fn(() => options.center)
    this.setMap = vi.fn()
  })

  window.google = { maps }
  return maps
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  delete window.google
})

describe('RecruitmentAddressHeatmap Google Maps mode', () => {
  it('uses Google Maps when browser api key is present', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-browser-key')
    vi.resetModules()
    const maps = installGoogleMapsMock()

    const { default: RecruitmentAddressHeatmap } = await import('@/components/recruitment/RecruitmentAddressHeatmap.vue')

    const wrapper = mount(RecruitmentAddressHeatmap, {
      props: {
        hotspots: [
          {
            address: '高雄市三民區民族一路100號',
            formatted_address: 'Google 高雄市三民區民族一路100號',
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

    // 2026-04 重構：移除舊版 label「地圖：Google Maps」與 viewport-change 事件，
    // 改為內文說明句（含 Google Maps 字樣）。
    expect(wrapper.text()).toContain('Google Maps')
    expect(wrapper.find('.heatmap-map').exists()).toBe(true)
    expect(maps.Map).toHaveBeenCalledTimes(1)
    expect(maps.Marker).toHaveBeenCalled()
    // 新版改用 Marker + SVG icon 取代 Circle，不再呼叫 mapsApi.Circle
    expect(wrapper.text()).toContain('附近幼兒園')
  })
})

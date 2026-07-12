<template>
  <div class="heatmap-shell">
    <div class="heatmap-toolbar">
      <div class="heatmap-toolbar-top">
        <!-- 統計概覽 -->
        <div class="heatmap-summary">
          <div class="summary-pill">
            <strong>{{ recordsWithAddress }}</strong>
            <span>有地址筆數</span>
          </div>
          <div class="summary-pill">
            <strong>{{ geocodedHotspots }}</strong>
            <span>已定位</span>
          </div>
          <div v-if="pendingHotspots > 0" class="summary-pill summary-pill--warn">
            <strong>{{ pendingHotspots }}</strong>
            <span>待同步</span>
          </div>
          <div v-if="staleHotspots > 0" class="summary-pill summary-pill--warn">
            <strong>{{ staleHotspots }}</strong>
            <span>待升級</span>
          </div>
          <div class="summary-pill">
            <strong>{{ nearbySchoolCount }}</strong>
            <span>視野幼兒園</span>
          </div>
        </div>

        <!-- 操作按鈕：僅在需要手動介入時顯示 -->
        <div v-if="canWrite && (needsIncrementalSync || staleHotspots > 0)" class="heatmap-actions">
          <el-button
            v-if="needsIncrementalSync"
            type="primary"
            size="small"
            :loading="syncingMode === 'incremental'"
            @click="emit('sync', 'incremental')"
          >同步全部地址</el-button>
          <el-button
            v-if="staleHotspots > 0"
            size="small"
            :loading="syncingMode === 'resync_google'"
            @click="emit('sync', 'resync_google')"
          >Google 重同步</el-button>
        </div>
      </div>

      <!-- 狀態列：精簡合併 -->
      <div class="heatmap-status-bar">
        <span class="status-item">
          <span class="status-dot" :class="providerAvailable ? 'status-dot--ok' : 'status-dot--off'" />
          {{ mapProviderLabel }}
        </span>
        <span v-if="govSyncing" class="status-item status-item--busy">
          教育部同步中…
        </span>
        <span v-else-if="govSyncMessage" class="status-item status-item--error">
          {{ govSyncMessage }}
        </span>
        <span v-else-if="govSyncedAtLabel" class="status-item">
          教育部 {{ govSyncedAtLabel }}
          <a v-if="canWrite" class="status-action" @click.prevent="handleGovSync">更新</a>
        </span>
        <span v-else-if="canWrite" class="status-item">
          <a class="status-action" @click.prevent="handleGovSync">同步教育部資料</a>
        </span>
        <span v-if="geocodingCompetitors" class="status-item status-item--busy">
          座標補全中… {{ geocodeCompetitorResult }}
        </span>
        <span v-else-if="geocodeCompetitorResult" class="status-item status-item--ok">
          {{ geocodeCompetitorResult }}
        </span>
        <span v-if="syncingMode" class="status-item status-item--busy">
          {{ syncingLabel }}
        </span>
      </div>
    </div>

    <div class="heatmap-layout">
      <div class="heatmap-stage">
        <div v-if="mapReady" ref="mapRef" class="heatmap-map" />
        <el-empty v-else :description="emptyDescription" />
      </div>

      <div class="heatmap-side">
        <RecruitmentNearbySchoolList
          :schools="nearbySchools"
          :loading="nearbySchoolsLoading"
          :available="nearbySchoolsAvailable"
          :message="nearbySchoolsMessage"
          @select-school="handleSelectSchool"
          @set-as-campus="(data) => emit('set-as-campus', data)"
        />
      </div>
    </div>

    <div class="heatmap-note">
      <template v-if="providerAvailable">
        說明：橘色點位為家長來源地址。按上方按鈕後，系統會自動分批同步到完成，不需要重複點擊。
        <span v-if="staleHotspots > 0">目前有 {{ staleHotspots }} 筆舊 provider / 失敗快取，可用 Google 重同步升級。</span>
        <span v-if="mapFallbackMessage">{{ mapFallbackMessage }}</span>
      </template>
      <template v-else>
        說明：尚未設定地理服務。後端可設 `GOOGLE_MAPS_API_KEY` 讓招生生活圈改走 Google Geocoding / Routes；若暫時不接 Google，再設 `GEOCODING_PROVIDER=nominatim` 後重新同步。
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
// kiang 前端查詢已移除，所有資料由 nearby-kindergartens API 一次回傳
import { syncKiangData } from '@/api/recruitment'
import { sanitizeHref } from '@/utils/url'
import type { NearbySchool } from '@/types/recruitmentHeatmap'
import { DEFAULT_SCHOOL_STYLE, getSchoolType, getSchoolTypeStyle } from '@/utils/recruitmentSchoolType'
import { useGovKindergartenSync } from '@/composables/useGovKindergartenSync'
import { useCompetitorGeocoding } from '@/composables/useCompetitorGeocoding'
// 顯式 import：新元件尚未跑過一次 vite dev/build，unplugin-vue-components 的
// components.d.ts 全域自動註冊還沒收錄它，顯式 import 才能讓 vue-tsc 正確解析型別。
import RecruitmentNearbySchoolList from './RecruitmentNearbySchoolList.vue'

interface CampusProp {
  campus_name?: string
  campus_address?: string
  campus_lat?: number | null
  campus_lng?: number | null
  travel_mode?: string
  [key: string]: unknown
}

interface HotspotEntry {
  address?: string
  lat?: number
  lng?: number
  visit?: number
  [key: string]: unknown
}

interface BucketEntry {
  center_lat: number
  center_lng: number
  district: string
  visit_count: number
  deposit_count: number
}

// Minimal typings for third-party map APIs (no @types/leaflet or google.maps declarations available)
// Using unknown with casts is the TS-safe way to handle dynamic map API objects.
declare global { interface Window { google?: { maps?: Record<string, unknown> } } }

const props = withDefaults(defineProps<{
  hotspots: HotspotEntry[]
  buckets?: BucketEntry[]
  districtResidualVisits?: Record<string, number>
  campus?: CampusProp
  travelBands?: number[]
  selectedDistrict?: string
  recordsWithAddress: number
  totalHotspots?: number
  geocodedHotspots?: number
  pendingHotspots?: number
  staleHotspots?: number
  failedHotspots?: number
  providerAvailable?: boolean
  providerName?: string | null
  nearbySchools?: NearbySchool[]
  nearbySchoolsLoading?: boolean
  nearbySchoolsAvailable?: boolean
  nearbySchoolsMessage?: string
  schoolLat: number
  schoolLng: number
  canWrite?: boolean
  syncingMode?: string
  fmtPct: (...args: unknown[]) => unknown
}>(), {
  campus: () => ({
    campus_name: '本園',
    campus_address: '',
    campus_lat: null,
    campus_lng: null,
    travel_mode: 'driving',
  }),
  travelBands: () => [10, 15, 20],
  selectedDistrict: '',
  totalHotspots: 0,
  geocodedHotspots: 0,
  pendingHotspots: 0,
  staleHotspots: 0,
  failedHotspots: 0,
  providerAvailable: false,
  providerName: null,
  nearbySchools: () => [],
  nearbySchoolsLoading: false,
  nearbySchoolsAvailable: false,
  nearbySchoolsMessage: '',
  canWrite: false,
  syncingMode: '',
  buckets: () => [],
  districtResidualVisits: () => ({}),
})

const emit = defineEmits<{
  'sync': [mode?: string]
  'set-as-campus': [data: Record<string, unknown>]
}>()

// ── 教育部幼兒園資料同步 + 競爭者學校批次地理編碼 ──
// 2026-07-12 拆分為 composable（useGovKindergartenSync / useCompetitorGeocoding），
// 行為零改動：原本「教育部同步完成後自動檢查是否需要補全座標」的串接改用
// onSyncComplete 回呼保留，其餘輪詢間隔 / while(true) 批次 loop / 卸載中止旗標邏輯逐行搬移。
const {
  geocodingCompetitors,
  geocodeCompetitorResult,
  autoGeocodeIfNeeded,
} = useCompetitorGeocoding(computed(() => props.canWrite))

const {
  govSyncing,
  govSyncMessage,
  govSyncedAtLabel,
  fetchGovSyncStatus,
  handleGovSync,
  isGovSyncStale,
} = useGovKindergartenSync({ onSyncComplete: () => autoGeocodeIfNeeded() })

const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL
  || 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
const MAP_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION
  || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const MAP_TILE_SUBDOMAINS = import.meta.env.VITE_MAP_TILE_URL ? 'abc' : 'abcd'
const GOOGLE_MAPS_BROWSER_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()

// ── Google Maps 極簡底圖樣式（Silver） ──
const GOOGLE_MAP_STYLE = [
  { elementType: 'geometry',              stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon',           stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',      stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke',    stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi',         elementType: 'geometry',          stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi',         elementType: 'labels.text.fill',  stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park',    elementType: 'geometry',          stylers: [{ color: '#d5e8d4' }] },
  { featureType: 'poi.park',    elementType: 'labels.text.fill',  stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road',        elementType: 'geometry',          stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial',  elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway',   elementType: 'geometry',         stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway',   elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local',     elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line',   elementType: 'geometry',         stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station',elementType: 'geometry',         stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry',          stylers: [{ color: '#b3d9ea' }] },
  { featureType: 'water', elementType: 'labels.text.fill',  stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
]

// ── Google Maps：熱點 SVG 圖示（單一小圓點） ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeGoogleHotspotIcon = (mapsApi: any) => {
  const size = 8
  const cx = size / 2
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<circle cx="${cx}" cy="${cx}" r="${cx - 0.5}" fill="#f97316" stroke="#b45309" stroke-width="1" opacity="0.85"/>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(cx, cx),
    scaledSize: new mapsApi.Size(size, size),
  }
}

// ── Google Maps：本園圖釘 ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeGoogleSchoolIcon = (mapsApi: any) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">`,
    `<filter id="sh"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>`,
    `<path d="M15 0C6.716 0 0 6.716 0 15c0 10 15 23 15 23S30 25 30 15C30 6.716 23.284 0 15 0z"`,
    ` fill="#1e40af" stroke="#1e3a8a" stroke-width="1" filter="url(#sh)"/>`,
    `<circle cx="15" cy="14" r="7" fill="white" opacity="0.95"/>`,
    `<text x="15" y="18.5" text-anchor="middle" font-size="8" font-weight="900" fill="#1e40af" font-family="sans-serif">本園</text>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(15, 38),
    scaledSize: new mapsApi.Size(30, 38),
  }
}

// ── Google Maps：附近幼兒園圖示（依類型上色） ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeGoogleNearbySchoolIcon = (mapsApi: any, style = DEFAULT_SCHOOL_STYLE) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">`,
    `<circle cx="11" cy="11" r="10" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5" opacity="0.92"/>`,
    `<text x="11" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="white" font-family="sans-serif">幼</text>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(11, 11),
    scaledSize: new mapsApi.Size(22, 22),
  }
}

const mapRef = ref<HTMLElement | null>(null)
const mapInitialized = ref(false)
const mapRenderRequested = ref(0)
const googleMapsLoadFailed = ref(false)
const renderedMapProvider = ref('')
const prefersGoogleMap = Boolean(GOOGLE_MAPS_BROWSER_API_KEY)
const usingGoogleMap = computed(() => prefersGoogleMap && !googleMapsLoadFailed.value)
const mapProviderLabel = computed(() => usingGoogleMap.value ? 'Google Maps' : 'OpenStreetMap')
const mapFallbackMessage = computed(() => {
  if (usingGoogleMap.value) return ''
  if (googleMapsLoadFailed.value) return 'Google Maps 載入失敗，已自動改用 OpenStreetMap。'
  return '目前地圖底圖仍使用 OpenStreetMap；若要把前台地圖也切到 Google，前端再設 `VITE_GOOGLE_MAPS_API_KEY` 即可。'
})
const needsIncrementalSync = computed(() => props.providerAvailable && (props.pendingHotspots > 0 || props.failedHotspots > 0))
const nearbySchoolCount = computed(() => sortedNearbySchools.value.length)
const campusLat = computed(() => props.campus?.campus_lat ?? props.schoolLat)
const campusLng = computed(() => props.campus?.campus_lng ?? props.schoolLng)
const campusName = computed(() => props.campus?.campus_name || '本園')
const syncingLabel = computed(() =>
  props.syncingMode === 'resync_google' ? 'Google 全量升級中' : '地址全量同步中'
)

const mappedHotspots = computed(() =>
  props.hotspots
    .filter((hotspot) => Number.isFinite(hotspot.lat) && Number.isFinite(hotspot.lng))
    .sort((a, b) => (b.visit || 0) - (a.visit || 0))
)

const mappedHotspotCount = computed(() => mappedHotspots.value.length)
const mapReady = computed(() =>
  Number.isFinite(campusLat.value) && Number.isFinite(campusLng.value) && mappedHotspotCount.value > 0
)

const sortedNearbySchools = computed(() =>
  [...props.nearbySchools]
    .sort((a, b) => {
      const aDistance = Number.isFinite(a?.distance_km) ? (a.distance_km as number) : Number.POSITIVE_INFINITY
      const bDistance = Number.isFinite(b?.distance_km) ? (b.distance_km as number) : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) return aDistance - bDistance
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    })
)

const mappedNearbySchools = computed(() =>
  sortedNearbySchools.value.filter((school) => Number.isFinite(school.lat) && Number.isFinite(school.lng))
)

// API 已回傳 school_type / pre_public_type / phone / capacity 等欄位，
// 無需再對 govSchools 做 client-side 比對。
// getSchoolType／getSchoolTypeStyle 已抽到 @/utils/recruitmentSchoolType（地圖引擎與
// RecruitmentNearbySchoolList 共用，避免色票定義兩處漂移）。

const HIGHLIGHT_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">',
  '<filter id="hs"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.35"/></filter>',
  '<path d="M15 2C7.82 2 2 7.82 2 15c0 9.5 13 24 13 24s13-14.5 13-24C28 7.82 22.18 2 15 2z"',
  ' fill="#dc2626" stroke="#991b1b" stroke-width="1.5" filter="url(#hs)"/>',
  '<circle cx="15" cy="14" r="5" fill="white" opacity="0.95"/>',
  '</svg>',
].join('')

const panMapTo = (lat: number, lng: number, school: NearbySchool | null | undefined) => {
  if (!mapInstance || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  if (renderedMapProvider.value === 'google') {
    mapInstance.panTo({ lat, lng })
    mapInstance.setZoom(16)
    // 移動高亮標記
    if (highlightMarker) {
      highlightMarker.setPosition({ lat, lng })
      highlightMarker.setTitle(school?.name || '')
      highlightMarker.setVisible(true)
    } else if (googleMapsApi) {
      highlightMarker = new googleMapsApi.Marker({
        map: mapInstance,
        position: { lat, lng },
        title: school?.name || '',
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(HIGHLIGHT_SVG)}`,
          anchor: new googleMapsApi.Point(15, 42),
          scaledSize: new googleMapsApi.Size(30, 42),
        },
        zIndex: 1000,
      })
    }
  } else if (typeof mapInstance.setView === 'function') {
    mapInstance.setView([lat, lng], 16)
    // 移動高亮標記
    if (highlightMarker) {
      highlightMarker.setLatLng([lat, lng])
    } else if (leafletApi) {
      const icon = leafletApi.divIcon({
        className: '',
        html: HIGHLIGHT_SVG,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -44],
      })
      highlightMarker = leafletApi.marker([lat, lng], { icon, zIndexOffset: 1000 })
      highlightMarker.addTo(mapInstance)
    }
    if (school?.name && highlightMarker) {
      highlightMarker.bindPopup(`<strong>${escapeHtml(school.name)}</strong>`).openPopup()
    }
  }
}

// RecruitmentNearbySchoolList 的搜尋/排序/高亮 UI 已拆到子元件（自行處理「搜尋後僅剩一間
// 自動選取」邏輯），子元件透過 select-school 事件回呼，這裡統一轉呼叫地圖 panMapTo。
const handleSelectSchool = (school: NearbySchool) => {
  panMapTo(school.lat!, school.lng!, school)
}

const baseMapSignature = computed(() => [
  mappedHotspots.value.map((hotspot) => `${hotspot.address}:${hotspot.lat}:${hotspot.lng}:${hotspot.visit}`).join('|'),
  campusLat.value,
  campusLng.value,
].join('|'))

const nearbySchoolSignature = computed(() =>
  mappedNearbySchools.value.map((school) => `${school.place_id}:${school.lat}:${school.lng}:${school.distance_km}`).join('|')
)

// 學校類型標籤 signature：供 watch 偵測非同步載入完成後的地圖重繪
const schoolTypeSignature = computed(() =>
  mappedNearbySchools.value.map((s) => getSchoolType(s) ?? '').join(',')
)

const emptyDescription = computed(() => {
  if (!props.recordsWithAddress) return '目前沒有可用於熱點圖的地址資料'
  if (!props.providerAvailable) return '尚未設定 geocoding provider，暫時無法定位地址'
  if (needsIncrementalSync.value && props.canWrite) return '已有地址資料待同步座標，請先執行同步'
  if (props.failedHotspots > 0) return '部分地址無法定位，請檢查地址內容後重新同步'
  return '目前沒有可顯示於地圖的地址座標'
})

// These variables hold third-party map API instances (Leaflet / Google Maps).
// Neither library ships TypeScript declarations, so we use explicit `unknown` typing
// and cast at usage sites to satisfy `noImplicitAny`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleMapsPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleMapsApi: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mapInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tileLayer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let heatLayer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let markerLayer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let overlayLayer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nearbySchoolLayer: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleInfoWindow: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleOverlays: any[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlightMarker: any = null
let lastFittedBaseSignature = ''
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let leafletMoveHandler: any = null

const markGoogleMapsUnavailable = (error: unknown) => {
  if (!prefersGoogleMap || googleMapsLoadFailed.value) return
  googleMapsLoadFailed.value = true
  googleMapsApi = null
  googleMapsPromise = null
  document.querySelector('script[data-google-maps-sdk="true"]')?.remove()
  console.warn('[RecruitmentAddressHeatmap] Google Maps SDK 載入失敗，已改用 OpenStreetMap', error)
}

const ensureLeaflet = async () => {
  if (leafletApi) return leafletApi
  if (!leafletPromise) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – leaflet has no @types package in this project
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leafletPromise = import('leaflet').then(async (module: any) => {
      leafletApi = module.default ?? module
      // 載入 markercluster 插件：以 side-effect 擴展 leafletApi，提供 L.markerClusterGroup
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – leaflet.markercluster 無獨立 export，僅擴展 L
      await import('leaflet.markercluster')
      return leafletApi
    })
  }
  return leafletPromise
}

const ensureGoogleMaps = async () => {
  if (!usingGoogleMap.value) return null
  if (googleMapsApi) return googleMapsApi
  if (window.google?.maps) {
    googleMapsApi = window.google.maps
    return googleMapsApi
  }
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const resolveLoadedApi = () => {
        const api = window.google?.maps
        if (!api) {
          reject(new Error('Google Maps 載入失敗'))
          return
        }
        googleMapsApi = api
        resolve(api)
      }

      const handleError = () => reject(new Error('Google Maps SDK 載入失敗'))
      const existingScript = document.querySelector('script[data-google-maps-sdk="true"]')
      if (existingScript) {
        existingScript.addEventListener('load', resolveLoadedApi, { once: true })
        existingScript.addEventListener('error', handleError, { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_BROWSER_API_KEY)}&v=weekly&libraries=places&language=zh-TW&region=TW`
      script.async = true
      script.defer = true
      script.dataset.googleMapsSdk = 'true'
      script.addEventListener('load', resolveLoadedApi, { once: true })
      script.addEventListener('error', handleError, { once: true })
      document.head.appendChild(script)
    })
  }
  return googleMapsPromise
}

// onSetCampusSelect／toggleGovData／starClass／sqmToPing 已隨「設為本園中心點」select 與
// 政府登錄詳情面板一併拆到 RecruitmentNearbySchoolList / RecruitmentSchoolGovDetail。

const escapeHtml = (text: unknown) => String(text ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const clearGoogleOverlays = () => {
  googleOverlays.forEach((overlay) => {
    if (overlay && typeof overlay.setMap === 'function') {
      overlay.setMap(null)
    }
  })
  googleOverlays = []
  if (googleInfoWindow) {
    googleInfoWindow.close()
  }
}

const destroyMap = () => {
  lastFittedBaseSignature = ''
  if (highlightMarker) {
    if (typeof highlightMarker.setMap === 'function') highlightMarker.setMap(null)
    else if (typeof highlightMarker.remove === 'function') highlightMarker.remove()
    highlightMarker = null
  }
  if (renderedMapProvider.value === 'google') {
    clearGoogleOverlays()
    googleInfoWindow = null
    mapInstance = null
    tileLayer = null
    heatLayer = null
    markerLayer = null
    overlayLayer = null
    nearbySchoolLayer = null
    if (mapRef.value) {
      mapRef.value.innerHTML = ''
    }
  } else if (mapInstance) {
    if (leafletMoveHandler && typeof mapInstance.off === 'function') {
      mapInstance.off('moveend', leafletMoveHandler)
    }
    mapInstance.remove()
    mapInstance = null
    tileLayer = null
    heatLayer = null
    markerLayer = null
    overlayLayer = null
    nearbySchoolLayer = null
    leafletMoveHandler = null
  }
  renderedMapProvider.value = ''
  mapInitialized.value = false
}

const nearbySchoolPopupHtml = (school: NearbySchool) => {
  const schoolRating = school.rating
  const ratingStars = schoolRating != null
    ? Array.from({ length: 5 }, (_, i) => {
        const idx = i + 1
        const cls = schoolRating >= idx ? 'star-full' : schoolRating >= idx - 0.5 ? 'star-half' : 'star-empty'
        return `<span class="star ${cls}">★</span>`
      }).join('')
    : ''
  const ratingLine = schoolRating != null
    ? `<div class="popup-rating">${ratingStars} ${escapeHtml(schoolRating.toFixed(1))}${school.user_rating_count != null ? ` <span class="popup-rating-count">（${school.user_rating_count.toLocaleString()} 則）</span>` : ''}</div>`
    : ''
  // 這段 HTML 會丟進 Leaflet bindPopup / Google InfoWindow（innerHTML），外部連結先過 scheme allowlist
  const safeMapUri = sanitizeHref(school.google_maps_uri)
  return [
    `<div class="map-popup">`,
    `<strong>${escapeHtml(school.name || '未命名幼兒園')}</strong>`,
    ratingLine,
    `<div>${escapeHtml(school.formatted_address || '未提供地址')}</div>`,
    school.distance_km != null ? `<div>距本園約 ${escapeHtml(school.distance_km.toFixed(1))} km</div>` : '',
    safeMapUri
      ? `<div><a href="${escapeHtml(safeMapUri)}" target="_blank" rel="noreferrer">Google Maps</a></div>`
      : '',
    `</div>`,
  ].join('')
}


const renderLeafletMap = async () => {
  const L = await ensureLeaflet()
  const shouldAutoFit = baseMapSignature.value !== lastFittedBaseSignature

  if (!mapInstance) {
    mapInstance = L.map(mapRef.value, {
      zoomControl: true,
      scrollWheelZoom: false,
    })
    tileLayer = L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_ATTRIBUTION,
      subdomains: MAP_TILE_SUBDOMAINS,
      maxZoom: 14,
    })
    tileLayer.addTo(mapInstance)
    // 光暈層在最底，標記層在上面，才能讓熱點 marker 可點擊
    overlayLayer = L.layerGroup().addTo(mapInstance)
    heatLayer   = L.layerGroup().addTo(mapInstance)
    markerLayer = L.layerGroup().addTo(mapInstance)
    // 附近幼兒園改用 marker cluster：prod 量級（數百）下避免逐一渲染 SVG divIcon 卡頓。
    // addLayer / clearLayers 介面與 layerGroup 相容，故下方渲染/重建邏輯不變。
    nearbySchoolLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    }).addTo(mapInstance)
    renderedMapProvider.value = 'leaflet'
    mapInitialized.value = true
  }

  heatLayer.clearLayers()
  markerLayer.clearLayers()
  overlayLayer.clearLayers()
  nearbySchoolLayer?.clearLayers?.()

  const bounds = []

  // ── 本園圖釘（SVG divIcon） ──
  const campusIcon = L.divIcon({
    className: '',
    html: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">`,
      `<filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>`,
      `<path d="M14 0C6.268 0 0 6.268 0 14c0 9.8 14 22 14 22s14-12.2 14-22C28 6.268 21.732 0 14 0z"`,
      ` fill="#1e40af" stroke="#1e3a8a" stroke-width="1" filter="url(#s)"/>`,
      `<circle cx="14" cy="13" r="6" fill="white" opacity="0.95"/>`,
      `</svg>`,
    ].join(''),
    iconSize:   [28, 36],
    iconAnchor: [14, 36],
    popupAnchor:[0, -38],
  })
  const schoolMarker = L.marker([campusLat.value, campusLng.value], { icon: campusIcon })
    .bindPopup(`<strong>${escapeHtml(campusName.value)}</strong>`)
  markerLayer.addLayer(schoolMarker)
  bounds.push([campusLat.value, campusLng.value])

  // ── 熱點：街區格（bucket）標記（PII 合規：僅顯示 district + count，不顯示原始地址）──
  for (const bucket of (props.buckets ?? [])) {
    const marker = L.circleMarker([bucket.center_lat, bucket.center_lng], {
      radius: 6,
      color: '#f97316',
      weight: 1.5,
      fillColor: '#f97316',
      fillOpacity: 0.65,
      interactive: true,
    })
    marker.bindPopup(
      `<div class="map-popup">` +
      `<strong>${escapeHtml(bucket.district)}</strong><br/>` +
      `<span>本街區共 ${bucket.visit_count} 筆 visit / ${bucket.deposit_count} 筆 deposit</span>` +
      `</div>`
    )
    markerLayer.addLayer(marker)
    bounds.push([bucket.center_lat, bucket.center_lng])
  }

  // ── 附近幼兒園 ──
  for (const school of mappedNearbySchools.value) {
    const style = getSchoolTypeStyle(getSchoolType(school))
    const schoolIcon = L.divIcon({
      className: '',
      html: [
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">`,
        `<circle cx="11" cy="11" r="10" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5" opacity="0.92"/>`,
        `<text x="11" y="15" text-anchor="middle" font-size="7" font-weight="700" fill="white" font-family="sans-serif">幼</text>`,
        `</svg>`,
      ].join(''),
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
      popupAnchor:[0, -12],
    })
    nearbySchoolLayer.addLayer(
      L.marker([school.lat, school.lng], { icon: schoolIcon })
        .bindPopup(nearbySchoolPopupHtml(school))
    )
  }

  if (shouldAutoFit) {
    mapInstance.setView([campusLat.value, campusLng.value], 13)
    lastFittedBaseSignature = baseMapSignature.value
  }
  mapInstance.invalidateSize()
}

const openGoogleInfoWindow = (position: unknown, html: string) => {
  if (!googleInfoWindow || !mapInstance) return
  googleInfoWindow.setContent(html)
  googleInfoWindow.setPosition(position)
  googleInfoWindow.open({
    map: mapInstance,
  })
}

const renderGoogleMap = async () => {
  const mapsApi = await ensureGoogleMaps()
  if (!mapsApi) return
  const shouldAutoFit = baseMapSignature.value !== lastFittedBaseSignature

  if (!mapInstance) {
    mapInstance = new mapsApi.Map(mapRef.value, {
      zoom: 12,
      center: { lat: campusLat.value, lng: campusLng.value },
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: 'cooperative',
      styles: GOOGLE_MAP_STYLE,
    })
    googleInfoWindow = new mapsApi.InfoWindow()
    renderedMapProvider.value = 'google'
    mapInitialized.value = true
  }

  clearGoogleOverlays()

  const bounds = new mapsApi.LatLngBounds()
  let pointCount = 0
  const addBoundsPoint = (lat: number, lng: number) => {
    bounds.extend({ lat, lng })
    pointCount += 1
  }

  const schoolMarker = new mapsApi.Marker({
    map: mapInstance,
    position: { lat: campusLat.value, lng: campusLng.value },
    title: campusName.value,
    icon: makeGoogleSchoolIcon(mapsApi),
    zIndex: 999,
  })
  schoolMarker.addListener('click', () => {
    openGoogleInfoWindow(schoolMarker.getPosition(), `<strong>${escapeHtml(campusName.value)}</strong>`)
  })
  googleOverlays.push(schoolMarker)
  addBoundsPoint(campusLat.value, campusLng.value)

  for (const hotspot of mappedHotspots.value) {
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: hotspot.lat, lng: hotspot.lng },
      icon: makeGoogleHotspotIcon(mapsApi),
      zIndex: 1,
      clickable: false,
    })
    googleOverlays.push(marker)
    addBoundsPoint(hotspot.lat!, hotspot.lng!)
  }

  for (const school of mappedNearbySchools.value) {
    const style = getSchoolTypeStyle(getSchoolType(school))
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: school.lat, lng: school.lng },
      title: school.name || school.formatted_address,
      icon: makeGoogleNearbySchoolIcon(mapsApi, style),
    })
    marker.addListener('click', () => {
      openGoogleInfoWindow(marker.getPosition(), nearbySchoolPopupHtml(school))
    })
    googleOverlays.push(marker)
  }

  if (shouldAutoFit) {
    mapInstance.setCenter({ lat: campusLat.value, lng: campusLng.value })
    mapInstance.setZoom(13)
    lastFittedBaseSignature = baseMapSignature.value
  }
}

const renderMap = async () => {
  await nextTick()
  if (!mapRef.value || !mapReady.value) return
  mapRenderRequested.value += 1

  if (usingGoogleMap.value) {
    try {
      await renderGoogleMap()
      return
    } catch (error) {
      markGoogleMapsUnavailable(error)
      destroyMap()
      await nextTick()
      if (!mapRef.value || !mapReady.value) return
    }
  }
  await renderLeafletMap()
}

watch(
  () => [
    baseMapSignature.value,
    nearbySchoolSignature.value,
    Boolean(mapRef.value),
    usingGoogleMap.value,
    schoolTypeSignature.value,
  ],
  async ([signature,, hasMapRef]) => {
    if (!signature || !mapReady.value) {
      destroyMap()
      return
    }
    if (!hasMapRef) return
    await renderMap()
  },
  { immediate: true, flush: 'post' }
)

onMounted(async () => {
  if (mapReady.value) {
    await renderMap()
  }
  // 取得教育部同步狀態
  await fetchGovSyncStatus()
  // 超過 90 天才自動同步教育部資料，否則手動按按鈕
  if (props.canWrite && !govSyncing.value && isGovSyncStale()) {
    handleGovSync()
  }
  // 補全學校座標：先查有沒有待補的，有才跑（避免浪費 Google API 流量）
  // 如果教育部正在同步，會在同步完成後自動觸發
  if (!govSyncing.value) {
    autoGeocodeIfNeeded()
  }
  // kiang 補充同步（月費、面積等，不消耗 Google API）
  if (props.canWrite) {
    syncKiangData().catch(() => {})
  }
})

onBeforeUnmount(() => {
  // 中止進行中的批次 geocode loop、清除教育部同步輪詢已隨 composable 搬移，
  // 各自在 useCompetitorGeocoding / useGovKindergartenSync 內部註冊自己的 onBeforeUnmount。
  destroyMap()
})

// ── 錯誤隔離：捕捉元件內部錯誤，不讓它往上傳並摧毀父層 ──
onErrorCaptured((err) => {
  console.error('[RecruitmentAddressHeatmap] 元件內部錯誤（已隔離）', err)
  return false // false = 阻止錯誤繼續向上傳播
})
</script>

<style scoped>
.heatmap-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.heatmap-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.heatmap-toolbar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.heatmap-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.summary-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

.summary-pill strong {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-info-darker);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.summary-pill span {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.summary-pill--warn  { background: var(--color-warning-soft); border-color: #fde68a; }
.summary-pill--warn strong { color: var(--color-warning-darker); }

/* ── 狀態列 ── */
.heatmap-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--neutral-300);
  flex-shrink: 0;
}
.status-dot--ok  { background: var(--color-success); }
.status-dot--off { background: var(--neutral-300); }

.status-item--busy { color: var(--color-warning-hover); }
.status-item--error { color: var(--color-danger-hover); }
.status-item--ok { color: var(--color-success-hover); }

.status-action {
  color: var(--color-info);
  cursor: pointer;
  margin-left: 4px;
  text-decoration: none;
}
.status-action:hover { text-decoration: underline; }

.heatmap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.heatmap-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
  gap: 16px;
  align-items: start;
}

.heatmap-stage {
  min-height: 440px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

.heatmap-map {
  width: 100%;
  min-height: 440px;
}

.heatmap-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 600px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

/* .side-title / .side-title-row / .side-caption 已隨附近幼兒園清單標題移到
   RecruitmentNearbySchoolList.vue（2026-07-12）。 */

/* ── 熱門地址卡片 ── */
.hotspot-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: #FFFFFF;
  border: 1px solid #FED7AA;
  transition: box-shadow 0.15s ease;
}
.hotspot-item:hover {
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.12);
}

.hotspot-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}

.hotspot-address {
  font-size: 0.85rem;
  color: var(--text-primary);
  line-height: 1.45;
  word-break: break-word;
  font-weight: 500;
}

.hotspot-status {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.6;
}

.status-resolved {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}

.status-pending {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}

.status-failed {
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
}

.hotspot-meta {
  margin-top: 4px;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.hotspot-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.hotspot-extra span {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  padding: 1px 6px;
  border-radius: 999px;
}

/* .nearby-section 與其子樹（搜尋/圖例/清單/gov 詳情）樣式已隨模板一併拆到
   RecruitmentNearbySchoolList.vue / RecruitmentSchoolGovDetail.vue（2026-07-12）。 */

.set-campus-btn {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: var(--color-info-soft);
  color: var(--color-info-darker);
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.6;
  transition: background 0.15s ease;
}
.set-campus-btn:hover {
  background: var(--color-info-soft);
}

.db-search-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.db-search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}
.db-school-item {
  border-color: var(--border-color);
  border-left-color: var(--text-secondary);
}

.heatmap-note {
  font-size: 0.78rem;
  color: #718096;
}

:deep(.leaflet-container) {
  font-family: inherit;
}

:deep(.leaflet-popup-content) {
  margin: 10px 12px;
  line-height: 1.6;
  color: #2d3748;
}

:deep(.popup-rating) {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 2px;
  font-size: 0.82rem;
}

:deep(.popup-rating .star-full)  { color: var(--color-warning); }
:deep(.popup-rating .star-half)  { color: var(--color-warning); opacity: 0.6; }
:deep(.popup-rating .star-empty) { color: var(--neutral-300); }

:deep(.popup-rating-count) {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

@media (max-width: 960px) {
  .heatmap-toolbar {
    flex-direction: column;
  }

  .heatmap-actions {
    justify-content: flex-start;
  }

  .heatmap-layout {
    grid-template-columns: 1fr;
  }
}

/* dark mode 覆寫（.nearby-school-name / .gov-data-btn / .gov-detail-link / .gov-status-warned /
   .rating-score）已隨對應元素模板一併移到 RecruitmentNearbySchoolList.vue /
   RecruitmentSchoolGovDetail.vue（2026-07-12），見各檔內同款註解。 */
</style>

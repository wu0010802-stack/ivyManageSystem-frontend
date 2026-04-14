<template>
  <div class="heatmap-shell">
    <div class="heatmap-toolbar">
      <!-- 第一行：數字統計 + 操作按鈕 -->
      <div class="heatmap-toolbar-top">
        <div class="heatmap-summary">
          <div class="summary-pill">
            <strong>{{ totalHotspots }}</strong>
            <span>地址熱點</span>
          </div>
          <div class="summary-pill">
            <strong>{{ geocodedHotspots }}</strong>
            <span>已定位</span>
          </div>
          <div class="summary-pill" :class="pendingHotspots > 0 ? 'summary-pill--warn' : ''">
            <strong>{{ pendingHotspots }}</strong>
            <span>待同步</span>
          </div>
          <div class="summary-pill" :class="staleHotspots > 0 ? 'summary-pill--warn' : ''">
            <strong>{{ staleHotspots }}</strong>
            <span>待升級</span>
          </div>
          <div class="summary-pill">
            <strong>{{ recordsWithAddress }}</strong>
            <span>有地址筆數</span>
          </div>
        </div>

        <div class="heatmap-actions">
          <el-button
            size="small"
            :type="showPreschoolMap ? 'primary' : ''"
            @click="showPreschoolMap = !showPreschoolMap"
          >全台幼兒園地圖</el-button>
          <el-button
            v-if="canWrite && needsIncrementalSync"
            type="primary"
            size="small"
            :loading="syncingMode === 'incremental'"
            @click="emit('sync', 'incremental')"
          >同步全部地址</el-button>
          <el-button
            v-if="canWrite && staleHotspots > 0"
            size="small"
            :loading="syncingMode === 'resync_google'"
            @click="emit('sync', 'resync_google')"
          >Google 重同步</el-button>
        </div>
      </div>

      <!-- 第二行：provider 狀態 tags -->
      <div class="heatmap-status-tags">
        <el-tag :type="providerAvailable ? 'success' : 'info'" effect="plain" size="small">
          Geocoding：{{ providerLabel }}
        </el-tag>
        <el-tag effect="plain" size="small">
          地圖：{{ mapProviderLabel }}
        </el-tag>
        <el-tag effect="plain" size="small">
          生活圈：{{ travelModeLabel }}
        </el-tag>
        <el-tag v-if="syncingMode" type="warning" effect="plain" size="small">
          {{ syncingLabel }}
        </el-tag>
      </div>
    </div>

    <div class="heatmap-layout">
      <div class="heatmap-stage">
        <div v-if="mapReady" ref="mapRef" class="heatmap-map" />
        <el-empty v-else :description="emptyDescription" />
      </div>

      <div class="heatmap-side">
        <div class="side-title">熱門地址</div>
        <div
          v-for="item in topHotspots"
          :key="item.address"
          class="hotspot-item"
        >
          <div class="hotspot-header">
            <div class="hotspot-address">{{ item.formatted_address || item.address }}</div>
            <span class="hotspot-status" :class="`status-${item.geocode_status || 'pending'}`">
              {{ statusLabel(item.geocode_status) }}
            </span>
          </div>
          <div class="hotspot-meta">
            {{ item.district || '未填寫' }} · {{ item.visit }} 筆 · 預繳率 {{ fmtPct(item.deposit, item.visit) }}
          </div>
          <div class="hotspot-extra">
            <span v-if="item.travel_minutes != null">{{ item.travel_minutes.toFixed(1) }} 分鐘</span>
            <span v-if="item.travel_distance_km != null">{{ item.travel_distance_km.toFixed(1) }} km</span>
            <span v-if="item.land_use_label">{{ item.land_use_label }}</span>
          </div>
        </div>

        <div class="nearby-section">
          <div class="side-title-row">
            <div class="side-title">附近幼兒園</div>
            <div class="side-caption">
              <template v-if="nearbySchoolsLoading">載入中</template>
              <template v-else>目前視野 {{ sortedNearbySchools.length }} 間</template>
            </div>
          </div>

          <div v-if="nearbySchoolsLoading" class="nearby-message">
            正在更新目前視野幼兒園…
          </div>
          <div v-else-if="!nearbySchoolsAvailable && nearbySchoolsMessage" class="nearby-message">
            {{ nearbySchoolsMessage }}
          </div>
          <div v-else-if="!sortedNearbySchools.length" class="nearby-message">
            {{ nearbySchoolsMessage || '目前視野內沒有附近幼兒園' }}
          </div>
          <div v-else>
            <div
              v-for="school in topNearbySchools"
              :key="school.place_id || `${school.name}-${school.lat}-${school.lng}`"
              class="nearby-school-item"
            >
              <div class="nearby-school-header">
                <div class="nearby-school-name">{{ school.name || '未命名幼兒園' }}</div>
                <button
                  v-if="Number.isFinite(school.lat) && Number.isFinite(school.lng)"
                  class="set-campus-btn"
                  :title="`將「${school.name || '此幼兒園'}」設為本園中心點`"
                  @click.stop="emit('set-as-campus', { lat: school.lat, lng: school.lng, name: school.name, address: school.formatted_address })"
                >
                  設為本園
                </button>
              </div>
              <div v-if="school.rating != null" class="nearby-school-rating">
                <span class="rating-stars" :title="`${school.rating} 顆星`">
                  <span
                    v-for="i in 5"
                    :key="i"
                    class="star"
                    :class="starClass(school.rating, i)"
                  >★</span>
                </span>
                <span class="rating-score">{{ school.rating.toFixed(1) }}</span>
                <span class="rating-count">（{{ school.user_rating_count != null ? school.user_rating_count.toLocaleString() : '?' }} 則）</span>
              </div>
              <div class="nearby-school-meta">
                <span>{{ school.formatted_address || '未提供地址' }}</span>
                <span v-if="school.distance_km != null">{{ school.distance_km.toFixed(1) }} km</span>
              </div>
              <button
                class="gov-data-btn"
                :class="{ active: selectedGovDataKey === (school.place_id || school.name) }"
                @click.stop="toggleGovData(school)"
              >
                {{ selectedGovDataKey === (school.place_id || school.name) ? '收起詳細資料 ▲' : '詳細資料 ▼' }}
              </button>
              <Transition name="preschool-detail">
                <div
                  v-if="selectedGovDataKey === (school.place_id || school.name)"
                  class="preschool-gov-detail"
                >
                  <div v-if="preschoolGovDataLoading" class="gov-detail-loading">載入政府資料中…</div>
                  <div v-else-if="!preschoolGovData" class="gov-detail-empty">查無政府登記資料（該園可能尚未收錄或名稱格式不同）</div>
                  <template v-else>
                    <div class="gov-detail-matched-name">
                      政府登記名稱：{{ preschoolGovData.name }}
                    </div>
                    <div v-if="preschoolGovData.principal" class="gov-detail-row">
                      <span class="gov-detail-label">負責人</span>
                      <span class="gov-detail-value">{{ preschoolGovData.principal }}</span>
                    </div>
                    <div v-if="preschoolGovData.phone" class="gov-detail-row">
                      <span class="gov-detail-label">電話</span>
                      <span class="gov-detail-value">{{ preschoolGovData.phone }}</span>
                    </div>
                    <div v-if="preschoolGovData.address" class="gov-detail-row">
                      <span class="gov-detail-label">住址</span>
                      <span class="gov-detail-value">{{ preschoolGovData.address }}</span>
                    </div>
                    <div v-if="preschoolGovData.kind" class="gov-detail-row">
                      <span class="gov-detail-label">類型</span>
                      <span class="gov-detail-value">{{ preschoolGovData.kind }}</span>
                    </div>
                    <div v-if="preschoolGovData.capacity != null" class="gov-detail-row">
                      <span class="gov-detail-label">核定人數</span>
                      <span class="gov-detail-value">{{ preschoolGovData.capacity }} 人</span>
                    </div>
                    <div v-if="preschoolGovData.monthlyFee != null" class="gov-detail-row">
                      <span class="gov-detail-label">每月收費</span>
                      <span class="gov-detail-value">${{ Number(preschoolGovData.monthlyFee).toLocaleString() }}</span>
                    </div>
                    <div v-if="preschoolGovData.status" class="gov-detail-row">
                      <span class="gov-detail-label">營業狀態</span>
                      <span
                        class="gov-detail-value"
                        :class="String(preschoolGovData.status).includes('營業') ? 'gov-status-open' : 'gov-status-closed'"
                      >{{ preschoolGovData.status }}</span>
                    </div>
                    <div class="gov-detail-row">
                      <span class="gov-detail-label">裁罰記錄</span>
                      <span
                        class="gov-detail-value"
                        :class="preschoolGovData.penalties.length ? 'gov-status-warned' : 'gov-status-clean'"
                      >{{ preschoolGovData.penalties.length ? `${preschoolGovData.penalties.length} 筆` : '無' }}</span>
                    </div>
                  </template>
                </div>
              </Transition>
            </div>
            <div v-if="hiddenNearbySchoolCount > 0" class="nearby-footnote">
              其餘 {{ hiddenNearbySchoolCount }} 間仍在地圖上
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPreschoolMap" class="preschool-map-section">
      <div class="preschool-map-header">
        <span class="side-title">全台幼兒園分佈圖（kiang.github.io）</span>
        <el-button size="small" @click="showPreschoolMap = false">收起</el-button>
      </div>
      <iframe
        src="https://kiang.github.io/preschools/"
        class="preschool-map-iframe"
        title="全台幼兒園分佈圖"
        loading="lazy"
        referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>

    <div class="heatmap-note">
      <template v-if="providerAvailable">
        說明：橘色點位為家長來源地址；同心圓為 10 / 15 / 20 分鐘生活圈參考圈。按上方按鈕後，系統會自動分批同步到完成，不需要重複點擊。
        <span v-if="staleHotspots > 0">目前有 {{ staleHotspots }} 筆舊 provider / 失敗快取，可用 Google 重同步升級。</span>
        <span v-if="mapFallbackMessage">{{ mapFallbackMessage }}</span>
      </template>
      <template v-else>
        說明：尚未設定地理服務。後端可設 `GOOGLE_MAPS_API_KEY` 讓招生生活圈改走 Google Geocoding / Routes；若暫時不接 Google，再設 `GEOCODING_PROVIDER=nominatim` 後重新同步。
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import { findPreschoolByName } from '@/composables/usePreschoolGovData'

const props = defineProps({
  hotspots: { type: Array, required: true },
  campus: {
    type: Object,
    default: () => ({
      campus_name: '本園',
      campus_address: '',
      campus_lat: null,
      campus_lng: null,
      travel_mode: 'driving',
    }),
  },
  travelBands: { type: Array, default: () => [10, 15, 20] },
  selectedDistrict: { type: String, default: '' },
  recordsWithAddress: { type: Number, required: true },
  totalHotspots: { type: Number, default: 0 },
  geocodedHotspots: { type: Number, default: 0 },
  pendingHotspots: { type: Number, default: 0 },
  staleHotspots: { type: Number, default: 0 },
  failedHotspots: { type: Number, default: 0 },
  providerAvailable: { type: Boolean, default: false },
  providerName: { type: String, default: null },
  nearbySchools: { type: Array, default: () => [] },
  nearbySchoolsLoading: { type: Boolean, default: false },
  nearbySchoolsAvailable: { type: Boolean, default: false },
  nearbySchoolsMessage: { type: String, default: '' },
  schoolLat: { type: Number, required: true },
  schoolLng: { type: Number, required: true },
  canWrite: { type: Boolean, default: false },
  syncingMode: { type: String, default: '' },
  fmtPct: { type: Function, required: true },
})

const emit = defineEmits(['sync', 'viewport-change', 'set-as-campus'])

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

// ── 熱力色票：強度 0~1 → 顏色（黃→橙→深橙→紅） ──
const intensityToColors = (intensity) => {
  if (intensity < 0.25) return { fill: '#FCD34D', stroke: '#B45309' }
  if (intensity < 0.5)  return { fill: '#FB923C', stroke: '#C2410C' }
  if (intensity < 0.75) return { fill: '#F97316', stroke: '#C2410C' }
  return                       { fill: '#EF4444', stroke: '#B91C1C' }
}

// ── Google Maps：熱點 SVG 圖示（含光暈） ──
const makeGoogleHotspotIcon = (mapsApi, intensity) => {
  const { fill, stroke } = intensityToColors(intensity)
  const r    = Math.round(5 + Math.sqrt(intensity) * 8)
  const outer = Math.round(r * 2.4)
  const total = outer * 2 + 2
  const cx    = total / 2
  const opacity = (0.72 + intensity * 0.26).toFixed(2)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">`,
    `<defs><radialGradient id="hl" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0%" stop-color="${fill}" stop-opacity="${(0.22 + intensity * 0.14).toFixed(2)}"/>`,
    `<stop offset="100%" stop-color="${fill}" stop-opacity="0"/></radialGradient></defs>`,
    `<circle cx="${cx}" cy="${cx}" r="${outer}" fill="url(#hl)"/>`,
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" opacity="${opacity}"/>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(cx, cx),
    scaledSize: new mapsApi.Size(total, total),
  }
}

// ── Google Maps：本園圖釘 ──
const makeGoogleSchoolIcon = (mapsApi) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">`,
    `<filter id="sh"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>`,
    `<path d="M15 0C6.716 0 0 6.716 0 15c0 10 15 23 15 23S30 25 30 15C30 6.716 23.284 0 15 0z"`,
    ` fill="#1E40AF" stroke="#1E3A8A" stroke-width="1" filter="url(#sh)"/>`,
    `<circle cx="15" cy="14" r="7" fill="white" opacity="0.95"/>`,
    `<text x="15" y="18.5" text-anchor="middle" font-size="8" font-weight="900" fill="#1E40AF" font-family="sans-serif">本園</text>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(15, 38),
    scaledSize: new mapsApi.Size(30, 38),
  }
}

// ── Google Maps：附近幼兒園圖示 ──
const makeGoogleNearbySchoolIcon = (mapsApi) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">`,
    `<circle cx="11" cy="11" r="10" fill="#60A5FA" stroke="#1D4ED8" stroke-width="1.5" opacity="0.92"/>`,
    `<text x="11" y="15" text-anchor="middle" font-size="8" font-weight="700" fill="white" font-family="sans-serif">幼</text>`,
    `</svg>`,
  ].join('')
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new mapsApi.Point(11, 11),
    scaledSize: new mapsApi.Size(22, 22),
  }
}

const mapRef = ref(null)
const mapInitialized = ref(false)
const showPreschoolMap = ref(false)
const selectedGovDataKey = ref('')
const preschoolGovData = ref(null)
const preschoolGovDataLoading = ref(false)
const mapRenderRequested = ref(0)
const googleMapsLoadFailed = ref(false)
const renderedMapProvider = ref('')
const prefersGoogleMap = Boolean(GOOGLE_MAPS_BROWSER_API_KEY)
const usingGoogleMap = computed(() => prefersGoogleMap && !googleMapsLoadFailed.value)
const providerLabel = computed(() => props.providerName ? props.providerName.toUpperCase() : '未設定')
const mapProviderLabel = computed(() => usingGoogleMap.value ? 'Google Maps' : 'OpenStreetMap')
const mapFallbackMessage = computed(() => {
  if (usingGoogleMap.value) return ''
  if (googleMapsLoadFailed.value) return 'Google Maps 載入失敗，已自動改用 OpenStreetMap。'
  return '目前地圖底圖仍使用 OpenStreetMap；若要把前台地圖也切到 Google，前端再設 `VITE_GOOGLE_MAPS_API_KEY` 即可。'
})
const needsIncrementalSync = computed(() => props.providerAvailable && (props.pendingHotspots > 0 || props.failedHotspots > 0))
const campusLat = computed(() => props.campus?.campus_lat ?? props.schoolLat)
const campusLng = computed(() => props.campus?.campus_lng ?? props.schoolLng)
const campusName = computed(() => props.campus?.campus_name || '本園')
const travelModeLabel = computed(() => {
  if (props.campus?.travel_mode === 'walking') return '步行'
  if (props.campus?.travel_mode === 'cycling') return '騎車'
  return '開車'
})
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

const topHotspots = computed(() =>
  [...props.hotspots]
    .sort((a, b) => (b.visit || 0) - (a.visit || 0))
    .slice(0, 8)
)

const sortedNearbySchools = computed(() =>
  [...props.nearbySchools]
    .sort((a, b) => {
      const aDistance = Number.isFinite(a?.distance_km) ? a.distance_km : Number.POSITIVE_INFINITY
      const bDistance = Number.isFinite(b?.distance_km) ? b.distance_km : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) return aDistance - bDistance
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    })
)

const mappedNearbySchools = computed(() =>
  sortedNearbySchools.value.filter((school) => Number.isFinite(school.lat) && Number.isFinite(school.lng))
)

const topNearbySchools = computed(() => sortedNearbySchools.value.slice(0, 8))
const hiddenNearbySchoolCount = computed(() =>
  Math.max(sortedNearbySchools.value.length - topNearbySchools.value.length, 0)
)

const baseMapSignature = computed(() => [
  mappedHotspots.value.map((hotspot) => `${hotspot.address}:${hotspot.lat}:${hotspot.lng}:${hotspot.visit}`).join('|'),
  campusLat.value,
  campusLng.value,
].join('|'))

const nearbySchoolSignature = computed(() =>
  mappedNearbySchools.value.map((school) => `${school.place_id}:${school.lat}:${school.lng}:${school.distance_km}`).join('|')
)

const emptyDescription = computed(() => {
  if (!props.recordsWithAddress) return '目前沒有可用於熱點圖的地址資料'
  if (!props.providerAvailable) return '尚未設定 geocoding provider，暫時無法定位地址'
  if (needsIncrementalSync.value && props.canWrite) return '已有地址資料待同步座標，請先執行同步'
  if (props.failedHotspots > 0) return '部分地址無法定位，請檢查地址內容後重新同步'
  return '目前沒有可顯示於地圖的地址座標'
})

let leafletPromise = null
let leafletApi = null
let googleMapsPromise = null
let googleMapsApi = null
let mapInstance = null
let tileLayer = null
let heatLayer = null
let markerLayer = null
let overlayLayer = null
let nearbySchoolLayer = null
let googleInfoWindow = null
let googleOverlays = []
let lastFittedBaseSignature = ''
let lastViewportSignature = ''
let viewportEmitTimer = null
let leafletMoveHandler = null
let googleIdleHandler = null

const markGoogleMapsUnavailable = (error) => {
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
    leafletPromise = import('leaflet').then((module) => {
      leafletApi = module.default ?? module
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_BROWSER_API_KEY)}&v=weekly&language=zh-TW&region=TW`
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

const toggleGovData = async (school) => {
  const key = school.place_id || school.name
  if (selectedGovDataKey.value === key) {
    selectedGovDataKey.value = ''
    preschoolGovData.value = null
    return
  }
  selectedGovDataKey.value = key
  preschoolGovData.value = null
  preschoolGovDataLoading.value = true
  try {
    preschoolGovData.value = await findPreschoolByName(school.name, school.formatted_address ?? '')
  } finally {
    preschoolGovDataLoading.value = false
  }
}

const starClass = (rating, index) => {
  if (rating >= index) return 'star-full'
  if (rating >= index - 0.5) return 'star-half'
  return 'star-empty'
}

const escapeHtml = (text) => String(text ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const statusLabel = (status) => {
  if (status === 'resolved') return '已定位'
  if (status === 'failed') return '失敗'
  return '待同步'
}

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
  if (viewportEmitTimer) {
    clearTimeout(viewportEmitTimer)
    viewportEmitTimer = null
  }
  lastFittedBaseSignature = ''
  lastViewportSignature = ''
  if (renderedMapProvider.value === 'google') {
    clearGoogleOverlays()
    googleInfoWindow = null
    mapInstance = null
    tileLayer = null
    heatLayer = null
    markerLayer = null
    overlayLayer = null
    nearbySchoolLayer = null
    googleIdleHandler = null
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

const hotspotPopupHtml = (hotspot) => [
  `<div class="map-popup">`,
  `<strong>${escapeHtml(hotspot.formatted_address || hotspot.address)}</strong>`,
  `<div>行政區：${escapeHtml(hotspot.district || '未填寫')}</div>`,
  `<div>參觀：${escapeHtml(hotspot.visit)} 筆</div>`,
  `<div>預繳率：${escapeHtml(props.fmtPct(hotspot.deposit, hotspot.visit))}</div>`,
  hotspot.travel_minutes != null ? `<div>通勤：約 ${escapeHtml(hotspot.travel_minutes.toFixed(1))} 分鐘</div>` : '',
  hotspot.land_use_label ? `<div>土地使用：${escapeHtml(hotspot.land_use_label)}</div>` : '',
  `</div>`,
].join('')

const nearbySchoolPopupHtml = (school) => {
  const ratingStars = school.rating != null
    ? Array.from({ length: 5 }, (_, i) => {
        const idx = i + 1
        const cls = school.rating >= idx ? 'star-full' : school.rating >= idx - 0.5 ? 'star-half' : 'star-empty'
        return `<span class="star ${cls}">★</span>`
      }).join('')
    : ''
  const ratingLine = school.rating != null
    ? `<div class="popup-rating">${ratingStars} ${escapeHtml(school.rating.toFixed(1))}${school.user_rating_count != null ? ` <span class="popup-rating-count">（${school.user_rating_count.toLocaleString()} 則）</span>` : ''}</div>`
    : ''
  return [
    `<div class="map-popup">`,
    `<strong>${escapeHtml(school.name || '未命名幼兒園')}</strong>`,
    ratingLine,
    `<div>${escapeHtml(school.formatted_address || '未提供地址')}</div>`,
    school.distance_km != null ? `<div>距本園約 ${escapeHtml(school.distance_km.toFixed(1))} km</div>` : '',
    school.google_maps_uri
      ? `<div><a href="${escapeHtml(school.google_maps_uri)}" target="_blank" rel="noreferrer">Google Maps</a></div>`
      : '',
    `</div>`,
  ].join('')
}

const buildViewportSignature = (bounds) => {
  if (!bounds) return ''
  return [
    Number(bounds.south).toFixed(4),
    Number(bounds.west).toFixed(4),
    Number(bounds.north).toFixed(4),
    Number(bounds.east).toFixed(4),
    String(Math.round(Number(bounds.zoom))),
  ].join(':')
}

const getLeafletViewport = () => {
  if (!mapInstance || typeof mapInstance.getBounds !== 'function' || typeof mapInstance.getZoom !== 'function') {
    return null
  }
  const bounds = mapInstance.getBounds()
  if (!bounds) return null
  const payload = {
    south: bounds.getSouth?.(),
    west: bounds.getWest?.(),
    north: bounds.getNorth?.(),
    east: bounds.getEast?.(),
    zoom: mapInstance.getZoom(),
  }
  return Object.values(payload).every((value) => Number.isFinite(value)) ? payload : null
}

const getGoogleViewport = () => {
  if (!mapInstance || typeof mapInstance.getBounds !== 'function' || typeof mapInstance.getZoom !== 'function') {
    return null
  }
  const bounds = mapInstance.getBounds()
  if (!bounds) return null
  const southWest = bounds.getSouthWest?.()
  const northEast = bounds.getNorthEast?.()
  const payload = {
    south: southWest?.lat?.(),
    west: southWest?.lng?.(),
    north: northEast?.lat?.(),
    east: northEast?.lng?.(),
    zoom: mapInstance.getZoom(),
  }
  return Object.values(payload).every((value) => Number.isFinite(value)) ? payload : null
}

const queueViewportChange = (payload) => {
  if (!payload) return
  const signature = buildViewportSignature(payload)
  if (!signature || signature === lastViewportSignature) return
  if (viewportEmitTimer) clearTimeout(viewportEmitTimer)
  viewportEmitTimer = setTimeout(() => {
    lastViewportSignature = signature
    emit('viewport-change', payload)
  }, 0)
}

const bandRadiusMeters = (minutes) => {
  const travelMode = props.campus?.travel_mode || 'driving'
  const speedMap = { driving: 30, walking: 4.5, cycling: 15 }
  const speed = speedMap[travelMode] || speedMap.driving
  return ((minutes / 60) * speed) * 1000
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
      maxZoom: 19,
    })
    tileLayer.addTo(mapInstance)
    // 光暈層在最底，標記層在上面，才能讓熱點 marker 可點擊
    overlayLayer = L.layerGroup().addTo(mapInstance)
    heatLayer   = L.layerGroup().addTo(mapInstance)
    markerLayer = L.layerGroup().addTo(mapInstance)
    nearbySchoolLayer = L.layerGroup().addTo(mapInstance)
    leafletMoveHandler = () => queueViewportChange(getLeafletViewport())
    if (typeof mapInstance.on === 'function') {
      mapInstance.on('moveend', leafletMoveHandler)
    }
    renderedMapProvider.value = 'leaflet'
    mapInitialized.value = true
  }

  heatLayer.clearLayers()
  markerLayer.clearLayers()
  overlayLayer.clearLayers()
  nearbySchoolLayer?.clearLayers?.()

  const bounds = []
  const maxVisit = Math.max(...mappedHotspots.value.map((h) => h.visit || 0), 1)

  // ── 本園圖釘（SVG divIcon） ──
  const campusIcon = L.divIcon({
    className: '',
    html: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">`,
      `<filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>`,
      `<path d="M14 0C6.268 0 0 6.268 0 14c0 9.8 14 22 14 22s14-12.2 14-22C28 6.268 21.732 0 14 0z"`,
      ` fill="#1E40AF" stroke="#1E3A8A" stroke-width="1" filter="url(#s)"/>`,
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

  // ── 生活圈同心圓 ──
  for (const minutes of props.travelBands || []) {
    if (typeof L.circle === 'function') {
      overlayLayer.addLayer(L.circle([campusLat.value, campusLng.value], {
        radius: bandRadiusMeters(minutes),
        color: '#3B82F6',
        weight: 1.5,
        dashArray: '4 4',
        fillColor: '#BFDBFE',
        fillOpacity: 0.06,
      }).bindPopup(`${minutes} 分鐘生活圈`))
    }
  }

  // ── 熱點：單點標記 ──
  for (const hotspot of mappedHotspots.value) {
    const marker = L.circleMarker([hotspot.lat, hotspot.lng], {
      radius: 3,
      color: '#f97316',
      weight: 0,
      fillColor: '#f97316',
      fillOpacity: 0.75,
      interactive: false,
    })

    markerLayer.addLayer(marker)
    bounds.push([hotspot.lat, hotspot.lng])
  }

  // ── 附近幼兒園 ──
  for (const school of mappedNearbySchools.value) {
    const schoolIcon = L.divIcon({
      className: '',
      html: [
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">`,
        `<circle cx="11" cy="11" r="10" fill="#60A5FA" stroke="#1D4ED8" stroke-width="1.5" opacity="0.92"/>`,
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
  queueViewportChange(getLeafletViewport())
}

const createGoogleMarkerIcon = ({ scale, fillColor, strokeColor, fillOpacity = 1, strokeWeight = 2 }) => ({
  path: googleMapsApi.SymbolPath.CIRCLE,
  scale,
  fillColor,
  fillOpacity,
  strokeColor,
  strokeWeight,
})

const openGoogleInfoWindow = (position, html) => {
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
    googleIdleHandler = () => queueViewportChange(getGoogleViewport())
    mapInstance.addListener?.('idle', googleIdleHandler)
    renderedMapProvider.value = 'google'
    mapInitialized.value = true
  }

  clearGoogleOverlays()

  const bounds = new mapsApi.LatLngBounds()
  let pointCount = 0
  const addBoundsPoint = (lat, lng) => {
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

  for (const minutes of props.travelBands || []) {
    const circle = new mapsApi.Circle({
      map: mapInstance,
      center: { lat: campusLat.value, lng: campusLng.value },
      radius: bandRadiusMeters(minutes),
      strokeColor: '#3B82F6',
      strokeOpacity: 0.7,
      strokeWeight: 1.5,
      strokeStyle: 'dashed',
      fillColor: '#BFDBFE',
      fillOpacity: 0.06,
      clickable: true,
    })
    circle.addListener('click', (event) => {
      openGoogleInfoWindow(
        event?.latLng ?? circle.getCenter(),
        `<div class="map-popup"><strong>${minutes} 分鐘生活圈</strong></div>`,
      )
    })
    googleOverlays.push(circle)
  }

  const maxVisit = Math.max(...mappedHotspots.value.map((hotspot) => hotspot.visit || 0), 1)

  for (const hotspot of mappedHotspots.value) {
    const intensity = Math.max((hotspot.visit || 0) / maxVisit, 0.1)
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: hotspot.lat, lng: hotspot.lng },
      title: hotspot.formatted_address || hotspot.address,
      icon: makeGoogleHotspotIcon(mapsApi, intensity),
      zIndex: Math.round(intensity * 100),
    })
    marker.addListener('click', () => {
      openGoogleInfoWindow(marker.getPosition(), hotspotPopupHtml(hotspot))
    })
    googleOverlays.push(marker)
    addBoundsPoint(hotspot.lat, hotspot.lng)
  }

  for (const school of mappedNearbySchools.value) {
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: school.lat, lng: school.lng },
      title: school.name || school.formatted_address,
      icon: makeGoogleNearbySchoolIcon(mapsApi),
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
  queueViewportChange(getGoogleViewport())
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
})

onBeforeUnmount(() => {
  destroyMap()
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
  gap: 10px;
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
  gap: 8px;
}

.summary-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #EFF6FF;
  border: 1px solid #DBEAFE;
  white-space: nowrap;
}

.summary-pill strong {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1E40AF;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.summary-pill span {
  font-size: 0.76rem;
  color: #64748B;
}

.summary-pill--warn  { background: #FFFBEB; border-color: #FDE68A; }
.summary-pill--warn strong { color: #B45309; }
.summary-pill--error { background: #FFF1F2; border-color: #FECDD3; }
.summary-pill--error strong { color: #BE123C; }

.heatmap-status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid #F1F5F9;
}

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
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
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
  scrollbar-color: #E2E8F0 transparent;
}

.side-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.side-title-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  padding-top: 4px;
  border-top: 1px solid #F1F5F9;
}

.side-caption {
  font-size: 0.72rem;
  color: #94A3B8;
}

/* ── 熱門地址卡片 ── */
.hotspot-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: #FFFFFF;
  border: 1px solid #FED7AA;
  border-left: 3px solid #F97316;
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
  color: #1E293B;
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
  background: #DCFCE7;
  color: #15803D;
}

.status-pending {
  background: #FEF3C7;
  color: #B45309;
}

.status-failed {
  background: #FEE2E2;
  color: #B91C1C;
}

.hotspot-meta {
  margin-top: 4px;
  font-size: 0.76rem;
  color: #64748B;
}

.hotspot-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.hotspot-extra span {
  font-size: 0.7rem;
  color: #94A3B8;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  padding: 1px 6px;
  border-radius: 999px;
}

/* ── 附近幼兒園 ── */
.nearby-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.nearby-message {
  padding: 10px 12px;
  border-radius: 10px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  font-size: 0.78rem;
  color: #64748B;
}

.nearby-school-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: #FFFFFF;
  border: 1px solid #DBEAFE;
  border-left: 3px solid #3B82F6;
  transition: box-shadow 0.15s ease;
}
.nearby-school-item:hover {
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.10);
}

.nearby-school-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
}

.nearby-school-name {
  font-size: 0.85rem;
  color: #1E3A8A;
  font-weight: 600;
  flex: 1;
  line-height: 1.4;
}

.gov-data-btn {
  margin-top: 6px;
  width: 100%;
  padding: 4px 0;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: #f0f7ff;
  color: #1d4ed8;
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gov-data-btn:hover,
.gov-data-btn.active {
  background: #dbeafe;
}

.preschool-gov-detail {
  margin-top: 6px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: #f8fbff;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.gov-detail-matched-name {
  font-size: 0.72rem;
  color: #94A3B8;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #E2E8F0;
}

.gov-detail-loading,
.gov-detail-empty {
  font-size: 0.78rem;
  color: #9ca3af;
  text-align: center;
  padding: 4px 0;
}

.gov-detail-row {
  display: flex;
  gap: 6px;
  font-size: 0.78rem;
  align-items: flex-start;
}

.gov-detail-label {
  flex: none;
  width: 56px;
  color: #6b7280;
}

.gov-detail-value {
  color: #1e3a5f;
  word-break: break-word;
  flex: 1;
}

.gov-status-open  { color: #166534; font-weight: 600; }
.gov-status-closed { color: #991b1b; font-weight: 600; }
.gov-status-clean  { color: #166534; }
.gov-status-warned { color: #92400e; font-weight: 600; }

.preschool-detail-enter-active,
.preschool-detail-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  max-height: 400px;
  overflow: hidden;
}
.preschool-detail-enter-from,
.preschool-detail-leave-to {
  opacity: 0;
  max-height: 0;
}

.set-campus-btn {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #BFDBFE;
  background: #EFF6FF;
  color: #1D4ED8;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.6;
  transition: background 0.15s ease;
}
.set-campus-btn:hover {
  background: #DBEAFE;
}

.nearby-school-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.rating-stars {
  display: flex;
  gap: 1px;
  line-height: 1;
}

.star { font-size: 0.75rem; }
.star-full  { color: #F59E0B; }
.star-half  { color: #F59E0B; opacity: 0.6; }
.star-empty { color: #D1D5DB; }

.rating-score {
  font-size: 0.78rem;
  font-weight: 700;
  color: #92400E;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.rating-count {
  font-size: 0.68rem;
  color: #94A3B8;
}

.nearby-school-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: #64748B;
}

.nearby-footnote {
  font-size: 0.72rem;
  color: #94A3B8;
  text-align: center;
  padding: 4px 0;
}

.preschool-map-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preschool-map-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preschool-map-iframe {
  width: 100%;
  height: 560px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  background: #f8fbfa;
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

:deep(.popup-rating .star-full)  { color: #f59e0b; }
:deep(.popup-rating .star-half)  { color: #f59e0b; opacity: 0.6; }
:deep(.popup-rating .star-empty) { color: #d1d5db; }

:deep(.popup-rating-count) {
  font-size: 0.75rem;
  color: #9ca3af;
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
</style>

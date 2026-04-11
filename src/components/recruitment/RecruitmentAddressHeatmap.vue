<template>
  <div class="heatmap-shell">
    <div class="heatmap-toolbar">
      <div class="heatmap-summary">
        <div class="summary-pill">
          <strong>{{ totalHotspots }}</strong>
          <span>個地址熱點</span>
        </div>
        <div class="summary-pill">
          <strong>{{ geocodedHotspots }}</strong>
          <span>個已定位</span>
        </div>
        <div class="summary-pill">
          <strong>{{ pendingHotspots }}</strong>
          <span>個待同步</span>
        </div>
        <div class="summary-pill">
          <strong>{{ staleHotspots }}</strong>
          <span>個待升級</span>
        </div>
        <div class="summary-pill">
          <strong>{{ recordsWithAddress }}</strong>
          <span>筆有地址資料</span>
        </div>
      </div>

      <div class="heatmap-actions">
        <el-tag :type="providerAvailable ? 'success' : 'info'" effect="plain">
          Geocoding：{{ providerLabel }}
        </el-tag>
        <el-tag effect="plain">
          地圖：{{ mapProviderLabel }}
        </el-tag>
        <el-tag effect="plain">
          生活圈：{{ travelModeLabel }}
        </el-tag>
        <el-tag v-if="syncingMode" type="warning" effect="plain">
          {{ syncingLabel }}
        </el-tag>
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
        >Google 全部重同步</el-button>
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
              <div class="nearby-school-name">{{ school.name || '未命名幼兒園' }}</div>
              <div class="nearby-school-meta">
                <span>{{ school.formatted_address || '未提供地址' }}</span>
                <span v-if="school.distance_km != null">{{ school.distance_km.toFixed(1) }} km</span>
              </div>
            </div>
            <div v-if="hiddenNearbySchoolCount > 0" class="nearby-footnote">
              其餘 {{ hiddenNearbySchoolCount }} 間仍在地圖上
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="heatmap-note">
      <template v-if="providerAvailable">
        說明：橘色點位為家長來源地址；同心圓為 10 / 15 / 20 分鐘生活圈參考圈。按上方按鈕後，系統會自動分批同步到完成，不需要重複點擊。
        <span v-if="staleHotspots > 0">目前有 {{ staleHotspots }} 筆舊 provider / 失敗快取，可用 Google 重同步升級。</span>
        <span v-if="!usingGoogleMap">目前地圖底圖仍使用 OpenStreetMap；若要把前台地圖也切到 Google，前端再設 `VITE_GOOGLE_MAPS_API_KEY` 即可。</span>
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

const emit = defineEmits(['sync', 'viewport-change'])

const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const MAP_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors'
const GOOGLE_MAPS_BROWSER_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()

const mapRef = ref(null)
const mapInitialized = ref(false)
const mapRenderRequested = ref(0)
const usingGoogleMap = Boolean(GOOGLE_MAPS_BROWSER_API_KEY)
const providerLabel = computed(() => props.providerName ? props.providerName.toUpperCase() : '未設定')
const mapProviderLabel = computed(() => usingGoogleMap ? 'Google Maps' : 'OpenStreetMap')
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
  if (!usingGoogleMap) return null
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
  if (usingGoogleMap) {
    clearGoogleOverlays()
    googleInfoWindow = null
    mapInstance = null
    tileLayer = null
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
    markerLayer = null
    overlayLayer = null
    nearbySchoolLayer = null
    leafletMoveHandler = null
  }
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

const nearbySchoolPopupHtml = (school) => [
  `<div class="map-popup">`,
  `<strong>${escapeHtml(school.name || '未命名幼兒園')}</strong>`,
  `<div>${escapeHtml(school.formatted_address || '未提供地址')}</div>`,
  school.distance_km != null ? `<div>距本園約 ${escapeHtml(school.distance_km.toFixed(1))} km</div>` : '',
  school.google_maps_uri
    ? `<div><a href="${escapeHtml(school.google_maps_uri)}" target="_blank" rel="noreferrer">Google Maps</a></div>`
    : '',
  `</div>`,
].join('')

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
      maxZoom: 19,
    })
    tileLayer.addTo(mapInstance)
    markerLayer = L.layerGroup().addTo(mapInstance)
    overlayLayer = L.layerGroup().addTo(mapInstance)
    nearbySchoolLayer = L.layerGroup().addTo(mapInstance)
    leafletMoveHandler = () => queueViewportChange(getLeafletViewport())
    if (typeof mapInstance.on === 'function') {
      mapInstance.on('moveend', leafletMoveHandler)
    }
    mapInitialized.value = true
  }

  markerLayer.clearLayers()
  overlayLayer.clearLayers()
  nearbySchoolLayer?.clearLayers?.()

  const bounds = []
  const maxVisit = Math.max(...mappedHotspots.value.map((hotspot) => hotspot.visit || 0), 1)

  const schoolMarker = L.circleMarker([campusLat.value, campusLng.value], {
    radius: 9,
    color: '#22543d',
    weight: 3,
    fillColor: '#2f855a',
    fillOpacity: 0.85,
  }).bindPopup(`<strong>${escapeHtml(campusName.value)}</strong>`)
  markerLayer.addLayer(schoolMarker)
  bounds.push([campusLat.value, campusLng.value])

  for (const minutes of props.travelBands || []) {
    if (typeof L.circle === 'function') {
      overlayLayer.addLayer(L.circle([campusLat.value, campusLng.value], {
        radius: bandRadiusMeters(minutes),
        color: '#2b6cb0',
        weight: 1,
        fillColor: '#90cdf4',
        fillOpacity: 0.04,
      }).bindPopup(`${minutes} 分鐘生活圈`))
    }
  }

  for (const hotspot of mappedHotspots.value) {
    const intensity = Math.max((hotspot.visit || 0) / maxVisit, 0.18)
    const marker = L.circleMarker([hotspot.lat, hotspot.lng], {
      radius: 4 + Math.sqrt(intensity) * 8,
      color: '#c2410c',
      weight: 2,
      fillColor: '#f97316',
      fillOpacity: Math.min(0.38 + intensity * 0.34, 0.82),
    }).bindPopup(hotspotPopupHtml(hotspot))

    markerLayer.addLayer(marker)
    bounds.push([hotspot.lat, hotspot.lng])
  }

  for (const school of mappedNearbySchools.value) {
    nearbySchoolLayer.addLayer(L.circleMarker([school.lat, school.lng], {
      radius: 5,
      color: '#1d4ed8',
      weight: 2,
      fillColor: '#60a5fa',
      fillOpacity: 0.88,
    }).bindPopup(nearbySchoolPopupHtml(school)))
  }

  if (shouldAutoFit) {
    mapInstance.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 14,
    })
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
    })
    googleInfoWindow = new mapsApi.InfoWindow()
    googleIdleHandler = () => queueViewportChange(getGoogleViewport())
    mapInstance.addListener?.('idle', googleIdleHandler)
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
    icon: createGoogleMarkerIcon({
      scale: 8,
      fillColor: '#2f855a',
      strokeColor: '#22543d',
      fillOpacity: 0.95,
      strokeWeight: 2,
    }),
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
      strokeColor: '#2b6cb0',
      strokeOpacity: 0.78,
      strokeWeight: 1,
      fillColor: '#90cdf4',
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
    const intensity = Math.max((hotspot.visit || 0) / maxVisit, 0.18)
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: hotspot.lat, lng: hotspot.lng },
      title: hotspot.formatted_address || hotspot.address,
      icon: createGoogleMarkerIcon({
        scale: 3 + Math.sqrt(intensity) * 3,
        fillColor: '#f97316',
        strokeColor: '#c2410c',
        fillOpacity: Math.min(0.45 + intensity * 0.35, 0.85),
        strokeWeight: 2,
      }),
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
      icon: createGoogleMarkerIcon({
        scale: 4,
        fillColor: '#60a5fa',
        strokeColor: '#1d4ed8',
        fillOpacity: 0.95,
        strokeWeight: 2,
      }),
    })
    marker.addListener('click', () => {
      openGoogleInfoWindow(marker.getPosition(), nearbySchoolPopupHtml(school))
    })
    googleOverlays.push(marker)
  }

  if (shouldAutoFit) {
    if (pointCount <= 1) {
      mapInstance.setCenter({ lat: campusLat.value, lng: campusLng.value })
      mapInstance.setZoom(13)
    } else {
      mapInstance.fitBounds(bounds, 52)
    }
    lastFittedBaseSignature = baseMapSignature.value
  }
  queueViewportChange(getGoogleViewport())
}

const renderMap = async () => {
  await nextTick()
  if (!mapRef.value || !mapReady.value) return
  mapRenderRequested.value += 1

  if (usingGoogleMap) {
    await renderGoogleMap()
    return
  }
  await renderLeafletMap()
}

watch(
  () => [
    baseMapSignature.value,
    nearbySchoolSignature.value,
    Boolean(mapRef.value),
  ],
  async ([signature, hasMapRef]) => {
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
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.heatmap-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-pill {
  min-width: 132px;
  padding: 10px 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, #f7faf7 0%, #edf7f2 100%);
  border: 1px solid rgba(64, 145, 108, 0.12);
}

.summary-pill strong {
  display: block;
  font-size: 1.15rem;
  color: #22543d;
}

.summary-pill span {
  font-size: 0.82rem;
  color: #5f6c7b;
}

.heatmap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.heatmap-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
  gap: 16px;
  align-items: start;
}

.heatmap-stage {
  min-height: 420px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #f8fbfa;
}

.heatmap-map {
  width: 100%;
  min-height: 420px;
}

.heatmap-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #2d3748;
}

.side-title-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}

.side-caption {
  font-size: 0.76rem;
  color: #718096;
}

.hotspot-item {
  padding: 10px 12px;
  border-radius: 14px;
  background: #fffdfb;
  border: 1px solid rgba(231, 111, 81, 0.16);
}

.hotspot-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}

.hotspot-address {
  font-size: 0.9rem;
  color: #2d3748;
  line-height: 1.45;
  word-break: break-word;
}

.hotspot-status {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  line-height: 1.5;
}

.status-resolved {
  background: rgba(22, 163, 74, 0.1);
  color: #166534;
}

.status-pending {
  background: rgba(217, 119, 6, 0.12);
  color: #92400e;
}

.status-failed {
  background: rgba(220, 38, 38, 0.1);
  color: #991b1b;
}

.hotspot-meta {
  margin-top: 4px;
  font-size: 0.8rem;
  color: #718096;
}

.hotspot-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: #718096;
}

.nearby-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.nearby-message {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fbff;
  border: 1px solid rgba(59, 130, 246, 0.12);
  font-size: 0.8rem;
  color: #5f6c7b;
}

.nearby-school-item {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f7fbff;
  border: 1px solid rgba(59, 130, 246, 0.14);
}

.nearby-school-name {
  font-size: 0.88rem;
  color: #1e3a8a;
  font-weight: 600;
}

.nearby-school-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.78rem;
  color: #64748b;
}

.nearby-footnote {
  font-size: 0.76rem;
  color: #64748b;
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

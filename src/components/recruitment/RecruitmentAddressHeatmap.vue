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
          <strong>{{ recordsWithAddress }}</strong>
          <span>筆有地址資料</span>
        </div>
      </div>

      <div class="heatmap-actions">
        <el-tag :type="providerAvailable ? 'success' : 'info'" effect="plain">
          Geocoding：{{ providerLabel }}
        </el-tag>
        <el-button
          v-if="canWrite && needsSync"
          type="primary"
          size="small"
          :loading="syncing"
          @click="emit('sync')"
        >同步地址座標</el-button>
      </div>
    </div>

    <div class="heatmap-layout">
      <div class="heatmap-stage">
        <div v-if="mappedHotspotCount" ref="mapRef" class="heatmap-map" />
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
        </div>
      </div>
    </div>

    <div class="heatmap-note">
      <template v-if="providerAvailable">
        說明：地圖點位依 geocoding 結果顯示，點越大代表該地址訪視量越高；若仍有待同步地址，可按上方按鈕補齊。
      </template>
      <template v-else>
        說明：尚未設定 geocoding provider。後端可設 `GOOGLE_MAPS_API_KEY`，或設 `GEOCODING_PROVIDER=nominatim` 後重新同步。
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  hotspots: { type: Array, required: true },
  recordsWithAddress: { type: Number, required: true },
  totalHotspots: { type: Number, default: 0 },
  geocodedHotspots: { type: Number, default: 0 },
  pendingHotspots: { type: Number, default: 0 },
  failedHotspots: { type: Number, default: 0 },
  providerAvailable: { type: Boolean, default: false },
  providerName: { type: String, default: null },
  schoolLat: { type: Number, required: true },
  schoolLng: { type: Number, required: true },
  canWrite: { type: Boolean, default: false },
  syncing: { type: Boolean, default: false },
  fmtPct: { type: Function, required: true },
})

const emit = defineEmits(['sync'])

const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const MAP_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors'

const mapRef = ref(null)
const mapInitialized = ref(false)
const mapRenderRequested = ref(0)
const providerLabel = computed(() => props.providerName ? props.providerName.toUpperCase() : '未設定')
const needsSync = computed(() => props.providerAvailable && (props.pendingHotspots > 0 || props.failedHotspots > 0))

const mappedHotspots = computed(() =>
  props.hotspots
    .filter((hotspot) => Number.isFinite(hotspot.lat) && Number.isFinite(hotspot.lng))
    .sort((a, b) => (b.visit || 0) - (a.visit || 0))
)

const mappedHotspotCount = computed(() => mappedHotspots.value.length)

const topHotspots = computed(() =>
  [...props.hotspots]
    .sort((a, b) => (b.visit || 0) - (a.visit || 0))
    .slice(0, 8)
)

const emptyDescription = computed(() => {
  if (!props.recordsWithAddress) return '目前沒有可用於熱點圖的地址資料'
  if (!props.providerAvailable) return '尚未設定 geocoding provider，暫時無法定位地址'
  if (needsSync.value && props.canWrite) return '已有地址資料待同步座標，請先執行同步'
  if (props.failedHotspots > 0) return '部分地址無法定位，請檢查地址內容後重新同步'
  return '目前沒有可顯示於地圖的地址座標'
})

let leafletPromise = null
let leafletApi = null
let mapInstance = null
let tileLayer = null
let markerLayer = null

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

const destroyMap = () => {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    tileLayer = null
    markerLayer = null
  }
  mapInitialized.value = false
}

const hotspotPopupHtml = (hotspot) => [
  `<div class="map-popup">`,
  `<strong>${escapeHtml(hotspot.formatted_address || hotspot.address)}</strong>`,
  `<div>行政區：${escapeHtml(hotspot.district || '未填寫')}</div>`,
  `<div>參觀：${escapeHtml(hotspot.visit)} 筆</div>`,
  `<div>預繳率：${escapeHtml(props.fmtPct(hotspot.deposit, hotspot.visit))}</div>`,
  `</div>`,
].join('')

const renderMap = async () => {
  await nextTick()
  if (!mapRef.value || !mappedHotspots.value.length) return
  mapRenderRequested.value += 1

  const L = await ensureLeaflet()

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
    mapInitialized.value = true
  }

  markerLayer.clearLayers()

  const bounds = []
  const maxVisit = Math.max(...mappedHotspots.value.map((hotspot) => hotspot.visit || 0), 1)

  const schoolMarker = L.circleMarker([props.schoolLat, props.schoolLng], {
    radius: 9,
    color: '#22543d',
    weight: 3,
    fillColor: '#2f855a',
    fillOpacity: 0.85,
  }).bindPopup('<strong>本園</strong>')
  markerLayer.addLayer(schoolMarker)
  bounds.push([props.schoolLat, props.schoolLng])

  for (const hotspot of mappedHotspots.value) {
    const intensity = Math.max((hotspot.visit || 0) / maxVisit, 0.18)
    const marker = L.circleMarker([hotspot.lat, hotspot.lng], {
      radius: 7 + Math.sqrt(intensity) * 14,
      color: '#c2410c',
      weight: 2,
      fillColor: '#f97316',
      fillOpacity: Math.min(0.38 + intensity * 0.34, 0.82),
    }).bindPopup(hotspotPopupHtml(hotspot))

    markerLayer.addLayer(marker)
    bounds.push([hotspot.lat, hotspot.lng])
  }

  mapInstance.fitBounds(bounds, {
    padding: [28, 28],
    maxZoom: 14,
  })
  mapInstance.invalidateSize()
}

watch(
  () => [
    mappedHotspots.value.map((hotspot) => `${hotspot.address}:${hotspot.lat}:${hotspot.lng}:${hotspot.visit}`).join('|'),
    Boolean(mapRef.value),
  ],
  async ([signature, hasMapRef]) => {
    if (!signature) {
      destroyMap()
      return
    }
    if (!hasMapRef) return
    await renderMap()
  },
  { immediate: true, flush: 'post' }
)

onMounted(async () => {
  if (mappedHotspotCount.value) {
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

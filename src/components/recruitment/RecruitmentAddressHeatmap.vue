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
        <div class="nearby-section">
          <div class="side-title-row">
            <div class="side-title">附近幼兒園</div>
            <div class="side-caption">
              <template v-if="nearbySchoolsLoading">載入中</template>
              <template v-else-if="schoolSearchQuery.trim()">
                視野內符合 {{ filteredNearbySchools.length }} 間
              </template>
              <template v-else>目前視野 {{ sortedNearbySchools.length }} 間</template>
            </div>
          </div>

          <!-- 搜尋輸入框 -->
          <div class="school-search-row">
            <el-input
              v-model="schoolSearchQuery"
              placeholder="搜尋幼兒園名稱…"
              size="small"
              clearable
              @clear="clearSearch"
            >
              <template #prefix>
                <span class="school-search-icon">🔍</span>
              </template>
            </el-input>
          </div>

          <!-- 類型圖例 -->
          <div class="school-type-legend">
            <span
              v-for="(style, type) in SCHOOL_TYPE_STYLES"
              :key="type"
              class="legend-item"
            >
              <span class="legend-dot" :style="{ background: style.fill }" />{{ style.label }}
            </span>
            <span class="legend-item">
              <span class="legend-dot" :style="{ background: DEFAULT_SCHOOL_STYLE.fill }" />其他
            </span>
          </div>

          <el-select
            v-if="mappedNearbySchools.length > 0"
            v-model="setCampusSelected"
            placeholder="設為本園中心點…"
            size="small"
            style="width: 100%; margin-bottom: 8px;"
            clearable
            @change="onSetCampusSelect"
          >
            <el-option
              v-for="school in mappedNearbySchools"
              :key="school.place_id || school.name"
              :label="school.name || '未命名幼兒園'"
              :value="school.place_id || school.name"
            />
          </el-select>

          <!-- loading -->
          <div v-if="nearbyDisplayMode === 'loading'" class="nearby-message">
            正在更新目前視野幼兒園…
          </div>
          <!-- provider 不可用 -->
          <div v-else-if="nearbyDisplayMode === 'unavailable'" class="nearby-message">
            {{ nearbySchoolsMessage }}
          </div>
          <!-- 視野無幼兒園 -->
          <div v-else-if="nearbyDisplayMode === 'no-schools'" class="nearby-message">
            {{ nearbySchoolsMessage || '目前視野內沒有附近幼兒園' }}
          </div>
          <!-- 視野有幼兒園但搜尋無符合 -->
          <div v-else-if="nearbyDisplayMode === 'no-match'" class="nearby-message">
            視野內找不到「{{ schoolSearchQuery }}」，請嘗試移動或縮放地圖後再搜尋。
          </div>
          <!-- 幼兒園清單 -->
          <div v-else>
            <div
              v-for="school in topNearbySchools"
              :key="school.place_id || `${school.name}-${school.lat}-${school.lng}`"
              class="nearby-school-item nearby-school-item--clickable"
              @click="panMapTo(school.lat, school.lng)"
            >
              <div class="nearby-school-header">
                <div class="nearby-school-name">{{ school.name || '未命名幼兒園' }}</div>
                <div class="nearby-school-badges">
                  <span
                    class="school-type-badge"
                    :style="{ background: getSchoolTypeStyle(getSchoolType(school))?.fill }"
                  >{{ getSchoolTypeStyle(getSchoolType(school))?.label }}</span>
                  <span
                    v-if="school.is_active === false"
                    class="school-closed-badge"
                  >已停辦</span>
                  <span
                    v-if="school.has_penalty"
                    class="school-penalty-badge"
                  >裁罰</span>
                </div>
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
              <!-- MOE 資料（由 API 直接回傳，無需 client-side DB 比對） -->
              <div v-if="school.phone || school.approved_capacity || school.monthly_fee" class="nearby-school-gov-inline">
                <span v-if="school.phone">📞 {{ school.phone }}</span>
                <span v-if="school.approved_capacity">核定 {{ school.approved_capacity }} 人</span>
                <span v-if="school.monthly_fee">月費 ${{ Number(school.monthly_fee).toLocaleString() }}</span>
              </div>
              <button
                class="gov-data-btn"
                :class="{ active: selectedGovDataKey === (school.place_id || school.name) }"
                @click.stop="toggleGovData(school)"
              >
                {{ selectedGovDataKey === (school.place_id || school.name) ? '收起詳細資料 ▲' : '詳細資料 ▼' }}
              </button>
              <div
                v-show="selectedGovDataKey === (school.place_id || school.name)"
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
                    <div v-if="preschoolGovData.prePublicType" class="gov-detail-row">
                      <span class="gov-detail-label">準公共幼兒園</span>
                      <span class="gov-detail-value">{{ preschoolGovData.prePublicType }}</span>
                    </div>
                    <div v-if="preschoolGovData.approvedDate" class="gov-detail-row">
                      <span class="gov-detail-label">核准設立日期</span>
                      <span class="gov-detail-value">{{ preschoolGovData.approvedDate }}</span>
                    </div>
                    <div v-if="preschoolGovData.totalAreaSqm != null" class="gov-detail-row">
                      <span class="gov-detail-label">全園總面積</span>
                      <span class="gov-detail-value">
                        {{ Number(preschoolGovData.totalAreaSqm).toLocaleString() }} m²
                        <template v-if="preschoolGovData.indoorAreaSqm != null || preschoolGovData.outdoorAreaSqm != null">
                          （<template v-if="preschoolGovData.indoorAreaSqm != null">室內 {{ Number(preschoolGovData.indoorAreaSqm).toLocaleString() }}</template>
                          <template v-if="preschoolGovData.indoorAreaSqm != null && preschoolGovData.outdoorAreaSqm != null"> / </template>
                          <template v-if="preschoolGovData.outdoorAreaSqm != null">室外 {{ Number(preschoolGovData.outdoorAreaSqm).toLocaleString() }}</template> m²）
                        </template>
                      </span>
                    </div>
                    <div v-if="preschoolGovData.floor" class="gov-detail-row">
                      <span class="gov-detail-label">使用樓層</span>
                      <span class="gov-detail-value">{{ preschoolGovData.floor }}</span>
                    </div>
                    <div v-if="preschoolGovData.website" class="gov-detail-row">
                      <span class="gov-detail-label">園所網址</span>
                      <a
                        class="gov-detail-value gov-detail-link"
                        :href="preschoolGovData.website"
                        target="_blank"
                        rel="noopener noreferrer"
                      >{{ preschoolGovData.website }}</a>
                    </div>
                    <div v-if="preschoolGovData.monthlyFee != null" class="gov-detail-row">
                      <span class="gov-detail-label">每月收費</span>
                      <span class="gov-detail-value">${{ Number(preschoolGovData.monthlyFee).toLocaleString() }}</span>
                    </div>
                    <div v-if="preschoolGovData.shuttle" class="gov-detail-row">
                      <span class="gov-detail-label">校車服務</span>
                      <span class="gov-detail-value">{{ preschoolGovData.shuttle }}</span>
                    </div>
                    <div v-if="preschoolGovData.afterSchool" class="gov-detail-row">
                      <span class="gov-detail-label">課後留園</span>
                      <span class="gov-detail-value gov-status-open">有</span>
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
                        :class="preschoolGovData.penalties.length ? 'gov-status-warned' : (preschoolGovData.hasPenalty ? 'gov-status-warned' : 'gov-status-clean')"
                      >
                        <template v-if="preschoolGovData.penalties.length">{{ preschoolGovData.penalties.length }} 筆</template>
                        <template v-else-if="preschoolGovData.hasPenalty">有（詳細內容未收錄）</template>
                        <template v-else>無</template>
                      </span>
                    </div>
                  </template>
              </div><!-- /preschool-gov-detail -->
            </div>
            <div v-if="hiddenNearbySchoolCount > 0" class="nearby-footnote">
              其餘 {{ hiddenNearbySchoolCount }} 間仍在地圖上
            </div>
          </div><!-- /v-else: list -->
        </div>
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

<script setup>
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
// kiang 前端查詢已移除，所有資料由 nearby-kindergartens API 一次回傳
import { syncGovKindergartens, getGovKindergartensSyncStatus, getGeocodePendingCount, geocodeCompetitorSchools } from '@/api/recruitment'

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

const emit = defineEmits(['sync', 'set-as-campus'])

// ── 教育部幼兒園資料同步 ──
const govSyncing = ref(false)
const govSyncedAt = ref(null)
const govSyncMessage = ref('')

const fetchGovSyncStatus = async () => {
  try {
    const res = await getGovKindergartensSyncStatus()
    govSyncedAt.value = res.data?.last_synced_at ?? null
    govSyncing.value = res.data?.sync_in_progress ?? false
    if (res.data?.last_sync_status === 'error') {
      govSyncMessage.value = res.data?.last_sync_message ?? '同步失敗'
    } else {
      govSyncMessage.value = ''
    }
  } catch {
    // 靜默失敗，不影響主功能
  }
}

let govSyncPoll = null

const handleGovSync = async () => {
  if (govSyncing.value) return
  try {
    govSyncing.value = true
    govSyncMessage.value = ''
    await syncGovKindergartens(true)
    // 背景作業已啟動，每 5 秒輪詢一次直到完成
    govSyncPoll = setInterval(async () => {
      await fetchGovSyncStatus()
      if (!govSyncing.value) {
        clearInterval(govSyncPoll)
        govSyncPoll = null
        // 教育部同步完成後，自動檢查是否需要補全座標
        autoGeocodeIfNeeded()
      }
    }, 5000)
  } catch (e) {
    govSyncing.value = false
    govSyncMessage.value = '觸發失敗，請稍後再試'
  }
}

// ── 競爭者學校批次地理編碼 ──
const geocodingCompetitors = ref(false)
const geocodeCompetitorResult = ref('')

const autoGeocodeIfNeeded = async () => {
  if (!props.canWrite || geocodingCompetitors.value) return
  try {
    const res = await getGeocodePendingCount()
    if ((res.data?.pending ?? 0) > 0) {
      handleGeocodeCompetitors()
    }
  } catch {
    // 靜默失敗
  }
}

const handleGeocodeCompetitors = async () => {
  if (geocodingCompetitors.value) return
  geocodingCompetitors.value = true
  geocodeCompetitorResult.value = ''
  let totalGeocoded = 0
  let totalFailed = 0
  let batchCount = 0
  try {
    // 每批最多 500 筆，重複執行直到沒有剩餘待 geocode 的學校
    while (true) {
      batchCount += 1
      geocodeCompetitorResult.value = `第 ${batchCount} 批處理中…（累計成功 ${totalGeocoded} 筆）`
      const res = await geocodeCompetitorSchools(500)
      const { geocoded = 0, failed = 0, total = 0 } = res.data ?? {}
      totalGeocoded += geocoded
      totalFailed += failed
      // total === 0 表示已無待處理的學校；geocoded === 0 表示本批全失敗，停止避免無限迴圈
      if (total === 0 || geocoded === 0) break
    }
    geocodeCompetitorResult.value = `完成：${totalGeocoded} 筆成功、${totalFailed} 筆失敗（共 ${batchCount} 批）`
  } catch {
    geocodeCompetitorResult.value = `地理編碼中斷：已成功 ${totalGeocoded} 筆、失敗 ${totalFailed} 筆`
  } finally {
    geocodingCompetitors.value = false
  }
}

const govSyncedAtLabel = computed(() => {
  if (!govSyncedAt.value) return null
  const d = new Date(govSyncedAt.value)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

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

// ── 幼兒園類型色票 ──
const SCHOOL_TYPE_STYLES = {
  '常春藤': { fill: '#0f7b52', stroke: '#065f40', label: '常春藤' },
  '公立':   { fill: '#eab308', stroke: '#ca8a04', label: '公立' },
  '非營利': { fill: '#7c3aed', stroke: '#6d28d9', label: '非營利' },
  '準公共': { fill: '#d97706', stroke: '#b45309', label: '準公共' },
  '私立':   { fill: '#2563eb', stroke: '#1d4ed8', label: '私立' },
}
const DEFAULT_SCHOOL_STYLE = { fill: '#64748b', stroke: '#475569', label: '其他' }

const getSchoolTypeStyle = (type) => SCHOOL_TYPE_STYLES[type] ?? DEFAULT_SCHOOL_STYLE

// ── 常春藤系列學校識別（最高優先） ──
// 含「常春藤」或指定別名（如明華）的學校皆歸入此類
const IVY_SCHOOL_KEYWORDS = ['常春藤']
const IVY_SCHOOL_ALIASES  = ['明華幼兒園']

const _isIvySchool = (name) => {
  if (!name) return false
  const n = String(name).replace(/[\s　]/g, '')
  if (IVY_SCHOOL_KEYWORDS.some((kw) => n.includes(kw))) return true
  if (IVY_SCHOOL_ALIASES.some((alias) => n.includes(alias.replace(/[\s　]/g, '')))) return true
  return false
}

// ── Google Maps：熱點 SVG 圖示（單一小圓點） ──
const makeGoogleHotspotIcon = (mapsApi) => {
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

// ── Google Maps：附近幼兒園圖示（依類型上色） ──
const makeGoogleNearbySchoolIcon = (mapsApi, style = DEFAULT_SCHOOL_STYLE) => {
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

const mapRef = ref(null)
const mapInitialized = ref(false)
const setCampusSelected = ref('')
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
      const aDistance = Number.isFinite(a?.distance_km) ? a.distance_km : Number.POSITIVE_INFINITY
      const bDistance = Number.isFinite(b?.distance_km) ? b.distance_km : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) return aDistance - bDistance
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    })
)

const mappedNearbySchools = computed(() =>
  sortedNearbySchools.value.filter((school) => Number.isFinite(school.lat) && Number.isFinite(school.lng))
)

// API 已回傳 school_type / pre_public_type / phone / capacity 等欄位，
// 無需再對 govSchools 做 client-side 比對。

/**
 * 從 API 回傳的 school 物件直接取得分類標籤（同步、無 async）。
 * 優先順序：常春藤系列 > 準公共 > school_type（公立/私立/非營利）
 */
const getSchoolType = (school) => {
  if (!school) return null
  if (_isIvySchool(school.name)) return '常春藤'
  if (school.pre_public_type) return '準公共'
  return school.school_type || null
}

// ── 幼兒園搜尋（過濾現有清單） ──
const schoolSearchQuery = ref('')

const filteredNearbySchools = computed(() => {
  const q = schoolSearchQuery.value.trim().toLowerCase()
  if (!q) return sortedNearbySchools.value
  return sortedNearbySchools.value.filter((s) =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.formatted_address || '').toLowerCase().includes(q)
  )
})

const clearSearch = () => {
  schoolSearchQuery.value = ''
}

const topNearbySchools = computed(() => filteredNearbySchools.value.slice(0, 8))
const hiddenNearbySchoolCount = computed(() =>
  Math.max(filteredNearbySchools.value.length - 8, 0)
)

const panMapTo = (lat, lng) => {
  if (!mapInstance || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  if (renderedMapProvider.value === 'google') {
    mapInstance.panTo({ lat, lng })
    mapInstance.setZoom(16)
  } else if (typeof mapInstance.setView === 'function') {
    mapInstance.setView([lat, lng], 16)
  }
}

// 搜尋過濾後，若只剩一間則自動移動地圖
watch(filteredNearbySchools, (schools) => {
  if (!schoolSearchQuery.value.trim()) return
  if (schools.length !== 1) return
  const s = schools[0]
  if (Number.isFinite(s?.lat) && Number.isFinite(s?.lng)) {
    panMapTo(s.lat, s.lng)
  }
})

// 決定側欄顯示模式，避免 template 裡複雜的巢狀條件產生 Vue fragment anchor 問題
const nearbyDisplayMode = computed(() => {
  if (props.nearbySchoolsLoading) return 'loading'
  if (!props.nearbySchoolsAvailable && props.nearbySchoolsMessage) return 'unavailable'
  if (!sortedNearbySchools.value.length) return 'no-schools'
  if (schoolSearchQuery.value.trim() && !filteredNearbySchools.value.length) return 'no-match'
  return 'list'
})

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

const onSetCampusSelect = (val) => {
  if (!val) return
  const school = mappedNearbySchools.value.find((s) => (s.place_id || s.name) === val)
  if (school) {
    emit('set-as-campus', { lat: school.lat, lng: school.lng, name: school.name, address: school.formatted_address })
  }
  setCampusSelected.value = ''
}

const toggleGovData = (school) => {
  const key = school.place_id || school.name
  if (selectedGovDataKey.value === key) {
    selectedGovDataKey.value = ''
    preschoolGovData.value = null
    return
  }
  selectedGovDataKey.value = key

  // 所有資料已由 nearby-kindergartens API 一次回傳（含 kiang 補充欄位）
  preschoolGovData.value = {
    name:           school.name,
    principal:      school.owner_name ?? null,
    phone:          school.phone ?? null,
    address:        school.formatted_address ?? null,
    kind:           school.pre_public_type ? '準公共' : (school.school_type ?? null),
    capacity:       school.approved_capacity ?? null,
    monthlyFee:     school.monthly_fee ?? null,
    hasPenalty:     school.has_penalty ?? false,
    approvedDate:   school.approved_date ?? null,
    totalAreaSqm:   school.total_area_sqm ?? null,
    indoorAreaSqm:  school.indoor_area_sqm ?? null,
    outdoorAreaSqm: school.outdoor_area_sqm ?? null,
    floor:          school.floor ?? null,
    website:        school.website ?? null,
    prePublicType:  school.pre_public_type ?? null,
    shuttle:        school.shuttle ?? null,
    afterSchool:    school.has_after_school ?? false,
    status:         school.is_active === false ? '已停業' : '營業中',
    penalties:      school.penalties ?? [],
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
  lastFittedBaseSignature = ''
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

  for (const hotspot of mappedHotspots.value) {
    const marker = new mapsApi.Marker({
      map: mapInstance,
      position: { lat: hotspot.lat, lng: hotspot.lng },
      icon: makeGoogleHotspotIcon(mapsApi),
      zIndex: 1,
      clickable: false,
    })
    googleOverlays.push(marker)
    addBoundsPoint(hotspot.lat, hotspot.lng)
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
  // 自動執行：更新教育部資料
  await fetchGovSyncStatus()
  if (props.canWrite && !govSyncing.value) {
    handleGovSync()
  }
  // 補全學校座標：先查有沒有待補的，有才跑（避免浪費 Google API 流量）
  // 如果教育部正在同步，會在同步完成後自動觸發
  if (!govSyncing.value) {
    autoGeocodeIfNeeded()
  }
})

onBeforeUnmount(() => {
  if (govSyncPoll) {
    clearInterval(govSyncPoll)
    govSyncPoll = null
  }
  destroyMap()
})

// ── 錯誤隔離：捕捉元件內部錯誤，不讓它往上傳並摧毀父層 ──
onErrorCaptured((err) => {
  console.error('[RecruitmentAddressHeatmap] 元件內部錯誤（已隔離）', err)
  return false // false = 阻止錯誤繼續向上傳播
})

// 清單更新時收起展開中的詳細資料，避免 selectedGovDataKey 指向已不存在的節點
watch(topNearbySchools, (newList) => {
  if (!selectedGovDataKey.value) return
  const stillExists = newList.some(
    (s) => (s.place_id || s.name) === selectedGovDataKey.value,
  )
  if (!stillExists) {
    selectedGovDataKey.value = ''
    preschoolGovData.value = null
  }
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
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  white-space: nowrap;
}

.summary-pill strong {
  font-size: 0.88rem;
  font-weight: 700;
  color: #1E40AF;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.summary-pill span {
  font-size: 0.72rem;
  color: #64748B;
}

.summary-pill--warn  { background: #FFFBEB; border-color: #FDE68A; }
.summary-pill--warn strong { color: #B45309; }

/* ── 狀態列 ── */
.heatmap-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 0.72rem;
  color: #94A3B8;
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
  background: #CBD5E1;
  flex-shrink: 0;
}
.status-dot--ok  { background: #22C55E; }
.status-dot--off { background: #CBD5E1; }

.status-item--busy { color: #D97706; }
.status-item--error { color: #DC2626; }
.status-item--ok { color: #16A34A; }

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
.nearby-school-item--clickable {
  cursor: pointer;
}
.nearby-school-item--clickable:active {
  background: #EFF6FF;
}

.nearby-school-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
}
.nearby-school-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}
.school-type-badge {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  color: white;
  padding: 1px 6px;
  border-radius: 999px;
}
.school-closed-badge {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  color: #7f1d1d;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 1px 6px;
  border-radius: 999px;
}
.school-penalty-badge {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  padding: 1px 6px;
  border-radius: 999px;
}
.nearby-school-gov-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 0.74rem;
  color: #475569;
}
.school-type-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 8px;
  font-size: 0.72rem;
  color: #475569;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
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

.gov-detail-link { color: #1d4ed8; text-decoration: underline; word-break: break-all; }
.gov-detail-link:hover { color: #1e40af; }

.gov-status-open  { color: #166534; font-weight: 600; }
.gov-status-closed { color: #991b1b; font-weight: 600; }
.gov-status-clean  { color: #166534; }
.gov-status-warned { color: #92400e; font-weight: 600; }

/* v-show 展開動畫：直接在元素上做 max-height transition，不依賴 <Transition> */
.preschool-gov-detail {
  overflow: hidden;
  transition: opacity 0.2s ease, max-height 0.25s ease;
  max-height: 600px;
}
.preschool-gov-detail[style*="display: none"],
.preschool-gov-detail[style*="display:none"] {
  max-height: 0;
  opacity: 0;
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

/* ── 幼兒園搜尋 ── */
.school-search-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}
.school-search-row .el-input {
  flex: 1;
}
.school-search-icon {
  font-size: 0.78rem;
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
  border-top: 1px solid #E2E8F0;
}
.db-school-item {
  border-color: #E2E8F0;
  border-left-color: #64748b;
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

<template>
  <div class="area-tab" v-loading="loading">

    <!-- 園所資訊 + 操作 -->
    <div class="area-header-bar">
      <div class="area-campus-info">
        <span class="area-campus-name">{{ campus.campus_name || '本園' }}</span>
        <span v-if="campus.campus_address" class="area-campus-addr">{{ campus.campus_address }}</span>
      </div>
      <div class="area-header-meta">
        <span v-if="syncingMarket" class="area-sync-time">市場情報同步中…</span>
        <span v-else-if="marketSnapshot.synced_at" class="area-sync-time">
          情報更新：{{ fmtSyncTime(marketSnapshot.synced_at as string) }}
        </span>
      </div>
    </div>

    <!-- 主要佈局：左側分析面板 + 右側地圖 -->
    <div class="area-main">

      <!-- 左側分析面板 -->
      <div class="area-panel">

        <!-- KPI 條 -->
        <div class="area-kpi-strip">
          <template v-for="(kpi, i) in kpiItems" :key="kpi.label">
            <div v-if="i > 0" class="kpi-sep" />
            <div class="kpi-item">
              <span class="kpi-val" :class="{ 'kpi-val--zero': kpi.value === 0 }">{{ kpi.display }}</span>
              <span class="kpi-label">{{ kpi.label }}</span>
            </div>
          </template>
        </div>

        <!-- 行政區清單 -->
        <div class="district-list-header">
          <span class="district-list-title">行政區競爭分析</span>
          <span v-if="selectedDistrict" class="district-filter-tag">
            {{ selectedDistrict }}
            <button
              type="button"
              class="district-filter-clear"
              :aria-label="`清除行政區過濾：${selectedDistrict}`"
              @click="emit('update:selectedDistrict', '')"
            >✕</button>
          </span>
        </div>

        <div class="district-list">
          <div
            v-for="row in activeDistricts"
            :key="row.district"
            class="district-card"
            :class="{ 'district-card--active': row.district === selectedDistrict }"
            @click="emit('update:selectedDistrict', row.district === selectedDistrict ? '' : (row.district || ''))"
          >
            <!-- 行 1：區名 + 來源量 -->
            <div class="dc-row-top">
              <span class="dc-name">{{ row.district }}</span>
              <div class="dc-badges">
                <span v-if="row.lead_count_90d" class="dc-lead-badge">{{ row.lead_count_90d }} 人次</span>
                <span
                  v-if="row.avg_travel_minutes != null"
                  class="dc-travel-badge"
                  :class="travelClass(row.avg_travel_minutes)"
                >{{ (row.avg_travel_minutes ?? 0).toFixed(0) }} 分</span>
              </div>
            </div>

            <!-- 行 2：預繳率進度條 -->
            <div v-if="(row.lead_count_90d ?? 0) > 0" class="dc-rate-row">
              <div class="dc-rate-bar-bg">
                <div
                  class="dc-rate-bar-fill"
                  :class="rateClass(row.deposit_rate_90d)"
                  :style="{ width: `${Math.min(row.deposit_rate_90d ?? 0, 100)}%` }"
                />
              </div>
              <span class="dc-rate-label">{{ fmtRate(row.deposit_rate_90d) }}</span>
            </div>

            <!-- 行 3：競爭指標 -->
            <div class="dc-stats">
              <span v-if="row.competitor_count" class="dc-stat">
                <span class="dc-stat-val">{{ row.competitor_count }}</span> 校
              </span>
              <span v-if="row.competitor_capacity" class="dc-stat">
                容量 <span class="dc-stat-val">{{ row.competitor_capacity.toLocaleString() }}</span>
              </span>
              <span v-if="row.population_0_6" class="dc-stat">
                0-6 歲 <span class="dc-stat-val">{{ row.population_0_6.toLocaleString() }}</span>
              </span>
              <span v-if="saturationRate(row) != null" class="dc-stat" :class="saturationClass(saturationRate(row))">
                飽和度 <span class="dc-stat-val">{{ saturationRate(row) }}%</span>
              </span>
            </div>

            <!-- 行 4：展開的詳細（選中時） -->
            <div v-if="row.district === selectedDistrict" class="dc-detail">
              <div class="dc-detail-grid">
                <div class="dc-detail-item">
                  <span class="dc-detail-label">30 天來源</span>
                  <span class="dc-detail-value">{{ row.lead_count_30d || 0 }}</span>
                </div>
                <div class="dc-detail-item">
                  <span class="dc-detail-label">90 天來源</span>
                  <span class="dc-detail-value">{{ row.lead_count_90d || 0 }}</span>
                </div>
                <div v-if="row.public_count" class="dc-detail-item">
                  <span class="dc-detail-label">公立</span>
                  <span class="dc-detail-value">{{ row.public_count }}</span>
                </div>
                <div v-if="row.private_count" class="dc-detail-item">
                  <span class="dc-detail-label">私立</span>
                  <span class="dc-detail-value">{{ row.private_count }}</span>
                </div>
                <div v-if="row.penalty_count" class="dc-detail-item dc-detail-item--warn">
                  <span class="dc-detail-label">裁罰校</span>
                  <span class="dc-detail-value">{{ row.penalty_count }}</span>
                </div>
                <div v-if="row.population_density" class="dc-detail-item">
                  <span class="dc-detail-label">人口密度</span>
                  <span class="dc-detail-value">{{ (row.population_density ?? 0).toFixed(0) }}</span>
                </div>
              </div>
              <!-- 市場機會判讀 -->
              <div class="dc-insight">
                <span class="dc-insight-icon">{{ opportunityIcon(row) }}</span>
                <span class="dc-insight-text">{{ opportunityText(row) }}</span>
              </div>
            </div>
          </div>

          <!-- 無市場情報的行政區收成精簡 chip 區，避免整排空卡佔版面 -->
          <div v-if="mutedDistricts.length" class="district-muted">
            <span class="district-muted-title">尚無市場情報（{{ mutedDistricts.length }}）</span>
            <div class="district-muted-chips">
              <button
                v-for="row in mutedDistricts"
                :key="row.district"
                type="button"
                class="district-chip"
                :class="{ 'district-chip--active': row.district === selectedDistrict }"
                @click="emit('update:selectedDistrict', row.district === selectedDistrict ? '' : (row.district || ''))"
              >{{ row.district }}</button>
            </div>
          </div>

          <div v-if="!districts.length" class="district-empty">
            尚無行政區資料，請先同步市場情報。
          </div>
        </div>

        <!-- 各校區競爭分析 -->
        <div class="campus-competition-header">各校區周遭競爭分析</div>
        <IvyCampusCompetition />
      </div>

      <!-- 右側地圖區 -->
      <div class="area-map">
        <RecruitmentAddressHeatmap
          :hotspots="(hs.hotspots as any[]) || []"
          :buckets="hs.buckets || []"
          :district-residual-visits="hs.district_residual_visits || {}"
          :campus="campus"
          :travel-bands="travelBands"
          :selected-district="selectedDistrict"
          :records-with-address="(hs.records_with_address as number) || 0"
          :total-hotspots="hs.total_hotspots as number"
          :geocoded-hotspots="hs.geocoded_hotspots as number"
          :pending-hotspots="hs.pending_hotspots as number"
          :stale-hotspots="hs.stale_hotspots as number"
          :failed-hotspots="hs.failed_hotspots as number"
          :provider-available="hs.provider_available as boolean"
          :provider-name="hs.provider_name as string | null"
          :school-lat="(campus.campus_lat as number) || 0"
          :school-lng="(campus.campus_lng as number) || 0"
          :can-write="canWrite"
          :syncing-mode="syncingMode"
          :nearby-schools="nearbySchools"
          :nearby-schools-loading="nearbySchoolsLoading"
          :nearby-schools-available="nearbySchoolsAvailable"
          :nearby-schools-message="nearbySchoolsMessage"
          :fmt-pct="fmtPct"
          @sync="emit('sync', $event)"
          @set-as-campus="emit('set-as-campus', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
// 1930 行地圖元件 + 3 個 leaflet/markercluster CSS 改 async chunk：
// 區域分析地圖實際渲染時才載入，不再隨 RecruitmentAreaTab（→ RecruitmentStatsPanel）
// 的 chunk 一起下載。Leaflet JS 本就 dynamic import，此處補上元件碼與 CSS。
const RecruitmentAddressHeatmap = defineAsyncComponent(
  () => import('./RecruitmentAddressHeatmap.vue'),
)
import IvyCampusCompetition from './IvyCampusCompetition.vue'

interface DistrictRow {
  district?: string
  lead_count_90d?: number
  lead_count_30d?: number
  competitor_count?: number
  competitor_capacity?: number
  population_0_6?: number
  deposit_rate_90d?: number
  avg_travel_minutes?: number | null
  public_count?: number
  private_count?: number
  penalty_count?: number
  population_density?: number
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  campus: Record<string, unknown>
  marketSnapshot: Record<string, unknown>
  hotspotsSummary: Record<string, unknown>
  travelBands?: number[]
  selectedDistrict?: string
  canWrite?: boolean
  syncingMarket?: boolean
  syncingMode?: string
  nearbySchools?: Record<string, unknown>[]
  nearbySchoolsLoading?: boolean
  nearbySchoolsAvailable?: boolean
  nearbySchoolsMessage?: string
  fmtPct: (...args: unknown[]) => unknown
  loading?: boolean
}>(), {
  travelBands: () => [10, 15, 20],
  selectedDistrict: '',
  canWrite: false,
  syncingMarket: false,
  syncingMode: '',
  nearbySchools: () => [],
  nearbySchoolsLoading: false,
  nearbySchoolsAvailable: false,
  nearbySchoolsMessage: '',
  loading: false,
})

const emit = defineEmits<{
  'sync': [mode?: string]
  'set-as-campus': [data: Record<string, unknown>]
  'update:selectedDistrict': [value: string]
}>()

const districts = computed((): DistrictRow[] => (props.marketSnapshot.districts as DistrictRow[]) || [])

/** 有任何來源／競爭／人口資料才值得展開成完整卡片，否則收進精簡 chip 區 */
const hasDistrictData = (r: DistrictRow) =>
  (r.lead_count_90d || 0) > 0 || (r.competitor_count || 0) > 0 || (r.population_0_6 || 0) > 0
const activeDistricts = computed(() => districts.value.filter(hasDistrictData))
const mutedDistricts = computed(() => districts.value.filter(r => !hasDistrictData(r)))

const activeDistrictCount = computed(() =>
  districts.value.filter(r => r.district !== '未填寫' && (r.lead_count_90d || 0) > 0).length
)

const totalCompetitors = computed(() =>
  districts.value.reduce((sum, r) => sum + (r.competitor_count || 0), 0)
)

const totalCapacity = computed(() =>
  districts.value.reduce((sum, r) => sum + (r.competitor_capacity || 0), 0)
)

/** KPI 條四項；value 用於 0 值中性化，display 為格式化字串 */
const kpiItems = computed(() => {
  const geocoded = Number(hs.value.geocoded_hotspots ?? 0)
  return [
    { label: '已定位', value: geocoded, display: geocoded.toLocaleString() },
    { label: '覆蓋區', value: activeDistrictCount.value, display: String(activeDistrictCount.value) },
    { label: '競爭校', value: totalCompetitors.value, display: String(totalCompetitors.value) },
    { label: '供給容量', value: totalCapacity.value, display: totalCapacity.value.toLocaleString() },
  ]
})

const saturationRate = (row: DistrictRow) => {
  if (!row.population_0_6 || !row.competitor_capacity) return null
  return Math.round((row.competitor_capacity / row.population_0_6) * 100)
}

const saturationClass = (rate: number | null) => {
  if (rate != null && rate >= 80) return 'dc-stat--danger'
  if (rate != null && rate >= 50) return 'dc-stat--warn'
  return 'dc-stat--ok'
}

const rateClass = (rate: number | null | undefined) => {
  const n = Number(rate || 0)
  if (n >= 50) return 'dc-rate-bar-fill--green'
  if (n >= 25) return 'dc-rate-bar-fill--yellow'
  return 'dc-rate-bar-fill--red'
}

const travelClass = (minutes: number | null | undefined) => {
  const m = Number(minutes || 0)
  if (m <= 10) return 'dc-travel-badge--green'
  if (m <= 20) return 'dc-travel-badge--yellow'
  return 'dc-travel-badge--orange'
}

const fmtRate = (rate: number | null | undefined) => {
  if (rate == null || rate === 0) return '0%'
  return Number(rate).toFixed(1) + '%'
}

const fmtSyncTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const opportunityIcon = (row: DistrictRow) => {
  const sat = saturationRate(row)
  const rate = row.deposit_rate_90d || 0
  const leads = row.lead_count_90d || 0
  if (leads > 5 && rate >= 40 && (sat == null || sat < 60)) return '+'
  if (leads > 0 && rate >= 25) return '~'
  if (leads === 0 && (sat == null || sat < 40)) return '?'
  return '-'
}

const opportunityText = (row: DistrictRow) => {
  const sat = saturationRate(row)
  const rate = row.deposit_rate_90d || 0
  const leads = row.lead_count_90d || 0
  const comp = row.competitor_count || 0
  const pop06 = row.population_0_6

  if (leads > 5 && rate >= 40 && (sat == null || sat < 60)) {
    return `高潛力區域：來源穩定、預繳率佳${sat != null ? '、市場未飽和' : ''}`
  }
  if (leads > 0 && rate < 25) {
    return `轉換待加強：有來源但預繳率偏低（${fmtRate(rate)}），建議檢視接待流程`
  }
  if (leads === 0 && pop06 && pop06 > 1000 && comp < 20) {
    return `待開發區域：0-6 歲人口 ${pop06.toLocaleString()} 人、競爭校僅 ${comp} 間`
  }
  if (sat != null && sat >= 80) {
    return `高飽和市場：供給容量已達 0-6 歲人口的 ${sat}%，競爭激烈`
  }
  if (leads > 0) {
    return `一般區域：90 天 ${leads} 人次、預繳率 ${fmtRate(rate)}`
  }
  return '暫無足夠資料做判讀'
}

// Typed accessors for hotspotsSummary to avoid unknown prop errors in template
interface BucketEntry {
  center_lat: number
  center_lng: number
  district: string
  visit_count: number
  deposit_count: number
}

interface HotspotsSummaryTyped {
  hotspots?: unknown[]
  buckets?: BucketEntry[]
  district_residual_visits?: Record<string, number>
  records_with_address?: number
  total_hotspots?: number
  geocoded_hotspots?: number
  pending_hotspots?: number
  stale_hotspots?: number
  failed_hotspots?: number
  provider_available?: boolean
  provider_name?: string | null
}
const hs = computed((): HotspotsSummaryTyped => props.hotspotsSummary as HotspotsSummaryTyped)

</script>

<style scoped>
.area-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── 標頭列 ── */
.area-header-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.area-campus-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 180px; }
.area-campus-name { font-weight: 700; font-size: 0.92rem; color: var(--text-primary); }
.area-campus-addr { font-size: 0.78rem; color: var(--text-secondary); }
.area-header-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.area-sync-time { font-size: 0.72rem; color: var(--text-tertiary); }

/* ── 主佈局 ── */
.area-main {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

@media (max-width: 1100px) {
  .area-main { grid-template-columns: 1fr; }
}

/* ── 左側面板 ── */
.area-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

/* KPI 條 */
.area-kpi-strip {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 10px 14px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.kpi-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 2px;
}
.kpi-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.kpi-val--zero { color: var(--text-tertiary); font-weight: 500; }
.kpi-label { font-size: 0.68rem; color: var(--text-secondary); }
.kpi-sep { width: 1px; height: 28px; background: var(--border-color); margin: 0 4px; }

/* 行政區清單標題 */
.district-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2px;
}
.district-list-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--neutral-600);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.district-filter-tag {
  font-size: 0.72rem;
  color: var(--color-info-darker);
  background: var(--color-info-soft);
  border: 1px solid var(--color-info-soft);
  padding: 2px 8px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.district-filter-clear {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  padding: 0 4px;
  font: inherit;
  color: inherit;
  cursor: pointer;
  font-size: 0.68rem;
  opacity: 0.6;
}
.district-filter-clear:hover { opacity: 1; }
.district-filter-clear:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
  border-radius: 2px;
}

/* ── 行政區卡片 ── */
.district-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.district-card {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: border-color 0.15s;
}
.district-card:hover {
  border-color: var(--color-info);
}
/* 選中態：邊框變主色 + 淺底 tint（不用側邊色條 — impeccable 絕對禁區） */
.district-card--active {
  border-color: var(--color-info);
  background: var(--color-info-soft);
  box-shadow: inset 0 0 0 1px var(--color-info);
}

.dc-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.dc-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.dc-badges { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
.dc-lead-badge {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-info-darker);
  background: var(--color-info-soft);
  border: 1px solid var(--color-info-soft);
  padding: 1px 6px;
  border-radius: 999px;
}
.dc-travel-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
}
.dc-travel-badge--green  { background: var(--color-success-soft); color: var(--color-success-darker); }
.dc-travel-badge--yellow { background: var(--color-warning-soft); color: var(--color-warning-darker); }
.dc-travel-badge--orange { background: #ffedd5; color: #c2410c; }

/* 預繳率條 */
.dc-rate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.dc-rate-bar-bg {
  flex: 1;
  height: 5px;
  background: var(--bg-color-soft);
  border-radius: 3px;
  overflow: hidden;
}
.dc-rate-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.dc-rate-bar-fill--green  { background: var(--color-success); }
.dc-rate-bar-fill--yellow { background: var(--color-warning); }
.dc-rate-bar-fill--red    { background: #f87171; }
.dc-rate-label {
  font-size: 0.72rem;
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--neutral-600);
  min-width: 36px;
  text-align: right;
}

/* 競爭指標 */
.dc-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.68rem;
  color: var(--text-tertiary);
}
.dc-stat-val {
  font-weight: 600;
  color: var(--neutral-600);
  font-family: 'Fira Code', ui-monospace, monospace;
}
.dc-stat--ok .dc-stat-val { color: var(--color-success-darker); }
.dc-stat--warn .dc-stat-val { color: var(--color-warning-darker); }
.dc-stat--danger .dc-stat-val { color: var(--color-danger-hover); }
/* 註：.district-card 背景已 tokenize（var(--neutral-0)，dark 自動翻深底），卡內 *-darker 統計值
   在 dark 由 a11y.css 翻亮＝正確對比，故不再需要 html.dark 深字覆寫（原本為救硬編白卡）。 */

/* 展開詳細 */
.dc-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.dc-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.dc-detail-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dc-detail-label { font-size: 0.65rem; color: var(--text-tertiary); }
.dc-detail-value {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'Fira Code', ui-monospace, monospace;
}
.dc-detail-item--warn .dc-detail-value { color: var(--color-danger-hover); }

/* 市場判讀 */
.dc-insight {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-soft);
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: 0.72rem;
  color: var(--color-success-darker);
  line-height: 1.5;
}
.dc-insight-icon {
  font-weight: 700;
  font-size: 0.82rem;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.district-empty {
  padding: 20px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-tertiary);
}

/* ── 無市場情報的行政區：精簡 chip 區 ── */
.district-muted {
  margin-top: 4px;
  padding: 8px 2px 0;
}
.district-muted-title {
  display: block;
  font-size: 0.68rem;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.district-muted-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.district-chip {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 2px 10px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.district-chip:hover {
  border-color: var(--color-info);
  color: var(--text-primary);
}
.district-chip--active {
  border-color: var(--color-info);
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}
.district-chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

/* ── 校區競爭分析 ── */
.campus-competition-header {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--neutral-600);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 2px 0;
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

/* ── 右側地圖 ── */
.area-map {
  min-height: 500px;
}
</style>

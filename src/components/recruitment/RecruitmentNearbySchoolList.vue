<template>
  <div class="nearby-section">
    <div class="side-title-row">
      <div class="side-title">附近幼兒園</div>
      <div class="side-caption">
        <template v-if="loading">載入中</template>
        <template v-else-if="schoolSearchQuery.trim()">
          視野內符合 {{ filteredSchools.length }} 間
        </template>
        <template v-else>目前視野 {{ sortedSchools.length }} 間</template>
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
        v-for="(style, type) in schoolTypeStyles"
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
      v-if="mappedSchools.length > 0"
      v-model="setCampusSelected"
      placeholder="設為本園中心點…"
      size="small"
      style="width: 100%; margin-bottom: 8px;"
      clearable
      @change="onSetCampusSelect"
    >
      <el-option
        v-for="school in mappedSchools"
        :key="school.place_id || school.name"
        :label="school.name || '未命名幼兒園'"
        :value="school.place_id || school.name || ''"
      />
    </el-select>

    <!-- loading -->
    <div v-if="displayMode === 'loading'" class="nearby-message">
      正在更新目前視野幼兒園…
    </div>
    <!-- provider 不可用 -->
    <div v-else-if="displayMode === 'unavailable'" class="nearby-message">
      {{ message }}
    </div>
    <!-- 視野無幼兒園 -->
    <div v-else-if="displayMode === 'no-schools'" class="nearby-message">
      {{ message || '目前視野內沒有附近幼兒園' }}
    </div>
    <!-- 視野有幼兒園但搜尋無符合 -->
    <div v-else-if="displayMode === 'no-match'" class="nearby-message">
      視野內找不到「{{ schoolSearchQuery }}」，請嘗試移動或縮放地圖後再搜尋。
    </div>
    <!-- 幼兒園清單 -->
    <div v-else>
      <div
        v-for="school in topSchools"
        :key="school.place_id || `${school.name}-${school.lat}-${school.lng}`"
        class="nearby-school-item nearby-school-item--clickable"
        @click="emit('select-school', school)"
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
        <RecruitmentSchoolGovDetail
          :expanded="selectedGovDataKey === (school.place_id || school.name)"
          :gov-data="selectedGovDataKey === (school.place_id || school.name) ? preschoolGovData : null"
          :loading="preschoolGovDataLoading"
          @toggle="toggleGovData(school)"
        />
      </div>
      <div v-if="hiddenSchoolCount > 0" class="nearby-footnote">
        其餘 {{ hiddenSchoolCount }} 間仍在地圖上
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 附近幼兒園清單：搜尋 / 排序 / 高亮 + 設為本園中心點 + 巢狀政府登錄詳情面板。
// 拆分自 RecruitmentAddressHeatmap.vue（2026-07-12 元件邊界拆分），行為零改動：
// - 搜尋/排序/顯示模式邏輯逐行從原元件搬移，僅將「移動地圖」改為 emit('select-school')
//   讓地圖引擎（仍留在主元件）決定如何 pan/highlight，維持地圖狀態不跨元件邊界搬移。
import { computed, ref, watch } from 'vue'
import type { GovData, NearbySchool } from '@/types/recruitmentHeatmap'
import { DEFAULT_SCHOOL_STYLE, getSchoolType, getSchoolTypeStyle, getSchoolTypeStyles } from '@/utils/recruitmentSchoolType'
// 顯式 import：新元件尚未跑過一次 vite dev/build，unplugin-vue-components 的
// components.d.ts 全域自動註冊還沒收錄它，顯式 import 才能讓 vue-tsc 正確解析型別。
import RecruitmentSchoolGovDetail from './RecruitmentSchoolGovDetail.vue'

// 圖例：自家品牌那項的 label 是 per-tenant 的（品牌短名），故包 computed 保持響應。
const schoolTypeStyles = computed(() => getSchoolTypeStyles())

const props = withDefaults(defineProps<{
  schools: NearbySchool[]
  loading?: boolean
  available?: boolean
  message?: string
}>(), {
  loading: false,
  available: false,
  message: '',
})

const emit = defineEmits<{
  'select-school': [school: NearbySchool]
  'set-as-campus': [data: Record<string, unknown>]
}>()

const setCampusSelected = ref('')

const sortedSchools = computed(() =>
  [...props.schools]
    .sort((a, b) => {
      const aDistance = Number.isFinite(a?.distance_km) ? (a.distance_km as number) : Number.POSITIVE_INFINITY
      const bDistance = Number.isFinite(b?.distance_km) ? (b.distance_km as number) : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) return aDistance - bDistance
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    })
)

const mappedSchools = computed(() =>
  sortedSchools.value.filter((school) => Number.isFinite(school.lat) && Number.isFinite(school.lng))
)

// ── 幼兒園搜尋（過濾現有清單） ──
const schoolSearchQuery = ref('')

const filteredSchools = computed(() => {
  const q = schoolSearchQuery.value.trim().toLowerCase()
  if (!q) return sortedSchools.value
  return sortedSchools.value.filter((s) =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.formatted_address || '').toLowerCase().includes(q)
  )
})

const clearSearch = () => {
  schoolSearchQuery.value = ''
}

const topSchools = computed(() => filteredSchools.value.slice(0, 8))
const hiddenSchoolCount = computed(() =>
  Math.max(filteredSchools.value.length - 8, 0)
)

// 決定顯示模式，避免 template 裡複雜的巢狀條件產生 Vue fragment anchor 問題
const displayMode = computed(() => {
  if (props.loading) return 'loading'
  if (!props.available && props.message) return 'unavailable'
  if (!sortedSchools.value.length) return 'no-schools'
  if (schoolSearchQuery.value.trim() && !filteredSchools.value.length) return 'no-match'
  return 'list'
})

// 搜尋過濾後，若只剩一間則自動請 parent 移動地圖
watch(filteredSchools, (schools) => {
  if (!schoolSearchQuery.value.trim()) return
  if (schools.length !== 1) return
  const s = schools[0]
  if (Number.isFinite(s?.lat) && Number.isFinite(s?.lng)) {
    emit('select-school', s)
  }
})

const onSetCampusSelect = (val: string | number | boolean | undefined) => {
  if (!val) return
  const school = mappedSchools.value.find((s) => (s.place_id || s.name) === val)
  if (school) {
    emit('set-as-campus', { lat: school.lat, lng: school.lng, name: school.name, address: school.formatted_address })
  }
  setCampusSelected.value = ''
}

const starClass = (rating: number, index: number) => {
  if (rating >= index) return 'star-full'
  if (rating >= index - 0.5) return 'star-half'
  return 'star-empty'
}

// ── 選定學校政府登錄詳情（同步、無 async；資料已由 nearby-kindergartens API 一次回傳）──
const selectedGovDataKey = ref('')
const preschoolGovData = ref<GovData | null>(null)
const preschoolGovDataLoading = ref(false)

const toggleGovData = (school: NearbySchool) => {
  const key = school.place_id || school.name || ''
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

// 清單更新時收起展開中的詳細資料，避免 selectedGovDataKey 指向已不存在的節點
watch(topSchools, (newList) => {
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
.nearby-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.side-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--neutral-600);
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
  transition: box-shadow 0.15s ease;
}
.nearby-school-item:hover {
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.10);
}
.nearby-school-item--clickable {
  cursor: pointer;
}
.nearby-school-item--clickable:active {
  background: var(--color-info-soft);
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
  background: var(--color-danger-soft);
  border: 1px solid #fca5a5;
  padding: 1px 6px;
  border-radius: 999px;
}
.school-penalty-badge {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-warning-darker);
  background: var(--color-warning-soft);
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
  color: var(--neutral-600);
}
.school-type-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 8px;
  font-size: 0.72rem;
  color: var(--neutral-600);
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
  color: var(--color-info-darker);
  font-weight: 600;
  flex: 1;
  line-height: 1.4;
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
.star-full  { color: var(--color-warning); }
.star-half  { color: var(--color-warning); opacity: 0.6; }
.star-empty { color: var(--neutral-300); }

.rating-score {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-warning-darker);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.rating-count {
  font-size: 0.68rem;
  color: var(--text-tertiary);
}

.nearby-school-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.nearby-footnote {
  font-size: 0.72rem;
  color: var(--text-tertiary);
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

/* dark mode：以下元素疊在不翻色的硬編淺底/白卡（finding #2 既有債，非本次範圍），上游
   a11y.css 把 --color-*-darker 翻亮會讓文字塌對比。dark scope 窄覆寫還原可讀。 */
html.dark .nearby-school-name { color: #1d4ed8; }
html.dark .rating-score { color: #b45309; }
</style>

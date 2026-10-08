<script setup lang="ts">
/**
 * 自動排序預覽 Dialog（FE-ROUTES-05）。
 *
 * spec「呼叫時機與節流」：後台按「自動排序」→ optimize 回傳**預覽**
 * （新順序＋各站 ETA＋預計結束時間＋將被重排的釘選外站清單），按「套用」
 * 才落庫；Azure 失敗 502 → 顯示重試提示，不落任何變更。
 * 文案規範（spec 釘選語意）：「系統建議順序」、ETA 標「預計」
 * （啟發式 >10 站為近似解，非時間承諾）。純呈現元件，供班次設定頁與
 * 今日調度頁共用。
 */
import { computed, ref, watch } from 'vue'
import BusRoutePreviewMap from './BusRoutePreviewMap.vue'

export interface OptimizePreviewStop {
  student_id: number
  student_name: string
  old_seq: number
  new_seq: number
  pinned: boolean
  eta: string | null
  moved: boolean
  /** 接送地址文字（住家或地址簿該筆）；缺地址時表格顯示「—」 */
  address?: string | null
  /** 接送座標；缺座標的站畫不到地圖上（表格仍列出） */
  lat?: number | null
  lng?: number | null
}

export interface OptimizePreviewLeg {
  distance_m: number | null
  duration_s: number | null
  duration_traffic_s: number | null
  /** 這一段的道路折線；`legs[seq - 1]`＝「上一個點 → 第 seq 站」 */
  polyline: number[][]
}

export interface OptimizePreview {
  order: OptimizePreviewStop[]
  end_time_planned: string | null
  moved_unpinned_count: number
  /** 後端 `route_shape.polyline`（實際道路折線）；缺幾何時空陣列 */
  polyline?: number[][]
  /** 後端 `route_shape.legs`（逐段行駛資料），用來算全程距離／時間摘要 */
  legs?: OptimizePreviewLeg[]
}

const props = withDefaults(defineProps<{
  visible: boolean
  loading: boolean
  preview: OptimizePreview | null
  error: string | null
  /** 呼叫端是否有「解除釘選」能力（班次設定頁有，當日調度頁的釘選由後端維護）。 */
  canUnpinAll?: boolean
  /** 園所座標＝路線起終點；缺座標時地圖只畫站點。 */
  schoolCoords?: { lat: number; lng: number } | null
}>(), { canUnpinAll: false, schoolCoords: null })

const emit = defineEmits<{
  apply: []
  cancel: []
  retry: []
  'unpin-all': []
}>()

const orderedStops = computed(() =>
  props.preview ? [...props.preview.order].sort((a, b) => a.new_seq - b.new_seq) : [],
)

/**
 * 全站釘選＝自動排序必然 no-op（`pinned_optimize._split_segments` 以釘選站為錨點
 * 切段，全釘時每個自由段 0 站，最佳化一次都不會呼叫）。此時順序原樣回傳，
 * 使用者看到的就只是「沒有變化」——不講清楚會被當成排序算錯。
 * 釘選多半是拖拉調整順序時自動加上的（spec：手動調整權重 > 系統排序）。
 */
const allPinned = computed(() =>
  orderedStops.value.length > 0 && orderedStops.value.every((s) => s.pinned),
)

/** 地圖用的站點（依新順序，順位即表格的「新順序」欄）。 */
const mapStops = computed(() => orderedStops.value.map((s) => ({
  seq: s.new_seq,
  label: s.student_name,
  lat: s.lat ?? null,
  lng: s.lng ?? null,
})))

const polyline = computed(() => props.preview?.polyline ?? [])
const legs = computed(() => props.preview?.legs ?? [])

/**
 * 名單 hover 中的順位——地圖據此高亮「上一站 → 該站」的路段並放大該站圖釘。
 * 換一組預覽（重新排序、重試）就清掉，否則會殘留指向已不存在的順位。
 */
const highlightSeq = ref<number | null>(null)
watch(() => props.preview, () => { highlightSeq.value = null })

/**
 * 全程距離／行駛時間摘要。時間優先取含車流的 `duration_traffic_s`——那才是
 * 這個出發時間實際會開多久；provider 沒給時退回無車流值。
 */
const routeSummary = computed(() => {
  const legs = props.preview?.legs ?? []
  if (legs.length === 0) return null
  const meters = legs.reduce((sum, leg) => sum + (leg.distance_m ?? 0), 0)
  const seconds = legs.reduce((sum, leg) => sum + (leg.duration_traffic_s ?? leg.duration_s ?? 0), 0)
  if (meters <= 0 && seconds <= 0) return null
  return {
    km: (meters / 1000).toFixed(1),
    minutes: Math.round(seconds / 60),
  }
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="系統建議順序"
    width="min(860px, 92vw)"
    :close-on-click-modal="false"
    @close="emit('cancel')"
  >
    <div v-if="error" class="bus-optimize-preview__error" data-test="error">
      <el-alert type="error" :closable="false" show-icon>
        <template #title>{{ error }}</template>
      </el-alert>
      <el-button type="primary" data-test="retry-btn" @click="emit('retry')">
        重試
      </el-button>
    </div>

    <div v-else-if="loading" v-loading="true" class="bus-optimize-preview__loading" data-test="loading">
      正在計算建議順序與預計到達時間…
    </div>

    <template v-else-if="preview">
      <el-alert
        v-if="preview.moved_unpinned_count > 0"
        class="bus-optimize-preview__moved-summary"
        type="warning"
        :closable="false"
        data-test="moved-summary"
      >
        <template #title>
          {{ preview.moved_unpinned_count }} 個未釘選站點將被重新排序；釘選站順位固定不變
        </template>
      </el-alert>

      <el-alert
        v-else-if="allPinned"
        class="bus-optimize-preview__moved-summary"
        type="warning"
        :closable="false"
        show-icon
        data-test="all-pinned-notice"
      >
        <template #title>所有站點都已釘選，自動排序不會改變順序</template>
        <template #default>
          <div class="bus-optimize-preview__notice-body">
            <span>
              釘選站的順位固定不變，因此這次沒有任何站被重新排序。
              要讓系統重新安排這些站，請先解除釘選。
            </span>
            <el-button
              v-if="canUnpinAll"
              size="small"
              data-test="unpin-all-btn"
              @click="emit('unpin-all')"
            >
              解除全部釘選
            </el-button>
          </div>
        </template>
      </el-alert>

      <el-alert
        v-else
        class="bus-optimize-preview__moved-summary"
        type="success"
        :closable="false"
        show-icon
        data-test="already-optimal-notice"
      >
        <template #title>目前順序已是系統建議順序，沒有站點需要調整</template>
      </el-alert>

      <!--
        用 cell-mouse-enter／leave 而非 row：el-table 沒有 row-mouse-enter 事件，
        cell 事件的第一個參數就是 row，語意上等價。
      -->
      <el-table
        :data="orderedStops"
        size="small"
        data-test="preview-table"
        @cell-mouse-enter="(row: OptimizePreviewStop) => (highlightSeq = row.new_seq)"
        @cell-mouse-leave="highlightSeq = null"
      >
        <el-table-column label="新順序" width="76">
          <template #default="{ row }">
            <span :class="{ 'bus-optimize-preview__hovered': row.new_seq === highlightSeq }">
              {{ row.new_seq }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="學生" width="140">
          <template #default="{ row }">
            <span
              :class="{ 'bus-optimize-preview__moved': row.moved }"
              :data-test="`stop-${row.student_id}`"
            >
              {{ row.student_name }}
            </span>
            <el-tag v-if="row.pinned" size="small" type="info" data-test="pinned-tag">
              釘選
            </el-tag>
          </template>
        </el-table-column>
        <!--
          接送地址：光看學生名無法判斷這個順序合不合理，地址才是對照地圖的依據。
          地址常常比欄寬長，用 tooltip 承接而不是硬撐開表格。
        -->
        <el-table-column label="接送地址" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span :data-test="`address-${row.student_id}`">{{ row.address || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="原順序" width="76">
          <template #default="{ row }">
            <span :class="{ 'bus-optimize-preview__moved': row.moved }">
              {{ row.old_seq }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="預計到達" width="96">
          <template #default="{ row }">{{ row.eta ?? '—' }}</template>
        </el-table-column>
      </el-table>

      <div v-if="preview.end_time_planned" class="bus-optimize-preview__end" data-test="end-time">
        預計 {{ preview.end_time_planned }} 結束全程
        <span v-if="routeSummary" data-test="route-summary">
          ・全程約 {{ routeSummary.km }} 公里／{{ routeSummary.minutes }} 分鐘（含車流）
        </span>
      </div>

      <BusRoutePreviewMap
        class="bus-optimize-preview__map"
        :polyline="polyline"
        :stops="mapStops"
        :origin="schoolCoords"
        :legs="legs"
        :highlight-seq="highlightSeq"
        :visible="visible"
      />
    </template>

    <template #footer>
      <el-button data-test="cancel-btn" @click="emit('cancel')">取消</el-button>
      <el-button
        type="primary"
        :disabled="loading || !!error || !preview"
        data-test="apply-btn"
        @click="emit('apply')"
      >
        套用
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bus-optimize-preview__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.bus-optimize-preview__loading {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.bus-optimize-preview__moved-summary {
  margin-bottom: 8px;
}

.bus-optimize-preview__notice-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.6;
}

.bus-optimize-preview__moved {
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
  font-weight: 600;
}

.bus-optimize-preview__end {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.bus-optimize-preview__map {
  margin-top: 10px;
}

/* 與地圖上的高亮同色，讓「表格這一列」與「地圖那個點」是同一件事一目了然 */
.bus-optimize-preview__hovered {
  color: var(--el-color-danger);
  font-weight: 700;
}
</style>

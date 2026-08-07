<template>
  <div class="stats-panel crisp-surface" v-loading="loadingStats">
    <div class="panel-toolbar">
      <span class="panel-toolbar-label">統計範圍</span>
      <el-select
        v-model="statsSchoolYear"
        size="small"
        placeholder="入學學年"
        clearable
        style="width: 120px"
        @change="fetchStats()"
      >
        <el-option
          v-for="y in termYearOptions"
          :key="y"
          :label="`${y} 學年`"
          :value="y"
        />
      </el-select>
      <el-select
        v-model="statsSemester"
        size="small"
        placeholder="學期"
        clearable
        style="width: 100px"
        @change="fetchStats()"
      >
        <el-option label="上學期" :value="1" />
        <el-option label="下學期" :value="2" />
      </el-select>
      <el-select
        v-model="referenceMonth"
        size="small"
        placeholder="參考月份"
        clearable
        style="width: 140px"
        @change="handleReferenceMonthChange"
      >
        <el-option
          v-for="month in monthOptions"
          :key="month"
          :label="month"
          :value="month"
        />
      </el-select>
      <el-button
        type="success"
        size="small"
        :loading="exportingExcel"
        @click="handleExportExcel"
      >匯出 Excel</el-button>
    </div>

    <el-tabs v-model="activeStatsTab" @tab-click="onTabClick">
      <!-- ==================== 總覽 ==================== -->
      <el-tab-pane label="總覽" name="overview">
        <RecruitmentOverviewTab
          :stats="stats"
          :reference-month="referenceMonth"
          :decision-summary="statsDecisionSummary"
          :funnel-snapshot="statsFunnelSnapshot"
          :month-over-month="statsMonthOverMonth"
          :alerts="statsAlerts"
          :top-action-queue="statsTopActionQueue"
          :show-charts="isChartTabActive('overview')"
          :monthly-table-data="monthlyTableData"
          :monthly-bar-data="monthlyBarData"
          :monthly-rate-data="monthlyRateData"
          :bar-options="(barOptions as Record<string, unknown>)"
          :monthly-bar-options="(monthlyBarOptions as Record<string, unknown>)"
          :line-options="(percentLineOptions as Record<string, unknown>)"
          :bar-component="castBarComponent"
          :line-component="castLineComponent"
          :fmt-rate="castFmtRate"
          @navigate="(e) => handleDashboardTarget(e as Record<string, unknown>)"
        >
          <template #after-summary>
            <AllChannelSummaryCard :internal-snapshot="statsFunnelSnapshot" />
          </template>
        </RecruitmentOverviewTab>
      </el-tab-pane>

      <!-- ==================== 班別分析 ==================== -->
      <el-tab-pane label="班別分析" name="class" lazy>
        <RecruitmentClassTab
          :show-charts="isChartTabActive('class')"
          :class-bar-data="classBarData"
          :class-rate-data="classRateData"
          :class-bar-options="(classBarOptions as Record<string, unknown>)"
          :percent-horiz-bar-options="(percentHorizBarOptions as Record<string, unknown>)"
          :stats-by-grade="statsByGrade"
          :month-grade-table-data="monthGradeTableData"
          :grades-order="GRADES_ORDER"
          :fmt-pct="fmtPct"
        />
      </el-tab-pane>

      <!-- ==================== 來源分析 ==================== -->
      <el-tab-pane label="來源分析" name="source" lazy>
        <RecruitmentSourceTab
          :show-charts="isChartTabActive('source')"
          :source-bar-data="sourceBarData"
          :source-rate-data="sourceRateData"
          :source-click-bar-options="(sourceClickBarOptions as Record<string, unknown>)"
          :percent-horiz-bar-options="(percentHorizBarOptions as Record<string, unknown>)"
          :stats-by-source="statsBySource"
          :fmt-pct="fmtPct"
        />
      </el-tab-pane>

      <!-- ==================== 接待分析 ==================== -->
      <el-tab-pane label="接待分析" name="staff" lazy>
        <RecruitmentStaffTab
          :show-charts="isChartTabActive('staff')"
          :staff-bar-data="staffBarData"
          :staff-rate-data="staffRateData"
          :bar-options="(barOptions as Record<string, unknown>)"
          :percent-bar-options="(percentBarOptions as Record<string, unknown>)"
          :stats-by-referrer="statsByReferrer"
          :referrer-source-cross="referrerSourceCross"
          :grades-order="GRADES_ORDER"
          :fmt-pct="fmtPct"
        />
      </el-tab-pane>

      <!-- ==================== 區域分析 ==================== -->
      <el-tab-pane label="區域分析" name="area" lazy>
        <RecruitmentAreaTab
          :campus="currentCampus"
          :market-snapshot="marketSnapshot"
          :hotspots-summary="areaHotspotsSummary"
          :travel-bands="TRAVEL_BANDS"
          v-model:selected-district="selectedMarketDistrict"
          :can-write="canWrite"
          :syncing-market="syncingMarket"
          :syncing-mode="syncingAreaHotspotsMode"
          :nearby-schools="nearbySchools"
          :nearby-schools-loading="loadingNearbySchools"
          :nearby-schools-available="nearbySchoolsAvailable"
          :nearby-schools-message="nearbySchoolsMessage"
          :fmt-pct="castFmtPct"
          :loading="loadingAreaHotspots || loadingMarket"
          @sync="handleAreaHotspotSync"
          @set-as-campus="handleSetAsCampus"
        />
      </el-tab-pane>

      <!-- ==================== 未預繳原因分析 ==================== -->
      <el-tab-pane label="未預繳原因" name="nodeposit" lazy>
        <RecruitmentNoDepositTab
          :show-charts="isChartTabActive('nodeposit')"
          :no-deposit-reason-bar-data="noDepositReasonBarData"
          :no-deposit-grade-bar-data="noDepositGradeBarData"
          :horiz-bar-options="horizBarOptions"
          :no-deposit-grade-options="noDepositGradeBarOptions"
          :bar-component="LazyBar"
          :reason-options="noDepositReasonOptions"
          :grades="GRADES_ORDER"
          :summary="ndSummary"
          :priority="ndFilter.priority"
          :reason="ndFilter.reason"
          :grade="ndFilter.grade"
          :overdue-days="ndFilter.overdue_days"
          :cold-only="ndFilter.cold_only"
          :page="ndFilter.page"
          :page-size="ndFilter.page_size"
          :total="ndTotal"
          :records="ndData"
          :loading="loadingND"
          @update:priority="ndFilter.priority = $event"
          @update:reason="ndFilter.reason = $event"
          @update:grade="ndFilter.grade = $event"
          @update:overdue-days="ndFilter.overdue_days = $event"
          @update:cold-only="ndFilter.cold_only = $event"
          @filter-change="onNoDepositFilterChange"
          @page-change="onNDPageChange"
        />
      </el-tab-pane>

    </el-tabs>

    <RecruitmentCampusDialog
      v-model:visible="campusDialogVisible"
      :form="campusForm"
      :saving="savingCampus"
      @save="handleCampusSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { currentRocYear } from '@/utils/academic'
import { ElMessage } from 'element-plus'
import { getNoDepositAnalysis } from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useRecruitmentArea, createEmptyCampus } from '@/composables/useRecruitmentArea'
import { useRecruitmentCharts } from '@/composables/useRecruitmentCharts'
import RecruitmentOverviewTab from '@/components/recruitment/RecruitmentOverviewTab.vue'
import RecruitmentClassTab from '@/components/recruitment/RecruitmentClassTab.vue'
import RecruitmentSourceTab from '@/components/recruitment/RecruitmentSourceTab.vue'
import RecruitmentStaffTab from '@/components/recruitment/RecruitmentStaffTab.vue'
import RecruitmentAreaTab from '@/components/recruitment/RecruitmentAreaTab.vue'
import RecruitmentNoDepositTab from '@/components/recruitment/RecruitmentNoDepositTab.vue'
import RecruitmentCampusDialog from '@/components/recruitment/RecruitmentCampusDialog.vue'
import AllChannelSummaryCard from '@/components/recruitment/AllChannelSummaryCard.vue'
import { LazyBar, LazyLine } from '@/components/recruitment/lazyChartComponents'
import {
  GRADES_ORDER,
  FALLBACK_SCHOOL_LAT,
  FALLBACK_SCHOOL_LNG,
  TRAVEL_BANDS,
} from '@/constants/recruitment'
import { useTenantBranding } from '@/composables/useTenantBranding'

// 園所座標的三層優先序（scan-frontend GAP-08）：
//   後端 campus 設定 > 品牌 API 的 per-tenant 座標 > constants 的最終硬編 fallback。
// 中間這層是多租戶新增的：沒有它，第二間園所在還沒設 campus_lat/lng 前地圖會落在高雄。
const { branding } = useTenantBranding()
const brandingCampusLat = computed(() => branding.value.map.lat ?? FALLBACK_SCHOOL_LAT)
const brandingCampusLng = computed(() => branding.value.map.lng ?? FALLBACK_SCHOOL_LNG)

// -------- props / emits --------
const props = defineProps<{ dashboard: ReturnType<typeof useRecruitmentDashboard> }>()
const emit = defineEmits<{ 'drill-records': [patch: Record<string, unknown>] }>()

const {
  stats,
  options,
  loadingStats,
  exportingExcel,
  referenceMonth,
  statsSchoolYear,
  statsSemester,
  setReferenceMonth,
  handleExportExcel,
  fetchStats,
  fetchOptions,
} = props.dashboard

const termYearOptions = computed(() => {
  const y = currentRocYear()
  return [y + 1, y, y - 1, y - 2]
})

// -------- 常數 --------
const AREA_HOTSPOT_DISPLAY_LIMIT = 200
const AREA_HOTSPOT_SYNC_BATCH_SIZE = 20
const AREA_HOTSPOT_MAX_SYNC_ROUNDS = 100

// -------- 權限 --------
const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))

// -------- 狀態 --------
const activeStatsTab = ref('overview')
const loadingND = ref(false)
const ndLoaded = ref(false)
const areaLoaded = ref(false)

const monthOptions = computed(() => (options.value.months as string[] | undefined) ?? [])

// 未預繳分析
const ndData = ref<Record<string, unknown>[]>([])
const ndTotal = ref(0)
const emptyNDFilter = (): {
  priority: string
  reason: string | null
  grade: string | null
  overdue_days: number | null
  cold_only: boolean
  page: number
  page_size: number
} => ({
  priority: 'high',
  reason: null,
  grade: null,
  overdue_days: null,
  cold_only: false,
  page: 1,
  page_size: 50,
})
const emptyNDSummary = () => ({
  high_potential_count: 0,
  overdue_followup_count: 0,
  cold_count: 0,
})
const ndFilter = ref(emptyNDFilter())
const ndSummary = ref(emptyNDSummary())

const {
  loadingAreaHotspots,
  syncingAreaHotspotsMode,
  loadingMarket,
  syncingMarket,
  savingCampus,
  loadingNearbySchools,
  areaHotspotsSummary,
  campusSetting,
  marketSnapshot,
  nearbySchools,
  nearbySchoolsAvailable,
  nearbySchoolsMessage,
  selectedMarketDistrict,
  campusDialogVisible,
  campusForm,
  loadAreaTab: loadAreaData,
  handleAreaHotspotSync: syncAreaHotspotsAction,
  handleMarketSync: syncMarketAction,
  openCampusDialog,
  handleCampusSave: saveCampusSettingAction,
} = useRecruitmentArea({
  notifyError: (message) => ElMessage.error(message),
  notifyWarning: (message) => ElMessage.warning(message),
  notifySuccess: (message) => ElMessage.success(message),
  displayLimit: AREA_HOTSPOT_DISPLAY_LIMIT,
  syncBatchSize: AREA_HOTSPOT_SYNC_BATCH_SIZE,
  maxSyncRounds: AREA_HOTSPOT_MAX_SYNC_ROUNDS,
  fallbackCampusLat: brandingCampusLat.value,
  fallbackCampusLng: brandingCampusLng.value,
})

const invalidateLazyTabs = () => {
  ndLoaded.value = false
  areaLoaded.value = false
}

const isChartTabActive = (tabName: string) => activeStatsTab.value === tabName

const fetchNoDeposit = async () => {
  loadingND.value = true
  try {
    const params: Record<string, unknown> = { page: ndFilter.value.page, page_size: ndFilter.value.page_size }
    if (ndFilter.value.priority) params.priority = ndFilter.value.priority
    if (ndFilter.value.reason) params.reason = ndFilter.value.reason
    if (ndFilter.value.grade) params.grade = ndFilter.value.grade
    if (ndFilter.value.overdue_days) params.overdue_days = ndFilter.value.overdue_days
    if (ndFilter.value.cold_only) params.cold_only = true
    const res = await getNoDepositAnalysis(params)
    ndData.value = res.data.records
    ndTotal.value = res.data.total
    ndSummary.value = {
      ...emptyNDSummary(),
      ...(res.data.summary || {}),
    }
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入未預繳資料失敗'))
    return false
  } finally {
    loadingND.value = false
  }
}

const loadNoDepositTab = async (force = false) => {
  const [ndOk] = await Promise.all([
    fetchNoDeposit(),
    fetchOptions(force),
  ])
  if (ndOk) ndLoaded.value = true
}

const loadAreaTab = async () => {
  const ok = await loadAreaData()
  if (ok) {
    areaLoaded.value = true
    // 自動同步市場情報（背景執行，不阻塞頁面）
    if (canWrite.value) handleMarketSync()
  }
}

const handleAreaHotspotSync = async (mode = 'incremental') => {
  const ok = await syncAreaHotspotsAction(mode)
  if (ok) areaLoaded.value = true
}

const handleMarketSync = async () => {
  const ok = await syncMarketAction()
  if (ok) areaLoaded.value = true
}

const handleSetAsCampus = async (data: Record<string, unknown>) => {
  const lat = data.lat as number
  const lng = data.lng as number
  const address = data.address as string | undefined
  campusForm.value = {
    ...campusSetting.value,
    campus_lat: lat,
    campus_lng: lng,
    ...(address ? { campus_address: address } : {}),
  }
  const ok = await saveCampusSettingAction()
  if (ok) areaLoaded.value = true
}

const handleCampusSave = async () => {
  const ok = await saveCampusSettingAction()
  if (ok) areaLoaded.value = true
}

const handleReferenceMonthChange = async (value: string | null) => {
  await setReferenceMonth(value || null)
}

const onTabClick = async (tab: { paneName?: string | number }) => {
  const paneName = tab?.paneName ? String(tab.paneName) : ''
  if (paneName) activeStatsTab.value = paneName
  if (paneName === 'nodeposit' && !ndLoaded.value) await loadNoDepositTab()
  if (paneName === 'area' && !areaLoaded.value) await loadAreaTab()
}

// -------- 篩選 --------
const applyNoDepositFilter = async (patch = {}) => {
  ndFilter.value = {
    ...emptyNDFilter(),
    page_size: ndFilter.value.page_size,
    ...patch,
    page: 1,
  }
  activeStatsTab.value = 'nodeposit'
  await loadNoDepositTab(true)
}

const handleDashboardTarget = async (target: Record<string, unknown> = {}) => {
  const targetTab = target.target_tab as string | undefined
  const targetFilter = (target.target_filter || {}) as Record<string, unknown>

  if (targetTab === 'detail') {
    emit('drill-records', targetFilter)
    return
  }

  if (targetTab === 'nodeposit') {
    await applyNoDepositFilter(targetFilter)
    return
  }

  if (targetTab === 'area') {
    activeStatsTab.value = 'area'
    await loadAreaTab()
    if (targetFilter.district) selectedMarketDistrict.value = String(targetFilter.district)
  }
}

const onNoDepositFilterChange = () => {
  ndFilter.value.page = 1
  fetchNoDeposit()
}

const onNDPageChange = (page: number) => {
  ndFilter.value.page = page
  fetchNoDeposit()
}

// -------- 輔助函式 --------
const fmtPct = (deposit: number, visit: number) => {
  if (!visit) return '0%'
  return (deposit / visit * 100).toFixed(1) + '%'
}

/** 將後端回傳的百分比數值格式化為字串，如 51.8 → "51.8%" */
const fmtRate = (rate: number | null | undefined) => {
  if (rate == null || rate === 0) return '0%'
  return Number(rate).toFixed(1) + '%'
}

// -------- 圖表資料 & options（全部從 composable 取得）--------
const {
  monthlyTableData,
  monthlyBarData,
  monthlyRateData,
  monthlyBarOptions,
  classBarOptions,
  sourceClickBarOptions,
  classBarData,
  classRateData,
  monthGradeTableData,
  sourceBarData,
  sourceRateData,
  staffBarData,
  staffRateData,
  noDepositReasonBarData,
  noDepositGradeBarData,
  barOptions,
  horizBarOptions,
  percentBarOptions,
  percentHorizBarOptions,
  percentLineOptions,
  noDepositGradeBarOptions,
} = useRecruitmentCharts({
  stats: stats as unknown as Parameters<typeof useRecruitmentCharts>[0]['stats'],
  marketSnapshot,
  drillToDetail: (patch) => emit('drill-records', patch),
})

// -------- 區域分析：本園座標合併（含市場情報回傳覆蓋）--------
const currentCampus = computed(() => ({
  ...createEmptyCampus(brandingCampusLat.value, brandingCampusLng.value),
  ...campusSetting.value,
  ...(marketSnapshot.value.campus || {}),
  campus_lat: marketSnapshot.value.campus?.campus_lat ?? campusSetting.value.campus_lat ?? brandingCampusLat.value,
  campus_lng: marketSnapshot.value.campus?.campus_lng ?? campusSetting.value.campus_lng ?? brandingCampusLng.value,
}))

// -------- 接待分析：交叉分析 computed helper（解決 stats.referrer_source_cross 為 unknown 的 template 型別問題）--------
interface ReferrerSourceCross {
  referrers?: Record<string, unknown>[]
  sources?: string[]
}
const referrerSourceCross = computed((): ReferrerSourceCross =>
  (stats.value.referrer_source_cross as ReferrerSourceCross | undefined) ?? {}
)

// -------- stats arrays 型別轉換（stats 為 Record<string,unknown>，各欄位 .value 為 unknown）--------
const statsByGrade = computed((): Record<string, unknown>[] =>
  (stats.value.by_grade as Record<string, unknown>[] | undefined) ?? []
)
const statsBySource = computed((): Record<string, unknown>[] =>
  (stats.value.by_source as Record<string, unknown>[] | undefined) ?? []
)
const statsByReferrer = computed((): Record<string, unknown>[] =>
  (stats.value.by_referrer as Record<string, unknown>[] | undefined) ?? []
)
const statsDecisionSummary = computed((): Record<string, unknown> =>
  (stats.value.decision_summary as Record<string, unknown> | undefined) ?? {}
)
const statsFunnelSnapshot = computed((): Record<string, unknown> =>
  (stats.value.funnel_snapshot as Record<string, unknown> | undefined) ?? {}
)
const statsMonthOverMonth = computed((): Record<string, unknown> =>
  (stats.value.month_over_month as Record<string, unknown> | undefined) ?? {}
)
const statsAlerts = computed((): Record<string, unknown>[] =>
  (stats.value.alerts as Record<string, unknown>[] | undefined) ?? []
)
const statsTopActionQueue = computed((): Record<string, unknown>[] =>
  (stats.value.top_action_queue as Record<string, unknown>[] | undefined) ?? []
)

// -------- options 型別轉換 --------
const noDepositReasonOptions = computed((): string[] =>
  (options.value.no_deposit_reasons as string[] | undefined) ?? []
)

// -------- component / function 型別轉換（template 不支援複雜 union function 型別）--------
type UnknownFn = (...args: unknown[]) => unknown
type ComponentLike = Record<string, unknown> | UnknownFn
const castBarComponent = computed((): ComponentLike => LazyBar as ComponentLike)
const castLineComponent = computed((): ComponentLike => LazyLine as ComponentLike)
const castFmtRate = computed((): UnknownFn => fmtRate as UnknownFn)
const castFmtPct = computed((): UnknownFn => fmtPct as UnknownFn)

// 供測試/父層直接呼叫
defineExpose({ openCampusDialog, invalidateLazyTabs })
</script>

<style scoped>
/* ── Design Tokens ── */
.stats-panel {
  --rv-primary:      #1e40af;
  --rv-primary-lt:   #dbeafe;
  --rv-secondary:    #3b82f6;
  --rv-accent:       #d97706;
  --rv-bg:           #f8fafc;
  --rv-surface:      #ffffff;
  --rv-muted:        #e9eef6;
  --rv-border:       #dbeafe;
  --rv-text:         #1e293b;
  --rv-text-2:       #64748b;
  --rv-success:      #16a34a;
  --rv-danger:       #dc2626;
  --rv-font-num:     'Fira Code', ui-monospace, monospace;
}

.panel-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.panel-toolbar-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 2px;
}

.form-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 12px 0 8px;
  line-height: 1.4;
}
.form-section-title:first-child {
  margin-top: 0;
}
/* 註：舊 :deep(.kpi-row/.kpi-card/.kpi-value/.kpi-label/.kpi-sub) 已移除——
   統計面板現有六個子分頁內無人使用（AreaTab 用自己的 .area-kpi-* 與 scoped .kpi-label），
   使用 .kpi-card 的 Ivykids/Chuannian/Periods tab 皆不在本面板底下。 */
:deep(.chart-row) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
:deep(.chart-card) { overflow: hidden; }
:deep(.chart-box) {
  height: 280px;
  position: relative;
}
:deep(.chart-box-tall) { height: 360px; }
:deep(.filter-bar) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
:deep(.record-count) {
  margin-left: auto;
  font-size: 0.85rem;
  color: #718096;
}
:deep(.pagination) {
  margin-top: 12px;
  justify-content: flex-end;
}
:deep(.deposit-row) { background: #f0fff4 !important; }

/* -------- 區域分析：標頭 -------- */
.area-header-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--rv-surface, #fff);
  border: 1px solid var(--rv-border, #DBEAFE);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(30, 64, 175, 0.06);
}
.area-campus-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 180px;
}
.area-campus-name {
  font-weight: 700;
  font-size: 0.97rem;
  color: var(--rv-text, #1e293b);
}
.area-campus-addr {
  font-size: 0.8rem;
  color: var(--rv-text-2, #64748b);
}
.area-campus-coord {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  font-family: 'Fira Code', ui-monospace, monospace;
}
.area-header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.area-sync-time {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

/* -------- 園所座標狀態 -------- */
.area-campus-coord-warn {
  color: #c05621 !important;
  font-weight: 600;
}

.campus-coord-preview {
  margin-bottom: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f0fff4;
  border: 1px solid #c6f6d5;
  font-size: 0.8rem;
  color: #276749;
}
.campus-coord-preview a {
  color: #276749;
}

/* -------- 區域 KPI 卡片 -------- */
.area-kpi-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

@media (max-width: 560px) {
  .area-kpi-row { grid-template-columns: 1fr; }
}

.area-kpi-card {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.area-kpi-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.area-kpi-denom {
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--text-tertiary);
}
.area-kpi-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.area-kpi-sub {
  margin-top: 6px;
}
.area-kpi-sub--muted {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}
/* 註：舊 .area-kpi-bar-* 與 .rate-cell、.rate-bar-*、.rate-label 已移除——
   scoped 且本面板 template 無任何消費者（AreaTab 用自己的 .dc-rate-* 進度條），
   屬區域分頁抽離後殘留的死 CSS（2026-07-20 UI 稽核清除，含被點名的 width transition）。 */

/* -------- 通勤時間 badge -------- */
.travel-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.travel-badge--green  { background: var(--color-success-soft); color: var(--color-success-darker); }
.travel-badge--yellow { background: var(--color-warning-soft); color: var(--color-warning-darker); }
.travel-badge--orange { background: #ffedd5; color: #c2410c; }
.text-muted { color: var(--neutral-300); }

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

/* -------- 行政區比較表 -------- */
.area-table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.area-table-hint {
  font-size: 0.75rem;
  color: #a0aec0;
  font-weight: 400;
}
.area-table-filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px 2px 10px;
  background: var(--color-info-soft);
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--color-info-darker);
  font-weight: 600;
}
:deep(.district-row-selected td) {
  background: #f0fff4 !important;
  font-weight: 600;
}
:deep(.district-row-selected td .cell) {
  color: #22543d;
}

@media (--to-sm) {
  .area-header-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (--to-sm) {
  .panel-toolbar {
    flex-wrap: wrap;
  }

  :deep(.chart-row) {
    grid-template-columns: 1fr;
  }

  :deep(.chart-box) {
    height: 240px;
  }

  :deep(.chart-box-tall) {
    height: 300px;
  }
}
</style>

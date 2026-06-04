<template>
  <div class="recruitment-view" v-loading="loadingStats">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="page-title">招生統計儀表板</h2>
          <p class="page-subtitle">招生漏斗 · 轉換率 · 區域分析</p>
        </div>
      </div>
      <div class="header-actions">
        <el-select
          v-model="referenceMonth"
          size="small"
          placeholder="參考月份"
          clearable
          style="width: 140px"
          @change="handleReferenceMonthChange"
        >
          <el-option
            v-for="month in options.months"
            :key="month"
            :label="month"
            :value="month"
          />
        </el-select>
        <el-button
          v-if="canWrite"
          size="small"
          @click="openMonthDialog"
        >管理月份</el-button>
        <el-button
          type="success"
          size="small"
          :loading="exportingExcel"
          @click="handleExportExcel"
        >匯出 Excel</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          size="small"
          @click="openAddDialog"
        >新增訪視記錄</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-click="onTabClick">
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
        />
      </el-tab-pane>

      <!-- ==================== 班別分析 ==================== -->
      <el-tab-pane label="班別分析" name="class" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各班別參觀人數</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('class') && classBarData" :data="classBarData" :options="castChartOpts(classBarOptions)" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>各班別預繳率</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('class') && classRateData" :data="classRateData" :options="castChartOpts(percentHorizBarOptions)" />
            </div>
          </el-card>
        </div>
        <el-card style="margin-bottom:16px">
          <template #header>班別統計</template>
          <el-table :data="statsByGrade" border stripe size="small">
            <el-table-column prop="grade" label="班別" width="100" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card>
          <template #header>月份 × 班別分布</template>
          <el-table :data="monthGradeTableData" border stripe size="small">
            <el-table-column prop="month" label="月份" width="90" fixed="left" />
            <el-table-column
              v-for="g in GRADES_ORDER"
              :key="g"
              :label="g"
              :prop="g"
              align="center"
              width="80"
            />
            <el-table-column prop="合計" label="合計" align="center" width="80" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ==================== 來源分析 ==================== -->
      <el-tab-pane label="來源分析" name="source" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>各來源參觀人數排名</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('source') && sourceBarData" :data="sourceBarData" :options="castChartOpts(sourceClickBarOptions)" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>各來源預繳率</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('source') && sourceRateData" :data="sourceRateData" :options="castChartOpts(percentHorizBarOptions)" />
            </div>
          </el-card>
        </div>
        <el-card>
          <template #header>來源排名明細</template>
          <el-table :data="statsBySource" border stripe size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="source" label="來源" min-width="120" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ==================== 接待分析 ==================== -->
      <el-tab-pane label="接待分析" name="staff" lazy>
        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>接待人員參觀量</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('staff') && staffBarData" :data="staffBarData" :options="castChartOpts(barOptions)" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>接待人員預繳率</template>
            <div class="chart-box">
              <Bar v-if="isChartTabActive('staff') && staffRateData" :data="staffRateData" :options="castChartOpts(percentBarOptions)" />
            </div>
          </el-card>
        </div>
        <el-card style="margin-bottom:16px">
          <template #header>接待人員統計</template>
          <el-table :data="statsByReferrer" border stripe size="small">
            <el-table-column prop="referrer" label="接待人員" width="120" />
            <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
            <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
            <el-table-column label="預繳率" align="center" width="100">
              <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card style="margin-bottom:16px">
          <template #header>接待人員 × 各年級預繳率</template>
          <el-table :data="statsByReferrer" border stripe size="small">
            <el-table-column prop="referrer" label="接待人員" width="120" fixed="left" />
            <el-table-column
              v-for="g in GRADES_ORDER"
              :key="g"
              :label="g"
              align="center"
              width="120"
            >
              <template #default="{ row }">
                <template v-if="row.by_grade && (row.by_grade as Record<string, Record<string, number>>)[g]">
                  {{ (row.by_grade as Record<string, Record<string, number>>)[g].visit }}人 / {{ fmtPct((row.by_grade as Record<string, Record<string, number>>)[g].deposit, (row.by_grade as Record<string, Record<string, number>>)[g].visit) }}
                </template>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        <el-card v-if="referrerSourceCross.referrers && referrerSourceCross.referrers.length">
          <template #header>介紹者 × 來源 交叉分析</template>
          <el-table :data="referrerSourceCross.referrers" border stripe size="small" style="overflow-x:auto">
            <el-table-column prop="referrer" label="介紹者" width="110" fixed="left" />
            <el-table-column
              v-for="src in referrerSourceCross.sources"
              :key="src"
              :label="src"
              align="center"
              min-width="90"
            >
              <template #default="{ row }">
                {{ row.sources[src] ?? 0 }}
              </template>
            </el-table-column>
            <el-table-column label="合計" align="center" width="70">
              <template #default="{ row }">{{ row.total }}</template>
            </el-table-column>
          </el-table>
        </el-card>
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
          :bar-component="Bar"
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

      <!-- ==================== 童年綠地分析 ==================== -->
      <el-tab-pane label="童年綠地" name="chuannian" lazy>
        <div class="kpi-row">
          <el-card class="kpi-card kpi-green" shadow="hover">
            <div class="kpi-value">{{ stats.chuannian_visit ?? 0 }}</div>
            <div class="kpi-label">童年綠地參觀總數</div>
            <div class="kpi-sub">含雅婷班導認列</div>
          </el-card>
          <el-card class="kpi-card kpi-green" shadow="hover">
            <div class="kpi-value">{{ stats.chuannian_deposit ?? 0 }}</div>
            <div class="kpi-label">其中已預繳</div>
          </el-card>
          <el-card class="kpi-card" shadow="hover">
            <div class="kpi-value">{{ chuannianNoDeposit }}</div>
            <div class="kpi-label">其中未預繳</div>
          </el-card>
          <el-card class="kpi-card kpi-blue" shadow="hover">
            <div class="kpi-value">{{ fmtPct(Number(stats.chuannian_deposit), Number(stats.chuannian_visit)) }}</div>
            <div class="kpi-label">童年綠地預繳率</div>
          </el-card>
          <el-card class="kpi-card" shadow="hover">
            <div class="kpi-value">{{ fmtPct(Number(stats.chuannian_visit), Number(stats.total_visit)) }}</div>
            <div class="kpi-label">佔總參觀比例</div>
          </el-card>
        </div>

        <div class="chart-row">
          <el-card class="chart-card">
            <template #header>預計就讀月份分佈（參觀 vs 預繳）</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('chuannian') && chuannianExpectedBarData" :data="chuannianExpectedBarData" :options="castChartOpts(barOptions)" />
            </div>
          </el-card>
          <el-card class="chart-card">
            <template #header>童年綠地各班別分佈</template>
            <div class="chart-box chart-box-tall">
              <Bar v-if="isChartTabActive('chuannian') && chuannianGradeBarData" :data="chuannianGradeBarData" :options="castChartOpts(horizBarOptions)" />
            </div>
          </el-card>
        </div>

        <div class="chart-row" style="margin-bottom:0">
          <el-card>
            <template #header>預計就讀月份明細</template>
            <el-table
              v-if="chuannianByExpected.length"
              :data="chuannianByExpected"
              border stripe size="small"
            >
              <el-table-column prop="expected_month" label="預計就讀月份" min-width="140" />
              <el-table-column prop="visit" label="人數" align="center" width="80" />
              <el-table-column prop="deposit" label="預繳" align="center" width="80" />
              <el-table-column label="未預繳" align="center" width="80">
                <template #default="{ row }">{{ row.visit - row.deposit }}</template>
              </el-table-column>
              <el-table-column label="預繳率" align="center" width="100">
                <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暫無童年綠地資料" />
          </el-card>
          <el-card>
            <template #header>童年綠地各班別統計</template>
            <el-table
              v-if="chuannianByGrade.length"
              :data="chuannianByGrade"
              border stripe size="small"
            >
              <el-table-column prop="grade" label="班別" width="100" />
              <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
              <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
              <el-table-column label="預繳率" align="center" width="100">
                <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- ==================== 近五年轉換整合 ==================== -->
      <el-tab-pane label="近五年轉換" name="periods" lazy>
        <RecruitmentPeriodsTab
          :can-write="canWrite"
          :show-charts="isChartTabActive('periods')"
          :periods-summary="(periodsSummary as unknown as Record<string, unknown> | null)"
          :periods="(periods as Record<string, unknown>[])"
          :loading-periods="loadingPeriods"
          :periods-trend-data="periodsTrendData"
          :periods-count-bar-data="periodsCountBarData"
          :line-options="(percentLineOptions as Record<string, unknown>)"
          :bar-options="(barOptions as Record<string, unknown>)"
          :line-component="castLineComponent"
          :bar-component="castBarComponent"
          :fmt-rate="castFmtRate"
          @open-add="openPeriodAdd"
          @sync="(id) => handlePeriodSync(id as number)"
          @edit="openPeriodEdit"
          @delete="(id) => handlePeriodDelete(id as number)"
        />
      </el-tab-pane>

      <!-- ==================== 名額規劃 ==================== -->
      <el-tab-pane label="名額規劃" name="intake" lazy>
        <IntakePlanPanel />
      </el-tab-pane>

      <!-- ==================== 原始明細 ==================== -->
      <el-tab-pane label="原始明細" name="detail" lazy>
        <RecruitmentDetailTab
          :can-write="canWrite"
          :can-convert="canConvert"
          :options="options"
          :filters="filter"
          :detail-data="detailData"
          :detail-total="detailTotal"
          :loading-detail="loadingDetail"
          :row-class-name="depositRowClass"
          @update-filter="updateDetailFilter"
          @filter-change="fetchDetail"
          @keyword-input="fetchDetailDebounced"
          @clear-filter="clearFilter"
          @page-change="onPageChange"
          @edit="openEditDialog"
          @delete="(id) => handleDelete(id as number)"
          @convert="openConvertDialog"
        />
      </el-tab-pane>

      <el-tab-pane label="招生漏斗" name="funnel" lazy>
        <FunnelBoard />
      </el-tab-pane>
    </el-tabs>

    <!-- ==================== 管理月份 Dialog ==================== -->
    <RecruitmentMonthDialog
      v-model:visible="monthDialogVisible"
      @changed="handleMonthsChanged"
    />

    <!-- ==================== 新增/編輯訪視記錄 Dialog ==================== -->
    <RecruitmentRecordDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :form="form"
      :saving="saving"
      :district-suggestions="districtSuggestions"
      :source-suggestions="((options.sources as string[] | undefined) || [])"
      :referrer-suggestions="((options.referrers as string[] | undefined) || [])"
      :no-deposit-reasons="((options.no_deposit_reasons as string[] | undefined) || [])"
      @save="handleSave"
    />

    <!-- ==================== 近五年期間 Dialog ==================== -->
    <RecruitmentPeriodDialog
      v-model:visible="periodDialogVisible"
      :mode="periodDialogMode"
      :form="periodForm"
      :saving="savingPeriod"
      @save="handlePeriodSave"
    />

    <RecruitmentCampusDialog
      v-model:visible="campusDialogVisible"
      :form="campusForm"
      :saving="savingCampus"
      @save="handleCampusSave"
    />

    <RecruitmentConvertDialog
      v-model="convertDialogVisible"
      :visit="castConvertVisit"
      :classroom-options="classroomOptions"
      @converted="onConverted"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRecruitmentRecords,
  createRecruitmentRecord,
  updateRecruitmentRecord,
  deleteRecruitmentRecord,
  getNoDepositAnalysis,
  createPeriod,
  updatePeriod,
  deletePeriod,
  syncPeriod,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useRecruitmentArea, createEmptyCampus } from '@/composables/useRecruitmentArea'
import { useRecruitmentPeriods } from '@/composables/useRecruitmentPeriods'
import RecruitmentOverviewTab from '@/components/recruitment/RecruitmentOverviewTab.vue'
import RecruitmentAreaTab from '@/components/recruitment/RecruitmentAreaTab.vue'
import RecruitmentNoDepositTab from '@/components/recruitment/RecruitmentNoDepositTab.vue'
import RecruitmentPeriodsTab from '@/components/recruitment/RecruitmentPeriodsTab.vue'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'
import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'
import RecruitmentConvertDialog from '@/components/recruitment/RecruitmentConvertDialog.vue'
import { useClassroomStore } from '@/stores/classroom'
import { useRouter } from 'vue-router'
import RecruitmentMonthDialog from '@/components/recruitment/RecruitmentMonthDialog.vue'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import RecruitmentPeriodDialog from '@/components/recruitment/RecruitmentPeriodDialog.vue'
import RecruitmentCampusDialog from '@/components/recruitment/RecruitmentCampusDialog.vue'
import { useRecruitmentCharts } from '@/composables/useRecruitmentCharts'
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'
import { toAdYear } from '@/utils/academic'
import {
  GRADES_ORDER,
  FALLBACK_SCHOOL_LAT,
  FALLBACK_SCHOOL_LNG,
  TRAVEL_BANDS,
} from '@/constants/recruitment'


// -------- Chart.js 延遲載入 --------
let _chartReady: Promise<void> | null = null
const ensureChartReady = (): Promise<void> => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement,
      PointElement, LineElement, ArcElement,
      Title, Tooltip, Legend,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, BarElement,
        PointElement, LineElement, ArcElement,
        Title, Tooltip, Legend,
      )
    })
  }
  return _chartReady
}

const Bar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)
const Line = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line))
)
// -------- 常數 --------
const AREA_HOTSPOT_DISPLAY_LIMIT = 200
const AREA_HOTSPOT_SYNC_BATCH_SIZE = 20
const AREA_HOTSPOT_MAX_SYNC_ROUNDS = 100

// -------- 權限 --------
const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const canConvert = computed(() => hasPermission('RECRUITMENT_CONVERT'))

// -------- 轉化為學生 --------
const router = useRouter()
const convertDialogVisible = ref(false)
const convertTargetVisit = ref<Record<string, unknown> | null>(null)
const classroomOptions = ref<{ id: number; name: string }[]>([])
const classroomStore = useClassroomStore()

async function loadClassroomsOnce() {
  try {
    await classroomStore.fetchClassrooms()
    classroomOptions.value = (classroomStore.classrooms as { id: number; name: string }[]) || []
  } catch {
    // 失敗靜默：不阻擋 dialog 開啟，使用者仍可不選班級
    classroomOptions.value = []
  }
}

async function openConvertDialog(row: Record<string, unknown>) {
  if (row?.enrolled) {
    ElMessage.warning('此訪視已標記為已報到')
    return
  }
  convertTargetVisit.value = row
  await loadClassroomsOnce()
  convertDialogVisible.value = true
}

function onConverted(result: Record<string, unknown>) {
  // 更新此筆訪視記錄的 enrolled 狀態
  if (convertTargetVisit.value) {
    const targetId = convertTargetVisit.value.id
    const target = detailData.value.find((r) => r.id === targetId)
    if (target) target.enrolled = true
  }
  // 提供跳轉學生檔案的選項
  ElMessageBox.confirm(
    `學生已建立（ID #${result.student_id}），是否立即查看檔案？`,
    '轉化成功',
    { confirmButtonText: '查看檔案', cancelButtonText: '留在本頁', type: 'success' },
  )
    .then(() => {
      router.push({ name: 'student-profile', params: { id: String(result.student_id) } })
    })
    .catch(() => { /* 留在本頁 */ })
}

// -------- 狀態 --------
const activeTab = ref('overview')
const loadingDetail = ref(false)
const loadingND = ref(false)
const saving = ref(false)
const detailLoaded = ref(false)
const ndLoaded = ref(false)
const areaLoaded = ref(false)
const periodsLoaded = ref(false)

const savingPeriod = ref(false)

const detailData = ref<Record<string, unknown>[]>([])
const detailTotal = ref(0)
const filter = ref<{
  month: string | null
  grade: string | null
  source: string | null
  referrer: string | null
  has_deposit: boolean | null
  no_deposit_reason: string | null
  keyword: string
  page: number
  page_size: number
  [key: string]: unknown
}>({
  month: null, grade: null, source: null, referrer: null,
  has_deposit: null, no_deposit_reason: null, keyword: '',
  page: 1, page_size: 50,
})

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
  stats,
  options,
  loadingStats,
  exportingExcel,
  referenceMonth,
  invalidateOptions,
  fetchOptions,
  fetchStats,
  loadDashboard,
  setReferenceMonth,
  handleExportExcel,
} = useRecruitmentDashboard({
  notifyError: (message) => ElMessage.error(message),
})

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
  fallbackCampusLat: FALLBACK_SCHOOL_LAT,
  fallbackCampusLng: FALLBACK_SCHOOL_LNG,
})

const {
  loadingPeriods,
  periods,
  periodsSummary,
  fetchPeriods,
} = useRecruitmentPeriods({
  notifyError: (message) => ElMessage.error(message),
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const fetchDetailDebounced = () => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDetail(), 400)
}

const invalidateLazyTabs = () => {
  detailLoaded.value = false
  ndLoaded.value = false
  areaLoaded.value = false
  periodsLoaded.value = false

}

const isChartTabActive = (tabName: string) => activeTab.value === tabName

// -------- 訪視記錄 Dialog --------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const editingId = ref<number | null>(null)
const emptyForm = (): {
  month: string
  month_raw: string | null
  seq_no: string
  visit_date: string
  child_name: string
  birthday: string | null
  grade: string | null
  phone: string
  address: string
  district: string
  source: string
  referrer: string
  deposit_collector: string
  has_deposit: boolean
  enrolled: boolean
  transfer_term: boolean
  no_deposit_reason: string | null
  no_deposit_reason_detail: string
  notes: string
  parent_response: string
  geocoding_consent: boolean
} => ({
  month: '', month_raw: null, seq_no: '', visit_date: '', child_name: '',
  birthday: null, grade: null, phone: '', address: '',
  district: '', source: '', referrer: '', deposit_collector: '',
  has_deposit: false, enrolled: false, transfer_term: false,
  no_deposit_reason: null, no_deposit_reason_detail: '',
  notes: '', parent_response: '',
  geocoding_consent: false,
})
const form = ref(emptyForm())

// -------- 近五年期間 Dialog --------
const periodDialogVisible = ref(false)
const periodDialogMode = ref('add')
const editingPeriodId = ref<number | null>(null)
const emptyPeriodForm = () => ({
  period_name: '', visit_count: 0, deposit_count: 0,
  enrolled_count: 0, transfer_term_count: 0, effective_deposit_count: 0,
  not_enrolled_deposit: 0, enrolled_after_school: 0, notes: '', sort_order: 0,
})
const periodForm = ref(emptyPeriodForm())

// -------- 管理月份 Dialog（MonthDialog 內部自行 load/add/delete，這裡只處理通知）--------
const monthDialogVisible = ref(false)
const openMonthDialog = () => { monthDialogVisible.value = true }

const handleMonthsChanged = async () => {
  invalidateOptions()
  if (detailLoaded.value || ndLoaded.value) {
    await fetchOptions(true)
  }
}

// -------- 日期轉換（僅保留 openEditDialog 還需要的兩個）--------
const rocDateToISO = (roc: string) => {
  if (!roc) return null
  const parts = roc.split('.')
  if (parts.length < 3) return null
  const year = toAdYear(parseInt(parts[0]))
  return `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
}
const rocMonthToISO = (rm: string) => {
  if (!rm) return null
  const parts = rm.split('.')
  if (parts.length < 2) return null
  const year = toAdYear(parseInt(parts[0]))
  return `${year}-${parts[1].padStart(2, '0')}`
}

// 訪視記錄對話框內的 form helpers（watch / _makeSuggestions / onDepositChange）
// 已搬到 RecruitmentRecordDialog.vue；這裡僅保留 district 建議清單的 computed。
const districtSuggestions = computed((): string[] =>
  ((stats.value.by_district as { district?: string }[] | undefined) || [])
    .map((d) => d.district)
    .filter((d): d is string => typeof d === 'string')
)

const fetchDetail = async () => {
  loadingDetail.value = true
  try {
    const params: Record<string, unknown> = { page: filter.value.page, page_size: filter.value.page_size }
    if (filter.value.month) params.month = filter.value.month
    if (filter.value.grade) params.grade = filter.value.grade
    if (filter.value.source) params.source = filter.value.source
    if (filter.value.referrer) params.referrer = filter.value.referrer
    if (filter.value.has_deposit !== null && filter.value.has_deposit !== undefined)
      params.has_deposit = filter.value.has_deposit
    if (filter.value.no_deposit_reason) params.no_deposit_reason = filter.value.no_deposit_reason
    if (filter.value.keyword) params.keyword = filter.value.keyword

    const res = await getRecruitmentRecords(params)
    detailData.value = res.data.records
    detailTotal.value = res.data.total
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入明細失敗'))
    return false
  } finally {
    loadingDetail.value = false
  }
}

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

const loadDetailTab = async (force = false) => {
  const [detailOk] = await Promise.all([
    fetchDetail(),
    fetchOptions(force),
  ])
  if (detailOk) detailLoaded.value = true
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

const loadPeriodsTab = async () => {
  const ok = await fetchPeriods()
  if (ok) periodsLoaded.value = true
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

// 地址 → 座標 geocode 已搬到 RecruitmentCampusDialog.vue

onMounted(() => {
  loadDashboard()
})

const handleReferenceMonthChange = async (value: string | null) => {
  await setReferenceMonth(value || null)
}

const onTabClick = async (tab: { paneName?: string | number }) => {
  const paneName = tab?.paneName ? String(tab.paneName) : ''
  if (paneName) activeTab.value = paneName
  if (paneName === 'detail' && !detailLoaded.value) await loadDetailTab()
  if (paneName === 'nodeposit' && !ndLoaded.value) await loadNoDepositTab()
  if (paneName === 'area' && !areaLoaded.value) await loadAreaTab()
  if (paneName === 'periods' && !periodsLoaded.value) await loadPeriodsTab()
}

// -------- 篩選 --------
const clearFilter = () => {
  filter.value = {
    ...filter.value,
    month: null, grade: null, source: null, referrer: null,
    has_deposit: null, no_deposit_reason: null, keyword: '', page: 1,
  }
  fetchDetail()
}

const updateDetailFilter = (patch: Record<string, unknown>) => {
  filter.value = {
    ...filter.value,
    ...patch,
  }
}

const drillToDetail = (patch: Record<string, unknown>) => {
  filter.value = {
    month: null, grade: null, source: null, referrer: null,
    has_deposit: null, no_deposit_reason: null, keyword: '',
    page: 1, page_size: filter.value.page_size,
    ...patch,
  }
  activeTab.value = 'detail'
  detailLoaded.value = true
  fetchDetail()
}

const applyNoDepositFilter = async (patch = {}) => {
  ndFilter.value = {
    ...emptyNDFilter(),
    page_size: ndFilter.value.page_size,
    ...patch,
    page: 1,
  }
  activeTab.value = 'nodeposit'
  await loadNoDepositTab(true)
}

const handleDashboardTarget = async (target: Record<string, unknown> = {}) => {
  const targetTab = target.target_tab as string | undefined
  const targetFilter = (target.target_filter || {}) as Record<string, unknown>

  if (targetTab === 'detail') {
    filter.value = {
      month: null,
      grade: null,
      source: null,
      referrer: null,
      has_deposit: null,
      no_deposit_reason: null,
      keyword: '',
      page: 1,
      page_size: filter.value.page_size,
      ...targetFilter,
    }
    activeTab.value = 'detail'
    await loadDetailTab(true)
    return
  }

  if (targetTab === 'nodeposit') {
    await applyNoDepositFilter(targetFilter)
    return
  }

  if (targetTab === 'area') {
    activeTab.value = 'area'
    await loadAreaTab()
    if (targetFilter.district) selectedMarketDistrict.value = String(targetFilter.district)
  }
}

const onPageChange = (page: number) => {
  filter.value.page = page
  fetchDetail()
}

const onNoDepositFilterChange = () => {
  ndFilter.value.page = 1
  fetchNoDeposit()
}

const onNDPageChange = (page: number) => {
  ndFilter.value.page = page
  fetchNoDeposit()
}

// -------- 訪視記錄 CRUD --------
const openAddDialog = async () => {
  await fetchOptions()
  form.value = emptyForm()
  dialogMode.value = 'add'
  editingId.value = null
  dialogVisible.value = true
}

const openEditDialog = async (row: Record<string, unknown>) => {
  await fetchOptions()
  form.value = {
    month: String(row.month ?? ''),
    month_raw: rocDateToISO(String(row.visit_date ?? '')) ?? rocMonthToISO(String(row.month ?? '')),
    seq_no: String(row.seq_no ?? ''),
    visit_date: String(row.visit_date ?? ''),
    child_name: String(row.child_name ?? ''),
    birthday: (row.birthday ?? null) as string | null,
    grade: (row.grade ?? null) as string | null,
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    district: String(row.district ?? ''),
    source: String(row.source ?? ''),
    referrer: String(row.referrer ?? ''),
    deposit_collector: String(row.deposit_collector ?? ''),
    has_deposit: Boolean(row.has_deposit),
    enrolled: Boolean(row.enrolled ?? false),
    transfer_term: Boolean(row.transfer_term ?? false),
    no_deposit_reason: (row.no_deposit_reason ?? null) as string | null,
    no_deposit_reason_detail: String(row.no_deposit_reason_detail ?? ''),
    notes: String(row.notes ?? ''),
    parent_response: String(row.parent_response ?? ''),
    geocoding_consent: Boolean(row.geocoding_consent ?? false),
  }
  dialogMode.value = 'edit'
  editingId.value = row.id as number | null
  dialogVisible.value = true
}

const handleSave = async () => {
  // Dialog 內部已經驗證過表單（RecruitmentRecordDialog 的 handleSave）
  saving.value = true
  // 排除前端內部用的 month_raw，不送到後端
  const { month_raw: _mr, ...payload } = form.value
  try {
    if (dialogMode.value === 'add') {
      await createRecruitmentRecord(payload)
      ElMessage.success('新增成功')
    } else {
      await updateRecruitmentRecord(editingId.value!, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    await fetchStats()
    invalidateOptions()
    invalidateLazyTabs()
    if (activeTab.value === 'detail') await loadDetailTab(true)
    if (activeTab.value === 'nodeposit') await loadNoDepositTab(true)
    if (activeTab.value === 'area') await loadAreaTab()
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id: number) => {
  await ElMessageBox.confirm('確定刪除此筆記錄？', '確認', { type: 'warning', center: true })
  try {
    await deleteRecruitmentRecord(id)
    ElMessage.success('刪除成功')
    await fetchStats()
    invalidateOptions()
    invalidateLazyTabs()
    if (activeTab.value === 'detail') await loadDetailTab(true)
    if (activeTab.value === 'nodeposit') await loadNoDepositTab(true)
    if (activeTab.value === 'area') await loadAreaTab()
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// -------- 近五年期間 CRUD --------
const openPeriodAdd = () => {
  periodForm.value = emptyPeriodForm()
  periodDialogMode.value = 'add'
  editingPeriodId.value = null
  periodDialogVisible.value = true
}

const openPeriodEdit = (row: Record<string, unknown>) => {
  periodForm.value = {
    period_name: String(row.period_name ?? ''),
    visit_count: Number(row.visit_count ?? 0),
    deposit_count: Number(row.deposit_count ?? 0),
    enrolled_count: Number(row.enrolled_count ?? 0),
    transfer_term_count: Number(row.transfer_term_count ?? 0),
    effective_deposit_count: Number(row.effective_deposit_count ?? 0),
    not_enrolled_deposit: Number(row.not_enrolled_deposit ?? 0),
    enrolled_after_school: Number(row.enrolled_after_school ?? 0),
    notes: String(row.notes ?? ''),
    sort_order: Number(row.sort_order ?? 0),
  }
  periodDialogMode.value = 'edit'
  editingPeriodId.value = row.id as number | null
  periodDialogVisible.value = true
}

const handlePeriodSave = async () => {
  // Dialog 內部已經驗證過表單（RecruitmentPeriodDialog 的 handleSave）
  savingPeriod.value = true
  try {
    if (periodDialogMode.value === 'add') {
      await createPeriod(periodForm.value)
      ElMessage.success('新增成功')
    } else {
      await updatePeriod(editingPeriodId.value!, periodForm.value)
      ElMessage.success('更新成功')
    }
    periodDialogVisible.value = false
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    savingPeriod.value = false
  }
}

const handlePeriodDelete = async (id: number) => {
  await ElMessageBox.confirm('確定刪除此期間記錄？', '確認', { type: 'warning' })
  try {
    await deletePeriod(id)
    ElMessage.success('刪除成功')
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const handlePeriodSync = async (id: number) => {
  try {
    await syncPeriod(id)
    ElMessage.success('期間數據已從訪視明細更新')
    periodsLoaded.value = false
    if (activeTab.value === 'periods') await loadPeriodsTab()
  } catch (e) {
    ElMessage.error(apiError(e, '同步失敗'))
  }
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

const depositRowClass = (row: Record<string, unknown>) => row.has_deposit ? 'deposit-row' : ''

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
  chuannianNoDeposit,
  chuannianExpectedBarData,
  chuannianGradeBarData,
  periodsTrendData,
  periodsCountBarData,
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
  periodsSummary: periodsSummary as unknown as Parameters<typeof useRecruitmentCharts>[0]['periodsSummary'],
  marketSnapshot,
  drillToDetail: (patch) => drillToDetail(patch),
})

// -------- 區域分析：本園座標合併（含市場情報回傳覆蓋）--------
const currentCampus = computed(() => ({
  ...createEmptyCampus(FALLBACK_SCHOOL_LAT, FALLBACK_SCHOOL_LNG),
  ...campusSetting.value,
  ...(marketSnapshot.value.campus || {}),
  campus_lat: marketSnapshot.value.campus?.campus_lat ?? campusSetting.value.campus_lat ?? FALLBACK_SCHOOL_LAT,
  campus_lng: marketSnapshot.value.campus?.campus_lng ?? campusSetting.value.campus_lng ?? FALLBACK_SCHOOL_LNG,
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

// -------- 未預繳：chuannian 相關 arrays（解決 stats.chuannian_by_expected 為 unknown 的問題）--------
const chuannianByExpected = computed((): Record<string, unknown>[] =>
  (stats.value.chuannian_by_expected as Record<string, unknown>[] | undefined) ?? []
)
const chuannianByGrade = computed((): Record<string, unknown>[] =>
  (stats.value.chuannian_by_grade as Record<string, unknown>[] | undefined) ?? []
)

// -------- options 型別轉換 --------
const noDepositReasonOptions = computed((): string[] =>
  (options.value.no_deposit_reasons as string[] | undefined) ?? []
)

// -------- component / function 型別轉換（template 不支援複雜 union function 型別）--------
type UnknownFn = (...args: unknown[]) => unknown
type ComponentLike = Record<string, unknown> | UnknownFn
type VisitLike = { id: number | string; [key: string]: unknown }
const castConvertVisit = computed((): VisitLike | null => convertTargetVisit.value as VisitLike | null)
const castBarComponent = computed((): ComponentLike => Bar as ComponentLike)
const castLineComponent = computed((): ComponentLike => Line as ComponentLike)
const castFmtRate = computed((): UnknownFn => fmtRate as UnknownFn)
const castFmtPct = computed((): UnknownFn => fmtPct as UnknownFn)

// chart options 轉型（vue-chartjs 要求 ChartOptions<T>，composable 回傳 Record<string,unknown>）
import type { ChartOptions } from 'chart.js'
const castChartOpts = (opts: Record<string, unknown>): ChartOptions<'bar'> =>
  opts as unknown as ChartOptions<'bar'>

// 供測試直接呼叫（VTU wrapper.vm.openCampusDialog）
defineExpose({ openCampusDialog })
</script>

<style scoped>
/* ── Design Tokens ── */
.recruitment-view {
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

.recruitment-view {
  padding: 24px;
  background: var(--rv-bg);
  min-height: 100%;
}

/* ── Page Header ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--rv-surface);
  border: 1px solid var(--rv-border);
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(30,64,175,0.07);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--rv-primary-lt);
  color: var(--rv-primary);
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--rv-text);
  letter-spacing: -0.01em;
}

.page-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--rv-text-2);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
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
:deep(.kpi-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
:deep(.kpi-card) {
  flex: 1;
  min-width: 130px;
  border-left: 4px solid var(--rv-primary, #1e40af);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
:deep(.kpi-card:hover) {
  box-shadow: 0 4px 16px rgba(30, 64, 175, 0.10);
  transform: translateY(-1px);
}
:deep(.kpi-card.kpi-accent) { border-left-color: var(--color-warning-hover); }
:deep(.kpi-card.kpi-blue)   { border-left-color: var(--color-info); }
:deep(.kpi-card.kpi-teal)   { border-left-color: #0891b2; }
:deep(.kpi-card.kpi-green)  { border-left-color: var(--color-success-hover); }
:deep(.kpi-value) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--rv-primary, #1e3a8a);
  font-variant-numeric: tabular-nums;
}
:deep(.kpi-card.kpi-accent .kpi-value) { color: var(--color-warning-darker); }
:deep(.kpi-card.kpi-blue   .kpi-value) { color: var(--color-info-darker); }
:deep(.kpi-card.kpi-teal   .kpi-value) { color: #0e7490; }
:deep(.kpi-card.kpi-green  .kpi-value) { color: var(--color-success-darker); }
:deep(.kpi-label) {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
:deep(.kpi-sub) { font-size: 0.78rem; color: var(--text-tertiary); }
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
.area-kpi-bar-bg {
  height: 5px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}
.area-kpi-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.area-kpi-bar-fill--blue { background: var(--color-info); }

/* -------- 預繳率進度條 -------- */
.rate-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rate-bar-bg {
  flex: 1;
  height: 6px;
  background: var(--bg-color-soft);
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}
.rate-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.rate-bar-fill--green  { background: var(--color-success); }
.rate-bar-fill--yellow { background: var(--color-warning); }
.rate-bar-fill--red    { background: #f87171; }
.rate-label {
  font-size: 0.8rem;
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--text-primary);
  white-space: nowrap;
  min-width: 42px;
  text-align: right;
}

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
.travel-badge--yellow { background: #fef9c3; color: var(--color-warning-darker); }
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

@media (max-width: 768px) {
  .area-header-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 768px) {
  .recruitment-view {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-actions {
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

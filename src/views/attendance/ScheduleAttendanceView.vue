<template>
  <div class="attendance-workspace">
    <!-- 無獨立頁面層級權限閘（本站慣例＝側欄隱藏＋後端 403）；SCHEDULE 或 ATTENDANCE_READ 任一可進頁，
         各頁籤與動作再依權限顯示（SPEC-027 §8）。頁籤只有兩個：核對（ATTENDANCE_READ）與排班（SCHEDULE）。
         頁首只放月份與動作，讓核對的格子盡量進首屏；逐人檢視沒有另一套統計，數字都跟格子同一個口徑。 -->
    <PageHeader title="排班與出勤">
      <template #actions>
        <!-- 年月與動作只管核對頁籤；排班頁籤（週班表、輪值表、換班紀錄、班別設定）不受它控制，不顯示以免誤會 -->
        <WorkspaceHeader
          v-if="canViewAttendance"
          v-show="monthTabs"
          :year="query.year"
          :month="query.month"
          :can-payroll-compare="canPayrollCompare"
          :can-print-appraisal="canPrintAppraisal"
          :primary="primaryAction"
          :seal-state="headerSealState"
          :mobile="isMobile"
          @update:year="(v) => setMonth(v, query.month)"
          @update:month="(v) => setMonth(query.year, v)"
          @update:period="setMonth"
          @import="openImport"
          @primary="onPrimary"
          @export="onExport"
          @payroll="payrollOpen = true"
          @appraisal="appraisalOpen = true"
          @recalculate="recalcOpen = true"
        />
      </template>
    </PageHeader>

    <MonthProgressBar v-show="monthTabs" ref="progressBar" :month="monthGrid" :mobile="isMobile" @show-issues="showIssues" @show-leftover="showLeftover" @go-month="goMonth" @changed="onDetailResolved" @summary="(v) => (monthSummary = v)" @records="openRecords" @import="openImport" @primary="onPrimary" @recalculate="recalcOpen = true" />

    <div class="workspace-mode" role="tablist" aria-label="排班與出勤">
      <button
        v-for="t in visibleTabs"
        :key="t.key"
        type="button"
        role="tab"
        class="workspace-mode__tab"
        :class="{ 'workspace-mode__tab--active': activeTab === t.key }"
        :aria-selected="activeTab === t.key"
        :data-test="`tab-${t.key}`"
        @click="selectTab(t.key)"
      >{{ t.label }}</button>
    </div>
    <PayrollComparisonDialog v-if="payrollOpen && canPayrollCompare" v-model="payrollOpen" :year="query.year" :month="query.month" />
    <AppraisalSheetBatchDialog v-if="appraisalOpen && canPrintAppraisal" v-model="appraisalOpen" :year="query.year" :month="query.month" />

    <!-- 核對：週／月看格子（判定與待處理），逐人＝名冊＋整月明細。格子首次看週或月才掛載，之後 v-show 常駐保留抽屜狀態 -->
    <template v-if="canViewAttendance">
    <el-radio-group
      v-show="activeTab === 'grid'"
      :model-value="shownView"
      class="workspace-subnav"
      aria-label="核對檢視"
      data-test="reconcile-view"
      @update:model-value="(v: string | number | boolean | undefined) => setReconcileView(v as ReconcileView)"
    >
      <el-radio-button value="week">週</el-radio-button>
      <!-- 月格子只在桌機（SPEC-027 §2） -->
      <el-radio-button v-if="!isMobile" value="month">月</el-radio-button>
      <el-radio-button value="person">逐人</el-radio-button>
    </el-radio-group>
    <ScheduleGridPanel
      v-if="reconcileVisited"
      v-show="activeTab === 'grid' && shownView !== 'person'"
      ref="reconcilePanel"
      mode="reconcile"
      :date="anchorDate"
      :filter="gridFilter"
      :focus-employee-id="props.emp ?? null"
      :focus-date="props.emp ? props.date ?? null : null"
      :revision="reconcileRevision"
      :view="gridView"
      :month="monthGrid"
      :header-has-month="canViewAttendance"
      :seal-state="headerSealState"
      :sealed-employee-ids="sealedEmployeeIds"
      @update:date="setAnchorDate"
      @update:filter="setFilter"
      @update:view="setReconcileView"
      @records="openRecords"
      @import="onGridImport"
      @import-punches="onGridImportMonth"
      @changed="onGridChanged('reconcile')"
      @show-patterns="progressBar?.openPatterns()"
      @focus-handled="syncQuery({ emp: undefined })"
      @recalculate="recalcOpen = true"
    />

    <div v-show="activeTab === 'grid' && shownView === 'person'" data-test="records-panel">
    <p v-if="ws.loading.value" role="status">正在載入 {{ query.year }} 年 {{ query.month }} 月出勤紀錄…</p>
    <div v-if="ws.loadState.value === 'error'" class="workspace-status" role="alert">
      <p>{{ query.year }} 年 {{ query.month }} 月出勤資料載入失敗。{{ ws.hasCurrentData.value ? '目前顯示此月份上次成功載入的資料。' : '目前尚無此月份可顯示的資料。' }}</p>
      <el-button @click="ws.refresh()">重新載入</el-button>
    </div>
    <section v-if="showEmptyRecords" class="workspace-status" aria-label="出勤紀錄空狀態">
      <h2>本月尚無出勤紀錄</h2>
      <p>{{ query.year }} 年 {{ query.month }} 月尚無已載入的出勤紀錄；班表與打卡核對仍可能有待補資料。</p>
      <el-button v-if="hasPermission('ATTENDANCE_WRITE')" type="primary" @click="openImport">匯入打卡紀錄</el-button>
    </section>
    <template v-else-if="ws.hasCurrentData.value">
    <!-- 逐人只留這一顆動作：批次處理有打卡紀錄的遲到、早退、缺卡（疑似缺勤、疑似換班與資料待補在格子處理） -->
    <div class="workspace-record-actions"><el-button @click="anomalyDrawerOpen = true">批次處理遲到・早退・缺卡（{{ batchableCount }} 件）</el-button></div>
    <!-- 桌機名冊與整月明細 -->
    <div v-if="isDesktop" class="workspace-cols">
      <div class="col-roster">
        <RosterColumn
          v-model:search="rosterSearch"
          :roster="ws.roster.value"
          :selected-employee-id="currentEmployeeId"
          :pending-counts="pendingCountsByEmployee"
          :pattern-employee-numbers="patternEmployeeNumbers"
          :loading="ws.loading.value"
          @select="onRosterSelect"
        />
      </div>
      <div class="col-detail">
        <DetailColumn
          :mode="detailMode"
          :anomaly="currentAnomaly"
          :anomaly-index="selectedAnomalyIndex"
          :anomaly-total="ws.anomalyQueue.value.length"
          :context="context"
          :employee-id="currentEmployeeId"
          :employee-name="currentEmployeeName"
          :focus-date="focusDate"
          :revision="importRevision"
          @import="openImport"
          :year="query.year"
          :month="query.month"
          :sealed="currentEmployeeSealed"
          :uncovered-dates="pastUncoveredDates"
          @resolved="onDetailResolved"
          @navigate="onNavigate"
          @switch-mode="switchDetailMode"
          @retry-records="retryRecords"
          @open-grid="openGridCell"
        />
      </div>
    </div>

    <!-- 行動流程：名冊 → 明細，異常另開抽屜。tab 受控，選取後自動推進到明細，
         否則使用者在名冊點了人卻停在原頁，看不出發生了什麼。 -->
    <el-tabs v-else v-model="mobileTab" class="workspace-tabs">
      <el-tab-pane label="名冊" name="roster">
        <div class="col-roster">
          <RosterColumn
            v-model:search="rosterSearch"
            :roster="ws.roster.value"
            :selected-employee-id="currentEmployeeId"
            :pending-counts="pendingCountsByEmployee"
            :pattern-employee-numbers="patternEmployeeNumbers"
            :loading="ws.loading.value"
            @select="onRosterSelect"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="明細" name="detail">
        <div class="col-detail">
          <el-button
            class="mobile-detail-back"
            data-test="mobile-detail-back"
            text
            :icon="ArrowLeft"
            @click="backFromDetail"
          >
            {{ detailMode === 'resolve' ? '回異常佇列' : '回名冊' }}
          </el-button>
          <DetailColumn
            :mode="detailMode"
            :anomaly="currentAnomaly"
            :anomaly-index="selectedAnomalyIndex"
            :anomaly-total="ws.anomalyQueue.value.length"
            :context="context"
            :employee-id="currentEmployeeId"
            :employee-name="currentEmployeeName"
            :focus-date="focusDate"
            :revision="importRevision"
            @import="openImport"
            :year="query.year"
            :month="query.month"
            :sealed="currentEmployeeSealed"
            :uncovered-dates="pastUncoveredDates"
            @resolved="onDetailResolved"
            @navigate="onNavigate"
            @switch-mode="switchDetailMode"
            @retry-records="retryRecords"
            @open-grid="openGridCell"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
    </template>

    </div>
    </template>

    <!-- 排班：週班表（本週班別編輯，2026-10-24 自核對移來）、學期輪值表、換班紀錄、班別設定。
         週班表與輪值表首次進入才掛載、之後常駐（保留未儲存的編輯）；換班紀錄與班別設定切走即卸載 -->
    <template v-if="canSchedule">
    <el-radio-group
      v-show="activeTab === 'schedule'"
      :model-value="scheduleSub"
      class="workspace-subnav"
      aria-label="排班項目"
      data-test="schedule-sub"
      @update:model-value="(v: string | number | boolean | undefined) => selectSub(v as ScheduleSub)"
    >
      <el-radio-button v-for="s in SCHEDULE_SUBS" :key="s.key" :value="s.key" :data-test="`schedule-sub-${s.key}`">{{ s.label }}</el-radio-button>
    </el-radio-group>
    <ScheduleGridPanel
      v-if="planVisited"
      v-show="activeTab === 'schedule' && scheduleSub === 'week'"
      ref="planPanel"
      mode="plan"
      :date="anchorDate"
      :filter="planFilter"
      :revision="planRevision"
      :month="monthGrid"
      @update:date="setAnchorDate"
      @update:filter="(f: GridFilter) => (planFilter = f)"
      @records="openRecords"
      @import="onGridImport"
      @changed="onGridChanged('plan')"
      @show-patterns="progressBar?.openPatterns()"
      @recalculate="recalcOpen = true"
    />
    <DutyRotationPanel v-if="rotationVisited" v-show="activeTab === 'schedule' && scheduleSub === 'rotation'" @applied="onRotationApplied" @changed="onRotationApplied" />
    <SwapHistoryPanel v-if="activeTab === 'schedule' && scheduleSub === 'swaps'" />
    <ShiftTypesPanel v-if="activeTab === 'schedule' && scheduleSub === 'shifts'" @changed="onShiftTypesChanged" />
    </template>

    <el-drawer v-if="canViewAttendance && ws.hasCurrentData.value" v-model="anomalyDrawerOpen" title="全月出勤異常（全體人員）" :size="isMobile ? '100%' : '480px'" append-to-body>
      <AnomalyQueueColumn :items="ws.anomalyQueue.value" :selected-index="selectedAnomalyIndex" :loading="ws.loading.value" :sealed-employee-ids="sealedEmployeeIds" :employee-id-by-number="employeeIdByNumber" @select="onAnomalySelect" @filter-change="onFilterChange" @resolved="onDetailResolved" />
    </el-drawer>
    <!-- 重算本月出勤（改了員工上下班時間或班別時段之後）：試算後確認，完成後整頁重抓 -->
    <RecalculateAttendanceDrawer v-if="canViewAttendance" v-model="recalcOpen" :year="query.year" :month="query.month" :mobile="isMobile" @done="onDetailResolved" />
    <!-- 匯入 dialog -->
    <ImportPreviewDialog
      v-if="canViewAttendance"
      v-model="importOpen"
      :year="query.year"
      :month="query.month"
      :source-context="importContext"
      @imported="onImported"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, toRef, nextTick, onBeforeUnmount, onMounted, computed, provide, ref, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'
import { useMonthGrid } from '@/composables/useMonthGrid'
import { GRID_VERDICT_KEY, buildGridVerdictLookup } from '@/composables/useGridVerdict'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import { useIsMobile } from '@/composables/useIsMobile'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { downloadFile } from '@/utils/download'
import { firstRosterEmployeeId } from '@/utils/attendanceRoster'
import { todayTaipeiISO } from '@/utils/format'
import { getRecords } from '@/api/attendance'
import { getAttendanceWorkingMonth } from '@/api/attendanceMonthContext'
import type { ApiResponse } from '@/api/_generated/typed'
import PageHeader from '@/components/common/PageHeader.vue'
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'
import RosterColumn from '@/components/attendance/RosterColumn.vue'
import AnomalyQueueColumn from '@/components/attendance/AnomalyQueueColumn.vue'
import DetailColumn from '@/components/attendance/DetailColumn.vue'
import ImportPreviewDialog from '@/components/attendance/ImportPreviewDialog.vue'
import MonthProgressBar from '@/components/schedule-attendance/MonthProgressBar.vue'
import ScheduleGridPanel from '@/components/schedule-attendance/ScheduleGridPanel.vue'
import { primaryAction as resolvePrimaryAction, type MonthStep, type MonthSummary, type PrimaryAction } from '@/utils/attendanceMonthSummary'
import { patternCellKeys } from '@/utils/attendancePatterns'
import { cellKey, isIssue, uncoveredDates, type GridFilter, type GridMode, type GridView } from '@/utils/scheduleAttendanceGrid'
import { hasPermission, hasFullSalaryView } from '@/utils/auth'
import type { AttendanceSub, AttendanceTab, AttendanceView } from '@/router/attendanceRouteProps'
const PayrollComparisonDialog = defineAsyncComponent(() => import('@/components/attendance/PayrollComparisonDialog.vue'))
const AppraisalSheetBatchDialog = defineAsyncComponent(() => import('@/components/attendance/AppraisalSheetBatchDialog.vue'))
const DutyRotationPanel = defineAsyncComponent(() => import('@/components/schedule/DutyRotationPanel.vue'))
const SwapHistoryPanel = defineAsyncComponent(() => import('@/components/schedule-attendance/SwapHistoryPanel.vue'))
const ShiftTypesPanel = defineAsyncComponent(() => import('@/components/schedule-attendance/ShiftTypesPanel.vue'))
const RecalculateAttendanceDrawer = defineAsyncComponent(() => import('@/components/attendance/RecalculateAttendanceDrawer.vue'))

type WorkspaceTab = AttendanceTab
type ScheduleSub = AttendanceSub
type ReconcileView = AttendanceView

/** 頁面 props 由 attendanceRouteProps 解析網址而來（舊的 tab=records／rotation／swaps／shifts 已在那裡對映好） */
const props = defineProps<{
  tab?: WorkspaceTab
  /** 排班頁籤的子頁籤（週班表、學期輪值表、換班紀錄、班別設定） */
  sub?: ScheduleSub
  /** 錨點日期 YYYY-MM-DD：格子顯示其所在週、逐人顯示其所在月；核對與排班兩個格子共用 */
  date?: string
  /** 深連結：開頁即開這個人（date 那天）的格子抽屜 */
  emp?: number
  filter?: GridFilter
  /** 核對頁籤的檢視（預設週）：週／月（只在桌機）／逐人 */
  view?: ReconcileView
}>()
const emit = defineEmits<{ dateChange: [date: string] }>()

const route = useRoute()
const router = useRouter()

// ── 權限（SPEC-027 §8）──────────────────────────────────────────────────────
const canViewAttendance = hasPermission('ATTENDANCE_READ')
const canSchedule = hasPermission('SCHEDULE')
// 頁首主要動作的權限（同手機膠囊）：匯入要出勤寫入，交薪資要薪資讀取
const canWriteAttendance = hasPermission('ATTENDANCE_WRITE')
const canViewSalary = hasPermission('SALARY_READ')
const canPayrollCompare = computed(() => hasPermission('ATTENDANCE_READ') && hasPermission('SALARY_READ') && hasFullSalaryView())
// 月考核表帶薪資金額與扣款：與後端同一組守衛（ATTENDANCE_READ＋SALARY_READ＋全員薪資視野），缺一不給入口
const canPrintAppraisal = computed(() => hasPermission('ATTENDANCE_READ') && hasPermission('SALARY_READ') && hasFullSalaryView())

// 2026-10-24 頁籤由五個收成兩個（使用者裁定）：本週班別編輯移到「排班」，原出勤明細變成「核對」的逐人檢視
const TABS: Array<{ key: WorkspaceTab; label: string; visible: boolean }> = [
  { key: 'grid', label: '核對', visible: canViewAttendance },
  { key: 'schedule', label: '排班', visible: canSchedule },
]
const SCHEDULE_SUBS: Array<{ key: ScheduleSub; label: string }> = [
  { key: 'week', label: '週班表' },
  { key: 'rotation', label: '學期輪值表' },
  { key: 'swaps', label: '換班紀錄' },
  // 2026-10 自「設定 › 輪班別管理」搬入：班別是排班的字典，與班表放同頁
  { key: 'shifts', label: '班別設定' },
]
const visibleTabs = TABS.filter((t) => t.visible)
/** 沒帶或看不到的頁籤＝第一個看得到的（只有排班權限就是排班） */
const normalizeTab = (tab: WorkspaceTab | undefined): WorkspaceTab =>
  tab && visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key ?? 'grid'

const activeTab = ref<WorkspaceTab>(normalizeTab(props.tab))
const scheduleSub = ref<ScheduleSub>(props.sub ?? 'week')
/** 核對的檢視（使用者選的）；手機沒有月格子，畫面上用 shownView */
const reconcileView = ref<ReconcileView>(props.view ?? 'week')
/** 年月切換與本月進度只對核對頁籤有意義 */
const monthTabs = computed(() => activeTab.value === 'grid')
const reconcileVisited = ref(false)
const planVisited = ref(false)
const rotationVisited = ref(false)
const gridFilter = ref<GridFilter>(props.filter ?? 'all')
/** 排班週班表的篩選（全部／只看未來可排）：只在面板內，不進網址（filter 是核對的） */
const planFilter = ref<GridFilter>('all')
// ?tab=／?sub=／?view= 深連結在「已經停在本頁」時也要生效；值沒變時 watch 不觸發，不會蓋掉使用者自己按的頁籤。
watch(() => props.tab, (tab) => { if (tab !== undefined) activeTab.value = normalizeTab(tab) })
watch(() => props.sub, (sub) => { if (sub !== undefined) scheduleSub.value = sub })
// view 是核對頁籤的：網址在排班時不帶它（從舊連結 tab=records 切到排班，view 會跟著消失），不能因此把核對的檢視洗回週
watch(() => props.view, (view) => { if (props.tab !== 'schedule') reconcileView.value = view ?? 'week' })
// 網址是篩選的唯一來源：拿掉 filter（例如站內連到不帶篩選的網址）就回到全部
watch(() => props.filter, (f) => { gridFilter.value = f ?? 'all' })

function syncQuery(patch: Record<string, string | undefined>): void {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) next[k] = v
  }
  void router.replace({ query: next })
}

/** 網址的 view：週是預設，不寫 */
const viewQuery = (view: ReconcileView): string | undefined => (view === 'week' ? undefined : view)

/** 切頁籤：一併寫該頁籤目前的檢視／子頁籤（蓋掉舊連結的 tab=records 之類，否則它會把 view／sub 帶回去） */
function selectTab(tab: WorkspaceTab): void {
  activeTab.value = tab
  if (tab === 'grid') syncQuery({ tab, view: viewQuery(reconcileView.value) })
  else syncQuery({ tab, sub: scheduleSub.value })
}

function selectSub(sub: ScheduleSub): void {
  activeTab.value = 'schedule'
  scheduleSub.value = sub
  syncQuery({ tab: 'schedule', sub })
}

function setFilter(filter: GridFilter): void {
  gridFilter.value = filter
  syncQuery({ filter: filter === 'all' ? undefined : filter })
}

/** 本月進度③與匯入完成：看整月的待處理。桌機切到月格子，看到的數字才會和本月進度的待處理件數相同；手機（沒有月格子）切到週 */
function showIssues(): void {
  showGridFilter('issues')
}

/** 封存橫幅「看這 N 件」：同上切到核對的月格子（手機週），只看封存時沒處理的人 */
function showLeftover(): void {
  showGridFilter('leftover')
}

function showGridFilter(filter: GridFilter): void {
  activeTab.value = 'grid'
  gridFilter.value = filter
  reconcileView.value = isDesktop.value ? 'month' : 'week'
  syncQuery({ tab: 'grid', filter, view: viewQuery(reconcileView.value) })
}

/** 封存橫幅「前往 N 月」：走頁首換月同一個入口（先問排班頁籤未儲存的週排班） */
function goMonth({ year, month }: { year: number; month: number }): void {
  setMonth(year, month)
}

// ── getRecords 回傳列（OpenAPI 契約型別）────────────────────────────────────
type RecordRow = ApiResponse<'/attendance/records', 'get'>[number]

// ── 查詢狀態：錨點日期是唯一來源，明細月份跟著它 ─────────────────────────────
const anchorDate = ref(props.date ?? todayTaipeiISO())
const query = reactive({ year: Number(anchorDate.value.slice(0, 4)), month: Number(anchorDate.value.slice(5, 7)) })
watch(anchorDate, (d) => {
  // 只有排班權限（無 ATTENDANCE_READ）時不更新出勤查詢月份，避免換週跨月觸發出勤 API。
  if (!canViewAttendance) return
  query.year = Number(d.slice(0, 4))
  query.month = Number(d.slice(5, 7))
})
watch(() => props.date, (d) => { if (d) anchorDate.value = d })

// 兩個格子面板（核對、排班週班表）共用錨點。換週會清掉排班面板未儲存的週班別（只有它有緩衝）：
// 任何改錨點的入口（兩個面板換週、頁首換月、抽屜跳到別週）一律先問它（它決定要不要詢問使用者）
const reconcilePanel = ref<InstanceType<typeof ScheduleGridPanel> | null>(null)
const planPanel = ref<InstanceType<typeof ScheduleGridPanel> | null>(null)

async function confirmAnchorChange(date: string): Promise<boolean> {
  return (await planPanel.value?.confirmWeekChange(date)) ?? true
}

async function setAnchorDate(date: string): Promise<void> {
  if (!(await confirmAnchorChange(date))) return
  anchorDate.value = date
  syncQuery({ date })
}

function setMonth(year: number, month: number): void {
  void setAnchorDate(`${year}-${String(month).padStart(2, '0')}-01`)
}

// 資料異動計數：格子編輯、匯入、明細處理後遞增，本月進度據此重算
const dataRevision = ref(0)
// 兩個格子面板各自的重新載入計數（各自持有一份 useScheduleGrid，常駐時不會自己重抓）：
// 格子以外的異動（逐人處理、匯入、輪值表套用、班別設定）兩個都遞增；一個面板自己的編輯只遞增另一個（發出者已自行重載）
const reconcileRevision = ref(0)
const planRevision = ref(0)
function reloadGrids(except?: GridMode): void {
  if (except !== 'reconcile') reconcileRevision.value += 1
  if (except !== 'plan') planRevision.value += 1
}
// 本月整月格子：進度條與月格子共用同一份（D-06）；換月或資料異動（dataRevision）時重抓
const monthGrid = useMonthGrid(anchorDate, dataRevision)
// 出勤明細借用班表核對的判定（同一人日兩個頁籤的判定並列，防止在疑似換班的日子接受遲到扣款）
provide(GRID_VERDICT_KEY, buildGridVerdictLookup(monthGrid))
const progressBar = ref<InstanceType<typeof MonthProgressBar> | null>(null)

// ── workspace composable ───────────────────────────────────────────────────
const ws = useAttendanceWorkspace(toRef(query, 'year'), toRef(query, 'month'))
const rosterSearch = ref('')
/** 整月格子的員工 id → 員工編號（格子的 cell 只有 id；名冊與異常日卡用編號） */
const gridEmployeeNumbers = computed(() => new Map((monthGrid.data.value?.employees ?? []).flatMap((e) => (e.employee_number ? [[e.employee_id, e.employee_number] as const] : []))))
// 名冊的待辦數與核對的格子同一個口徑（isIssue：已處理、封存、整天還沒匯入的不算），再扣掉設定問題的格子
// （整月同一種情形，修好設定才會消失，名冊上另外標「設定問題」）。key＝員工編號。
// 不能用 roster 的 late_count 等月統計：接受扣款或豁免後它不會減少，處理完的人會一直掛在「有待處理」。
// 格子還沒載到（或載入失敗）時不給數字，名冊退回月統計數，不把所有人都說成沒事。
const pendingCountsByEmployee = computed<Record<string, number> | undefined>(() => {
  const grid = monthGrid.data.value
  if (!grid) return undefined
  const uncovered = uncoveredDates(grid.days)
  const patternKeys = patternCellKeys(monthGrid.patterns.value)
  const counts: Record<string, number> = {}
  for (const cell of grid.cells) {
    if (!isIssue(cell, grid.today, uncovered) || patternKeys.has(cellKey(cell.employee_id, cell.date))) continue
    const number = gridEmployeeNumbers.value.get(cell.employee_id)
    if (number) counts[number] = (counts[number] ?? 0) + 1
  }
  return counts
})
/** 本月被判成設定問題的人（員工編號）：名冊上補小標，他們的設定問題格不在待辦數裡 */
const patternEmployeeNumbers = computed<ReadonlySet<string>>(
  () => new Set(monthGrid.patterns.value.flatMap((p) => { const number = gridEmployeeNumbers.value.get(p.employeeId); return number ? [number] : [] })),
)
const NO_DATES: ReadonlySet<string> = new Set()
/**
 * 整天還沒匯入打卡的過去工作日：整月明細這些日子沒打卡不是缺卡，寫「尚未匯入」、不催補卡。
 * 沒有打卡權限的 import_covered 是 null＝不知道，不算（uncoveredDates 只認 false）。
 */
const pastUncoveredDates = computed<ReadonlySet<string>>(() => {
  const grid = monthGrid.data.value
  if (!grid) return NO_DATES
  const today = todayTaipeiISO()
  return new Set([...uncoveredDates(grid.days)].filter((date) => date < today))
})
const showEmptyRecords = computed(() => !focusDate.value && !rosterSearch.value.trim() && ws.loadState.value === 'success' && ws.hasCurrentData.value && ws.roster.value.length === 0 && ws.anomalyQueue.value.length === 0)

// ── 錯誤通知 ────────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── 響應式版面 ──────────────────────────────────────────────────────────────
const { isMobile } = useIsMobile()
const isDesktop = computed(() => !isMobile.value)
// 月格子只在桌機（SPEC-027 §2：手機只有週模式）
const shownView = computed<ReconcileView>(() => (isMobile.value && reconcileView.value === 'month' ? 'week' : reconcileView.value))
/** 核對面板的週／月（逐人時面板藏起來，給週） */
const gridView = computed<GridView>(() => (shownView.value === 'month' ? 'month' : 'week'))

/**
 * 核對的週／月／逐人切換；帶 date＝點月格子的週次欄頭切到該週（先問排班面板未儲存的週排班）。
 * 一併寫 tab=grid：舊連結 tab=records 留在網址上會把檢視帶回逐人。
 */
async function setReconcileView(view: ReconcileView, date?: string): Promise<void> {
  if (date && !(await confirmAnchorChange(date))) return
  if (date) anchorDate.value = date
  reconcileView.value = view
  syncQuery({ tab: 'grid', view: viewQuery(view), ...(date ? { date } : {}) })
}

// 格子面板首次看到才掛載（之後 v-show 常駐）：核對要在週或月檢視、排班要在週班表
watch([activeTab, shownView, scheduleSub], ([tab, view, sub]) => {
  if (tab === 'grid' && view !== 'person') reconcileVisited.value = true
  if (tab === 'schedule' && sub === 'week') planVisited.value = true
  if (tab === 'schedule' && sub === 'rotation') rotationVisited.value = true
}, { immediate: true })

// ── UI 狀態機 ────────────────────────────────────────────────────────────────
const selectedEmployeeId = ref<number | null>(null)
/**
 * 選取以日卡的 attendance id 為準（QA P3）：處理後重抓的清單順序可能改變，用索引會跳到別人。
 * 子元件仍以索引溝通；那筆消失時停在原位置（夾在範圍內）。
 */
const selectedAnomalyId = ref<number | null>(null)
const lastAnomalyIndex = ref(0)
const selectedAnomalyIndex = computed(() => {
  const queue = ws.anomalyQueue.value
  const found = selectedAnomalyId.value == null ? -1 : queue.findIndex((card) => card.id === selectedAnomalyId.value)
  return found >= 0 ? found : Math.min(lastAnomalyIndex.value, Math.max(0, queue.length - 1))
})
function selectAnomalyAt(index: number): void {
  lastAnomalyIndex.value = index
  selectedAnomalyId.value = ws.anomalyQueue.value[index]?.id ?? null
}
const detailMode = ref<'resolve' | 'month'>('month')
const anomalyDrawerOpen = ref(false)
const importOpen = ref(false)
const focusDate = ref<string | null>(null)
const importContext = ref<{ employee_id: number; employee_name: string; date: string } | null>(null)
function openImport(): void { importContext.value = null; importOpen.value = true }
const payrollOpen = ref(false)
const appraisalOpen = ref(false)
const recalcOpen = ref(false)
const importRevision = ref(0)
watch(() => [query.year, query.month], () => {
  const monthPrefix = `${query.year}-${String(query.month).padStart(2, '0')}`
  if (focusDate.value && !focusDate.value.startsWith(`${monthPrefix}-`)) focusDate.value = null
  emit('dateChange', `${monthPrefix}-01`)
})

// ── 手機名冊與明細流程 ────────────────────────────────────────────────────────────
// 桌機兩欄同時可見，不需要這個狀態；手機一次只看得到一段，故需記錄目前在哪一段。
type MobileTab = 'roster' | 'detail'
const mobileTab = ref<MobileTab>('roster')

// 手機從異常明細返回抽屜，整月明細返回名冊。
function backFromDetail(): void {
  if (detailMode.value === 'resolve') anomalyDrawerOpen.value = true
  else mobileTab.value = 'roster'
}

// ── 員工月記錄快取 ───────────────────────────────────────────────────────────
// key = employee_id，val = 該員工在當月的記錄陣列
const recordsCache = ref<Map<number, RecordRow[]>>(new Map())
/** 載入失敗的員工（QA #22：沒載到不能當成缺卡）；快取清空時一併清 */
const recordsFailed = ref<Set<number>>(new Set())

// ── derived: 當前異常日卡 ──────────────────────────────────────────────────
const currentAnomaly = computed<AnomalyDayCard | null>(
  () => ws.anomalyQueue.value[selectedAnomalyIndex.value] ?? null,
)

// ── derived: 當前員工 DB 主鍵 ─────────────────────────────────────────────
// RosterColumn 點選時 selectedEmployeeId 已有值；
// 從 AnomalyQueue 選取時 selectedEmployeeId=null，用 anomaly.employee_number 對照名冊
const currentEmployeeId = computed<number | null>(() => {
  if (selectedEmployeeId.value != null) return selectedEmployeeId.value
  // 名冊畫面上的第一位（排序分組後）；取後端原順序的第一筆會選到首屏外的人
  if (detailMode.value === 'month') return defaultEmployeeId.value
  const a = currentAnomaly.value
  if (!a) return null
  return ws.roster.value.find((r) => r.employee_number === a.employee_number)?.employee_id ?? null
})

watch([ws.roster, ws.loadedPeriod], () => {
  if (!ws.hasCurrentData.value || ws.loadState.value !== 'success') return
  if (selectedEmployeeId.value !== null && !ws.roster.value.some(row => row.employee_id === selectedEmployeeId.value)) {
    selectedEmployeeId.value = null
    focusDate.value = null
  }
})

/**
 * 沒點人時預設看的人：換月才重選（名冊畫面上的第一位）。處理完他的待處理後他會移到「無待處理」組，
 * 若每次都取當下的第一位，右側整月表會突然換成別人。
 * 待辦數來自整月格子：格子晚於名冊載到時，名冊的分組會跟著變，預設的人也要重選一次（之後才固定），
 * 否則右側看的是月統計的第一位、名冊畫面上的第一位卻是別人。
 */
const defaultEmployeeId = ref<number | null>(null)
let defaultBasis: string | null = null
const gridReady = computed(() => monthGrid.data.value !== null)
watch([ws.roster, ws.loadedPeriod, gridReady], () => {
  if (!ws.hasCurrentData.value) return
  const stillThere = ws.roster.value.some((row) => row.employee_id === defaultEmployeeId.value)
  const basis = `${ws.loadedPeriod.value}|${gridReady.value}`
  if (basis !== defaultBasis || !stillThere) {
    defaultBasis = basis
    defaultEmployeeId.value = firstRosterEmployeeId(ws.roster.value, pendingCountsByEmployee.value)
  }
}, { immediate: true })

const currentEmployeeName = computed(() => ws.roster.value.find(row => row.employee_id === currentEmployeeId.value)?.employee_name ?? '')

// ── 監聽 [currentEmployeeId, year, month]：換月先清快取再載入 ──────────────
// 合併為單一 watch 避免換月時 Watch1（載入）先跑命中舊快取、Watch2（清快取）後跑的競態。
// request-sequence guard（recSeq）：換月/換員工時，舊一次 in-flight 的 getRecords 回應
// 可能在較新一次之後才 resolve；若無守衛會用舊月資料回填快取覆寫最新月。
// 本快取只餵 context → ResolveCard（只在 detailMode==='resolve' 下渲染）；整月明細由
// EmployeeMonthPanel 自己抓同一支 /attendance/records。
let recSeq = 0
async function loadRecords(empId: number, y: number, m: number, source: string): Promise<void> {
  const seq = ++recSeq
  if (recordsFailed.value.has(empId)) {
    const failed = new Set(recordsFailed.value)
    failed.delete(empId)
    recordsFailed.value = failed
  }
  try {
    const res = await getRecords({ year: y, month: m, employee_id: empId })
    if (seq !== recSeq) return
    recordsCache.value = new Map(recordsCache.value).set(empId, res.data ?? [])
  } catch (err) {
    if (seq !== recSeq) return
    recordsFailed.value = new Set(recordsFailed.value).add(empId)
    notify(err, source, null, { prefix: '載入打卡記錄失敗' })
  }
}
function clearRecordsCache(): void {
  recordsCache.value = new Map()
  recordsFailed.value = new Set()
}
watch(
  [currentEmployeeId, () => query.year, () => query.month, detailMode] as const,
  async ([empId, y, m, mode], [, oldY, oldM]) => {
    if (y !== oldY || m !== oldM) {
      ++recSeq
      clearRecordsCache()
    }
    if (mode !== 'resolve') return
    if (empId == null) return
    if (recordsCache.value.has(empId)) return
    await loadRecords(empId, y, m, 'ScheduleAttendanceView.loadRecords')
  },
  { immediate: false },
)
function retryRecords(): void {
  const empId = currentEmployeeId.value
  if (empId == null) return
  void loadRecords(empId, query.year, query.month, 'ScheduleAttendanceView.retryRecords')
}

// ── context：從快取找當日記錄 ─────────────────────────────────────────────
const context = computed(() => {
  const a = currentAnomaly.value
  const empId = currentEmployeeId.value
  const rows = empId != null ? recordsCache.value.get(empId) : undefined
  const rec = a != null && rows ? rows.find((r) => r.date === a.date) ?? null : null
  // 沒載到（在途或失敗）≠ 缺卡：ResolveCard 據此停用補卡、只留接受扣款／豁免
  const records: 'loading' | 'loaded' | 'failed' = rows
    ? 'loaded'
    : empId != null && recordsFailed.value.has(empId) ? 'failed' : 'loading'
  return {
    records,
    punch_in: rec?.punch_in ?? null,
    punch_out: rec?.punch_out ?? null,
    has_leave: typeof rec?.status === 'string' && rec.status.includes('leave'),
    // 日卡合計（遮罩 null 不列入）；處理動作套用整天，扣款也以整天合計呈現
    estimated_deduction:
      a?.items.reduce((sum, i) => sum + (i.estimated_deduction ?? 0), 0) ?? 0,
  }
})

// ── 事件 handlers ─────────────────────────────────────────────────────────

function switchDetailMode(mode: 'resolve' | 'month'): void {
  if (mode === 'month') {
    selectedEmployeeId.value = currentEmployeeId.value
    focusDate.value = currentAnomaly.value?.date ?? focusDate.value
  }
  detailMode.value = mode
}

function onRosterSelect(id: number): void {
  focusDate.value = null
  selectedEmployeeId.value = id
  detailMode.value = 'month'
  if (isMobile.value) mobileTab.value = 'detail'
}

function onAnomalySelect(idx: number): void {
  anomalyDrawerOpen.value = false
  focusDate.value = null
  selectAnomalyAt(idx)
  selectedEmployeeId.value = null // 走 anomaly.employee_number → roster 對照
  detailMode.value = 'resolve'
  if (isMobile.value) mobileTab.value = 'detail'
}

/** 重抓後：選取的那筆還在就跟著它（位置可能變了）；不在了就改選原位置的那筆 */
function clampSelectedIndex(): void {
  selectAnomalyAt(selectedAnomalyIndex.value)
}

// 明細快取失效（P1-4）：resolve/import/upsert/delete 後打卡事實已變，
// 不失效會讓 ResolveCard/EmployeeMonthPanel 讀到舊資料。清空後立即補抓當前員工。
async function invalidateRecordsCache(): Promise<void> {
  clearRecordsCache()
  if (detailMode.value !== 'resolve') return
  const empId = currentEmployeeId.value
  if (empId == null) return
  await loadRecords(empId, query.year, query.month, 'ScheduleAttendanceView.reloadRecords')
}

function onFilterChange(): void {
  // 狀態/類型篩選由 AnomalyQueueColumn 本地過濾；此處 refresh 拉最新資料，並 clamp index
  void ws.refresh().then(clampSelectedIndex)
}

async function onResolved(): Promise<void> {
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  clampSelectedIndex()
}

async function onDetailResolved(): Promise<void> {
  await onResolved()
  importRevision.value += 1
  dataRevision.value += 1
  reloadGrids()
}

function onNavigate(delta: number): void {
  const max = Math.max(0, ws.anomalyQueue.value.length - 1)
  selectAnomalyAt(Math.min(Math.max(0, selectedAnomalyIndex.value + delta), max))
}

/**
 * 格子抽屜「看他整月」：切到核對的逐人並聚焦該人該日（原打卡核對「查看出勤明細」）。
 * 月模式點的格子可在任一週，錨點跨週會讓排班面板捨棄未儲存的週排班，所以先問它；不放行就整個不動。
 */
async function openRecords(employeeId: number, date: string): Promise<void> {
  if (!(await confirmAnchorChange(date))) return
  anchorDate.value = date
  activeTab.value = 'grid'
  reconcileView.value = 'person'
  syncQuery({ tab: 'grid', view: 'person', date })
  selectedEmployeeId.value = employeeId
  focusDate.value = date
  detailMode.value = 'month'
  if (!isDesktop.value) mobileTab.value = 'detail'
}

/** 抽屜「匯入這天打卡」：同上先問未儲存的週排班；錨點與網址同步移到該日（與 setAnchorDate 一致）。 */
async function onGridImport(row: { employee_id: number; employee_name: string; date: string }): Promise<void> {
  if (!(await confirmAnchorChange(row.date))) return
  importContext.value = { employee_id: row.employee_id, employee_name: row.employee_name, date: row.date }
  anchorDate.value = row.date
  syncQuery({ date: row.date })
  importOpen.value = true
}

/** 格子空狀態「匯入打卡紀錄」：帶的是第一個缺的日子，跨月週時匯入要開那天所在的月 */
function onGridImportMonth(date: string): void {
  importContext.value = null
  anchorDate.value = date
  importOpen.value = true
}

/** 格子面板（source）改了資料：排班存了週排班，核對的判定要跟著新班別；核對抽屜改了當日班別，排班的計畫格要跟著 */
async function onGridChanged(source: GridMode): Promise<void> {
  dataRevision.value += 1
  reloadGrids(source)
  importRevision.value += 1 // 逐人檢視常駐，格子確認／改班後它的整月表也要刷新
  if (canViewAttendance) await onResolved()
}

function onRotationApplied(): void {
  dataRevision.value += 1
  reloadGrids()
}

// 班別的時段、名稱、啟用狀態變了：兩個格子的班別選單與應上班時段判定都要重抓（格子 v-show 常駐，不會自己重載）
function onShiftTypesChanged(): void {
  dataRevision.value += 1
  reloadGrids()
}

async function onImported(): Promise<void> {
  importRevision.value += 1
  dataRevision.value += 1
  reloadGrids()
  // 匯入完成 → 直接看有問題的格子（SPEC-027 §6.3 #22）
  showIssues()
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  clampSelectedIndex()
  ElMessage.success('匯入完成')
}

// 頁首主要動作、月份狀態與匯出月報前的提醒都用本月進度那份月摘要（同一個「待處理」定義）；別月或還沒載到就不用
const monthSummary = ref<(MonthSummary & { step: MonthStep | null }) | null>(null)
/** 摘要要是這個月的才能用：換月後進度條重載前，舊月的摘要不能拿來擋這個月、也不能掛在新月上 */
function summaryOfThisMonth(): (MonthSummary & { step: MonthStep | null }) | null {
  const s = monthSummary.value
  return s && s.year === query.year && s.month === query.month ? s : null
}

/** 頁首唯一的主要按鈕：文字與動作隨目前步驟變；沒有（等老師回覆、已封存、還在載入、沒有權限）就是 null */
const primaryAction = computed(() => {
  const s = summaryOfThisMonth()
  return s ? resolvePrimaryAction(s, s.step, { writeAttendance: canWriteAttendance, viewSalary: canViewSalary }) : null
})

/** 頁首狀態膠囊：這個月的封存狀態；摘要還沒載入（或換月）時是 undefined，頁首不畫 */
const headerSealState = computed(() => summaryOfThisMonth()?.sealState)

// ── 封存（只能看）────────────────────────────────────────────────────────────
const NO_IDS: ReadonlySet<number> = new Set()
/** 這個月薪資已封存的員工 id（月摘要算的；別月或還沒載到＝沒有人） */
const sealedEmployeeIds = computed<ReadonlySet<number>>(() => summaryOfThisMonth()?.sealedEmployeeIds ?? NO_IDS)
/** 員工編號 → 員工 id（異常日卡只有編號；封存名單是 id） */
const employeeIdByNumber = computed<ReadonlyMap<string, number>>(
  () => new Map(ws.roster.value.flatMap((row) => (row.employee_number ? [[row.employee_number, row.employee_id] as const] : []))),
)
/** 目前看的這個人整月薪資已封存：整月明細不給補打卡 */
const currentEmployeeSealed = computed(() => currentEmployeeId.value !== null && sealedEmployeeIds.value.has(currentEmployeeId.value))
/** 逐人頁頂批次處理按鈕的件數：還沒處理的日卡（一人一天＝1 件）；封存員工的只能看，不算 */
const batchableCount = computed(() =>
  ws.anomalyQueue.value.filter((card) => {
    if (card.confirmed_action !== null) return false
    const employeeId = employeeIdByNumber.value.get(card.employee_number)
    return employeeId === undefined || !sealedEmployeeIds.value.has(employeeId)
  }).length,
)

/** 按了主要動作：頁首按鈕與手機膠囊走同一個處理函式 */
async function onPrimary(action: PrimaryAction): Promise<void> {
  switch (action) {
    case 'import':
      openImport()
      return
    case 'patterns':
      progressBar.value?.openPatterns()
      return
    case 'daily':
      // 切到核對的格子（在逐人就切回週）再請核對面板開第一件；看得到的列裡沒有（例如待辦在別週）就退回「只看待處理」，讓人看得到清單
      if (activeTab.value !== 'grid') selectTab('grid')
      if (shownView.value === 'person') void setReconcileView('week')
      await nextTick()
      if (!reconcilePanel.value?.openFirstIssue()) showIssues()
      return
    case 'payroll':
      void router.push('/salary/settle')
      return
  }
}

/** 逐人「到班表核對處理」：切到核對的週格子並開這個人這天的抽屜（疑似換班要在那裡確認當日班別） */
async function openGridCell(employeeId: number, date: string): Promise<void> {
  if (!(await confirmAnchorChange(date))) return
  anchorDate.value = date
  activeTab.value = 'grid'
  reconcileView.value = 'week'
  syncQuery({ tab: 'grid', date, emp: String(employeeId), view: undefined })
}

/** 匯出月報前的提醒文案（逐日待辦件、設定問題人、沒匯入的工作日）；沒有任何沒處理的事就回 null */
function exportReminder(s: MonthSummary): string | null {
  const todo = [
    s.dailyIssueCount > 0 ? `${s.dailyIssueCount} 件逐日待辦` : '',
    s.patternPeople > 0 ? `${s.patternPeople} 人設定問題` : '',
  ].filter(Boolean)
  const missingImportDays = s.importStatus.missingWorkdays.length
  if (!todo.length && !missingImportDays) return null
  const lead = todo.length
    ? `${s.month} 月還有 ${todo.join('、')}沒處理${missingImportDays ? `，另有 ${missingImportDays} 個工作日還沒匯入打卡` : ''}`
    : `${s.month} 月有 ${missingImportDays} 個工作日還沒匯入打卡`
  return `${lead}。現在匯出的月報會照系統規則計算。`
}

async function onExport(): Promise<void> {
  const s = summaryOfThisMonth()
  // 封存月不提醒：已經算進薪資，沒有「先去處理」可走
  const reminder = s && s.sealState !== 'sealed' ? exportReminder(s) : null
  if (reminder) {
    try {
      await ElMessageBox.confirm(
        reminder,
        `匯出 ${query.month} 月月報`,
        { type: 'warning', confirmButtonText: '仍要匯出', cancelButtonText: '先去處理', distinguishCancelAndClose: true },
      )
    } catch (action) {
      // 「先去處理」＝按目前的主要動作（提醒可能只列設定問題或缺匯入，固定去只看待處理會導錯地方）；沒有主要動作才退回只看待處理
      if (action === 'cancel') {
        if (primaryAction.value) void onPrimary(primaryAction.value.action)
        else showIssues()
      }
      return
    }
  }
  await downloadFile(
    `/exports/attendance?year=${query.year}&month=${query.month}`,
    `考勤月報_${query.year}_${String(query.month).padStart(2, '0')}.xlsx`,
  )
}

// ── 初始載入 ────────────────────────────────────────────────────────────────
let unmounted = false
onBeforeUnmount(() => { unmounted = true })
onMounted(() => {
  if (!canViewAttendance) return
  void ws.refresh()
  void applyWorkingMonth()
})

/**
 * 沒指定日期進頁時，預設看「最早一個還沒交薪資的月份」（只回看上個月）：月初行政還在趕上個月薪資，
 * 停在本月只會看到「等匯入打卡」。使用者在回應前已經自己換過月份就不動。讀不到就照舊停在本月。
 */
async function applyWorkingMonth(): Promise<void> {
  if (props.date) return
  const initial = anchorDate.value
  try {
    const { year, month, previous_unsettled: previousUnsettled } = (await getAttendanceWorkingMonth()).data
    // 回應到之前已離開這頁：useRoute 是全域目前路由，再寫網址會改到別頁
    if (unmounted || !previousUnsettled || anchorDate.value !== initial || props.date) return
    await setAnchorDate(`${year}-${String(month).padStart(2, '0')}-01`)
    // 排班頁籤不以月為範圍：只換錨點，不提示
    if (monthTabs.value && anchorDate.value.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}`) {
      ElMessage.info(`${month} 月薪資還沒封存，先顯示 ${month} 月`)
    }
  } catch {
    // 只是預設值，失敗就停在本月
  }
}
</script>

<style scoped>
.attendance-workspace {
  padding: var(--space-4);
}
/* 頁首放了月份切換與動作：中等寬度先換行，不擠扁標題 */
.attendance-workspace :deep(.page-header) {
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-5);
  margin-bottom: var(--space-3);
}

.workspace-status { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-6); text-align: center; border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); }
.workspace-status h2, .workspace-status p { margin: 0; }
.workspace-status h2 { font-size: var(--text-lg); }
.workspace-status p { color: var(--el-text-color-secondary); }
.workspace-mode { display: flex; flex-wrap: wrap; gap: var(--space-5); border-bottom: 1px solid var(--el-border-color-light); margin-bottom: var(--space-3); }
.workspace-mode__tab {
  min-height: var(--touch-target-min);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--el-text-color-regular);
  padding: var(--space-2) 0 var(--space-2);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-sm);
}
.workspace-mode__tab--active { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; }
.workspace-mode__tab:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
/* 頁籤下方的檢視切換（核對：週／月／逐人）與子頁籤（排班）：與工具列同一種按鈕樣式 */
.workspace-subnav { margin-bottom: var(--space-3); }

.workspace-record-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.workspace-cols {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
}

.col-roster,
.col-anomaly,
.col-detail {
  min-height: 200px;
}

.workspace-tabs {
  margin-top: var(--space-3);
}

/* 返回鍵是手機明細頁的主要退路，觸控目標對齊 44px 並靠左貼齊內容 */
.mobile-detail-back {
  min-height: var(--touch-target-min);
  margin-bottom: var(--space-2);
  padding-left: 0;
}

@media (--to-sm) {
  .attendance-workspace {
    padding: var(--space-3);
  }
  /* 手機頁首只留月份那一列：標題做成 sr-only（仍在 DOM，給輔助科技），不佔一整列 */
  .attendance-workspace :deep(.page-header__left) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .workspace-mode { gap: var(--space-3); }
  /* 兩段標籤在窄機平均分配寬度 */
  .workspace-tabs :deep(.el-tabs__nav) {
    display: flex;
    width: 100%;
  }
  .workspace-tabs :deep(.el-tabs__item) {
    flex: 1 1 0;
    justify-content: center;
    min-height: var(--touch-target-min);
    padding: 0 var(--space-2);
  }
}
</style>

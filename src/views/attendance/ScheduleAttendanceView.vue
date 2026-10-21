<template>
  <div class="attendance-workspace">
    <!-- 無獨立頁面層級權限閘（本站慣例＝側欄隱藏＋後端 403）；SCHEDULE 或 ATTENDANCE_READ 任一可進頁，
         各頁籤與動作再依權限顯示（SPEC-027 §8）。頁首只放月份與動作，出勤統計在出勤明細頁籤，
         讓班表核對的格子盡量進首屏。 -->
    <PageHeader title="排班與出勤">
      <template #actions>
        <!-- 年月與動作只管班表核對與出勤明細；輪值表、換班紀錄、班別設定不受它控制，不顯示以免誤會 -->
        <WorkspaceHeader
          v-if="canViewAttendance"
          v-show="monthTabs"
          :year="query.year"
          :month="query.month"
          :can-payroll-compare="canPayrollCompare"
          @update:year="(v) => setMonth(v, query.month)"
          @update:month="(v) => setMonth(query.year, v)"
          @update:period="setMonth"
          @import="openImport"
          @export="onExport"
          @payroll="payrollOpen = true"
          @recalculate="recalcOpen = true"
        />
      </template>
    </PageHeader>

    <MonthProgressBar v-show="monthTabs" ref="progressBar" :month="monthGrid" :mobile="isMobile" @show-issues="showIssues" @changed="onDetailResolved" @summary="(v) => (monthSummary = v)" @records="openRecords" @import="openImport" @recalculate="recalcOpen = true" />

    <div class="workspace-mode" role="tablist" aria-label="排班與出勤檢視">
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

    <!-- 班表核對：首次進入才掛載，之後 v-show 常駐保留編輯中的緩衝與抽屜狀態 -->
    <ScheduleGridPanel
      v-if="gridVisited"
      v-show="activeTab === 'grid'"
      ref="gridPanel"
      :date="anchorDate"
      :filter="gridFilter"
      :focus-employee-id="props.emp ?? null"
      :focus-date="props.emp ? props.date ?? null : null"
      :revision="externalRevision"
      :view="gridView"
      :month="monthGrid"
      :header-has-month="canViewAttendance"
      @update:date="setAnchorDate"
      @update:filter="setFilter"
      @update:view="setView"
      @records="openRecords"
      @import="onGridImport"
      @import-punches="onGridImportMonth"
      @changed="onGridChanged"
      @show-patterns="progressBar?.openPatterns()"
      @focus-handled="syncQuery({ emp: undefined })"
      @recalculate="recalcOpen = true"
    />

    <div v-if="canViewAttendance" v-show="activeTab === 'records'" data-test="records-panel">
    <AttendanceMonthStats :kpis="kpis" :display-state="statsDisplayState" />
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
    <div class="workspace-record-actions"><el-button @click="anomalyDrawerOpen = true">遲到・早退・缺卡清單（{{ ws.kpis.value.pendingAnomalies }} 筆待處理）</el-button><span data-test="records-scope-note">{{ recordsScopeNote }}</span></div>
    <!-- 桌機名冊與整月明細 -->
    <div v-if="isDesktop" class="workspace-cols">
      <div class="col-roster">
        <RosterColumn
          v-model:search="rosterSearch"
          :roster="ws.roster.value"
          :selected-employee-id="currentEmployeeId"
          :pending-counts="pendingCountsByEmployee"
          :loading="ws.loading.value"
          @select="onRosterSelect"
        />
      </div>
      <div class="col-detail">
        <DetailColumn
          :mode="detailMode"
          @anomalies="anomalyDrawerOpen = true"
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
            @anomalies="anomalyDrawerOpen = true"
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

    <DutyRotationPanel v-if="canSchedule && rotationVisited" v-show="activeTab === 'rotation'" @applied="onRotationApplied" @changed="onRotationApplied" />
    <SwapHistoryPanel v-if="canSchedule && activeTab === 'swaps'" />
    <ShiftTypesPanel v-if="canSchedule && activeTab === 'shifts'" @changed="onShiftTypesChanged" />

    <el-drawer v-if="canViewAttendance && ws.hasCurrentData.value" v-model="anomalyDrawerOpen" title="全月出勤異常（全體人員）" :size="isMobile ? '100%' : '480px'" append-to-body>
      <AnomalyQueueColumn :items="ws.anomalyQueue.value" :selected-index="selectedAnomalyIndex" :loading="ws.loading.value" @select="onAnomalySelect" @filter-change="onFilterChange" @resolved="onDetailResolved" />
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
import { reactive, toRef, onBeforeUnmount, onMounted, computed, provide, ref, watch, defineAsyncComponent } from 'vue'
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
import AttendanceMonthStats from '@/components/attendance/AttendanceMonthStats.vue'
import RosterColumn from '@/components/attendance/RosterColumn.vue'
import AnomalyQueueColumn from '@/components/attendance/AnomalyQueueColumn.vue'
import DetailColumn from '@/components/attendance/DetailColumn.vue'
import ImportPreviewDialog from '@/components/attendance/ImportPreviewDialog.vue'
import MonthProgressBar, { type MonthSummary } from '@/components/schedule-attendance/MonthProgressBar.vue'
import ScheduleGridPanel from '@/components/schedule-attendance/ScheduleGridPanel.vue'
import type { GridFilter, GridView } from '@/utils/scheduleAttendanceGrid'
import { hasPermission, hasFullSalaryView } from '@/utils/auth'
const PayrollComparisonDialog = defineAsyncComponent(() => import('@/components/attendance/PayrollComparisonDialog.vue'))
const DutyRotationPanel = defineAsyncComponent(() => import('@/components/schedule/DutyRotationPanel.vue'))
const SwapHistoryPanel = defineAsyncComponent(() => import('@/components/schedule-attendance/SwapHistoryPanel.vue'))
const ShiftTypesPanel = defineAsyncComponent(() => import('@/components/schedule-attendance/ShiftTypesPanel.vue'))
const RecalculateAttendanceDrawer = defineAsyncComponent(() => import('@/components/attendance/RecalculateAttendanceDrawer.vue'))

export type WorkspaceTab = 'grid' | 'records' | 'rotation' | 'swaps' | 'shifts'

const props = defineProps<{
  tab?: WorkspaceTab
  /** 錨點日期 YYYY-MM-DD：格子顯示其所在週、明細顯示其所在月 */
  date?: string
  /** 深連結：開頁即開這個人（date 那天）的格子抽屜 */
  emp?: number
  filter?: GridFilter
  /** 班表核對的檢視（預設週）；月格子只在桌機，網址是唯一來源 */
  view?: GridView
}>()
const emit = defineEmits<{ dateChange: [date: string] }>()

const route = useRoute()
const router = useRouter()

// ── 權限（SPEC-027 §8）──────────────────────────────────────────────────────
const canViewAttendance = hasPermission('ATTENDANCE_READ')
const canSchedule = hasPermission('SCHEDULE')
const canPayrollCompare = computed(() => hasPermission('ATTENDANCE_READ') && hasPermission('SALARY_READ') && hasFullSalaryView())

const TABS: Array<{ key: WorkspaceTab; label: string; visible: boolean }> = [
  { key: 'grid', label: '班表核對', visible: true },
  { key: 'records', label: '出勤明細', visible: canViewAttendance },
  { key: 'rotation', label: '學期輪值表', visible: canSchedule },
  { key: 'swaps', label: '換班紀錄', visible: canSchedule },
  // 2026-10 自「設定 › 輪班別管理」搬入：班別是排班的字典，與班表放同頁
  { key: 'shifts', label: '班別設定', visible: canSchedule },
]
const visibleTabs = TABS.filter((t) => t.visible)
const normalizeTab = (tab: WorkspaceTab | undefined): WorkspaceTab =>
  tab && visibleTabs.some((t) => t.key === tab) ? tab : 'grid'

const activeTab = ref<WorkspaceTab>(normalizeTab(props.tab))
/** 年月切換與本月進度只對這兩個頁籤有意義 */
const monthTabs = computed(() => activeTab.value === 'grid' || activeTab.value === 'records')
const gridVisited = ref(activeTab.value === 'grid')
const rotationVisited = ref(activeTab.value === 'rotation')
const gridFilter = ref<GridFilter>(props.filter ?? 'all')
watch(activeTab, (tab) => {
  if (tab === 'grid') gridVisited.value = true
  if (tab === 'rotation') rotationVisited.value = true
})
// ?tab= 深連結在「已經停在本頁」時也要生效；值沒變時 watch 不觸發，不會蓋掉使用者自己按的頁籤。
watch(() => props.tab, (tab) => { if (tab !== undefined) activeTab.value = normalizeTab(tab) })
// 網址是篩選的唯一來源：拿掉 filter（例如站內連到不帶篩選的網址）就回到全部
watch(() => props.filter, (f) => { gridFilter.value = f ?? 'all' })

function syncQuery(patch: Record<string, string | undefined>): void {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) next[k] = v
  }
  void router.replace({ query: next })
}

function selectTab(tab: WorkspaceTab): void {
  activeTab.value = tab
  syncQuery({ tab })
}

function setFilter(filter: GridFilter): void {
  gridFilter.value = filter
  syncQuery({ filter: filter === 'all' ? undefined : filter })
}

/** 本月進度③與匯入完成：看整月的待處理。桌機切到月格子，看到的數字才會和「本月 N 格待處理」相同 */
function showIssues(): void {
  activeTab.value = 'grid'
  gridFilter.value = 'issues'
  syncQuery({ tab: 'grid', filter: 'issues', ...(isDesktop.value ? { view: 'month' } : {}) })
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

// 換週會清掉格子面板未儲存的週班別：頁內換週／換月一律先問面板（它決定要不要詢問使用者）
const gridPanel = ref<InstanceType<typeof ScheduleGridPanel> | null>(null)

async function setAnchorDate(date: string): Promise<void> {
  if (gridPanel.value && !(await gridPanel.value.confirmWeekChange(date))) return
  anchorDate.value = date
  syncQuery({ date })
}

function setMonth(year: number, month: number): void {
  void setAnchorDate(`${year}-${String(month).padStart(2, '0')}-01`)
}

// 資料異動計數：格子編輯、匯入、明細處理後遞增，本月進度據此重算
const dataRevision = ref(0)
// 格子以外的異動（明細處理、匯入、輪值表套用）：格子據此重新載入；格子自己的編輯不經這裡，避免重複載入
const externalRevision = ref(0)
// 本月整月格子：進度條與月格子共用同一份（D-06）；換月或資料異動（dataRevision）時重抓
const monthGrid = useMonthGrid(anchorDate, dataRevision)
// 出勤明細借用班表核對的判定（同一人日兩個頁籤的判定並列，防止在疑似換班的日子接受遲到扣款）
provide(GRID_VERDICT_KEY, buildGridVerdictLookup(monthGrid))
const progressBar = ref<InstanceType<typeof MonthProgressBar> | null>(null)

// ── workspace composable ───────────────────────────────────────────────────
const ws = useAttendanceWorkspace(toRef(query, 'year'), toRef(query, 'month'))
const kpis = computed(() => ws.kpis.value)
const rosterSearch = ref('')
// 名冊分組要用「還沒處理完的」異常數：roster 的 late_count 等來自月統計，不會因為
// 管理者接受扣款或豁免而減少，直接拿來分組會讓處理完的人一直掛在「有待處理」。
const pendingCountsByEmployee = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const card of ws.anomalyQueue.value) {
    if (card.confirmed_action !== null) continue
    counts[card.employee_number] = (counts[card.employee_number] ?? 0) + 1
  }
  return counts
})
const statsDisplayState = computed(() => ws.hasCurrentData.value ? (ws.loadState.value === 'success' ? 'ready' : 'stale') : (ws.loading.value ? 'loading' : 'unavailable'))
const showEmptyRecords = computed(() => !focusDate.value && !rosterSearch.value.trim() && ws.loadState.value === 'success' && ws.hasCurrentData.value && ws.roster.value.length === 0 && ws.anomalyQueue.value.length === 0)

// ── 錯誤通知 ────────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── 響應式版面 ──────────────────────────────────────────────────────────────
const { isMobile } = useIsMobile()
const isDesktop = computed(() => !isMobile.value)
// 月格子只在桌機（SPEC-027 §2：手機只有週模式）；網址是唯一來源
const gridView = computed<GridView>(() => (isMobile.value ? 'week' : props.view ?? 'week'))

/** 週／月切換；帶 date＝點月格子的週次欄頭切到該週（先問面板未儲存的週排班） */
async function setView(view: GridView, date?: string): Promise<void> {
  if (date && gridPanel.value && !(await gridPanel.value.confirmWeekChange(date))) return
  if (date) anchorDate.value = date
  syncQuery({ view: view === 'month' ? 'month' : undefined, ...(date ? { date } : {}) })
}

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
 */
const defaultEmployeeId = ref<number | null>(null)
let defaultPeriod: string | null = null
watch([ws.roster, ws.loadedPeriod], () => {
  if (!ws.hasCurrentData.value) return
  const stillThere = ws.roster.value.some((row) => row.employee_id === defaultEmployeeId.value)
  if (ws.loadedPeriod.value !== defaultPeriod || !stillThere) {
    defaultPeriod = ws.loadedPeriod.value
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
  externalRevision.value += 1
}

function onNavigate(delta: number): void {
  const max = Math.max(0, ws.anomalyQueue.value.length - 1)
  selectAnomalyAt(Math.min(Math.max(0, selectedAnomalyIndex.value + delta), max))
}

/**
 * 格子抽屜「看他整月」：切到出勤明細並聚焦該人該日（原打卡核對「查看出勤明細」）。
 * 月模式點的格子可在任一週，錨點跨週會讓格子捨棄未儲存的週排班，所以先問面板；不放行就整個不動。
 */
async function openRecords(employeeId: number, date: string): Promise<void> {
  if (gridPanel.value && !(await gridPanel.value.confirmWeekChange(date))) return
  anchorDate.value = date
  activeTab.value = 'records'
  syncQuery({ tab: 'records', date })
  selectedEmployeeId.value = employeeId
  focusDate.value = date
  detailMode.value = 'month'
  if (!isDesktop.value) mobileTab.value = 'detail'
}

/** 抽屜「匯入這天打卡」：同上先問未儲存的週排班；錨點與網址同步移到該日（與 setAnchorDate 一致）。 */
async function onGridImport(row: { employee_id: number; employee_name: string; date: string }): Promise<void> {
  if (gridPanel.value && !(await gridPanel.value.confirmWeekChange(row.date))) return
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

async function onGridChanged(): Promise<void> {
  dataRevision.value += 1
  importRevision.value += 1 // 出勤明細頁籤常駐，格子確認／改班後它的整月表也要刷新
  if (canViewAttendance) await onResolved()
}

function onRotationApplied(): void {
  dataRevision.value += 1
  externalRevision.value += 1
}

// 班別的時段、名稱、啟用狀態變了：格子的班別選單與應上班時段判定都要重抓（格子 v-show 常駐，不會自己重載）
function onShiftTypesChanged(): void {
  dataRevision.value += 1
  externalRevision.value += 1
}

async function onImported(): Promise<void> {
  importRevision.value += 1
  dataRevision.value += 1
  externalRevision.value += 1
  // 匯入完成 → 直接看有問題的格子（SPEC-027 §6.3 #22）
  showIssues()
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  clampSelectedIndex()
  ElMessage.success('匯入完成')
}

// 月報匯出前的提醒：用本月進度那份統計（同一個「待處理」定義）；別月或還沒載到就不擋
const monthSummary = ref<MonthSummary | null>(null)

/** 出勤明細的清單只是班表核對待處理的一部分：把兩個數字的關係寫出來，不讓 284 與 435 各說各話 */
const recordsScopeNote = computed(() => {
  const monthStart = `${query.year}-${String(query.month).padStart(2, '0')}-01`
  const s = monthSummary.value
  const scope = s && s.month === monthStart && s.issues > 0 ? `班表核對本月 ${s.issues} 格待處理中，` : ''
  return `${scope}有打卡紀錄的遲到、早退、缺卡在這裡處理（一人一天算一筆）；疑似缺勤、疑似換班與資料待補要在「班表核對」處理。`
})

/** 出勤明細「到班表核對處理」：切到班表核對並開這個人這天的抽屜（疑似換班要在那裡確認當日班別） */
async function openGridCell(employeeId: number, date: string): Promise<void> {
  if (gridPanel.value && !(await gridPanel.value.confirmWeekChange(date))) return
  anchorDate.value = date
  activeTab.value = 'grid'
  syncQuery({ tab: 'grid', date, emp: String(employeeId), view: undefined })
}

async function onExport(): Promise<void> {
  const monthStart = `${query.year}-${String(query.month).padStart(2, '0')}-01`
  const s = monthSummary.value
  if (s && s.month === monthStart && (s.issues > 0 || s.missingImportDays > 0)) {
    const parts = [
      s.issues > 0 ? `${s.issues} 格待處理` : '',
      s.missingImportDays > 0 ? `${s.missingImportDays} 天打卡還沒匯入` : '',
    ].filter(Boolean)
    try {
      await ElMessageBox.confirm(
        `${query.month} 月還有 ${parts.join('、')}。月報會照目前的資料產出，之後處理完要重新匯出。`,
        `匯出 ${query.month} 月月報`,
        { type: 'warning', confirmButtonText: '仍要匯出', cancelButtonText: '先去處理', distinguishCancelAndClose: true },
      )
    } catch (action) {
      if (action === 'cancel') showIssues()
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
    // 輪值表、換班、班別設定不以月為範圍：只換錨點，不提示
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

.workspace-record-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.workspace-record-actions > span { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
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

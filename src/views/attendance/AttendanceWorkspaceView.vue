<template>
  <div class="attendance-workspace">
    <WorkspaceHeader
      :year="query.year"
      :month="query.month"
      :kpis="kpis"
      :display-state="statsDisplayState"
      @update:year="(v) => { query.year = v }"
      @update:month="(v) => { query.month = v }"
      @import="openImport"
      @export="onExport"
    >
      <template #month-tools><el-button v-if="canPayrollCompare" @click="payrollOpen = true">薪資扣項核對</el-button></template>
    </WorkspaceHeader>

    <div v-if="canReconcile" class="workspace-mode" aria-label="出勤核對方式">
      <el-button v-if="canReconcile" :type="reconcileOpen ? 'primary' : 'default'" @click="reconcileOpen = true">班表與打卡核對</el-button>
      <el-button v-if="canReconcile" :type="!reconcileOpen ? 'primary' : 'default'" @click="reconcileOpen = false">出勤明細與補卡</el-button>
    </div>
    <PayrollComparisonDialog v-if="payrollOpen && canPayrollCompare" v-model="payrollOpen" :year="query.year" :month="query.month" />
    <ReconciliationPanel v-if="canReconcile && reconciliationVisited" v-show="reconcileOpen" :year="query.year" :month="query.month" :revision="importRevision" @confirmed="onResolved" @records="onReconciliationRecords" @import="onReconciliationImport" />
    <div v-show="!reconcileOpen || !canReconcile">
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
    <div class="workspace-record-actions"><el-button @click="anomalyDrawerOpen = true">全月待處理異常（{{ ws.kpis.value.pendingAnomalies }}）</el-button><span>名冊搜尋只篩選人員；異常清單可另外搜尋與批次處理。</span></div>
    <!-- 桌機名冊與整月明細 -->
    <div v-if="isDesktop" class="workspace-cols">
      <div class="col-roster">
        <RosterColumn
          v-model:search="rosterSearch"
          :roster="ws.roster.value"
          :selected-employee-id="currentEmployeeId"
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
          @import="openImport"
          :year="query.year"
          :month="query.month"
          @resolved="onDetailResolved"
          @navigate="onNavigate"
          @switch-mode="switchDetailMode"
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
            @import="openImport"
            :year="query.year"
            :month="query.month"
            @resolved="onDetailResolved"
            @navigate="onNavigate"
            @switch-mode="switchDetailMode"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
    </template>

    </div>
    <el-drawer v-if="ws.hasCurrentData.value" v-model="anomalyDrawerOpen" title="全月出勤異常（全體人員）" :size="isMobile ? '100%' : '480px'" append-to-body>
      <AnomalyQueueColumn :items="ws.anomalyQueue.value" :selected-index="selectedAnomalyIndex" :loading="ws.loading.value" @select="onAnomalySelect" @filter-change="onFilterChange" @resolved="onDetailResolved" />
    </el-drawer>
    <!-- 匯入 dialog -->
    <ImportPreviewDialog
      v-model="importOpen"
      :year="query.year"
      :month="query.month"
      :source-context="importContext"
      @imported="onImported"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, toRef, onMounted, provide, computed, ref, watch, defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import { useIsMobile } from '@/composables/useIsMobile'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { downloadFile } from '@/utils/download'
import { getRecords } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'
import RosterColumn from '@/components/attendance/RosterColumn.vue'
import AnomalyQueueColumn from '@/components/attendance/AnomalyQueueColumn.vue'
import DetailColumn from '@/components/attendance/DetailColumn.vue'
import ImportPreviewDialog from '@/components/attendance/ImportPreviewDialog.vue'
import { hasPermission, hasFullSalaryView } from '@/utils/auth'
const PayrollComparisonDialog = defineAsyncComponent(() => import('@/components/attendance/PayrollComparisonDialog.vue'))
const ReconciliationPanel = defineAsyncComponent(() => import('@/components/attendance/ReconciliationPanel.vue'))

const props = defineProps<{ initialDate?: string; defaultReconcile?: boolean }>()
const emit = defineEmits<{ dateChange: [date: string] }>()

// ── getRecords 回傳列（OpenAPI 契約型別）────────────────────────────────────
type RecordRow = ApiResponse<'/attendance/records', 'get'>[number]

// ── 查詢狀態 ────────────────────────────────────────────────────────────────
const now = props.initialDate ? new Date(`${props.initialDate}T12:00:00`) : new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })

// ── workspace composable ───────────────────────────────────────────────────
const ws = useAttendanceWorkspace(toRef(query, 'year'), toRef(query, 'month'))
const kpis = computed(() => ws.kpis.value)
const rosterSearch = ref('')
const statsDisplayState = computed(() => ws.hasCurrentData.value ? (ws.loadState.value === 'success' ? 'ready' : 'stale') : (ws.loading.value ? 'loading' : 'unavailable'))
const showEmptyRecords = computed(() => !focusDate.value && !rosterSearch.value.trim() && ws.loadState.value === 'success' && ws.hasCurrentData.value && ws.roster.value.length === 0 && ws.anomalyQueue.value.length === 0)

// ── 錯誤通知 ────────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── 響應式版面 ──────────────────────────────────────────────────────────────
const { isMobile } = useIsMobile()
const isDesktop = computed(() => !isMobile.value)

// ── UI 狀態機 ────────────────────────────────────────────────────────────────
const selectedEmployeeId = ref<number | null>(null)
const selectedAnomalyIndex = ref(0)
const detailMode = ref<'resolve' | 'month'>('month')
const anomalyDrawerOpen = ref(false)
const importOpen = ref(false)
const focusDate = ref<string | null>(null)
const importContext = ref<{ employee_id: number; employee_name: string; date: string } | null>(null)
function openImport(): void { importContext.value = null; importOpen.value = true }
const payrollOpen = ref(false)
const canPayrollCompare = computed(() => hasPermission('ATTENDANCE_READ') && hasPermission('SALARY_READ') && hasFullSalaryView())
const canReconcile = computed(() => hasPermission('SCHEDULE') && hasPermission('ATTENDANCE_READ'))
const reconcileOpen = ref(props.defaultReconcile ?? false)
const reconciliationVisited = ref(reconcileOpen.value)
watch(reconcileOpen, value => { if (value) reconciliationVisited.value = true })
const importRevision = ref(0)
watch(() => [query.year, query.month], () => {
  const monthPrefix = `${query.year}-${String(query.month).padStart(2, '0')}`
  if (focusDate.value && !focusDate.value.startsWith(`${monthPrefix}-`)) focusDate.value = null
  emit('dateChange', `${monthPrefix}-01`)
})
watch(() => props.initialDate, value => {
  if (!value) return
  const date = new Date(`${value}T12:00:00`)
  query.year = date.getFullYear()
  query.month = date.getMonth() + 1
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

// ── derived: 當前異常日卡 ──────────────────────────────────────────────────
const currentAnomaly = computed<AnomalyDayCard | null>(
  () => ws.anomalyQueue.value[selectedAnomalyIndex.value] ?? null,
)

// ── derived: 當前員工 DB 主鍵 ─────────────────────────────────────────────
// RosterColumn 點選時 selectedEmployeeId 已有值；
// 從 AnomalyQueue 選取時 selectedEmployeeId=null，用 anomaly.employee_number 對照名冊
const currentEmployeeId = computed<number | null>(() => {
  if (selectedEmployeeId.value != null) return selectedEmployeeId.value
  if (detailMode.value === 'month') return ws.roster.value[0]?.employee_id ?? null
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

const currentEmployeeName = computed(() => ws.roster.value.find(row => row.employee_id === currentEmployeeId.value)?.employee_name ?? '')

// ── 監聽 [currentEmployeeId, year, month]：換月先清快取再載入 ──────────────
// 合併為單一 watch 避免換月時 Watch1（載入）先跑命中舊快取、Watch2（清快取）後跑的競態。
// 邏輯：若 year 或 month 有變化，先清快取；再針對當前 empId 執行 cache-miss 載入。
// request-sequence guard（recSeq）：換月/換員工時，舊一次 in-flight 的 getRecords 回應
// 可能在較新一次之後才 resolve；若無守衛會用舊月資料回填快取覆寫最新月，造成顯示與快取不一致。
// 每次觸發遞增 recSeq 並在 await 後比對，過期回應直接丟棄。
let recSeq = 0
watch(
  [currentEmployeeId, () => query.year, () => query.month] as const,
  async ([empId, y, m], [, oldY, oldM]) => {
    const seq = ++recSeq
    // 換月或換年 → 清快取（確保不命中舊月資料）
    if (y !== oldY || m !== oldM) {
      recordsCache.value = new Map()
    }
    if (empId == null) return
    if (recordsCache.value.has(empId)) return
    try {
      const res = await getRecords({ year: y, month: m, employee_id: empId })
      // 較新一次 watch 觸發已使本次回應過期 → 丟棄，避免舊月 in-flight 回填快取
      if (seq !== recSeq) return
      recordsCache.value = new Map(recordsCache.value).set(empId, res.data ?? [])
    } catch (err) {
      notify(err, 'AttendanceWorkspaceView.loadRecords', null, { prefix: '載入打卡記錄失敗' })
    }
  },
  { immediate: false },
)

// ── context：從快取找當日記錄 ─────────────────────────────────────────────
const context = computed(() => {
  const a = currentAnomaly.value
  const empId = currentEmployeeId.value
  const rec =
    a != null && empId != null
      ? (recordsCache.value.get(empId) ?? []).find((r) => r.date === a.date) ?? null
      : null
  return {
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
  selectedAnomalyIndex.value = idx
  selectedEmployeeId.value = null // 走 anomaly.employee_number → roster 對照
  detailMode.value = 'resolve'
  if (isMobile.value) mobileTab.value = 'detail'
}

function clampSelectedIndex(): void {
  if (selectedAnomalyIndex.value >= ws.anomalyQueue.value.length) {
    selectedAnomalyIndex.value = Math.max(0, ws.anomalyQueue.value.length - 1)
  }
}

// 明細快取失效（P1-4）：resolve/import/upsert/delete 後打卡事實已變，
// 不失效會讓 ResolveCard/EmployeeMonthPanel 讀到舊資料。清空後立即補抓
// 當前員工，其餘員工待選取時 cache-miss 重載。
async function invalidateRecordsCache(): Promise<void> {
  recordsCache.value = new Map()
  const empId = currentEmployeeId.value
  if (empId == null) return
  const seq = ++recSeq
  try {
    const res = await getRecords({ year: query.year, month: query.month, employee_id: empId })
    if (seq !== recSeq) return
    recordsCache.value = new Map(recordsCache.value).set(empId, res.data ?? [])
  } catch (err) {
    notify(err, 'AttendanceWorkspaceView.reloadRecords', null, { prefix: '載入打卡記錄失敗' })
  }
}

function onFilterChange(): void {
  // 狀態/類型篩選由 AnomalyQueueColumn 本地過濾（真的生效）；此處 refresh
  // 拉最新資料，並 clamp index 防列表縮短後選取超界
  void ws.refresh().then(clampSelectedIndex)
}

async function onResolved(): Promise<void> {
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  // clamp：解決最後一筆後 index 不超界
  clampSelectedIndex()
}

async function onDetailResolved(): Promise<void> {
  await onResolved()
  importRevision.value += 1
}

function onNavigate(delta: number): void {
  const max = Math.max(0, ws.anomalyQueue.value.length - 1)
  selectedAnomalyIndex.value = Math.min(Math.max(0, selectedAnomalyIndex.value + delta), max)
}

function onReconciliationRecords(row: { employee_id: number; date: string }): void {
  const [year, month] = row.date.split('-').map(Number)
  query.year = year
  query.month = month
  reconcileOpen.value = false
  selectedEmployeeId.value = row.employee_id
  focusDate.value = row.date
  detailMode.value = 'month'
  if (!isDesktop.value) mobileTab.value = 'detail'
}

function onReconciliationImport(row: { employee_id: number; employee_name: string; date: string }): void {
  importContext.value = { employee_id: row.employee_id, employee_name: row.employee_name, date: row.date }
  const [year, month] = row.date.split('-').map(Number)
  query.year = year
  query.month = month
  importOpen.value = true
}

async function onImported(): Promise<void> {
  importRevision.value += 1
  if (canReconcile.value) reconcileOpen.value = true
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  clampSelectedIndex()
  ElMessage.success('匯入完成')
}

async function onExport(): Promise<void> {
  await downloadFile(
    `/exports/attendance?year=${query.year}&month=${query.month}`,
    `考勤月報_${query.year}_${String(query.month).padStart(2, '0')}.xlsx`,
  )
}

// ── 初始載入 ────────────────────────────────────────────────────────────────
onMounted(() => ws.refresh())

provide('attendanceWs', ws)
</script>

<style scoped>
.attendance-workspace {
  padding: var(--space-4);
}

.workspace-status { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-6); text-align: center; border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); }
.workspace-status h2, .workspace-status p { margin: 0; }
.workspace-status h2 { font-size: var(--text-lg); }
.workspace-status p { color: var(--el-text-color-secondary); }
.workspace-mode { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }

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

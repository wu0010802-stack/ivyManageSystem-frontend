<script setup lang="ts">
/**
 * CurrentSemesterOverview — 當期考核狀態總覽
 *
 * 對應 M5 重構：以 AcademicTermSelector 切換當前學期，
 * 自動取對應 cycle、4 個 KPI、員工狀態表 + 詳情 dialog。
 * Task A4：原本分離的「預覽分數」與「同步分數」（dry-run → 確認寫入）已合併為
 * 單一 ScorePreviewDialog，本頁只負責開關 dialog 與傳入 canWrite/cycleStatus/
 * hasNonParticipant（cycleStatus 讓 dialog 判斷是否可打 sync 端點，見該元件內註解）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Connection, Plus, DataAnalysis } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useClientTableFilter } from '@/composables/useClientTableFilter'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'

import {
  getAppraisalCurrentCycle,
  getAppraisalAllEmployeesStatus,
  addAppraisalParticipant,
  bulkAddAppraisalParticipantsFromActive,
  listScoringRules,
  refreshAppraisalCycle,
  getSignStatusSummary,
} from '@/api/appraisal'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { fmtPct } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { ROLE_GROUP_LABEL } from '@/constants/appraisalYearEnd'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import StatCard from '@/components/common/StatCard.vue'
import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'
import ManualEventEntrySection from './components/ManualEventEntrySection.vue'
import ScorePreviewDialog from './components/ScorePreviewDialog.vue'
import CreateCycleDialog from './components/CreateCycleDialog.vue'
import AppraisalProcessGuide from './components/AppraisalProcessGuide.vue'
import { deriveAppraisalStepStatuses, type AppraisalStepInput, type AppraisalStepKey } from './appraisalSteps'
import type { CreatedCycle } from './composables/useCreateCycle'

interface CurrentCycle {
  id: number
  base_score_calc_date?: string
  status?: string
  [key: string]: unknown
}

interface AttendanceInfo {
  late_count?: number
  early_leave_count?: number
  missing_punch_count?: number
  leave_days?: number
  absent_days?: number
}

interface RetentionInfo {
  classroom_name?: string
  retention_rate?: number | string | null
}

interface ActivityInfo {
  activity_rate?: number | string | null
}

interface DisciplinaryInfo {
  warning_count?: number
  minor_count?: number
  major_count?: number
  commend_count?: number
  minor_merit_count?: number
  major_merit_count?: number
}

interface ParticipantRow {
  employee_id?: number
  employee_name?: string
  role_group?: string
  is_participant?: boolean
  classroom_id?: number | null
  participant_id?: number | null
  attendance?: AttendanceInfo
  retention?: RetentionInfo | null
  activity?: ActivityInfo | null
  disciplinary?: DisciplinaryInfo
  [key: string]: unknown
}

interface AggregatedStatus { participants?: ParticipantRow[]; generated_at?: string }

const termStore = useAcademicTermStore()
const { notify } = useErrorNotify()
const router = useRouter()

// ── 取得 current cycle（依 termStore 切換）────────────────
const currentCycle = ref<CurrentCycle | null>(null)
const cycleLoading = ref(false)

// 回傳當次載入的 cycle（不直接寫 currentCycle.value）——由 reloadAll 在 epoch
// 守衛通過後才提交，避免晚到的舊學期請求覆寫新學期。
async function fetchCurrentCycle(): Promise<CurrentCycle | null> {
  cycleLoading.value = true
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    return data as CurrentCycle
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:fetchCycle', '載入當期週期失敗')
    return null
  } finally {
    cycleLoading.value = false
  }
}

// ── 取得 aggregated_status（cycle 存在才打）────────────────
const aggregatedStatus = ref<AggregatedStatus | null>(null)
const statusLoading = ref(false)
const lastRefreshedAt = ref<string | null>(null)

// cycle 以區域變數傳入（預設沿用 currentCycle.value 供其他 caller）；isStale 讓
// reloadAll 在切學期後判定本次載入已過期，await 後不再提交舊資料。
async function loadStatus(
  cycle: CurrentCycle | null = currentCycle.value,
  isStale: () => boolean = () => false,
) {
  if (!cycle) {
    aggregatedStatus.value = null
    return
  }
  statusLoading.value = true
  try {
    const { data } = await getAppraisalAllEmployeesStatus(cycle.id)
    if (isStale()) return
    aggregatedStatus.value = data as AggregatedStatus
    lastRefreshedAt.value = (data as AggregatedStatus)?.generated_at ?? null
  } catch (e) {
    if (isStale()) return
    notify(e, 'CurrentSemesterOverview:fetchStatus', '載入彙整狀態失敗')
  } finally {
    statusLoading.value = false
  }
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ── 載入扣分規則（給 detail dialog tooltip 顯示）──────────
const rulesByCode = ref<Record<string, unknown>>({})
async function loadRules(
  cycle: CurrentCycle | null = currentCycle.value,
  isStale: () => boolean = () => false,
) {
  if (!cycle) {
    rulesByCode.value = {}
    return
  }
  try {
    const { data } = await listScoringRules(cycle.base_score_calc_date ?? "")
    if (isStale()) return
    const list: { item_code?: string; [key: string]: unknown }[] = Array.isArray(data) ? data : ((data as { rules?: unknown[] })?.rules || [])
    rulesByCode.value = Object.fromEntries(list.map((r) => [r.item_code, r]))
  } catch (e) {
    // 失敗不影響主流程，rulesByCode 留空 dict tooltip 自動隱藏
    if (isStale()) return
    rulesByCode.value = {}
  }
}

// ── 簽核統計（給流程引導條 sync/recompute/sign 步驟判定用，Task A3）───
const signSummary = ref<{ counts: Record<string, number> } | null>(null)
async function loadSignSummary(
  cycle: CurrentCycle | null = currentCycle.value,
  isStale: () => boolean = () => false,
) {
  if (!cycle) {
    signSummary.value = null
    return
  }
  try {
    const { data } = await getSignStatusSummary(cycle.id)
    if (isStale()) return
    signSummary.value = { counts: (data as { counts?: Record<string, number> })?.counts ?? {} }
  } catch (e) {
    // 失敗不影響主流程；引導條沿用保守值（summaryCount 落回 0，顯示較早步驟，不誤判 done）
    if (isStale()) return
    signSummary.value = null
  }
}

// ── 進頁即算：OPEN cycle 先 refresh 再 loadStatus ──────────
const refreshing = ref(false)
// 自動重算失敗不再靜默：改顯示 stale-warning banner（可關閉），提示使用者目前是舊資料
const refreshFailed = ref(false)

async function refreshIfOpen(
  cycle: CurrentCycle | null = currentCycle.value,
  isStale: () => boolean = () => false,
) {
  if (!cycle || cycle.status !== 'OPEN' || refreshing.value) return
  refreshing.value = true
  try {
    await refreshAppraisalCycle(cycle.id)
  } catch (e) {
    // 失敗不擋 loadStatus，總覽仍顯示既有彙整資料，但需顯式告知使用者資料可能是舊的
    // （切學期後本次已過期則不再彈 stale banner，避免誤標新學期資料為舊）
    if (!isStale()) refreshFailed.value = true
  } finally {
    refreshing.value = false
  }
}

// 防切學期 race：晚到的舊 reloadAll 不得蓋掉新學期資料（epoch 比對）。
// 各子步驟以區域變數 cycle 鎖定該次呼叫，並在每個 await 後檢查 isStale。
let reloadEpoch = 0

async function reloadAll() {
  const epoch = ++reloadEpoch
  const isStale = () => epoch !== reloadEpoch
  refreshFailed.value = false

  const cycle = await fetchCurrentCycle()
  if (isStale()) return
  currentCycle.value = cycle

  await refreshIfOpen(cycle, isStale)
  if (isStale()) return

  await loadStatus(cycle, isStale)
  if (isStale()) return

  await loadRules(cycle, isStale)
  if (isStale()) return

  await loadSignSummary(cycle, isStale)
}

watch(
  () => `${termStore.school_year}-${termStore.semester}`,
  () => {
    reloadAll()
  },
  { immediate: true },
)

// ── KPI 計算 ──────────────────────────────────────────────
const participants = computed<ParticipantRow[]>(() => aggregatedStatus.value?.participants || [])

const {
  searchQuery: overviewSearch,
  filterValues: overviewFilters,
  filtered: filteredParticipants,
  total: participantTotal,
  shown: participantShown,
} = useClientTableFilter<ParticipantRow>({
  source: () => participants.value,
  searchFields: (p) => [p.employee_name ?? ''],
  filters: {
    participation: (p, v) => v !== 'non' || p.is_participant === false,
    discipline: (p, v) => {
      if (v !== 'has') return true
      const d = p.disciplinary || {}
      return (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0) > 0
    },
  },
})

const overviewFilterGroups = [
  { key: 'participation', label: '參與', options: [{ label: '未加入考核', value: 'non' }] },
  { key: 'discipline', label: '懲處', options: [{ label: '有懲處', value: 'has' }] },
]

const employeeCount = computed(() => participants.value.length)

const avgAttendanceAbnormal = computed(() => {
  const list = participants.value
  if (!list.length) return 0
  const sum = list.reduce((acc, p) => {
    const a = p.attendance || {}
    return acc + (a.late_count || 0) + (a.early_leave_count || 0)
      + (a.missing_punch_count || 0) + (a.leave_days || 0) + (a.absent_days || 0)
  }, 0)
  return (sum / list.length).toFixed(1)
})

const avgRetention = computed(() => {
  const list = participants.value.filter(
    (p) => p.retention && p.retention.retention_rate != null,
  )
  if (!list.length) return '—'
  const sum = list.reduce((acc, p) => acc + Number(p.retention?.retention_rate || 0), 0)
  return fmtPct(sum / list.length)
})

const totalDisciplinary = computed(() => {
  return participants.value.reduce((acc, p) => {
    const d = p.disciplinary || {}
    return acc + (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  }, 0)
})

// ── KPI 區載入狀態：statusLoading（彙整資料）或 refreshing（進頁重算中）
// 皆視為 KPI 尚不可信，改顯示 skeleton 佔位，避免顯示過渡性的 0 值
const kpiLoading = computed(() => statusLoading.value || refreshing.value)

// ── 員工狀態表 row 格式化 ─────────────────────────────────
// 不屬於班級 scope 的 role（不顯示留校率 / 才藝報名率）
const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])

function isClassroomScoped(row: ParticipantRow) {
  return !NON_CLASSROOM_ROLES.has(row.role_group ?? '')
}

// 出缺勤欄：一格塞 5 個數字的字串已改拆 badge，只列非零項，全零顯示 —
// 曠職自 2026-06-11 起與請假分流（−4/日），必須獨立可見（非零時單獨一顆 badge）
interface AttnItem { key: keyof AttendanceInfo; label: string }
const ATTN_ITEMS: AttnItem[] = [
  { key: 'late_count', label: '遲' },
  { key: 'early_leave_count', label: '早' },
  { key: 'missing_punch_count', label: '未' },
  { key: 'leave_days', label: '假' },
  { key: 'absent_days', label: '曠' },
]

function attnBadges(row: ParticipantRow) {
  const a = row.attendance || {}
  return ATTN_ITEMS.filter((i) => Number(a[i.key] ?? 0) > 0).map((i) => ({ ...i, count: Number(a[i.key]) }))
}

function formatRetention(row: ParticipantRow) {
  if (!isClassroomScoped(row) || !row.retention || row.retention.retention_rate == null) return '—'
  return fmtPct(row.retention.retention_rate)
}

function formatActivity(row: ParticipantRow) {
  if (!isClassroomScoped(row) || !row.activity || row.activity.activity_rate == null) return '—'
  return fmtPct(row.activity.activity_rate)
}

// 功過欄：原字串 `過x／功x` 已改拆 badge（過=danger、功=success），非零才顯示，全零顯示 —
// 功過雙向（2026-06-11 規章對齊）：只顯示過會與 suggested_score_delta 對不上帳
interface MeritBadge { key: string; label: string; count: number; type: 'danger' | 'success' }
function meritBadges(row: ParticipantRow): MeritBadge[] {
  const d = row.disciplinary || {}
  const demerit = (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  const merit = (d.commend_count || 0) + (d.minor_merit_count || 0) + (d.major_merit_count || 0)
  const badges: MeritBadge[] = []
  if (demerit > 0) badges.push({ key: 'demerit', label: '過', count: demerit, type: 'danger' })
  if (merit > 0) badges.push({ key: 'merit', label: '功', count: merit, type: 'success' })
  return badges
}

// ── 詳情 dialog ────────────────────────────────────────────
const detailDialogVisible = ref(false)
const detailParticipant = ref<ParticipantRow | null>(null)

function openDetail(row: ParticipantRow) {
  detailParticipant.value = row
  detailDialogVisible.value = true
}

// ── 分數同步（Task A4：預覽 + 同步已合併進 ScorePreviewDialog 內部，
// 此處只負責開關 dialog 與寫入權限判定；dry-run/確認寫入呼叫全移入該元件）──
async function handleSynced() {
  // 同步只新增/覆寫 auto: 開頭的 AppraisalScoreItem，不動 cycle/rules/簽核狀態，
  // 沿用既有 confirmSync 的窄範圍 refresh（避免不必要的整頁 reloadAll）。
  await loadStatus()
}

// ── 加入考核 per-row + 一鍵加入 bulk ───────────────────────
const hasNonParticipant = computed(() =>
  participants.value.some((p) => p.is_participant === false),
)

// 分數同步 dialog 的「確認寫入」footer 是否顯示（無此元件層守衛，動作純靠路由 gate +
// 後端；此處補寫入型動作前置守衛，比照 CLAUDE.md §已確認的現況事實）。
const canSyncWrite = computed(() => hasPermission('APPRAISAL_EVENT_WRITE'))

// 傳給 ScorePreviewDialog 的 cycleStatus：後端 sync_score_items 一律要求 cycle 為
// OPEN，dialog 內部靠 canWrite && cycleStatus==='OPEN' 決定是否打 sync dry-run，
// 避免只有 READ 權限或 cycle 非 OPEN 的使用者一開 dialog 就撞 403/400。
const scorePreviewCycleStatus = computed(
  () => currentCycle.value?.status as 'OPEN' | 'LOCKED' | 'CLOSED' | undefined,
)

const addingRowEmployeeId = ref<number | null>(null)
const bulkAdding = ref(false)

async function addRowToCycle(row: ParticipantRow) {
  if (!currentCycle.value) return
  addingRowEmployeeId.value = row.employee_id ?? null
  try {
    await addAppraisalParticipant(currentCycle.value.id, {
      employee_id: row.employee_id!,
      role_group: row.role_group!,
      classroom_id: row.classroom_id ?? null,
    })
    ElMessage.success(`已將 ${row.employee_name} 加入考核`)
    await loadStatus()
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:addRow', '加入考核失敗')
  } finally {
    addingRowEmployeeId.value = null
  }
}

async function bulkAddAll() {
  if (!currentCycle.value) return
  try {
    await ElMessageBox.confirm(
      '將把所有未加入的在職教師加入本學期考核，確定嗎？',
      '一鍵加入全部教師',
      { type: 'info' },
    )
  } catch {
    return
  }
  bulkAdding.value = true
  try {
    const { data } = await bulkAddAppraisalParticipantsFromActive(
      currentCycle.value.id,
      null,
    )
    const d = data as { created_count?: number; skipped_count?: number }
    ElMessage.success(`已新增 ${d.created_count} 人、跳過 ${d.skipped_count} 人`)
    await loadStatus()
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:bulkAdd', '一鍵加入失敗')
  } finally {
    bulkAdding.value = false
  }
}

// ── 建立本學期週期（Task A7：3 入口統一改開共用 CreateCycleDialog，本頁只負責
// 開關 dialog 與 @created 後續處理；建立/日期推算/寫入權限全移入該元件）──
const createDialogVisible = ref(false)
// canWrite gate 對齊後端 POST /appraisal/cycles 守衛（Permission.APPRAISAL_FINALIZE）
const canCreateCycle = computed(() => hasPermission('APPRAISAL_FINALIZE'))

function openCreateDialog() {
  createDialogVisible.value = true
}

// 建立成功後「設當期」：若使用者在 dialog 內把學年學期改成非目前檢視中的學期，
// 切換 termStore 讓總覽跟著新週期走（既有 watch(termStore...) 會自動觸發 reloadAll）；
// 未改動（最常見）則直接 reloadAll 讓 banner 消失、KPI/表格出現。引導條下一步
// participants 高亮無需額外處理——currentCycle 更新後 stepStatuses 會自動重新推導。
async function handleCycleCreated(cycle: CreatedCycle) {
  const academicYear = Number(cycle.academic_year)
  const semesterInt = String(cycle.semester) === 'FIRST' ? 1 : 2
  if (
    Number.isFinite(academicYear)
    && (academicYear !== termStore.school_year || semesterInt !== termStore.semester)
  ) {
    termStore.setTerm(academicYear, semesterInt)
    return
  }
  await reloadAll()
}

// ── 預覽分數 dialog（與同步分數 preview 區隔）────────────
const scorePreviewDialogVisible = ref(false)

// ── 流程引導條（Task A3）：組 AppraisalStepInput + navigate 跨頁跳轉 ──
// 手填 collapse 的展開狀態改由 v-model 控制，讓 onGuideNavigate('manual') 可展開它
const manualActiveNames = ref<string[]>([])

const stepInput = computed<AppraisalStepInput>(() => {
  const counts = signSummary.value?.counts ?? {}
  const totalSignCount = Object.values(counts).reduce((acc, n) => acc + (n || 0), 0)
  const finalizedSignCount = counts.FINALIZED || 0
  return {
    hasCycle: !!currentCycle.value,
    cycleStatus: (currentCycle.value?.status as 'OPEN' | 'LOCKED' | 'CLOSED' | undefined) ?? null,
    participantCount: employeeCount.value,
    hasNonParticipant: hasNonParticipant.value,
    // summaryCount/totalCount 皆取自簽核統計總數（未載入時保守回落 0，顯示較早步驟）
    summaryCount: totalSignCount,
    pendingSignCount: totalSignCount - finalizedSignCount,
    finalizedCount: finalizedSignCount,
    totalCount: totalSignCount,
  }
})

const stepStatuses = computed(() => deriveAppraisalStepStatuses(stepInput.value))

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// navigate 只接「現在已存在」的動作。
// sync 步驟（Task A4）：預覽/同步已合併進單一 ScorePreviewDialog，改為開該 dialog。
// create 步驟（Task A7）：改開統一 CreateCycleDialog（原本直接呼叫 createCurrentCycle
// 已隨三入口收斂移除）。
function onGuideNavigate(key: AppraisalStepKey) {
  switch (key) {
    case 'create':
      openCreateDialog()
      break
    case 'participants':
      scrollToSection('appraisal-participants-section')
      break
    case 'manual':
      manualActiveNames.value = ['manual']
      scrollToSection('appraisal-manual-section')
      break
    case 'sync':
      scorePreviewDialogVisible.value = true
      break
    case 'recompute':
      reloadAll()
      break
    case 'sign':
      router.push('/appraisal-year-end/appraisal?stage=sign')
      break
  }
}
</script>

<template>
  <div class="current-semester-overview">
    <!-- toolbar -->
    <div class="toolbar">
      <div class="toolbar__left">
        <AcademicTermSelector />
        <span
          v-if="currentCycle && lastRefreshedAt"
          class="toolbar__updated"
          data-test="last-refreshed-at"
        >
          已即時重算 {{ formatTime(lastRefreshedAt) }}
        </span>
      </div>
      <div class="toolbar__actions">
        <el-button
          v-if="currentCycle && hasNonParticipant"
          type="success"
          :icon="Plus"
          :loading="bulkAdding"
          data-test="bulk-add-btn"
          @click="bulkAddAll"
        >
          一鍵加入全部教師
        </el-button>
        <el-button
          v-if="currentCycle"
          type="primary"
          :icon="DataAnalysis"
          data-test="preview-btn"
          @click="scorePreviewDialogVisible = true"
        >
          預覽並同步分數
        </el-button>
        <el-button
          :icon="Refresh"
          :loading="cycleLoading || refreshing || statusLoading"
          data-test="refresh-btn"
          @click="reloadAll"
        >
          重新整理
        </el-button>
      </div>
    </div>

    <AppraisalProcessGuide :statuses="stepStatuses" @navigate="onGuideNavigate" />

    <!-- cycle 不存在 banner -->
    <el-alert
      v-if="!cycleLoading && !currentCycle"
      type="warning"
      :closable="false"
      data-test="no-cycle-banner"
      class="banner"
    >
      <template #title>
        本學期（{{ termStore.school_year }} 學年度
        {{ termStore.semester === 1 ? '上' : '下' }}學期）尚未建立考核週期
      </template>
      <template #default>
        <div class="banner__body">
          <span>建立後即可開始彙整出缺勤、班級留校率、才藝報名率、懲處記錄。</span>
          <el-button
            type="primary"
            :icon="Plus"
            data-test="create-cycle-btn"
            @click="openCreateDialog"
          >
            建立本學期週期
          </el-button>
        </div>
      </template>
    </el-alert>

    <!-- cycle 存在 → KPI + 表格 -->
    <template v-if="currentCycle">
      <el-alert
        v-if="refreshFailed"
        data-test="stale-banner"
        type="warning"
        closable
        title="自動重算失敗，目前顯示的是上次成功計算的資料"
        :description="`資料時間：${formatTime(lastRefreshedAt) || '—'}`"
        class="banner"
      />

      <div class="kpi-grid">
        <template v-if="kpiLoading">
          <el-skeleton v-for="i in 4" :key="i" :rows="1" animated class="kpi-skeleton" />
        </template>
        <template v-else>
          <StatCard label="員工總數" :value="employeeCount" :icon="Connection" color="primary" data-test="kpi-employees" />
          <StatCard
            label="平均出缺勤異常"
            :value="avgAttendanceAbnormal"
            :icon="Refresh"
            color="warning"
            data-test="kpi-attendance"
          />
          <StatCard
            label="平均班級留校率"
            :value="avgRetention"
            :icon="Connection"
            color="success"
            data-test="kpi-retention"
          />
          <StatCard
            label="懲處事件總數"
            :value="totalDisciplinary"
            :icon="Connection"
            color="danger"
            data-test="kpi-discipline"
          />
        </template>
      </div>

      <el-collapse
        id="appraisal-manual-section"
        v-model="manualActiveNames"
        class="manual-section"
        data-test="manual-section"
      >
        <el-collapse-item title="手填事件次數" name="manual">
          <ManualEventEntrySection
            :cycle-id="currentCycle.id"
            :participants="participants"
            :readonly="currentCycle.status !== 'OPEN'"
          />
        </el-collapse-item>
      </el-collapse>

      <AdminListToolbar
        v-model:search="overviewSearch"
        search-placeholder="搜尋教師姓名"
        :filters="overviewFilterGroups"
        v-model:filter-values="overviewFilters"
        :total="participantTotal"
        :shown="participantShown"
      />

      <el-table
        id="appraisal-participants-section"
        :data="filteredParticipants"
        v-loading="statusLoading"
        stripe
        empty-text="尚無員工資料"
        class="status-table"
        data-test="status-table"
      >
        <el-table-column label="員工" prop="employee_name" min-width="120" />
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            {{ ROLE_GROUP_LABEL[row.role_group] || row.role_group }}
          </template>
        </el-table-column>
        <el-table-column label="班級" width="120">
          <template #default="{ row }">
            {{ row.retention?.classroom_name || (isClassroomScoped(row) ? '—' : '—') }}
          </template>
        </el-table-column>
        <el-table-column label="遲早退/未打卡/請假/曠職" width="220">
          <template #default="{ row }">
            <span data-test="attn-cell">
              <template v-if="attnBadges(row).length">
                <el-tag v-for="b in attnBadges(row)" :key="b.key" size="small" type="warning" class="attn-badge">{{ b.label }} {{ b.count }}</el-tag>
              </template>
              <template v-else>—</template>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="班級留校率" width="120">
          <template #default="{ row }">
            <span :data-test="`retention-${row.participant_id ?? 'emp' + row.employee_id}`">{{ formatRetention(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="才藝報名率" width="120">
          <template #default="{ row }">
            <span :data-test="`activity-${row.participant_id ?? 'emp' + row.employee_id}`">{{ formatActivity(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="功過" width="110">
          <template #default="{ row }">
            <span data-test="merit-cell">
              <template v-if="meritBadges(row).length">
                <el-tag v-for="b in meritBadges(row)" :key="b.key" size="small" :type="b.type" class="attn-badge">{{ b.label }} {{ b.count }}</el-tag>
              </template>
              <template v-else>—</template>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="考核狀態" width="160">
          <template #default="{ row }">
            <template v-if="row.is_participant">
              <el-tag
                type="success"
                size="small"
                :data-test="`status-tag-emp${row.employee_id}`"
              >
                已加入
              </el-tag>
            </template>
            <template v-else>
              <el-tag
                type="info"
                size="small"
                :data-test="`status-tag-emp${row.employee_id}`"
              >
                未加入
              </el-tag>
              <el-button
                size="small"
                type="primary"
                text
                :loading="addingRowEmployeeId === row.employee_id"
                :data-test="`add-btn-emp${row.employee_id}`"
                @click="addRowToCycle(row)"
              >
                加入
              </el-button>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              text
              :data-test="`detail-btn-${row.participant_id ?? 'emp' + row.employee_id}`"
              @click="openDetail(row)"
            >
              詳情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 員工詳情 dialog -->
    <AggregatedStatusDetailDialog
      v-model:visible="detailDialogVisible"
      :participant="detailParticipant"
      :cycle="currentCycle"
      :rules="rulesByCode"
    />

    <!-- 分數同步 dialog（Task A4：合併原「預覽分數」+「同步分數」兩個分離流程）-->
    <ScorePreviewDialog
      v-model:visible="scorePreviewDialogVisible"
      :cycle-id="currentCycle?.id ?? null"
      :can-write="canSyncWrite"
      :cycle-status="scorePreviewCycleStatus"
      :has-non-participant="hasNonParticipant"
      @synced="handleSynced"
    />

    <!-- 建立考核週期 dialog（Task A7：統一 3 入口）-->
    <CreateCycleDialog
      v-model:visible="createDialogVisible"
      :can-write="canCreateCycle"
      @created="handleCycleCreated"
    />
  </div>
</template>

<style scoped>
.current-semester-overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.toolbar__updated {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.toolbar__actions {
  display: flex;
  gap: var(--space-2);
}

.banner {
  margin-top: 4px;
}

.banner__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-2);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.attn-badge + .attn-badge {
  margin-left: 4px;
}

.manual-section {
  width: 100%;
}

.status-table {
  width: 100%;
}
</style>

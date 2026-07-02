<script setup lang="ts">
/**
 * CurrentSemesterOverview — 當期考核狀態總覽
 *
 * 對應 M5 重構：以 AcademicTermSelector 切換當前學期，
 * 自動取對應 cycle、4 個 KPI、員工狀態表 + 詳情 dialog、
 * 同步分數（dry-run preview → 確認寫入）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Connection, Plus, DataAnalysis } from '@element-plus/icons-vue'
import { useClientTableFilter } from '@/composables/useClientTableFilter'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'

import {
  getAppraisalCurrentCycle,
  getAppraisalAllEmployeesStatus,
  syncAppraisalScoreItems,
  createAppraisalCycle,
  addAppraisalParticipant,
  bulkAddAppraisalParticipantsFromActive,
  listScoringRules,
  refreshAppraisalCycle,
} from '@/api/appraisal'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { toAdYear } from '@/utils/academic'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import StatCard from '@/components/common/StatCard.vue'
import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'
import ManualEventEntrySection from './components/ManualEventEntrySection.vue'
import ScorePreviewDialog from './components/ScorePreviewDialog.vue'

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

interface SyncPreviewData {
  deleted_count?: number
  inserted_count?: number
  skipped_manual_count?: number
  items?: Record<string, unknown>[]
}

const termStore = useAcademicTermStore()
const { notify } = useErrorNotify()

// ── 後端 semester enum ────────────────────────────────────
const toSemesterEnum = (n: number | string) => (Number(n) === 1 ? 'FIRST' : 'SECOND')

// ── 取得 current cycle（依 termStore 切換）────────────────
const currentCycle = ref<CurrentCycle | null>(null)
const cycleLoading = ref(false)

async function fetchCurrentCycle() {
  cycleLoading.value = true
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    currentCycle.value = data as CurrentCycle
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:fetchCycle', '載入當期週期失敗')
    currentCycle.value = null
  } finally {
    cycleLoading.value = false
  }
}

// ── 取得 aggregated_status（cycle 存在才打）────────────────
const aggregatedStatus = ref<AggregatedStatus | null>(null)
const statusLoading = ref(false)
const lastRefreshedAt = ref<string | null>(null)

async function loadStatus() {
  if (!currentCycle.value) {
    aggregatedStatus.value = null
    return
  }
  statusLoading.value = true
  try {
    const { data } = await getAppraisalAllEmployeesStatus(currentCycle.value.id)
    aggregatedStatus.value = data as AggregatedStatus
    lastRefreshedAt.value = (data as AggregatedStatus)?.generated_at ?? null
  } catch (e) {
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
async function loadRules() {
  if (!currentCycle.value) {
    rulesByCode.value = {}
    return
  }
  try {
    const { data } = await listScoringRules(currentCycle.value.base_score_calc_date ?? "")
    const list: { item_code?: string; [key: string]: unknown }[] = Array.isArray(data) ? data : ((data as { rules?: unknown[] })?.rules || [])
    rulesByCode.value = Object.fromEntries(list.map((r) => [r.item_code, r]))
  } catch (e) {
    // 失敗不影響主流程，rulesByCode 留空 dict tooltip 自動隱藏
    rulesByCode.value = {}
  }
}

// ── 進頁即算：OPEN cycle 先 refresh 再 loadStatus ──────────
const refreshing = ref(false)

async function refreshIfOpen() {
  if (!currentCycle.value || currentCycle.value.status !== 'OPEN' || refreshing.value) return
  refreshing.value = true
  try {
    await refreshAppraisalCycle(currentCycle.value.id)
  } catch (e) {
    // 靜默降級：refresh 失敗不擋 loadStatus，總覽仍顯示既有彙整資料
  } finally {
    refreshing.value = false
  }
}

async function reloadAll() {
  await fetchCurrentCycle()
  await refreshIfOpen()
  await loadStatus()
  await loadRules()
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
  return `${(sum / list.length).toFixed(1)}%`
})

const totalDisciplinary = computed(() => {
  return participants.value.reduce((acc, p) => {
    const d = p.disciplinary || {}
    return acc + (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  }, 0)
})

// ── 員工狀態表 row 格式化 ─────────────────────────────────
const ROLE_GROUP_LABEL: Record<string, string> = {
  HEAD_TEACHER: '正導師',
  ASSISTANT_TEACHER: '副導師',
  SUPERVISOR: '主管',
  STAFF: '行政',
  COOK: '廚工',
}

// 不屬於班級 scope 的 role（不顯示留校率 / 才藝報名率）
const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])

function isClassroomScoped(row: ParticipantRow) {
  return !NON_CLASSROOM_ROLES.has(row.role_group ?? '')
}

function formatAttendance(row: ParticipantRow) {
  const a = row.attendance || {}
  // 曠職自 2026-06-11 起與請假分流（−4/日），必須獨立可見
  return `遲${a.late_count || 0}/早${a.early_leave_count || 0}/未${a.missing_punch_count || 0}/假${a.leave_days || 0}/曠${a.absent_days || 0}`
}

function formatRetention(row: ParticipantRow) {
  if (!isClassroomScoped(row) || !row.retention || row.retention.retention_rate == null) return '—'
  return `${Number(row.retention.retention_rate).toFixed(1)}%`
}

function formatActivity(row: ParticipantRow) {
  if (!isClassroomScoped(row) || !row.activity || row.activity.activity_rate == null) return '—'
  return `${Number(row.activity.activity_rate).toFixed(1)}%`
}

function formatDisciplinary(row: ParticipantRow) {
  const d = row.disciplinary || {}
  const demerit = (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  const merit = (d.commend_count || 0) + (d.minor_merit_count || 0) + (d.major_merit_count || 0)
  // 功過雙向（2026-06-11 規章對齊）：只顯示過會與 suggested_score_delta 對不上帳
  return `過${demerit}／功${merit}`
}

// ── 詳情 dialog ────────────────────────────────────────────
const detailDialogVisible = ref(false)
const detailParticipant = ref<ParticipantRow | null>(null)

function openDetail(row: ParticipantRow) {
  detailParticipant.value = row
  detailDialogVisible.value = true
}

// ── 同步分數流程 ──────────────────────────────────────────
const previewDialogVisible = ref(false)
const previewLoading = ref(false)
const previewData = ref<SyncPreviewData | null>(null)
const confirmLoading = ref(false)

async function openSyncPreview() {
  if (!currentCycle.value) return
  previewLoading.value = true
  previewDialogVisible.value = true
  previewData.value = null
  try {
    const { data } = await syncAppraisalScoreItems(currentCycle.value.id, { dryRun: true })
    previewData.value = data as SyncPreviewData
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:syncPreview', '預覽同步分數失敗')
    previewDialogVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

async function confirmSync() {
  if (!currentCycle.value) return
  confirmLoading.value = true
  try {
    const { data } = await syncAppraisalScoreItems(currentCycle.value.id, { dryRun: false })
    const d = data as SyncPreviewData
    ElMessage.success(
      `同步完成：刪除 ${d.deleted_count} 筆、新增 ${d.inserted_count} 筆、保留人工 ${d.skipped_manual_count} 筆`,
    )
    previewDialogVisible.value = false
    await loadStatus()
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:syncConfirm', '同步分數失敗')
  } finally {
    confirmLoading.value = false
  }
}

// ── 加入考核 per-row + 一鍵加入 bulk ───────────────────────
const hasNonParticipant = computed(() =>
  participants.value.some((p) => p.is_participant === false),
)

const syncDisabledReason = computed(() =>
  hasNonParticipant.value ? '請先把所有教師加入考核再同步' : '',
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

// ── 建立本學期週期（D5 預設日期）──────────────────────────
const creatingCycle = ref(false)

function defaultDatesFor(schoolYear: number, semester: number | string) {
  // school_year 為民國
  const yearAD = toAdYear(Number(schoolYear))
  if (Number(semester) === 1) {
    return {
      start_date: `${yearAD}-08-01`,
      end_date: `${yearAD + 1}-01-31`,
      base_score_calc_date: `${yearAD}-09-15`,
    }
  }
  return {
    start_date: `${yearAD + 1}-02-01`,
    end_date: `${yearAD + 1}-07-31`,
    base_score_calc_date: `${yearAD + 1}-03-15`,
  }
}

async function createCurrentCycle() {
  try {
    await ElMessageBox.confirm(
      `將為 ${termStore.school_year} 學年度 ${termStore.semester === 1 ? '上' : '下'}學期建立考核週期，確定嗎？`,
      '建立考核週期',
      { type: 'info' },
    )
  } catch {
    return
  }
  creatingCycle.value = true
  try {
    const dates = defaultDatesFor(termStore.school_year, termStore.semester)
    await createAppraisalCycle({
      academic_year: termStore.school_year,
      semester: toSemesterEnum(termStore.semester),
      ...dates,
      enrollment_target: 0,
      enrollment_actual: null,
    })
    ElMessage.success('考核週期已建立')
    await reloadAll()
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:createCycle', '建立週期失敗')
  } finally {
    creatingCycle.value = false
  }
}

// ── 預覽分數 dialog（與同步分數 preview 區隔）────────────
const scorePreviewDialogVisible = ref(false)
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
          type="info"
          :icon="DataAnalysis"
          data-test="preview-btn"
          @click="scorePreviewDialogVisible = true"
        >
          預覽分數
        </el-button>
        <el-tooltip
          v-if="currentCycle"
          :content="syncDisabledReason"
          :disabled="!hasNonParticipant"
          placement="top"
        >
          <span>
            <el-button
              type="primary"
              :icon="Connection"
              :disabled="hasNonParticipant"
              data-test="sync-score-btn"
              @click="openSyncPreview"
            >
              同步分數
            </el-button>
          </span>
        </el-tooltip>
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
            :loading="creatingCycle"
            data-test="create-cycle-btn"
            @click="createCurrentCycle"
          >
            建立本學期週期
          </el-button>
        </div>
      </template>
    </el-alert>

    <!-- cycle 存在 → KPI + 表格 -->
    <template v-if="currentCycle">
      <div class="kpi-grid">
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
      </div>

      <el-collapse class="manual-section" data-test="manual-section">
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
          <template #default="{ row }">{{ formatAttendance(row) }}</template>
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
          <template #default="{ row }">{{ formatDisciplinary(row) }}</template>
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

    <!-- 同步分數預覽 dialog -->
    <el-dialog
      v-model="previewDialogVisible"
      title="同步分數預覽"
      width="720px"
      data-test="sync-preview-dialog"
    >
      <div v-loading="previewLoading">
        <template v-if="previewData">
          <el-alert type="info" :closable="false" class="preview-alert">
            <template #title>
              本次同步將：
              <strong>刪除自動產生 {{ previewData.deleted_count }} 筆</strong>、
              <strong>新增 {{ previewData.inserted_count }} 筆</strong>、
              <strong>保留人工調整 {{ previewData.skipped_manual_count }} 筆</strong>
            </template>
            <template #default>
              <small>自動 row（source_ref 開頭 auto:）將被覆寫；人工 row 受保護不會動。</small>
            </template>
          </el-alert>
          <el-table
            :data="previewData.items || []"
            stripe
            max-height="320"
            empty-text="無新增/變更項目"
            class="preview-table"
            data-test="sync-preview-table"
          >
            <el-table-column label="員工" prop="employee_name" width="120" />
            <el-table-column label="項目" prop="item_code" width="140" />
            <el-table-column label="舊分" prop="old_score_delta" width="80" />
            <el-table-column label="新分" prop="new_score_delta" width="80" />
            <el-table-column label="來源" prop="source_ref" />
          </el-table>
        </template>
      </div>
      <template #footer>
        <el-button @click="previewDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="confirmLoading"
          :disabled="!previewData || previewLoading"
          data-test="sync-confirm-btn"
          @click="confirmSync"
        >
          確認寫入
        </el-button>
      </template>
    </el-dialog>

    <!-- 員工詳情 dialog -->
    <AggregatedStatusDetailDialog
      v-model:visible="detailDialogVisible"
      :participant="detailParticipant"
      :cycle="currentCycle"
      :rules="rulesByCode"
    />

    <!-- 預覽分數計算 dialog -->
    <ScorePreviewDialog
      v-model:visible="scorePreviewDialogVisible"
      :cycle-id="currentCycle?.id ?? null"
      @request-sync="openSyncPreview"
    />
  </div>
</template>

<style scoped>
.current-semester-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar__updated {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.toolbar__actions {
  display: flex;
  gap: 8px;
}

.banner {
  margin-top: 4px;
}

.banner__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.manual-section {
  width: 100%;
}

.status-table {
  width: 100%;
}

.preview-alert {
  margin-bottom: 12px;
}

.preview-table {
  width: 100%;
}
</style>

<script setup>
/**
 * CurrentSemesterOverview — 當期考核狀態總覽
 *
 * 對應 M5 重構：以 AcademicTermSelector 切換當前學期，
 * 自動取對應 cycle、4 個 KPI、員工狀態表 + 詳情 dialog、
 * 同步分數（dry-run preview → 確認寫入）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Connection, Plus } from '@element-plus/icons-vue'

import {
  getAppraisalCurrentCycle,
  getAppraisalAggregatedStatus,
  syncAppraisalScoreItems,
  createAppraisalCycle,
} from '@/api/appraisal'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useCachedAsync, invalidateCachedAsync } from '@/composables/useCachedAsync'
import { useErrorNotify } from '@/composables/useErrorNotify'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import StatCard from '@/components/common/StatCard.vue'
import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'

const termStore = useAcademicTermStore()
const { notify } = useErrorNotify()

// ── 後端 semester enum ────────────────────────────────────
const toSemesterEnum = (n) => (Number(n) === 1 ? 'FIRST' : 'SECOND')
const semesterLabel = (v) => (v === 'FIRST' ? '上學期' : '下學期')

// ── 取得 current cycle（依 termStore 切換）────────────────
const currentCycleKey = computed(
  () => `appraisal:current:${termStore.school_year}:${termStore.semester}`,
)

const currentCycle = ref(null)
const cycleLoading = ref(false)
const cycleError = ref(null)

async function fetchCurrentCycle() {
  cycleLoading.value = true
  cycleError.value = null
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    currentCycle.value = data
  } catch (e) {
    cycleError.value = e
    notify(e, 'CurrentSemesterOverview:fetchCycle', '載入當期週期失敗')
    currentCycle.value = null
  } finally {
    cycleLoading.value = false
  }
}

// ── 取得 aggregated_status（cycle 存在才打）────────────────
const aggregatedStatus = ref(null)
const statusLoading = ref(false)

const statusKey = computed(() =>
  currentCycle.value ? `appraisal:status:${currentCycle.value.id}` : null,
)

let cachedStatus = null

async function loadStatus(force = false) {
  if (!currentCycle.value) {
    aggregatedStatus.value = null
    return
  }
  const cycleId = currentCycle.value.id
  cachedStatus = useCachedAsync(
    `appraisal:status:${cycleId}`,
    async () => {
      const { data } = await getAppraisalAggregatedStatus(cycleId)
      return data
    },
    { ttl: 60_000, immediate: false },
  )
  statusLoading.value = true
  try {
    const result = await cachedStatus.refresh(force)
    aggregatedStatus.value = result
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:fetchStatus', '載入彙整狀態失敗')
  } finally {
    statusLoading.value = false
  }
}

async function reloadAll(force = true) {
  await fetchCurrentCycle()
  if (currentCycle.value && force) {
    invalidateCachedAsync(`appraisal:status:${currentCycle.value.id}`)
  }
  await loadStatus(force)
}

watch(
  () => `${termStore.school_year}-${termStore.semester}`,
  () => {
    reloadAll(false)
  },
  { immediate: true },
)

// ── KPI 計算 ──────────────────────────────────────────────
const participants = computed(() => aggregatedStatus.value?.participants || [])

const employeeCount = computed(() => participants.value.length)

const avgAttendanceAbnormal = computed(() => {
  const list = participants.value
  if (!list.length) return 0
  const sum = list.reduce((acc, p) => {
    const a = p.attendance || {}
    return acc + (a.late_count || 0) + (a.early_leave_count || 0)
      + (a.missing_punch_count || 0) + (a.leave_days || 0)
  }, 0)
  return (sum / list.length).toFixed(1)
})

const avgRetention = computed(() => {
  const list = participants.value.filter(
    (p) => p.retention && p.retention.retention_rate != null,
  )
  if (!list.length) return '—'
  const sum = list.reduce((acc, p) => acc + Number(p.retention.retention_rate || 0), 0)
  return `${(sum / list.length).toFixed(1)}%`
})

const totalDisciplinary = computed(() => {
  return participants.value.reduce((acc, p) => {
    const d = p.disciplinary || {}
    return acc + (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  }, 0)
})

// ── 員工狀態表 row 格式化 ─────────────────────────────────
const ROLE_GROUP_LABEL = {
  HEAD_TEACHER: '正導師',
  ASSISTANT_TEACHER: '副導師',
  SUPERVISOR: '主管',
  STAFF: '行政',
  COOK: '廚工',
}

// 不屬於班級 scope 的 role（不顯示留校率 / 才藝報名率）
const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])

function isClassroomScoped(row) {
  return !NON_CLASSROOM_ROLES.has(row.role_group)
}

function formatAttendance(row) {
  const a = row.attendance || {}
  return `遲${a.late_count || 0}/早${a.early_leave_count || 0}/未${a.missing_punch_count || 0}/假${a.leave_days || 0}`
}

function formatRetention(row) {
  if (!isClassroomScoped(row) || !row.retention || row.retention.retention_rate == null) return '—'
  return `${Number(row.retention.retention_rate).toFixed(1)}%`
}

function formatActivity(row) {
  if (!isClassroomScoped(row) || !row.activity || row.activity.activity_rate == null) return '—'
  return `${Number(row.activity.activity_rate).toFixed(1)}%`
}

function formatDisciplinary(row) {
  const d = row.disciplinary || {}
  const total = (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0)
  return total
}

// ── 詳情 dialog ────────────────────────────────────────────
const detailDialogVisible = ref(false)
const detailParticipant = ref(null)

function openDetail(row) {
  detailParticipant.value = row
  detailDialogVisible.value = true
}

// ── 同步分數流程 ──────────────────────────────────────────
const previewDialogVisible = ref(false)
const previewLoading = ref(false)
const previewData = ref(null)
const confirmLoading = ref(false)

async function openSyncPreview() {
  if (!currentCycle.value) return
  previewLoading.value = true
  previewDialogVisible.value = true
  previewData.value = null
  try {
    const { data } = await syncAppraisalScoreItems(currentCycle.value.id, { dryRun: true })
    previewData.value = data
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
    ElMessage.success(
      `同步完成：刪除 ${data.deleted_count} 筆、新增 ${data.inserted_count} 筆、保留人工 ${data.skipped_manual_count} 筆`,
    )
    previewDialogVisible.value = false
    await loadStatus(true)
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:syncConfirm', '同步分數失敗')
  } finally {
    confirmLoading.value = false
  }
}

// ── 建立本學期週期（D5 預設日期）──────────────────────────
const creatingCycle = ref(false)

function defaultDatesFor(schoolYear, semester) {
  // school_year 為民國
  const yearAD = Number(schoolYear) + 1911
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
    await reloadAll(true)
  } catch (e) {
    notify(e, 'CurrentSemesterOverview:createCycle', '建立週期失敗')
  } finally {
    creatingCycle.value = false
  }
}
</script>

<template>
  <div class="current-semester-overview">
    <!-- toolbar -->
    <div class="toolbar">
      <AcademicTermSelector />
      <div class="toolbar__actions">
        <el-button
          v-if="currentCycle"
          type="primary"
          :icon="Connection"
          data-test="sync-score-btn"
          @click="openSyncPreview"
        >
          同步分數
        </el-button>
        <el-button :icon="Refresh" :loading="cycleLoading || statusLoading" @click="reloadAll(true)">
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

      <el-table
        :data="participants"
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
        <el-table-column label="遲早退/未打卡/請假" width="200">
          <template #default="{ row }">{{ formatAttendance(row) }}</template>
        </el-table-column>
        <el-table-column label="班級留校率" width="120">
          <template #default="{ row }">
            <span :data-test="`retention-${row.participant_id}`">{{ formatRetention(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="才藝報名率" width="120">
          <template #default="{ row }">
            <span :data-test="`activity-${row.participant_id}`">{{ formatActivity(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="懲處數" width="100">
          <template #default="{ row }">{{ formatDisciplinary(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              text
              :data-test="`detail-btn-${row.participant_id}`"
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

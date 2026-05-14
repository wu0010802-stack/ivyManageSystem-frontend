<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Plus,
  Delete,
  Refresh,
  Edit,
  Download,
  Document as DocumentIcon,
} from '@element-plus/icons-vue'
import {
  listAppraisalCycles,
  listAppraisalParticipants,
  bulkInitAppraisalParticipants,
  patchAppraisalParticipant,
  deleteAppraisalParticipant,
  downloadAppraisalCycleReportXlsx,
  downloadAppraisalPenaltyLogXlsx,
  downloadAppraisalParticipantSheetXlsx,
} from '@/api/appraisal'
import { useEmployeeStore } from '@/stores/employee'
import { useClassroomStore } from '@/stores/classroom'
import { apiError } from '@/utils/error'
import { saveBlobResponse } from '@/utils/download'
import CycleEventsSection from './components/CycleEventsSection.vue'
import CycleSummariesSection from './components/CycleSummariesSection.vue'

const route = useRoute()
const router = useRouter()
const cycleId = computed(() => Number(route.params.id))

const cycle = ref(null)
const participants = ref([])
const loading = ref(false)

const employeeStore = useEmployeeStore()
const classroomStore = useClassroomStore()

const semesterLabel = (v) => (v === 'FIRST' ? '上學期' : v === 'SECOND' ? '下學期' : v)

const statusMeta = {
  OPEN: { label: '進行中', type: 'success' },
  LOCKED: { label: '已鎖定', type: 'warning' },
  CLOSED: { label: '已封存', type: 'info' },
}

const roleGroupLabel = {
  SUPERVISOR: '主管',
  HEAD_TEACHER: '主教',
  ASSISTANT: '助教',
}
const roleGroupOptions = [
  { value: 'SUPERVISOR', label: '主管' },
  { value: 'HEAD_TEACHER', label: '主教' },
  { value: 'ASSISTANT', label: '助教' },
]

const classroomOptions = computed(() =>
  (classroomStore.classrooms || []).map((c) => ({ value: c.id, label: c.name })),
)

const employeeMap = computed(() => {
  const m = new Map()
  for (const e of employeeStore.employees || []) m.set(e.id, e)
  return m
})

const classroomMap = computed(() => {
  const m = new Map()
  for (const c of classroomStore.classrooms || []) m.set(c.id, c)
  return m
})

const employeeName = (id) => employeeMap.value.get(id)?.name || `員工#${id}`
const employeeJobTitle = (id) =>
  employeeMap.value.get(id)?.job_title || ''
const classroomName = (id) =>
  id == null ? '—' : classroomMap.value.get(id)?.name || `班級#${id}`

const sortedParticipants = computed(() =>
  [...participants.value].sort((a, b) => {
    const ra = a.role_group || ''
    const rb = b.role_group || ''
    if (ra !== rb) return ra.localeCompare(rb)
    return employeeName(a.employee_id).localeCompare(employeeName(b.employee_id), 'zh-Hant')
  }),
)

const fetchCycle = async () => {
  // 後端目前無 GET /cycles/{id}，從 list 端點過濾即可
  try {
    const res = await listAppraisalCycles()
    cycle.value = (res.data || []).find((c) => c.id === cycleId.value) || null
    if (!cycle.value) {
      ElMessage.error('找不到此週期')
      router.replace('/appraisal/cycles')
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入週期資料失敗'))
  }
}

const fetchParticipants = async () => {
  loading.value = true
  try {
    const res = await listAppraisalParticipants(cycleId.value)
    participants.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入參與者列表失敗'))
  } finally {
    loading.value = false
  }
}

const reloadAll = async () => {
  await Promise.all([
    fetchCycle(),
    fetchParticipants(),
    employeeStore.fetchEmployees?.(),
    classroomStore.fetchClassrooms?.(),
  ])
}

const doBulkInit = async () => {
  try {
    await ElMessageBox.confirm(
      '將自動帶入全體在職員工為考核參與者（已存在者跳過、在週期開始前離職者排除）。確定執行？',
      '批量加入參與者',
      { type: 'info', confirmButtonText: '加入', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    const res = await bulkInitAppraisalParticipants(cycleId.value)
    participants.value = res.data || []
    ElMessage.success(`目前共 ${participants.value.length} 位參與者`)
  } catch (error) {
    const detail = error.response?.data?.detail || ''
    if (detail.startsWith('cycle_closed')) {
      ElMessage.error('週期已封存，無法新增參與者')
    } else {
      ElMessage.error(apiError(error, '批量加入失敗'))
    }
  }
}

const doDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `確定移除「${employeeName(row.employee_id)}」？已產生事件的參與者無法移除。`,
      '移除參與者',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteAppraisalParticipant(row.id)
    participants.value = participants.value.filter((p) => p.id !== row.id)
    ElMessage.success('已移除')
  } catch (error) {
    const detail = error.response?.data?.detail || ''
    if (detail.startsWith('participant_has_events')) {
      ElMessage.error('該參與者已有事件紀錄，無法移除')
    } else {
      ElMessage.error(apiError(error, '移除失敗'))
    }
  }
}

const isClosed = computed(() => cycle.value?.status === 'CLOSED')

// ── 編輯參與者 ──
const editVisible = ref(false)
const editSubmitting = ref(false)
const editTarget = ref(null)
const editForm = reactive({
  role_group: 'ASSISTANT',
  classroom_id: null,
  base_score: 0,
  target_enrollment: null,
  actual_enrollment: null,
})

const openEdit = (row) => {
  editTarget.value = row
  editForm.role_group = row.role_group
  editForm.classroom_id = row.classroom_id ?? null
  editForm.base_score = Number(row.base_score) || 0
  editForm.target_enrollment = row.target_enrollment ?? null
  editForm.actual_enrollment = row.actual_enrollment ?? null
  editVisible.value = true
}

const submitEdit = async () => {
  editSubmitting.value = true
  try {
    const payload = {
      role_group: editForm.role_group,
      classroom_id: editForm.classroom_id,
      base_score: editForm.base_score,
      target_enrollment: editForm.target_enrollment,
      actual_enrollment: editForm.actual_enrollment,
    }
    const res = await patchAppraisalParticipant(editTarget.value.id, payload)
    const updated = res.data
    const idx = participants.value.findIndex((p) => p.id === updated.id)
    if (idx >= 0) participants.value[idx] = updated
    ElMessage.success('已更新')
    editVisible.value = false
  } catch (error) {
    const detail = error.response?.data?.detail || ''
    if (detail.startsWith('cycle_closed')) {
      ElMessage.error('週期已封存，無法修改')
    } else {
      ElMessage.error(apiError(error, '更新失敗'))
    }
  } finally {
    editSubmitting.value = false
  }
}

// ── 下載 xlsx ──
const downloading = ref({ cycle: false, penalty: false, sheet: null })

const dlCycleReport = async () => {
  downloading.value.cycle = true
  try {
    const res = await downloadAppraisalCycleReportXlsx(cycleId.value)
    saveBlobResponse(res, `appraisal_cycle_${cycleId.value}.xlsx`)
  } catch (error) {
    ElMessage.error(apiError(error, '下載失敗'))
  } finally {
    downloading.value.cycle = false
  }
}

const dlPenaltyLog = async () => {
  downloading.value.penalty = true
  try {
    const res = await downloadAppraisalPenaltyLogXlsx(cycleId.value)
    saveBlobResponse(res, `appraisal_penalty_log_${cycleId.value}.xlsx`)
  } catch (error) {
    ElMessage.error(apiError(error, '下載失敗'))
  } finally {
    downloading.value.penalty = false
  }
}

const dlParticipantSheet = async (row) => {
  downloading.value.sheet = row.id
  try {
    const res = await downloadAppraisalParticipantSheetXlsx(row.id)
    saveBlobResponse(res, `appraisal_sheet_${row.id}.xlsx`)
  } catch (error) {
    ElMessage.error(apiError(error, '下載失敗'))
  } finally {
    downloading.value.sheet = null
  }
}

onMounted(reloadAll)
</script>

<template>
  <div class="cycle-detail-view">
    <header class="page-header">
      <el-button :icon="ArrowLeft" link @click="router.push('/appraisal/cycles')">
        返回週期列表
      </el-button>
      <div v-if="cycle" class="cycle-meta">
        <div class="cycle-meta-row">
          <h2>
            {{ cycle.academic_year }} 學年 {{ semesterLabel(cycle.semester) }}
            <el-tag
              :type="statusMeta[cycle.status]?.type || ''"
              disable-transitions
              class="status-tag"
            >
              {{ statusMeta[cycle.status]?.label || cycle.status }}
            </el-tag>
          </h2>
          <div class="report-actions">
            <el-button
              :icon="Download"
              :loading="downloading.cycle"
              @click="dlCycleReport"
            >下載考核報表 .xlsx</el-button>
            <el-button
              :icon="DocumentIcon"
              :loading="downloading.penalty"
              @click="dlPenaltyLog"
            >下載扣分歷程 .xlsx</el-button>
          </div>
        </div>
        <p class="hint">
          期間 {{ cycle.start_date }} ～ {{ cycle.end_date }}
          ・基數計算日 {{ cycle.base_score_calc_date }}
        </p>
      </div>
    </header>

    <section class="participants-section">
      <div class="section-head">
        <div>
          <h3>參與者</h3>
          <p class="hint">共 {{ participants.length }} 位</p>
        </div>
        <div class="actions">
          <el-button :icon="Refresh" @click="fetchParticipants" :loading="loading">
            重新整理
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="isClosed"
            @click="doBulkInit"
          >批量加入在職員工</el-button>
        </div>
      </div>

      <el-table
        :data="sortedParticipants"
        v-loading="loading"
        empty-text="尚無參與者，點擊「批量加入在職員工」開始"
        stripe
      >
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }">{{ employeeName(row.employee_id) }}</template>
        </el-table-column>
        <el-table-column label="職稱" min-width="100">
          <template #default="{ row }">{{ employeeJobTitle(row.employee_id) || '—' }}</template>
        </el-table-column>
        <el-table-column label="角色群" min-width="100">
          <template #default="{ row }">
            {{ roleGroupLabel[row.role_group] || row.role_group }}
          </template>
        </el-table-column>
        <el-table-column label="班級" min-width="120">
          <template #default="{ row }">{{ classroomName(row.classroom_id) }}</template>
        </el-table-column>
        <el-table-column label="基數分" prop="base_score" width="100" align="right" />
        <el-table-column label="目標生數" prop="target_enrollment" width="110" align="right">
          <template #default="{ row }">{{ row.target_enrollment ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="實際生數" prop="actual_enrollment" width="110" align="right">
          <template #default="{ row }">{{ row.actual_enrollment ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="動作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              :icon="Edit"
              :disabled="isClosed"
              @click="openEdit(row)"
            >編輯</el-button>
            <el-button
              size="small"
              :icon="Download"
              :loading="downloading.sheet === row.id"
              @click="dlParticipantSheet(row)"
            >考核表</el-button>
            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              :disabled="isClosed"
              @click="doDelete(row)"
            >移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 編輯參與者 -->
    <el-dialog
      v-model="editVisible"
      title="編輯參與者"
      width="480px"
      :close-on-click-modal="false"
    >
      <p v-if="editTarget" class="edit-target">
        對象：<strong>{{ employeeName(editTarget.employee_id) }}</strong>
      </p>
      <el-form label-width="100px" @submit.prevent="submitEdit">
        <el-form-item label="角色群">
          <el-select v-model="editForm.role_group" style="width: 100%">
            <el-option
              v-for="opt in roleGroupOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="班級">
          <el-select
            v-model="editForm.classroom_id"
            placeholder="（可選）"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="opt in classroomOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="基數分">
          <el-input-number
            v-model="editForm.base_score"
            :min="0"
            :max="200"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="目標生數">
          <el-input-number
            v-model="editForm.target_enrollment"
            :min="0"
            :step="1"
            placeholder="（可選）"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="實際生數">
          <el-input-number
            v-model="editForm.actual_enrollment"
            :min="0"
            :step="1"
            placeholder="（可選）"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editSubmitting"
          @click="submitEdit"
        >儲存</el-button>
      </template>
    </el-dialog>

    <CycleEventsSection
      v-if="cycle"
      :cycle="cycle"
      :participants="participants"
    />

    <CycleSummariesSection
      v-if="cycle"
      :cycle="cycle"
      :participants="participants"
    />
  </div>
</template>

<style scoped>
.cycle-detail-view {
  padding: var(--space-5);
}

.page-header {
  margin-bottom: var(--space-6);
}

.cycle-meta {
  margin-top: var(--space-3);
}

.cycle-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.cycle-meta h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xl);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.report-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.edit-target {
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  background: var(--neutral-50);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.status-tag {
  font-size: var(--text-sm);
  font-weight: normal;
}

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.participants-section {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  border: 1px solid var(--neutral-200);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-4);
  gap: var(--space-3);
}

.section-head h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xl);
  color: var(--text-primary);
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
</style>

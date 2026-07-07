<script setup lang="ts">
/**
 * InstitutionEventPanel — 機構活動出席登記（G9-D1）
 *
 * 行政一次登記機構活動（園務會議/自強活動/自我提升活動/尾牙等）並勾選缺席名單，
 * 取代逐人手填；提供考核端顯式同步（dry-run 預覽 → 確認套用）。
 *
 * 契約要點：
 * - PUT /absences 為 replace-set：整包送出，未列出者自名單移除。
 * - entry.is_exempt 三態：null＝交後端依當日核准假單自動判豁免（婚/喪/產/住院病假）
 *   並回填 exempt_reason；顯式 true/false＝尊重人工覆寫。
 * - PATCH 走 exclude_unset：清空 score_item_code 必送顯式 null
 *   （el-select clearable 的 × 會把 model 變 undefined → JSON.stringify 丟欄 → 靜默失敗）。
 */
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listInstitutionEvents,
  getInstitutionEvent,
  createInstitutionEvent,
  updateInstitutionEvent,
  deleteInstitutionEvent,
  replaceInstitutionEventAbsences,
  syncInstitutionEventsToAppraisal,
} from '@/api/institutionEvents'
import { getAppraisalCurrentCycle } from '@/api/appraisal'
import { MANUAL_LABEL } from '../composables/useManualEventEntry'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useEmployeeStore } from '@/stores/employee'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import type { Schema } from '@/api/_generated/typed'

type EventRow = Schema<'InstitutionEventOut'>
type SyncResult = Schema<'AppraisalSyncResult'>

// 5 種活動類型（中文語意依後端 models/institution_event.py 註解：
// 園務會議/自強活動/自我提升活動/尾牙等）
const EVENT_TYPE_LABEL: Record<string, string> = {
  org_meeting: '園務會議',
  org_training: '自強活動',
  self_improvement: '自我提升活動',
  year_end_party: '尾牙',
  other: '其他',
}
const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))

// 4 個可同步進考核的事件碼（NULL＝不進考核）；中文標籤複用手填事件 MANUAL_LABEL
const SCORE_ITEM_CODES = [
  'INSTITUTION_MEETING_0913',
  'INSTITUTION_MEETING_1115',
  'SELF_IMPROVEMENT_ACTIVITY',
  'SCHOOL_MEETING_ABSENCE',
]
const SCORE_ITEM_OPTIONS = SCORE_ITEM_CODES.map((value) => ({ value, label: MANUAL_LABEL[value] ?? value }))
const itemLabel = (code: string) => MANUAL_LABEL[code] ?? code

const termStore = useAcademicTermStore()
const employeeStore = useEmployeeStore()
const canWrite = computed(() => hasPermission('APPRAISAL_EVENT_WRITE'))

const activeEmployees = computed(() =>
  (employeeStore.employees as { id: number; name: string; is_active?: boolean }[]).filter(
    (e) => e.is_active !== false,
  ),
)

// ── 列表 ───────────────────────────────────────────────────
const events = ref<EventRow[]>([])
const loading = ref(false)

async function fetchEvents() {
  loading.value = true
  try {
    const { data } = await listInstitutionEvents({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    events.value = data
  } catch (e) {
    ElMessage.error(apiError(e, '載入機構活動失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => [termStore.school_year, termStore.semester], () => fetchEvents())

onMounted(() => {
  employeeStore.fetchEmployees()
  fetchEvents()
})

// ── 建立 dialog ────────────────────────────────────────────
const createDialogVisible = ref(false)
const creating = ref(false)
const createForm = reactive<{
  title: string
  event_type: string
  event_date: string
  hours: number
  score_item_code: string | null | undefined
  note: string
}>({ title: '', event_type: 'org_meeting', event_date: '', hours: 2, score_item_code: null, note: '' })
const createAbsences = ref<{ id: number; name: string; absent: boolean }[]>([])

function openCreate() {
  createForm.title = ''
  createForm.event_type = 'org_meeting'
  createForm.event_date = ''
  createForm.hours = 2
  createForm.score_item_code = null
  createForm.note = ''
  createAbsences.value = activeEmployees.value.map((e) => ({ id: e.id, name: e.name, absent: false }))
  createDialogVisible.value = true
}

async function submitCreate() {
  if (!createForm.title.trim()) {
    ElMessage.warning('請輸入活動名稱')
    return
  }
  if (!createForm.event_date) {
    ElMessage.warning('請選擇活動日期')
    return
  }
  creating.value = true
  try {
    const { data: created } = await createInstitutionEvent({
      title: createForm.title.trim(),
      event_type: createForm.event_type,
      event_date: createForm.event_date,
      hours: createForm.hours,
      // clearable × 會把 model 變 undefined；?? null 正規化避免 JSON.stringify 丟欄
      score_item_code: createForm.score_item_code ?? null,
      note: createForm.note.trim() ? createForm.note.trim() : null,
    })
    const absentEntries = createAbsences.value
      .filter((e) => e.absent)
      .map((e) => ({ employee_id: e.id, is_exempt: null, exempt_reason: null }))
    if (absentEntries.length > 0) {
      // is_exempt 一律送 null → 後端依當日核准假單自動判豁免並回填原因
      const { data } = await replaceInstitutionEventAbsences(created.id, { entries: absentEntries })
      const exemptCount = data.entries.filter((a) => a.is_exempt).length
      ElMessage.success(`已建立活動，登記缺席 ${data.entries.length} 人（自動豁免 ${exemptCount} 人）`)
    } else {
      ElMessage.success('已建立活動')
    }
    createDialogVisible.value = false
    fetchEvents()
  } catch (e) {
    ElMessage.error(apiError(e, '建立活動失敗'))
  } finally {
    creating.value = false
  }
}

// ── 編輯 dialog ────────────────────────────────────────────
const editDialogVisible = ref(false)
const editSaving = ref(false)
const editForm = reactive<{
  id: number | null
  title: string
  event_type: string
  event_date: string
  hours: number
  score_item_code: string | null | undefined
  note: string
}>({ id: null, title: '', event_type: 'org_meeting', event_date: '', hours: 2, score_item_code: null, note: '' })

function openEdit(row: EventRow) {
  editForm.id = row.id
  editForm.title = row.title
  editForm.event_type = row.event_type
  editForm.event_date = row.event_date
  editForm.hours = Number(row.hours)
  editForm.score_item_code = row.score_item_code
  editForm.note = row.note ?? ''
  editDialogVisible.value = true
}

async function submitEdit() {
  if (editForm.id == null) return
  if (!editForm.title.trim()) {
    ElMessage.warning('請輸入活動名稱')
    return
  }
  editSaving.value = true
  try {
    await updateInstitutionEvent(editForm.id, {
      title: editForm.title.trim(),
      event_type: editForm.event_type,
      event_date: editForm.event_date,
      hours: editForm.hours,
      // PATCH exclude_unset：清空考核項目必送顯式 null（undefined 會整欄被丟 → 靜默不變更）
      score_item_code: editForm.score_item_code ?? null,
      note: editForm.note.trim() ? editForm.note.trim() : null,
    })
    ElMessage.success('已更新活動')
    editDialogVisible.value = false
    fetchEvents()
  } catch (e) {
    ElMessage.error(apiError(e, '更新活動失敗'))
  } finally {
    editSaving.value = false
  }
}

// ── 刪除 ───────────────────────────────────────────────────
async function handleDelete(row: EventRow) {
  try {
    await ElMessageBox.confirm(
      `確定刪除「${row.title}」？將一併刪除缺席名單（${row.absence_count} 筆）。`,
      '警告',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteInstitutionEvent(row.id)
    ElMessage.success('已刪除機構活動')
    fetchEvents()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// ── 缺席名單 dialog（replace-set）──────────────────────────
interface AbsenceRowState {
  employee_id: number
  name: string
  absent: boolean
  exemptChoice: 'auto' | 'exempt' | 'not_exempt'
  exempt_reason: string
}

const absenceDialogVisible = ref(false)
const absenceLoading = ref(false)
const absenceSaving = ref(false)
const absenceEvent = ref<EventRow | null>(null)
const absenceRows = ref<AbsenceRowState[]>([])

async function openAbsences(row: EventRow) {
  absenceEvent.value = row
  absenceDialogVisible.value = true
  absenceLoading.value = true
  try {
    const { data: detail } = await getInstitutionEvent(row.id)
    const byEmp = new Map((detail.absences ?? []).map((a) => [a.employee_id, a]))
    const rows: AbsenceRowState[] = activeEmployees.value.map((e) => {
      const a = byEmp.get(e.id)
      return {
        employee_id: e.id,
        name: e.name,
        absent: a != null,
        exemptChoice: a == null ? 'auto' : a.is_exempt ? 'exempt' : 'not_exempt',
        exempt_reason: a?.exempt_reason ?? '',
      }
    })
    // 名單內但已不在在職清單者（如已離職）也要保留，否則 replace-set 送出時會誤移除
    for (const a of detail.absences ?? []) {
      if (!rows.some((r) => r.employee_id === a.employee_id)) {
        rows.push({
          employee_id: a.employee_id,
          name: a.employee_name,
          absent: true,
          exemptChoice: a.is_exempt ? 'exempt' : 'not_exempt',
          exempt_reason: a.exempt_reason ?? '',
        })
      }
    }
    absenceRows.value = rows
  } catch (e) {
    ElMessage.error(apiError(e, '載入缺席名單失敗'))
    absenceDialogVisible.value = false
  } finally {
    absenceLoading.value = false
  }
}

async function submitAbsences() {
  if (!absenceEvent.value) return
  absenceSaving.value = true
  try {
    const entries = absenceRows.value
      .filter((r) => r.absent)
      .map((r) => ({
        employee_id: r.employee_id,
        // 'auto' → null：交後端自動判豁免；顯式選擇則覆寫、不套建議
        is_exempt: r.exemptChoice === 'auto' ? null : r.exemptChoice === 'exempt',
        exempt_reason: r.exempt_reason.trim() ? r.exempt_reason.trim() : null,
      }))
    const { data } = await replaceInstitutionEventAbsences(absenceEvent.value.id, { entries })
    // 回應套回列狀態：顯示後端自動豁免結果（原因文字可再人工覆寫後重存）
    const resultByEmp = new Map(data.entries.map((a) => [a.employee_id, a]))
    for (const r of absenceRows.value) {
      const a = resultByEmp.get(r.employee_id)
      if (a) {
        r.absent = true
        r.exemptChoice = a.is_exempt ? 'exempt' : 'not_exempt'
        r.exempt_reason = a.exempt_reason ?? ''
      } else {
        r.absent = false
        r.exemptChoice = 'auto'
        r.exempt_reason = ''
      }
    }
    const exemptCount = data.entries.filter((a) => a.is_exempt).length
    ElMessage.success(`已更新缺席名單 ${data.entries.length} 人（豁免 ${exemptCount} 人）`)
    fetchEvents()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存缺席名單失敗'))
  } finally {
    absenceSaving.value = false
  }
}

// ── 考核同步（dry-run 預覽 → 確認套用）─────────────────────
const syncDialogVisible = ref(false)
const previewLoading = ref(false)
const confirmLoading = ref(false)
const previewResult = ref<SyncResult | null>(null)
const syncCycleId = ref<number | null>(null)

async function openSyncPreview() {
  syncDialogVisible.value = true
  previewLoading.value = true
  previewResult.value = null
  syncCycleId.value = null
  try {
    const { data } = await getAppraisalCurrentCycle({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    const cycle = data as { id?: number } | null
    if (!cycle?.id) {
      ElMessage.warning('該學期尚無考核週期，無法同步')
      syncDialogVisible.value = false
      return
    }
    syncCycleId.value = cycle.id
    const { data: preview } = await syncInstitutionEventsToAppraisal(cycle.id, { dryRun: true })
    previewResult.value = preview
  } catch (e) {
    ElMessage.error(apiError(e, '載入同步預覽失敗'))
    syncDialogVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

async function confirmSync() {
  if (!syncCycleId.value) return
  confirmLoading.value = true
  try {
    const { data } = await syncInstitutionEventsToAppraisal(syncCycleId.value, { dryRun: false })
    ElMessage.success(`已套用 ${data.changes.length} 筆變更（略過相同 ${data.skipped_equal} 筆）`)
    syncDialogVisible.value = false
    fetchEvents()
  } catch (e) {
    ElMessage.error(apiError(e, '同步套用失敗'))
  } finally {
    confirmLoading.value = false
  }
}
</script>

<template>
  <div class="institution-event-panel">
    <el-card class="control-panel">
      <div class="controls">
        <AcademicTermSelector />
        <el-button v-if="canWrite" type="primary" data-test="create-btn" @click="openCreate">
          登記機構活動
        </el-button>
        <el-button v-if="canWrite" :loading="previewLoading" data-test="sync-btn" @click="openSyncPreview">
          同步考核（預覽）
        </el-button>
      </div>
    </el-card>

    <el-table
      :data="events"
      v-loading="loading"
      stripe
      empty-text="本學期尚無機構活動"
      data-test="event-table"
    >
      <el-table-column label="日期" prop="event_date" width="110" />
      <el-table-column label="活動名稱" prop="title" min-width="150" />
      <el-table-column label="類型" width="120">
        <template #default="{ row }">{{ EVENT_TYPE_LABEL[row.event_type] ?? row.event_type }}</template>
      </el-table-column>
      <el-table-column label="時數" prop="hours" width="70" />
      <el-table-column label="考核項目" width="130">
        <template #default="{ row }">
          <span v-if="row.score_item_code">{{ itemLabel(row.score_item_code) }}</span>
          <span v-else class="text-muted">不進考核</span>
        </template>
      </el-table-column>
      <el-table-column label="缺席" prop="absence_count" width="70" />
      <el-table-column label="備註" prop="note" min-width="120" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button type="primary" size="small" link :data-test="`absence-btn-${row.id}`" @click="openAbsences(row)">
            名單
          </el-button>
          <el-button
            v-if="canWrite"
            type="primary"
            size="small"
            link
            :data-test="`edit-btn-${row.id}`"
            @click="openEdit(row)"
          >
            編輯
          </el-button>
          <el-button
            v-if="canWrite"
            type="danger"
            size="small"
            link
            :data-test="`delete-btn-${row.id}`"
            @click="handleDelete(row)"
          >
            刪除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 建立 dialog -->
    <el-dialog v-model="createDialogVisible" title="登記機構活動" width="700px" top="5vh" data-test="create-dialog">
      <el-form label-width="100px">
        <el-form-item label="活動名稱" required>
          <el-input v-model="createForm.title" maxlength="80" data-test="create-title" />
        </el-form-item>
        <el-form-item label="活動類型">
          <el-select v-model="createForm.event_type" style="width: 200px" data-test="create-type-select">
            <el-option v-for="opt in EVENT_TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="createForm.event_date"
            type="date"
            value-format="YYYY-MM-DD"
            data-test="create-date"
          />
        </el-form-item>
        <el-form-item label="時數">
          <el-input-number v-model="createForm.hours" :min="0" :max="24" :precision="1" data-test="create-hours" />
          <span class="dialog-hint">同步考核時單場缺席以 4 小時為上限（辦法十二單次不逾 -2）</span>
        </el-form-item>
        <el-form-item label="考核項目">
          <el-select
            v-model="createForm.score_item_code"
            clearable
            placeholder="不進考核"
            style="width: 200px"
            data-test="create-score-select"
          >
            <el-option v-for="opt in SCORE_ITEM_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <span class="dialog-hint">留空表示缺席不進考核（例如尾牙僅列年終扣款）</span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="createForm.note" type="textarea" :rows="2" data-test="create-note" />
        </el-form-item>
        <el-divider>缺席名單（未指定豁免將由系統依當日核准假單自動判斷）</el-divider>
        <div class="employee-list">
          <div v-for="e in createAbsences" :key="e.id" class="employee-item">
            <span>{{ e.name }}</span>
            <el-switch v-model="e.absent" active-text="缺席" inactive-text="出席" :data-test="`absent-switch-${e.id}`" />
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" data-test="create-submit-btn" @click="submitCreate">
          確認建立
        </el-button>
      </template>
    </el-dialog>

    <!-- 編輯 dialog -->
    <el-dialog v-model="editDialogVisible" title="編輯機構活動" width="560px" data-test="edit-dialog">
      <el-form label-width="100px">
        <el-form-item label="活動名稱" required>
          <el-input v-model="editForm.title" maxlength="80" data-test="edit-title" />
        </el-form-item>
        <el-form-item label="活動類型">
          <el-select v-model="editForm.event_type" style="width: 200px" data-test="edit-type-select">
            <el-option v-for="opt in EVENT_TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="editForm.event_date" type="date" value-format="YYYY-MM-DD" data-test="edit-date" />
        </el-form-item>
        <el-form-item label="時數">
          <el-input-number v-model="editForm.hours" :min="0" :max="24" :precision="1" data-test="edit-hours" />
        </el-form-item>
        <el-form-item label="考核項目">
          <el-select
            v-model="editForm.score_item_code"
            clearable
            placeholder="不進考核"
            style="width: 200px"
            data-test="edit-score-select"
          >
            <el-option v-for="opt in SCORE_ITEM_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="editForm.note" type="textarea" :rows="2" data-test="edit-note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" data-test="edit-submit-btn" @click="submitEdit">
          儲存
        </el-button>
      </template>
    </el-dialog>

    <!-- 缺席名單 dialog（replace-set） -->
    <el-dialog v-model="absenceDialogVisible" title="缺席名單" width="640px" data-test="absence-dialog">
      <div v-loading="absenceLoading">
        <el-alert type="info" :closable="false" class="dialog-alert">
          <template #title>
            整包送出：勾選缺席者、未勾選者將自名單移除。豁免選「自動判斷」由系統依當日核准假單（婚/喪/產/住院病假）建議並回填原因。
          </template>
        </el-alert>
        <div class="employee-list">
          <div v-for="r in absenceRows" :key="r.employee_id" class="employee-item employee-item--column">
            <div class="employee-row-main">
              <span>{{ r.name }}</span>
              <el-switch
                v-model="r.absent"
                active-text="缺席"
                inactive-text="出席"
                :disabled="!canWrite"
                :data-test="`abs-switch-${r.employee_id}`"
              />
            </div>
            <div v-if="r.absent" class="exempt-row">
              <el-select
                v-model="r.exemptChoice"
                style="width: 130px"
                :disabled="!canWrite"
                :data-test="`exempt-select-${r.employee_id}`"
              >
                <el-option label="自動判斷" value="auto" />
                <el-option label="豁免" value="exempt" />
                <el-option label="不豁免" value="not_exempt" />
              </el-select>
              <el-input
                v-model="r.exempt_reason"
                maxlength="120"
                placeholder="豁免原因（留空由系統自動建議）"
                :disabled="!canWrite"
                :data-test="`exempt-reason-${r.employee_id}`"
              />
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="absenceDialogVisible = false">取消</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="absenceSaving"
          data-test="absence-submit-btn"
          @click="submitAbsences"
        >
          儲存名單
        </el-button>
      </template>
    </el-dialog>

    <!-- 考核同步預覽 dialog -->
    <el-dialog v-model="syncDialogVisible" title="同步考核預覽" width="720px" data-test="sync-dialog">
      <div v-loading="previewLoading">
        <template v-if="previewResult">
          <el-alert type="info" :closable="false" class="dialog-alert">
            <template #title>
              本次將套用 <strong>{{ previewResult.changes.length }}</strong> 筆變更、略過相同
              <strong data-test="sync-skipped">{{ previewResult.skipped_equal }}</strong> 筆。缺席清空會出現歸零（新值 0）回退列。
            </template>
          </el-alert>
          <el-table
            :data="previewResult.changes"
            stripe
            max-height="320"
            empty-text="無變更項目"
            data-test="sync-table"
          >
            <el-table-column label="員工" prop="employee_name" width="120" />
            <el-table-column label="項目" width="160">
              <template #default="{ row }">{{ itemLabel(row.item_code) }}</template>
            </el-table-column>
            <el-table-column label="變更（累計時數）">
              <template #default="{ row }">{{ Number(row.old_count) }} → {{ Number(row.new_count) }}</template>
            </el-table-column>
          </el-table>
          <p class="dialog-hint">套用後請至「當期總覽」重新整理（進頁即算）刷新分數。</p>
        </template>
      </div>
      <template #footer>
        <el-button @click="syncDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="confirmLoading"
          :disabled="!previewResult || previewLoading"
          data-test="sync-confirm-btn"
          @click="confirmSync"
        >
          確認套用
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-4);
}

.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.dialog-hint {
  margin-left: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.dialog-alert {
  margin-bottom: 12px;
}

.employee-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.employee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 10px;
}

.employee-item--column {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.employee-row-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.exempt-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.text-muted {
  color: var(--text-tertiary);
}
</style>

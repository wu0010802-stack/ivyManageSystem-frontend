<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Edit, RemoveFilled } from '@element-plus/icons-vue'
import {
  listAppraisalEvents,
  createAppraisalEvent,
  patchAppraisalEvent,
  revertAppraisalEvent,
  listAppraisalPenaltyCatalog,
} from '@/api/appraisal'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'

const props = defineProps({
  cycle: { type: Object, required: true },
  participants: { type: Array, required: true },
})

const employeeStore = useEmployeeStore()
const employeeName = (id) =>
  (employeeStore.employees || []).find((e) => e.id === id)?.name || `員工#${id}`

const events = ref([])
const catalog = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)
const isEdit = ref(false)
const editingId = ref(null)

const eventTypeOptions = [
  { value: 'MAJOR_MERIT', label: '大功' },
  { value: 'MINOR_MERIT', label: '小功' },
  { value: 'COMMENDATION', label: '嘉獎' },
  { value: 'WARNING', label: '警告' },
  { value: 'MINOR_DEMERIT', label: '小過' },
  { value: 'MAJOR_DEMERIT', label: '大過' },
  { value: 'ORAL_WARNING', label: '口頭警告' },
  { value: 'SCORE_ADJUST', label: '分數調整' },
]
const eventTypeLabel = (v) =>
  eventTypeOptions.find((o) => o.value === v)?.label || v

const eventTypeTagType = (v) => {
  if (['MAJOR_MERIT', 'MINOR_MERIT', 'COMMENDATION'].includes(v)) return 'success'
  if (['MAJOR_DEMERIT', 'MINOR_DEMERIT'].includes(v)) return 'danger'
  if (v === 'WARNING' || v === 'ORAL_WARNING') return 'warning'
  return 'info'
}

const parentReactionOptions = [
  { value: 'none', label: '無' },
  { value: 'forgiven', label: '已諒解' },
  { value: 'withdrawal', label: '退學' },
  { value: 'litigation', label: '訴訟' },
  { value: 'complaint', label: '客訴' },
  { value: 'media', label: '媒體' },
]
const parentReactionLabel = (v) =>
  parentReactionOptions.find((o) => o.value === v)?.label || v || '—'

const catalogCategoryLabel = {
  MISCONDUCT: '行為不當',
  MEDICATION: '用藥相關',
  ACCIDENT: '意外事故',
  DISPUTE: '糾紛',
  NEGLIGENCE: '疏失',
  MERIT: '功績',
  SPECIAL: '特別事件',
}

const catalogGrouped = computed(() => {
  const groups = {}
  for (const item of catalog.value) {
    const cat = item.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  return Object.entries(groups).map(([category, items]) => ({
    category,
    label: catalogCategoryLabel[category] || category,
    items,
  }))
})

const participantOptions = computed(() =>
  props.participants.map((p) => ({
    value: p.id,
    label: employeeName(p.employee_id),
  })),
)

const participantNameById = (participantId) => {
  const p = props.participants.find((x) => x.id === participantId)
  return p ? employeeName(p.employee_id) : `參與者#${participantId}`
}

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => {
    if (a.event_date !== b.event_date)
      return a.event_date < b.event_date ? 1 : -1
    return b.id - a.id
  }),
)

const form = reactive({
  participant_id: null,
  catalog_item_id: null,
  event_type: 'COMMENDATION',
  event_date: null,
  score_delta: 0,
  severity_level: null,
  parent_reaction: 'none',
  title: '',
  detail: '',
})

const resetForm = () => {
  form.participant_id = null
  form.catalog_item_id = null
  form.event_type = 'COMMENDATION'
  form.event_date = null
  form.score_delta = 0
  form.severity_level = null
  form.parent_reaction = 'none'
  form.title = ''
  form.detail = ''
}

// catalog 選擇後自動帶入預設值
watch(
  () => form.catalog_item_id,
  (newId) => {
    if (!newId) return
    const item = catalog.value.find((c) => c.id === newId)
    if (!item) return
    form.event_type = item.default_event_type
    form.score_delta = Number(item.default_score_delta)
    if (!form.title) form.title = item.description
  },
)

const isReadOnly = computed(
  () => props.cycle?.status === 'LOCKED' || props.cycle?.status === 'CLOSED',
)

const fetchEvents = async () => {
  loading.value = true
  try {
    const res = await listAppraisalEvents({ cycle_id: props.cycle.id, limit: 500 })
    events.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入事件失敗'))
  } finally {
    loading.value = false
  }
}

const fetchCatalog = async () => {
  try {
    const res = await listAppraisalPenaltyCatalog({ active_only: true })
    catalog.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入扣分目錄失敗'))
  }
}

const openCreate = () => {
  resetForm()
  isEdit.value = false
  editingId.value = null
  dialogVisible.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  editingId.value = row.id
  form.participant_id = row.participant_id
  form.catalog_item_id = row.catalog_item_id
  form.event_type = row.event_type
  form.event_date = row.event_date
  form.score_delta = Number(row.score_delta)
  form.severity_level = row.severity_level
  form.parent_reaction = row.parent_reaction || 'none'
  form.title = row.title
  form.detail = row.detail || ''
  dialogVisible.value = true
}

// 後端錯誤碼 → UI 訊息（events.py 守衛）
const mapEventError = (error, fallback) => {
  const detail = error.response?.data?.detail || ''
  if (detail.startsWith('cycle_locked')) return '週期已鎖定，無法新增/修改事件'
  if (detail.startsWith('cycle_closed')) return '週期已封存，無法變動'
  if (detail.startsWith('event_date_out_of_cycle'))
    return '事件日期不在週期區間內'
  if (detail.startsWith('self_event_forbidden')) return '不能登錄自己的事件'
  if (detail === 'participant_not_found') return '找不到參與者'
  if (detail === 'catalog_item_not_found') return '扣分項目不存在或已停用'
  if (detail === 'event_reverted_cannot_edit') return '已作廢的事件不可編輯'
  return apiError(error, fallback)
}

const validateForm = () => {
  if (!form.participant_id) return '請選擇參與者'
  if (!form.event_type) return '請選擇事件類別'
  if (!form.event_date) return '請選擇事件日期'
  const sd = Number(form.score_delta)
  if (Number.isNaN(sd) || sd < -20 || sd > 20) return '分數變動需介於 -20 ~ 20'
  if (!form.title || !form.title.trim()) return '請填寫標題'
  if (form.title.length > 120) return '標題長度不可超過 120 字'
  return null
}

const submitForm = async () => {
  const err = validateForm()
  if (err) {
    ElMessage.warning(err)
    return
  }
  submitting.value = true
  try {
    const payload = {
      participant_id: form.participant_id,
      catalog_item_id: form.catalog_item_id || null,
      event_type: form.event_type,
      event_date: form.event_date,
      score_delta: Number(form.score_delta),
      severity_level: form.severity_level || null,
      parent_reaction: form.parent_reaction === 'none' ? null : form.parent_reaction,
      title: form.title.trim(),
      detail: form.detail || '',
    }
    if (isEdit.value) {
      await patchAppraisalEvent(editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await createAppraisalEvent(payload)
      ElMessage.success('已新增事件')
    }
    dialogVisible.value = false
    fetchEvents()
  } catch (error) {
    ElMessage.error(
      mapEventError(error, isEdit.value ? '更新失敗' : '新增失敗'),
    )
  } finally {
    submitting.value = false
  }
}

const doRevert = async (row) => {
  let reason
  try {
    const res = await ElMessageBox.prompt(
      `軟作廢「${row.title}」，請輸入原因（≥ 2 字，將寫入稽核軌跡）`,
      '作廢事件',
      {
        confirmButtonText: '作廢',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (v) =>
          (v && v.trim().length >= 2) || '原因至少需 2 個字',
      },
    )
    reason = res.value.trim()
  } catch {
    return
  }
  try {
    await revertAppraisalEvent(row.id, reason)
    ElMessage.success('事件已作廢')
    fetchEvents()
  } catch (error) {
    if (error.response?.data?.detail === 'already_reverted') {
      ElMessage.error('該事件已被作廢')
    } else {
      ElMessage.error(mapEventError(error, '作廢失敗'))
    }
  }
}

onMounted(() => {
  fetchEvents()
  fetchCatalog()
})
</script>

<template>
  <section class="events-section">
    <div class="section-head">
      <div>
        <h3>事件流</h3>
        <p class="hint">
          共 {{ events.length }} 筆
          ・LOCKED 後唯讀，CLOSED 後封存
        </p>
      </div>
      <div class="actions">
        <el-button :icon="Refresh" @click="fetchEvents" :loading="loading">
          重新整理
        </el-button>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="isReadOnly || participants.length === 0"
          @click="openCreate"
        >登錄事件</el-button>
      </div>
    </div>

    <el-table
      :data="sortedEvents"
      v-loading="loading"
      empty-text="尚無事件"
      stripe
    >
      <el-table-column label="日期" prop="event_date" width="120" />
      <el-table-column label="參與者" min-width="120">
        <template #default="{ row }">
          {{ participantNameById(row.participant_id) }}
        </template>
      </el-table-column>
      <el-table-column label="類別" width="110">
        <template #default="{ row }">
          <el-tag
            :type="eventTypeTagType(row.event_type)"
            disable-transitions
            size="small"
          >{{ eventTypeLabel(row.event_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="標題" min-width="180">
        <template #default="{ row }">
          <span :class="{ reverted: row.reverted_at }">{{ row.title }}</span>
          <el-tag
            v-if="row.reverted_at"
            type="info"
            size="small"
            class="revert-tag"
          >已作廢</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分數" width="80" align="right">
        <template #default="{ row }">
          <span :class="Number(row.score_delta) >= 0 ? 'score-pos' : 'score-neg'">
            {{ Number(row.score_delta) > 0 ? '+' : '' }}{{ row.score_delta }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="嚴重度" width="80" align="center">
        <template #default="{ row }">{{ row.severity_level ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="家長反應" width="100">
        <template #default="{ row }">{{ parentReactionLabel(row.parent_reaction) }}</template>
      </el-table-column>
      <el-table-column label="動作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            :icon="Edit"
            :disabled="isReadOnly || !!row.reverted_at"
            @click="openEdit(row)"
          >編輯</el-button>
          <el-button
            size="small"
            type="danger"
            :icon="RemoveFilled"
            :disabled="isReadOnly || !!row.reverted_at"
            @click="doRevert(row)"
          >作廢</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '編輯事件' : '登錄事件'"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px" @submit.prevent="submitForm">
        <el-form-item label="參與者" required>
          <el-select
            v-model="form.participant_id"
            placeholder="選擇參與者"
            :disabled="isEdit"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="opt in participantOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="參考目錄">
          <el-select
            v-model="form.catalog_item_id"
            placeholder="（可選）選擇後自動帶入分數與類別"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option-group
              v-for="g in catalogGrouped"
              :key="g.category"
              :label="g.label"
            >
              <el-option
                v-for="item in g.items"
                :key="item.id"
                :value="item.id"
                :label="`${item.code} ${item.description}`"
              />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item label="事件類別" required>
          <el-select v-model="form.event_type" style="width: 100%">
            <el-option
              v-for="opt in eventTypeOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="事件日期" required>
          <el-date-picker
            v-model="form.event_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="必須在週期區間內"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="分數變動" required>
          <el-input-number
            v-model="form.score_delta"
            :min="-20"
            :max="20"
            :step="1"
            :precision="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="嚴重度">
          <el-input-number
            v-model="form.severity_level"
            :min="1"
            :max="5"
            :step="1"
            :precision="0"
            placeholder="1 ~ 5（可空）"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="家長反應">
          <el-select v-model="form.parent_reaction" style="width: 100%">
            <el-option
              v-for="opt in parentReactionOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="標題" required>
          <el-input v-model="form.title" maxlength="120" show-word-limit />
        </el-form-item>

        <el-form-item label="詳述">
          <el-input
            v-model="form.detail"
            type="textarea"
            :rows="3"
            placeholder="（可選）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitForm"
        >{{ isEdit ? '儲存' : '新增' }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.events-section {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  border: 1px solid var(--neutral-200);
  margin-top: var(--space-5);
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

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.reverted {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.revert-tag {
  margin-left: var(--space-2);
}

.score-pos {
  color: var(--color-success);
  font-weight: 600;
}

.score-neg {
  color: var(--color-danger);
  font-weight: 600;
}
</style>

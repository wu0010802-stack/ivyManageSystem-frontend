<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import { getIncidents } from '@/api/studentIncidents'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { INCIDENT_TYPE_TAG, SEVERITY_TAG } from '@/constants/studentRecords'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'
import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('IncidentSection 須在 StudentAcademicAffairsView 內使用')

const props = defineProps({
  classrooms: { type: Array, default: () => [] },
})

const records = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref('create')
const dialogInitial = ref(null)

const fetchIncidents = async () => {
  if (!ctx.filters.classroomId) {
    records.value = []
    return
  }
  loading.value = true
  try {
    const params = {
      classroom_id: ctx.filters.classroomId,
      start_date: ctx.startDate.value,
      end_date: ctx.endDate.value,
      limit: 100,
    }
    if (ctx.filters.studentId) params.student_id = ctx.filters.studentId
    const res = await getIncidents(params)
    const raw = res.data
    records.value = Array.isArray(raw) ? raw : raw?.items ?? []
  } catch (error) {
    ElMessage.error(apiError(error, '載入事件資料失敗'))
    records.value = []
  } finally {
    loading.value = false
  }
}

const formatDateTime = (v) => {
  if (!v) return ''
  return v.replace('T', ' ').slice(0, 16)
}

const openCreate = () => {
  dialogMode.value = 'create'
  dialogInitial.value = null
  dialogVisible.value = true
}
const openEdit = (row) => {
  dialogMode.value = 'edit'
  dialogInitial.value = { ...row }
  dialogVisible.value = true
}
const onSubmitted = () => {
  // store 已 emit，listener 會自動 refetch
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(
      `確定刪除 ${row.student_name || ''} 的此筆事件?`,
      '刪除確認',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const store = useStudentRecordsStore()
    await store.deleteRecord('incident', row.id, { student_id: row.student_id })
    ElMessage.success('刪除成功')
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  }
}

const onRecordEvent = ({ kind }) => {
  if (kind === 'incident') fetchIncidents()
}

watch(
  () => [
    ctx.filters.classroomId,
    ctx.filters.studentId,
    ctx.startDate.value,
    ctx.endDate.value,
  ],
  () => fetchIncidents(),
  { immediate: true },
)

onMounted(() => {
  domainBus.on(RECORD_EVENTS.CREATED, onRecordEvent)
  domainBus.on(RECORD_EVENTS.UPDATED, onRecordEvent)
  domainBus.on(RECORD_EVENTS.DELETED, onRecordEvent)
})

onUnmounted(() => {
  domainBus.off(RECORD_EVENTS.CREATED, onRecordEvent)
  domainBus.off(RECORD_EVENTS.UPDATED, onRecordEvent)
  domainBus.off(RECORD_EVENTS.DELETED, onRecordEvent)
})

const _records = computed(() => records.value)

defineExpose({ fetchIncidents })
</script>

<template>
  <el-card shadow="never" class="section-card">
    <template #header>
      <div class="section-head">
        <div class="section-title">
          <span class="title-text">事件</span>
          <el-badge :value="_records.length" type="danger" />
        </div>
        <div class="section-actions">
          <el-button
            size="small"
            type="primary"
            :disabled="!ctx.filters.classroomId"
            @click="openCreate"
          >
            新增事件
          </el-button>
          <router-link
            :to="{ name: 'student-incidents' }"
            target="_blank"
            rel="noopener"
            class="open-full-link"
            title="開啟完整事件頁"
          >
            ↗
          </router-link>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="_records"
      stripe
      size="small"
      style="width: 100%"
      max-height="360"
    >
      <el-table-column label="時間" width="150">
        <template #default="{ row }">{{ formatDateTime(row.occurred_at) }}</template>
      </el-table-column>
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="類型" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="INCIDENT_TYPE_TAG[row.incident_type] || ''">
            {{ row.incident_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="嚴重度" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="SEVERITY_TAG[row.severity] || ''">{{ row.severity }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="描述" prop="description" min-width="160" show-overflow-tooltip />
      <el-table-column label="家長通知" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.parent_notified ? 'success' : 'info'">
            {{ row.parent_notified ? '已通知' : '未通知' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button link size="small" type="danger" @click="removeRow(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && _records.length === 0"
      :description="ctx.filters.classroomId ? '期間內沒有事件紀錄' : '請先選擇班級'"
      :image-size="48"
    />

    <IncidentEditorDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :initial="dialogInitial"
      :classrooms="props.classrooms"
      :default-classroom-id="ctx.filters.classroomId"
      :default-student-id="ctx.filters.studentId"
      :lock-student="!!ctx.filters.studentId && dialogMode === 'create'"
      @submitted="onSubmitted"
    />
  </el-card>
</template>

<style scoped>
.section-card {
  border-radius: 12px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.title-text {
  font-size: 15px;
}
.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.open-full-link {
  font-size: 18px;
  color: #64748b;
  text-decoration: none;
  padding: 0 6px;
}
.open-full-link:hover {
  color: #1d4ed8;
}
</style>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import { getIncidents } from '@/api/studentIncidents'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { INCIDENT_TYPE_TAG, SEVERITY_TAG } from '@/constants/studentRecords'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'
import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'
import SectionCard from './SectionCard.vue'

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('IncidentSection 須在 TodayTasksPanel 內使用')

const props = withDefaults(defineProps<{
  classrooms?: Record<string, unknown>[]
}>(), {
  classrooms: () => [],
})

const records = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const errorMessage = ref('')
const drawerOpen = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref('create')
const dialogInitial = ref<Record<string, unknown> | null>(null)

const fetchIncidents = async () => {
  if (!ctx.filters.classroomId) {
    records.value = []
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const params: Record<string, unknown> = {
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
    errorMessage.value = apiError(error, '載入事件資料失敗')
    records.value = []
  } finally {
    loading.value = false
  }
}

const formatDateTime = (v: string | undefined | null) => (v ? v.replace('T', ' ').slice(0, 16) : '')

const openCreate = () => {
  dialogMode.value = 'create'
  dialogInitial.value = null
  dialogVisible.value = true
}
const openEdit = (row: Record<string, unknown>) => {
  dialogMode.value = 'edit'
  dialogInitial.value = { ...row }
  dialogVisible.value = true
}

const removeRow = async (row: Record<string, unknown>) => {
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
    await store.deleteRecord('incident', row.id as number, { student_id: row.student_id as number })
    ElMessage.success('刪除成功')
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  }
}

const onRecordEvent = ({ kind }: { kind: string }) => {
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

defineExpose({ fetchIncidents })
</script>

<template>
  <div class="record-entry">
    <button type="button" class="record-trigger" @click="drawerOpen = true">
      <el-badge :value="records.length" type="danger" class="record-trigger-badge">
        <span class="record-trigger-label">事件</span>
      </el-badge>
      <span class="record-trigger-hint">查看 / 新增</span>
      <span class="record-trigger-arrow" aria-hidden="true">›</span>
    </button>

    <el-drawer
      v-model="drawerOpen"
      :title="`事件 · ${records.length}`"
      size="720px"
      append-to-body
    >
      <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-3)">
        <el-button
          size="small"
          type="primary"
          :disabled="!ctx.filters.classroomId"
          @click="openCreate"
        >
          新增事件
        </el-button>
      </div>

      <SectionCard
        title="事件"
        hide-header
        :loading="loading"
        :error-message="errorMessage"
        :empty-description="ctx.filters.classroomId ? '期間內沒有事件紀錄' : '請先選擇班級'"
        :show-empty="records.length === 0"
        @retry="fetchIncidents"
      >
        <el-table
          v-if="records.length"
          :data="records"
          stripe
          size="small"
          style="width: 100%"
          max-height="560"
        >
      <el-table-column label="時間" width="150">
        <template #default="{ row }">{{ formatDateTime(row.occurred_at) }}</template>
      </el-table-column>
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="類型" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="(INCIDENT_TYPE_TAG[row.incident_type as string] as any) || undefined">
            {{ row.incident_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="嚴重度" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="(SEVERITY_TAG[row.severity as string] as any) || undefined">{{ row.severity }}</el-tag>
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
      </SectionCard>

      <IncidentEditorDialog
        v-model:visible="dialogVisible"
        :mode="dialogMode"
        :initial="dialogInitial"
        :classrooms="props.classrooms"
        :default-classroom-id="(ctx.filters.classroomId as number | null)"
        :default-student-id="(ctx.filters.studentId as number | null)"
        :lock-student="!!ctx.filters.studentId && dialogMode === 'create'"
      />
    </el-drawer>
  </div>
</template>

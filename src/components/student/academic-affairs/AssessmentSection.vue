<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import { getAssessments } from '@/api/studentAssessments'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { RATING_TAG } from '@/constants/studentRecords'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'
import AssessmentEditorDialog from '@/components/student/AssessmentEditorDialog.vue'
import SectionCard from './SectionCard.vue'

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('AssessmentSection 須在 TodayTasksPanel 內使用')

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

const filteredRows = computed(() => {
  const start = ctx.startDate.value
  const end = ctx.endDate.value
  return records.value.filter((r) => {
    if (!r.assessment_date) return true
    const d = (r.assessment_date as string).slice(0, 10)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
})

const fetchAssessments = async () => {
  if (!ctx.filters.classroomId) {
    records.value = []
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const params: Record<string, unknown> = { classroom_id: ctx.filters.classroomId, limit: 100 }
    if (ctx.filters.studentId) params.student_id = ctx.filters.studentId
    const res = await getAssessments(params)
    const raw = res.data
    records.value = Array.isArray(raw) ? raw : raw?.items ?? []
  } catch (error) {
    errorMessage.value = apiError(error, '載入評量資料失敗')
    records.value = []
  } finally {
    loading.value = false
  }
}

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
      `確定刪除 ${row.student_name || ''} 的此筆評量?`,
      '刪除確認',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const store = useStudentRecordsStore()
    await store.deleteRecord('assessment', row.id as number, { student_id: row.student_id as number })
    ElMessage.success('刪除成功')
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  }
}

const onRecordEvent = ({ kind }: { kind: string }) => {
  if (kind === 'assessment') fetchAssessments()
}

watch(
  () => [ctx.filters.classroomId, ctx.filters.studentId],
  () => fetchAssessments(),
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

defineExpose({ fetchAssessments })
</script>

<template>
  <div class="record-entry">
    <button type="button" class="record-trigger" @click="drawerOpen = true">
      <el-badge :value="filteredRows.length" type="primary" class="record-trigger-badge">
        <span class="record-trigger-label">評量</span>
      </el-badge>
      <span class="record-trigger-hint">查看 / 新增</span>
      <span class="record-trigger-arrow" aria-hidden="true">›</span>
    </button>

    <el-drawer
      v-model="drawerOpen"
      :title="`評量 · ${filteredRows.length}`"
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
          新增評量
        </el-button>
      </div>

      <SectionCard
        title="評量"
        hide-header
        :loading="loading"
        :error-message="errorMessage"
        :empty-description="ctx.filters.classroomId ? '期間內沒有評量資料' : '請先選擇班級'"
        :show-empty="filteredRows.length === 0"
        @retry="fetchAssessments"
      >
        <el-table
          v-if="filteredRows.length"
          :data="filteredRows"
          stripe
          size="small"
          style="width: 100%"
          max-height="560"
        >
      <el-table-column label="日期" prop="assessment_date" width="100" />
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="學期" prop="semester" width="80" />
      <el-table-column label="類型" prop="assessment_type" width="70" align="center" />
      <el-table-column label="領域" prop="domain" width="100" />
      <el-table-column label="評等" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.rating" size="small" :type="(RATING_TAG[row.rating as string] as any) || undefined">
            {{ row.rating }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="內容" prop="content" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button link size="small" type="danger" @click="removeRow(row)">刪除</el-button>
        </template>
      </el-table-column>
        </el-table>
      </SectionCard>

      <AssessmentEditorDialog
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

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import { getAssessments } from '@/api/studentAssessments'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { RATING_TAG, RATINGS } from '@/constants/studentRecords'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'
import AssessmentEditorDialog from '@/components/student/AssessmentEditorDialog.vue'

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('AssessmentSection 須在 StudentAcademicAffairsView 內使用')

const props = defineProps({
  classrooms: { type: Array, default: () => [] },
})

const records = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref('create')
const dialogInitial = ref(null)

const filteredRows = computed(() => {
  const start = ctx.startDate.value
  const end = ctx.endDate.value
  return records.value.filter((r) => {
    if (!r.assessment_date) return true
    const d = r.assessment_date.slice(0, 10)
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
  try {
    const params = {
      classroom_id: ctx.filters.classroomId,
      limit: 100,
    }
    if (ctx.filters.studentId) params.student_id = ctx.filters.studentId
    const res = await getAssessments(params)
    const raw = res.data
    records.value = Array.isArray(raw) ? raw : raw?.items ?? []
  } catch (error) {
    ElMessage.error(apiError(error, '載入評量資料失敗'))
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
const openEdit = (row) => {
  dialogMode.value = 'edit'
  dialogInitial.value = { ...row }
  dialogVisible.value = true
}
const onSubmitted = () => {
  // store 已 emit RECORD_EVENTS，listener 會自動 refetch
}

const removeRow = async (row) => {
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
    await store.deleteRecord('assessment', row.id, { student_id: row.student_id })
    ElMessage.success('刪除成功')
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  }
}

const onRecordEvent = ({ kind }) => {
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
  <el-card shadow="never" class="section-card">
    <template #header>
      <div class="section-head">
        <div class="section-title">
          <span class="title-text">評量</span>
          <el-badge :value="filteredRows.length" type="primary" />
        </div>
        <div class="section-actions">
          <el-button
            size="small"
            type="primary"
            :disabled="!ctx.filters.classroomId"
            @click="openCreate"
          >
            新增評量
          </el-button>
          <router-link
            :to="{ name: 'student-assessments' }"
            target="_blank"
            rel="noopener"
            class="open-full-link"
            title="開啟完整評量頁"
          >
            ↗
          </router-link>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="filteredRows"
      stripe
      size="small"
      style="width: 100%"
      max-height="360"
    >
      <el-table-column label="日期" prop="assessment_date" width="100" />
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="學期" prop="semester" width="80" />
      <el-table-column label="類型" prop="assessment_type" width="70" align="center" />
      <el-table-column label="領域" prop="domain" width="100" />
      <el-table-column label="評等" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.rating" size="small" :type="RATING_TAG[row.rating] || ''">
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

    <el-empty
      v-if="!loading && filteredRows.length === 0"
      :description="ctx.filters.classroomId ? '期間內沒有評量資料' : '請先選擇班級'"
      :image-size="48"
    />

    <AssessmentEditorDialog
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

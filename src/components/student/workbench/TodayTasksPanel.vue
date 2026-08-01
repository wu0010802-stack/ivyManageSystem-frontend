<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import { normalizeSchoolYear } from '@/utils/academic'
import { todayRange, thisWeekRange, thisMonthRange, lastNDaysRange } from '@/utils/dateRange'
import {
  useAcademicAffairsFilters,
  ACADEMIC_AFFAIRS_FILTERS_KEY,
} from '@/composables/useAcademicAffairsFilters'
import AttendanceSection from '@/components/student/academic-affairs/AttendanceSection.vue'
import LeaveSection from '@/components/student/academic-affairs/LeaveSection.vue'
import AssessmentSection from '@/components/student/academic-affairs/AssessmentSection.vue'
import IncidentSection from '@/components/student/academic-affairs/IncidentSection.vue'

interface ClassroomItem {
  id: number
  name: string
  [key: string]: unknown
}

interface StudentItem {
  id: number
  name: string
  student_no?: string
  [key: string]: unknown
}

const termStore = useAcademicTermStore()
const filtersCtx = useAcademicAffairsFilters()
const { filters, setClassroom, setDateRange, setStudent } = filtersCtx

provide(ACADEMIC_AFFAIRS_FILTERS_KEY, filtersCtx)

const classrooms = ref<ClassroomItem[]>([])
const classroomsLoading = ref(false)
const students = ref<StudentItem[]>([])
const studentsLoading = ref(false)

const classroomOptions = computed(() =>
  classrooms.value.map((c) => ({ label: c.name, value: c.id })),
)

const studentOptions = computed(() =>
  students.value.map((s) => ({
    label: s.student_no ? `${s.name} (${s.student_no})` : s.name,
    value: s.id,
  })),
)

// Typed accessors for filters (composable uses `unknown` but el-select needs typed model-value)
const selectedClassroomId = computed(() => filters.classroomId as number | null)
const selectedStudentId = computed(() => filters.studentId as number | null)
const selectedDateRange = computed(() => filters.dateRange as string[])

const dateRangeShortcuts = [
  { text: '今天', value: () => todayRange() },
  { text: '本週', value: () => thisWeekRange() },
  { text: '本月', value: () => thisMonthRange() },
  { text: '本學期 (近 90 天)', value: () => lastNDaysRange(90) },
]

const fetchClassrooms = async () => {
  classroomsLoading.value = true
  try {
    const res = await getClassrooms({
      school_year: normalizeSchoolYear(termStore.school_year),
      semester: termStore.semester,
      include_inactive: false,
    })
    classrooms.value = (res.data ?? []) as ClassroomItem[]
    if (!filters.classroomId && classrooms.value[0]) {
      setClassroom(classrooms.value[0].id)
    } else if (filters.classroomId && !classrooms.value.find((c) => c.id === filters.classroomId)) {
      setClassroom(classrooms.value[0]?.id ?? null)
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級清單失敗'))
    classrooms.value = []
  } finally {
    classroomsLoading.value = false
  }
}

const fetchStudents = async () => {
  if (!filters.classroomId) {
    students.value = []
    return
  }
  studentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: filters.classroomId as number | null, limit: 500 })
    const raw = res.data ?? []
    students.value = (Array.isArray(raw) ? raw : (raw as { items?: StudentItem[] }).items ?? []) as StudentItem[]
  } catch (error) {
    ElMessage.error(apiError(error, '載入學生清單失敗'))
    students.value = []
  } finally {
    studentsLoading.value = false
  }
}

watch(
  () => filters.classroomId,
  () => fetchStudents(),
)

onMounted(async () => {
  await fetchClassrooms()
  if (filters.classroomId) await fetchStudents()
})
</script>

<template>
  <div class="today-tasks-panel">
    <p class="panel-subtitle">
      出席、請假、評量、事件依下方班級與日期區間顯示；出席為當日點名，僅呈現區間結束日當天。
    </p>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">班級</span>
          <el-select
            :model-value="selectedClassroomId"
            placeholder="選擇班級"
            filterable
            :loading="classroomsLoading"
            style="width: 200px"
            @update:model-value="setClassroom"
          >
            <el-option
              v-for="item in classroomOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">日期區間</span>
          <el-date-picker
            :model-value="selectedDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="起始日"
            end-placeholder="結束日"
            :shortcuts="dateRangeShortcuts"
            style="width: 280px"
            @update:model-value="setDateRange"
          />
        </div>
        <div class="filter-item">
          <span class="filter-label">學生 (選填)</span>
          <el-select
            :model-value="selectedStudentId"
            placeholder="全班"
            filterable
            clearable
            :loading="studentsLoading"
            :disabled="!filters.classroomId"
            style="width: 220px"
            @update:model-value="setStudent"
          >
            <el-option
              v-for="item in studentOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
      </div>
    </el-card>

    <div class="sections-grid">
      <AttendanceSection />
      <LeaveSection />
    </div>

    <div class="secondary-records">
      <span class="secondary-records-label">次要紀錄</span>
      <div class="secondary-records-entries">
        <AssessmentSection :classrooms="classrooms" />
        <IncidentSection :classrooms="classrooms" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.today-tasks-panel {
  padding: var(--space-4) 0;
}

.panel-subtitle {
  margin: 0;
  color: var(--text-secondary);
}

.filter-card {
  margin-top: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--neutral-50);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}

.filter-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.filter-label {
  color: var(--neutral-600);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.sections-grid {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

@media (max-width: 1280px) {
  .sections-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.secondary-records {
  margin-top: var(--space-4);
}

.secondary-records-label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.secondary-records-entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (--to-sm) {
  .secondary-records-entries {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 觸發鈕由子元件 (AssessmentSection / IncidentSection) 渲染，故用 :deep 穿透 */
.secondary-records :deep(.record-entry) {
  width: 100%;
}

.secondary-records :deep(.record-trigger) {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-lg);
  background: var(--neutral-50);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.secondary-records :deep(.record-trigger:hover) {
  background: var(--neutral-100);
  border-color: var(--neutral-300);
}

.secondary-records :deep(.record-trigger-label) {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.secondary-records :deep(.record-trigger-hint) {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.secondary-records :deep(.record-trigger-arrow) {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: var(--text-xl);
  line-height: 1;
}

.section-placeholder {
  border-radius: var(--radius-lg);
  min-height: 320px;
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
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
  { text: '近 90 天', value: () => lastNDaysRange(90) },
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

let studentRequestSequence = 0
const fetchStudents = async () => {
  const sequence = ++studentRequestSequence
  if (!filters.classroomId) {
    students.value = []
    studentsLoading.value = false
    return
  }
  studentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: filters.classroomId as number | null, limit: 500 })
    if (sequence !== studentRequestSequence) return
    const raw = res.data ?? []
    students.value = (Array.isArray(raw) ? raw : (raw as { items?: StudentItem[] }).items ?? []) as StudentItem[]
  } catch (error) {
    if (sequence !== studentRequestSequence) return
    ElMessage.error(apiError(error, '載入學生清單失敗'))
    students.value = []
  } finally {
    if (sequence === studentRequestSequence) studentsLoading.value = false
  }
}

watch(
  () => filters.classroomId,
  () => fetchStudents(),
)

onUnmounted(() => { studentRequestSequence += 1 })

onMounted(async () => {
  await fetchClassrooms()
})
</script>

<template>
  <div class="today-tasks-panel">
    <p class="panel-subtitle">
      篩選會套用到下方請假與教務紀錄。每日點名已移到側欄「學生與班級」：
      <router-link to="/students/rollcall" class="rollcall-link">前往每日點名</router-link>
    </p>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">班級</span>
          <el-select
            :model-value="selectedClassroomId"
            placeholder="選擇班級"
            aria-label="班級"
            filterable
            :loading="classroomsLoading"
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
          <span class="filter-label">學生 (選填)</span>
          <el-select
            :model-value="selectedStudentId"
            placeholder="全班"
            aria-label="學生（選填）"
            filterable
            clearable
            :loading="studentsLoading"
            :disabled="!filters.classroomId"
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
        <label class="filter-item">
          <span class="filter-label">紀錄查詢區間</span>
          <el-date-picker
            :model-value="selectedDateRange"
            type="daterange"
            aria-label="紀錄查詢區間"
            start-label="紀錄起始日"
            end-label="紀錄結束日"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="起始日"
            end-placeholder="結束日"
            :shortcuts="dateRangeShortcuts"
            @update:model-value="setDateRange"
          />
        </label>
      </div>
    </el-card>

    <div class="records-workspace">
      <LeaveSection />

      <div class="secondary-records">
        <span class="secondary-records-label">其他教務紀錄</span>
        <div class="secondary-records-entries">
          <AssessmentSection :classrooms="classrooms" />
          <IncidentSection :classrooms="classrooms" />
        </div>
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

.rollcall-link {
  color: var(--el-color-primary);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  white-space: nowrap;
}

.rollcall-link:hover {
  text-decoration: underline;
}

.rollcall-link:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.filter-card {
  margin-top: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--neutral-50);
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);
  align-items: center;
  gap: var(--space-4);
  max-width: 64rem;
}

.filter-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  min-width: 0;
}

.filter-label {
  color: var(--neutral-600);
  font-size: var(--text-sm);
  white-space: nowrap;
}

/* el-select／el-date-picker 根節點不帶本元件的 scoped 屬性，需 :deep */
.filter-item :deep(.el-select),
.filter-item :deep(.el-date-editor) {
  width: 100%;
  min-width: 0;
}

.records-workspace {
  display: grid;
  margin-top: var(--space-4);
  gap: var(--space-4);
}

.secondary-records {
  min-width: 0;
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
    background var(--transition-fast),
    border-color var(--transition-fast);
}

.secondary-records :deep(.record-trigger:hover) {
  background: var(--neutral-100);
  border-color: var(--neutral-300);
}

.secondary-records :deep(.record-trigger-label) {
  font-weight: 600;
  font-size: var(--text-base);
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

/* 平板：日期區間在三欄裡太擠，改兩欄、區間獨佔一列。 */
@media (--to-md) {
  .filter-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-row > .filter-item:last-child {
    grid-column: 1 / -1;
  }
}

@media (--to-sm) {
  /* 篩選列：標籤在上、控制項滿寬（375px 下日期區間原本會超出卡片右緣）。 */
  .filter-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .filter-item {
    gap: var(--space-1);
  }

  .filter-item :deep(.el-input__wrapper),
  .filter-item :deep(.el-select__wrapper) {
    min-height: var(--touch-target-min);
  }

  .secondary-records-entries {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

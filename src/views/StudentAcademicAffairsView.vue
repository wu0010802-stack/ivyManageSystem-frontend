<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import { normalizeSchoolYear } from '@/utils/academic'
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
const { filters, startDate, endDate, setClassroom, setDateRange, setStudent } = filtersCtx

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
  {
    text: '今天',
    value: () => {
      const t = new Date()
      const iso = t.toISOString().slice(0, 10)
      return [iso, iso]
    },
  },
  {
    text: '本週',
    value: () => {
      const today = new Date()
      const day = today.getDay() || 7
      const start = new Date(today)
      start.setDate(today.getDate() - day + 1)
      return [start.toISOString().slice(0, 10), today.toISOString().slice(0, 10)]
    },
  },
  {
    text: '本月',
    value: () => {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return [start.toISOString().slice(0, 10), today.toISOString().slice(0, 10)]
    },
  },
  {
    text: '本學期 (近 90 天)',
    value: () => {
      const today = new Date()
      const start = new Date(today)
      start.setDate(today.getDate() - 90)
      return [start.toISOString().slice(0, 10), today.toISOString().slice(0, 10)]
    },
  },
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
    const res = await getStudents({ classroom_id: filters.classroomId })
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
  <div class="academic-affairs-page">
    <div class="page-header">
      <div>
        <h2>學生教務管理</h2>
        <p class="page-subtitle">
          整合出席、請假、評量與事件四個模組，依班級與日期區間同步顯示。
        </p>
      </div>
    </div>

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
      <AssessmentSection :classrooms="classrooms" />
      <IncidentSection :classrooms="classrooms" />
    </div>
  </div>
</template>

<style scoped>
.academic-affairs-page {
  padding: 16px 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.page-subtitle {
  margin-top: 4px;
  color: #64748b;
}

.filter-card {
  margin-top: 16px;
  border-radius: 12px;
  background: #f8fafc;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  color: #475569;
  font-size: 13px;
  white-space: nowrap;
}

.sections-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1280px) {
  .sections-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.section-placeholder {
  border-radius: 12px;
  min-height: 320px;
}
</style>

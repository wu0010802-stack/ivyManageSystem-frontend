<script setup lang="ts">
/**
 * 每日點名（/students/rollcall，側欄「學生與班級 › 每日點名」）。
 *
 * 2026-11-03 自學生儀表板（/students?tab=tasks）抽成側欄獨立頁：點名是每天固定的作業，
 * 原本夾在儀表板左欄、跟請假／教務紀錄共用一組篩選，入口太深。
 *
 * 主體沿用 AttendanceSection（各班進度＋就地編修點名表），它從 ACADEMIC_AFFAIRS_FILTERS_KEY
 * 取班級；本頁 provide 一份自己的篩選狀態，只用其中的班級（學生篩選、紀錄區間不屬於點名作業）。
 * 點名日期由本頁持有，跟 AttendanceSection 雙向綁定（點名表「返回儲存」會把日期切回原日）。
 */
import { computed, onMounted, provide, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import AttendanceSection from '@/components/student/academic-affairs/AttendanceSection.vue'
import { getClassrooms } from '@/api/classrooms'
import { useAcademicTermStore } from '@/stores/academicTerm'
import {
  useAcademicAffairsFilters,
  ACADEMIC_AFFAIRS_FILTERS_KEY,
} from '@/composables/useAcademicAffairsFilters'
import { normalizeSchoolYear } from '@/utils/academic'
import { apiError } from '@/utils/error'
import { todayISO } from '@/utils/format'

interface ClassroomItem {
  id: number
  name: string
  [key: string]: unknown
}

const termStore = useAcademicTermStore()
const filtersCtx = useAcademicAffairsFilters()
const { filters, setClassroom } = filtersCtx
provide(ACADEMIC_AFFAIRS_FILTERS_KEY, filtersCtx)

const attendanceDate = ref(todayISO())
const classrooms = ref<ClassroomItem[]>([])
const classroomsLoading = ref(false)

const classroomOptions = computed(() =>
  classrooms.value.map((c) => ({ label: c.name, value: c.id })),
)
const selectedClassroomId = computed(() => filters.classroomId as number | null)

const fetchClassrooms = async () => {
  classroomsLoading.value = true
  try {
    const res = await getClassrooms({
      school_year: normalizeSchoolYear(termStore.school_year),
      semester: termStore.semester,
      include_inactive: false,
    })
    classrooms.value = (res.data ?? []) as ClassroomItem[]
    // 預設第一班；目前選的班不在本學期清單裡（換學期後）也退回第一班。
    if (!classrooms.value.some((c) => c.id === filters.classroomId)) {
      setClassroom(classrooms.value[0]?.id ?? null)
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級清單失敗'))
    classrooms.value = []
  } finally {
    classroomsLoading.value = false
  }
}

onMounted(() => {
  void fetchClassrooms()
})
</script>

<template>
  <div class="student-rollcall-view">
    <PageHeader title="每日點名">
      <template #actions>
        <div class="rollcall-control">
          <span class="rollcall-control__label">班級</span>
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
        <label class="rollcall-control">
          <span class="rollcall-control__label">點名日期</span>
          <el-date-picker
            v-model="attendanceDate"
            type="date"
            aria-label="點名日期"
            value-format="YYYY-MM-DD"
            :clearable="false"
          />
        </label>
      </template>
    </PageHeader>

    <AttendanceSection v-model:attendance-date="attendanceDate" hide-header />
  </div>
</template>

<style scoped>
.rollcall-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rollcall-control__label {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  white-space: nowrap;
}

/* el-select／el-date-picker 根節點不帶本元件的 scoped 屬性，需 :deep */
.rollcall-control :deep(.el-select) {
  width: 12rem;
}

.rollcall-control :deep(.el-date-editor) {
  width: 10rem;
}

@media (--to-sm) {
  .rollcall-control {
    flex: 1 1 100%;
  }

  /* 兩個標籤字數不同，固定寬度讓下拉與日期框左緣對齊 */
  .rollcall-control__label {
    flex: 0 0 4.5em;
  }

  .rollcall-control :deep(.el-select),
  .rollcall-control :deep(.el-date-editor) {
    flex: 1;
    width: auto;
  }

  .rollcall-control :deep(.el-input__wrapper),
  .rollcall-control :deep(.el-select__wrapper) {
    min-height: var(--touch-target-min);
  }
}
</style>

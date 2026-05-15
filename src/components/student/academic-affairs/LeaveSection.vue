<script setup>
import { computed, inject, ref, watch } from 'vue'
import { apiError } from '@/utils/error'
import { listStudentLeaves } from '@/api/studentLeaves'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import SectionCard from './SectionCard.vue'

const STATUS_MAP = {
  approved: { label: '已成立', type: 'success' },
  cancelled: { label: '已取消', type: 'info' },
  pending: { label: '待審', type: 'warning' },
  rejected: { label: '已駁回', type: 'danger' },
}

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('LeaveSection 須在 StudentAcademicAffairsView 內使用')

const items = ref([])
const loading = ref(false)
const errorMessage = ref('')

const filtered = computed(() => {
  const sid = ctx.filters.studentId
  const start = ctx.startDate.value
  const end = ctx.endDate.value
  return items.value.filter((it) => {
    if (sid && it.student_id !== sid) return false
    if (start && it.end_date && it.end_date.slice(0, 10) < start) return false
    if (end && it.start_date && it.start_date.slice(0, 10) > end) return false
    return true
  })
})

const formatDate = (s) => (s ? s.replace(/T.*/, '') : '')

const fetchLeaves = async () => {
  if (!ctx.filters.classroomId) {
    items.value = []
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await listStudentLeaves({
      status: 'approved',
      classroom_id: ctx.filters.classroomId,
      limit: 200,
    })
    items.value = res.data?.items || []
  } catch (error) {
    errorMessage.value = apiError(error, '載入請假資料失敗')
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => ctx.filters.classroomId,
  () => fetchLeaves(),
  { immediate: true },
)
</script>

<template>
  <SectionCard
    title="請假"
    :count="filtered.length"
    count-type="info"
    :loading="loading"
    :error-message="errorMessage"
    :empty-description="ctx.filters.classroomId ? '期間內沒有請假紀錄' : '請先選擇班級'"
    :show-empty="filtered.length === 0"
    :open-full-route="{ name: 'student-leaves' }"
    @retry="fetchLeaves"
  >
    <el-table
      v-if="filtered.length"
      :data="filtered"
      stripe
      size="small"
      style="width: 100%"
      max-height="360"
    >
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="假別" prop="leave_type" width="70" align="center" />
      <el-table-column label="期間" min-width="170">
        <template #default="{ row }">
          {{ formatDate(row.start_date) }} ~ {{ formatDate(row.end_date) }}
        </template>
      </el-table-column>
      <el-table-column label="原因" prop="reason" min-width="140" show-overflow-tooltip />
      <el-table-column label="狀態" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS_MAP[row.status]?.type || 'info'">
            {{ STATUS_MAP[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </SectionCard>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiError } from '@/utils/error'
import { getDailyAttendance } from '@/api/studentAttendance'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { ATTENDANCE_EVENTS, domainBus } from '@/utils/domainBus'
import AttendanceBatchPanel from './AttendanceBatchPanel.vue'
import SectionCard from './SectionCard.vue'

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('AttendanceSection 須在 StudentAcademicAffairsView 內使用')

const records = ref([])
const loading = ref(false)
const errorMessage = ref('')
const batchDrawerOpen = ref(false)

const refDate = computed(() => ctx.endDate.value)

const filteredRows = computed(() => {
  const sid = ctx.filters.studentId
  if (!sid) return records.value
  return records.value.filter((r) => r.student_id === sid)
})

const summary = computed(() => {
  const s = { total: filteredRows.value.length, present: 0, absent: 0, leave: 0, unmarked: 0, late: 0 }
  for (const r of filteredRows.value) {
    if (!r.status) { s.unmarked += 1; continue }
    if (r.status === '出席') s.present += 1
    else if (r.status === '遲到') s.late += 1
    else if (r.status === '缺席') s.absent += 1
    else if (r.status === '病假' || r.status === '事假') s.leave += 1
  }
  return s
})

const statusType = (status) => {
  if (status === '出席') return 'success'
  if (status === '遲到') return 'warning'
  if (status === '缺席') return 'danger'
  if (status === '病假' || status === '事假') return 'info'
  return ''
}

const fetchDaily = async () => {
  if (!ctx.filters.classroomId || !refDate.value) {
    records.value = []
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await getDailyAttendance({
      date: refDate.value,
      classroom_id: ctx.filters.classroomId,
    })
    records.value = res.data?.records ?? []
  } catch (error) {
    errorMessage.value = apiError(error, '載入出席資料失敗')
    records.value = []
  } finally {
    loading.value = false
  }
}

const onAttendanceChanged = (payload) => {
  if (payload?.classroom_id === ctx.filters.classroomId && payload?.date === refDate.value) {
    fetchDaily()
  }
}

watch(
  () => [ctx.filters.classroomId, refDate.value],
  () => fetchDaily(),
  { immediate: true },
)

onMounted(() => {
  domainBus.on(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
})

onUnmounted(() => {
  domainBus.off(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
})

defineExpose({ fetchDaily })
</script>

<template>
  <SectionCard
    title="出席"
    :count="summary.total"
    count-type="primary"
    :loading="loading"
    :error-message="errorMessage"
    :empty-description="ctx.filters.classroomId ? '當日沒有資料' : '請先選擇班級'"
    :show-empty="filteredRows.length === 0"
    :open-full-route="{ name: 'student-attendance' }"
    @retry="fetchDaily"
  >
    <template #titleExtra v-if="refDate">{{ refDate }}</template>
    <template #actions>
      <el-button
        size="small"
        type="primary"
        :disabled="!ctx.filters.classroomId"
        @click="batchDrawerOpen = true"
      >
        批次點名
      </el-button>
    </template>
    <template #summary>
      <div class="summary-tags">
        <el-tag type="success" size="small">出席 {{ summary.present }}</el-tag>
        <el-tag type="warning" size="small">遲到 {{ summary.late }}</el-tag>
        <el-tag type="danger" size="small">缺席 {{ summary.absent }}</el-tag>
        <el-tag type="info" size="small">請假 {{ summary.leave }}</el-tag>
        <el-tag size="small">未點名 {{ summary.unmarked }}</el-tag>
      </div>
    </template>

    <el-table
      v-if="filteredRows.length"
      :data="filteredRows"
      stripe
      size="small"
      style="width: 100%; margin-top: 12px"
      max-height="320"
    >
      <el-table-column prop="student_no" label="學號" width="80" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column label="狀態" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ row.status || '未點名' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="備註" show-overflow-tooltip />
    </el-table>

    <el-drawer
      v-model="batchDrawerOpen"
      :title="`批次點名 - ${refDate}`"
      size="60%"
      destroy-on-close
    >
      <AttendanceBatchPanel
        :classroom-id="ctx.filters.classroomId"
        :date="refDate"
        hide-classroom-select
        hide-date-picker
        hint="儲存後本頁出席區塊會自動更新；舊出席頁如同時開啟也會同步刷新。"
      />
    </el-drawer>
  </SectionCard>
</template>

<style scoped>
.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>

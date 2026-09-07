<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiError } from '@/utils/error'
import { getDailyAttendance } from '@/api/studentAttendance'
import type { Schema } from '@/api/_generated/typed'
import { ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import { ATTENDANCE_EVENTS, domainBus } from '@/utils/domainBus'
import AttendanceBatchPanel from './AttendanceBatchPanel.vue'
import SectionCard from './SectionCard.vue'

const props = defineProps<{ attendanceDate?: string | null }>()

const ctx = inject(ACADEMIC_AFFAIRS_FILTERS_KEY)
if (!ctx) throw new Error('AttendanceSection 須在 TodayTasksPanel 內使用')

type AttendanceRow = Schema<'StudentAttendanceDailyRecordOut'>
const records = ref<AttendanceRow[]>([])
const loading = ref(false)
const errorMessage = ref('')
const batchDrawerOpen = ref(false)

const refDate = computed(() => props.attendanceDate === undefined ? ctx.endDate.value : props.attendanceDate)

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

const statusType = (status: string | null | undefined) => {
  if (status === '出席') return 'success'
  if (status === '遲到') return 'warning'
  if (status === '缺席') return 'danger'
  if (status === '病假' || status === '事假') return 'info'
  return undefined
}

let requestSequence = 0
const fetchDaily = async () => {
  const sequence = ++requestSequence
  const classroomId = ctx.filters.classroomId as number | null
  const date = refDate.value
  if (!classroomId || !date) {
    records.value = []
    errorMessage.value = ''
    loading.value = false
    return
  }
  loading.value = true
  records.value = []
  errorMessage.value = ''
  try {
    const res = await getDailyAttendance({
      date,
      classroom_id: classroomId,
    })
    if (sequence !== requestSequence) return
    records.value = res.data.records ?? []
  } catch (error) {
    if (sequence !== requestSequence) return
    errorMessage.value = apiError(error, '載入出席資料失敗')
    records.value = []
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

const onAttendanceChanged = (payload: Record<string, unknown>) => {
  if (payload?.classroom_id === ctx.filters.classroomId && payload?.date === refDate.value) {
    fetchDaily()
  }
}

watch(
  () => [ctx.filters.classroomId, refDate.value],
  () => {
    batchDrawerOpen.value = false
    fetchDaily()
  },
  { immediate: true },
)

onMounted(() => {
  domainBus.on(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
})

onUnmounted(() => {
  requestSequence += 1
  domainBus.off(ATTENDANCE_EVENTS.CHANGED, onAttendanceChanged)
})

defineExpose({ fetchDaily })
</script>

<template>
  <SectionCard
    title="每日點名"
    :count="summary.total"
    count-type="info"
    :loading="loading"
    :error-message="errorMessage"
    :empty-description="ctx.filters.classroomId ? '當日尚未點名，點右上「批次點名」開始' : '請先選擇班級'"
    :show-empty="filteredRows.length === 0"
    @retry="fetchDaily"
  >
    <template #titleExtra v-if="refDate">{{ refDate }}</template>
    <template #actions>
      <el-button
        size="small"
        type="primary"
        :disabled="!ctx.filters.classroomId || !refDate || loading"
        @click="batchDrawerOpen = true"
      >
        批次點名
      </el-button>
    </template>
    <template #summary>
      <p v-if="!loading && !errorMessage && summary.total" class="attendance-progress" role="status">
        {{ summary.unmarked ? `尚有 ${summary.unmarked} 位未完成點名` : ctx.filters.studentId ? '此學生已完成點名' : '全班已完成點名' }}
      </p>
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
      class="attendance-table"
      max-height="320"
    >
      <el-table-column prop="student_no" label="學號" width="100" />
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
        v-if="refDate"
        :classroom-id="(ctx.filters.classroomId as number | null)"
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
  gap: var(--space-2);
}
.attendance-progress { margin: 0 0 var(--space-3); font-weight: var(--font-weight-semibold); }
.attendance-table { width: 100%; margin-top: var(--space-3); }
</style>

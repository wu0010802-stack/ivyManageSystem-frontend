<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getAttendanceDetail } from '@/api/reports'
import { apiError } from '@/utils/error'

const props = withDefaults(defineProps<{
  modelValue: boolean
  year: number
  month?: number | null
  classroomId?: number | null
  classroomName?: string | null
}>(), {
  month: null,
  classroomId: null,
  classroomName: null,
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref<{ records?: unknown[]; total_records?: number; truncated?: boolean } | null>(null)

const load = async () => {
  if (!props.year) return
  loading.value = true
  try {
    const res = await getAttendanceDetail(props.year, {
      month: props.month,
      classroomId: props.classroomId,
    })
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入考勤明細失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month, props.classroomId],
  ([open]) => {
    if (open) load()
  },
)

const records = computed(() => data.value?.records || [])
const totalRecords = computed(() => data.value?.total_records || 0)
const truncated = computed(() => data.value?.truncated || false)

const title = computed(() => {
  const parts = [`${props.year} 年`]
  if (props.month != null) parts.push(`${props.month} 月`)
  else parts.push('全年')
  if (props.classroomName) parts.push(props.classroomName)
  parts.push('異常記錄')
  return parts.join(' ')
})

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const ANOMALY_LABELS: Record<string, string> = {
  late: '遲到',
  early_leave: '早退',
  missing_punch_in: '缺打上班',
  missing_punch_out: '缺打下班',
}

const ANOMALY_TAG_TYPE: Record<string, ElTagType> = {
  late: 'warning',
  early_leave: 'warning',
  missing_punch_in: 'danger',
  missing_punch_out: 'danger',
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="900px"
    append-to-body
  >
    <div v-if="truncated" class="truncate-hint">
      結果共 {{ totalRecords }} 筆，僅顯示前 200 筆；建議縮小範圍（月份或班級）。
    </div>
    <el-table
      v-loading="loading"
      :data="records"
      border
      stripe
      max-height="500"
      size="small"
      empty-text="無異常記錄"
    >
      <el-table-column prop="date" label="日期" width="110" />
      <el-table-column prop="employee_name" label="員工" width="110" />
      <el-table-column prop="classroom_name" label="班級" width="100" />
      <el-table-column label="異常類型" min-width="180">
        <template #default="{ row }">
          <el-tag
            v-for="t in row.anomaly_types"
            :key="t"
            :type="ANOMALY_TAG_TYPE[t]"
            size="small"
            style="margin-right: 4px;"
          >
            {{ ANOMALY_LABELS[t] || t }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="遲到/早退" width="120" align="right">
        <template #default="{ row }">
          <span v-if="row.late_minutes">遲 {{ row.late_minutes }} 分</span>
          <span v-if="row.late_minutes && row.early_minutes"> / </span>
          <span v-if="row.early_minutes">早退 {{ row.early_minutes }} 分</span>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="備註" min-width="120" show-overflow-tooltip />
    </el-table>
  </el-dialog>
</template>

<style scoped>
.truncate-hint {
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  color: var(--el-color-warning-dark-2);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
}
</style>

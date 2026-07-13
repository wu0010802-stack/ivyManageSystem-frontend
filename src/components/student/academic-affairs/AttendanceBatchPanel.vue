<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { batchSaveAttendance, getDailyAttendance } from '@/api/studentAttendance'
import type { Schema } from '@/api/_generated/typed'
import { domainBus, ATTENDANCE_EVENTS } from '@/utils/domainBus'
import { buildStudentProfileLink } from '@/utils/studentLinks'

const STATUS_OPTIONS = ['出席', '缺席', '病假', '事假', '遲到']

const props = withDefaults(defineProps<{
  classroomId?: number | string | null
  date: string
  classroomOptions?: Record<string, unknown>[]
  hideClassroomSelect?: boolean
  hideDatePicker?: boolean
  hint?: string
}>(), {
  classroomId: null,
  classroomOptions: () => [],
  hideClassroomSelect: false,
  hideDatePicker: false,
  hint: '這裡用於管理端手動補登或修正單班出席狀態，不是主要日常點名入口。',
})

const emit = defineEmits<{
  'update:classroomId': [v: number | string | null]
  'update:date': [v: string]
  'saved': [payload: { date: string; classroom_id: number | string | null }]
}>()

const localClassroomId = computed({
  get: () => props.classroomId,
  set: (v) => emit('update:classroomId', v),
})
const localDate = computed({
  get: () => props.date,
  set: (v) => emit('update:date', v),
})

type DailyRecord = Schema<'StudentAttendanceDailyRecordOut'>
interface AttendanceRecord extends Omit<DailyRecord, 'status' | 'remark'> {
  status: string
  remark: string
}
const dailyRecords = ref<AttendanceRecord[]>([])
const dailyLoading = ref(false)
const saving = ref(false)

const fetchDaily = async () => {
  const classroomId = Number(localClassroomId.value)
  if (!localClassroomId.value || !localDate.value || Number.isNaN(classroomId)) {
    dailyRecords.value = []
    return
  }
  dailyLoading.value = true
  try {
    const res = await getDailyAttendance({
      date: localDate.value,
      classroom_id: classroomId,
    })
    dailyRecords.value = (res.data.records ?? []).map((record) => ({
      ...record,
      status: record.status ?? '出席',
      remark: record.remark ?? '',
    }))
  } catch (error) {
    ElMessage.error(apiError(error, '載入點名編修資料失敗'))
  } finally {
    dailyLoading.value = false
  }
}

const markAll = (status: string) => {
  dailyRecords.value.forEach((record) => {
    record.status = status
  })
}

const saveDaily = async () => {
  if (!dailyRecords.value.length) return
  saving.value = true
  try {
    await batchSaveAttendance({
      date: localDate.value,
      entries: dailyRecords.value.map((record) => ({
        student_id: record.student_id,
        status: record.status,
        remark: record.remark || null,
      })),
    })
    ElMessage.success('點名編修儲存成功')
    domainBus.emit(ATTENDANCE_EVENTS.CHANGED, {
      date: localDate.value,
      classroom_id: localClassroomId.value,
    })
    emit('saved', { date: localDate.value, classroom_id: localClassroomId.value })
    await fetchDaily()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

watch(
  () => [localClassroomId.value, localDate.value],
  () => fetchDaily(),
  { immediate: true },
)

defineExpose({ fetchDaily })
</script>

<template>
  <div class="attendance-batch-panel">
    <div class="toolbar">
      <el-select
        v-if="!hideClassroomSelect"
        v-model="localClassroomId"
        placeholder="選擇班級"
        style="width: 180px"
      >
        <el-option
          v-for="item in classroomOptions"
          :key="item.value as PropertyKey"
          :label="item.label as string"
          :value="(item.value as number | string)"
        />
      </el-select>
      <el-date-picker
        v-if="!hideDatePicker"
        v-model="localDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="選擇日期"
        style="width: 170px"
      />
      <el-button-group>
        <el-button size="small" type="success" @click="markAll('出席')">全部出席</el-button>
        <el-button size="small" type="danger" @click="markAll('缺席')">全部缺席</el-button>
      </el-button-group>
      <el-button
        type="primary"
        style="margin-left: auto"
        :loading="saving"
        :disabled="!dailyRecords.length"
        @click="saveDaily"
      >
        儲存編修
      </el-button>
    </div>

    <el-alert
      v-if="hint"
      :title="hint"
      type="warning"
      :closable="false"
      show-icon
      class="panel-hint"
    />

    <el-table
      v-loading="dailyLoading"
      :data="dailyRecords"
      stripe
      style="width: 100%; margin-top: 12px"
      max-height="520"
    >
      <el-table-column prop="student_no" label="學號" width="90" />
      <el-table-column label="姓名" width="110">
        <template #default="{ row }">
          <router-link
            v-if="buildStudentProfileLink(row.student_id, 'attendance')"
            :to="buildStudentProfileLink(row.student_id, 'attendance')!"
            class="student-link"
          >{{ row.name }}</router-link>
          <span v-else>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="出席狀態" width="320">
        <template #default="{ row }">
          <el-radio-group v-model="row.status" size="small">
            <el-radio-button
              v-for="status in STATUS_OPTIONS"
              :key="status"
              :value="status"
            >
              {{ status }}
            </el-radio-button>
          </el-radio-group>
        </template>
      </el-table-column>
      <el-table-column label="備註">
        <template #default="{ row }">
          <el-input v-model="row.remark" placeholder="選填" size="small" clearable />
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!dailyLoading && !dailyRecords.length" class="empty-hint">
      請先選擇班級與日期
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.panel-hint {
  margin-top: 12px;
}

.empty-hint {
  padding: 40px 0;
  text-align: center;
  color: #94a3b8;
}

.student-link {
  color: #1d4ed8;
  text-decoration: none;
}
.student-link:hover {
  text-decoration: underline;
}
</style>

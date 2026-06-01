<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { batchCreateOvertimes } from '@/api/overtimes'
import { apiError } from '@/utils/error'
import { OVERTIME_TYPES as overtimeTypes } from '@/constants/approvalEnums'

const props = defineProps<{
  modelValue: boolean
  employees: { id: number; name: string; is_active?: boolean }[]
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  created: []
}>()

interface Row {
  id: number
  name: string
  selected: boolean
  hours: number
}

interface BatchError {
  employee_id: number
  name: string | null
  reason: string
}

const form = reactive({
  overtime_date: '',
  overtime_type: 'weekday',
  start_time: '',
  end_time: '',
  reason: '',
  use_comp_leave: false,
  defaultHours: 1,
})

const rows = ref<Row[]>([])
const batchErrors = ref<BatchError[]>([])
const submitting = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const selectedCount = computed(() => rows.value.filter(r => r.selected).length)
const allSelected = computed({
  get: () => rows.value.length > 0 && rows.value.every(r => r.selected),
  set: (v: boolean) => rows.value.forEach(r => { r.selected = v }),
})

const resetState = () => {
  form.overtime_date = ''
  form.overtime_type = 'weekday'
  form.start_time = ''
  form.end_time = ''
  form.reason = ''
  form.use_comp_leave = false
  form.defaultHours = 1
  batchErrors.value = []
  rows.value = props.employees
    .filter(e => e.is_active !== false)
    .map(e => ({ id: e.id, name: e.name, selected: true, hours: form.defaultHours }))
}

// 對話框開啟時初始化（immediate 確保 mount 時 modelValue=true 也會跑）
watch(() => props.modelValue, (open) => { if (open) resetState() }, { immediate: true })
// 預設時數變動時同步每列
watch(() => form.defaultHours, (h) => { rows.value.forEach(r => { r.hours = h }) })

const buildPayload = () => ({
  overtime_date: form.overtime_date,
  overtime_type: form.overtime_type,
  start_time: form.start_time || null,
  end_time: form.end_time || null,
  reason: form.reason || null,
  use_comp_leave: form.use_comp_leave,
  employees: rows.value
    .filter(r => r.selected)
    .map(r => ({ employee_id: r.id, hours: r.hours })),
})

const applyBatchErrors = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: { errors?: BatchError[] } } } })
    ?.response?.data?.detail
  batchErrors.value = Array.isArray(detail?.errors) ? detail!.errors : []
}

const submit = async () => {
  batchErrors.value = []
  if (!form.overtime_date) {
    ElMessage.warning('請選擇加班日期')
    return
  }
  const payload = buildPayload()
  if (payload.employees.length === 0) {
    ElMessage.warning('請至少選擇一位員工')
    return
  }
  submitting.value = true
  try {
    const resp = await batchCreateOvertimes(payload)
    ElMessage.success((resp.data as { message?: string }).message || '批次建立完成')
    visible.value = false
    emit('created')
  } catch (error) {
    applyBatchErrors(error)
    if (batchErrors.value.length === 0) {
      ElMessage.error('建立失敗: ' + apiError(error, (error as Error).message))
    } else {
      ElMessage.error('整批未建立，請修正下列項目')
    }
  } finally {
    submitting.value = false
  }
}

defineExpose({ form, rows, batchErrors, buildPayload, applyBatchErrors })
</script>

<template>
  <el-dialog v-model="visible" title="批次加班（活動多人出席）" width="720px" top="5vh">
    <el-form label-width="100px">
      <el-form-item label="加班日期" required>
        <el-date-picker v-model="form.overtime_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
      </el-form-item>
      <el-form-item label="加班類型" required>
        <el-select v-model="form.overtime_type" style="width: 100%;">
          <el-option v-for="ot in overtimeTypes" :key="ot.value" :label="`${ot.label}（${ot.desc}）`" :value="ot.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="開始時間">
        <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="活動開始（選填）" style="width: 100%;" />
      </el-form-item>
      <el-form-item label="結束時間">
        <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="活動結束（選填）" style="width: 100%;" />
      </el-form-item>
      <el-form-item label="預設時數">
        <el-input-number v-model="form.defaultHours" :min="0.5" :step="0.5" :max="12" />
        <span class="dialog-hint">套用到下方每位員工，可逐人微調</span>
      </el-form-item>
      <el-form-item label="補休方式">
        <el-switch v-model="form.use_comp_leave" active-text="補休（加班費為 0）" inactive-text="計薪" active-color="#67c23a" />
      </el-form-item>
      <el-form-item label="原因">
        <el-input v-model="form.reason" type="textarea" :rows="2" />
      </el-form-item>

      <el-divider>選擇員工</el-divider>
      <div class="batch-actions">
        <el-checkbox v-model="allSelected">全選</el-checkbox>
        <span class="text-muted">已選 {{ selectedCount }} 人</span>
      </div>
      <div class="employee-list">
        <div v-for="row in rows" :key="row.id" class="employee-item">
          <el-checkbox v-model="row.selected">{{ row.name }}</el-checkbox>
          <el-input-number v-model="row.hours" :min="0.5" :step="0.5" :max="12" :disabled="!row.selected" size="small" />
        </div>
      </div>

      <el-alert v-if="batchErrors.length > 0" type="error" :closable="false" show-icon class="batch-error-alert">
        <template #title>整批未建立，請修正下列項目：</template>
        <ul class="batch-error-list">
          <li v-for="(e, idx) in batchErrors" :key="idx">
            {{ e.name || ('員工 #' + e.employee_id) }}：{{ e.reason }}
          </li>
        </ul>
      </el-alert>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認建立</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-hint {
  margin-left: 12px;
  color: var(--text-tertiary);
}
.batch-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.employee-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.employee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
}
.text-muted {
  color: var(--text-tertiary);
}
.batch-error-alert {
  margin-top: 12px;
}
.batch-error-list {
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>

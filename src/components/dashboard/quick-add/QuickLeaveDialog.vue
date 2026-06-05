<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { todayISO } from '@/utils/format'
import type { FormInstance, FormRules } from 'element-plus'
import { createLeave } from '@/api/leaves'
import { useEmployeeStore } from '@/stores/employee'
import { LEAVE_TYPES } from '@/utils/leaves'
import { useQuickAddSubmit } from './useQuickAddSubmit'

type EmployeeOption = { id: number; name: string; job_title?: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const employeeStore = useEmployeeStore()

const formRef = ref<FormInstance>()
const today = () => todayISO()
const form = reactive({
  employee_id: null as number | null,
  leave_type: 'personal',
  start_date: today(),
  end_date: today(),
  leave_hours: 8,
  reason: '',
})

const dateOrderError = computed(() =>
  form.start_date && form.end_date && form.end_date < form.start_date
    ? '結束日期不可早於開始日期'
    : '',
)

const rules: FormRules = {
  employee_id: [{ required: true, message: '請選擇員工', trigger: 'change' }],
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  start_date: [{ required: true, message: '請選擇開始日期', trigger: 'change' }],
  end_date: [{ required: true, message: '請選擇結束日期', trigger: 'change' }],
  leave_hours: [{ required: true, message: '請輸入請假時數', trigger: 'blur' }],
}

const { submitting, run } = useQuickAddSubmit()

const resetForm = () => {
  form.employee_id = null
  form.leave_type = 'personal'
  form.start_date = today()
  form.end_date = today()
  form.leave_hours = 8
  form.reason = ''
  formRef.value?.clearValidate()
}

onMounted(() => {
  if (!employeeStore.employees || employeeStore.employees.length === 0) {
    employeeStore.fetchEmployees()
  }
})

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetForm()
      if (!employeeStore.employees || employeeStore.employees.length === 0) {
        employeeStore.fetchEmployees()
      }
    }
  },
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.employee_id == null) return
  if (dateOrderError.value) return
  const result = await run({
    label: '請假',
    listPath: '/leaves',
    listLabel: '請假管理',
    context: 'QuickLeaveDialog:submit',
    submit: () =>
      createLeave({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        leave_hours: form.leave_hours,
        reason: form.reason || null,
      }),
  })
  if (result) emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="快速新增請假"
    width="540px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="員工" prop="employee_id">
        <el-select
          v-model="form.employee_id"
          placeholder="選擇員工"
          filterable
          :loading="employeeStore.loading"
          style="width: 100%"
        >
          <el-option
            v-for="emp in (employeeStore.employees as EmployeeOption[])"
            :key="emp.id"
            :label="`${emp.name}${emp.job_title ? ` (${emp.job_title})` : ''}`"
            :value="emp.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="假別" prop="leave_type">
        <el-select v-model="form.leave_type" style="width: 100%">
          <el-option v-for="lt in LEAVE_TYPES" :key="lt.value" :label="lt.label" :value="lt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="開始日期" prop="start_date">
        <el-date-picker
          v-model="form.start_date"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="結束日期" prop="end_date" :error="dateOrderError || undefined">
        <el-date-picker
          v-model="form.end_date"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="時數" prop="leave_hours">
        <el-input-number v-model="form.leave_hours" :min="0.5" :step="0.5" :precision="1" />
        <span style="margin-left:8px;color:var(--el-text-color-secondary);font-size:12px">小時</span>
      </el-form-item>
      <el-form-item label="原因">
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="請假原因（選填）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">送出</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createOvertime } from '@/api/overtimes'
import { useEmployeeStore } from '@/stores/employee'
import { OVERTIME_TYPES } from '@/constants/approvalEnums'
import { useQuickAddSubmit } from './useQuickAddSubmit'

type EmployeeOption = { id: number; name: string; job_title?: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const employeeStore = useEmployeeStore()

const formRef = ref<FormInstance>()
const today = () => new Date().toISOString().slice(0, 10)
const form = reactive({
  employee_id: null as number | null,
  overtime_date: today(),
  overtime_type: 'weekday',
  hours: 1,
  reason: '',
})

const rules: FormRules = {
  employee_id: [{ required: true, message: '請選擇員工', trigger: 'change' }],
  overtime_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  hours: [{ required: true, message: '請輸入時數', trigger: 'blur' }],
}

const { submitting, run } = useQuickAddSubmit()

const resetForm = () => {
  form.employee_id = null
  form.overtime_date = today()
  form.overtime_type = 'weekday'
  form.hours = 1
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
  const result = await run({
    label: '加班',
    listPath: '/overtime',
    listLabel: '加班管理',
    context: 'QuickOvertimeDialog:submit',
    submit: () =>
      createOvertime({
        employee_id: form.employee_id,
        overtime_date: form.overtime_date,
        overtime_type: form.overtime_type,
        hours: form.hours,
        reason: form.reason || null,
        use_comp_leave: false,
      }),
  })
  if (result) emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="快速新增加班"
    width="520px"
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
      <el-form-item label="日期" prop="overtime_date">
        <el-date-picker
          v-model="form.overtime_date"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="類型">
        <el-radio-group v-model="form.overtime_type">
          <el-radio v-for="t in OVERTIME_TYPES" :key="t.value" :value="t.value">{{ t.label }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="時數" prop="hours">
        <el-input-number v-model="form.hours" :min="0.5" :step="0.5" :precision="1" />
        <span style="margin-left:8px;color:var(--el-text-color-secondary);font-size:12px">小時</span>
      </el-form-item>
      <el-form-item label="原因">
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="加班原因（選填）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">送出</el-button>
    </template>
  </el-dialog>
</template>

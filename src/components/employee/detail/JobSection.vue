<script setup lang="ts">
import { computed } from 'vue'
import { EMPLOYEE_TYPE_OPTIONS } from '@/constants/employee'

const props = defineProps<{ employee: Record<string, unknown> }>()

const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === props.employee.employee_type)
  return opt ? opt.label : ((props.employee.employee_type as string) || '—')
})
const STAFF_ROLE_LABELS: Record<string, string> = {
  teacher_certified: '幼教師（持幼教師證）', educare_certified: '教保員（持教保員證）',
  assistant_educare: '助理教保員', office: '行政人員', kitchen: '廚工', driver: '司機', other: '其他',
}
const staffRoleLabel = computed(() => {
  const v = props.employee.staff_role_category as string
  return v ? (STAFF_ROLE_LABELS[v] || v) : '—'
})
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="員工類型">{{ employeeTypeLabel }}</el-descriptions-item>
    <el-descriptions-item label="園內職務">{{ employee.position || '—' }}</el-descriptions-item>
    <el-descriptions-item label="到職日">{{ employee.hire_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="試用期結束">{{ employee.probation_end_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="主管職">
      <el-tag v-if="employee.supervisor_role" size="small">{{ employee.supervisor_role }}</el-tag>
      <span v-else>—</span>
    </el-descriptions-item>
    <el-descriptions-item label="班級">{{ employee.classroom_name || '—' }}</el-descriptions-item>
    <el-descriptions-item label="教保身分別">{{ staffRoleLabel }}</el-descriptions-item>
    <el-descriptions-item label="教師/教保員證號">
      {{ employee.teacher_cert_no || '—' }}<span v-if="employee.teacher_cert_type">（{{ employee.teacher_cert_type }}）</span>
    </el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_date" label="離職日">{{ employee.resign_date }}</el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_reason" label="離職原因">{{ employee.resign_reason }}</el-descriptions-item>
  </el-descriptions>
</template>

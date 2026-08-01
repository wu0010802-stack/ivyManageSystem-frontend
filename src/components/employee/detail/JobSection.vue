<script setup lang="ts">
import { computed } from 'vue'
import { EMPLOYEE_TYPE_OPTIONS } from '@/constants/employee'

const props = defineProps<{ employee: Record<string, unknown> }>()

const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === props.employee.employee_type)
  return opt ? opt.label : ((props.employee.employee_type as string) || '未填寫')
})
const STAFF_ROLE_LABELS: Record<string, string> = {
  teacher_certified: '幼教師（持幼教師證）', educare_certified: '教保員（持教保員證）',
  assistant_educare: '助理教保員', office: '職員', kitchen: '廚工', driver: '司機', other: '其他',
}
const staffRoleLabel = computed(() => {
  const v = props.employee.staff_role_category as string
  return v ? (STAFF_ROLE_LABELS[v] || v) : '未填寫'
})
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="員工類型"><span :class="{ 'crisp-empty': !employee.employee_type }">{{ employeeTypeLabel }}</span></el-descriptions-item>
    <el-descriptions-item label="園內職務"><span :class="{ 'crisp-empty': !employee.position }">{{ employee.position || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="到職日"><span :class="{ 'crisp-empty': !employee.hire_date }">{{ employee.hire_date || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="試用期結束"><span :class="{ 'crisp-empty': !employee.probation_end_date }">{{ employee.probation_end_date || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="主管職">
      <el-tag v-if="employee.supervisor_role" size="small">{{ employee.supervisor_role }}</el-tag>
      <span v-else class="crisp-empty">未填寫</span>
    </el-descriptions-item>
    <el-descriptions-item label="班級"><span :class="{ 'crisp-empty': !employee.classroom_name }">{{ employee.classroom_name || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="教保身分別"><span :class="{ 'crisp-empty': !employee.staff_role_category }">{{ staffRoleLabel }}</span></el-descriptions-item>
    <el-descriptions-item label="教師/教保員證號">
      <span :class="{ 'crisp-empty': !employee.teacher_cert_no }">{{ employee.teacher_cert_no || '未填寫' }}</span><span v-if="employee.teacher_cert_type">（{{ employee.teacher_cert_type }}）</span>
    </el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_date" label="離職日">{{ employee.resign_date }}</el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_reason" label="離職原因">{{ employee.resign_reason }}</el-descriptions-item>
  </el-descriptions>
</template>

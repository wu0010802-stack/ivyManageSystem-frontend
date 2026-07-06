<script setup lang="ts">
import { computed } from 'vue'
import { maskedMoney, insuranceLevelDisplay, pensionSelfRatePct, bankInfoDisplay } from '@/utils/employeeDisplay'

const props = withDefaults(defineProps<{
  employee: Record<string, unknown>
  standardSalary?: number | null
}>(), { standardSalary: null })

const isHourly = computed(() => props.employee.employee_type === 'hourly')
const baseSalaryNum = computed(() => {
  const v = props.employee.base_salary
  return v === null || v === undefined ? null : Number(v)
})

const FLAG_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['no_employment_insurance', '免就保'],
  ['health_exempt', '健保豁免'],
  ['skip_payroll_bonuses', '不發獎金'],
  ['skip_payroll_transfer', '不入轉帳名冊'],
  ['unreported_for_tax', '不入稅報'],
  ['bypass_standard_base', '個人合約底薪'],
]
const activeFlags = computed(() =>
  FLAG_LABELS.filter(([key]) => Boolean(props.employee[key])).map(([, label]) => label)
)

const hasSplitInsurance = computed(() =>
  props.employee.labor_insured_salary != null
  || props.employee.health_insured_salary != null
  || props.employee.pension_insured_salary != null
)
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item v-if="!isHourly" label="底薪">
      <span>{{ maskedMoney(employee.base_salary) }}</span>
      <template v-if="standardSalary !== null && baseSalaryNum !== null">
        <span class="std-hint">標準：{{ standardSalary.toLocaleString() }}</span>
        <el-tag
          v-if="baseSalaryNum !== standardSalary"
          size="small"
          :type="baseSalaryNum > standardSalary ? 'success' : 'warning'"
          style="margin-left:6px"
        >{{ baseSalaryNum > standardSalary ? '↑ 高於標準' : '↓ 低於標準' }}</el-tag>
        <el-tag v-else size="small" type="info" style="margin-left:6px">符合標準</el-tag>
      </template>
    </el-descriptions-item>
    <el-descriptions-item v-else label="時薪">{{ maskedMoney(employee.hourly_rate) }}</el-descriptions-item>
    <el-descriptions-item label="投保級距">{{ insuranceLevelDisplay(employee.insurance_salary_level) }}</el-descriptions-item>
    <el-descriptions-item label="勞退自提">{{ pensionSelfRatePct(employee.pension_self_rate) }}</el-descriptions-item>
    <el-descriptions-item label="加保生效日">{{ employee.insurance_effective_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="銀行資訊" :span="2">{{ bankInfoDisplay(employee) }}</el-descriptions-item>
    <el-descriptions-item v-if="hasSplitInsurance" label="分項投保" :span="2">
      勞保 {{ maskedMoney(employee.labor_insured_salary ?? employee.insurance_salary_level) }}
      ・健保 {{ maskedMoney(employee.health_insured_salary ?? employee.insurance_salary_level) }}
      ・勞退 {{ maskedMoney(employee.pension_insured_salary ?? employee.insurance_salary_level) }}
    </el-descriptions-item>
    <el-descriptions-item v-if="activeFlags.length" label="特殊旗標" :span="2">
      <el-tag v-for="f in activeFlags" :key="f" size="small" type="warning" style="margin-right:6px">{{ f }}</el-tag>
    </el-descriptions-item>
  </el-descriptions>
</template>

<style scoped>
.std-hint { color: var(--text-tertiary); font-size: 12px; margin-left: 8px; }
</style>

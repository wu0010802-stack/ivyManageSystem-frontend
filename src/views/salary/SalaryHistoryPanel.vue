<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getHistory } from '@/api/salary'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { useEmployeeStore } from '@/stores/employee'
import { money } from '@/utils/format'
import { LineChart } from '@/composables/useChartJs'
import type { ChartOptions } from 'chart.js'
import SalaryHistoryDetail from './SalaryHistoryDetail.vue'
import type { PayslipDetail } from './salaryHistoryDetail'

interface HistoryRow {
  year: number
  month: number
  net_salary: number
  unused_leave_payout: number
  base_transfer_amount: number
  gross_salary: number
  base_salary: number
  total_bonus: number
  in_gross_bonus: number
  payslip_detail: PayslipDetail
  labor_insurance: number
  health_insurance: number
  attendance_deduction: number
  leave_deduction: number
  total_deduction: number
}

const employeeStore = useEmployeeStore()
const historyLoading = ref(false)
const selectedEmployeeId = ref<number | null>(null)
const historyMonths = ref(12)
const historyData = ref<HistoryRow[]>([])

// 防切員工/切區間 race：晚到的舊請求不得蓋掉新選取的資料（epoch 比對，
// 比照 useSalarySettlement.refresh 的 refreshEpoch 寫法）
let fetchEpoch = 0

const fetchHistory = async () => {
  if (!selectedEmployeeId.value) return
  const epoch = ++fetchEpoch
  historyLoading.value = true
  try {
    const response = await getHistory({ employee_id: selectedEmployeeId.value, months: historyMonths.value })
    if (epoch !== fetchEpoch) return // 已被更新的請求取代，捨棄結果
    historyData.value = (response.data as HistoryRow[]).reverse()
  } catch (e) {
    if (epoch !== fetchEpoch) return
    ElMessage.error(friendlyError('載入薪資歷史失敗', e))
  } finally {
    if (epoch === fetchEpoch) historyLoading.value = false
  }
}

watch(selectedEmployeeId, () => {
  if (selectedEmployeeId.value) fetchHistory()
})

watch(historyMonths, () => {
  if (selectedEmployeeId.value) fetchHistory()
})

const chartData = computed(() => {
  if (!historyData.value.length) return null
  return {
    labels: historyData.value.map(r => `${r.year}/${r.month}`),
    datasets: [
      {
        label: '實發金額',
        data: historyData.value.map(r => r.base_transfer_amount),
        borderColor: '#409eff',
        backgroundColor: 'rgba(64, 158, 255, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: '應發合計',
        data: historyData.value.map(r => r.gross_salary),
        borderColor: '#67c23a',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.3,
      },
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y?: number } }) =>
          `${ctx.dataset.label}: $${ctx.parsed.y?.toLocaleString() || 0}`
      }
    }
  },
  scales: {
    y: {
      beginAtZero: false,
      ticks: {
        callback: (val: number | string) => '$' + Number(val).toLocaleString()
      }
    }
  }
} as unknown as ChartOptions<'line'>

onMounted(() => {
  employeeStore.fetchEmployees()
})
</script>

<template>
  <div>
    <el-card class="control-panel">
      <div class="controls">
        <el-select
          v-model="selectedEmployeeId"
          placeholder="選擇員工"
          filterable
          style="width: 200px;"
        >
          <el-option
            v-for="emp in employeeStore.employees"
            :key="emp.id"
            :label="emp.name"
            :value="emp.id"
          />
        </el-select>
        <el-select v-model="historyMonths" style="width: 130px;">
          <el-option :value="6" label="最近 6 個月" />
          <el-option :value="12" label="最近 12 個月" />
          <el-option :value="24" label="最近 24 個月" />
        </el-select>
      </div>
    </el-card>

    <div v-if="historyData.length > 0" v-loading="historyLoading">
      <el-card class="chart-card" v-if="chartData">
        <div class="chart-container">
          <LineChart :data="chartData" :options="chartOptions" />
        </div>
      </el-card>

      <el-table :data="historyData" border style="width: 100%; margin-top: 20px;" stripe>
        <el-table-column type="expand">
          <template #default="scope">
            <SalaryHistoryDetail :detail="scope.row.payslip_detail" />
          </template>
        </el-table-column>
        <el-table-column label="年/月" width="90">
          <template #default="scope">{{ scope.row.year }}/{{ scope.row.month }}</template>
        </el-table-column>
        <el-table-column label="底薪" width="100">
          <template #default="scope">{{ money(scope.row.base_salary) }}</template>
        </el-table-column>
        <el-table-column label="獎金合計" width="110">
          <template #default="scope">{{ money(scope.row.in_gross_bonus) }}</template>
        </el-table-column>
        <el-table-column label="勞保" width="90">
          <template #default="scope">{{ money(scope.row.labor_insurance) }}</template>
        </el-table-column>
        <el-table-column label="健保" width="90">
          <template #default="scope">{{ money(scope.row.health_insurance) }}</template>
        </el-table-column>
        <el-table-column label="考勤扣款" width="100">
          <template #default="scope">{{ money(scope.row.attendance_deduction) }}</template>
        </el-table-column>
        <el-table-column label="請假扣款" width="100">
          <template #default="scope">{{ money(scope.row.leave_deduction) }}</template>
        </el-table-column>
        <el-table-column label="應發" width="110">
          <template #default="scope">{{ money(scope.row.gross_salary) }}</template>
        </el-table-column>
        <el-table-column label="扣款" width="100">
          <template #default="scope">{{ money(scope.row.total_deduction) }}</template>
        </el-table-column>
        <el-table-column label="實發" width="120">
          <template #default="scope">
            <strong>{{ money(scope.row.base_transfer_amount) }}</strong>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-empty v-else-if="selectedEmployeeId && !historyLoading" description="無歷史薪資記錄" />
    <el-empty v-else-if="!selectedEmployeeId" description="請選擇員工查看薪資歷史" />
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-5);
}
.controls {
  display: flex;
  gap: 15px;
  align-items: center;
}
.chart-card {
  margin-top: var(--space-5);
}
.chart-container {
  height: 350px;
  position: relative;
}
</style>

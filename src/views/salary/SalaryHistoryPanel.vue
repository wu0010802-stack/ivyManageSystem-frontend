<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTitle, Tooltip, Legend, Filler)

const employeeStore = useEmployeeStore()
const historyLoading = ref(false)
const selectedEmployeeId = ref(null)
const historyMonths = ref(12)
const historyData = ref([])

const fetchHistory = async () => {
  if (!selectedEmployeeId.value) return
  historyLoading.value = true
  try {
    const response = await api.get(`/salaries/history?employee_id=${selectedEmployeeId.value}&months=${historyMonths.value}`)
    historyData.value = response.data.reverse()
  } catch (error) {
    ElMessage.error('載入歷史資料失敗')
  } finally {
    historyLoading.value = false
  }
}

watch(selectedEmployeeId, () => {
  if (selectedEmployeeId.value) fetchHistory()
})

watch(historyMonths, () => {
  if (selectedEmployeeId.value) fetchHistory()
})

const money = (val) => {
  if (!val && val !== 0) return '-'
  return '$' + Number(val).toLocaleString()
}

const chartData = computed(() => {
  if (!historyData.value.length) return null
  return {
    labels: historyData.value.map(r => `${r.year}/${r.month}`),
    datasets: [
      {
        label: '實發金額',
        data: historyData.value.map(r => r.net_salary),
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
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y?.toLocaleString() || 0}`
      }
    }
  },
  scales: {
    y: {
      beginAtZero: false,
      ticks: {
        callback: (val) => '$' + val.toLocaleString()
      }
    }
  }
}

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
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </el-card>

      <el-table :data="historyData" border style="width: 100%; margin-top: 20px;" stripe>
        <el-table-column label="年/月" width="90">
          <template #default="scope">{{ scope.row.year }}/{{ scope.row.month }}</template>
        </el-table-column>
        <el-table-column label="底薪" width="100">
          <template #default="scope">{{ money(scope.row.base_salary) }}</template>
        </el-table-column>
        <el-table-column label="津貼" width="100">
          <template #default="scope">{{ money(scope.row.total_allowances) }}</template>
        </el-table-column>
        <el-table-column label="獎金" width="100">
          <template #default="scope">{{ money(scope.row.total_bonus) }}</template>
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
        <el-table-column label="應發" width="110">
          <template #default="scope">{{ money(scope.row.gross_salary) }}</template>
        </el-table-column>
        <el-table-column label="扣款" width="100">
          <template #default="scope">{{ money(scope.row.total_deduction) }}</template>
        </el-table-column>
        <el-table-column label="實發" width="120">
          <template #default="scope">
            <strong>{{ money(scope.row.net_salary) }}</strong>
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

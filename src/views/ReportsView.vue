<script setup>
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

// Chart.js + vue-chartjs 延遲載入：僅在此頁面實際渲染時才下載
let _chartReady = null
const ensureChartReady = () => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, PointElement, LineElement,
      BarElement, Title, Tooltip, Legend, Filler,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, PointElement, LineElement,
        BarElement, Title, Tooltip, Legend, Filler,
      )
    })
  }
  return _chartReady
}

const Line = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line))
)
const Bar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const loading = ref(false)

const reportData = ref({
  attendance_monthly: [],
  attendance_by_classroom: [],
  leave_monthly: [],
  salary_monthly: [],
})

const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const fetchReport = async () => {
  loading.value = true
  try {
    const res = await api.get('/reports/dashboard', { params: { year: selectedYear.value } })
    reportData.value = res.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入報表失敗')
  } finally {
    loading.value = false
  }
}

watch(selectedYear, fetchReport)
onMounted(fetchReport)

// ========= Summary Cards =========

const avgAttendanceRate = computed(() => {
  const data = reportData.value.attendance_monthly
  if (!data.length) return 0
  const sum = data.reduce((s, d) => s + d.rate, 0)
  return (sum / data.length).toFixed(1)
})

const totalLeaveDays = computed(() => {
  const data = reportData.value.leave_monthly
  const totalHours = data.reduce((s, d) => s + (d.total_hours || 0), 0)
  return (totalHours / 8).toFixed(1)
})

const totalSalaryExpense = computed(() => {
  return reportData.value.salary_monthly.reduce((s, d) => s + (d.total_gross || 0), 0)
})

const avgMonthlySalary = computed(() => {
  const data = reportData.value.salary_monthly.filter(d => d.employee_count > 0)
  if (!data.length) return 0
  const total = data.reduce((s, d) => s + d.total_gross, 0)
  const avgEmployees = data.reduce((s, d) => s + d.employee_count, 0) / data.length
  return avgEmployees > 0 ? Math.round(total / data.length / avgEmployees) : 0
})

const money = (val) => {
  if (!val && val !== 0) return '$0'
  return '$' + Number(Math.round(val)).toLocaleString()
}

// ========= Chart 1: Attendance Trend =========

const attendanceChartData = computed(() => {
  const monthMap = {}
  reportData.value.attendance_monthly.forEach(d => { monthMap[d.month] = d })

  const rates = []
  const lateCounts = []
  const missingCounts = []

  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d ? d.rate : null)
    lateCounts.push(d ? d.late : null)
    missingCounts.push(d ? d.missing : null)
  }

  return {
    labels: monthLabels,
    datasets: [
      {
        label: '出勤率 (%)',
        data: rates,
        borderColor: '#409EFF',
        backgroundColor: 'rgba(64, 158, 255, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: '遲到次數',
        data: lateCounts,
        borderColor: '#E6A23C',
        backgroundColor: 'rgba(230, 162, 60, 0.1)',
        borderDash: [5, 5],
        tension: 0.3,
        yAxisID: 'y1',
      },
      {
        label: '缺卡次數',
        data: missingCounts,
        borderColor: '#F56C6C',
        backgroundColor: 'rgba(245, 108, 108, 0.1)',
        borderDash: [3, 3],
        tension: 0.3,
        yAxisID: 'y1',
      },
    ],
  }
})

const attendanceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top' },
    title: { display: false },
  },
  scales: {
    y: {
      type: 'linear',
      position: 'left',
      min: 0,
      max: 100,
      title: { display: true, text: '出勤率 (%)' },
    },
    y1: {
      type: 'linear',
      position: 'right',
      min: 0,
      grid: { drawOnChartArea: false },
      title: { display: true, text: '次數' },
    },
  },
  spanGaps: true,
}

// ========= Chart 2: Classroom Attendance =========

const classroomChartData = computed(() => {
  const data = reportData.value.attendance_by_classroom
  const labels = data.map(d => d.classroom)
  const rates = data.map(d => d.rate)
  const colors = rates.map(r => r >= 95 ? '#67C23A' : r >= 90 ? '#E6A23C' : '#F56C6C')

  return {
    labels,
    datasets: [{
      label: '出勤率 (%)',
      data: rates,
      backgroundColor: colors,
      borderRadius: 4,
    }],
  }
})

const classroomChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      min: 0,
      max: 100,
      title: { display: true, text: '出勤率 (%)' },
    },
  },
}

// ========= Chart 3: Leave Trend =========

const leaveChartData = computed(() => {
  const data = reportData.value.leave_monthly

  const personal = data.map(d => d.personal || 0)
  const sick = data.map(d => d.sick || 0)
  const annual = data.map(d => d.annual || 0)
  const other = data.map(d => (d.menstrual || 0) + (d.maternity || 0) + (d.paternity || 0))

  return {
    labels: monthLabels,
    datasets: [
      { label: '事假', data: personal, backgroundColor: '#E6A23C', stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: '#409EFF', stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: '#67C23A', stack: 'leaves' },
      { label: '其他', data: other, backgroundColor: '#909399', stack: 'leaves' },
    ],
  }
})

const leaveChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
  },
  scales: {
    x: { stacked: true },
    y: {
      stacked: true,
      beginAtZero: true,
      title: { display: true, text: '次數' },
    },
  },
}

// ========= Chart 4: Salary Expenditure =========

const salaryChartData = computed(() => {
  const monthMap = {}
  reportData.value.salary_monthly.forEach(d => { monthMap[d.month] = d })

  const grossData = []
  const netData = []

  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    grossData.push(d ? d.total_gross : null)
    netData.push(d ? d.total_net : null)
  }

  return {
    labels: monthLabels,
    datasets: [
      {
        label: '應發總額',
        data: grossData,
        backgroundColor: 'rgba(64, 158, 255, 0.6)',
        borderColor: '#409EFF',
        borderWidth: 1,
        borderRadius: 4,
        order: 2,
      },
      {
        label: '實發總額',
        data: netData,
        type: 'line',
        borderColor: '#67C23A',
        backgroundColor: 'rgba(103, 194, 58, 0.1)',
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        order: 1,
      },
    ],
  }
})

const salaryChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const val = ctx.parsed.y
          return `${ctx.dataset.label}: $${val ? val.toLocaleString() : 0}`
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: '金額 (NTD)' },
      ticks: {
        callback: (val) => '$' + (val / 1000).toFixed(0) + 'k',
      },
    },
  },
  spanGaps: true,
}
</script>

<template>
  <div class="reports-page" v-loading="loading">
    <div class="page-header">
      <h2>報表統計</h2>
      <el-select v-model="selectedYear" style="width: 120px;">
        <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
      </el-select>
    </div>

    <!-- Summary Cards -->
    <el-row :gutter="16" class="summary-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-label">年度出勤率</div>
          <div class="summary-value" :class="{ 'text-green': avgAttendanceRate >= 95, 'text-orange': avgAttendanceRate >= 90 && avgAttendanceRate < 95, 'text-red': avgAttendanceRate < 90 }">
            {{ avgAttendanceRate }}%
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-label">年度請假總天數</div>
          <div class="summary-value">{{ totalLeaveDays }} 天</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-label">年度薪資總支出</div>
          <div class="summary-value text-blue">{{ money(totalSalaryExpense) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card">
          <div class="summary-label">平均月薪</div>
          <div class="summary-value">{{ money(avgMonthlySalary) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts Grid -->
    <el-row :gutter="16">
      <!-- Chart 1: Attendance Trend -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="chart-title">月度出勤率趨勢</span>
          </template>
          <div class="chart-container">
            <Line :data="attendanceChartData" :options="attendanceChartOptions" />
          </div>
        </el-card>
      </el-col>

      <!-- Chart 2: Classroom Attendance -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="chart-title">各班級出勤統計</span>
          </template>
          <div class="chart-container">
            <Bar
              v-if="reportData.attendance_by_classroom.length > 0"
              :data="classroomChartData"
              :options="classroomChartOptions"
            />
            <el-empty v-else description="無班級出勤資料" :image-size="60" />
          </div>
        </el-card>
      </el-col>

      <!-- Chart 3: Leave Trend -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="chart-title">請假趨勢分析</span>
          </template>
          <div class="chart-container">
            <Bar :data="leaveChartData" :options="leaveChartOptions" />
          </div>
        </el-card>
      </el-col>

      <!-- Chart 4: Salary Expenditure -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="chart-title">薪資支出月度比較</span>
          </template>
          <div class="chart-container">
            <Bar :data="salaryChartData" :options="salaryChartOptions" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.reports-page {
  padding: 0;
}

.summary-row {
  margin-bottom: var(--space-5);
}

.summary-card {
  text-align: center;
  padding: 8px 0;
}

.summary-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.text-green { color: var(--color-success); }
.text-orange { color: var(--color-warning); }
.text-red { color: var(--color-danger); }
.text-blue { color: #409EFF; }

.chart-card {
  margin-bottom: var(--space-4);
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-container {
  height: 320px;
  position: relative;
}
</style>

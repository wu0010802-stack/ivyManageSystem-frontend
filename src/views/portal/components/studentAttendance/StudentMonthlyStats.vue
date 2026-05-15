<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps({
  data: { type: Object, default: null },   // monthlyData
  monthPicker: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:monthPicker', 'export-csv'])

// 4 個 summary 卡（對齊原 view summaryCards computed）
const summaryCards = computed(() => {
  if (!props.data) return []
  const alerts = props.data.alerts ?? []
  return [
    { label: '班級出席率', value: `${props.data.classroom_attendance_rate}%`, tone: 'success' },
    { label: '點名完成率', value: `${props.data.classroom_record_completion_rate}%`, tone: 'primary' },
    { label: '應點名上課日', value: `${props.data.school_days_count} 天`, tone: 'warning' },
    { label: '連缺告警', value: `${alerts.length} 人`, tone: alerts.length ? 'danger' : 'info' },
  ]
})

const monthlyStudents = computed(() => props.data?.students ?? [])
const alertStudents = computed(() => props.data?.alerts ?? [])

// Bar chart：X = 學生姓名，Y = 出席率（對齊原 view chartData computed）
const chartData = computed(() => {
  if (!monthlyStudents.value.length) return null
  return {
    labels: monthlyStudents.value.map((s) => s.name),
    datasets: [
      {
        label: '出席率',
        data: monthlyStudents.value.map((s) => s.attendance_rate),
        backgroundColor: '#2f855a',
        borderRadius: 6,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context) => `${context.raw}%`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value) => `${value}%`,
      },
    },
  },
}
</script>

<template>
  <div class="monthly-stats" v-loading="loading">
    <div class="stats-header">
      <el-date-picker
        :model-value="monthPicker"
        type="month"
        value-format="YYYY-MM"
        placeholder="選擇月份"
        :clearable="false"
        @update:model-value="emit('update:monthPicker', $event)"
      />
      <el-button size="small" @click="emit('export-csv')">匯出 CSV</el-button>
    </div>

    <div v-if="!data" class="empty-state">尚未載入月度資料</div>

    <template v-else>
      <!-- Summary cards -->
      <div class="summary-grid">
        <el-card
          v-for="card in summaryCards"
          :key="card.label"
          class="summary-card"
          shadow="hover"
        >
          <div class="summary-label">{{ card.label }}</div>
          <div class="summary-value" :class="`is-${card.tone}`">{{ card.value }}</div>
        </el-card>
      </div>

      <!-- Bar chart per student -->
      <el-card class="chart-card" shadow="never">
        <template #header>
          <div class="card-title">
            {{ data.classroom_name }} {{ data.year }} 年 {{ data.month }} 月出席率
          </div>
        </template>
        <div class="chart-container">
          <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
        </div>
      </el-card>

      <!-- Alert section -->
      <el-card class="alert-card" shadow="never">
        <template #header>
          <div class="card-title">異常告警</div>
        </template>
        <div v-if="alertStudents.length" class="alert-list">
          <el-tag
            v-for="student in alertStudents"
            :key="student.student_id"
            type="danger"
            effect="dark"
          >
            {{ student.name }} 連缺 {{ student.longest_absence_streak }} 天
          </el-tag>
        </div>
        <el-empty v-else description="本月沒有連續缺席告警" :image-size="60" />
      </el-card>

      <!-- Student monthly detail table -->
      <el-table :data="monthlyStudents" stripe size="small" border>
        <el-table-column label="學號" width="90" prop="student_no" />
        <el-table-column label="姓名" width="100" prop="name" />
        <el-table-column label="出席率" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.attendance_rate >= 90 ? 'success' : row.attendance_rate >= 75 ? 'warning' : 'danger'"
            >
              {{ row.attendance_rate }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="應點名日" width="90" align="center" prop="school_days" />
        <el-table-column label="出席" width="70" align="center" prop="出席" />
        <el-table-column label="缺席" width="70" align="center" prop="缺席" />
        <el-table-column label="病假" width="70" align="center" prop="病假" />
        <el-table-column label="事假" width="70" align="center" prop="事假" />
        <el-table-column label="遲到" width="70" align="center" prop="遲到" />
        <el-table-column label="未點名" width="80" align="center" prop="未點名" />
        <el-table-column label="最長連缺" width="100" align="center">
          <template #default="{ row }">{{ row.longest_absence_streak }} 天</template>
        </el-table-column>
        <el-table-column label="異常" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="row.absence_alert" type="danger">連缺告警</el-tag>
            <span v-else style="color: var(--text-tertiary)">正常</span>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.monthly-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.stats-header {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  flex-wrap: wrap;
}

.empty-state {
  text-align: center;
  padding: var(--space-6, 24px);
  color: var(--pt-text-muted, #9ca3af);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.summary-card {
  border-radius: 16px;
}

.summary-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.summary-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
}

.summary-value.is-success { color: #166534; }
.summary-value.is-primary { color: var(--color-info-darker); }
.summary-value.is-warning { color: var(--color-warning-darker); }
.summary-value.is-danger  { color: var(--color-danger-darker); }
.summary-value.is-info    { color: var(--neutral-600); }

.chart-card,
.alert-card {
  margin-top: 0;
}

.card-title {
  font-weight: 600;
}

.chart-container {
  height: 280px;
}

.alert-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>

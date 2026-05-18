<template>
  <div class="churn-panel">
    <!-- 上半：當前 at-risk list -->
    <el-card v-loading="riskLoading" class="risk-card">
      <template #header>
        <div class="card-header">
          <span>當前 at-risk 學生</span>
          <el-button size="small" :loading="riskLoading" @click="loadAtRisk">重新整理</el-button>
        </div>
      </template>
      <el-empty v-if="!riskList.length" description="目前無預警" />
      <el-table v-else :data="riskList" stripe>
        <el-table-column prop="student_name" label="學生" width="140" />
        <el-table-column prop="classroom_name" label="班級" width="120" />
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ statusLabel(row.lifecycle_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="嚴重度" width="100">
          <template #default="{ row }">
            <el-tag :type="severityType(row.primary_severity)" size="small">
              {{ severityLabel(row.primary_severity) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="觸發訊號">
          <template #default="{ row }">
            <div v-for="(sig, idx) in row.signals" :key="idx" class="signal">
              <el-tag :type="severityType(sig.severity)" size="small" effect="plain">
                {{ signalTypeLabel(sig.type) }}
              </el-tag>
              <span class="signal-detail">{{ sig.detail }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" link
                       @click="goToStudent(row.student_id)">
              指派追蹤
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 下半：歷史趨勢 -->
    <el-row :gutter="12" class="row">
      <el-col :span="14">
        <el-card v-loading="historyLoading">
          <template #header>過去 12 月流失趨勢</template>
          <div class="chart-wrap">
            <LineChart v-if="hasTrend" :data="trendChartData" :options="trendOptions" />
            <el-empty v-else description="尚無資料" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card v-loading="historyLoading">
          <template #header>流失原因分布</template>
          <div class="chart-wrap">
            <BarChart v-if="hasReasons" :data="reasonChartData" :options="reasonOptions" />
            <el-empty v-else description="尚無資料" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { BarChart, LineChart } from '@/views/reports/chartSetup'
import { fetchAtRisk, fetchChurnHistory } from '@/api/analytics'
import { apiError } from '@/utils/error'

const router = useRouter()
interface ChurnHistory {
  monthly?: Array<{ year: number; month: number; withdrawn: number; transferred: number }>
  by_reason?: Array<{ reason: string; count: number }>
}
const riskLoading = ref(false)
const historyLoading = ref(false)
const riskList = ref<unknown[]>([])
const history = ref<ChurnHistory | null>(null)

const statusLabel = (s: string) => (({
  active: '在學', on_leave: '休學中',
} as Record<string, string>)[s] || s)

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const severityType = (s: string): ElTagType => (({
  high: 'danger', medium: 'warning', low: 'info',
} as Record<string, ElTagType>)[s]) ?? 'info'

const severityLabel = (s: string) => (({
  high: '高', medium: '中', low: '低',
} as Record<string, string>)[s] || s)

const signalTypeLabel = (t: string) => (({
  consecutive_absence: '連續缺勤',
  long_on_leave: '長期休學',
  fee_overdue: '學費逾期',
} as Record<string, string>)[t] || t)

const loadAtRisk = async () => {
  riskLoading.value = true
  try {
    const r = await fetchAtRisk()
    riskList.value = r.data || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入預警失敗'))
  } finally {
    riskLoading.value = false
  }
}

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const r = await fetchChurnHistory(12)
    history.value = r.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入歷史失敗'))
  } finally {
    historyLoading.value = false
  }
}

const hasTrend = computed(() => (history.value?.monthly?.length || 0) > 0)
const trendChartData = computed(() => {
  const monthly = history.value?.monthly || []
  return {
    labels: monthly.map(m => `${m.year}/${String(m.month).padStart(2, '0')}`),
    datasets: [
      { label: '退學', data: monthly.map(m => m.withdrawn),
        borderColor: '#f56c6c', backgroundColor: '#f56c6c', tension: 0.3, fill: false },
      { label: '轉出', data: monthly.map(m => m.transferred),
        borderColor: '#e6a23c', backgroundColor: '#e6a23c', tension: 0.3, fill: false },
    ],
  }
})
const trendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
}

const hasReasons = computed(() => (history.value?.by_reason?.length || 0) > 0)
const reasonChartData = computed(() => {
  const rows = history.value?.by_reason || []
  return {
    labels: rows.map(r => r.reason),
    datasets: [{ label: '次數', data: rows.map(r => r.count), backgroundColor: '#409eff' }],
  }
})
const reasonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
}

const goToStudent = (id: number) => {
  router.push({ name: 'student-profile', params: { id } })
}

onMounted(() => {
  loadAtRisk()
  loadHistory()
})
</script>

<style scoped>
.churn-panel { padding-top: 8px; }
.risk-card { margin-bottom: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.signal { display: flex; gap: 6px; align-items: center; margin: 2px 0; flex-wrap: wrap; }
.signal-detail { color: var(--text-secondary); font-size: 13px; }
.row { margin-top: 0; }
.chart-wrap { position: relative; height: 240px; }
</style>

<template>
  <div class="funnel-panel">
    <el-card class="filter-card">
      <div class="filters">
        <el-select v-model="presetValue" @change="onPresetChange" style="width: 120px">
          <el-option v-for="p in timeRange.presets" :key="p.value"
                     :value="p.value" :label="p.label" />
        </el-select>
        <el-date-picker v-if="presetValue === 'custom'"
                        v-model="customRange" type="daterange"
                        value-format="YYYY-MM-DD"
                        @change="onCustomChange" />
        <el-input v-model="gradeFilter" placeholder="班別（可空）" clearable
                  style="width: 140px" @change="reload" />
        <el-input v-model="sourceFilter" placeholder="來源（可空）" clearable
                  style="width: 140px" @change="reload" />
        <el-button type="primary" :loading="loading" @click="reload">查詢</el-button>
      </div>
    </el-card>

    <el-row :gutter="12" class="row">
      <el-col :span="14">
        <el-card v-loading="loading">
          <template #header>6 階段漏斗</template>
          <div class="chart-wrap">
            <BarChart v-if="data" :data="funnelChartData" :options="funnelChartOptions" />
            <el-empty v-else description="尚無資料" />
          </div>
          <ul class="stage-meta">
            <li v-for="s in (data?.stages || [])" :key="s.key">
              <strong>{{ s.label }}：</strong>{{ s.count }}
              <span v-if="s.rate_from_prev !== null" class="rate">
                （轉換率 {{ (s.rate_from_prev * 100).toFixed(1) }}%）
              </span>
            </li>
          </ul>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card v-loading="loading">
          <template #header>未預繳原因分布</template>
          <div class="chart-wrap small">
            <PieChart v-if="hasReasons" :data="reasonChartData" :options="pieOptions" />
            <el-empty v-else description="尚無資料" />
          </div>
        </el-card>
        <el-card v-loading="loading" class="mt">
          <template #header>
            <div class="slice-header">
              <span>依切片</span>
              <el-radio-group v-model="sliceMode" size="small">
                <el-radio-button value="source">來源</el-radio-button>
                <el-radio-button value="grade">班別</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-wrap small">
            <BarChart v-if="hasSlice" :data="sliceChartData" :options="sliceOptions" />
            <el-empty v-else description="尚無資料" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { BarChart, PieChart } from '@/views/reports/chartSetup'
import { fetchFunnel } from '@/api/analytics'
import { useAnalyticsTimeRange } from '@/composables/useAnalyticsTimeRange'
import { apiError } from '@/utils/error'

const timeRange = useAnalyticsTimeRange('this_term')
const presetValue = ref(timeRange.preset.value)
const customRange = ref([])
const gradeFilter = ref('')
const sourceFilter = ref('')
const loading = ref(false)
const data = ref(null)
const sliceMode = ref('source')

const onPresetChange = (v) => {
  timeRange.applyPreset(v)
  if (v !== 'custom') reload()
}
const onCustomChange = (range) => {
  if (!range || range.length !== 2) return
  timeRange.applyCustom(range[0], range[1])
  reload()
}

const reload = async () => {
  loading.value = true
  try {
    const res = await fetchFunnel({
      start: timeRange.start.value,
      end: timeRange.end.value,
      grade: gradeFilter.value || undefined,
      source: sourceFilter.value || undefined,
    })
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入漏斗失敗'))
  } finally {
    loading.value = false
  }
}

const COLORS = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#9B59B6']

const funnelChartData = computed(() => ({
  labels: (data.value?.stages || []).map(s => s.label),
  datasets: [{
    label: '人數',
    data: (data.value?.stages || []).map(s => s.count),
    backgroundColor: '#409EFF',
  }],
}))

const funnelChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
}

const hasReasons = computed(() => (data.value?.no_deposit_reasons?.length || 0) > 0)
const reasonChartData = computed(() => {
  const reasons = data.value?.no_deposit_reasons || []
  return {
    labels: reasons.map(r => r.reason),
    datasets: [{ data: reasons.map(r => r.count), backgroundColor: COLORS }],
  }
})
const pieOptions = { responsive: true, maintainAspectRatio: false }

const hasSlice = computed(() => {
  const rows = sliceMode.value === 'source' ? data.value?.by_source : data.value?.by_grade
  return (rows?.length || 0) > 0
})
const sliceChartData = computed(() => {
  const rows = (sliceMode.value === 'source' ? data.value?.by_source : data.value?.by_grade) || []
  const key = sliceMode.value
  return {
    labels: rows.map(r => r[key] || '—'),
    datasets: [
      { label: '線索', data: rows.map(r => r.lead), backgroundColor: '#409EFF' },
      { label: '報名', data: rows.map(r => r.enrolled), backgroundColor: '#67C23A' },
    ],
  }
})
const sliceOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
}

watch(() => timeRange.preset.value, (v) => { presetValue.value = v })
onMounted(reload)
</script>

<style scoped>
.funnel-panel { padding-top: 8px; }
.filter-card { margin-bottom: 12px; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row { margin-top: 0; }
.chart-wrap { position: relative; height: 280px; }
.chart-wrap.small { height: 200px; }
.stage-meta { margin: 8px 0 0; padding-left: 18px; line-height: 1.8; font-size: 14px; }
.stage-meta .rate { color: #909399; }
.mt { margin-top: 12px; }
.slice-header { display: flex; justify-content: space-between; align-items: center; }
</style>

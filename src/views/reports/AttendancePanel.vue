<script setup>
import { computed, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard } from '@/api/reports'
import { LineChart, BarChart, MONTH_LABELS } from './chartSetup.js'
import AttendanceDetailDialog from './AttendanceDetailDialog.vue'

const props = defineProps({
  year: { type: Number, required: true },
})

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => dashboard.refresh(false))

const data = computed(() => dashboard.data.value || {
  attendance_monthly: [],
  attendance_by_classroom: [],
  leave_monthly: [],
})

// 班級多選 filter（client-side）
const selectedClassrooms = ref([])
const classroomOptions = computed(() =>
  (data.value.attendance_by_classroom || []).map(d => ({
    id: d.classroom_id,
    name: d.classroom,
  })),
)

// drill-down dialog state
const detailDialog = ref({
  visible: false,
  month: null,
  classroomId: null,
  classroomName: null,
})

function openMonthDetail(monthIdx) {
  detailDialog.value = {
    visible: true,
    month: monthIdx + 1,
    classroomId: null,
    classroomName: null,
  }
}

function openClassroomDetail(arrIdx) {
  const arr = filteredClassroomData.value._rawData
  if (!arr || arrIdx >= arr.length) return
  const row = arr[arrIdx]
  detailDialog.value = {
    visible: true,
    month: null,
    classroomId: row.classroom_id,
    classroomName: row.classroom,
  }
}

const attendanceChartData = computed(() => {
  const monthMap = {}
  ;(data.value.attendance_monthly || []).forEach(d => { monthMap[d.month] = d })
  const rates = [], late = [], early = [], miss = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d ? d.rate : null)
    late.push(d ? d.late : null)
    early.push(d ? d.early_leave : null)
    miss.push(d ? d.missing : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '出勤率 (%)', data: rates, borderColor: '#409EFF', backgroundColor: 'rgba(64,158,255,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
      { label: '遲到次數', data: late, borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' },
      { label: '早退次數', data: early, borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', borderDash: [4, 4], tension: 0.3, yAxisID: 'y1' },
      { label: '缺卡次數', data: miss, borderColor: '#F56C6C', backgroundColor: 'rgba(245,108,108,0.1)', borderDash: [3, 3], tension: 0.3, yAxisID: 'y1' },
    ],
  }
})

const attendanceChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'top' }, title: { display: false } },
  scales: {
    y: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } },
    y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '次數' } },
  },
  spanGaps: true,
  onClick: (e, elements) => {
    if (!elements.length) return
    openMonthDetail(elements[0].index)
  },
}))

// 班級長條圖：套用 client-side filter
const filteredClassroomData = computed(() => {
  const arr = data.value.attendance_by_classroom || []
  const filtered = selectedClassrooms.value.length === 0
    ? arr
    : arr.filter(d => selectedClassrooms.value.includes(d.classroom_id))
  const labels = filtered.map(d => d.classroom)
  const rates = filtered.map(d => d.rate)
  const colors = rates.map(r => r >= 95 ? '#67C23A' : r >= 90 ? '#E6A23C' : '#F56C6C')
  return {
    labels,
    datasets: [{ label: '出勤率 (%)', data: rates, backgroundColor: colors, borderRadius: 4 }],
    _rawData: filtered,
  }
})

const classroomChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } } },
  onClick: (e, elements) => {
    if (!elements.length) return
    openClassroomDetail(elements[0].index)
  },
}))

const leaveChartData = computed(() => {
  const arr = data.value.leave_monthly || []
  const personal = arr.map(d => d.personal || 0)
  const sick = arr.map(d => d.sick || 0)
  const annual = arr.map(d => d.annual || 0)
  const other = arr.map(d => (d.menstrual || 0) + (d.maternity || 0) + (d.paternity || 0))
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '事假', data: personal, backgroundColor: '#E6A23C', stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: '#409EFF', stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: '#67C23A', stack: 'leaves' },
      { label: '其他', data: other, backgroundColor: '#909399', stack: 'leaves' },
    ],
  }
})

const leaveChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '次數' } } },
}
</script>

<template>
  <el-skeleton v-if="dashboard.pending.value && !dashboard.data.value" :rows="8" animated />
  <div v-else>
    <div class="filter-bar">
      <el-select
        v-model="selectedClassrooms"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="選擇班級（不選 = 全部）"
        style="width: 320px;"
      >
        <el-option
          v-for="opt in classroomOptions"
          :key="opt.id"
          :label="opt.name"
          :value="opt.id"
        />
      </el-select>
      <span class="filter-hint">此 filter 只影響右下「各班級出勤統計」圖</span>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">月度出勤率趨勢（點擊長條開明細）</span></template>
          <div class="chart-container"><LineChart :data="attendanceChartData" :options="attendanceChartOptions" /></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">各班級出勤統計（點擊長條開明細）</span></template>
          <div class="chart-container">
            <BarChart v-if="filteredClassroomData._rawData?.length" :data="filteredClassroomData" :options="classroomChartOptions" />
            <el-empty v-else description="無班級出勤資料" :image-size="60" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">請假趨勢分析</span></template>
          <div class="chart-container"><BarChart :data="leaveChartData" :options="leaveChartOptions" /></div>
        </el-card>
      </el-col>
    </el-row>

    <AttendanceDetailDialog
      v-model="detailDialog.visible"
      :year="year"
      :month="detailDialog.month"
      :classroom-id="detailDialog.classroomId"
      :classroom-name="detailDialog.classroomName"
    />
  </div>
</template>

<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; cursor: pointer; }
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.filter-hint {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>

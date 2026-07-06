<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard } from '@/api/reports'
import { LineChart, BarChart, MONTH_LABELS } from './chartSetup'
import AttendanceDetailDialog from './AttendanceDetailDialog.vue'

const props = defineProps<{
  year: number
}>()

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
const selectedClassrooms = ref<number[]>([])
const classroomOptions = computed(() =>
  (data.value.attendance_by_classroom || []).map((d: { classroom_id: number; classroom: string }) => ({
    id: d.classroom_id,
    name: d.classroom,
  })),
)

// drill-down dialog state
const detailDialog = ref<{
  visible: boolean
  month: number | null
  classroomId: number | null
  classroomName: string | null
}>({
  visible: false,
  month: null,
  classroomId: null,
  classroomName: null,
})

function openMonthDetail(monthIdx: number) {
  detailDialog.value = {
    visible: true,
    month: monthIdx + 1,
    classroomId: null,
    classroomName: null,
  }
}

function openClassroomDetail(arrIdx: number) {
  const arr = filteredClassroomData.value._rawData as Array<{ classroom_id: number; classroom: string; rate: number }> | undefined
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
  const monthMap: Record<number, { rate?: number; late?: number; early_leave?: number; missing?: number }> = {}
  ;(data.value.attendance_monthly || []).forEach((d: { month: number; rate?: number; late?: number; early_leave?: number; missing?: number }) => { monthMap[d.month] = d })
  const rates: (number | null)[] = []
  const late: (number | null)[] = []
  const early: (number | null)[] = []
  const miss: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d?.rate ?? null)
    late.push(d?.late ?? null)
    early.push(d?.early_leave ?? null)
    miss.push(d?.missing ?? null)
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
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { position: 'top' as const }, title: { display: false } },
  scales: {
    y: { type: 'linear' as const, position: 'left' as const, min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } },
    y1: { type: 'linear' as const, position: 'right' as const, min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '次數' } },
  },
  spanGaps: true,
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (!elements.length) return
    openMonthDetail(elements[0].index)
  },
}))

// 班級長條圖：套用 client-side filter
const filteredClassroomData = computed(() => {
  const arr = (data.value.attendance_by_classroom || []) as Array<{ classroom_id: number; classroom: string; rate: number }>
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
  responsive: true, maintainAspectRatio: false, indexAxis: 'y' as const,
  plugins: { legend: { display: false } },
  scales: { x: { min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } } },
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (!elements.length) return
    openClassroomDetail(elements[0].index)
  },
}))

const leaveChartData = computed(() => {
  // 依月份鍵值取值（防禦性）：後端 `_query_leave_monthly` 已保證回傳固定 12 筆
  // 密集陣列，但那是隱性契約；比照上面 attendanceChartData 建 monthMap，
  // 避免未來後端回傳稀疏陣列時前端按 index 對錯月份（2026-07-05 稽核 P3-3）。
  const arr = (data.value.leave_monthly || []) as Array<{ month: number; personal?: number; sick?: number; annual?: number; menstrual?: number; maternity?: number; paternity?: number }>
  const monthMap: Record<number, typeof arr[number]> = {}
  arr.forEach(d => { monthMap[d.month] = d })
  const personal: number[] = []
  const sick: number[] = []
  const annual: number[] = []
  const other: number[] = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    personal.push(d?.personal || 0)
    sick.push(d?.sick || 0)
    annual.push(d?.annual || 0)
    other.push((d?.menstrual || 0) + (d?.maternity || 0) + (d?.paternity || 0))
  }
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
  plugins: { legend: { position: 'top' as const } },
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

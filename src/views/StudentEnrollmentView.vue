<template>
  <div class="enrollment-view">
    <div class="page-header">
      <h2>幼生在籍統計</h2>
      <div class="header-actions">
        <el-select
          v-model="selectedTerm"
          placeholder="選擇學年學期"
          style="width: 200px"
          @change="onTermChange"
        >
          <el-option
            v-for="opt in termOptions"
            :key="`${opt.school_year}-${opt.semester}`"
            :label="opt.label"
            :value="`${opt.school_year}-${opt.semester}`"
          />
        </el-select>
        <el-button :icon="RefreshRight" :loading="loading" @click="onRefresh">重新整理</el-button>
        <el-button v-if="activeTab === 'roster'" :icon="Printer" @click="printRoster">列印</el-button>
      </div>
    </div>

    <div v-if="stats" class="page-meta">
      <span>{{ stats.school_year > 1911 ? stats.school_year - 1911 : stats.school_year }} 學年度 · {{ stats.semester_label }}</span>
      <span v-if="stats.summary?.total != null" class="meta-sep">|</span>
      <span v-if="stats.summary?.total != null">在籍 {{ stats.summary.total }} 人</span>
    </div>

    <el-tabs v-model="activeTab" @tab-click="onTabClick" class="enrollment-tabs">
      <!-- ============ Tab 1：統計圖表 ============ -->
      <el-tab-pane label="統計圖表" name="stats">
        <!-- Summary cards -->
        <el-row :gutter="16" class="summary-cards">
          <el-col :xs="12" :sm="6" v-for="card in summaryCards" :key="card.key">
            <el-card class="summary-card" shadow="never">
              <template v-if="loading && stats == null">
                <el-skeleton :rows="2" animated />
              </template>
              <template v-else>
                <div class="card-label">{{ card.label }}</div>
                <div class="card-value">{{ card.value }}</div>
                <div class="card-sub">{{ card.sub }}</div>
              </template>
            </el-card>
          </el-col>
        </el-row>

        <!-- Statistics table -->
        <el-card class="table-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span class="card-header-title">各班在籍人數表</span>
              <span v-if="stats" class="card-header-meta">
                {{ stats.school_year > 1911 ? stats.school_year - 1911 : stats.school_year }} 學年度 · {{ stats.semester_label }}
              </span>
            </div>
          </template>
          <el-skeleton v-if="loading && !tableData.length" :rows="6" animated />
          <el-table
            v-else-if="tableData.length"
            :data="tableData"
            border
            stripe
            style="width: 100%"
            :span-method="spanMethod"
            :row-class-name="rowClassName"
            class="enrollment-table"
          >
            <el-table-column label="年級" prop="grade_name" width="120" align="center" />
            <el-table-column label="班級" prop="class_name" width="110" align="center" />
            <el-table-column label="男生" prop="male" width="90" align="center" />
            <el-table-column label="女生" prop="female" width="90" align="center" />
            <el-table-column label="合計" prop="total" width="90" align="center">
              <template #default="{ row }">
                <span class="num-total">{{ row.total }}</span>
              </template>
            </el-table-column>
            <el-table-column label="男女比例" min-width="180">
              <template #default="{ row }">
                <div v-if="row.total > 0" class="ratio-bar">
                  <div class="ratio-track">
                    <div class="ratio-male" :style="{ width: ratioPct(row.male, row.total) }" />
                    <div class="ratio-female" :style="{ width: ratioPct(row.female, row.total) }" />
                  </div>
                  <div class="ratio-text">
                    {{ ratioPct(row.male, row.total) }} / {{ ratioPct(row.female, row.total) }}
                  </div>
                </div>
                <span v-else class="ratio-empty">—</span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty
            v-else-if="!loading"
            description="此學期尚無在籍資料"
            :image-size="80"
          />
        </el-card>

        <!-- Charts -->
        <el-row :gutter="16" class="chart-row" v-if="stats?.by_grade?.length">
          <el-col :xs="24" :md="14">
            <el-card shadow="never" class="chart-card">
              <template #header>
                <div class="card-header-row">
                  <span class="card-header-title">各班人數（男 / 女堆疊）</span>
                  <span class="card-header-meta">共 {{ classCount }} 班</span>
                </div>
              </template>
              <div class="chart-wrapper">
                <component
                  :is="BarChart"
                  v-if="barChartData"
                  :data="barChartData"
                  :options="barChartOptions"
                />
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="10">
            <el-card shadow="never" class="chart-card">
              <template #header>
                <div class="card-header-row">
                  <span class="card-header-title">年級人數分布</span>
                  <span class="card-header-meta">{{ stats?.by_grade?.length ?? 0 }} 個年級</span>
                </div>
              </template>
              <div class="chart-wrapper">
                <component
                  :is="DoughnutChart"
                  v-if="doughnutChartData"
                  :data="doughnutChartData"
                  :options="doughnutChartOptions"
                />
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ============ Tab 2：在籍記錄表 ============ -->
      <el-tab-pane label="在籍記錄表" name="roster">
        <div v-loading="rosterLoading">
          <div v-if="roster">
            <EnrollmentRosterTable :roster="roster" />
          </div>
          <el-empty
            v-else-if="!rosterLoading"
            description="尚未載入在籍記錄表，點擊上方「重新整理」載入資料"
            :image-size="80"
          />
        </div>
      </el-tab-pane>

      <!-- ============ Tab 3：獎金達成 ============ -->
      <el-tab-pane v-if="showBonusTab" label="獎金達成" name="bonus">
        <BonusDashboard v-if="activeTab === 'bonus'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight, Printer } from '@element-plus/icons-vue'
import { getEnrollmentStats, getEnrollmentOptions, getEnrollmentRoster, getEnrollmentRosterPdf } from '@/api/studentEnrollment'
import { openPdfInNewTab } from '@/utils/printPdfWindow'
import { hasPermission } from '@/utils/auth'
import BonusDashboard from '@/components/enrollment/BonusDashboard.vue'

const showBonusTab = computed(() => hasPermission('SALARY_READ'))
import { useAcademicTermStore } from '@/stores/academicTerm'
import { apiError } from '@/utils/error'
import EnrollmentRosterTable from '@/components/enrollment/EnrollmentRosterTable.vue'

// --- Type interfaces ---
interface TermOption { school_year: number; semester: number; label: string }
interface GradeClassStat { class_name: string; male: number; female: number; total: number }
interface GradeStat { grade_name: string; male: number; female: number; total: number; classes: GradeClassStat[] }
interface EnrollmentSummary { total: number; male: number; female: number; class_count: number }
interface EnrollmentStats {
  school_year: number; semester: number; semester_label: string
  summary: EnrollmentSummary; by_grade: GradeStat[]
}

// Chart.js 延遲載入
let _chartReady: Promise<void> | null = null
const ensureChartReady = () => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement,
      ArcElement, Title, Tooltip, Legend,
    }) => {
      Chart.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)
    })
  }
  return _chartReady
}

const BarChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)
const DoughnutChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Doughnut))
)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface RosterStudent { name: string; status_tag?: string }
interface RosterClass { classroom_id: number; class_number: number; grade_name: string; class_name: string; head_teacher_name?: string | null; assistant_teacher_name?: string | null; art_teacher_name?: string | null; students: RosterStudent[]; total: number; old_count: number; new_count: number }
interface GradeSummary { grade_name: string; class_numbers: number[]; total: number; old_count: number; new_count: number }
interface RosterData { school_year: number; semester: number; generated_date: string; classes: RosterClass[]; grade_summaries: GradeSummary[]; grand_total: number; old_grand_total: number; new_grand_total: number; staff_by_role: Record<string, { name: string }[]> }

const termStore = useAcademicTermStore()
const loading = ref(false)
const rosterLoading = ref(false)
const stats = ref<EnrollmentStats | null>(null)
const roster = ref<RosterData | null>(null)
const termOptions = ref<TermOption[]>([])
const activeTab = ref('stats')

const selectedTerm = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val) => {
    const [sy, sem] = val.split('-').map(Number)
    termStore.setTerm(sy, sem)
  },
})

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
const fetchOptions = async () => {
  try {
    const res = await getEnrollmentOptions()
    termOptions.value = res.data as TermOption[]
    const key = selectedTerm.value
    const found = termOptions.value.some(
      (o) => `${o.school_year}-${o.semester}` === key,
    )
    if (!found && termOptions.value.length) {
      const first = termOptions.value[0]
      termStore.setTerm(first.school_year, first.semester)
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入學年選項失敗'))
  }
}

const termParams = () => ({
  school_year: termStore.school_year,
  semester: termStore.semester,
})

const fetchStats = async () => {
  loading.value = true
  try {
    const res = await getEnrollmentStats(termParams())
    stats.value = res.data as EnrollmentStats
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍統計失敗'))
  } finally {
    loading.value = false
  }
}

const fetchRoster = async () => {
  rosterLoading.value = true
  try {
    const res = await getEnrollmentRoster(termParams())
    roster.value = res.data as unknown as RosterData
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍記錄表失敗'))
  } finally {
    rosterLoading.value = false
  }
}

watch(selectedTerm, () => {
  roster.value = null
  if (activeTab.value === 'stats') fetchStats()
  else fetchRoster()
})

const onTermChange = () => {}

const onRefresh = () => {
  if (activeTab.value === 'stats') fetchStats()
  else fetchRoster()
}

const onTabClick = (pane: unknown) => {
  const tab = pane as { paneName?: string }
  if (tab.paneName === 'roster' && !roster.value) {
    fetchRoster()
  }
}

const printRoster = async () => {
  await openPdfInNewTab({
    fetchBlob: async () => {
      const res = await getEnrollmentRosterPdf(termParams())
      return res.data
    },
    loadingText: '在籍花名冊載入中…',
    onError: (err) => {
      ElMessage.error(apiError(err, '載入花名冊 PDF 失敗'))
    },
  })
}

onMounted(async () => {
  await fetchOptions()
  await fetchStats()
})

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------
const summaryCards = computed(() => {
  const s = stats.value?.summary
  const total = s?.total ?? 0
  const male = s?.male ?? 0
  const female = s?.female ?? 0
  const cls = s?.class_count ?? 0
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—')
  const avg = cls > 0 ? Math.round(total / cls) : null
  return [
    {
      key: 'total',
      label: '在籍總人數',
      value: s ? total : '—',
      sub: cls > 0 ? `分布於 ${cls} 個班級` : '尚無班級資料',
    },
    {
      key: 'male',
      label: '男生',
      value: s ? male : '—',
      sub: s ? `占全園 ${pct(male)}` : '—',
    },
    {
      key: 'female',
      label: '女生',
      value: s ? female : '—',
      sub: s ? `占全園 ${pct(female)}` : '—',
    },
    {
      key: 'class',
      label: '班級數',
      value: s ? cls : '—',
      sub: avg != null ? `平均 ${avg} 人 / 班` : '—',
    },
  ]
})

const classCount = computed(() => {
  if (!stats.value?.by_grade) return 0
  return stats.value.by_grade.reduce((s, g) => s + g.classes.length, 0)
})

const ratioPct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%')

// ---------------------------------------------------------------------------
// 表格資料（展開 + 年級小計 + 全園總計）
// ---------------------------------------------------------------------------
const tableData = computed(() => {
  if (!stats.value?.by_grade) return []
  const rows = []
  for (const grade of stats.value.by_grade) {
    for (const cls of grade.classes) {
      rows.push({
        type: 'class',
        grade_name: grade.grade_name,
        class_name: cls.class_name,
        male: cls.male,
        female: cls.female,
        total: cls.total,
        _gradeClassCount: grade.classes.length,
      })
    }
    rows.push({
      type: 'subtotal',
      grade_name: `${grade.grade_name}小計`,
      class_name: '',
      male: grade.male,
      female: grade.female,
      total: grade.total,
    })
  }
  rows.push({
    type: 'grand_total',
    grade_name: '全園總計',
    class_name: '',
    male: stats.value.summary.male,
    female: stats.value.summary.female,
    total: stats.value.summary.total,
  })
  return rows
})

const spanMethod = ({ row, rowIndex, columnIndex }: { row: Record<string, unknown>; rowIndex: number; columnIndex: number }) => {
  if (row.type === 'subtotal' || row.type === 'grand_total') {
    if (columnIndex === 0) return { rowspan: 1, colspan: 2 }
    if (columnIndex === 1) return { rowspan: 0, colspan: 0 }
    return undefined
  }
  if (columnIndex !== 0) return undefined
  if (row.type === 'class') {
    const gradeRows = tableData.value.filter(
      (r) => r.type === 'class' && r.grade_name === row.grade_name
    )
    const firstIdx = tableData.value.indexOf(gradeRows[0])
    if (rowIndex === firstIdx) {
      return { rowspan: row._gradeClassCount as number, colspan: 1 }
    } else {
      return { rowspan: 0, colspan: 0 }
    }
  }
  return undefined
}

const rowClassName = ({ row }: { row: Record<string, unknown> }) => {
  if (row.type === 'subtotal') return 'row-subtotal'
  if (row.type === 'grand_total') return 'row-grand-total'
  return ''
}

// ---------------------------------------------------------------------------
// 圖表色票（與 Element Plus 風格貼近的低飽和色）
// ---------------------------------------------------------------------------
const CHART_PALETTE = ['#409eff', '#67c23a', '#e6a23c', '#909399', '#f56c6c', '#a0cfff']

// ---------------------------------------------------------------------------
// 長條圖
// ---------------------------------------------------------------------------
const barChartData = computed(() => {
  if (!stats.value?.by_grade) return null
  const labels = []
  const maleData = []
  const femaleData = []
  for (const grade of stats.value.by_grade) {
    for (const cls of grade.classes) {
      labels.push(cls.class_name)
      maleData.push(cls.male)
      femaleData.push(cls.female)
    }
  }
  return {
    labels,
    datasets: [
      {
        label: '男生',
        data: maleData,
        backgroundColor: '#409eff',
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: '女生',
        data: femaleData,
        backgroundColor: '#f56c6c',
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }
})

const _barChartOptionsRaw = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { color: '#606266', font: { size: 11 } },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      ticks: { stepSize: 5, color: '#909399', font: { size: 11 } },
      grid: { color: 'rgba(220, 223, 230, 0.5)' },
    },
  },
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        color: '#303133',
        font: { size: 12 },
        padding: 12,
        boxWidth: 12,
        boxHeight: 12,
        usePointStyle: true,
        pointStyle: 'circle' as const,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(48, 49, 51, 0.92)',
      titleFont: { size: 12, weight: '600' as const },
      bodyFont: { size: 12 },
      padding: 10,
      cornerRadius: 4,
      displayColors: true,
    },
  },
}

const barChartOptions = _barChartOptionsRaw as unknown as Record<string, unknown>

// ---------------------------------------------------------------------------
// 圓餅圖
// ---------------------------------------------------------------------------
const doughnutChartData = computed(() => {
  if (!stats.value?.by_grade) return null
  return {
    labels: stats.value.by_grade.map(g => g.grade_name),
    datasets: [
      {
        data: stats.value.by_grade.map(g => g.total),
        backgroundColor: stats.value.by_grade.map((_: GradeStat, i: number) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  }
})

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '60%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#303133',
        font: { size: 12 },
        padding: 12,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'circle',
      },
    },
    tooltip: {
      backgroundColor: 'rgba(48, 49, 51, 0.92)',
      padding: 10,
      cornerRadius: 4,
      callbacks: {
        label: (ctx: { dataset: { data: number[] }; parsed: number; label: string }) => {
          const total = ctx.dataset.data.reduce((s: number, v: number) => s + v, 0)
          const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0
          return ` ${ctx.label}：${ctx.parsed} 人（${pct}%）`
        },
      },
    },
  },
}

</script>

<style scoped>
.enrollment-view {
  padding: var(--space-5, 20px);
}

/* ===== Page Header ===== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-3, 12px);
  flex-wrap: wrap;
}

.page-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  flex-wrap: wrap;
}

.page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-5, 20px);
}

.meta-sep {
  color: #dcdfe6;
}

/* ===== Summary Cards ===== */
.summary-cards {
  margin-bottom: var(--space-4, 16px);
}

.summary-card :deep(.el-card__body) {
  padding: 16px 18px;
}

.card-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.card-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ===== Card (table & charts) ===== */
.table-card,
.chart-card {
  margin-top: var(--space-4, 16px);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ===== Stats Table ===== */
.num-total {
  font-weight: 600;
}

.ratio-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.ratio-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  background: var(--neutral-100);
}

.ratio-male {
  background: var(--color-info);
  transition: width 0.3s ease;
}

.ratio-female {
  background: #f56c6c;
  transition: width 0.3s ease;
}

.ratio-text {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  min-width: 80px;
  text-align: right;
}

.ratio-empty {
  color: var(--neutral-300);
}

:deep(.row-subtotal) td {
  background-color: #fafafa !important;
  font-weight: 600;
}

:deep(.row-grand-total) td {
  background-color: #f5f7fa !important;
  font-weight: 700;
  color: var(--text-primary);
}

/* ===== Charts ===== */
.chart-row {
  margin-top: var(--space-4, 16px);
}

.chart-wrapper {
  height: 340px;
  position: relative;
  padding: 8px 4px 0;
}
</style>

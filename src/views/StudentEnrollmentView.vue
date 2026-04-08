<template>
  <div class="enrollment-view">
    <div class="page-header">
      <h2 class="page-title">幼生在籍統計</h2>
      <div class="filter-bar">
        <el-select
          v-model="selectedTerm"
          placeholder="選擇學年學期"
          style="width: 180px"
          @change="onTermChange"
        >
          <el-option
            v-for="opt in termOptions"
            :key="`${opt.school_year}-${opt.semester}`"
            :label="opt.label"
            :value="`${opt.school_year}-${opt.semester}`"
          />
        </el-select>
        <el-button :loading="loading" @click="onRefresh">重新整理</el-button>
        <el-button v-if="activeTab === 'roster'" @click="printRoster">列印</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-click="onTabClick">
      <!-- Tab 1：統計圖表 -->
      <el-tab-pane label="統計圖表" name="stats">
        <!-- 摘要卡片 -->
        <el-row :gutter="16" class="summary-cards" v-loading="loading">
          <el-col :xs="12" :sm="6">
            <el-card class="summary-card" shadow="hover">
              <div class="summary-value">{{ stats?.summary?.total ?? '—' }}</div>
              <div class="summary-label">在籍總人數</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card class="summary-card summary-card--blue" shadow="hover">
              <div class="summary-value">{{ stats?.summary?.male ?? '—' }}</div>
              <div class="summary-label">男生</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card class="summary-card summary-card--pink" shadow="hover">
              <div class="summary-value">{{ stats?.summary?.female ?? '—' }}</div>
              <div class="summary-label">女生</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card class="summary-card summary-card--green" shadow="hover">
              <div class="summary-value">{{ stats?.summary?.class_count ?? '—' }}</div>
              <div class="summary-label">班級數</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 統計表（仿 Excel 格式） -->
        <el-card class="table-card" v-loading="loading" style="margin-top: 16px;">
          <template #header>
            <span>各班在籍人數表</span>
            <span v-if="stats" style="float:right; font-size:13px; color:#64748b;">
              {{ stats.school_year > 1911 ? stats.school_year - 1911 : stats.school_year }} {{ stats.semester_label }}
            </span>
          </template>
          <el-table
            v-if="tableData.length"
            :data="tableData"
            border
            style="width: 100%"
            :span-method="spanMethod"
            :row-class-name="rowClassName"
          >
            <el-table-column label="年級" prop="grade_name" width="100" align="center" />
            <el-table-column label="班級" prop="class_name" width="100" align="center" />
            <el-table-column label="男生" prop="male" width="90" align="center" />
            <el-table-column label="女生" prop="female" width="90" align="center" />
            <el-table-column label="合計" prop="total" width="90" align="center" />
          </el-table>
          <div v-else-if="!loading" class="empty-hint">暫無資料</div>
        </el-card>

        <!-- 圖表區 -->
        <el-row :gutter="16" style="margin-top: 16px;" v-if="stats?.by_grade?.length">
          <!-- 各班人數堆疊長條圖 -->
          <el-col :xs="24" :md="14">
            <el-card>
              <template #header>各班人數（男/女堆疊）</template>
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
          <!-- 年級分布圓餅圖 -->
          <el-col :xs="24" :md="10">
            <el-card>
              <template #header>年級人數分布</template>
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

      <!-- Tab 2：在籍記錄表 -->
      <el-tab-pane label="在籍記錄表" name="roster">
        <div v-loading="rosterLoading">
          <div v-if="roster" id="roster-print-area">
            <EnrollmentRosterTable :roster="roster" />
          </div>
          <div v-else-if="!rosterLoading" class="empty-hint">暫無資料</div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { getEnrollmentStats, getEnrollmentOptions, getEnrollmentRoster } from '@/api/studentEnrollment'
import { apiError } from '@/utils/error'
import EnrollmentRosterTable from '@/components/enrollment/EnrollmentRosterTable.vue'

// Chart.js 延遲載入
let _chartReady = null
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
const loading = ref(false)
const rosterLoading = ref(false)
const stats = ref(null)
const roster = ref(null)
const termOptions = ref([])
const selectedTerm = ref(null)
const activeTab = ref('stats')

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
const fetchOptions = async () => {
  try {
    const res = await getEnrollmentOptions()
    termOptions.value = res.data
    if (termOptions.value.length && !selectedTerm.value) {
      const first = termOptions.value[0]
      selectedTerm.value = `${first.school_year}-${first.semester}`
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入學年選項失敗'))
  }
}

const termParams = () => {
  if (!selectedTerm.value) return {}
  const [sy, sem] = selectedTerm.value.split('-')
  return { school_year: parseInt(sy), semester: parseInt(sem) }
}

const fetchStats = async () => {
  loading.value = true
  try {
    const res = await getEnrollmentStats(termParams())
    stats.value = res.data
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
    roster.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍記錄表失敗'))
  } finally {
    rosterLoading.value = false
  }
}

const onTermChange = () => {
  if (activeTab.value === 'stats') fetchStats()
  else fetchRoster()
}

const onRefresh = () => {
  if (activeTab.value === 'stats') fetchStats()
  else fetchRoster()
}

const onTabClick = (tab) => {
  if (tab.paneName === 'roster' && !roster.value) {
    fetchRoster()
  }
}

const printRoster = () => {
  window.print()
}

onMounted(async () => {
  await fetchOptions()
  await fetchStats()
})

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

// 年級 rowspan 合併（只合併 class 列，subtotal/grand_total 另計）
const spanMethod = ({ row, column, rowIndex, columnIndex }) => {
  if (row.type === 'subtotal' || row.type === 'grand_total') {
    if (columnIndex === 0) return { rowspan: 1, colspan: 2 } // 合併「年級」+「班級」欄
    if (columnIndex === 1) return { rowspan: 0, colspan: 0 } // 被合併，隱藏
    return // 其餘欄位正常
  }
  if (columnIndex !== 0) return // class 列只處理第一欄（年級）
  if (row.type === 'class') {
    // 找出此年級第一個 class 列的 rowIndex
    const gradeRows = tableData.value.filter(
      r => r.type === 'class' && r.grade_name === row.grade_name
    )
    const firstIdx = tableData.value.indexOf(gradeRows[0])
    if (rowIndex === firstIdx) {
      return { rowspan: row._gradeClassCount, colspan: 1 }
    } else {
      return { rowspan: 0, colspan: 0 }
    }
  }
}

const rowClassName = ({ row }) => {
  if (row.type === 'subtotal') return 'row-subtotal'
  if (row.type === 'grand_total') return 'row-grand-total'
  return ''
}

// ---------------------------------------------------------------------------
// 長條圖資料
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
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
      },
      {
        label: '女生',
        data: femaleData,
        backgroundColor: 'rgba(236, 72, 153, 0.6)',
      },
    ],
  }
})

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { stacked: true },
    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 5 } },
  },
  plugins: {
    legend: { position: 'top' },
  },
}

// ---------------------------------------------------------------------------
// 圓餅圖資料
// ---------------------------------------------------------------------------
const gradeColors = [
  'rgba(99, 102, 241, 0.8)',
  'rgba(16, 185, 129, 0.8)',
  'rgba(245, 158, 11, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(59, 130, 246, 0.8)',
]

const doughnutChartData = computed(() => {
  if (!stats.value?.by_grade) return null
  return {
    labels: stats.value.by_grade.map(g => g.grade_name),
    datasets: [
      {
        data: stats.value.by_grade.map(g => g.total),
        backgroundColor: stats.value.by_grade.map((_, i) => gradeColors[i % gradeColors.length]),
      },
    ],
  }
})

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
  },
}
</script>

<style scoped>
.enrollment-view {
  padding: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.summary-cards {
  margin-bottom: 0;
}

.summary-card {
  text-align: center;
  margin-bottom: 0;
}

.summary-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.summary-card--blue .summary-value { color: #3b82f6; }
.summary-card--pink .summary-value { color: #ec4899; }
.summary-card--green .summary-value { color: #10b981; }

.summary-label {
  font-size: 0.875rem;
  color: #64748b;
  margin-top: 4px;
}

.table-card {
  margin-top: 16px;
}

.chart-wrapper {
  height: 280px;
  position: relative;
}

.empty-hint {
  text-align: center;
  color: #94a3b8;
  padding: 32px 0;
}

:deep(.row-subtotal) td {
  background-color: #f1f5f9 !important;
  font-weight: 600;
}

:deep(.row-grand-total) td {
  background-color: #e2e8f0 !important;
  font-weight: 700;
}

/* 列印時只印花名冊區域 */
@media print {
  .page-header,
  .el-tabs__header {
    display: none !important;
  }
  #roster-print-area {
    display: block !important;
  }
}
</style>

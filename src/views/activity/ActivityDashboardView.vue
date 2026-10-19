<template>
  <div class="activity-dashboard">
    <PageHeader :title="PAGE_TERMS.activityDashboard">
      <template #actions>
        <AcademicTermSelector />
      </template>
    </PageHeader>

    <el-row :gutter="16" class="stat-cards" v-loading="loading">
      <el-col :xs="12" :sm="8" :lg="4" v-for="card in statCards" :key="card.label">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">
            <span>{{ card.label }}</span>
            <!-- trigger 同時給 hover 與 click：桌機滑過即看，觸控裝置點一下也能開 -->
            <el-tooltip
              :content="card.hint"
              placement="top"
              :trigger="['hover', 'click']"
              :show-after="120"
              popper-class="stat-hint-popper"
            >
              <el-icon class="stat-hint-icon" tabindex="0" :aria-label="`${card.label}說明`"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 課後才藝統計表 -->
    <el-card class="table-card" v-loading="loadingTable" style="margin-top: 16px;">
      <template #header>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
          <span>
            課後才藝統計表
            <span v-if="belowTargetCount > 0" class="below-target-count">未達標 {{ belowTargetCount }} 班</span>
          </span>
          <span class="card-header-actions">
            <el-checkbox v-model="onlyBelowTarget" size="small">只看未達標班級</el-checkbox>
            <el-button size="small" type="success" :loading="exportingTable" @click="handleExportTable">匯出 Excel</el-button>
          </span>
        </div>
      </template>
      <el-table
        v-if="dashboardData"
        :data="flattenedTableData"
        border
        stripe
        style="width: 100%"
        :span-method="objectSpanMethod"
        :row-class-name="rowClassName"
      >
        <el-table-column prop="classroom_name" label="班級" width="100" align="center" fixed="left" />
        <el-table-column prop="teacher_name" label="班級老師" width="100" align="center" fixed="left" />
        <el-table-column prop="student_count" label="在籍人數" width="90" align="center" />
        
        <!-- 動態課程欄位：報名數 +（待審核）。待審核不進任何比率，僅此處與待審核人次欄呈現 -->
        <el-table-column
          v-for="course in dashboardData.courses"
          :key="course.id"
          :label="course.name"
          align="center"
          width="95"
        >
          <template #header>
            <el-tooltip :content="`${course.name}：括號內為尚未通過身分審核的報名，未計入比率`" placement="top">
              <span>{{ course.name }}</span>
            </el-tooltip>
          </template>
          <template #default="scope">
            <span>{{ getCourseCell(scope.row, course.id).count }}</span>
            <span v-if="getCourseCell(scope.row, course.id).pending" class="pending-mark">
              ({{ getCourseCell(scope.row, course.id).pending }})
            </span>
          </template>
        </el-table-column>

        <!-- 人次：同一學生報兩門算 2，故欄名為「人次」而非「人數」（2026-08-04 正名） -->
        <el-table-column prop="total_enrollments" label="班級人次" width="90" align="center">
          <template #header>
            <el-tooltip content="各課程報名數加總；同一學生報多門重複計算" placement="top">
              <span>班級人次</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <!-- 待審核人次：pending_review 合計。刻意不進比率與達標判定（身分未確認） -->
        <el-table-column prop="total_pending_review" label="待審核人次" width="105" align="center">
          <template #header>
            <el-tooltip content="尚未通過身分審核的報名人次；已佔用名額，審核通過後才計入報名人次與比率" placement="top">
              <span>待審核人次</span>
            </el-tooltip>
          </template>
          <template #default="scope">
            <span v-if="scope.row.total_pending_review" class="pending-mark">
              {{ scope.row.total_pending_review }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <!-- 人次比率＝達標判定依據（2026-10-19 業主裁定）：報名人次 ÷ 在籍，可 >100%。
             紅綠著色直接讀後端 meets_target（未取整比率對年級門檻），前端不自行比較。 -->
        <el-table-column prop="enrollment_ratio" label="人次比率" width="95" align="center">
            <template #header>
              <el-tooltip content="人次比率＝報名人次 ÷ 在籍人數（一生報兩門算 2，可超過 100%）。達標判定看這一欄：大班 100%／中班 90%／小班 80%／幼幼班 70%" placement="top">
                <span>人次比率</span>
              </el-tooltip>
            </template>
            <template #default="scope">
                <span
                  v-if="scope.row.enrollment_ratio !== undefined"
                  :class="ratioClass(scope.row)"
                >{{ scope.row.enrollment_ratio }}%</span>
            </template>
        </el-table-column>
        <el-table-column label="距達標" width="95" align="center">
            <template #header>
              <el-tooltip content="還要再多幾個報名人次，人次比率才會達到該年級門檻" placement="top">
                <span>距達標</span>
              </el-tooltip>
            </template>
            <template #default="scope">
                <span v-if="shortfallText(scope.row)" class="text-danger">{{ shortfallText(scope.row) }}</span>
                <span v-else-if="scope.row.meets_target === true" class="met-mark">達標</span>
            </template>
        </el-table-column>
        <!-- 同比（去年同學期）／環比（上一學期）：年級小計與全園的人次比率差值（百分點）；前期無資料顯示「—」 -->
        <el-table-column label="與前期比較" width="130" align="center">
            <template #header>
              <el-tooltip content="年級小計與全園的人次比率，與上一學期、去年同學期相比增減幾個百分點；前期無資料時顯示「—」" placement="top">
                <span>與前期比較</span>
              </el-tooltip>
            </template>
            <template #default="scope">
                <!-- 同比／環比只做年級小計與全園（2026-10-19 使用者裁定），班級列不顯示 -->
                <div v-if="scope.row.rowType !== 'class'" class="trend-cell">
                  <span>比上學期 <span :class="trendClass(scope.row.enrollment_ratio, scope.row.qoq_enrollment_ratio)">{{ trendText(scope.row.enrollment_ratio, scope.row.qoq_enrollment_ratio) }}</span></span>
                  <span>比去年同期 <span :class="trendClass(scope.row.enrollment_ratio, scope.row.yoy_enrollment_ratio)">{{ trendText(scope.row.enrollment_ratio, scope.row.yoy_enrollment_ratio) }}</span></span>
                </div>
            </template>
        </el-table-column>
        <!-- 參與率（不重複學生）：僅供參考，不參與達標判定，故不著色 -->
        <el-table-column prop="ratio" label="參與率（參考）" width="110" align="center">
            <template #header>
              <el-tooltip content="參與率＝有參加才藝的學生數 ÷ 在籍人數；同一學生報多門只計一次，不超過 100%。僅供參考，不用於達標判定" placement="top">
                <span>參與率（參考）</span>
              </el-tooltip>
            </template>
            <template #default="scope">
                <span v-if="scope.row.ratio !== undefined" class="secondary-ratio">{{ scope.row.ratio }}%</span>
            </template>
        </el-table-column>
        <el-table-column prop="bonus" label="達成獎金 +1000" width="140" align="center">
            <template #header>
              <el-tooltip content="年級人次比率（年級報名人次 ÷ 年級在籍）達到該年級門檻時發給的獎金" placement="top">
                <span>達成獎金 +1000</span>
              </el-tooltip>
            </template>
        </el-table-column>
        <el-table-column prop="points" label="達成積分" width="100" align="center">
            <template #default="scope">
                <span v-if="scope.row.points">{{ scope.row.points }}%</span>
            </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 出席率統計 -->
    <el-row :gutter="16" v-if="attendanceStats && attendanceStats.by_course && attendanceStats.by_course.length > 0" style="margin-top: 16px;">
      <el-col :xs="24">
        <el-card>
          <template #header>
            <span>課程出席率統計</span>
            <span style="float:right; font-size:13px; color:#64748b">
              已點名 {{ attendanceStats.total_sessions }} 場次 · 平均出席率 {{ avgAttendanceRate }}
            </span>
          </template>
          <el-table :data="attendanceStats.by_course" size="small" border>
            <el-table-column label="課程名稱" prop="course_name" />
            <el-table-column label="已點名場次" prop="sessions" width="100" align="center" />
            <el-table-column label="平均出席率" width="120" align="center">
              <template #default="{ row }">
                <el-progress
                  :percentage="Math.round(row.avg_rate * 100)"
                  :format="() => `${Math.round(row.avg_rate * 100)}%`"
                  :status="row.avg_rate >= 0.8 ? 'success' : row.avg_rate >= 0.6 ? '' : 'exception'"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="charts-row" v-if="_statsAny" v-loading="loading" style="margin-top: 16px;">
      <el-col :xs="24" :md="14">
        <el-card>
          <template #header>每日報名趨勢</template>
          <div v-if="dailyStats.length === 0" class="empty-hint">暫無資料</div>
          <div v-else class="chart-container">
            <div
              v-for="item in dailyStats"
              :key="item.date"
              class="bar-row"
            >
              <span class="bar-date">{{ item.date }}</span>
              <el-progress
                :percentage="Math.min(100, (item.count / maxDaily) * 100)"
                :format="() => String(item.count)"
                status=""
              />
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="10">
        <el-card>
          <template #header>熱門課程 Top 5</template>
          <div v-if="topCourses.length === 0" class="empty-hint">暫無資料</div>
          <el-table v-else :data="topCourses" size="small">
            <el-table-column label="課程名稱" prop="name" />
            <el-table-column label="報名數" prop="count" width="80" align="right" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useActivityStore } from '@/stores/activity'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { exportDashboardTable } from '@/api/activity'
import { buildBonusLabel, buildCourseCell } from './activityDashboardTable'
import {
  buildDashboardRows,
  buildShortfallLabel,
  buildTrendLabel,
  isBelowTarget,
  type DashboardTable,
  type DashboardTableRow,
} from './activityDashboardRows'
import { buildStatCards } from './activityDashboardStatCards'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { friendlyError } from '@/utils/errorMessages'
import PageHeader from '@/components/common/PageHeader.vue'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'

const activityStore = useActivityStore()
const termStore = useAcademicTermStore()

// 學期下拉統一走共用 AcademicTermSelector（直接讀寫 termStore），本頁只需監看切換
const selectedTermKey = computed(() => `${termStore.school_year}-${termStore.semester}`)

const loading = ref(false)
const exportingTable = ref(false)

// dashboard 統計表搬進 store（學期感知 TTL 60s + inflight dedupe + 競態守衛），
// view 不再持有 local dashboardData/onMounted 無條件重抓。
const {
  summary,
  charts,
  attendance,
  dashboardTable,
  summaryTermKey,
  chartsTermKey,
  attendanceTermKey,
  dashboardTableTermKey,
  loadingDashboardTable: loadingTable,
} = storeToRefs(activityStore)
const currentTermKey = computed(() => `${termStore.school_year}-${termStore.semester}`)
const currentSummary = computed(() =>
  summaryTermKey.value === currentTermKey.value ? summary.value : null,
)
const currentCharts = computed(() =>
  chartsTermKey.value === currentTermKey.value ? charts.value : null,
)
const currentAttendance = computed(() =>
  attendanceTermKey.value === currentTermKey.value ? attendance.value : null,
)
// Store 保留上一學期快取供快速切回；畫面只能顯示已提交給目前學期的資料。
// 新學期尚在載入或載入失敗時回 null，避免舊學期數字被誤認為新學期。
const dashboardData = computed(() =>
  dashboardTableTermKey.value === currentTermKey.value
    ? dashboardTable.value as DashboardTable | null
    : null,
)
const _statsAny = computed(() => {
  if (!currentSummary.value && !currentCharts.value && !currentAttendance.value) return null
  return {
    statistics: currentSummary.value,
    charts: currentCharts.value,
    attendance_stats: currentAttendance.value,
  } as Record<string, unknown>
})
const statistics = computed(() => (_statsAny.value?.statistics as Record<string, unknown> | undefined) || {})
const dailyStats = computed(() => (_statsAny.value?.charts as { daily?: { date: string; count: number }[] } | undefined)?.daily || [])
const topCourses = computed(() => (_statsAny.value?.charts as { topCourses?: { name: string; count: number }[] } | undefined)?.topCourses || [])
const attendanceStats = computed(() => (_statsAny.value?.attendance_stats as { avg_attendance_rate?: number; total_sessions?: number; by_course?: Record<string, unknown>[] } | undefined) ?? null)
const maxDaily = computed(() => Math.max(1, ...dailyStats.value.map((d) => d.count)))

const avgAttendanceRate = computed(() => {
  const rate = attendanceStats.value?.avg_attendance_rate
  return rate != null ? `${Math.round(rate * 100)}%` : '-'
})

// 全園參與率／待審核人次取自統計表的總計列（分子是不重複學生數，摘要端點沒有），
// 這樣卡片與表格底下的總計必定同值，不會出現兩個打架的參與率。
const statCards = computed(() =>
  buildStatCards(
    statistics.value as Record<string, number | null | undefined>,
    avgAttendanceRate.value,
    dashboardData.value?.grand_total ?? null,
  ),
)

// Why: 後端回傳 grades > classrooms 的樹狀結構，但 el-table 只接受平面陣列。
// buildDashboardRows 將每個年級展開成「各班列 + 小計列」（未達標班排前），並標記
// rowSpan / isFirstOfGrade 給 objectSpanMethod 合併「獎金」「積分」兩欄。
const onlyBelowTarget = ref(false)
const flattenedTableData = computed<DashboardTableRow[]>(() => {
    if (!dashboardData.value) return []
    return buildDashboardRows(dashboardData.value, {
        onlyBelowTarget: onlyBelowTarget.value,
        bonusLabel: buildBonusLabel,
    })
})
const belowTargetCount = computed(() =>
    (dashboardData.value?.grades ?? []).reduce(
        (n, g) => n + g.classrooms.filter(isBelowTarget).length,
        0,
    ),
)

const rowClassName = ({ row }: { row: DashboardTableRow }) =>
    row.rowType === 'class' && isBelowTarget(row) ? 'row-below-target' : ''

// 全園不做達標判定（門檻依年級而異），只有班級與年級小計著色
const ratioClass = (row: DashboardTableRow) => {
    if (row.rowType === 'grand_total' || row.meets_target === undefined) return ''
    return row.meets_target ? 'text-success' : 'text-danger'
}
const shortfallText = (row: DashboardTableRow) =>
    row.rowType === 'grand_total' ? '' : buildShortfallLabel(row)
const trendText = (current?: number | null, previous?: number | null) =>
    buildTrendLabel(current, previous).text
const trendClass = (current?: number | null, previous?: number | null) =>
    `trend-${buildTrendLabel(current, previous).direction}`

const getCourseCell = (row: DashboardTableRow, courseId: number): { count: string; pending: string } => {
    const courses = row.courses as Record<number, number> | undefined || {}
    const pendingCourses = row.pending_review_courses as Record<number, number> | undefined || {}
    return buildCourseCell(courses[courseId], pendingCourses[courseId])
}

const objectSpanMethod = ({ row, column }: { row: DashboardTableRow; column: { property?: string }; rowIndex: number; columnIndex: number }) => {
    // Columns: bonus is property "bonus", points is "points"
    if (column.property === 'bonus' || column.property === 'points') {
        if (row.rowType === 'grand_total') {
            return { rowspan: 1, colspan: 1 }
        }
        if (row.isFirstOfGrade) {
            return {
                rowspan: row.rowSpan,
                colspan: 1
            }
        } else {
            return {
                rowspan: 0,
                colspan: 0
            }
        }
    }
    return { rowspan: 1, colspan: 1 }
}

const fetchTable = async (force = false) => {
  const requestedTermKey = `${termStore.school_year}-${termStore.semester}`
  await activityStore.fetchDashboardTable({
    force,
    school_year: termStore.school_year,
    semester: termStore.semester,
  })
  // 失敗判定不靠共享 store.error：只有本次學期成功提交後 term key 才會一致。
  // 即使 store 中仍留有舊學期快取，也要提示且不可把舊表格顯示在新學期下。
  if (
    currentTermKey.value === requestedTermKey
    && activityStore.dashboardTableTermKey !== requestedTermKey
  ) {
    ElMessage.error('資料載入失敗，請重新整理')
  }
}

// 卡片 / 圖表 / 出席率三組統計皆帶選定學期（契約同 dashboard-table 的 school_year/semester）；
// store 快取以學期 key 區分，切學期自動失效重抓，同學期 TTL 內不重抓。
const fetchStatsAll = async () => {
  loading.value = true
  const termParams = { school_year: termStore.school_year, semester: termStore.semester }
  await Promise.all([
    activityStore.fetchSummary(termParams),
    activityStore.fetchCharts(termParams),
    activityStore.fetchAttendanceStats(termParams),
  ])
  loading.value = false
}

// 切學期：卡片 / 圖表 / 出席率 / 統計表全部重抓
watch(selectedTermKey, () => {
  fetchStatsAll()
  fetchTable()
})

onMounted(async () => {
  // 效能（2026-08-21）：兩者皆只讀 termStore.school_year/semester，互不依賴對方
  // 的回傳資料，改平行發送縮短首屏等待。
  await Promise.all([fetchStatsAll(), fetchTable()])
})

async function handleExportTable() {
  exportingTable.value = true
  try {
    const res = await exportDashboardTable({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    const url = URL.createObjectURL(new Blob([res.data as BlobPart]))
    const a = document.createElement('a')
    a.href = url
    const localDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    a.download = `activity_dashboard_${localDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch (e) {
    ElMessage.error(friendlyError('匯出統計資料失敗', e))
  } finally {
    exportingTable.value = false
  }
}
</script>

<!-- tooltip 內容被 teleport 到 body，scoped 選不到，故另開非 scoped 區塊限制寬度 -->
<style>
.stat-hint-popper { max-width: 280px; line-height: 1.6; }
</style>

<style scoped>
.activity-dashboard { padding: 16px; }
.stat-cards { margin-bottom: 16px; }
.stat-card { text-align: center; padding: 8px 0; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-primary, #4f46e5); }
.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
/* 觸控裝置上要點得到，所以給 icon 比字級更大的可點區域 */
.stat-hint-icon {
  cursor: help;
  color: var(--el-color-info);
  font-size: 14px;
  flex-shrink: 0;
  padding: 2px;
  outline: none;
}
.stat-hint-icon:focus-visible { outline: 2px solid var(--el-color-primary); border-radius: 50%; }
.charts-row { margin-top: 8px; }
.chart-container { max-height: 320px; overflow-y: auto; }
.bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.bar-date { width: 90px; font-size: 12px; color: var(--text-secondary); flex-shrink: 0; }
.empty-hint { color: var(--text-tertiary); text-align: center; padding: 24px 0; }

.text-danger { color: #e11d48; font-weight: bold; }
.text-success { color: var(--color-success-hover); font-weight: bold; }

.card-header-actions { display: inline-flex; align-items: center; gap: 12px; }
.below-target-count { margin-left: 8px; font-size: 13px; font-weight: 600; color: #e11d48; }
/* 未達標班整列淡紅底：一眼找出要去推的班。選擇器多帶 .el-table 以壓過 stripe 底色 */
.table-card :deep(.el-table .el-table__body tr.row-below-target > td.el-table__cell) {
  background-color: var(--el-color-danger-light-9);
}
.met-mark { color: var(--color-success-hover); font-size: 12px; }
.secondary-ratio { color: var(--text-secondary); }
/* 同比／環比為次要資訊：小字灰底，不搶主比率版面 */
.trend-cell { display: flex; flex-direction: column; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.trend-up { color: var(--color-success-hover); font-weight: 600; }
.trend-down { color: #e11d48; font-weight: 600; }
.trend-flat, .trend-none { color: var(--text-tertiary); }

/* 待審核：用品牌橙與正式報名的黑字區隔，避免「12 (+3)」被讀成單一數字。
   刻意不用紅色——待審核是待辦不是錯誤。 */
.pending-mark { color: var(--color-warning, #ff8c42); font-weight: 600; margin-left: 2px; }

/* Let Element Plus handle the default table styles instead of custom backgrounds */
</style>

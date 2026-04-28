<template>
  <div class="activity-dashboard">
    <div class="page-header">
      <h2 class="page-title">課後才藝統計儀表板</h2>
      <el-select v-model="selectedTermKey" style="width: 220px">
        <el-option
          v-for="t in semesterOptions"
          :key="t.key"
          :label="t.label"
          :value="t.key"
        />
      </el-select>
    </div>

    <el-row :gutter="16" class="stat-cards">
      <el-col :xs="12" :sm="8" :lg="4" v-for="card in statCards" :key="card.label">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 課後才藝統計表 -->
    <el-card class="table-card" v-loading="loadingTable" style="margin-top: 16px;">
      <template #header>
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
          <span>課後才藝統計表</span>
          <el-button size="small" type="success" :loading="exportingTable" @click="handleExportTable">匯出 Excel</el-button>
        </div>
      </template>
      <el-table
        v-if="dashboardData"
        :data="flattenedTableData"
        border
        stripe
        style="width: 100%"
        :span-method="objectSpanMethod"
      >
        <el-table-column prop="classroom_name" label="班級" width="100" align="center" fixed="left" />
        <el-table-column prop="teacher_name" label="班級老師" width="100" align="center" fixed="left" />
        <el-table-column prop="student_count" label="在籍人數" width="90" align="center" />
        
        <!-- 動態課程欄位 -->
        <el-table-column
          v-for="course in dashboardData.courses"
          :key="course.id"
          :label="course.name"
          align="center"
          width="80"
        >
          <template #default="scope">
            {{ getCourseCount(scope.row, course.id) }}
          </template>
        </el-table-column>

        <el-table-column prop="total_enrollments" label="班級人數" width="90" align="center" />
        <el-table-column prop="ratio" label="比率" width="80" align="center">
            <template #default="scope">
                <span v-if="scope.row.ratio !== undefined" :class="{'text-danger': scope.row.rowType !== 'grand_total' && scope.row.targetPercent > 0 && scope.row.ratio < scope.row.targetPercent, 'text-success': scope.row.rowType !== 'grand_total' && scope.row.targetPercent > 0 && scope.row.ratio >= scope.row.targetPercent}">
                    {{ scope.row.ratio }}%
                </span>
            </template>
        </el-table-column>
        <el-table-column prop="bonus" label="達成獎金 +1000" width="140" align="center" />
        <el-table-column prop="points" label="達成積分" width="100" align="center">
            <template #default="scope">
                <span v-if="scope.row.points">{{ scope.row.points }}%</span>
            </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 出席率統計 -->
    <el-row :gutter="16" v-if="attendanceStats && attendanceStats.by_course.length > 0" style="margin-top: 16px;">
      <el-col :xs="24">
        <el-card>
          <template #header>
            <span>課程出席率統計</span>
            <span style="float:right; font-size:13px; color:#64748b">
              共 {{ attendanceStats.total_sessions }} 場次 · 平均出席率 {{ avgAttendanceRate }}
            </span>
          </template>
          <el-table :data="attendanceStats.by_course" size="small" border>
            <el-table-column label="課程名稱" prop="course_name" />
            <el-table-column label="場次數" prop="sessions" width="90" align="center" />
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

    <el-row :gutter="16" class="charts-row" v-if="stats" style="margin-top: 16px;">
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
                :format="() => item.count"
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

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useActivityStore } from '@/stores/activity'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { getActivityDashboardTable, exportDashboardTable } from '@/api/activity'
import { FULL_ATTENDANCE_BONUS } from '@/constants/activity'
import { ElMessage } from 'element-plus'

const activityStore = useActivityStore()
const termStore = useAcademicTermStore()
const currentAcademicTerm = getCurrentAcademicTerm()

const semesterOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentAcademicTerm
  const semLabel = (s) => (s === 1 ? '上學期' : '下學期')
  const prevTerm = cs === 1 ? { school_year: cy - 1, semester: 2 } : { school_year: cy, semester: 1 }
  const nextTerm = cs === 1 ? { school_year: cy, semester: 2 } : { school_year: cy + 1, semester: 1 }
  return [
    { key: `${prevTerm.school_year}-${prevTerm.semester}`, ...prevTerm, label: `${prevTerm.school_year}學年度 ${semLabel(prevTerm.semester)}` },
    { key: `${cy}-${cs}`, school_year: cy, semester: cs, label: `${cy}學年度 ${semLabel(cs)}（本學期）` },
    { key: `${nextTerm.school_year}-${nextTerm.semester}`, ...nextTerm, label: `${nextTerm.school_year}學年度 ${semLabel(nextTerm.semester)}` },
  ]
})

const selectedTermKey = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val) => {
    const [y, s] = val.split('-').map(Number)
    termStore.setTerm(y, s)
  },
})

const loading = ref(false)
const loadingTable = ref(false)
const exportingTable = ref(false)
const dashboardData = ref(null)

const { stats } = storeToRefs(activityStore)
const statistics = computed(() => stats.value?.statistics || {})
const dailyStats = computed(() => stats.value?.charts?.daily || [])
const topCourses = computed(() => stats.value?.charts?.topCourses || [])
const attendanceStats = computed(() => stats.value?.attendance_stats || null)
const maxDaily = computed(() => Math.max(1, ...dailyStats.value.map((d) => d.count)))

const avgAttendanceRate = computed(() => {
  const rate = attendanceStats.value?.avg_attendance_rate
  return rate != null ? `${Math.round(rate * 100)}%` : '-'
})

const statCards = computed(() => [
  { label: '總報名數', value: statistics.value.totalRegistrations ?? '-' },
  { label: '正式報名', value: statistics.value.totalEnrollments ?? '-' },
  { label: '候補人數', value: statistics.value.totalWaitlist ?? '-' },
  { label: '今日新增', value: statistics.value.todayNewRegistrations ?? '-' },
  { label: '總收入（已繳）', value: statistics.value.totalRevenue != null ? `$${statistics.value.totalRevenue.toLocaleString()}` : '-' },
  { label: '待繳金額', value: statistics.value.totalUnpaid != null ? `$${statistics.value.totalUnpaid.toLocaleString()}` : '-' },
  { label: '報名率', value: statistics.value.enrollmentRate != null ? `${statistics.value.enrollmentRate}%` : '-' },
  { label: '平均出席率', value: avgAttendanceRate.value },
  { label: '未讀提問', value: statistics.value.unreadInquiries ?? '-' },
])

// Why: 後端回傳 grades > classrooms 的樹狀結構，但 el-table 只接受平面陣列。
// 透過此 computed 將每個年級的「各班列 + 小計列」展開，並標記 rowSpan / isFirstOfGrade
// 給 objectSpanMethod 用來合併「獎金」「積分」這兩欄（同年級共用一個值）。
const flattenedTableData = computed(() => {
    if (!dashboardData.value) return [];
    const data = [];
    for (const grade of dashboardData.value.grades) {
        const classCount = grade.classrooms.length;
        if (classCount === 0) continue;
        const rowSpan = classCount + 1; // +1 給該年級的小計列
        const bonusLabel = grade.subtotal.bonus === FULL_ATTENDANCE_BONUS ? '100%' : '';
        const pointsLabel = grade.subtotal.points || '';

        grade.classrooms.forEach((cls, idx) => {
            data.push({
                ...cls,
                rowType: 'class',
                gradeName: grade.grade_name,
                targetPercent: grade.target_percent,
                isFirstOfGrade: idx === 0,
                rowSpan,
                bonus: bonusLabel,
                points: pointsLabel,
            });
        });

        data.push({
            ...grade.subtotal,
            rowType: 'subtotal',
            classroom_name: '小計',
            teacher_name: '',
            gradeName: grade.grade_name,
            targetPercent: grade.target_percent,
            isFirstOfGrade: false,
            rowSpan: 0,
            bonus: bonusLabel,
            points: pointsLabel,
        });
    }

    data.push({
        ...dashboardData.value.grand_total,
        rowType: 'grand_total',
        classroom_name: '總計',
        teacher_name: '',
        gradeName: '',
        bonus: '',
        points: '',
    });

    return data;
});

const getCourseCount = (row, courseId) => {
    const courses = row.courses || {};
    const count = courses[courseId];
    return count > 0 ? count : '';
};

const objectSpanMethod = ({ row, column, rowIndex, columnIndex }) => {
    // Columns: bonus is property "bonus", points is "points"
    if (column.property === 'bonus' || column.property === 'points') {
        if (row.rowType === 'grand_total') {
            return { rowspan: 1, colspan: 1 };
        }
        if (row.isFirstOfGrade) {
            return {
                rowspan: row.rowSpan,
                colspan: 1
            };
        } else {
            return {
                rowspan: 0,
                colspan: 0
            };
        }
    }
    return { rowspan: 1, colspan: 1 };
};

const fetchTable = async () => {
  loadingTable.value = true
  try {
    const res = await getActivityDashboardTable({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    dashboardData.value = res.data
  } catch {
    ElMessage.error('資料載入失敗，請重新整理')
  } finally {
    loadingTable.value = false
  }
}

watch(selectedTermKey, fetchTable)

onMounted(async () => {
  loading.value = true
  await Promise.all([
    activityStore.fetchSummary({ force: true }),
    activityStore.fetchCharts({ force: true }),
  ])
  loading.value = false
  await fetchTable()
})

async function handleExportTable() {
  exportingTable.value = true
  try {
    const res = await exportDashboardTable({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    const localDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    a.download = `activity_dashboard_${localDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch {
    ElMessage.error('匯出失敗')
  } finally {
    exportingTable.value = false
  }
}
</script>

<style scoped>
.activity-dashboard { padding: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.stat-cards { margin-bottom: 16px; }
.stat-card { text-align: center; padding: 8px 0; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--color-primary, #4f46e5); }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.charts-row { margin-top: 8px; }
.chart-container { max-height: 320px; overflow-y: auto; }
.bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.bar-date { width: 90px; font-size: 12px; color: #64748b; flex-shrink: 0; }
.empty-hint { color: #94a3b8; text-align: center; padding: 24px 0; }

.text-danger { color: #e11d48; font-weight: bold; }
.text-success { color: #16a34a; font-weight: bold; }

/* Let Element Plus handle the default table styles instead of custom backgrounds */
</style>

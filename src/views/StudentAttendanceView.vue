<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { BarChart } from '@/composables/useChartJs'

import { apiError } from '@/utils/error'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getClassrooms } from '@/api/classrooms'
import { getCurrentAcademicTerm, normalizeSchoolYear } from '@/utils/academic'
import { todayISO } from '@/utils/format'
import {
  getAttendanceOverview,
  getDailyAttendance,
  getMonthlySummary,
} from '@/api/studentAttendance'
import { downloadFile } from '@/utils/download'
import { buildStudentProfileLink } from '@/utils/studentLinks'
import AttendanceBatchPanel from '@/components/student/academic-affairs/AttendanceBatchPanel.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

const TODAY = todayISO()

const termStore = useAcademicTermStore()
const currentAcademicTerm = getCurrentAcademicTerm()

const termOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentAcademicTerm
  const semLabel = (s: number) => (s === 1 ? '上學期' : '下學期')
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

interface ClassroomOption { id: number; name: string }
interface OverviewTotals {
  total_students: number
  recorded_count: number
  on_campus_count: number
  unmarked_count: number
  record_completion_rate: number
  attendance_rate: number
}
interface OverviewData {
  classrooms: Record<string, unknown>[]
  totals: OverviewTotals
}
interface MonthlyData {
  students: Record<string, unknown>[]
  alerts: Record<string, unknown>[]
  classroom_attendance_rate: number
  classroom_record_completion_rate: number
  school_days_count: number
  classroom_name?: string
  year?: number
  month?: number
  [key: string]: unknown
}

const termClassrooms = ref<ClassroomOption[]>([])
const activeTab = ref('overview')

const overviewDate = ref(TODAY)
const overviewData = ref<OverviewData | null>(null)
const overviewLoading = ref(false)

const detailDrawerVisible = ref(false)
const detailClassroom = ref<Record<string, unknown> | null>(null)
const detailRecords = ref<Record<string, unknown>[]>([])
const detailLoading = ref(false)

const editClassroomId = ref<number | null>(null)
const editDate = ref(TODAY)

const monthlyClassroomId = ref<number | null>(null)
const monthPicker = ref(TODAY.slice(0, 7))
const monthlyData = ref<MonthlyData | null>(null)
const monthlyLoading = ref(false)

const classroomOptions = computed(() =>
  termClassrooms.value.map((classroom) => ({
    label: classroom.name,
    value: classroom.id,
  }))
)

const fetchTermClassrooms = async () => {
  try {
    const res = await getClassrooms({
      school_year: normalizeSchoolYear(termStore.school_year),
      semester: termStore.semester,
      include_inactive: false,
    })
    termClassrooms.value = res.data as ClassroomOption[]
  } catch {
    termClassrooms.value = []
  }
}

const overviewRows = computed(() => overviewData.value?.classrooms ?? [])
const overviewTotals = computed(() => overviewData.value?.totals ?? {
  total_students: 0,
  recorded_count: 0,
  on_campus_count: 0,
  unmarked_count: 0,
  record_completion_rate: 0,
  attendance_rate: 0,
})

const notOnCampusCount = computed(() =>
  Math.max(overviewTotals.value.total_students - overviewTotals.value.on_campus_count, 0)
)

const overviewCards = computed(() => ([
  { kind: 'single', label: '在籍學生', value: `${overviewTotals.value.total_students} 人`, tone: 'primary' },
  {
    kind: 'pair',
    label: '點名狀況',
    items: [
      { label: '已點名', value: `${overviewTotals.value.recorded_count} 人`, tone: 'success' },
      { label: '未點名', value: `${overviewTotals.value.unmarked_count} 人`, tone: overviewTotals.value.unmarked_count ? 'danger' : 'success' },
    ],
  },
  {
    kind: 'pair',
    label: '到校狀況',
    items: [
      { label: '到校', value: `${overviewTotals.value.on_campus_count} 人`, tone: 'warning' },
      { label: '未到校', value: `${notOnCampusCount.value} 人`, tone: notOnCampusCount.value ? 'danger' : 'success' },
    ],
  },
  { kind: 'single', label: '點名完成率', value: `${overviewTotals.value.record_completion_rate}%`, tone: 'primary' },
  { kind: 'single', label: '出席率', value: `${overviewTotals.value.attendance_rate}%`, tone: 'success' },
]))

const monthlyStudents = computed(() => monthlyData.value?.students ?? [])
const alertStudents = computed(() => monthlyData.value?.alerts ?? [])
const monthlySummaryCards = computed(() => {
  if (!monthlyData.value) return []
  return [
    { label: '班級出席率', value: `${monthlyData.value.classroom_attendance_rate}%`, tone: 'success' },
    { label: '點名完成率', value: `${monthlyData.value.classroom_record_completion_rate}%`, tone: 'primary' },
    { label: '應點名上課日', value: `${monthlyData.value.school_days_count} 天`, tone: 'warning' },
    { label: '連缺告警', value: `${alertStudents.value.length} 人`, tone: alertStudents.value.length ? 'danger' : 'info' },
  ]
})

const chartData = computed(() => {
  const students = monthlyStudents.value
  if (!students.length) return null
  const labels: string[] = []
  const data: number[] = []
  for (const student of students) {
    labels.push(String(student.name ?? ''))
    data.push(Number(student.attendance_rate ?? 0))
  }
  return {
    labels,
    datasets: [{ label: '出席率', data, backgroundColor: '#22577a', borderRadius: 6 }],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context: { raw: unknown }) => `${context.raw}%`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value: unknown) => `${value}%`,
      },
    },
  },
}

const detailSummary = computed(() => {
  const summary = {
    total: detailRecords.value.length,
    recorded: 0,
    unmarked: 0,
    present: 0,
    absent: 0,
    leave: 0,
  }

  detailRecords.value.forEach((record) => {
    if (!record.status) {
      summary.unmarked += 1
      return
    }
    summary.recorded += 1
    if (record.status === '出席' || record.status === '遲到') summary.present += 1
    if (record.status === '缺席') summary.absent += 1
    if (record.status === '病假' || record.status === '事假') summary.leave += 1
  })

  return summary
})

const fetchOverview = async () => {
  overviewLoading.value = true
  try {
    const res = await getAttendanceOverview({
      date: overviewDate.value,
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    overviewData.value = res.data
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級出席總覽失敗'))
  } finally {
    overviewLoading.value = false
  }
}

const fetchDetailRecords = async (classroomId: number) => {
  detailLoading.value = true
  try {
    const res = await getDailyAttendance({
      date: overviewDate.value,
      classroom_id: classroomId,
    })
    detailRecords.value = res.data.records
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級明細失敗'))
  } finally {
    detailLoading.value = false
  }
}

const fetchMonthly = async () => {
  if (!monthlyClassroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  monthlyLoading.value = true
  try {
    const res = await getMonthlySummary({
      classroom_id: monthlyClassroomId.value,
      year: Number(year),
      month: Number(month),
    })
    monthlyData.value = res.data
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級月分析失敗'))
  } finally {
    monthlyLoading.value = false
  }
}

const onAttendanceSaved = async ({ classroom_id }: { date: string; classroom_id: number | string | null }) => {
  const refreshTasks: Promise<void>[] = []
  if (overviewDate.value === editDate.value) {
    refreshTasks.push(fetchOverview())
    if (detailDrawerVisible.value && detailClassroom.value?.classroom_id === classroom_id) {
      refreshTasks.push(fetchDetailRecords(Number(classroom_id)))
    }
  }
  if (refreshTasks.length) await Promise.all(refreshTasks)
}

const exportMonthly = () => {
  if (!monthlyClassroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  downloadFile(
    `/student-attendance/export?classroom_id=${monthlyClassroomId.value}&year=${year}&month=${month}`,
    `${year}年${month}月_出席月報.xlsx`,
  )
}

const openDetailDrawer = async (row: Record<string, unknown>) => {
  detailClassroom.value = row
  detailDrawerVisible.value = true
  await fetchDetailRecords(row.classroom_id as number)
}

const goToMonthlyAnalysis = (row: Record<string, unknown>) => {
  monthlyClassroomId.value = row.classroom_id as number
  monthPicker.value = overviewDate.value.slice(0, 7)
  activeTab.value = 'monthly'
}

const goToDailyEdit = (row: Record<string, unknown>) => {
  editClassroomId.value = row.classroom_id as number
  editDate.value = overviewDate.value
  activeTab.value = 'edit'
}

const goToEditFromDrawer = () => {
  if (!detailClassroom.value) return
  goToDailyEdit(detailClassroom.value)
  detailDrawerVisible.value = false
}

const { isMobile } = useIsMobile()

const classroomCardColumns = [
  { label: '在籍人數', prop: 'student_count' },
  { label: '已點名', prop: 'recorded_count' },
  { label: '未點名', prop: 'unmarked_count' },
  { label: '到校率', prop: '__rate' },
  { label: '點名完成率', prop: '__completion' },
  { label: '狀態', prop: '__status' },
]

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
const rollcallStatusMeta = (status: unknown): { label: string; type: ElTagType } => {
  if (status === 'complete') return { label: '已完成', type: 'success' }
  if (status === 'partial') return { label: '部分完成', type: 'warning' }
  return { label: '未開始', type: 'info' }
}

const detailStatusType = (status: unknown): ElTagType => {
  if (status === '出席') return 'success'
  if (status === '遲到') return 'warning'
  if (status === '缺席') return 'danger'
  if (status === '病假' || status === '事假') return 'info'
  return undefined
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '尚未更新'
  return value.replace('T', ' ').slice(0, 16)
}

watch([monthlyClassroomId, monthPicker], () => {
  if (activeTab.value === 'monthly') fetchMonthly()
})

watch(overviewDate, async () => {
  if (activeTab.value === 'overview') {
    await fetchOverview()
  }
  if (detailDrawerVisible.value && detailClassroom.value) {
    await fetchDetailRecords(detailClassroom.value.classroom_id as number)
  }
})

watch(activeTab, (tab) => {
  if (tab === 'overview') fetchOverview()
  if (tab === 'monthly') fetchMonthly()
})

watch(selectedTermKey, async () => {
  await fetchTermClassrooms()
  const firstId = termClassrooms.value[0]?.id ?? null
  editClassroomId.value = firstId
  monthlyClassroomId.value = firstId
  await fetchOverview()
})

onMounted(async () => {
  await fetchTermClassrooms()
  const firstId = termClassrooms.value[0]?.id ?? null
  if (!editClassroomId.value) editClassroomId.value = firstId
  if (!monthlyClassroomId.value) monthlyClassroomId.value = firstId
  await fetchOverview()
})
</script>

<template>
  <div class="sa-page">
    <div class="page-header">
      <div>
        <h2>學生出席紀錄</h2>
        <p class="page-subtitle">此頁主要查看各班出席狀況；點名編修保留為次要管理功能。</p>
      </div>
      <el-select v-model="selectedTermKey" style="width: 220px">
        <el-option
          v-for="t in termOptions"
          :key="t.key"
          :label="t.label"
          :value="t.key"
        />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane label="今日班級總覽" name="overview">
        <div class="toolbar">
          <el-date-picker
            v-model="overviewDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="選擇日期"
            style="width: 170px"
          />
          <el-button @click="fetchOverview">重新整理</el-button>
        </div>

        <el-alert
          title="後台以教師已送出的班級點名結果呈現總覽；如需補登或修正，請使用「點名編修」。"
          type="info"
          :closable="false"
          show-icon
          class="overview-alert"
        />

        <div class="summary-grid">
          <el-card v-for="card in overviewCards" :key="card.label" class="summary-card" shadow="hover">
            <div class="summary-label">{{ card.label }}</div>
            <template v-if="card.kind === 'pair'">
              <div class="summary-pair">
                <div v-for="item in card.items" :key="item.label" class="summary-pair__item">
                  <div class="summary-pair__label">{{ item.label }}</div>
                  <div class="summary-pair__value" :class="`is-${item.tone}`">{{ item.value }}</div>
                </div>
              </div>
            </template>
            <div v-else class="summary-value" :class="`is-${card.tone}`">{{ card.value }}</div>
          </el-card>
        </div>

        <el-table
          v-if="!isMobile"
          v-loading="overviewLoading"
          :data="overviewRows"
          stripe
          style="width: 100%; margin-top: 16px"
        >
          <el-table-column prop="classroom_name" label="班級" min-width="140" />
          <el-table-column prop="student_count" label="在籍人數" width="90" align="center" />
          <el-table-column prop="recorded_count" label="已點名" width="90" align="center" />
          <el-table-column prop="unmarked_count" label="未點名" width="90" align="center" />
          <el-table-column prop="present_count" label="出席" width="80" align="center" />
          <el-table-column prop="late_count" label="遲到" width="80" align="center" />
          <el-table-column prop="absent_count" label="缺席" width="80" align="center" />
          <el-table-column prop="leave_count" label="請假" width="80" align="center" />
          <el-table-column label="點名完成率" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="row.record_completion_rate >= 100 ? 'success' : row.record_completion_rate >= 70 ? 'warning' : 'danger'">
                {{ row.record_completion_rate }}%
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="到校率" width="100" align="center">
            <template #default="{ row }">
              {{ row.attendance_rate }}%
            </template>
          </el-table-column>
          <el-table-column label="最後更新" min-width="180">
            <template #default="{ row }">
              <div>{{ formatDateTime(row.last_recorded_at) }}</div>
              <div class="muted-text">{{ row.last_recorded_by || '尚無紀錄' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="rollcallStatusMeta(row.rollcall_status).type">
                {{ rollcallStatusMeta(row.rollcall_status).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="220" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openDetailDrawer(row)">查看明細</el-button>
                <el-button link type="success" @click="goToMonthlyAnalysis(row)">月分析</el-button>
                <el-button link type="warning" @click="goToDailyEdit(row)">點名編修</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <AdminListCards
          v-else
          :items="overviewRows"
          :columns="classroomCardColumns"
          row-key="classroom_name"
          :loading="overviewLoading"
          empty-text="目前沒有可顯示的班級出席資料"
          style="margin-top: 16px"
        >
          <template #title="{ item }">{{ item.classroom_name }}</template>
          <template #cell-__rate="{ item }">{{ item.attendance_rate }}%</template>
          <template #cell-__completion="{ item }">
            <el-tag :type="(item.record_completion_rate as number) >= 100 ? 'success' : (item.record_completion_rate as number) >= 70 ? 'warning' : 'danger'">{{ item.record_completion_rate }}%</el-tag>
          </template>
          <template #cell-__status="{ item }">
            <el-tag :type="rollcallStatusMeta(item.rollcall_status).type">{{ rollcallStatusMeta(item.rollcall_status).label }}</el-tag>
          </template>
          <template #actions="{ item }">
            <el-button link type="primary" @click="openDetailDrawer(item as Record<string, unknown>)">查看明細</el-button>
            <el-button link type="success" @click="goToMonthlyAnalysis(item as Record<string, unknown>)">月分析</el-button>
            <el-button link type="warning" @click="goToDailyEdit(item as Record<string, unknown>)">點名編修</el-button>
          </template>
        </AdminListCards>

        <el-empty
          v-if="!isMobile && !overviewLoading && overviewRows.length === 0"
          description="目前沒有可顯示的班級出席資料"
          :image-size="80"
        />
      </el-tab-pane>

      <el-tab-pane label="班級月分析" name="monthly">
        <div class="toolbar">
          <el-select v-model="monthlyClassroomId" placeholder="選擇班級" style="width: 180px">
            <el-option v-for="item in classroomOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-date-picker
            v-model="monthPicker"
            type="month"
            value-format="YYYY-MM"
            placeholder="選擇月份"
            style="width: 160px"
          />
          <el-button @click="fetchMonthly">重新整理</el-button>
          <el-button type="success" :disabled="!monthlyData" @click="exportMonthly">匯出 Excel 月報</el-button>
        </div>

        <div v-loading="monthlyLoading" class="monthly-panel">
          <template v-if="monthlyData">
            <div class="summary-grid">
              <el-card v-for="card in monthlySummaryCards" :key="card.label" class="summary-card" shadow="hover">
                <div class="summary-label">{{ card.label }}</div>
                <div class="summary-value" :class="`is-${card.tone}`">{{ card.value }}</div>
              </el-card>
            </div>

            <el-card class="panel-card" shadow="never">
              <template #header>
                <div class="card-title">{{ monthlyData.classroom_name }} {{ monthlyData.year }} 年 {{ monthlyData.month }} 月出席率</div>
              </template>
              <div class="chart-container">
                <BarChart v-if="chartData" :data="chartData" :options="chartOptions" />
              </div>
            </el-card>

            <el-card class="panel-card" shadow="never">
              <template #header>
                <div class="card-title">異常告警</div>
              </template>
              <div v-if="alertStudents.length" class="alert-list">
                <el-tag
                  v-for="student in alertStudents"
                  :key="student.student_id as string | number"
                  type="danger"
                  effect="dark"
                >
                  {{ student.name }} 連缺 {{ student.longest_absence_streak }} 天
                </el-tag>
              </div>
              <el-empty v-else description="本月沒有連續缺席告警" :image-size="60" />
            </el-card>

            <el-table
              :data="monthlyStudents"
              stripe
              style="width: 100%; margin-top: 16px"
              max-height="520"
            >
              <el-table-column prop="student_no" label="學號" width="90" />
              <el-table-column label="姓名" width="110">
                <template #default="{ row }">
                  <router-link
                    v-if="buildStudentProfileLink(row.student_id ?? row.id, 'attendance')"
                    :to="buildStudentProfileLink(row.student_id ?? row.id, 'attendance')!"
                    class="student-link"
                  >{{ row.name }}</router-link>
                  <span v-else>{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="出席率" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.attendance_rate >= 90 ? 'success' : row.attendance_rate >= 75 ? 'warning' : 'danger'">
                    {{ row.attendance_rate }}%
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="school_days" label="應點名日" width="90" align="center" />
              <el-table-column prop="出席" label="出席" width="70" align="center" />
              <el-table-column prop="缺席" label="缺席" width="70" align="center" />
              <el-table-column prop="病假" label="病假" width="70" align="center" />
              <el-table-column prop="事假" label="事假" width="70" align="center" />
              <el-table-column prop="遲到" label="遲到" width="70" align="center" />
              <el-table-column prop="未點名" label="未點名" width="80" align="center" />
              <el-table-column label="最長連缺" width="100" align="center">
                <template #default="{ row }">
                  {{ row.longest_absence_streak }} 天
                </template>
              </el-table-column>
              <el-table-column label="異常" min-width="120">
                <template #default="{ row }">
                  <el-tag v-if="row.absence_alert" type="danger">連缺告警</el-tag>
                  <span v-else class="muted-text">正常</span>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <div v-else-if="!monthlyLoading" class="empty-hint">
            請先選擇班級與月份
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="點名編修" name="edit">
        <AttendanceBatchPanel
          v-model:classroom-id="editClassroomId"
          v-model:date="editDate"
          :classroom-options="classroomOptions"
          @saved="onAttendanceSaved"
        />
      </el-tab-pane>
    </el-tabs>

    <el-drawer
      v-model="detailDrawerVisible"
      :title="detailClassroom ? `${detailClassroom.classroom_name} ${overviewDate} 出席明細` : '班級出席明細'"
      size="48%"
    >
      <div class="drawer-summary">
        <el-tag type="info">總人數 {{ detailSummary.total }}</el-tag>
        <el-tag type="success">已點名 {{ detailSummary.recorded }}</el-tag>
        <el-tag :type="detailSummary.unmarked ? 'danger' : 'success'">未點名 {{ detailSummary.unmarked }}</el-tag>
        <el-tag type="warning">到校 {{ detailSummary.present }}</el-tag>
        <el-tag type="danger">缺席 {{ detailSummary.absent }}</el-tag>
        <el-tag>請假 {{ detailSummary.leave }}</el-tag>
      </div>

      <el-table
        v-loading="detailLoading"
        :data="detailRecords"
        stripe
        style="width: 100%; margin-top: 12px"
      >
        <el-table-column prop="student_no" label="學號" width="90" />
        <el-table-column label="姓名" width="110">
          <template #default="{ row }">
            <router-link
              v-if="buildStudentProfileLink(row.student_id ?? row.id, 'attendance')"
              :to="buildStudentProfileLink(row.student_id ?? row.id, 'attendance')!"
              class="student-link"
            >{{ row.name }}</router-link>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="detailStatusType(row.status)">
              {{ row.status || '未點名' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="備註" min-width="160">
          <template #default="{ row }">
            {{ row.remark || '—' }}
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="detailDrawerVisible = false">關閉</el-button>
          <el-button type="primary" @click="goToEditFromDrawer">前往點名編修</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
}

.main-tabs {
  margin-top: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.overview-alert {
  margin-top: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 16px;
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

.summary-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 12px;
}

.summary-pair__item {
  min-width: 0;
}

.summary-pair__label {
  color: var(--text-secondary);
  font-size: 12px;
}

.summary-pair__value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
}

.summary-value.is-success {
  color: var(--color-success-darker);
}

.summary-value.is-primary {
  color: var(--color-info-darker);
}

.summary-value.is-warning {
  color: var(--color-warning-darker);
}

.summary-value.is-danger {
  color: var(--color-danger-darker);
}

.summary-value.is-info {
  color: var(--neutral-600);
}

.summary-pair__value.is-success {
  color: var(--color-success-darker);
}

.summary-pair__value.is-primary {
  color: var(--color-info-darker);
}

.summary-pair__value.is-warning {
  color: var(--color-warning-darker);
}

.summary-pair__value.is-danger {
  color: var(--color-danger-darker);
}

.summary-pair__value.is-info {
  color: var(--neutral-600);
}

.row-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.monthly-panel {
  min-height: 260px;
  margin-top: 12px;
}

.panel-card {
  margin-top: 16px;
}

.card-title {
  font-weight: 600;
}

.chart-container {
  height: 280px;
}

.alert-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drawer-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.muted-text,
.empty-hint {
  color: var(--text-tertiary);
}

.empty-hint {
  padding: 40px 0;
  text-align: center;
}

.student-link { color: var(--el-color-primary); text-decoration: none; }
.student-link:hover { text-decoration: underline; }
</style>

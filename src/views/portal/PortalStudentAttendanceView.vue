<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'

import {
  getMyStudents,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
} from '@/api/portal'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const STATUSES = ['出席', '缺席', '病假', '事假', '遲到']

const classrooms = ref([])
const classLoading = ref(false)
const activeTab = ref('daily')

const dailyDate = ref(new Date().toISOString().slice(0, 10))
const dailyClassroomId = ref(null)
const dailyRecords = ref([])
const dailyLoading = ref(false)
const saveLoading = ref(false)

const monthPicker = ref(new Date().toISOString().slice(0, 7))
const monthlyClassroomId = ref(null)
const monthlyData = ref(null)
const monthlyLoading = ref(false)

const classroomOptions = computed(() =>
  classrooms.value.map((classroom) => ({
    label: classroom.classroom_name,
    value: classroom.classroom_id,
  }))
)

const fetchClassrooms = async () => {
  classLoading.value = true
  try {
    const res = await getMyStudents()
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) {
      dailyClassroomId.value = classrooms.value[0].classroom_id
      monthlyClassroomId.value = classrooms.value[0].classroom_id
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  } finally {
    classLoading.value = false
  }
}

const fetchDailyAttendance = async () => {
  if (!dailyClassroomId.value || !dailyDate.value) return
  dailyLoading.value = true
  try {
    const res = await getMyClassAttendance({
      date: dailyDate.value,
      classroom_id: dailyClassroomId.value,
    })
    dailyRecords.value = res.data.records.map((record) => ({
      ...record,
      status: record.status || '出席',
      remark: record.remark || '',
    }))
  } catch (error) {
    ElMessage.error(apiError(error, '載入點名資料失敗'))
  } finally {
    dailyLoading.value = false
  }
}

const setAllStatus = (status) => {
  dailyRecords.value.forEach((record) => {
    record.status = status
  })
}

const saveDailyAttendance = async () => {
  if (!dailyClassroomId.value || dailyRecords.value.length === 0) return
  saveLoading.value = true
  try {
    await batchSaveClassAttendance({
      date: dailyDate.value,
      classroom_id: dailyClassroomId.value,
      entries: dailyRecords.value.map((record) => ({
        student_id: record.student_id,
        status: record.status,
        remark: record.remark || null,
      })),
    })
    ElMessage.success('點名儲存成功')
  } catch (error) {
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    saveLoading.value = false
  }
}

const fetchMonthly = async () => {
  if (!monthlyClassroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  monthlyLoading.value = true
  try {
    const res = await getMyClassAttendanceMonthly({
      classroom_id: monthlyClassroomId.value,
      year: Number(year),
      month: Number(month),
    })
    monthlyData.value = res.data
  } catch (error) {
    ElMessage.error(apiError(error, '載入月統計失敗'))
  } finally {
    monthlyLoading.value = false
  }
}

const exportMonthly = () => {
  if (!monthlyClassroomId.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  downloadFile(
    `/portal/my-class-attendance/export?classroom_id=${monthlyClassroomId.value}&year=${year}&month=${month}`,
    `${year}年${month}月_出席月報.xlsx`,
  )
}

const monthlyStudents = computed(() => monthlyData.value?.students ?? [])
const alertStudents = computed(() => monthlyData.value?.alerts ?? [])
const summaryCards = computed(() => {
  if (!monthlyData.value) return []
  return [
    { label: '班級出席率', value: `${monthlyData.value.classroom_attendance_rate}%`, tone: 'success' },
    { label: '點名完成率', value: `${monthlyData.value.classroom_record_completion_rate}%`, tone: 'primary' },
    { label: '應點名上課日', value: `${monthlyData.value.school_days_count} 天`, tone: 'warning' },
    { label: '連缺告警', value: `${alertStudents.value.length} 人`, tone: alertStudents.value.length ? 'danger' : 'info' },
  ]
})

const chartData = computed(() => {
  if (!monthlyStudents.value.length) return null
  return {
    labels: monthlyStudents.value.map((student) => student.name),
    datasets: [
      {
        label: '出席率',
        data: monthlyStudents.value.map((student) => student.attendance_rate),
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

watch([dailyClassroomId, dailyDate], () => {
  if (activeTab.value === 'daily') fetchDailyAttendance()
})

watch([monthlyClassroomId, monthPicker], () => {
  if (activeTab.value === 'monthly') fetchMonthly()
})

watch(activeTab, (tab) => {
  if (tab === 'daily') fetchDailyAttendance()
  if (tab === 'monthly') fetchMonthly()
})

onMounted(async () => {
  await fetchClassrooms()
  fetchDailyAttendance()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h3>學生點名</h3>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="每日點名" name="daily">
        <el-row :gutter="12" style="margin-bottom: 16px; align-items: flex-end">
          <el-col :xs="24" :sm="8">
            <div class="filter-label">日期</div>
            <el-date-picker
              v-model="dailyDate"
              type="date"
              placeholder="選擇日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="filter-label">班級</div>
            <el-select
              v-model="dailyClassroomId"
              placeholder="選擇班級"
              style="width: 100%"
              v-loading="classLoading"
            >
              <el-option
                v-for="opt in classroomOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-button type="primary" @click="fetchDailyAttendance">載入</el-button>
          </el-col>
        </el-row>

        <div v-if="dailyRecords.length > 0">
          <div class="quick-actions">
            <el-button size="small" type="success" plain @click="setAllStatus('出席')">全部出席</el-button>
            <el-button size="small" type="danger" plain @click="setAllStatus('缺席')">全部缺席</el-button>
          </div>

          <el-table :data="dailyRecords" v-loading="dailyLoading" stripe size="small" border>
            <el-table-column label="學號" width="90" prop="student_no" />
            <el-table-column label="姓名" width="100" prop="name" />
            <el-table-column label="出席狀態" min-width="280">
              <template #default="{ row }">
                <el-radio-group v-model="row.status" size="small">
                  <el-radio-button v-for="status in STATUSES" :key="status" :value="status">
                    {{ status }}
                  </el-radio-button>
                </el-radio-group>
              </template>
            </el-table-column>
            <el-table-column label="備註" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.remark" size="small" placeholder="備註（選填）" clearable />
              </template>
            </el-table-column>
          </el-table>

          <div style="margin-top: 16px; text-align: right">
            <el-button type="primary" :loading="saveLoading" @click="saveDailyAttendance">
              儲存點名（{{ dailyRecords.length }} 人）
            </el-button>
          </div>
        </div>

        <el-empty v-else-if="!dailyLoading" description="請選擇日期與班級後點擊「載入」" />
      </el-tab-pane>

      <el-tab-pane label="月統計" name="monthly">
        <el-row :gutter="12" style="margin-bottom: 16px; align-items: flex-end">
          <el-col :xs="24" :sm="8">
            <div class="filter-label">月份</div>
            <el-date-picker
              v-model="monthPicker"
              type="month"
              value-format="YYYY-MM"
              placeholder="選擇月份"
              style="width: 100%"
            />
          </el-col>
          <el-col :xs="24" :sm="8">
            <div class="filter-label">班級</div>
            <el-select v-model="monthlyClassroomId" placeholder="選擇班級" style="width: 100%">
              <el-option
                v-for="opt in classroomOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="8" class="monthly-actions">
            <el-button type="primary" @click="fetchMonthly">查詢</el-button>
            <el-button type="success" :disabled="!monthlyData" @click="exportMonthly">匯出月報</el-button>
          </el-col>
        </el-row>

        <div v-loading="monthlyLoading" class="monthly-panel">
          <template v-if="monthlyData">
            <div class="summary-grid">
              <el-card v-for="card in summaryCards" :key="card.label" class="summary-card" shadow="hover">
                <div class="summary-label">{{ card.label }}</div>
                <div class="summary-value" :class="`is-${card.tone}`">{{ card.value }}</div>
              </el-card>
            </div>

            <el-card class="chart-card" shadow="never">
              <template #header>
                <div class="card-title">{{ monthlyData.classroom_name }} {{ monthlyData.year }} 年 {{ monthlyData.month }} 月出席率</div>
              </template>
              <div class="chart-container">
                <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
              </div>
            </el-card>

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

            <el-table :data="monthlyStudents" stripe size="small" border>
              <el-table-column label="學號" width="90" prop="student_no" />
              <el-table-column label="姓名" width="100" prop="name" />
              <el-table-column label="出席率" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.attendance_rate >= 90 ? 'success' : row.attendance_rate >= 75 ? 'warning' : 'danger'">
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
                  <span v-else style="color: #909399">正常</span>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <el-empty v-else-if="!monthlyLoading" description="請選擇月份與班級後點擊「查詢」" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.filter-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.quick-actions,
.monthly-actions,
.alert-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.monthly-panel {
  min-height: 260px;
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
  color: #6b7280;
  font-size: 13px;
}

.summary-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
}

.summary-value.is-success {
  color: #166534;
}

.summary-value.is-primary {
  color: #1d4ed8;
}

.summary-value.is-warning {
  color: #b45309;
}

.summary-value.is-danger {
  color: #b91c1c;
}

.summary-value.is-info {
  color: #475569;
}

.chart-card,
.alert-card {
  margin-top: 16px;
}

.card-title {
  font-weight: 600;
}

.chart-container {
  height: 280px;
}
</style>

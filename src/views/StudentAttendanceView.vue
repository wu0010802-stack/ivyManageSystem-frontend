<script setup>
import { ref, computed, watch } from 'vue'
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

import { getClassrooms } from '@/api/classrooms'
import { getDailyAttendance, batchSaveAttendance, getMonthlySummary } from '@/api/studentAttendance'
import { downloadFile } from '@/utils/download'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const STATUS_OPTIONS = ['出席', '缺席', '病假', '事假', '遲到']

const classrooms = ref([])
const selectedClassroom = ref(null)
const activeTab = ref('daily')

const selectedDate = ref(new Date().toISOString().slice(0, 10))
const dailyRecords = ref([])
const dailyLoading = ref(false)
const saving = ref(false)

const monthPicker = ref(new Date().toISOString().slice(0, 7))
const monthlyData = ref(null)
const monthlyLoading = ref(false)

const fetchDaily = async () => {
  if (!selectedClassroom.value || !selectedDate.value) return
  dailyLoading.value = true
  try {
    const res = await getDailyAttendance({
      date: selectedDate.value,
      classroom_id: selectedClassroom.value,
    })
    dailyRecords.value = res.data.records.map((record) => ({
      ...record,
      status: record.status ?? '出席',
      remark: record.remark ?? '',
    }))
  } catch {
    ElMessage.error('載入出席資料失敗')
  } finally {
    dailyLoading.value = false
  }
}

const markAll = (status) => {
  dailyRecords.value.forEach((record) => {
    record.status = status
  })
}

const saveDaily = async () => {
  if (!dailyRecords.value.length) return
  saving.value = true
  try {
    await batchSaveAttendance({
      date: selectedDate.value,
      entries: dailyRecords.value.map((record) => ({
        student_id: record.student_id,
        status: record.status,
        remark: record.remark || null,
      })),
    })
    ElMessage.success('點名儲存成功')
  } catch (error) {
    ElMessage.error(error.response?.data?.detail ?? '儲存失敗')
  } finally {
    saving.value = false
  }
}

const fetchMonthly = async () => {
  if (!selectedClassroom.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  monthlyLoading.value = true
  try {
    const res = await getMonthlySummary({
      classroom_id: selectedClassroom.value,
      year: Number(year),
      month: Number(month),
    })
    monthlyData.value = res.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail ?? '載入月統計失敗')
  } finally {
    monthlyLoading.value = false
  }
}

const exportMonthly = () => {
  if (!selectedClassroom.value || !monthPicker.value) return
  const [year, month] = monthPicker.value.split('-')
  downloadFile(
    `/student-attendance/export?classroom_id=${selectedClassroom.value}&year=${year}&month=${month}`,
    `${year}年${month}月_出席月報.xlsx`,
  )
}

const monthlyStudents = computed(() => monthlyData.value?.students ?? [])
const alertStudents = computed(() => monthlyData.value?.alerts ?? [])
const summaryCards = computed(() => {
  if (!monthlyData.value) return []
  return [
    {
      label: '班級出席率',
      value: `${monthlyData.value.classroom_attendance_rate}%`,
      tone: 'success',
    },
    {
      label: '點名完成率',
      value: `${monthlyData.value.classroom_record_completion_rate}%`,
      tone: 'primary',
    },
    {
      label: '應點名上課日',
      value: `${monthlyData.value.school_days_count} 天`,
      tone: 'warning',
    },
    {
      label: '連缺告警',
      value: `${alertStudents.value.length} 人`,
      tone: alertStudents.value.length ? 'danger' : 'info',
    },
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
        backgroundColor: '#3f7cac',
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

watch([selectedClassroom, selectedDate], () => {
  if (activeTab.value === 'daily') fetchDaily()
})

watch([selectedClassroom, monthPicker], () => {
  if (activeTab.value === 'monthly') fetchMonthly()
})

watch(activeTab, (tab) => {
  if (tab === 'daily') fetchDaily()
  if (tab === 'monthly') fetchMonthly()
})

;(async () => {
  try {
    const res = await getClassrooms()
    classrooms.value = res.data
    if (classrooms.value.length) {
      selectedClassroom.value = classrooms.value[0].id
    }
  } catch {
    ElMessage.error('載入班級失敗')
  }
})()
</script>

<template>
  <div class="sa-page">
    <div class="page-header">
      <h2>學生出席紀錄</h2>
    </div>

    <div class="toolbar">
      <el-select v-model="selectedClassroom" placeholder="選擇班級" style="width: 180px">
        <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <el-tab-pane label="每日點名" name="daily">
        <div class="daily-toolbar">
          <el-date-picker
            v-model="selectedDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="選擇日期"
            style="width: 150px"
          />
          <el-button-group>
            <el-button size="small" type="success" @click="markAll('出席')">全部出席</el-button>
            <el-button size="small" type="danger" @click="markAll('缺席')">全部缺席</el-button>
          </el-button-group>
          <el-button
            type="primary"
            style="margin-left: auto"
            :loading="saving"
            :disabled="!dailyRecords.length"
            @click="saveDaily"
          >
            儲存點名
          </el-button>
        </div>

        <el-table
          v-loading="dailyLoading"
          :data="dailyRecords"
          stripe
          style="width: 100%; margin-top: 12px"
          max-height="520"
        >
          <el-table-column prop="student_no" label="學號" width="90" />
          <el-table-column prop="name" label="姓名" width="110" />
          <el-table-column label="出席狀態" width="320">
            <template #default="{ row }">
              <el-radio-group v-model="row.status" size="small">
                <el-radio-button
                  v-for="status in STATUS_OPTIONS"
                  :key="status"
                  :value="status"
                >
                  {{ status }}
                </el-radio-button>
              </el-radio-group>
            </template>
          </el-table-column>
          <el-table-column label="備註">
            <template #default="{ row }">
              <el-input v-model="row.remark" placeholder="選填" size="small" clearable />
            </template>
          </el-table-column>
        </el-table>

        <div v-if="!dailyLoading && !dailyRecords.length" class="empty-hint">
          請先選擇班級與日期
        </div>
      </el-tab-pane>

      <el-tab-pane label="月統計" name="monthly">
        <div class="daily-toolbar">
          <el-date-picker
            v-model="monthPicker"
            type="month"
            value-format="YYYY-MM"
            placeholder="選擇月份"
            style="width: 150px"
          />
          <el-button @click="fetchMonthly">重新整理</el-button>
          <el-button type="success" :disabled="!monthlyData" @click="exportMonthly">匯出 Excel 月報</el-button>
        </div>

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

            <el-table
              :data="monthlyStudents"
              stripe
              style="width: 100%; margin-top: 16px"
              max-height="520"
            >
              <el-table-column prop="student_no" label="學號" width="90" />
              <el-table-column prop="name" label="姓名" width="110" />
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
                  <span v-else class="text-muted">正常</span>
                </template>
              </el-table-column>
            </el-table>
          </template>

          <div v-else-if="!monthlyLoading" class="empty-hint">
            請先選擇班級與月份
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.toolbar,
.daily-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.monthly-panel {
  min-height: 260px;
  margin-top: 12px;
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
  color: #15803d;
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

.alert-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-hint,
.text-muted {
  color: #999;
}

.empty-hint {
  padding: 40px 0;
  text-align: center;
}
</style>

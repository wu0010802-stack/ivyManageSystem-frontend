<script setup lang="ts">
/**
 * 班級月出席統計（2026-09-14 UI/UX 審查 P2 改版）。
 *
 * 改版前這裡是後台報表原樣搬進教師端：四張同尺寸大數字卡（hero-metric 模板）、
 * 27 根長條圖（手機只標得出 10 個名字）、12 欄 el-table（手機看得到 4 欄且沒有
 * 捲動提示）。老師要的是「誰這個月常缺、誰連缺」，不是 12 欄矩陣。
 *
 * 現在：
 * - 四張大卡收成一句摘要；月初一筆未點時說「尚未點名」，不說「出席率 0%」
 *   （後者讀起來像全班缺席）
 * - 連缺告警排到最前面，那是這頁唯一需要老師採取行動的東西
 * - 窄幕改每生一列，長條圖與 12 欄表格只在桌機顯示
 */
import { computed } from 'vue'
import { BarChart } from '@/composables/useChartJs'
import EmptyState from '@/components/common/EmptyState.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { monthlySummaryText, attendanceRateLabel } from '@/utils/studentRollcall'

interface MonthlyStudent {
  student_id?: number
  student_no?: string
  name?: string
  attendance_rate?: number
  recorded_days?: number
  longest_absence_streak?: number
  absence_alert?: boolean
  [key: string]: unknown
}
interface MonthlyData {
  classroom_name?: string
  year?: number
  month?: number
  classroom_attendance_rate?: number
  classroom_record_completion_rate?: number
  school_days_count?: number
  students?: MonthlyStudent[]
  alerts?: Record<string, unknown>[]
  [key: string]: unknown
}

const props = defineProps<{
  data?: MonthlyData | null
  monthPicker?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:monthPicker': [value: string]
  'export-csv': []
}>()

const { isMobile } = useIsMobile()

const summaryText = computed(() => monthlySummaryText(props.data))
const monthlyStudents = computed(() => props.data?.students ?? [])
const alertStudents = computed(() => props.data?.alerts ?? [])

/** 手機列用的次數：缺席、請假（病假＋事假）、遲到。0 的類別不畫，免得每列都是一排 0。 */
function counts(student: MonthlyStudent) {
  const num = (key: string) => Number(student[key] ?? 0)
  return [
    { label: '缺席', value: num('缺席'), tone: 'danger' },
    { label: '請假', value: num('病假') + num('事假'), tone: 'warning' },
    { label: '遲到', value: num('遲到'), tone: 'info' },
  ].filter((item) => item.value > 0)
}

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

function rateTone(student: MonthlyStudent): TagType {
  if (!student.recorded_days) return 'info'
  const rate = student.attendance_rate ?? 0
  if (rate >= 90) return 'success'
  if (rate >= 75) return 'warning'
  return 'danger'
}

// Bar chart：X = 學生姓名，Y = 出席率（桌機限定）
const chartData = computed(() => {
  if (!monthlyStudents.value.length) return null
  return {
    labels: monthlyStudents.value.map((s) => s.name ?? ''),
    datasets: [
      {
        label: '出席率',
        data: monthlyStudents.value.map((s) => s.attendance_rate ?? null),
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
        label: (context: { raw: unknown }) => `${context.raw}%`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value: string | number) => `${value}%`,
      },
    },
  },
}
</script>

<template>
  <div class="monthly-stats" v-loading="loading ?? false">
    <div class="stats-header">
      <el-date-picker
        :model-value="monthPicker"
        type="month"
        value-format="YYYY-MM"
        placeholder="選擇月份"
        :clearable="false"
        @update:model-value="emit('update:monthPicker', $event)"
      />
      <el-button size="small" @click="emit('export-csv')">匯出 Excel</el-button>
    </div>

    <EmptyState v-if="!data" variant="inline" title="尚未載入月度資料" />

    <template v-else>
      <p class="month-summary">{{ summaryText }}</p>

      <!-- 告警優先：這是本頁唯一需要老師採取行動的東西 -->
      <el-card class="alert-card" shadow="never">
        <template #header>
          <div class="card-title">連續缺席告警</div>
        </template>
        <div v-if="alertStudents.length" class="alert-list">
          <el-tag
            v-for="student in alertStudents"
            :key="(student.student_id as PropertyKey)"
            type="danger"
            effect="dark"
          >
            {{ student.name }} 連缺 {{ student.longest_absence_streak }} 天
          </el-tag>
        </div>
        <EmptyState v-else variant="inline" title="本月沒有連續缺席告警" />
      </el-card>

      <!-- 窄幕：每生一列。桌機才畫長條圖與 12 欄矩陣。 -->
      <div v-if="isMobile" class="student-month-list">
        <div
          v-for="student in monthlyStudents"
          :key="student.student_id"
          class="student-month-row"
          :class="{ 'is-alert': student.absence_alert }"
        >
          <div class="student-month-row__who">
            <span class="name">{{ student.name }}</span>
            <span class="no">{{ student.student_no }}</span>
          </div>
          <div class="student-month-row__stats">
            <el-tag :type="rateTone(student)" size="small">
              {{ attendanceRateLabel(student.attendance_rate, student.recorded_days) }}
            </el-tag>
            <span v-for="item in counts(student)" :key="item.label" class="count">
              {{ item.label }} {{ item.value }}
            </span>
            <span v-if="student.absence_alert" class="count count--alert">
              連缺 {{ student.longest_absence_streak }} 天
            </span>
          </div>
        </div>
      </div>

      <template v-else>
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-title">
              {{ data.classroom_name }} {{ data.year }} 年 {{ data.month }} 月出席率
            </div>
          </template>
          <div class="chart-container">
            <BarChart v-if="chartData" :data="chartData" :options="chartOptions" />
          </div>
        </el-card>

        <el-table :data="monthlyStudents" stripe size="small" border>
          <el-table-column label="學號" width="90" prop="student_no" />
          <el-table-column label="姓名" width="100" prop="name" />
          <el-table-column label="出席率" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="rateTone(row)">
                {{ attendanceRateLabel(row.attendance_rate, row.recorded_days) }}
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
              <span v-else style="color: var(--text-tertiary)">正常</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </template>
  </div>
</template>

<style scoped>
.monthly-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.stats-header {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  flex-wrap: wrap;
}

.month-summary {
  margin: 0;
  font-size: var(--text-base, 14px);
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.card-title {
  font-weight: 600;
}

.chart-container {
  height: 280px;
}

.alert-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.student-month-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.student-month-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md, 8px);
}

.student-month-row.is-alert {
  background: var(--color-danger-soft);
}

.student-month-row__who {
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
}

.student-month-row__who .name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.student-month-row__who .no {
  font-size: var(--text-xs, 12px);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.student-month-row__stats {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}

.count {
  font-size: var(--text-xs, 12px);
  color: var(--el-text-color-secondary);
}

.count--alert {
  color: var(--color-danger);
  font-weight: 600;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChartData, ChartOptions } from 'chart.js'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard } from '@/api/reports'
import { apiError } from '@/utils/error'
import { BarChart, MONTH_LABELS } from './chartSetup'
import { computeReportPeriod, monthState } from './useReportPeriod'
import { formatAmount, monthRangeText } from './reportFormat'
import { readCssVar, resolveTrendPalette, withAlpha } from './trendChart'
import AttendanceDetailDialog from './AttendanceDetailDialog.vue'

/**
 * 經營報表 › 教職員出勤（2026-10-12 改版）。
 *
 * 資料是「教職員打卡」（遲到／早退／缺卡），不是幼生出席。班級＝員工目前所屬班級，
 * 調班前的月份也算在現在的班。後端對沒有打卡紀錄的月份回 `rate: 0, total_records: 0`，
 * 這不是「出勤率 0%」，圖表一律以 null 表示（不畫），並在表格末列說明。
 */

interface AttendanceMonthRow {
  month: number
  total_records?: number
  normal?: number
  late?: number
  early_leave?: number
  missing?: number
  rate?: number
}

interface AttendanceClassroomRow {
  classroom_id: number
  classroom: string
  total_records?: number
  late?: number
  early_leave?: number
  rate?: number
}

const LEAVE_KEYS = ['personal', 'sick', 'annual', 'menstrual', 'maternity', 'paternity'] as const
type LeaveKey = (typeof LEAVE_KEYS)[number]
type LeaveMonthRow = { month: number } & Partial<Record<LeaveKey, number>>

interface DashboardAttendance {
  attendance_monthly?: AttendanceMonthRow[]
  attendance_by_classroom?: AttendanceClassroomRow[]
  leave_monthly?: LeaveMonthRow[]
}

interface AnomalyRow {
  month: number
  total: number
  late: number
  early: number
  missing: number
  rate: number
}

interface ClassroomRow {
  classroomId: number
  classroom: string
  total: number
  rate: number
  insufficient: boolean
  level: RateLevel
}

type RateLevel = 'good' | 'warn' | 'bad'

// 出勤率門檻與樣本下限（班級表、月圖共用同一組）
const RATE_GOOD_MIN = 95
const RATE_WARN_MIN = 90
const MIN_SAMPLE = 10

const LEVEL_KEYS: RateLevel[] = ['good', 'warn', 'bad']
const LEVEL_TEXT: Record<RateLevel, string> = {
  good: '95% 以上',
  warn: '90–95%',
  bad: '低於 90%',
}
const LEVEL_TAG: Record<RateLevel, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  warn: 'warning',
  bad: 'danger',
}

// el-table slot 的 row 是 any：經型別化的 helper 取值，避免 noImplicitAny 索引錯誤
const levelTag = (row: { level: RateLevel }) => LEVEL_TAG[row.level]
const levelText = (row: { level: RateLevel }) => LEVEL_TEXT[row.level]

function rateLevel(rate: number): RateLevel {
  if (rate >= RATE_GOOD_MIN) return 'good'
  if (rate >= RATE_WARN_MIN) return 'warn'
  return 'bad'
}

function clampRate(rate: number): number {
  return Math.max(0, Math.min(100, rate))
}

const props = defineProps<{
  year: number
  focusMonth: number
}>()

const emit = defineEmits<{
  (e: 'update:focusMonth', month: number): void
}>()

const dashboard = useCachedAsync<DashboardAttendance>(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => dashboard.refresh(false))

const data = computed<DashboardAttendance>(() => dashboard.data.value || {})

const loading = computed(() => dashboard.pending.value && !dashboard.data.value)
// 有快取資料時，背景刷新失敗不蓋掉畫面（stale-while-revalidate）
const loadFailed = computed(() => !!dashboard.error.value && !dashboard.data.value)
const errorText = computed(() => apiError(dashboard.error.value, '載入出勤資料失敗'))

function retry() {
  dashboard.refresh(true)
}

// 報表截止期間單一事實來源（spec §2）：未來月不畫、不列入「沒有紀錄」。
const period = computed(() => computeReportPeriod(props.year))

// 有打卡紀錄的月份（未來月、total_records = 0 都不算）
const recordedByMonth = computed(() => {
  const map = new Map<number, AttendanceMonthRow>()
  for (const row of data.value.attendance_monthly || []) {
    if (monthState(period.value, row.month) === 'future') continue
    if ((row.total_records ?? 0) > 0) map.set(row.month, row)
  }
  return map
})

// 已過或本月、但沒有打卡紀錄的月份
const emptyMonths = computed(() => {
  const out: number[] = []
  for (let m = 1; m <= 12; m++) {
    if (monthState(period.value, m) !== 'future' && !recordedByMonth.value.has(m)) out.push(m)
  }
  return out
})
const emptyMonthsNote = computed(() =>
  emptyMonths.value.length ? `${monthRangeText(emptyMonths.value)}沒有打卡紀錄` : '',
)

const focusTagText = computed(() => {
  const m = props.focusMonth
  const rec = recordedByMonth.value.get(m)
  return rec
    ? `${m} 月有 ${formatAmount(rec.total_records)} 筆打卡紀錄`
    : `${m} 月沒有打卡紀錄`
})

// ── 圖表顏色：canvas 吃不到 CSS 變數，繪圖前先解析 design token ──
// resolveTrendPalette 的 revenue／refund／expense 分別解析自 --color-success／
// --color-warning／--color-danger（含讀不到 token 時的退場值），這裡借用其結果。
function ratePalette(): Record<RateLevel, string> {
  const pal = resolveTrendPalette()
  return { good: pal.revenue, warn: pal.refund, bad: pal.expense }
}

// ── 每月出勤率 ──
const rateChartData = computed<ChartData<'bar', (number | null)[]>>(() => {
  const pal = ratePalette()
  const rates: (number | null)[] = []
  const colors: string[] = []
  for (let m = 1; m <= 12; m++) {
    const rec = recordedByMonth.value.get(m)
    const rate = rec ? (rec.rate ?? 0) : null
    rates.push(rate)
    const base = pal[rateLevel(rate ?? 0)]
    // 焦點月實色，其餘月淡化
    colors.push(m === props.focusMonth ? base : withAlpha(base, 0.55))
  }
  return {
    labels: MONTH_LABELS,
    datasets: [{
      label: '出勤率 (%)',
      data: rates,
      backgroundColor: colors,
      borderRadius: 4,
      maxBarThickness: 40,
    }],
  }
})

const rateChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: () => '',
        label: (ctx) => {
          const month = ctx.dataIndex + 1
          const rec = recordedByMonth.value.get(month)
          return `${month} 月｜出勤率 ${rec?.rate ?? 0}%｜打卡 ${formatAmount(rec?.total_records ?? 0)} 筆`
        },
      },
    },
  },
  scales: {
    y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
  },
  onClick: (_e, elements) => {
    if (!elements.length) return
    emit('update:focusMonth', elements[0].index + 1)
  },
}

// ── 異常次數表（只列有紀錄的月份） ──
const anomalyRows = computed<AnomalyRow[]>(() =>
  [...recordedByMonth.value.values()]
    .sort((a, b) => a.month - b.month)
    .map(r => ({
      month: r.month,
      total: r.total_records ?? 0,
      late: r.late ?? 0,
      early: r.early_leave ?? 0,
      missing: r.missing ?? 0,
      rate: r.rate ?? 0,
    })),
)

function anomalyRowClass({ row }: { row: AnomalyRow }): string {
  return row.month === props.focusMonth ? 'is-focus-row' : ''
}

// ── 依所屬班級（全年） ──
const classroomRows = computed<ClassroomRow[]>(() =>
  (data.value.attendance_by_classroom || []).map(r => {
    const total = r.total_records ?? 0
    const rate = r.rate ?? 0
    return {
      classroomId: r.classroom_id,
      classroom: r.classroom,
      total,
      rate,
      insufficient: total < MIN_SAMPLE,
      level: rateLevel(rate),
    }
  }),
)

// ── 請假 ──
const leaveRows = computed(() => {
  const map = new Map<number, LeaveMonthRow>()
  for (const row of data.value.leave_monthly || []) map.set(row.month, row)
  return map
})

const hasLeave = computed(() =>
  [...leaveRows.value.values()].some(row => LEAVE_KEYS.some(k => (row[k] ?? 0) > 0)),
)

const leaveChartData = computed<ChartData<'bar', number[]>>(() => {
  const pal = resolveTrendPalette()
  const personal: number[] = []
  const sick: number[] = []
  const annual: number[] = []
  const other: number[] = []
  for (let m = 1; m <= 12; m++) {
    const d = leaveRows.value.get(m)
    personal.push(d?.personal || 0)
    sick.push(d?.sick || 0)
    annual.push(d?.annual || 0)
    other.push((d?.menstrual || 0) + (d?.maternity || 0) + (d?.paternity || 0))
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '事假', data: personal, backgroundColor: pal.refund, stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: pal.net, stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: pal.revenue, stack: 'leaves' },
      {
        label: '其他',
        data: other,
        backgroundColor: readCssVar('--color-neutral-400').trim() || 'gray',
        stack: 'leaves',
      },
    ],
  }
})

const leaveChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: {
    x: { stacked: true },
    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
  },
}

// ── 明細彈窗 ──
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

function openMonthDetail(row: AnomalyRow) {
  detailDialog.value = { visible: true, month: row.month, classroomId: null, classroomName: null }
}

function openClassroomDetail(row: ClassroomRow) {
  detailDialog.value = {
    visible: true,
    month: null,
    classroomId: row.classroomId,
    classroomName: row.classroom,
  }
}
</script>

<template>
  <el-skeleton v-if="loading" :rows="8" animated data-test="attendance-skeleton" />
  <div v-else-if="loadFailed" class="load-error" data-test="attendance-error">
    <el-empty :description="errorText">
      <el-button type="primary" data-test="attendance-retry" @click="retry">重新載入</el-button>
    </el-empty>
  </div>
  <div v-else class="attendance-panel">
    <p class="panel-note" data-test="panel-note">
      <span>依教職員打卡紀錄計算。班級為員工目前所屬班級，調班前的月份也算在現在的班。</span>
      <el-tag size="small" type="info" data-test="focus-tag">{{ focusTagText }}</el-tag>
    </p>

    <div class="grid-2-1">
      <el-card class="panel-card" shadow="never" data-test="rate-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">每月出勤率</span>
            <span class="threshold-legend" data-test="threshold-legend">
              <span v-for="key in LEVEL_KEYS" :key="key" class="lg-item">
                <i class="sw" :class="`sw-${key}`" aria-hidden="true" />{{ LEVEL_TEXT[key] }}
              </span>
            </span>
          </div>
        </template>
        <div v-if="recordedByMonth.size" class="chart-container is-clickable">
          <BarChart :data="rateChartData" :options="rateChartOptions" />
        </div>
        <el-empty
          v-else
          :image-size="60"
          :description="`${year} 年目前沒有教職員打卡紀錄。`"
          data-test="rate-empty"
        />
      </el-card>

      <el-card class="panel-card" shadow="never" data-test="anomaly-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">異常次數</span>
            <span class="card-hint">點選月份看明細</span>
          </div>
        </template>
        <!-- 月份欄的 button 不綁 handler：鍵盤 Enter／Space 的 click 會冒泡到列，由 row-click 處理 -->
        <el-table
          :data="anomalyRows"
          size="small"
          empty-text="目前沒有打卡紀錄"
          :row-class-name="anomalyRowClass"
          data-test="anomaly-table"
          @row-click="openMonthDetail"
        >
          <el-table-column label="月份" min-width="64">
            <template #default="{ row }">
              <button type="button" class="row-link" data-test="anomaly-month">{{ row.month }} 月</button>
            </template>
          </el-table-column>
          <el-table-column label="打卡筆數" min-width="80" align="right" class-name="num-cell">
            <template #default="{ row }">{{ formatAmount(row.total) }}</template>
          </el-table-column>
          <el-table-column label="遲到" min-width="56" align="right" class-name="num-cell">
            <template #default="{ row }">{{ row.late }}</template>
          </el-table-column>
          <el-table-column label="早退" min-width="56" align="right" class-name="num-cell">
            <template #default="{ row }">{{ row.early }}</template>
          </el-table-column>
          <el-table-column label="缺卡" min-width="56" align="right" class-name="num-cell">
            <template #default="{ row }">{{ row.missing }}</template>
          </el-table-column>
          <el-table-column label="出勤率" min-width="68" align="right" class-name="num-cell">
            <template #default="{ row }">{{ row.rate }}%</template>
          </el-table-column>
        </el-table>
        <p v-if="emptyMonthsNote" class="table-note" data-test="anomaly-empty-months">{{ emptyMonthsNote }}</p>
      </el-card>
    </div>

    <div class="grid-2-1">
      <el-card class="panel-card" shadow="never" data-test="classroom-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">依所屬班級（全年）</span>
            <span class="card-hint">點選班級看明細，細線為 90%</span>
          </div>
        </template>
        <el-table
          :data="classroomRows"
          size="small"
          empty-text="目前沒有班級打卡紀錄"
          data-test="classroom-table"
          @row-click="openClassroomDetail"
        >
          <el-table-column label="班級" min-width="96">
            <template #default="{ row }">
              <button type="button" class="row-link" data-test="classroom-name">{{ row.classroom }}</button>
            </template>
          </el-table-column>
          <el-table-column label="打卡筆數" min-width="80" align="right" class-name="num-cell">
            <template #default="{ row }">{{ formatAmount(row.total) }}</template>
          </el-table-column>
          <el-table-column label="出勤率" min-width="190">
            <template #default="{ row }">
              <span
                v-if="row.insufficient"
                class="muted"
                :title="`打卡筆數少於 ${MIN_SAMPLE} 筆`"
                data-test="classroom-insufficient"
              >樣本不足，不計算</span>
              <div v-else class="rate-cell" data-test="classroom-rate-cell">
                <div class="rate-track" aria-hidden="true">
                  <div
                    class="rate-fill"
                    :class="`is-${row.level}`"
                    :style="{ width: `${clampRate(row.rate)}%` }"
                    data-test="classroom-rate-bar"
                  />
                  <i class="rate-target" />
                </div>
                <span class="rate-text" data-test="classroom-rate-text">{{ row.rate }}%</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="狀態" min-width="96">
            <template #default="{ row }">
              <el-tag v-if="row.insufficient" type="info" size="small" data-test="classroom-status">樣本不足</el-tag>
              <el-tag v-else :type="levelTag(row)" size="small" data-test="classroom-status">
                {{ levelText(row) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <p class="table-note" data-test="classroom-note">表上沒有的班級，表示沒有教職員打卡紀錄。</p>
      </el-card>

      <el-card class="panel-card" shadow="never" data-test="leave-card">
        <template #header>
          <span class="card-title">請假次數</span>
        </template>
        <p v-if="!hasLeave" class="muted empty-line" data-test="leave-empty">
          {{ year }} 年目前沒有教職員請假紀錄。
        </p>
        <div v-else class="chart-container">
          <BarChart :data="leaveChartData" :options="leaveChartOptions" />
        </div>
      </el-card>
    </div>

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
.attendance-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.panel-note {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* 寬螢幕 2:1 並排；右欄有下限避免表格欄位被擠壞。窄螢幕單欄。 */
.grid-2-1 {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(400px, 1fr);
  gap: var(--space-4);
}

.panel-card { height: 100%; }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
}
.card-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); }
.card-hint { font-size: var(--text-xs); color: var(--text-tertiary); }

.threshold-legend {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.lg-item { display: inline-flex; align-items: center; gap: var(--space-1); }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.sw-good { background: var(--color-success); }
.sw-warn { background: var(--color-warning); }
.sw-bad { background: var(--color-danger); }

.chart-container { height: 300px; position: relative; }
.chart-container.is-clickable { cursor: pointer; }

/* 表格列可點（開明細）：button 只提供鍵盤入口，外觀與一般文字一致 */
.row-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.row-link:hover { color: var(--el-color-primary); }
:deep(.el-table__row) { cursor: pointer; }
:deep(.el-table__row.is-focus-row > td.el-table__cell) {
  background: var(--el-color-primary-light-9);
}

.rate-cell { display: flex; align-items: center; gap: var(--space-2); }
.rate-track {
  position: relative;
  flex: 1;
  min-width: 56px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-neutral-100);
}
.rate-fill { height: 100%; border-radius: inherit; }
.rate-fill.is-good { background: var(--color-success); }
.rate-fill.is-warn { background: var(--color-warning); }
.rate-fill.is-bad { background: var(--color-danger); }
/* 90% 位置的細刻度線 */
.rate-target {
  position: absolute;
  left: 90%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--text-tertiary);
}
.rate-text {
  min-width: 3.5em;
  text-align: right;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.muted { font-size: var(--text-sm); color: var(--text-tertiary); }
.table-note {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.empty-line { margin: 0; padding: var(--space-4) 0; }

@media (--to-lg) {
  .grid-2-1 { grid-template-columns: minmax(0, 1fr); }
}

@media (--to-sm) {
  .chart-container { height: 240px; }
}
</style>

<template>
  <nav class="month-progress" aria-label="本月進度" data-test="month-progress">
    <span class="month-progress__title">{{ monthLabel }} 進度</span>
    <ol class="month-progress__steps">
      <li class="month-progress__step" data-test="progress-schedule">
        <span class="month-progress__index">①</span>
        <span>排班</span>
        <strong :class="{ 'month-progress__warn': unscheduled > 0 }">{{ loading ? '…' : loadError ? '—' : unscheduled > 0 ? `${unscheduled} 人日用預設工時` : '已排滿' }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step" data-test="progress-import">
        <span class="month-progress__index">②</span>
        <span>匯入打卡</span>
        <strong :class="{ 'month-progress__warn': imports.gaps.length > 0 }">{{ loading ? '…' : loadError ? '—' : importText }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step">
        <span class="month-progress__index">③</span>
        <button type="button" class="month-progress__link" data-test="progress-issues" @click="emit('show-issues')">
          核對 <strong :class="{ 'month-progress__warn': issues > 0 && !loadError }">{{ loading ? '…' : loadError ? '—' : `本月 ${issues} 格待處理` }}</strong>
        </button>
      </li>
      <li v-if="canConfirmRounds" class="month-progress__step">
        <span class="month-progress__index">④</span>
        <button type="button" class="month-progress__link" data-test="progress-rounds" @click="roundsOpen = true">老師確認</button>
      </li>
      <li class="month-progress__step">
        <span class="month-progress__index">⑤</span>
        <router-link v-if="canViewSalary" to="/salary/settle" class="month-progress__link" data-test="progress-salary">交薪資</router-link>
        <span v-else data-test="progress-salary-text">交薪資</span>
      </li>
    </ol>
    <p v-if="loadError" class="month-progress__error" role="alert" data-test="progress-error">
      {{ loadError }}
      <button type="button" class="month-progress__link" data-test="progress-retry" @click="load">重試</button>
    </p>
    <el-drawer v-if="canConfirmRounds" v-model="roundsOpen" title="月底出勤確認（老師確認）" :size="mobile ? '100%' : '640px'" append-to-body @closed="emit('changed')">
      <ConfirmationRoundBar v-if="roundsOpen" :start="range.start" :end="range.end" />
    </el-drawer>
  </nav>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { importProgress, isIssue, monthRange, uncoveredDates, type GridOut } from '@/utils/scheduleAttendanceGrid'

const ConfirmationRoundBar = defineAsyncComponent(() => import('@/components/attendance/ConfirmationRoundBar.vue'))

const props = defineProps<{
  /** 月份內任一天（YYYY-MM-DD） */
  date: string
  /** 資料異動計數；變動即重新統計 */
  revision: number
  mobile?: boolean
}>()
export interface MonthSummary {
  /** 統計的是哪個月（月初 YYYY-MM-01）；頁面拿它比對，別月的統計不能拿來擋這個月 */
  month: string
  /** 本月待處理格數（與「只看待處理」同一個定義） */
  issues: number
  /** 到昨天為止還沒匯入打卡的工作日數 */
  missingImportDays: number
}
const emit = defineEmits<{ 'show-issues': []; changed: []; summary: [value: MonthSummary] }>()

const range = computed(() => monthRange(props.date))
const monthLabel = computed(() => {
  const [y, m] = props.date.split('-').map(Number)
  return `${y} 年 ${m} 月`
})
const canViewAttendance = hasPermission('ATTENDANCE_READ')
// 薪資結算頁需要 SALARY_READ，沒有就只顯示步驟名稱（連過去會被路由守衛擋下）
const canViewSalary = hasPermission('SALARY_READ')
// 確認輪次端點掛在 SCHEDULE 路由下，讀取還要 ATTENDANCE_READ（同原打卡核對頁籤條件）
const canConfirmRounds = hasPermission('SCHEDULE') && canViewAttendance

const data = ref<GridOut | null>(null)
const loading = ref(false)
const loadError = ref('')
const roundsOpen = ref(false)
let seq = 0

async function load(): Promise<void> {
  const current = ++seq
  loading.value = true
  loadError.value = ''
  try {
    const res = await getScheduleAttendanceGrid({ start_date: range.value.start, end_date: range.value.end })
    if (current === seq) data.value = res.data
  } catch (err) {
    if (current === seq) {
      data.value = null
      loadError.value = apiError(err, '載入本月進度失敗')
    }
  } finally {
    if (current === seq) loading.value = false
  }
}
watch([() => range.value.start, () => props.revision], load, { immediate: true })

/** ①：在職、應出勤的工作日中，班別只靠員工預設或系統預設（沒有任何排班資料）的人日數 */
const unscheduled = computed(() => {
  const g = data.value
  if (!g) return 0
  const workdays = new Set(g.days.filter((d) => d.is_workday).map((d) => d.date))
  return g.cells.filter(
    (c) => c.employed && workdays.has(c.date) && c.plan.expected && (c.plan.source === 'employee' || c.plan.source === 'default'),
  ).length
})

const md = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}
const imports = computed(() => (data.value ? importProgress(data.value.days, data.value.today) : { lastCovered: null, gaps: [], missingWorkdays: [] }))
/** 「已匯入至 X」只看最後一天會掩蓋中間漏匯的日子，缺口要寫出來 */
const importText = computed(() => {
  const { lastCovered, gaps } = imports.value
  if (!lastCovered) return '尚未匯入'
  if (!gaps.length) return `已匯入至 ${md(lastCovered)}`
  return `已匯入至 ${md(lastCovered)}，缺 ${gaps.length > 2 ? `${gaps.length} 天` : gaps.map(md).join('、')}`
})

const issues = computed(() => {
  const g = data.value
  if (!g) return 0
  const uncovered = uncoveredDates(g.days)
  return g.cells.filter((c) => isIssue(c, g.today, uncovered)).length
})

// 匯出月報前的提醒用同一份數字；載入失敗不送（避免拿 0 當「都處理完了」）
watch(data, (g) => {
  if (g) emit('summary', { month: range.value.start, issues: issues.value, missingImportDays: imports.value.missingWorkdays.length })
})
</script>

<style scoped>
.month-progress { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); font-size: var(--text-sm); }
.month-progress__title { font-weight: 600; }
.month-progress__steps { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
.month-progress__step { display: flex; align-items: center; gap: var(--space-1); }
.month-progress__index { color: var(--el-text-color-secondary); }
.month-progress__warn { color: var(--el-color-warning); }
.month-progress__link { min-height: var(--touch-target-min); padding: 0; border: 0; background: transparent; color: var(--el-color-primary); font: inherit; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: var(--space-1); }
.month-progress__error { margin: 0; color: var(--el-color-danger); font-size: var(--text-sm); }
.month-progress__link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
</style>

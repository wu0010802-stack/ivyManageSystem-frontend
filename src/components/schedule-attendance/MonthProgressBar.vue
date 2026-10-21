<template>
  <nav class="month-progress" aria-label="本月進度" data-test="month-progress">
    <span class="month-progress__title">{{ monthLabel }}進度</span>
    <ol class="month-progress__steps">
      <li class="month-progress__step" data-test="progress-schedule">
        <span class="month-progress__index">①</span>
        <span>排班</span>
        <!-- 用預設工時不是錯（不排班的園所本來就這樣），只是告知：不用警示色 -->
        <strong :title="unscheduled > 0 ? '這些人日沒有輪值表、週排班或每日調整，核對時用員工預設工時（沒設就用系統預設）' : undefined">{{ loading ? '…' : loadError ? '—' : unscheduled > 0 ? `${unscheduled} 人日用預設工時` : '已排滿' }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step" data-test="progress-import">
        <span class="month-progress__index">②</span>
        <span>匯入打卡</span>
        <strong :class="{ 'month-progress__warn': imports.missingWorkdays.length > 0 && !loadError }">{{ loading ? '…' : loadError ? '—' : importText }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step">
        <span class="month-progress__index">③</span>
        <button type="button" class="month-progress__link" data-test="progress-issues" @click="emit('show-issues')">
          核對 <strong :class="{ 'month-progress__warn': dailyIssues > 0 && !loadError && !notImported }">{{ issuesText }}</strong>
        </button>
        <!-- 待修設定：整月同型態的格子另外寫，不混在逐日待處理的數字裡（點開設定檢查） -->
        <button
          v-if="patterns.length && !loading && !loadError"
          type="button"
          class="month-progress__link month-progress__patterns"
          data-test="progress-patterns"
          @click="patternsOpen = true"
        >＋{{ patternIssues }} 格待修設定（{{ patterns.length }} 人）</button>
      </li>
      <li v-if="canConfirmRounds" class="month-progress__step">
        <span class="month-progress__index">④</span>
        <button type="button" class="month-progress__link" data-test="progress-rounds" @click="roundsOpen = true">老師確認</button>
        <span v-if="roundStatus" class="month-progress__status" data-test="progress-rounds-status">{{ roundStatus }}</span>
      </li>
      <li class="month-progress__step">
        <span class="month-progress__index">⑤</span>
        <router-link v-if="canViewSalary" to="/salary/settle" class="month-progress__link" data-test="progress-salary">交薪資</router-link>
        <span v-else data-test="progress-salary-text">交薪資</span>
      </li>
    </ol>
    <p v-if="loadError" class="month-progress__error" role="alert" data-test="progress-error">
      {{ loadError }}
      <button type="button" class="month-progress__link" data-test="progress-retry" @click="month.reload()">重試</button>
    </p>
    <el-drawer v-if="canViewAttendance" v-model="patternsOpen" title="本月設定檢查" :size="mobile ? '100%' : '520px'" append-to-body>
      <AttendancePatternList v-if="patternsOpen" :patterns="patterns" @records="onPatternRecords" @import="onPatternImport" @recalculate="onPatternRecalculate" />
    </el-drawer>
    <el-drawer v-if="canConfirmRounds" v-model="roundsOpen" title="月底出勤確認（老師確認）" :size="mobile ? '100%' : '520px'" append-to-body @closed="emit('changed')">
      <ConfirmationRoundBar v-if="roundsOpen" :start="range.start" :end="range.end" />
    </el-drawer>
  </nav>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { getConfirmationRound, listConfirmationRounds, listUnroundedConfirmationItems } from '@/api/attendanceConfirmation'
import type { MonthGridState } from '@/composables/useMonthGrid'
import { backdatedPendingCount, pickDisplayRound, roundStatusText, withBackdatedPending } from '@/utils/attendanceConfirm'
import { hasPermission } from '@/utils/auth'
import { importProgress, isIssue, uncoveredDates } from '@/utils/scheduleAttendanceGrid'
import { patternIssueTotal } from '@/utils/attendancePatterns'
import AttendancePatternList from './AttendancePatternList.vue'

const ConfirmationRoundBar = defineAsyncComponent(() => import('@/components/attendance/ConfirmationRoundBar.vue'))

const props = defineProps<{
  /** 頁面建立的整月格子資料（與月格子共用同一份，D-06） */
  month: MonthGridState
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
const emit = defineEmits<{
  'show-issues': []
  changed: []
  summary: [value: MonthSummary]
  /** 設定檢查清單：看某人整月出勤（帶第一個應上班日） */
  records: [employeeId: number, date: string]
  /** 設定檢查清單：開匯入打卡（重新匯入時把卡號對上） */
  import: []
  /** 設定檢查清單：重算本月出勤 */
  recalculate: []
}>()

const range = computed(() => props.month.range.value)
const data = computed(() => props.month.data.value)
const loading = computed(() => props.month.loading.value)
const loadError = computed(() => props.month.loadError.value)
// 年份已在頁首月份選單上，這裡只寫月份
const monthLabel = computed(() => `${Number(range.value.start.slice(5, 7))} 月`)
const canViewAttendance = hasPermission('ATTENDANCE_READ')
// 薪資結算頁需要 SALARY_READ，沒有就只顯示步驟名稱（連過去會被路由守衛擋下）
const canViewSalary = hasPermission('SALARY_READ')
// 確認輪次端點掛在 SCHEDULE 路由下，讀取還要 ATTENDANCE_READ（同原打卡核對頁籤條件）
const canConfirmRounds = hasPermission('SCHEDULE') && canViewAttendance

const roundsOpen = ref(false)

// ③旁的本月設定檢查（型態診斷）：沒有出勤讀取權限時格子沒有打卡資料，本來就判斷不出型態
const patterns = computed(() => (canViewAttendance ? props.month.patterns.value : []))
const patternIssues = computed(() => patternIssueTotal(patterns.value))
const patternsOpen = ref(false)
/** 頁面（格子列首註記、抽屜型態提醒）也能開設定檢查 */
defineExpose({ openPatterns: () => { if (canViewAttendance && patterns.value.length) patternsOpen.value = true } })
function onPatternRecords(employeeId: number, date: string): void {
  patternsOpen.value = false
  emit('records', employeeId, date)
}
function onPatternImport(): void {
  patternsOpen.value = false
  emit('import')
}
function onPatternRecalculate(): void {
  patternsOpen.value = false
  emit('recalculate')
}

// ④：最新輪次狀態（D-07）。狀態只是輔助，讀不到就不顯示，按鈕照常可開抽屜。
// 跟著整月資料重讀：換月、明細處理、關閉確認抽屜（頁面遞增 revision）後都會更新。
const roundStatus = ref('')
let roundSeq = 0

/** 老師自行補登中行政要動手的筆數（SPEC-026 3-3）。補登清單讀不到只是少了這段，不影響輪次狀態。 */
async function loadBackdatedPending(start: string, end: string): Promise<number> {
  try {
    return backdatedPendingCount((await listUnroundedConfirmationItems({ start_date: start, end_date: end })).data)
  } catch {
    return 0
  }
}

async function loadRoundStatus(): Promise<void> {
  if (!canConfirmRounds) return
  const current = ++roundSeq
  const { start, end } = range.value
  try {
    const backdated = loadBackdatedPending(start, end)
    const round = pickDisplayRound((await listConfirmationRounds({ start_date: start, end_date: end })).data)
    const employees = round?.status === 'open' ? (await getConfirmationRound(round.id)).data.employees : null
    const text = withBackdatedPending(roundStatusText(round, employees), await backdated)
    if (current === roundSeq) roundStatus.value = text
  } catch {
    if (current === roundSeq) roundStatus.value = ''
  }
}
// data 變 null＝換月載入中或整月請求失敗：先作廢在飛的舊請求並清掉狀態，不殘留上個月的文字
watch(data, (g) => {
  if (g) {
    void loadRoundStatus()
  } else {
    roundSeq += 1
    roundStatus.value = ''
  }
}, { immediate: true })

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
/** 逐日要處理的（待處理扣掉待修設定） */
const dailyIssues = computed(() => Math.max(0, issues.value - patternIssues.value))
/** 一天都還沒匯入：「0 格待處理」會被讀成「都處理完了」，改說還不能核對 */
const notImported = computed(() => !!data.value && !imports.value.lastCovered && imports.value.missingWorkdays.length > 0)
const issuesText = computed(() => {
  if (loading.value) return '…'
  if (loadError.value) return '—'
  if (notImported.value) return '等匯入打卡後才能核對'
  return `本月 ${dailyIssues.value} 格待處理`
})

// 匯出月報前的提醒用同一份數字；載入失敗不送（避免拿 0 當「都處理完了」）
watch(data, (g) => {
  if (g) emit('summary', { month: range.value.start, issues: issues.value, missingImportDays: imports.value.missingWorkdays.length })
})
</script>

<style scoped>
.month-progress { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin-bottom: var(--space-2); font-size: var(--text-sm); }
.month-progress__title { flex: none; color: var(--el-text-color-secondary); }
/* 步驟跟標題同一列、在自己的欄裡換行：整條 ol 不會掉到標題下一列，1280 寬兩行收完（原本三行約 80px） */
.month-progress__steps { display: flex; flex: 1 1 0; flex-wrap: wrap; gap: var(--space-1) var(--space-4); min-width: 240px; margin: 0; padding: 0; list-style: none; }
.month-progress__step { display: flex; align-items: center; gap: var(--space-1); }
.month-progress__index { color: var(--el-text-color-secondary); }
.month-progress__status { color: var(--el-text-color-secondary); }
.month-progress__warn { color: var(--color-warning-darker); }
.month-progress__patterns { color: var(--color-warning-darker); text-decoration: underline; text-underline-offset: 2px; }
.month-progress__link { padding: 0; border: 0; background: transparent; color: var(--el-color-primary); font: inherit; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: var(--space-1); }
.month-progress__error { flex-basis: 100%; margin: 0; color: var(--el-color-danger); font-size: var(--text-sm); }
.month-progress__link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
/* 觸控裝置才把連結撐到 44px：桌機也撐的話整列變高、1280 寬折成三行，把格子推出首屏 */
@media (pointer: coarse) {
  .month-progress__link { min-height: var(--touch-target-min); }
}
/* 手機：步驟換行時連結已有 44px 觸控高度，不再額外加列距 */
@media (--to-sm) {
  .month-progress__steps { row-gap: 0; }
}
</style>

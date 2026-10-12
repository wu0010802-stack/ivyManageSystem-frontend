<template>
  <nav class="month-progress" aria-label="本月進度" data-test="month-progress">
    <span class="month-progress__title">{{ monthLabel }} 進度</span>
    <ol class="month-progress__steps">
      <li class="month-progress__step" data-test="progress-schedule">
        <span class="month-progress__index">①</span>
        <span>排班</span>
        <strong :class="{ 'month-progress__warn': unscheduled > 0 }">{{ loading ? '…' : unscheduled > 0 ? `${unscheduled} 人日未排班` : '已排滿' }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step" data-test="progress-import">
        <span class="month-progress__index">②</span>
        <span>匯入打卡</span>
        <strong>{{ loading ? '…' : coveredUntil ? `已匯入至 ${coveredUntil}` : '尚未匯入' }}</strong>
      </li>
      <li v-if="canViewAttendance" class="month-progress__step">
        <span class="month-progress__index">③</span>
        <button type="button" class="month-progress__link" data-test="progress-issues" @click="emit('show-issues')">
          核對 <strong :class="{ 'month-progress__warn': issues > 0 }">{{ loading ? '…' : `${issues} 格待處理` }}</strong>
        </button>
      </li>
      <li v-if="canConfirmRounds" class="month-progress__step">
        <span class="month-progress__index">④</span>
        <button type="button" class="month-progress__link" data-test="progress-rounds" @click="roundsOpen = true">老師確認</button>
      </li>
      <li class="month-progress__step">
        <span class="month-progress__index">⑤</span>
        <router-link to="/salary/settle" class="month-progress__link" data-test="progress-salary">交薪資</router-link>
      </li>
    </ol>
    <el-drawer v-if="canConfirmRounds" v-model="roundsOpen" title="月底出勤確認（老師確認）" :size="mobile ? '100%' : '640px'" append-to-body>
      <ConfirmationRoundBar v-if="roundsOpen" :start="range.start" :end="range.end" />
    </el-drawer>
  </nav>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { hasPermission } from '@/utils/auth'
import { isIssue, monthRange, type GridOut } from '@/utils/scheduleAttendanceGrid'

const ConfirmationRoundBar = defineAsyncComponent(() => import('@/components/attendance/ConfirmationRoundBar.vue'))

const props = defineProps<{
  /** 月份內任一天（YYYY-MM-DD） */
  date: string
  /** 資料異動計數；變動即重新統計 */
  revision: number
  mobile?: boolean
}>()
const emit = defineEmits<{ 'show-issues': [] }>()

const range = computed(() => monthRange(props.date))
const monthLabel = computed(() => {
  const [y, m] = props.date.split('-').map(Number)
  return `${y} 年 ${m} 月`
})
const canViewAttendance = hasPermission('ATTENDANCE_READ')
// 確認輪次端點掛在 SCHEDULE 路由下，讀取還要 ATTENDANCE_READ（同原打卡核對頁籤條件）
const canConfirmRounds = hasPermission('SCHEDULE') && canViewAttendance

const data = ref<GridOut | null>(null)
const loading = ref(false)
const roundsOpen = ref(false)
let seq = 0

async function load(): Promise<void> {
  const current = ++seq
  loading.value = true
  try {
    const res = await getScheduleAttendanceGrid({ start_date: range.value.start, end_date: range.value.end })
    if (current === seq) data.value = res.data
  } catch {
    if (current === seq) data.value = null
  } finally {
    if (current === seq) loading.value = false
  }
}
watch(() => [range.value.start, props.revision], load, { immediate: true })

/** ①：在職、應出勤的工作日中，班別只靠員工預設或系統預設（沒有任何排班資料）的人日數 */
const unscheduled = computed(() => {
  const g = data.value
  if (!g) return 0
  const workdays = new Set(g.days.filter((d) => d.is_workday).map((d) => d.date))
  return g.cells.filter(
    (c) => c.employed && workdays.has(c.date) && c.plan.expected && (c.plan.source === 'employee' || c.plan.source === 'default'),
  ).length
})

const coveredUntil = computed(() => {
  const covered = (data.value?.days ?? []).filter((d) => d.import_covered).map((d) => d.date)
  if (!covered.length) return ''
  const [, m, d] = covered[covered.length - 1].split('-').map(Number)
  return `${m}/${d}`
})

const issues = computed(() => {
  const g = data.value
  return g ? g.cells.filter((c) => isIssue(c, g.today)).length : 0
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
.month-progress__link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
</style>

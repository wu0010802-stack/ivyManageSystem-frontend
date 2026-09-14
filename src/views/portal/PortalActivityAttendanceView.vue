<script setup lang="ts">
/**
 * 課程點名｜場次列表（2026-09-14 改版）。
 *
 * 改版前：一次撈整月、依日期升冪平鋪 36 列，沒有「今天」也沒有上課時間；點名開在
 * 右側 drawer。老師 90% 的來訪只為了點今天那一堂，卻要自己掃過整個月。
 *
 * 現在：以「週」為單位撈，今天固定在第一屏；另外撈過去 14 天算漏點名，主動浮出；
 * 點名改成獨立頁面 /portal/activity/attendance/:sessionId。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getPortalAttendanceSessions } from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import ActivitySessionList from './components/activity/ActivitySessionList.vue'
import {
  findOverdue,
  parseDay,
  toISO,
  toSessionView,
  todayInTaipei,
  todaySummary,
  weekBounds,
  weekLabel,
  type BoardSession,
  type SessionView,
} from '@/utils/activitySessionBoard'

type PortalSessionRow = Schema<'ActivitySessionListItemOut'>

/** 漏點名回看天數。再往前的老師通常不會補了，全部翻出來只會讓提示變常駐雜訊。 */
const OVERDUE_LOOKBACK_DAYS = 14

const router = useRouter()

const today = ref(todayInTaipei())
const weekOffset = ref(0)
const mode = ref<'week' | 'custom'>('week')
const customStart = ref<string | null>(null)
const customEnd = ref<string | null>(null)
const filterCourseId = ref<number | null>(null)

const loading = ref(false)
const sessions = ref<PortalSessionRow[]>([])
const overdueSessions = ref<SessionView[]>([])

const range = computed(() => {
  if (mode.value === 'custom' && (customStart.value || customEnd.value)) {
    return { start: customStart.value ?? '', end: customEnd.value ?? '' }
  }
  return weekBounds(today.value, weekOffset.value)
})

const rangeLabel = computed(() => {
  if (mode.value === 'custom') {
    return `${customStart.value || '不限'} 至 ${customEnd.value || '不限'}`
  }
  return weekLabel(range.value.start, range.value.end, today.value)
})

const todayViews = computed(() =>
  sessions.value
    .map((s) => toSessionView(s as BoardSession, today.value))
    .filter((s) => s.isToday),
)

const headerSubtitle = computed(() => {
  const [, month, day] = today.value.split('-')
  return `${Number(month)}月${Number(day)}日・${todaySummary(todayViews.value)}`
})

let requestSeq = 0

async function loadSessions() {
  const seq = ++requestSeq
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (range.value.start) params.start_date = range.value.start
    if (range.value.end) params.end_date = range.value.end
    const res = await getPortalAttendanceSessions(params)
    if (seq !== requestSeq) return
    sessions.value = res.data
  } catch {
    if (seq !== requestSeq) return
    ElMessage.error('載入場次失敗')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

/**
 * 漏點名要另外撈：它的視窗（過去 14 天）通常不在目前顯示的那一週裡，
 * 不撈就只有翻回上一週才看得到，等於沒有提醒。
 */
async function loadOverdue() {
  const floor = parseDay(today.value)
  floor.setDate(floor.getDate() - OVERDUE_LOOKBACK_DAYS)
  try {
    const res = await getPortalAttendanceSessions({
      start_date: toISO(floor),
      end_date: today.value,
    })
    const views = (res.data as BoardSession[]).map((s) => toSessionView(s, today.value))
    overdueSessions.value = findOverdue(views, today.value, OVERDUE_LOOKBACK_DAYS)
  } catch {
    // 漏點名只是輔助提示。撈不到就不顯示，不要再彈一次錯誤蓋掉主要內容的錯誤訊息。
    overdueSessions.value = []
  }
}

function shiftWeek(delta: number) {
  mode.value = 'week'
  weekOffset.value += delta
  loadSessions()
}

function goToday() {
  mode.value = 'week'
  weekOffset.value = 0
  today.value = todayInTaipei()
  loadSessions()
}

function applyCustom() {
  if (!customStart.value && !customEnd.value) {
    ElMessage.warning('請先選擇日期範圍')
    return
  }
  mode.value = 'custom'
  loadSessions()
}

function openRollcall(session: SessionView) {
  router.push({
    name: 'portal-activity-rollcall',
    params: { sessionId: String(session.id) },
  })
}

onMounted(() => {
  loadSessions()
  loadOverdue()
})
</script>

<template>
  <div class="portal-activity-attendance">
    <PortalPageHeader title="課程點名" :subtitle="headerSubtitle" />

    <ActivitySessionList
      :sessions="(sessions as BoardSession[])"
      :overdue="overdueSessions"
      :loading="loading"
      :today="today"
      :range-label="rangeLabel"
      :mode="mode"
      :filter-course-id="filterCourseId"
      :custom-start="customStart"
      :custom-end="customEnd"
      @shift-week="shiftWeek"
      @go-today="goToday"
      @update:filter-course-id="filterCourseId = $event"
      @update:custom-start="customStart = $event"
      @update:custom-end="customEnd = $event"
      @apply-custom="applyCustom"
      @open-rollcall="openRollcall"
    />
  </div>
</template>

<style scoped>
.portal-activity-attendance {
  padding: var(--space-4, 16px);
}
</style>

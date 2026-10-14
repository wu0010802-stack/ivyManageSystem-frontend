<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { useAbortableFetch } from '../composables/useAbortableFetch'
import { getMonthlyAttendance } from '../api/attendance'
import { localDateISO } from '../utils/date'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import ParentIcon from '../components/ParentIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

// P2-FE-Parent-6：原本 `today = new Date()` 是模組頂層 plain Date，
// 跨午夜不會更新；且 `todayStr` 由各 `.getFullYear()...` 拼接，跨午夜
// 也維持舊值。改 reactive ref + setInterval 每分鐘 tick（與 MonthDateStrip
// P1-15 一致），日期改用共用 `localDateISO()` 避免 UTC slice 偏移。
const initialNow = new Date()
const year = ref(initialNow.getFullYear())
const month = ref(initialNow.getMonth() + 1)
const todayStr = ref(localDateISO(initialNow))

let todayInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  todayInterval = setInterval(() => {
    const next = localDateISO(new Date())
    if (next !== todayStr.value) todayStr.value = next
  }, 60 * 1000)
})
onBeforeUnmount(() => {
  if (todayInterval) clearInterval(todayInterval)
})

// 切換小孩 / 月份時 abort 舊 request（P1-19）。
const { data: attRes, error: attError, pending: loading, refresh: refreshAtt } =
  useAbortableFetch((config) =>
    getMonthlyAttendance(selectedId.value!, year.value, month.value, config),
  )
const data = computed(() => attRes.value?.data || null)
const dayMap = computed(() => {
  const m = new Map<string, { status?: string; remark?: string }>()
  for (const item of data.value?.items || []) {
    const it = item as { date: string; status?: string; remark?: string }
    m.set(it.date, it)
  }
  return m
})

const counts = computed(() => data.value?.counts || {})
const recordedDays = computed(() => data.value?.recorded_days || 0)

const calendarDays = computed(() => {
  const y = year.value
  const m = month.value
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  const cells = []
  const startWeekday = firstDay.getDay()
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      date: dateStr,
      day: d,
      info: dayMap.value.get(dateStr) || null,
    })
  }
  return cells
})

type DayInfo = { status?: string; remark?: string }
type DayCell = { date: string; day: number; info: DayInfo | null } | null

// 只記所選「日期」，狀態／備註一律由目前的 dayMap 推導：存 cell 快照會讓下拉重整
// 或資料更新後，詳情卡仍顯示點選當下的舊備註（深掃審查 FE-R2）。
const selectedDate = ref<string | null>(null)
const selectedInfo = computed<DayInfo | null>(() =>
  selectedDate.value ? dayMap.value.get(selectedDate.value) || null : null,
)
function selectCell(cell: DayCell) {
  if (!cell) return
  selectedDate.value = cell.date
}

async function fetchData() {
  if (!selectedId.value) return
  try {
    await refreshAtt()
  } catch {
    /* error 由 watch 統一彈 toast */
  }
}

watch(attError, (err: unknown) => {
  const e = err as Record<string, unknown> | null
  if (e) toast.error(String(e?.displayMessage || '載入出席紀錄失敗'))
})

function prevMonth() {
  if (month.value === 1) { month.value = 12; year.value -= 1 }
  else { month.value -= 1 }
}
function nextMonth() {
  if (month.value === 12) { month.value = 1; year.value += 1 }
  else { month.value += 1 }
}
function goToday() {
  const d = new Date()
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
}

// status → 色系 mapping（cream / leaf / coral / sun / sky）＋格內記號。
// PRODUCT.md：純色不可作為唯一狀態指示——病假／事假同色、紅綠色弱分不出出席／缺席，
// 所以每格另印一個字（出席用 ✓），月曆下方附圖例。
const STATUS_TONE: Record<string, { tone: string; label: string; mark: string }> = {
  出席:  { tone: 'success', label: '出席', mark: '✓' },
  遲到:  { tone: 'warn',    label: '遲到', mark: '遲' },
  病假:  { tone: 'info',    label: '病假', mark: '病' },
  事假:  { tone: 'info',    label: '事假', mark: '事' },
  缺席:  { tone: 'danger',  label: '缺席', mark: '缺' },
}
const LEGEND = Object.values(STATUS_TONE)

/** 格內記號：已知狀態用對照表，未知狀態退回狀態文字的第一個字（仍不只靠顏色） */
function statusMark(status?: string): string {
  if (!status) return ''
  return STATUS_TONE[status]?.mark ?? status.slice(0, 1)
}

/** 「日期 狀態」；今天另以 aria-current="date" 宣告，不塞進名稱 */
function cellAriaLabel(cell: DayCell): string {
  if (!cell) return ''
  return `${cell.date} ${cell.info?.status || '無紀錄'}`
}

function cellClass(cell: DayCell) {
  if (!cell) return ''
  const status = cell.info?.status
  const tone = status ? STATUS_TONE[status]?.tone : undefined
  return [
    cell.info ? 'has' : '',
    tone ? `tone-${tone}` : '',
    selectedDate.value === cell.date ? 'is-selected' : '',
    cell.date === todayStr.value ? 'is-today' : '',
  ].filter(Boolean).join(' ')
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  fetchData()
})

// F17：換孩子或換月份後，前一查詢所選的日期必須清除，月資料也一併丟掉——否則新月份
// 載入中或失敗時，新標題下仍顯示前一個查詢的統計與日卡（深掃審查 FE-R2）。
watch([selectedId, year, month], () => {
  selectedDate.value = null
  attRes.value = null
  return fetchData()
})

async function pullRefresh() { await fetchData() }
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="att-view">
    <ChildContextHeader variant="page" />

    <!-- Hero：月份 + 出席摘要 -->
    <header class="pt-page-hero att-hero">
      <div class="month-row">
        <button class="pt-icon-btn" type="button" aria-label="上個月" @click="prevMonth">
          <ParentIcon name="back" size="sm" />
        </button>
        <div class="month-label">
          <p class="month-eyebrow">出席紀錄</p>
          <h1 class="month-title">{{ year }} 年 {{ month }} 月</h1>
        </div>
        <button class="pt-icon-btn" type="button" aria-label="下個月" @click="nextMonth">
          <ParentIcon name="chevron-right" size="sm" />
        </button>
      </div>

      <div v-if="data" class="summary-row">
        <span class="summary-total">已紀錄 <strong>{{ recordedDays }}</strong> 天</span>
        <span v-if="counts.出席" class="pt-pill pt-pill-success">出席 {{ counts.出席 }}</span>
        <span v-if="counts.病假" class="pt-pill pt-pill-info">病假 {{ counts.病假 }}</span>
        <span v-if="counts.事假" class="pt-pill pt-pill-info">事假 {{ counts.事假 }}</span>
        <span v-if="counts.遲到" class="pt-pill pt-pill-warn">遲到 {{ counts.遲到 }}</span>
        <span v-if="counts.缺席" class="pt-pill pt-pill-danger">缺席 {{ counts.缺席 }}</span>
        <button type="button" class="pt-ghost-btn today-btn" @click="goToday">回今天</button>
      </div>
    </header>

    <!-- 月曆主體 -->
    <section class="calendar-wrap">
      <div class="weekday-row">
        <div v-for="w in ['日','一','二','三','四','五','六']" :key="w">{{ w }}</div>
      </div>

      <div class="calendar">
        <div
          v-for="(cell, i) in calendarDays"
          :key="i"
          class="cell"
          :class="cellClass(cell)"
          :role="cell ? 'button' : undefined"
          :tabindex="cell ? 0 : -1"
          :aria-label="cell ? cellAriaLabel(cell) : undefined"
          :aria-current="cell && cell.date === todayStr ? 'date' : undefined"
          :aria-hidden="cell ? undefined : 'true'"
          @click="selectCell(cell)"
          @keydown.enter="selectCell(cell)"
          @keydown.space.prevent="selectCell(cell)"
        >
          <template v-if="cell">
            <span class="day-num">{{ cell.day }}</span>
            <span v-if="cell.info" class="status-mark" aria-hidden="true">{{ statusMark(cell.info.status) }}</span>
          </template>
        </div>
      </div>

      <ul class="legend" aria-label="圖例">
        <li v-for="item in LEGEND" :key="item.label" class="legend-item" :class="`tone-${item.tone}`">
          <span class="legend-mark" aria-hidden="true">{{ item.mark }}</span>
          <span class="legend-label">{{ item.label }}</span>
        </li>
      </ul>
    </section>

    <!-- Detail -->
    <section v-if="selectedDate && selectedInfo" class="pt-card detail">
      <div class="detail-row">
        <span class="material-symbols-rounded" aria-hidden="true">calendar_today</span>
        <span class="detail-label">日期</span>
        <span class="detail-value">{{ selectedDate }}</span>
      </div>
      <div class="detail-row">
        <span class="material-symbols-rounded" aria-hidden="true">how_to_reg</span>
        <span class="detail-label">狀態</span>
        <span class="pt-pill" :class="`pt-pill-${STATUS_TONE[selectedInfo.status ?? '']?.tone || 'info'}`">
          {{ selectedInfo.status }}
        </span>
      </div>
      <div v-if="selectedInfo.remark" class="detail-row">
        <span class="material-symbols-rounded" aria-hidden="true">edit_note</span>
        <span class="detail-label">備註</span>
        <span class="detail-value">{{ selectedInfo.remark }}</span>
      </div>
    </section>
    <EmptyState
      v-else-if="selectedDate && data"
      variant="inline"
      :title="`${selectedDate} 尚無紀錄`"
    />

    <div v-if="loading && !data" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="2" />
    </div>
    <MobileErrorRetry
      v-else-if="attError && !data"
      :error="attError as Error"
      @retry="fetchData"
    />
  </PullToRefresh>
</template>

<style scoped>
.att-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

/* Hero：與下方月曆、孩子 header 同一條 16px 左右留白（容器本身不給 padding-inline） */
.att-hero { display: flex; flex-direction: column; gap: 12px; margin: 0 var(--space-4, 16px); }
.month-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.month-label {
  flex: 1;
  text-align: center;
}
.month-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pt-text-muted);
}
.month-title {
  margin: 2px 0 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--pt-text-strong);
  letter-spacing: -0.01em;
}

.summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.summary-total {
  font-size: 13px;
  color: var(--pt-text-muted);
  font-weight: 500;
}
.summary-total strong { color: var(--pt-text-strong); }
.today-btn { margin-left: auto; font-size: 12px; }

/* Calendar */
.calendar-wrap {
  margin: 0 16px;
  padding: 14px 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 18px;
}
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.cell {
  aspect-ratio: 1;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  background: transparent;
  position: relative;
  cursor: default;
  transition: background 140ms ease, transform 120ms ease;
}
.cell:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 1px;
}
.cell.has {
  cursor: pointer;
  background: var(--cream, #fffcf2);
}
.cell.has:hover { background: var(--sun-100, #fff6e0); }
.cell.has:active { transform: scale(0.95); }

.day-num { font-weight: 600; color: var(--pt-text-strong); line-height: 1; }
/* 狀態記號（字）：顏色只是輔助，字本身就能讀出狀態；色值走童彩 tonal 配對的 on 色，
   light/dark 對各自的格底皆 ≥4.5:1 */
.status-mark {
  margin-top: 3px;
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  line-height: 1;
  color: var(--tone-on, var(--pt-text-muted));
}

.tone-success { --tone-bg: var(--leaf-100, #dcf4e6); --tone-on: var(--pt-accent-leaf-on); }
.tone-danger  { --tone-bg: var(--coral-100, #ffe3e0); --tone-on: var(--pt-accent-coral-on); }
.tone-info    { --tone-bg: var(--sky-100, #dceef5); --tone-on: var(--pt-accent-sky-on); }
.tone-warn    { --tone-bg: var(--sun-100, #fff4c9); --tone-on: var(--pt-accent-sun-on); }
.cell.tone-success,
.cell.tone-danger,
.cell.tone-info,
.cell.tone-warn { background: var(--tone-bg); }

/* 圖例 */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 12px 0 0;
  padding: 10px 2px 0;
  list-style: none;
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
}
.legend-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--tone-bg);
  color: var(--tone-on);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  line-height: 1;
}

.cell.is-today {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: -1px;
}
.cell.is-selected {
  box-shadow: 0 0 0 2px var(--brand-primary, #0d9053);
  background: var(--pt-surface-card, #fff) !important;
  transform: scale(1.04);
}
.cell.is-selected .day-num { color: var(--brand-primary, #0d9053); font-weight: 800; }

/* Detail */
.detail { display: flex; flex-direction: column; gap: 10px; }
.detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.detail-row .material-symbols-rounded {
  font-size: 20px;
  color: var(--brand-primary, #0d9053);
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.detail-label {
  width: 48px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
}
.detail-value { color: var(--pt-text-body); }

@media (prefers-reduced-motion: reduce) {
  .cell { transition: none; }
}
</style>

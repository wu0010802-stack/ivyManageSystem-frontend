<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ApprovalStatus } from '@/constants/approvalStatus'
interface LeaveRequest { leave_type_label?: string; leave_hours?: number; status?: ApprovalStatus }
interface OvertimeRequest { overtime_type_label?: string; hours?: number; status?: ApprovalStatus }
interface DayEntry {
  day: number
  weekday?: string
  is_holiday?: boolean
  holiday_name?: string
  is_weekend?: boolean
  punch_in?: string | null
  punch_out?: string | null
  work_hours?: number | null
  is_late?: boolean
  late_minutes?: number
  is_early_leave?: boolean
  is_missing_punch_in?: boolean
  is_missing_punch_out?: boolean
  leave_type_label?: string
  shift_name?: string
  scheduled_start?: string
  scheduled_end?: string
  leave_requests?: LeaveRequest[]
  overtime_requests?: OvertimeRequest[]
}

const props = defineProps<{
  days: DayEntry[]
  month?: number | null
  /** 檢視當月時為今天的日號；檢視其他月份為 null。未來日會折疊起來。 */
  todayDay?: number | null
}>()

/**
 * 未來日折疊（P1-05）。
 *
 * 原本手機版把整月 30 天都畫成卡片，9/3 打開會看到 9/4–9/30 共 27 張
 * 「上班 — 下班 —」的空卡，整頁 6,900px，而老師來這頁通常只想確認
 * 今天／昨天有沒有打到卡。
 */
const pastDays = computed(() =>
  props.todayDay == null ? props.days : props.days.filter((d) => d.day <= props.todayDay!),
)
const futureDays = computed(() =>
  props.todayDay == null ? [] : props.days.filter((d) => d.day > props.todayDay!),
)
const futureExpanded = ref(false)
const visibleDays = computed(() =>
  futureExpanded.value ? props.days : pastDays.value,
)
const futureRangeLabel = computed(() => {
  const list = futureDays.value
  if (list.length === 0) return ''
  const m = props.month != null ? String(props.month).padStart(2, '0') : ''
  const first = String(list[0].day).padStart(2, '0')
  const last = String(list[list.length - 1].day).padStart(2, '0')
  return `${m}/${first} 至 ${m}/${last}`
})

function getStatusInfo(day: DayEntry) {
  if (day.is_holiday) return { text: day.holiday_name || '假日', tone: 'holiday' }
  // 週末 + 未打卡：左日期柱已顯示「週六/週日」，不再加 status pill
  if (day.is_weekend && !day.punch_in) return null
  if (day.leave_type_label) return { text: day.leave_type_label, tone: 'leave' }
  if (day.is_missing_punch_in || day.is_missing_punch_out) return { text: '缺卡', tone: 'danger' }
  if (day.is_late) return { text: `遲 ${day.late_minutes}m`, tone: 'warn' }
  if (day.is_early_leave) return { text: '早退', tone: 'warn' }
  if (day.punch_in) return { text: '正常', tone: 'ok' }
  return null
}

function getLeaveDisplay(day: DayEntry) {
  if (!day.leave_requests || day.leave_requests.length === 0) return null
  const lv = day.leave_requests[0]
  const status = lv.status ?? 'pending'
  return {
    text: lv.leave_type_label,
    hours: lv.leave_hours,
    status,
    statusLabel: status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核',
  }
}

function getOvertimeDisplay(day: DayEntry) {
  if (!day.overtime_requests || day.overtime_requests.length === 0) return null
  const ot = day.overtime_requests[0]
  const status = ot.status ?? 'pending'
  return {
    text: ot.overtime_type_label,
    hours: ot.hours,
    status,
    statusLabel: status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核',
  }
}

function getWorkHoursClass(day: DayEntry) {
  if (!day.work_hours || day.is_weekend) return ''
  if (day.work_hours < 8) return 'val--warn'
  return ''
}

function formatShift(day: DayEntry) {
  if (day.scheduled_start && day.scheduled_end) {
    return `${day.scheduled_start}–${day.scheduled_end}`
  }
  return day.shift_name || ''
}

function dayCardClass(day: DayEntry) {
  return {
    'day-card--weekend': day.is_weekend,
    'day-card--holiday': day.is_holiday,
    'day-card--anomaly': day.is_late || day.is_missing_punch_in || day.is_missing_punch_out || day.is_early_leave,
  }
}

function weekdayTone(day: DayEntry) {
  if (day.is_holiday) return 'holiday'
  if (day.is_weekend) return 'weekend'
  return ''
}

function formatDay(day: DayEntry, month: number | null | undefined) {
  const m = month != null ? String(month).padStart(2, '0') : ''
  return `${m}/${String(day.day).padStart(2, '0')}`
}
</script>

<template>
  <div class="mobile-cards" role="list">
    <article
      v-for="day in visibleDays"
      :key="day.day"
      :data-day="day.day"
      class="day-card"
      :class="dayCardClass(day)"
      role="listitem"
    >
      <!-- 左：日期柱 -->
      <div class="day-card__date" :class="`day-card__date--${weekdayTone(day)}`">
        <div class="day-card__day-num">{{ String(day.day).padStart(2, '0') }}</div>
        <div class="day-card__weekday">週{{ day.weekday }}</div>
      </div>

      <!-- 右：內容 -->
      <div class="day-card__main">
        <div class="day-card__top">
          <span class="day-card__date-label">{{ formatDay(day, month) }}</span>
          <span v-if="todayDay != null && day.day === todayDay" class="today-pill">今天</span>
          <span
            v-if="getStatusInfo(day)"
            class="status-pill"
            :class="`status-pill--${getStatusInfo(day)?.tone ?? ''}`"
          >
            <span
              v-if="['ok','warn','danger','leave','holiday'].includes(getStatusInfo(day)?.tone ?? '')"
              class="status-pill__dot"
              aria-hidden="true"
            />
            {{ getStatusInfo(day)?.text }}
          </span>
        </div>

        <!-- 假日：單行文字 -->
        <div v-if="day.is_holiday" class="day-card__holiday">
          {{ day.holiday_name }}
        </div>

        <!-- 出勤資料：上班/下班/工時 同一行 -->
        <div v-if="!day.is_weekend || day.punch_in" class="day-card__times">
          <div class="time-block">
            <span class="time-block__label">上班</span>
            <span class="time-block__val" :class="{ 'val--warn': day.is_late }">
              {{ day.punch_in || '—' }}
            </span>
          </div>
          <div class="time-block">
            <span class="time-block__label">下班</span>
            <span class="time-block__val">{{ day.punch_out || '—' }}</span>
          </div>
          <div v-if="day.work_hours != null" class="time-block">
            <span class="time-block__label">工時</span>
            <span class="time-block__val" :class="getWorkHoursClass(day)">
              {{ day.work_hours }}<span class="time-block__unit">h</span>
            </span>
          </div>
        </div>

        <!-- 班表：弱化次行 -->
        <div v-if="day.shift_name || (day.scheduled_start && day.scheduled_end)" class="day-card__shift">
          班表 · {{ formatShift(day) }}
        </div>

        <!-- 請假 / 加班：分行 badge -->
        <div v-if="getLeaveDisplay(day) || getOvertimeDisplay(day)" class="day-card__requests">
          <div v-if="getLeaveDisplay(day)" class="request-row">
            <span class="request-row__type">請假</span>
            <span class="request-row__text">
              {{ getLeaveDisplay(day)?.text }}
              <span class="request-row__hours">{{ getLeaveDisplay(day)?.hours }}h</span>
            </span>
            <span class="badge" :class="`badge--${getLeaveDisplay(day)?.status}`">
              {{ getLeaveDisplay(day)?.statusLabel }}
            </span>
          </div>
          <div v-if="getOvertimeDisplay(day)" class="request-row">
            <span class="request-row__type">加班</span>
            <span class="request-row__text">
              {{ getOvertimeDisplay(day)?.text }}
              <span class="request-row__hours">{{ getOvertimeDisplay(day)?.hours }}h</span>
            </span>
            <span class="badge" :class="`badge--${getOvertimeDisplay(day)?.status}`">
              {{ getOvertimeDisplay(day)?.statusLabel }}
            </span>
          </div>
        </div>
      </div>
    </article>

    <!-- 未來日折疊成一列，避免整月 27 張空卡把今天推到螢幕外（P1-05） -->
    <button
      v-if="futureDays.length > 0"
      type="button"
      class="future-toggle"
      :aria-expanded="futureExpanded"
      @click="futureExpanded = !futureExpanded"
    >
      <span>{{ futureRangeLabel }} 尚未到（{{ futureDays.length }} 天）</span>
      <span class="future-toggle__action">{{ futureExpanded ? '收合' : '展開' }}</span>
    </button>
  </div>
</template>

<style scoped>
.mobile-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* ===== 卡片：去除 side-stripe，改為左日期柱 + 右內容 ===== */
.day-card {
  display: flex;
  background: var(--pt-surface-card, var(--surface-color));
  border-radius: var(--radius-md);
  border: var(--pt-hairline, 1px solid var(--neutral-200));
  overflow: hidden;
  box-shadow: var(--pt-elev-1);
  transition: box-shadow var(--transition-fast);
}

.day-card--weekend {
  background: var(--neutral-50);
}

.day-card--holiday {
  background: var(--color-warning-soft);
}

.day-card--anomaly {
  border-color: var(--color-warning);
}

/* ===== 左：日期柱 ===== */
.day-card__date {
  flex-shrink: 0;
  width: 64px;
  padding: var(--space-3) 0;
  text-align: center;
  background: rgba(15, 23, 42, 0.03);
  border-right: 1px solid var(--neutral-100);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.day-card__day-num {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--pt-text-strong, var(--text-primary));
  line-height: 1;
  letter-spacing: -0.02em;
}

.day-card__weekday {
  font-size: 11px;
  font-weight: 500;
  color: var(--pt-text-muted, var(--text-secondary));
}

.day-card__date--weekend {
  background: rgba(15, 23, 42, 0.05);
}

.day-card__date--weekend .day-card__day-num,
.day-card__date--weekend .day-card__weekday {
  color: var(--pt-text-muted, var(--text-secondary));
}

.day-card__date--holiday {
  background: rgba(245, 158, 11, 0.12);
}

.day-card__date--holiday .day-card__day-num,
.day-card__date--holiday .day-card__weekday {
  color: var(--color-warning-darker);
}

/* ===== 右：內容 ===== */
.day-card__main {
  flex: 1;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.day-card__date-label {
  font-size: var(--text-xs);
  color: var(--pt-text-faint, var(--neutral-400));
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.today-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  white-space: nowrap;
}

.future-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2) var(--space-4);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
}
.future-toggle__action {
  color: var(--el-color-primary);
  font-weight: 500;
}

.day-card__holiday {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-warning-darker);
}

/* ===== 上班/下班/工時 同一行 ===== */
.day-card__times {
  display: flex;
  gap: var(--space-5);
  padding: 2px 0;
}

.time-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-block__label {
  font-size: 11px;
  color: var(--pt-text-muted, var(--text-secondary));
  font-weight: 500;
  letter-spacing: 0.02em;
}

.time-block__val {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--pt-text-strong, var(--text-primary));
  font-variant-numeric: tabular-nums;
}

.time-block__unit {
  font-size: 0.75em;
  font-weight: 500;
  margin-left: 1px;
  color: var(--pt-text-muted, var(--text-secondary));
}

.val--warn {
  color: var(--color-warning-darker);
}

/* ===== 班表：弱化次行 ===== */
.day-card__shift {
  font-size: 11px;
  color: var(--pt-text-muted, var(--text-secondary));
  font-variant-numeric: tabular-nums;
}

/* ===== 請假 / 加班 row ===== */
.day-card__requests {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px dashed var(--neutral-200);
}

.request-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.request-row__type {
  font-size: 11px;
  font-weight: 600;
  color: var(--pt-text-muted, var(--text-secondary));
  background: var(--neutral-100);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.request-row__text {
  flex: 1;
  min-width: 0;
  color: var(--pt-text-body, var(--text-primary));
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.request-row__hours {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--pt-text-muted, var(--text-secondary));
  font-variant-numeric: tabular-nums;
}

/* ===== Status pill：與 desktop 共用語言 ===== */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.status-pill__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.status-pill--ok {
  color: var(--color-success-darker);
  background: var(--color-success-soft);
}

.status-pill--warn {
  color: var(--color-warning-darker);
  background: var(--color-warning-soft);
}

.status-pill--danger {
  color: var(--color-danger-darker);
  background: var(--color-danger-soft);
  font-weight: 600;
}

.status-pill--leave {
  color: var(--color-info-darker);
  background: var(--color-info-soft);
}

.status-pill--holiday {
  color: var(--color-warning-darker);
  background: transparent;
  font-weight: 600;
}

.status-pill--weekend {
  color: var(--pt-text-muted, var(--text-secondary));
  background: transparent;
  font-weight: 400;
}

/* ===== Badge 三段化：approved 灰 / pending 凸 / rejected outline ===== */
.badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
}

.badge--approved {
  background: var(--neutral-100);
  color: var(--pt-text-muted, var(--text-secondary));
  border: 1px solid var(--neutral-200);
}

.badge--pending {
  background: var(--color-warning);
  color: #fff;
}

.badge--rejected {
  background: transparent;
  color: var(--color-danger-darker);
  border: 1px solid var(--color-danger);
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

import type { ApprovalStatus } from '@/constants/approvalStatus'
interface LeaveRequest { leave_type_label?: string; leave_hours?: number; status?: ApprovalStatus; reason?: string }
interface OvertimeRequest { overtime_type_label?: string; hours?: number; status?: ApprovalStatus; reason?: string }
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

interface DayDisplay { text: string; tone: string }
interface RequestDisplay { text: string; tooltip: string; status: string }

const props = defineProps<{
  days: DayEntry[]
  usesShift?: boolean
}>()

// Split days into upper (1-15) and lower (16-end) rows for the grid
const upperDays = computed(() => props.days.slice(0, 15))
const lowerDays = computed(() => props.days.slice(15))

// 預計算每天的請假/加班顯示資訊
const dayDisplayMap = computed(() => {
  const map = new Map<number, { leave: RequestDisplay | null; overtime: RequestDisplay | null; status: DayDisplay }>()
  for (const day of props.days) {
    map.set(day.day, {
      leave: getLeaveDisplay(day),
      overtime: getOvertimeDisplay(day),
      status: getStatusInfo(day),
    })
  }
  return map
})

function getStatusInfo(day: DayEntry): DayDisplay {
  if (day.is_holiday) return { text: day.holiday_name || '假', tone: 'holiday' }
  if (day.is_weekend) return { text: day.weekday ?? '', tone: 'weekend' }
  if (day.leave_type_label) return { text: day.leave_type_label, tone: 'leave' }
  if (day.is_missing_punch_in || day.is_missing_punch_out) return { text: '缺卡', tone: 'danger' }
  if (day.is_late) return { text: `遲${day.late_minutes}`, tone: 'warn' }
  if (day.is_early_leave) return { text: '早退', tone: 'warn' }
  if (day.punch_in) return { text: '正常', tone: 'ok' }
  return { text: '', tone: 'empty' }
}

function getLeaveDisplay(day: DayEntry): RequestDisplay | null {
  if (!day.leave_requests || day.leave_requests.length === 0) return null
  const lv = day.leave_requests[0]
  const status = lv.status ?? 'pending'
  const statusText = status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核'
  return {
    text: lv.leave_type_label ?? '',
    tooltip: `${lv.leave_type_label ?? ''} ${lv.leave_hours ?? ''}h\n${statusText}${lv.reason ? '\n原因: ' + lv.reason : ''}`,
    status,
  }
}

function getOvertimeDisplay(day: DayEntry): RequestDisplay | null {
  if (!day.overtime_requests || day.overtime_requests.length === 0) return null
  const ot = day.overtime_requests[0]
  const status = ot.status ?? 'pending'
  const statusText = status === 'approved' ? '已核准' : status === 'rejected' ? '已駁回' : '待審核'
  return {
    text: `${ot.hours}h`,
    tooltip: `${ot.overtime_type_label} ${ot.hours}h\n${statusText}${ot.reason ? '\n原因: ' + ot.reason : ''}`,
    status,
  }
}

function getWorkHoursClass(day: DayEntry) {
  if (!day.work_hours || day.is_weekend) return ''
  if (day.work_hours < 8) return 'hours-short'
  return ''
}

function formatShift(day: DayEntry) {
  if (day.scheduled_start && day.scheduled_end) {
    return `${day.scheduled_start}-${day.scheduled_end}`
  }
  return day.shift_name || ''
}

function dayHeaderClass(day: DayEntry) {
  return {
    'is-weekend': day.is_weekend,
    'is-holiday': day.is_holiday,
  }
}
</script>

<template>
  <div class="attendance-grid" data-test="attendance-table">
    <!-- Upper half: day 1-15 -->
    <table class="att-table">
      <thead>
        <tr>
          <th class="label-col" scope="col">日期</th>
          <th
            v-for="day in upperDays"
            :key="day.day"
            class="day-col day-head"
            :class="dayHeaderClass(day)"
            scope="col"
          >
            <span class="day-head__num">{{ day.day }}</span>
            <span class="day-head__week">{{ day.weekday }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="usesShift">
          <th class="label-col" scope="row">班表</th>
          <td v-for="day in upperDays" :key="'sh'+day.day" class="day-col shift-col"
              :class="dayHeaderClass(day)">
            {{ formatShift(day) }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">上班</th>
          <td v-for="day in upperDays" :key="'in'+day.day" class="day-col time-col"
              :class="[dayHeaderClass(day), { late: day.is_late }]">
            {{ day.punch_in || (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">下班</th>
          <td v-for="day in upperDays" :key="'out'+day.day" class="day-col time-col"
              :class="dayHeaderClass(day)">
            {{ day.punch_out || (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">工時</th>
          <td v-for="day in upperDays" :key="'h'+day.day" class="day-col hours-col"
              :class="[dayHeaderClass(day), getWorkHoursClass(day)]">
            {{ day.work_hours != null ? day.work_hours : (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">狀態</th>
          <td v-for="day in upperDays" :key="'s'+day.day" class="day-col status-col"
              :class="dayHeaderClass(day)">
            <span
              v-if="dayDisplayMap.get(day.day)?.status.text"
              class="status-pill"
              :class="`status-pill--${dayDisplayMap.get(day.day)!.status.tone}`"
            >
              <span v-if="['ok','warn','danger','leave','holiday'].includes(dayDisplayMap.get(day.day)!.status.tone)"
                    class="status-pill__dot" aria-hidden="true"></span>
              {{ dayDisplayMap.get(day.day)?.status.text }}
            </span>
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">請假</th>
          <td v-for="day in upperDays" :key="'lv'+day.day" class="day-col"
              :class="dayHeaderClass(day)">
            <el-tooltip
              v-if="dayDisplayMap.get(day.day)?.leave"
              :content="dayDisplayMap.get(day.day)?.leave?.tooltip"
              placement="top"
            >
              <span class="badge" :class="`badge--${dayDisplayMap.get(day.day)?.leave?.status}`">
                {{ dayDisplayMap.get(day.day)?.leave?.text }}
              </span>
            </el-tooltip>
            <template v-else>{{ day.is_weekend ? '' : '·' }}</template>
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">加班</th>
          <td v-for="day in upperDays" :key="'ot'+day.day" class="day-col"
              :class="dayHeaderClass(day)">
            <el-tooltip
              v-if="dayDisplayMap.get(day.day)?.overtime"
              :content="dayDisplayMap.get(day.day)?.overtime?.tooltip"
              placement="top"
            >
              <span class="badge" :class="`badge--${dayDisplayMap.get(day.day)?.overtime?.status}`">
                {{ dayDisplayMap.get(day.day)?.overtime?.text }}
              </span>
            </el-tooltip>
            <template v-else>{{ day.is_weekend ? '' : '·' }}</template>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Lower half: day 16+ -->
    <table class="att-table att-table--lower">
      <thead>
        <tr>
          <th class="label-col" scope="col">日期</th>
          <th
            v-for="day in lowerDays"
            :key="day.day"
            class="day-col day-head"
            :class="dayHeaderClass(day)"
            scope="col"
          >
            <span class="day-head__num">{{ day.day }}</span>
            <span class="day-head__week">{{ day.weekday }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="usesShift">
          <th class="label-col" scope="row">班表</th>
          <td v-for="day in lowerDays" :key="'sh'+day.day" class="day-col shift-col"
              :class="dayHeaderClass(day)">
            {{ formatShift(day) }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">上班</th>
          <td v-for="day in lowerDays" :key="'in'+day.day" class="day-col time-col"
              :class="[dayHeaderClass(day), { late: day.is_late }]">
            {{ day.punch_in || (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">下班</th>
          <td v-for="day in lowerDays" :key="'out'+day.day" class="day-col time-col"
              :class="dayHeaderClass(day)">
            {{ day.punch_out || (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">工時</th>
          <td v-for="day in lowerDays" :key="'h'+day.day" class="day-col hours-col"
              :class="[dayHeaderClass(day), getWorkHoursClass(day)]">
            {{ day.work_hours != null ? day.work_hours : (day.is_weekend ? '' : '—') }}
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">狀態</th>
          <td v-for="day in lowerDays" :key="'s'+day.day" class="day-col status-col"
              :class="dayHeaderClass(day)">
            <span
              v-if="dayDisplayMap.get(day.day)?.status.text"
              class="status-pill"
              :class="`status-pill--${dayDisplayMap.get(day.day)!.status.tone}`"
            >
              <span v-if="['ok','warn','danger','leave','holiday'].includes(dayDisplayMap.get(day.day)!.status.tone)"
                    class="status-pill__dot" aria-hidden="true"></span>
              {{ dayDisplayMap.get(day.day)?.status.text }}
            </span>
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">請假</th>
          <td v-for="day in lowerDays" :key="'lv'+day.day" class="day-col"
              :class="dayHeaderClass(day)">
            <el-tooltip
              v-if="dayDisplayMap.get(day.day)?.leave"
              :content="dayDisplayMap.get(day.day)?.leave?.tooltip"
              placement="top"
            >
              <span class="badge" :class="`badge--${dayDisplayMap.get(day.day)?.leave?.status}`">
                {{ dayDisplayMap.get(day.day)?.leave?.text }}
              </span>
            </el-tooltip>
            <template v-else>{{ day.is_weekend ? '' : '·' }}</template>
          </td>
        </tr>
        <tr>
          <th class="label-col" scope="row">加班</th>
          <td v-for="day in lowerDays" :key="'ot'+day.day" class="day-col"
              :class="dayHeaderClass(day)">
            <el-tooltip
              v-if="dayDisplayMap.get(day.day)?.overtime"
              :content="dayDisplayMap.get(day.day)?.overtime?.tooltip"
              placement="top"
            >
              <span class="badge" :class="`badge--${dayDisplayMap.get(day.day)?.overtime?.status}`">
                {{ dayDisplayMap.get(day.day)?.overtime?.text }}
              </span>
            </el-tooltip>
            <template v-else>{{ day.is_weekend ? '' : '·' }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.attendance-grid {
  overflow-x: auto;
}

.att-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  table-layout: fixed;
}

.att-table--lower {
  margin-top: var(--space-4);
}

.att-table th,
.att-table td {
  border-bottom: 1px solid var(--neutral-100);
  padding: 8px 4px;
  text-align: center;
  min-width: 48px;
  color: var(--pt-text-body, var(--text-primary));
}

.att-table tbody tr:hover td:not(.label-col):not(.is-weekend):not(.is-holiday) {
  background: var(--neutral-50);
}

/* ===== 表頭：日期 + 星期 共一格 ===== */
.day-head {
  background: var(--neutral-50);
  font-weight: 600;
  padding: 6px 4px;
  border-bottom: 2px solid var(--neutral-200);
  vertical-align: middle;
}

.day-head__num {
  display: block;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--pt-text-strong, var(--text-primary));
  font-variant-numeric: tabular-nums;
}

.day-head__week {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--pt-text-muted, var(--text-secondary));
  margin-top: 1px;
}

/* ===== 標籤列：作為 row header ===== */
.label-col {
  min-width: 56px;
  width: 56px;
  font-weight: 600;
  font-size: var(--text-xs);
  background: var(--neutral-50);
  color: var(--pt-text-muted, var(--text-secondary));
  text-align: left;
  padding-left: var(--space-3);
  letter-spacing: 0.02em;
  border-right: 1px solid var(--neutral-100);
  border-bottom: 1px solid var(--neutral-100);
}

/* ===== Weekend / Holiday：去 danger-soft，改用中性靜默 ===== */
.is-weekend {
  background: var(--neutral-50);
  color: var(--pt-text-muted, var(--text-secondary));
}

.day-head.is-weekend .day-head__num,
.day-head.is-weekend .day-head__week {
  color: var(--pt-text-muted, var(--text-secondary));
}

.is-holiday {
  background: var(--color-warning-soft);
}

.day-head.is-holiday .day-head__num {
  color: var(--color-warning-darker);
}
.day-head.is-holiday .day-head__week {
  color: var(--color-warning-darker);
  opacity: 0.85;
}

/* ===== 時間 / 工時：突出 tabular nums，異常用文字色 ===== */
.time-col {
  color: var(--pt-text-body, var(--text-primary));
}

.time-col.late {
  color: var(--color-warning-darker);
  font-weight: 600;
}

.hours-col {
  font-weight: 600;
  color: var(--pt-text-strong, var(--text-primary));
}

.hours-col.hours-short {
  color: var(--color-warning-darker);
}

.shift-col {
  font-size: 11px;
  color: var(--pt-text-muted, var(--text-secondary));
  letter-spacing: -0.02em;
}

/* ===== 狀態 pill：dot + text，不再彩色滿底 ===== */
.status-col {
  padding: 6px 4px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--radius-full);
  white-space: nowrap;
  background: transparent;
  color: var(--pt-text-body, var(--text-primary));
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
  font-weight: 600;
}

.status-pill--weekend {
  color: var(--pt-text-muted, var(--text-secondary));
  font-weight: 400;
}

/* ===== Badge 三段化：approved 灰 / pending 凸 / rejected 深紅 outline ===== */
.badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  cursor: help;
  white-space: nowrap;
}

.badge--approved {
  background: var(--neutral-100);
  color: var(--pt-text-muted, var(--text-secondary));
  border: 1px solid var(--neutral-200);
}

.badge--pending {
  background: var(--color-warning);
  color: #fff;
  border: 1px solid transparent;
}

.badge--rejected {
  background: var(--surface-color, #fff);
  color: var(--color-danger-darker);
  border: 1px solid var(--color-danger);
}

/* ===== Print：黑白可印 ===== */
@media print {
  .att-table {
    font-size: 10px;
  }
  .att-table th,
  .att-table td {
    border: 0.5px solid #999;
    padding: 4px 2px;
  }
  .day-head {
    background: #f5f5f5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .is-weekend,
  .is-holiday {
    background: #fafafa !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .status-pill,
  .badge {
    border: 0.5px solid #666;
    background: transparent !important;
    color: #000 !important;
  }
}
</style>

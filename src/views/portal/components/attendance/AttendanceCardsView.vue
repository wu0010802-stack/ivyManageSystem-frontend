<script setup>
defineProps({
  days: { type: Array, required: true },
  // 用於顯示日期：'MM/DD' 格式需要月份
  month: { type: Number, default: null },
})

const getStatusTag = (day) => {
  if (day.is_holiday) return { text: day.holiday_name, type: 'danger', effect: 'dark' }
  if (day.is_weekend) return { text: day.weekday, type: 'info' }
  if (day.leave_type_label) return { text: day.leave_type_label, type: 'info' }
  if (day.is_late) return { text: `遲${day.late_minutes}分`, type: 'warning' }
  if (day.is_missing_punch_in || day.is_missing_punch_out) return { text: '缺卡', type: 'danger' }
  if (day.is_early_leave) return { text: '早退', type: 'warning' }
  if (day.punch_in) return { text: '正常', type: 'success' }
  return { text: '-', type: 'info' }
}

const getLeaveDisplay = (day) => {
  if (!day.leave_requests || day.leave_requests.length === 0) return null
  const lv = day.leave_requests[0]
  const statusIcon = lv.is_approved === true ? '✓' : lv.is_approved === false ? '✗' : '⏳'
  return {
    text: lv.leave_type_label,
    statusIcon,
    tooltip: `${lv.leave_type_label} ${lv.leave_hours}h\n${statusIcon === '✓' ? '已核准' : statusIcon === '✗' ? '已駁回' : '待審核'}${lv.reason ? '\n原因: ' + lv.reason : ''}`,
    approved: lv.is_approved,
  }
}

const getOvertimeDisplay = (day) => {
  if (!day.overtime_requests || day.overtime_requests.length === 0) return null
  const ot = day.overtime_requests[0]
  const statusIcon = ot.is_approved === true ? '✓' : ot.is_approved === false ? '✗' : '⏳'
  return {
    text: `${ot.hours}h`,
    statusIcon,
    tooltip: `${ot.overtime_type_label} ${ot.hours}h\n${statusIcon === '✓' ? '已核准' : statusIcon === '✗' ? '已駁回' : '待審核'}${ot.reason ? '\n原因: ' + ot.reason : ''}`,
    approved: ot.is_approved,
  }
}

const getWorkHoursClass = (day) => {
  if (!day.work_hours || day.is_weekend) return ''
  if (day.work_hours < 8) return 'hours-short'
  return 'hours-ok'
}

const getApprovalLabel = (val) => {
  if (val === true) return '已核准'
  if (val === false) return '已駁回'
  return '待審核'
}

const getApprovalClass = (val) => {
  if (val === true) return 'approved'
  if (val === false) return 'rejected'
  return 'pending'
}

const formatShift = (day) => {
  if (day.scheduled_start && day.scheduled_end) {
    return `${day.scheduled_start}-${day.scheduled_end}`
  }
  return day.shift_name || (day.is_weekend ? '' : '-')
}

const formatDate = (day, month) => {
  const m = month != null ? String(month).padStart(2, '0') : '??'
  return `${m}/${String(day.day).padStart(2, '0')}`
}
</script>

<template>
  <div class="mobile-cards">
    <div
      v-for="day in days"
      :key="day.day"
      class="day-card"
      :class="{
        'day-card--weekend': day.is_weekend,
        'day-card--holiday': day.is_holiday,
        'day-card--late': day.is_late,
      }"
    >
      <div class="day-card__header">
        <div class="day-card__date">
          <span class="day-num">{{ formatDate(day, month) }}</span>
          <span class="day-weekday" :class="{ 'text-red': day.is_weekend || day.is_holiday }">{{ day.weekday }}</span>
        </div>
        <el-tag :type="getStatusTag(day).type" size="small" effect="plain">
          {{ getStatusTag(day).text }}
        </el-tag>
      </div>

      <!-- Holiday banner -->
      <div v-if="day.is_holiday" class="day-card__holiday-banner">
        🎉 {{ day.holiday_name }}
      </div>

      <!-- Punch info -->
      <div class="day-card__body" v-if="!day.is_weekend || day.punch_in">
        <div class="day-card__row">
          <span class="row-label">上班</span>
          <span :class="{ late: day.is_late }">{{ day.punch_in || '-' }}</span>
        </div>
        <div class="day-card__row">
          <span class="row-label">下班</span>
          <span>{{ day.punch_out || '-' }}</span>
        </div>
        <div class="day-card__row" v-if="day.work_hours != null">
          <span class="row-label">工時</span>
          <span :class="getWorkHoursClass(day)">{{ day.work_hours }}h</span>
        </div>
        <div class="day-card__row" v-if="day.shift_name">
          <span class="row-label">班表</span>
          <span class="text-gray">{{ formatShift(day) }}</span>
        </div>
      </div>

      <!-- Leave / Overtime requests -->
      <div class="day-card__footer" v-if="getLeaveDisplay(day) || getOvertimeDisplay(day)">
        <div v-if="getLeaveDisplay(day)" class="day-card__request">
          <span class="request-badge" :class="getApprovalClass(getLeaveDisplay(day).approved)">
            請假: {{ getLeaveDisplay(day).text }}
          </span>
          <span class="approval-text" :class="getApprovalClass(getLeaveDisplay(day).approved)">
            {{ getApprovalLabel(getLeaveDisplay(day).approved) }}
          </span>
        </div>
        <div v-if="getOvertimeDisplay(day)" class="day-card__request">
          <span class="request-badge" :class="getApprovalClass(getOvertimeDisplay(day).approved)">
            加班: {{ getOvertimeDisplay(day).text }}
          </span>
          <span class="approval-text" :class="getApprovalClass(getOvertimeDisplay(day).approved)">
            {{ getApprovalLabel(getOvertimeDisplay(day).approved) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.day-card {
  background: var(--surface-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.day-card--weekend {
  border-left: 4px solid var(--color-danger);
  background-color: #fcfcfc;
}

.day-card--holiday {
  border-left: 4px solid var(--color-warning);
  background-color: #fffbf0;
}

.day-card--late {
  border-left: 4px solid var(--color-warning);
}

.day-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
}

.day-card__date {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.day-num {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.day-weekday {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.text-red { color: var(--color-danger); }
.text-gray { color: var(--text-secondary); }

.day-card__holiday-banner {
  padding: 8px var(--space-4);
  background: linear-gradient(135deg, #fff7ed, #ffedd5);
  color: var(--color-warning);
  font-weight: 600;
  font-size: var(--text-sm);
}

.day-card__body {
  padding: var(--space-3) var(--space-4);
}

.day-card__row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: var(--text-base);
}

.row-label {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.late {
  color: var(--color-warning);
  font-weight: 600;
}

.hours-short {
  color: var(--color-danger);
  font-weight: 600;
}

.hours-ok {
  color: var(--color-success);
}

.day-card__footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--bg-color);
}

.day-card__request {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.request-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.request-badge.approved {
  background-color: #ecfdf5;
  color: var(--color-success);
  border-color: #a7f3d0;
}

.request-badge.rejected {
  background-color: #fef2f2;
  color: var(--color-danger);
  border-color: #fecaca;
}

.request-badge.pending {
  background-color: #fff7ed;
  color: var(--color-warning);
  border-color: #fed7aa;
}

.approval-text {
  font-size: var(--text-xs);
  font-weight: 600;
}

.approval-text.approved { color: var(--color-success); }
.approval-text.rejected { color: var(--color-danger); }
.approval-text.pending { color: var(--color-warning); }
</style>

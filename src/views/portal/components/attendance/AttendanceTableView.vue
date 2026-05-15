<script setup>
import { computed } from 'vue'

const props = defineProps({
  days: { type: Array, required: true },
  usesShift: { type: Boolean, default: false },
})

// Split days into upper (1-15) and lower (16-end) rows for the grid
const upperDays = computed(() => props.days.slice(0, 15))
const lowerDays = computed(() => props.days.slice(15))

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

// 預計算每天的請假/加班顯示資訊
const dayDisplayMap = computed(() => {
  const map = new Map()
  for (const day of props.days) {
    map.set(day.day, {
      leave: getLeaveDisplay(day),
      overtime: getOvertimeDisplay(day),
    })
  }
  return map
})

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

const formatShift = (day) => {
  if (day.scheduled_start && day.scheduled_end) {
    return `${day.scheduled_start}-${day.scheduled_end}`
  }
  return day.shift_name || (day.is_weekend ? '' : '-')
}
</script>

<template>
  <div class="attendance-grid" data-test="attendance-table">
    <!-- Upper half: day 1-15 -->
    <table class="att-table">
      <thead>
        <tr>
          <th class="label-col">日期</th>
          <th v-for="day in upperDays" :key="day.day" class="day-col"
              :class="{ weekend: day.is_weekend, holiday: day.is_holiday }">
            {{ day.day }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="label-col">星期</td>
          <td v-for="day in upperDays" :key="'w'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend, holiday: day.is_holiday }">
            {{ day.weekday }}
          </td>
        </tr>
        <tr v-if="usesShift">
          <td class="label-col">班表</td>
          <td v-for="day in upperDays" :key="'sh'+day.day" class="day-col shift-col"
              :class="{ weekend: day.is_weekend }">
            {{ formatShift(day) }}
          </td>
        </tr>
        <tr>
          <td class="label-col">上班</td>
          <td v-for="day in upperDays" :key="'in'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend, late: day.is_late }">
            {{ day.punch_in || (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">下班</td>
          <td v-for="day in upperDays" :key="'out'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            {{ day.punch_out || (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">工時</td>
          <td v-for="day in upperDays" :key="'h'+day.day" class="day-col"
              :class="[{ weekend: day.is_weekend }, getWorkHoursClass(day)]">
            {{ day.work_hours != null ? day.work_hours + 'h' : (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">狀態</td>
          <td v-for="day in upperDays" :key="'s'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <el-tag :type="getStatusTag(day).type" size="small" effect="plain" v-if="!day.is_weekend || day.punch_in">
              {{ getStatusTag(day).text }}
            </el-tag>
          </td>
        </tr>
        <tr>
          <td class="label-col">請假</td>
          <td v-for="day in upperDays" :key="'lv'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <template v-if="dayDisplayMap.get(day.day)?.leave">
              <el-tooltip :content="dayDisplayMap.get(day.day).leave.tooltip" placement="top">
                <span class="request-badge" :class="{
                  approved: dayDisplayMap.get(day.day).leave.approved === true,
                  rejected: dayDisplayMap.get(day.day).leave.approved === false,
                  pending: dayDisplayMap.get(day.day).leave.approved === null || dayDisplayMap.get(day.day).leave.approved === undefined,
                }">
                  {{ dayDisplayMap.get(day.day).leave.text }}
                </span>
              </el-tooltip>
            </template>
            <template v-else>{{ day.is_weekend ? '' : '-' }}</template>
          </td>
        </tr>
        <tr>
          <td class="label-col">加班</td>
          <td v-for="day in upperDays" :key="'ot'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <template v-if="dayDisplayMap.get(day.day)?.overtime">
              <el-tooltip :content="dayDisplayMap.get(day.day).overtime.tooltip" placement="top">
                <span class="request-badge" :class="{
                  approved: dayDisplayMap.get(day.day).overtime.approved === true,
                  rejected: dayDisplayMap.get(day.day).overtime.approved === false,
                  pending: dayDisplayMap.get(day.day).overtime.approved === null || dayDisplayMap.get(day.day).overtime.approved === undefined,
                }">
                  {{ dayDisplayMap.get(day.day).overtime.text }}
                </span>
              </el-tooltip>
            </template>
            <template v-else>{{ day.is_weekend ? '' : '-' }}</template>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Lower half: day 16+ -->
    <table class="att-table" style="margin-top: 16px;">
      <thead>
        <tr>
          <th class="label-col">日期</th>
          <th v-for="day in lowerDays" :key="day.day" class="day-col"
              :class="{ weekend: day.is_weekend, holiday: day.is_holiday }">
            {{ day.day }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="label-col">星期</td>
          <td v-for="day in lowerDays" :key="'w'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend, holiday: day.is_holiday }">
            {{ day.weekday }}
          </td>
        </tr>
        <tr v-if="usesShift">
          <td class="label-col">班表</td>
          <td v-for="day in lowerDays" :key="'sh'+day.day" class="day-col shift-col"
              :class="{ weekend: day.is_weekend }">
            {{ formatShift(day) }}
          </td>
        </tr>
        <tr>
          <td class="label-col">上班</td>
          <td v-for="day in lowerDays" :key="'in'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend, late: day.is_late }">
            {{ day.punch_in || (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">下班</td>
          <td v-for="day in lowerDays" :key="'out'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            {{ day.punch_out || (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">工時</td>
          <td v-for="day in lowerDays" :key="'h'+day.day" class="day-col"
              :class="[{ weekend: day.is_weekend }, getWorkHoursClass(day)]">
            {{ day.work_hours != null ? day.work_hours + 'h' : (day.is_weekend ? '' : '-') }}
          </td>
        </tr>
        <tr>
          <td class="label-col">狀態</td>
          <td v-for="day in lowerDays" :key="'s'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <el-tag :type="getStatusTag(day).type" size="small" effect="plain" v-if="!day.is_weekend || day.punch_in">
              {{ getStatusTag(day).text }}
            </el-tag>
          </td>
        </tr>
        <tr>
          <td class="label-col">請假</td>
          <td v-for="day in lowerDays" :key="'lv'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <template v-if="dayDisplayMap.get(day.day)?.leave">
              <el-tooltip :content="dayDisplayMap.get(day.day).leave.tooltip" placement="top">
                <span class="request-badge" :class="{
                  approved: dayDisplayMap.get(day.day).leave.approved === true,
                  rejected: dayDisplayMap.get(day.day).leave.approved === false,
                  pending: dayDisplayMap.get(day.day).leave.approved === null || dayDisplayMap.get(day.day).leave.approved === undefined,
                }">
                  {{ dayDisplayMap.get(day.day).leave.text }}
                </span>
              </el-tooltip>
            </template>
            <template v-else>{{ day.is_weekend ? '' : '-' }}</template>
          </td>
        </tr>
        <tr>
          <td class="label-col">加班</td>
          <td v-for="day in lowerDays" :key="'ot'+day.day" class="day-col"
              :class="{ weekend: day.is_weekend }">
            <template v-if="dayDisplayMap.get(day.day)?.overtime">
              <el-tooltip :content="dayDisplayMap.get(day.day).overtime.tooltip" placement="top">
                <span class="request-badge" :class="{
                  approved: dayDisplayMap.get(day.day).overtime.approved === true,
                  rejected: dayDisplayMap.get(day.day).overtime.approved === false,
                  pending: dayDisplayMap.get(day.day).overtime.approved === null || dayDisplayMap.get(day.day).overtime.approved === undefined,
                }">
                  {{ dayDisplayMap.get(day.day).overtime.text }}
                </span>
              </el-tooltip>
            </template>
            <template v-else>{{ day.is_weekend ? '' : '-' }}</template>
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
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}

.att-table th, .att-table td {
  border: 1px solid var(--border-color);
  padding: 8px 6px;
  text-align: center;
  min-width: 55px;
}

.att-table th {
  background-color: var(--bg-color);
  font-weight: 600;
  color: var(--text-primary);
}

.label-col {
  min-width: 60px !important;
  width: 60px;
  font-weight: 600;
  background-color: var(--bg-color);
  color: var(--text-secondary);
}

.weekend {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}

.holiday {
  background-color: var(--color-warning-soft);
  color: var(--color-warning);
  font-weight: bold;
}

.late {
  color: var(--color-warning);
  font-weight: 600;
}

.shift-col {
  font-size: 12px;
  color: var(--text-secondary);
}

.hours-short {
  color: var(--color-danger);
  font-weight: 600;
}

.hours-ok {
  color: var(--color-success);
}

.request-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.request-badge.approved {
  background-color: var(--color-success-soft);
  color: var(--color-success);
  border-color: #a7f3d0;
}

.request-badge.rejected {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
  border-color: var(--color-danger-soft);
}

.request-badge.pending {
  background-color: var(--color-warning-soft);
  color: var(--color-warning);
  border-color: #fed7aa;
}
</style>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { getAttendanceSheet } from '@/api/portal'
import { getUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'

const loading = ref(false)
const userInfo = getUserInfo()

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const sheetData = ref(null)
const viewMode = ref('table') // 'table' or 'cards'
const sheetCache = new Map() // key: 'YYYY-M'，唯讀 View 快取可永久保留

// Auto-detect mobile
const isMobile = ref(window.innerWidth < 768)
const onResize = () => {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value && viewMode.value === 'table') viewMode.value = 'cards'
  if (!isMobile.value && viewMode.value === 'cards') viewMode.value = 'table'
}

const fetchSheet = async (force = false) => {
  const key = `${query.year}-${query.month}`
  if (!force && sheetCache.has(key)) {
    sheetData.value = sheetCache.get(key)
    return
  }
  loading.value = true
  try {
    const res = await getAttendanceSheet({ year: query.year, month: query.month })
    sheetData.value = res.data
    sheetCache.set(key, res.data)
  } catch (error) {
    ElMessage.error('載入失敗: ' + apiError(error, error.message))
  } finally {
    loading.value = false
  }
}

// Split days into upper (1-15) and lower (16-end) rows for the grid
const upperDays = computed(() => sheetData.value?.days?.slice(0, 15) || [])
const lowerDays = computed(() => sheetData.value?.days?.slice(15) || [])

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

// 預計算每天的請假/加班顯示資訊，避免 template 多次重複呼叫同函式
const dayDisplayMap = computed(() => {
  const map = new Map()
  if (!sheetData.value?.days) return map
  for (const day of sheetData.value.days) {
    map.set(day.day, {
      leave: getLeaveDisplay(day),
      overtime: getOvertimeDisplay(day),
    })
  }
  return map
})

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

const prevMonth = () => {
  if (query.month === 1) {
    query.year--
    query.month = 12
  } else {
    query.month--
  }
  fetchSheet()
}

const nextMonth = () => {
  if (query.month === 12) {
    query.year++
    query.month = 1
  } else {
    query.month++
  }
  fetchSheet()
}

onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
  fetchSheet()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="portal-attendance">
    <el-card class="header-card">
      <div class="sheet-header">
        <h2>出勤紀錄表</h2>
        <div class="month-nav">
          <el-button :icon="ArrowLeft" circle class="month-nav__btn" aria-label="上個月" @click="prevMonth" />
          <span class="month-label">{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
          <el-button :icon="ArrowRight" circle class="month-nav__btn" aria-label="下個月" @click="nextMonth" />
        </div>
      </div>
      <div class="employee-info" v-if="sheetData">
        <span><strong>姓名：</strong>{{ sheetData.employee_name }}</span>
        <span><strong>職稱：</strong>{{ userInfo?.title || '-' }}</span>
        <span class="hide-mobile"><strong>考核日期：</strong>{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
      </div>
    </el-card>

    <!-- Summary Stats -->
    <el-card v-if="sheetData" class="summary-card">
      <h3>本月出勤統計</h3>
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">{{ sheetData.summary.total_work_days }}</div>
          <div class="stat-label">出勤天數</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ sheetData.summary.avg_work_hours || 0 }}</div>
          <div class="stat-label">平均工時(h)</div>
        </div>
        <div class="stat-item warning">
          <div class="stat-value">{{ sheetData.summary.late_count }}</div>
          <div class="stat-label">遲到次數</div>
        </div>
        <div class="stat-item warning">
          <div class="stat-value">{{ sheetData.summary.early_leave_count }}</div>
          <div class="stat-label">早退次數</div>
        </div>
        <div class="stat-item danger">
          <div class="stat-value">{{ sheetData.summary.missing_punch_count }}</div>
          <div class="stat-label">缺卡次數</div>
        </div>
        <div class="stat-item info">
          <div class="stat-value">{{ sheetData.summary.leave_count }}</div>
          <div class="stat-label">請假天數</div>
        </div>
      </div>
    </el-card>

    <!-- ===== Table View (Desktop) ===== -->
    <el-card v-loading="loading" class="grid-card" v-if="viewMode === 'table'">
      <div class="attendance-grid" v-if="sheetData">
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
            <tr v-if="sheetData.uses_shift">
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
            <tr v-if="sheetData.uses_shift">
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
    </el-card>

    <!-- ===== Card View (Mobile) ===== -->
    <div v-if="viewMode === 'cards' && sheetData" v-loading="loading" class="mobile-cards">
      <div
        v-for="day in sheetData.days" :key="day.day"
        class="day-card"
        :class="{
          'day-card--weekend': day.is_weekend,
          'day-card--holiday': day.is_holiday,
          'day-card--late': day.is_late,
        }"
      >
        <div class="day-card__header">
          <div class="day-card__date">
            <span class="day-num">{{ String(query.month).padStart(2,'0') }}/{{ String(day.day).padStart(2,'0') }}</span>
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


  </div>
</template>

<style scoped>
.portal-attendance {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: var(--space-6);
  background-color: var(--surface-color);
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.sheet-header h2 {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text-primary);
}

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.month-nav__btn {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
}

.month-label {
  font-size: var(--text-xl);
  font-weight: 600;
  min-width: 140px;
  text-align: center;
  color: var(--text-primary);
}

.employee-info {
  display: flex;
  gap: var(--space-8);
  font-size: var(--text-base);
  color: var(--text-secondary);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}

.grid-card {
  margin-bottom: var(--space-6);
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
  background-color: #fef2f2; /* Red 50 */
  color: var(--color-danger);
}

.holiday {
  background-color: #fff7ed; /* Orange 50 */
  color: var(--color-warning);
  font-weight: bold;
}

.late {
  color: var(--color-warning);
  font-weight: 600;
}

.shift-col {
  font-size: 11px;
  color: var(--text-secondary);
}

.hours-short {
  color: var(--color-danger);
  font-weight: 600;
}

.hours-ok {
  color: var(--color-success);
}

.summary-card h3 {
  margin: 0 0 var(--space-5) 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-5);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-5) var(--space-4);
  background: var(--surface-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-item.warning .stat-value { color: var(--color-warning); }
.stat-item.danger .stat-value { color: var(--color-danger); }
.stat-item.info .stat-value { color: var(--text-secondary); }

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: 8px;
  font-weight: 500;
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

/* ===== Mobile Card View ===== */
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

.approval-text {
  font-size: var(--text-xs);
  font-weight: 600;
}

.approval-text.approved { color: var(--color-success); }
.approval-text.rejected { color: var(--color-danger); }
.approval-text.pending { color: var(--color-warning); }

/* ===== Mobile responsive ===== */
@media (max-width: 767px) {
  .sheet-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .sheet-header h2 {
    font-size: var(--text-2xl);
  }

  .month-label {
    font-size: var(--text-lg);
    min-width: 120px;
  }

  .employee-info {
    flex-direction: column;
    gap: 8px;
    padding-top: 0;
    border-top: none;
  }

  .hide-mobile {
    display: none;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .stat-item {
    padding: var(--space-4) var(--space-3);
  }

  .stat-value {
    font-size: var(--text-3xl);
  }

  .stat-label {
    font-size: var(--text-xs);
  }

  .summary-card h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-3);
  }
}
</style>

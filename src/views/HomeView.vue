<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import { useRouter } from 'vue-router'
import StatCard from '@/components/common/StatCard.vue'
import { useEmployeeStore } from '@/stores/employee'
import { hasPermission } from '@/utils/auth'

const router = useRouter()
const employeeStore = useEmployeeStore()
const loading = ref(false)

// 依角色決定是否顯示各區塊
const showAttendance = hasPermission('ATTENDANCE_READ')
const showApprovals = hasPermission('APPROVALS')
const showCalendar = hasPermission('CALENDAR')
const showEmployees = hasPermission('EMPLOYEES_READ')

const stats = computed(() => {
  const total = employeeStore.employees.length
  const teachers = employeeStore.employees.filter(e => {
    if (e.is_office_staff) return false
    const title = e.title || ''
    const position = e.position || ''
    return title.includes('師') || position.includes('師') ||
           title.includes('導') || position.includes('導')
  }).length
  return { total, teachers, others: total - teachers }
})

const studentCount = ref(0)
const todayStats = ref(null)
const approvalSummary = ref(null)
const upcomingEvents = ref([])
const attendanceAnomalies = ref(null)
const probationAlerts = ref(null)

const todayDateStr = computed(() => {
  const now = new Date()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日（星期${weekDays[now.getDay()]}）`
})

const groupedEvents = computed(() => {
  if (!upcomingEvents.value.length) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const map = {}
  for (const ev of upcomingEvents.value) {
    const key = ev.event_date
    if (!map[key]) {
      const evDate = new Date(key + 'T00:00:00')
      const diff = Math.round((evDate - today) / 86400000)
      let label
      if (diff === 0) label = '今天'
      else if (diff === 1) label = '明天'
      else if (diff === 2) label = '後天'
      else {
        const [, m, d] = key.split('-')
        label = `${parseInt(m)} 月 ${parseInt(d)} 日`
      }
      map[key] = { label, events: [] }
    }
    map[key].events.push(ev)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
})

const eventTagType = { meeting: '', activity: 'success', holiday: 'danger', general: 'info' }

const anomalyLabel = (type, minutes) => ({
  absent: '未打卡', late: `遲到 ${minutes} 分`, missing_punch: '缺打卡'
}[type] || type)

const anomalyTagType = (type) => ({
  absent: 'danger', late: 'warning', missing_punch: 'info'
}[type] || 'info')

const fetchDashboardData = async () => {
  loading.value = true
  await Promise.all([
    employeeStore.fetchEmployees().catch(() => {}),
    api.get('/students', { params: { limit: 1 } })
      .then(r => { studentCount.value = r.data.total })
      .catch(() => {}),
    showAttendance
      ? api.get('/attendance/today').then(r => { todayStats.value = r.data }).catch(() => {})
      : null,
    showApprovals
      ? api.get('/approval-summary').then(r => { approvalSummary.value = r.data }).catch(() => {})
      : null,
    showCalendar
      ? api.get('/upcoming-events').then(r => { upcomingEvents.value = r.data }).catch(() => {})
      : null,
    showAttendance
      ? api.get('/attendance/today-anomalies', { params: { late_threshold: 15 } })
          .then(r => { attendanceAnomalies.value = r.data }).catch(() => {})
      : null,
    showEmployees
      ? api.get('/probation-alerts')
          .then(r => { probationAlerts.value = r.data }).catch(() => {})
      : null,
  ].filter(Boolean))
  loading.value = false
}

const navigateTo = (path) => router.push(path)

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div class="dashboard-container" v-loading="loading">

    <!-- 歡迎區塊 -->
    <div class="welcome-section">
      <p class="text-secondary">歡迎回來，查看今日概況</p>
    </div>

    <!-- 人員統計卡 -->
    <el-row :gutter="24" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="教職員總數" :value="stats.total" icon="User" color="primary" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="教師人數" :value="stats.teachers" icon="Reading" color="success" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="全校在籍人數" :value="studentCount" icon="UserFilled" color="warning" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="其他人員" :value="stats.others" icon="More" color="info" />
      </el-col>
    </el-row>

    <!-- 今日出勤狀況（需 ATTENDANCE_READ 權限） -->
    <template v-if="showAttendance && todayStats">
      <div class="section-header">
        <span class="section-title">今日出勤狀況</span>
        <span class="section-date text-secondary">{{ todayDateStr }}</span>
      </div>
      <el-row :gutter="24" class="stats-row">
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="今日應出勤" :value="todayStats.total_employees" icon="Calendar" color="primary" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="已出勤" :value="todayStats.present_count" icon="Select" color="success" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="遲到" :value="todayStats.late_count" icon="AlarmClock" color="warning" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="未打卡" :value="todayStats.missing_count" icon="Warning" color="danger" />
        </el-col>
      </el-row>
    </template>

    <!-- 主要內容區 -->
    <el-row :gutter="24">
      <!-- 左欄：快速操作 -->
      <el-col :xs="24" :lg="16" class="mb-4">
        <el-card class="no-hover" header="快速操作">
          <div class="action-buttons">
            <div class="action-item" @click="navigateTo('/employees')">
              <div class="action-icon" style="background-color: var(--color-primary-lighter); color: var(--color-primary);">
                <el-icon><User /></el-icon>
              </div>
              <span>員工管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/attendance')">
              <div class="action-icon" style="background-color: var(--color-success-lighter); color: var(--color-success);">
                <el-icon><Clock /></el-icon>
              </div>
              <span>出勤查詢</span>
            </div>
            <div class="action-item" @click="navigateTo('/reports')">
              <div class="action-icon" style="background-color: var(--color-danger-lighter); color: var(--color-danger);">
                <el-icon><TrendCharts /></el-icon>
              </div>
              <span>報表統計</span>
            </div>
            <div class="action-item" @click="navigateTo('/settings')">
              <div class="action-icon" style="background-color: var(--bg-color-soft); color: var(--text-secondary);">
                <el-icon><Setting /></el-icon>
              </div>
              <span>系統設定</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右欄：動態卡片 -->
      <el-col :xs="24" :lg="8">

        <!-- 待審核提醒（需 APPROVALS 權限） -->
        <el-card v-if="showApprovals" class="no-hover mb-4">
          <template #header>
            <div class="card-header-row">
              <span>待審核提醒</span>
              <el-badge
                v-if="approvalSummary && approvalSummary.total > 0"
                :value="approvalSummary.total"
                type="danger"
              />
            </div>
          </template>
          <template v-if="approvalSummary">
            <div v-if="approvalSummary.total === 0" class="approval-done">
              <el-icon class="approval-done__icon"><CircleCheckFilled /></el-icon>
              <span>所有申請已審核完畢</span>
            </div>
            <div v-else class="approval-list">
              <div class="approval-item" v-if="approvalSummary.pending_leaves > 0">
                <span class="approval-item__label">待審請假</span>
                <el-tag type="warning" effect="plain" size="small">
                  {{ approvalSummary.pending_leaves }} 筆
                </el-tag>
              </div>
              <div class="approval-item" v-if="approvalSummary.pending_overtimes > 0">
                <span class="approval-item__label">待審加班</span>
                <el-tag type="warning" effect="plain" size="small">
                  {{ approvalSummary.pending_overtimes }} 筆
                </el-tag>
              </div>
              <template v-if="approvalSummary.this_month_pending_leaves > 0 || approvalSummary.this_month_pending_overtimes > 0">
                <el-divider style="margin: 4px 0;" />
                <div class="month-tag">本月</div>
                <div class="approval-item" v-if="approvalSummary.this_month_pending_leaves > 0">
                  <span class="approval-item__label">本月請假待審</span>
                  <el-tag type="danger" effect="plain" size="small">
                    {{ approvalSummary.this_month_pending_leaves }} 筆
                  </el-tag>
                </div>
                <div class="approval-item" v-if="approvalSummary.this_month_pending_overtimes > 0">
                  <span class="approval-item__label">本月加班待審</span>
                  <el-tag type="danger" effect="plain" size="small">
                    {{ approvalSummary.this_month_pending_overtimes }} 筆
                  </el-tag>
                </div>
              </template>
              <el-button
                type="primary"
                plain
                size="small"
                class="approval-btn"
                @click="navigateTo('/approvals')"
              >
                前往審核工作台 →
              </el-button>
            </div>
          </template>
          <div v-else class="approval-loading text-secondary">載入中…</div>
        </el-card>

        <!-- 今日打卡異常（需 ATTENDANCE_READ 權限） -->
        <el-card v-if="showAttendance && attendanceAnomalies" class="no-hover mb-4">
          <template #header>
            <div class="card-header-row">
              <span>今日打卡異常</span>
              <el-badge
                v-if="attendanceAnomalies.anomalies.length > 0"
                :value="attendanceAnomalies.anomalies.length"
                type="warning"
              />
            </div>
          </template>
          <div v-if="attendanceAnomalies.anomalies.length === 0" class="approval-done">
            <el-icon class="approval-done__icon"><CircleCheckFilled /></el-icon>
            <span>今日無異常紀錄</span>
          </div>
          <div v-else class="anomaly-list">
            <div
              v-for="(item, idx) in attendanceAnomalies.anomalies"
              :key="`${item.employee_id}-${item.anomaly_type}-${idx}`"
              class="anomaly-item"
            >
              <span class="anomaly-name">{{ item.employee_name }}</span>
              <el-tag :type="anomalyTagType(item.anomaly_type)" effect="plain" size="small">
                {{ anomalyLabel(item.anomaly_type, item.late_minutes) }}
              </el-tag>
            </div>
          </div>
          <div class="anomaly-hint text-secondary">
            遲到門檻：{{ attendanceAnomalies.late_threshold }} 分鐘
            <el-button link size="small" @click="navigateTo('/attendance')" style="margin-left: 8px;">
              查看出勤記錄 →
            </el-button>
          </div>
        </el-card>

        <!-- 近期行事曆（需 CALENDAR 權限） -->
        <el-card v-if="showCalendar" class="no-hover mb-4">
          <template #header>
            <div class="card-header-row">
              <span>近期行事曆</span>
              <el-button link size="small" @click="navigateTo('/calendar')">
                查看全部
              </el-button>
            </div>
          </template>
          <div v-if="groupedEvents.length === 0" class="events-empty text-secondary">
            近 7 天無排程活動
          </div>
          <div v-else class="events-list">
            <div v-for="group in groupedEvents" :key="group.label" class="event-group">
              <div class="event-group__date">{{ group.label }}</div>
              <div
                v-for="ev in group.events"
                :key="ev.id"
                class="event-item"
              >
                <el-tag
                  :type="eventTagType[ev.event_type] ?? 'info'"
                  effect="plain"
                  size="small"
                  class="event-item__tag"
                >
                  {{ ev.event_type_label }}
                </el-tag>
                <div class="event-item__body">
                  <span class="event-item__title">{{ ev.title }}</span>
                  <span v-if="!ev.is_all_day && ev.start_time" class="event-item__time text-secondary">
                    {{ ev.start_time }}{{ ev.end_time ? ` – ${ev.end_time}` : '' }}
                  </span>
                  <span v-if="ev.location" class="event-item__loc text-secondary">
                    <el-icon><Location /></el-icon> {{ ev.location }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 試用期即將到期（需 EMPLOYEES_READ 權限） -->
        <el-card
          v-if="showEmployees && probationAlerts && probationAlerts.employees.length > 0"
          class="no-hover mb-4"
        >
          <template #header>
            <div class="card-header-row">
              <span>試用期即將到期</span>
              <el-tag type="warning" effect="plain" size="small">{{ probationAlerts.next_month }}</el-tag>
            </div>
          </template>
          <div class="probation-list">
            <div
              v-for="emp in probationAlerts.employees"
              :key="emp.id"
              class="probation-item"
            >
              <div class="probation-name">{{ emp.name }}</div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="probation-date text-secondary">{{ emp.probation_end_date }}</span>
                <el-tag
                  :type="emp.days_remaining <= 14 ? 'danger' : 'warning'"
                  effect="plain"
                  size="small"
                >
                  剩 {{ emp.days_remaining }} 天
                </el-tag>
              </div>
            </div>
          </div>
          <el-button
            type="primary"
            plain
            size="small"
            class="approval-btn"
            @click="navigateTo('/employees')"
          >
            前往員工管理 →
          </el-button>
        </el-card>

        <!-- 系統狀態 -->
        <el-card class="no-hover" header="系統狀態">
          <div class="system-status-list">
            <div class="status-item">
              <span>系統運行狀態</span>
              <el-tag type="success" effect="dark" size="small">正常運行</el-tag>
            </div>
            <div class="status-item">
              <span>資料庫連線</span>
              <span class="status-ok">
                <span class="dot"></span> 正常
              </span>
            </div>
            <div class="status-item">
              <span>上次備份時間</span>
              <span class="text-secondary">今日 03:00</span>
            </div>
          </div>
        </el-card>

      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.welcome-section {
  margin-bottom: var(--space-6);
}

.stats-row {
  margin-bottom: var(--space-6);
}

/* Section divider */
.section-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.section-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.section-date {
  font-size: var(--text-sm);
}

/* Card header with action */
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Actions */
.action-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--space-5);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  transition: transform var(--transition-base);
}

.action-item:hover {
  transform: translateY(-2px);
}

.action-item:hover .action-icon {
  box-shadow: var(--shadow-md);
}

.action-item span {
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.action-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  transition: all var(--transition-slow);
}

/* Approval */
.approval-done {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-success);
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}

.approval-done__icon {
  font-size: 18px;
}

.approval-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.approval-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.approval-item__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.approval-btn {
  width: 100%;
  margin-top: var(--space-2);
}

.approval-loading {
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}

/* Events */
.events-empty {
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.event-group__date {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary, var(--text-secondary));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--border-color-light);
}

.event-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.event-item__tag {
  flex-shrink: 0;
  margin-top: 2px;
}

.event-item__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.event-item__title {
  font-size: var(--text-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-item__time,
.event-item__loc {
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  gap: 3px;
}

/* Status List */
.system-status-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-color-light);
}

.status-item:last-child {
  border-bottom: none;
}

.status-item span:first-child {
  color: var(--text-secondary);
  font-size: var(--text-base);
}

.status-ok {
  display: flex;
  align-items: center;
  color: var(--color-success);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  display: inline-block;
  background-color: var(--color-success);
}

.mb-4 {
  margin-bottom: var(--space-4);
}

/* Month tag for approval section */
.month-tag {
  font-size: var(--text-xs);
  color: var(--text-tertiary, var(--text-secondary));
  font-weight: 600;
  letter-spacing: 0.05em;
  margin: 2px 0;
}

/* Anomaly list */
.anomaly-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.anomaly-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.anomaly-name {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.anomaly-hint {
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-color-light);
}

/* Probation list */
.probation-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.probation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.probation-name {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.probation-date {
  font-size: var(--text-xs);
}
</style>

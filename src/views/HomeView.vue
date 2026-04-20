<script setup>
import {
  Calendar,
  CircleCheckFilled,
  Clock,
  Document,
  Location,
  Setting,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  Wallet,
} from '@element-plus/icons-vue'
import StatCard from '@/components/common/StatCard.vue'
import { useDashboardSections } from '@/composables'

const {
  loading,
  deferredSections,
  studentAttendanceSectionRef,
  anomaliesSectionRef,
  calendarSectionRef,
  showAttendance,
  showApprovals,
  showCalendar,
  showEmployees,
  showStudents,
  stats,
  studentCount,
  todayStats,
  attendanceAnomalies,
  studentAttendanceSummary,
  approvalSummary,
  todayDateStr,
  greeting,
  userName,
  groupedEvents,
  eventTagType,
  anomalyLabel,
  anomalyTagType,
  navigateTo,
} = useDashboardSections()
</script>

<template>
  <div class="dashboard-container" v-loading="loading">

    <!-- 頁首 -->
    <div class="dashboard-header">
      <div class="dashboard-header__left">
        <h1 class="dashboard-header__greeting">{{ greeting }}，{{ userName }}</h1>
        <p class="dashboard-header__sub">{{ todayDateStr }} &nbsp;·&nbsp; 查看今日學校概況</p>
      </div>
      <div class="dashboard-header__date-badge">
        <el-icon style="margin-right:4px;"><Calendar /></el-icon>
        {{ todayDateStr }}
      </div>
    </div>

    <!-- 學校概況 -->
    <div class="section-header section-header--top">
      <span class="section-title">學校概況</span>
    </div>
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="教職員總數" :value="stats.total" icon="User" color="primary" variant="filled" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="教師人數" :value="stats.teachers" icon="Reading" color="success" variant="filled" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="全校在籍人數" :value="studentCount" icon="UserFilled" color="warning" variant="filled" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" class="mb-4">
        <StatCard label="其他人員" :value="stats.others" icon="More" color="info" variant="filled" />
      </el-col>
    </el-row>

    <!-- 教師出勤狀況 -->
    <template v-if="showAttendance && todayStats">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-dot section-dot--blue"></span>
          <span class="section-title">教師出勤狀況</span>
        </div>
        <span class="section-date-chip">{{ todayDateStr }}</span>
      </div>
      <el-row :gutter="20" class="stats-row">
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

    <!-- 學生出勤狀況 -->
    <div
      v-if="showStudents"
      ref="studentAttendanceSectionRef"
      data-deferred-section="studentAttendance"
    >
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-dot section-dot--green"></span>
          <span class="section-title">今日學生出勤狀況</span>
        </div>
        <span class="section-date-chip">{{ todayDateStr }}</span>
      </div>
      <template v-if="studentAttendanceSummary">
        <el-row :gutter="20" class="stats-row">
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="今日在籍學生" :value="studentAttendanceSummary.total_students" icon="UserFilled" color="primary" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="已點名" :value="studentAttendanceSummary.recorded_count" icon="EditPen" color="success" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="到校" :value="studentAttendanceSummary.on_campus_count" icon="CircleCheck" color="warning" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="未點名" :value="studentAttendanceSummary.unmarked_count" icon="Warning" color="danger" />
          </el-col>
        </el-row>
        <el-card class="no-hover student-summary-bar">
          <div class="student-summary-bar__inner">
            <div class="student-summary-bar__stats">
              <span><strong>{{ studentAttendanceSummary.present_count }}</strong> 出席</span>
              <span><strong>{{ studentAttendanceSummary.late_count }}</strong> 遲到</span>
              <span><strong>{{ studentAttendanceSummary.absent_count }}</strong> 缺席</span>
              <span><strong>{{ studentAttendanceSummary.leave_count }}</strong> 請假</span>
              <span class="student-summary-bar__rate">點名完成率 <strong>{{ studentAttendanceSummary.record_completion_rate }}%</strong></span>
            </div>
            <el-button link size="small" @click="navigateTo('/student-attendance')">
              前往學生出席紀錄 →
            </el-button>
          </div>
        </el-card>
      </template>
      <el-card v-else class="no-hover dashboard-placeholder-card mb-4">
        <div class="dashboard-placeholder-card__text text-secondary">
          {{ deferredSections.studentAttendance.loaded ? '暫無學生出勤摘要資料' : '學生出勤摘要載入中...' }}
        </div>
      </el-card>
    </div>

    <!-- 主要內容 -->
    <el-row :gutter="20" style="margin-top: 8px;">

      <!-- 左欄：快速操作 -->
      <el-col :xs="24" :lg="16" class="mb-4">
        <el-card class="no-hover quick-actions-card">
          <template #header>
            <div class="card-header-row">
              <span class="card-header-title">快速操作</span>
            </div>
          </template>
          <div class="action-grid">
            <div class="action-item" @click="navigateTo('/employees')">
              <div class="action-circle action-circle--primary">
                <el-icon :size="22"><User /></el-icon>
              </div>
              <span>員工管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/students')">
              <div class="action-circle action-circle--warning">
                <el-icon :size="22"><UserFilled /></el-icon>
              </div>
              <span>學生管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/attendance')">
              <div class="action-circle action-circle--success">
                <el-icon :size="22"><Clock /></el-icon>
              </div>
              <span>出勤查詢</span>
            </div>
            <div class="action-item" @click="navigateTo('/salary')">
              <div class="action-circle action-circle--info">
                <el-icon :size="22"><Wallet /></el-icon>
              </div>
              <span>薪資管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/leaves')">
              <div class="action-circle action-circle--purple">
                <el-icon :size="22"><Document /></el-icon>
              </div>
              <span>請假管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/activity/dashboard')">
              <div class="action-circle action-circle--pink">
                <el-icon :size="22"><Trophy /></el-icon>
              </div>
              <span>活動管理</span>
            </div>
            <div class="action-item" @click="navigateTo('/reports')">
              <div class="action-circle action-circle--danger">
                <el-icon :size="22"><TrendCharts /></el-icon>
              </div>
              <span>報表統計</span>
            </div>
            <div class="action-item" @click="navigateTo('/settings')">
              <div class="action-circle action-circle--neutral">
                <el-icon :size="22"><Setting /></el-icon>
              </div>
              <span>系統設定</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右欄 -->
      <el-col :xs="24" :lg="8">

        <!-- 待審核提醒 -->
        <el-card v-if="showApprovals" class="no-hover side-card mb-4">
          <template #header>
            <div class="card-header-row">
              <span class="card-header-title">待審核提醒</span>
              <el-badge
                v-if="approvalSummary.total > 0"
                :value="approvalSummary.total"
                type="danger"
              />
            </div>
          </template>
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
        </el-card>

        <!-- 今日打卡異常 -->
        <div
          v-if="showAttendance"
          ref="anomaliesSectionRef"
          data-deferred-section="anomalies"
        >
        <el-card class="no-hover side-card mb-4">
          <template #header>
            <div class="card-header-row">
              <span class="card-header-title">今日打卡異常</span>
              <el-badge
                v-if="attendanceAnomalies && attendanceAnomalies.anomalies.length > 0"
                :value="attendanceAnomalies.anomalies.length"
                type="warning"
              />
            </div>
          </template>
          <div v-if="!deferredSections.anomalies.loaded" class="dashboard-card-loading text-secondary">
            正在整理今日異常紀錄...
          </div>
          <div v-else-if="attendanceAnomalies && attendanceAnomalies.anomalies.length === 0" class="approval-done">
            <el-icon class="approval-done__icon"><CircleCheckFilled /></el-icon>
            <span>今日無異常紀錄</span>
          </div>
          <div v-else-if="attendanceAnomalies" class="anomaly-list">
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
            <el-button link size="small" @click="navigateTo('/attendance')">
              查看出勤記錄 →
            </el-button>
          </div>
        </el-card>
        </div>

        <!-- 近期行事曆 -->
        <div
          v-if="showCalendar"
          ref="calendarSectionRef"
          data-deferred-section="calendar"
        >
        <el-card class="no-hover side-card mb-4">
          <template #header>
            <div class="card-header-row">
              <span class="card-header-title">近期行事曆</span>
              <el-button link size="small" @click="navigateTo('/calendar')">查看全部</el-button>
            </div>
          </template>
          <div v-if="!deferredSections.calendar.loaded" class="dashboard-card-loading text-secondary">
            正在載入近期行事曆...
          </div>
          <div v-else-if="groupedEvents.length === 0" class="events-empty text-secondary">
            近 7 天無排程活動
          </div>
          <div v-else class="events-list">
            <div v-for="group in groupedEvents" :key="group.label" class="event-group">
              <div class="event-group__date">{{ group.label }}</div>
              <div v-for="ev in group.events" :key="ev.id" class="event-item">
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
        </div>

      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
/* ── 整體容器 ── */
.dashboard-container {
  padding-bottom: 32px;
}

/* ── 頁首 ── */
.dashboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
  flex-wrap: wrap;
}

.dashboard-header__greeting {
  margin: 0 0 4px 0;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.3px;
}

.dashboard-header__sub {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.dashboard-header__date-badge {
  display: none; /* 移除右側重複日期，標題已顯示 */
}

.dashboard-placeholder-card {
  margin-bottom: 16px;
}

.dashboard-placeholder-card__text,
.dashboard-card-loading {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

/* ── Section header ── */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  margin-top: 4px;
}

.section-header--top {
  margin-bottom: 14px;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.section-dot--blue  { background: #4f46e5; }
.section-dot--green { background: #10b981; }

.section-date-chip {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  color: #64748b;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* ── Stats row ── */
.stats-row {
  margin-bottom: 24px;
}

.mb-4 {
  margin-bottom: 16px;
}

/* ── 學生出勤摘要條 ── */
.student-summary-bar {
  margin-top: calc(24px * -1 + 8px);
  margin-bottom: 28px;
}

.student-summary-bar__inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.student-summary-bar__stats {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #64748b;
  flex-wrap: wrap;
}

.student-summary-bar__rate {
  color: #4f46e5;
}

/* ── 快速操作 ── */
.quick-actions-card :deep(.el-card__body) {
  padding: 20px 24px 24px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 16px;
}

@media (max-width: 640px) {
  .action-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 16px 8px;
  border-radius: 12px;
  transition: background 0.18s ease;
}

.action-item:hover {
  background: #f8fafc;
}

.action-item span {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
  text-align: center;
}

.action-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.action-circle--primary { background: #e0e7ff; color: #4f46e5; }
.action-circle--success { background: #dcfce7; color: #10b981; }
.action-circle--warning { background: #fef3c7; color: #d97706; }
.action-circle--info    { background: #e0f2fe; color: #0284c7; }
.action-circle--purple  { background: #ede9fe; color: #7c3aed; }
.action-circle--pink    { background: #fce7f3; color: #db2777; }
.action-circle--danger  { background: #fee2e2; color: #ef4444; }
.action-circle--neutral { background: #f1f5f9; color: #64748b; }

.action-item:hover .action-circle--primary { background: #4f46e5; color: #fff; box-shadow: 0 4px 14px rgba(79,70,229,0.3); }
.action-item:hover .action-circle--success { background: #10b981; color: #fff; box-shadow: 0 4px 14px rgba(16,185,129,0.3); }
.action-item:hover .action-circle--warning { background: #d97706; color: #fff; box-shadow: 0 4px 14px rgba(217,119,6,0.3); }
.action-item:hover .action-circle--info    { background: #0284c7; color: #fff; box-shadow: 0 4px 14px rgba(2,132,199,0.3); }
.action-item:hover .action-circle--purple  { background: #7c3aed; color: #fff; box-shadow: 0 4px 14px rgba(124,58,237,0.3); }
.action-item:hover .action-circle--pink    { background: #db2777; color: #fff; box-shadow: 0 4px 14px rgba(219,39,119,0.3); }
.action-item:hover .action-circle--danger  { background: #ef4444; color: #fff; box-shadow: 0 4px 14px rgba(239,68,68,0.3); }
.action-item:hover .action-circle--neutral { background: #64748b; color: #fff; box-shadow: 0 4px 14px rgba(100,116,139,0.3); }

/* ── 右欄卡片共用 ── */
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

/* ── 審核 ── */
.approval-done {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #10b981;
  font-size: 13px;
  padding: 4px 0;
}

.approval-done__icon { font-size: 18px; }

.approval-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approval-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.approval-item__label {
  font-size: 13px;
  color: #64748b;
}

.approval-btn {
  width: 100%;
  margin-top: 4px;
}

.approval-loading {
  font-size: 13px;
  padding: 4px 0;
}

.month-tag {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin: 2px 0;
}

/* ── 異常 ── */
.anomaly-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.anomaly-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.anomaly-name {
  font-size: 13px;
  color: #1e293b;
}

.anomaly-hint {
  font-size: 12px;
  display: flex;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

/* ── 行事曆 ── */
.events-empty {
  font-size: 13px;
  padding: 4px 0;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.event-group__date {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f1f5f9;
}

.event-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
}

.event-item__tag { flex-shrink: 0; margin-top: 2px; }

.event-item__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.event-item__title {
  font-size: 13px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-item__time,
.event-item__loc {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 3px;
}

</style>

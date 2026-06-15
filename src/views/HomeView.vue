<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CircleCheckFilled,
  Clock,
  Document,
  Location,
  Select,
  Setting,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  Wallet,
} from '@element-plus/icons-vue'
import StatCard from '@/components/common/StatCard.vue'
import { useDashboardSections } from '@/composables'
import DisabilityExpirySection from '@/components/dashboard/DisabilityExpirySection.vue'
import IntegrationsHealthCard from '@/components/dashboard/IntegrationsHealthCard.vue'
import { hasPermission } from '@/utils/auth'
import QuickAddMenu, { type QuickAddDialogType } from '@/components/dashboard/QuickAddMenu.vue'
import QuickOvertimeDialog from '@/components/dashboard/quick-add/QuickOvertimeDialog.vue'
import QuickLeaveDialog from '@/components/dashboard/quick-add/QuickLeaveDialog.vue'
import QuickStudentDialog from '@/components/dashboard/quick-add/QuickStudentDialog.vue'
import QuickAnnouncementDialog from '@/components/dashboard/quick-add/QuickAnnouncementDialog.vue'
import QuickClassroomDialog from '@/components/dashboard/quick-add/QuickClassroomDialog.vue'

const quickAddDialogs = ref<Record<QuickAddDialogType, boolean>>({
  overtime: false,
  leave: false,
  student: false,
  announcement: false,
  classroom: false,
})
const openQuickAdd = (type: QuickAddDialogType) => {
  quickAddDialogs.value[type] = true
}

const {
  loading,
  isFirstLoad,
  deferredSections,
  studentAttendanceSectionRef,
  anomaliesSectionRef,
  calendarSectionRef,
  showAttendance,
  showApprovals,
  showCalendar,
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

// 外部整合健康徽章：AUDIT_LOGS 權限才看得到（與 /api/internal/integrations/health 對齊）
const showIntegrationsHealth = hasPermission('AUDIT_LOGS')

// 今日待辦：把分散在右欄/出勤摘要的「需要處理」數字升為頁面前段第一視覺
// Why: 既有 dashboard 全是統計數字（系統有什麼），把待審/異常/未點名前置成
//      「今天需要處理什麼」，讓使用者一眼知道下一步要點哪裡。
const todoTiles = computed(() => {
  const tiles = []

  if (showApprovals) {
    const pendingLeaves = approvalSummary.value?.pending_leaves ?? 0
    if (pendingLeaves > 0) {
      tiles.push({ key: 'leaves', label: '待審請假', count: pendingLeaves, tone: 'warning', path: '/approvals' })
    }
    const pendingOvertimes = approvalSummary.value?.pending_overtimes ?? 0
    if (pendingOvertimes > 0) {
      tiles.push({ key: 'overtimes', label: '待審加班', count: pendingOvertimes, tone: 'warning', path: '/approvals' })
    }
  }

  if (showAttendance && attendanceAnomalies.value) {
    const count = (attendanceAnomalies.value as { anomalies?: unknown[] }).anomalies?.length ?? 0
    if (count > 0) {
      tiles.push({ key: 'anomalies', label: '今日打卡異常', count, tone: 'danger', path: '/attendance' })
    }
  }

  if (showStudents && studentAttendanceSummary.value) {
    const unmarked = (studentAttendanceSummary.value as { unmarked_count?: number }).unmarked_count ?? 0
    if (unmarked > 0) {
      tiles.push({ key: 'unmarked', label: '學生未點名', count: unmarked, tone: 'danger', path: '/student-attendance' })
    }
  }

  return tiles
})

// 任何待辦資料尚未到齊則顯示骨架；都到齊且為 0 才顯示「全部清空」。
// 只依待辦板自己的三個資料源判斷，不再綁定 critical 概況統計的 loading flag——
// 待辦三來源已在 mount 時並行 eager 抓取，到齊即可顯示，毋須等其餘概況統計那一波。
const todoDataReady = computed(() => {
  if (showApprovals && approvalSummary.value == null) return false
  if (showAttendance && !deferredSections.anomalies?.loaded) return false
  if (showStudents && !deferredSections.studentAttendance?.loaded) return false
  return true
})

const showTodoSection = computed(
  () => showApprovals || showAttendance || showStudents
)

// Type helpers for composable data with loose types
interface TodayStats { total_employees: number; present_count: number; late_count: number; missing_count: number }
interface StudentAttendanceSummaryData { total_students: number; recorded_count: number; on_campus_count: number; unmarked_count: number; present_count: number; late_count: number; absent_count: number; leave_count: number; record_completion_rate: number }
interface AttendanceAnomaliesData { anomalies: { employee_id: unknown; anomaly_type: unknown; employee_name: unknown; late_minutes: unknown }[] }
interface EventTagTypeMap { [key: string]: 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined }

const typedTodayStats = computed(() => todayStats.value as TodayStats | null)
const typedStudentAttendanceSummary = computed(() => studentAttendanceSummary.value as StudentAttendanceSummaryData | null)
const typedAttendanceAnomalies = computed(() => attendanceAnomalies.value as AttendanceAnomaliesData | null)
const typedEventTagType = eventTagType as EventTagTypeMap
</script>

<template>
  <!--
    Why no full-page v-loading any longer:
    - greeting / 標題 / 快速操作 永遠該保持可見，避免重新整理時整頁變空白
    - 首載：本檔內各 stats-row 用 skeleton 替代；deferred section 自帶 placeholder
    - 後續刷新：頂部細條進度條（App.vue 提供）即可表示 navigating，不打斷工作流
  -->
  <div class="dashboard-container">

    <!-- 頁首 -->
    <div class="dashboard-header">
      <div class="dashboard-header__left">
        <h1 class="dashboard-header__greeting">{{ greeting }}，{{ userName }}</h1>
        <p class="dashboard-header__sub">{{ todayDateStr }} &nbsp;·&nbsp; 今天需要處理什麼</p>
      </div>
      <div class="dashboard-header__actions">
        <QuickAddMenu @open="openQuickAdd" />
      </div>
    </div>

    <!-- 今日待辦（升為主工作佇列） -->
    <section v-if="showTodoSection" class="todo-board" aria-label="今日待辦">
      <div class="section-header section-header--top">
        <div class="section-title-wrap">
          <span class="section-dot"></span>
          <span class="section-title">今日待辦</span>
        </div>
        <span v-if="todoDataReady && todoTiles.length > 0" class="section-date-chip">
          {{ todoTiles.reduce((sum, t) => sum + t.count, 0) }} 筆需處理
        </span>
      </div>

      <!-- 載入中骨架 -->
      <div v-if="!todoDataReady" class="todo-grid" aria-busy="true">
        <div v-for="i in 3" :key="i" class="todo-tile todo-tile--skeleton">
          <div class="skeleton-pulse todo-tile__skeleton-label" />
          <div class="skeleton-pulse todo-tile__skeleton-count" />
        </div>
      </div>

      <!-- 全部清空 -->
      <div v-else-if="todoTiles.length === 0" class="todo-empty">
        <el-icon class="todo-empty__icon"><CircleCheckFilled /></el-icon>
        <span>太好了！今天沒有待處理的工作。</span>
      </div>

      <!-- 待辦磚 -->
      <div v-else class="todo-grid">
        <button
          v-for="tile in todoTiles"
          :key="tile.key"
          type="button"
          class="todo-tile"
          :class="`todo-tile--${tile.tone}`"
          @click="navigateTo(tile.path)"
        >
          <div class="todo-tile__label">{{ tile.label }}</div>
          <div class="todo-tile__count">
            <span class="todo-tile__count-num">{{ tile.count }}</span>
            <span class="todo-tile__count-unit">筆</span>
          </div>
          <div class="todo-tile__cta">前往處理 →</div>
        </button>
      </div>
    </section>

    <!-- 學校概況 -->
    <div class="section-header section-header--top">
      <span class="section-title">學校概況</span>
    </div>
    <el-row v-if="isFirstLoad && loading" :gutter="20" class="stats-row" aria-busy="true">
      <el-col v-for="i in 4" :key="i" :xs="24" :sm="12" :md="6" class="mb-4">
        <div class="stat-skeleton">
          <div class="skeleton-pulse stat-skeleton__icon" />
          <div class="stat-skeleton__body">
            <div class="skeleton-pulse stat-skeleton__label" />
            <div class="skeleton-pulse stat-skeleton__value" />
          </div>
        </div>
      </el-col>
    </el-row>
    <el-row v-else :gutter="20" class="stats-row">
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

    <!-- 教師出勤狀況 -->
    <template v-if="showAttendance">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-dot"></span>
          <span class="section-title">教師出勤狀況</span>
        </div>
        <span class="section-date-chip">{{ todayDateStr }}</span>
      </div>
      <el-row v-if="isFirstLoad && !typedTodayStats" :gutter="20" class="stats-row" aria-busy="true">
        <el-col v-for="i in 4" :key="i" :xs="24" :sm="12" :md="6" class="mb-4">
          <div class="stat-skeleton">
            <div class="skeleton-pulse stat-skeleton__icon" />
            <div class="stat-skeleton__body">
              <div class="skeleton-pulse stat-skeleton__label" />
              <div class="skeleton-pulse stat-skeleton__value" />
            </div>
          </div>
        </el-col>
      </el-row>
      <el-row v-else-if="typedTodayStats" :gutter="20" class="stats-row">
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="今日應出勤" :value="typedTodayStats.total_employees" icon="Calendar" color="primary" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="已出勤" :value="typedTodayStats.present_count" :icon="Select" color="success" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="遲到" :value="typedTodayStats.late_count" icon="AlarmClock" color="warning" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="未打卡" :value="typedTodayStats.missing_count" icon="Warning" color="danger" />
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
          <span class="section-dot"></span>
          <span class="section-title">今日學生出勤狀況</span>
        </div>
        <span class="section-date-chip">{{ todayDateStr }}</span>
      </div>
      <template v-if="typedStudentAttendanceSummary">
        <el-row :gutter="20" class="stats-row">
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="今日在籍學生" :value="typedStudentAttendanceSummary.total_students" icon="UserFilled" color="primary" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="已點名" :value="typedStudentAttendanceSummary.recorded_count" icon="EditPen" color="success" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="到校" :value="typedStudentAttendanceSummary.on_campus_count" icon="CircleCheck" color="warning" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="未點名" :value="typedStudentAttendanceSummary.unmarked_count" icon="Warning" color="danger" />
          </el-col>
        </el-row>
        <el-card class="no-hover student-summary-bar">
          <div class="student-summary-bar__inner">
            <div class="student-summary-bar__stats">
              <span><strong>{{ typedStudentAttendanceSummary.present_count }}</strong> 出席</span>
              <span><strong>{{ typedStudentAttendanceSummary.late_count }}</strong> 遲到</span>
              <span><strong>{{ typedStudentAttendanceSummary.absent_count }}</strong> 缺席</span>
              <span><strong>{{ typedStudentAttendanceSummary.leave_count }}</strong> 請假</span>
              <span class="student-summary-bar__rate">點名完成率 <strong>{{ typedStudentAttendanceSummary.record_completion_rate }}%</strong></span>
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
            <router-link to="/employees" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><User /></el-icon>
              </div>
              <span>員工管理</span>
            </router-link>
            <router-link to="/students" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><UserFilled /></el-icon>
              </div>
              <span>學生管理</span>
            </router-link>
            <router-link to="/attendance" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Clock /></el-icon>
              </div>
              <span>出勤查詢</span>
            </router-link>
            <router-link to="/salary" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Wallet /></el-icon>
              </div>
              <span>薪資管理</span>
            </router-link>
            <router-link to="/leaves" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Document /></el-icon>
              </div>
              <span>請假管理</span>
            </router-link>
            <router-link to="/activity/dashboard" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Trophy /></el-icon>
              </div>
              <span>活動管理</span>
            </router-link>
            <router-link to="/reports" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><TrendCharts /></el-icon>
              </div>
              <span>報表統計</span>
            </router-link>
            <router-link to="/settings" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Setting /></el-icon>
              </div>
              <span>系統設定</span>
            </router-link>
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

        <!-- 身障鑑定即將到期 -->
        <DisabilityExpirySection />

        <!-- 外部整合健康徽章（Phase 4 P1 resilience；AUDIT_LOGS 權限） -->
        <IntegrationsHealthCard v-if="showIntegrationsHealth" />

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
                v-if="typedAttendanceAnomalies && typedAttendanceAnomalies.anomalies.length > 0"
                :value="typedAttendanceAnomalies.anomalies.length"
                type="warning"
              />
            </div>
          </template>
          <div v-if="!deferredSections.anomalies.loaded" class="dashboard-card-loading text-secondary">
            正在整理今日異常紀錄...
          </div>
          <div v-else-if="typedAttendanceAnomalies && typedAttendanceAnomalies.anomalies.length === 0" class="approval-done">
            <el-icon class="approval-done__icon"><CircleCheckFilled /></el-icon>
            <span>今日無異常紀錄</span>
          </div>
          <div v-else-if="typedAttendanceAnomalies" class="anomaly-list">
            <div
              v-for="(item, idx) in typedAttendanceAnomalies.anomalies"
              :key="`${item.employee_id}-${item.anomaly_type}-${idx}`"
              class="anomaly-item"
            >
              <span class="anomaly-name">{{ item.employee_name }}</span>
              <el-tag :type="(anomalyTagType(item.anomaly_type as string) as 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined)" effect="plain" size="small">
                {{ anomalyLabel(item.anomaly_type as string, item.late_minutes as number) }}
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
              <div v-for="ev in group.events" :key="ev.id as string | number" class="event-item">
                <el-tag
                  :type="typedEventTagType[ev.event_type as string] ?? 'info'"
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

    <!-- 快速新增 dialogs -->
    <QuickOvertimeDialog v-model:visible="quickAddDialogs.overtime" />
    <QuickLeaveDialog v-model:visible="quickAddDialogs.leave" />
    <QuickStudentDialog v-model:visible="quickAddDialogs.student" />
    <QuickAnnouncementDialog v-model:visible="quickAddDialogs.announcement" />
    <QuickClassroomDialog v-model:visible="quickAddDialogs.classroom" />
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
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.dashboard-header__sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.dashboard-header__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
  color: var(--text-primary);
}

/* Phase B：section-dot 3 種色（amber 待辦 / blue 教師出勤 / green 學生出勤）
   為散落的 skittles 反射；統一為 brand-primary，差異化交給 section title 文字 */
.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--brand-primary);
}

/* ── 今日待辦 todo board ── */
.todo-board {
  margin-bottom: 32px;
}

.todo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.todo-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 18px 14px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: var(--surface-color);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.todo-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.todo-tile:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

.todo-tile__label {
  font-size: 13px;
  color: var(--neutral-600);
  font-weight: 500;
}

.todo-tile__count {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.todo-tile__count-num {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.todo-tile__count-unit {
  font-size: 13px;
  color: var(--text-tertiary);
}

.todo-tile__cta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: auto;
}

.todo-tile--warning {
  background: var(--color-warning-soft);
  border-color: #fde68a;
}
.todo-tile--warning .todo-tile__count-num { color: var(--color-warning-darker); }

.todo-tile--danger {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}
.todo-tile--danger .todo-tile__count-num { color: var(--color-danger-darker); }

.todo-tile--skeleton {
  background: var(--bg-color);
  border-color: var(--border-color);
  cursor: default;
  pointer-events: none;
}
.todo-tile--skeleton:hover {
  transform: none;
  box-shadow: none;
}
.todo-tile__skeleton-label {
  width: 60%;
  height: 12px;
  border-radius: 4px;
}
.todo-tile__skeleton-count {
  width: 40%;
  height: 28px;
  border-radius: 6px;
}

.todo-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--color-success-soft);
  border: 1px solid var(--color-success-soft);
  color: var(--color-success-darker);
  font-size: 13px;
}

/* dark 下 success-darker 是深綠在淺底會 OK，但 dark 我們的 success-soft 已改 alpha tint，
   文字改用較亮的 success 主色確保對比 */
html.dark .todo-empty {
  color: var(--color-success);
}

.todo-empty__icon {
  font-size: 20px;
  color: var(--color-success);
}

.section-date-chip {
  display: inline-flex;
  align-items: center;
  background: var(--bg-color-soft);
  color: var(--text-secondary);
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
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.student-summary-bar__rate {
  color: var(--brand-primary);
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
  text-decoration: none;
  color: inherit;
}

.action-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 8px;
}

.action-item:hover {
  background: var(--bg-color);
}

.action-item span {
  font-size: 13px;
  color: var(--neutral-600);
  font-weight: 500;
  text-align: center;
}

/* Phase B 起手：8 種 tone variants 統一為單色 — 8 色彩虹 pill 是 SaaS-AI
   first-order 反射模式（identical card grids + 8 個圓圈 icon 等距並排），
   與 IvyKids 品牌的單一深綠 + 童彩 6 色「精緻使用」方向不一致。
   差異化交給 label 文字，色彩只強調 primary action。 */
.action-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.action-item:hover .action-circle {
  background: var(--brand-primary);
  color: #fff;
}

/* ── 右欄卡片共用 ── */
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ── 審核 ── */
.approval-done {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-success);
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
  color: var(--text-secondary);
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
  font-size: 12px;
  color: var(--text-tertiary);
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
  color: var(--text-primary);
}

.anomaly-hint {
  font-size: 12px;
  display: flex;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--bg-color-soft);
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
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--bg-color-soft);
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
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-item__time,
.event-item__loc {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* StatCard 首載骨架（保持與真實卡相近高度，避免換成真卡時版面跳動） */
.stat-skeleton {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-color, #fff);
  border: 1px solid var(--border-color-light, rgba(0, 0, 0, 0.06));
  min-height: 84px;
}
.stat-skeleton__icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
}
.stat-skeleton__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-skeleton__label {
  height: 12px;
  width: 60%;
  border-radius: 4px;
}
.stat-skeleton__value {
  height: 20px;
  width: 40%;
  border-radius: 4px;
}
</style>

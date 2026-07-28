<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlarmClock,
  Calendar,
  CircleCheck,
  CircleCheckFilled,
  Clock,
  Document,
  EditPen,
  Location,
  Select,
  Setting,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import StatCard from '@/components/common/StatCard.vue'
import { useDashboardSections } from '@/composables'
import DisabilityExpirySection from '@/components/dashboard/DisabilityExpirySection.vue'
import IntegrationsHealthCard from '@/components/dashboard/IntegrationsHealthCard.vue'
import { hasPermission } from '@/utils/auth'
import { MODULE_TERMS, PAGE_TERMS } from '@/constants/moduleTerms'
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
  criticalErrors,
  retryCritical,
  retryTodoBoard,
  todayDateStr,
  greeting,
  userName,
  isWeekend,
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
  // 來源失敗（criticalErrors.approvals）也算「到齊」：改由 todoSourceFailed 示警，
  // 不能讓失敗把待辦板卡在骨架狀態。
  if (showApprovals && approvalSummary.value == null && !criticalErrors.approvals) return false
  if (showAttendance && !deferredSections.anomalies?.loaded) return false
  if (showStudents && !deferredSections.studentAttendance?.loaded) return false
  return true
})

const showTodoSection = computed(
  () => showApprovals || showAttendance || showStudents
)

// 待辦板任一資料源失敗：不得顯示「全部清空」的假 all-clear，改示警 + 重試
const todoSourceFailed = computed(() =>
  (showApprovals && criticalErrors.approvals) ||
  (showAttendance && deferredSections.anomalies?.error) ||
  (showStudents && deferredSections.studentAttendance?.error)
)

// 學校概況任一來源失敗：顯示「重新載入」；「—」與真零必須可區分
const hasCriticalError = computed(
  () => criticalErrors.employees || criticalErrors.students || criticalErrors.todayStats
)

// 假零修復：失敗來源渲染成「—」而非 0
const statDisplay = (value: number | null | undefined, failed: boolean): string | number =>
  failed || value == null ? '—' : value

// Type helpers for composable data with loose types
interface TodayStats { total_employees: number; present_count: number; late_count: number; missing_count: number }
interface StudentAttendanceSummaryData { total_students: number; recorded_count: number; on_campus_count: number; unmarked_count: number; present_count: number; late_count: number; absent_count: number; leave_count: number; record_completion_rate: number }
interface AttendanceAnomaliesData { anomalies: { employee_id: unknown; anomaly_type: unknown; employee_name: unknown; late_minutes: unknown }[] }
interface EventTagTypeMap { [key: string]: 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined }

const typedTodayStats = computed(() => todayStats.value as TodayStats | null)
const typedStudentAttendanceSummary = computed(() => studentAttendanceSummary.value as StudentAttendanceSummaryData | null)
const typedAttendanceAnomalies = computed(() => attendanceAnomalies.value as AttendanceAnomaliesData | null)
const typedEventTagType = eventTagType as EventTagTypeMap

// 異常名單截斷：全員未打卡的日子（如假日）會有數十筆，儀表板只給摘要，
// 完整名單交給出勤頁
const ANOMALY_DISPLAY_LIMIT = 12
const displayedAnomalies = computed(
  () => typedAttendanceAnomalies.value?.anomalies.slice(0, ANOMALY_DISPLAY_LIMIT) ?? []
)
const anomalyOverflow = computed(
  () => Math.max(0, (typedAttendanceAnomalies.value?.anomalies.length ?? 0) - ANOMALY_DISPLAY_LIMIT)
)
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
          <h2 class="section-title">今日待辦</h2>
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

      <!-- 資料到齊後：來源失敗示警優先於「全部清空」，避免假 all-clear -->
      <div v-else-if="todoSourceFailed" class="todo-source-warning" role="alert">
        <span>部分待辦來源載入失敗，以下清單可能不完整。</span>
        <el-button link type="primary" size="small" @click="retryTodoBoard">重試</el-button>
      </div>

      <!-- 全部清空 -->
      <div v-else-if="todoTiles.length === 0" class="todo-empty">
        <el-icon class="todo-empty__icon"><CircleCheckFilled /></el-icon>
        <span>{{ isWeekend ? '週末愉快！目前沒有待處理的工作。' : '太好了！今天沒有待處理的工作。' }}</span>
      </div>

      <!-- 待辦磚 -->
      <div v-if="todoDataReady && todoTiles.length > 0" class="todo-grid">
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

    <!-- 教師出勤狀況 -->
    <template v-if="showAttendance">
      <div class="section-header">
        <div class="section-title-wrap">
          <span class="section-dot"></span>
          <h2 class="section-title">教師出勤狀況</h2>
        </div>
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
          <StatCard label="今日應出勤" :value="typedTodayStats.total_employees" :icon="Calendar" color="primary" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="已出勤" :value="typedTodayStats.present_count" :icon="Select" color="success" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="遲到" :value="typedTodayStats.late_count" :icon="AlarmClock" color="warning" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6" class="mb-4">
          <StatCard label="未打卡" :value="typedTodayStats.missing_count" :icon="Warning" color="danger" />
        </el-col>
      </el-row>
      <!-- 已載入但無資料：不能留孤兒標題（週末/失敗都要說清楚） -->
      <el-card v-else class="no-hover dashboard-placeholder-card mb-4">
        <div class="dashboard-placeholder-card__text text-secondary">
          <template v-if="criticalErrors.todayStats">今日出勤統計載入失敗，請點上方「重新載入」重試</template>
          <template v-else-if="isWeekend">今天是週末，園所休息。出勤統計將於下個上課日恢復</template>
          <template v-else>暫無今日出勤統計資料</template>
        </div>
      </el-card>
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
          <h2 class="section-title">今日學生出勤狀況</h2>
        </div>
      </div>
      <template v-if="typedStudentAttendanceSummary">
        <el-row :gutter="20" class="stats-row stats-row--tight">
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="今日在籍學生" :value="typedStudentAttendanceSummary.total_students" :icon="UserFilled" color="primary" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="已點名" :value="typedStudentAttendanceSummary.recorded_count" :icon="EditPen" color="primary" />
          </el-col>
          <!-- 色彩語意：到校是好事給 success；warning/danger 保留給需要行動的指標 -->
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="到校" :value="typedStudentAttendanceSummary.on_campus_count" :icon="CircleCheck" color="success" />
          </el-col>
          <!-- 「未點名」已升為今日待辦磚（一個數字一個家），此格改放中性的請假數 -->
          <el-col :xs="24" :sm="12" :md="6" class="mb-4">
            <StatCard label="請假" :value="typedStudentAttendanceSummary.leave_count" :icon="Document" color="info" />
          </el-col>
        </el-row>
        <el-card class="no-hover student-summary-bar">
          <div class="student-summary-bar__inner">
            <div class="student-summary-bar__stats">
              <span><strong>{{ typedStudentAttendanceSummary.present_count }}</strong> 出席</span>
              <span><strong>{{ typedStudentAttendanceSummary.late_count }}</strong> 遲到</span>
              <span><strong>{{ typedStudentAttendanceSummary.absent_count }}</strong> 缺席</span>
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
          <template v-if="!deferredSections.studentAttendance.loaded">學生出勤摘要載入中...</template>
          <template v-else-if="deferredSections.studentAttendance.error">學生出勤摘要載入失敗，可由上方「今日待辦」的重試再抓一次</template>
          <template v-else-if="isWeekend">今天是週末，尚無點名資料</template>
          <template v-else>暫無學生出勤摘要資料</template>
        </div>
      </el-card>
    </div>

    <!-- 主要內容 -->
    <el-row :gutter="20" style="margin-top: 8px;">

      <!-- 左欄（寬）：每天有新內容的名單型資料——今日打卡異常 + 近期行事曆 -->
      <el-col :xs="24" :lg="16" class="mb-4">

        <!-- 今日打卡異常 -->
        <div
          v-if="showAttendance"
          ref="anomaliesSectionRef"
          data-deferred-section="anomalies"
        >
        <el-card class="no-hover side-card mb-4">
          <template #header>
            <div class="card-header-row">
              <h2 class="card-header-title">今日打卡異常</h2>
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
              v-for="(item, idx) in displayedAnomalies"
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
              {{ anomalyOverflow > 0 ? `還有 ${anomalyOverflow} 筆，查看全部 →` : '查看出勤記錄 →' }}
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
              <h2 class="card-header-title">近期行事曆</h2>
              <el-button link size="small" @click="navigateTo('/calendar')">查看全部</el-button>
            </div>
          </template>
          <div v-if="!deferredSections.calendar.loaded" class="events-skeleton" aria-busy="true">
            <div v-for="i in 3" :key="i" class="skeleton-pulse events-skeleton__line" />
          </div>
          <div v-else-if="deferredSections.calendar.error" class="events-empty text-secondary">
            行事曆載入失敗，請重新整理頁面
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

      <!-- 右欄（窄）：導覽與低頻資訊 -->
      <el-col :xs="24" :lg="8">

        <!-- 快速操作 -->
        <el-card class="no-hover quick-actions-card mb-4">
          <template #header>
            <div class="card-header-row">
              <h2 class="card-header-title">快速操作</h2>
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
              <span>{{ MODULE_TERMS.attendance }}</span>
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
              <span>{{ MODULE_TERMS.activity }}</span>
            </router-link>
            <router-link to="/reports" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><TrendCharts /></el-icon>
              </div>
              <span>{{ PAGE_TERMS.reports }}</span>
            </router-link>
            <router-link to="/settings" class="action-item">
              <div class="action-circle">
                <el-icon :size="22"><Setting /></el-icon>
              </div>
              <span>系統設定</span>
            </router-link>
          </div>
        </el-card>

        <!-- 學校概況：低頻靜態統計，壓縮為複合卡讓出黃金帶（「其他人員」湊格指標移除） -->
        <el-card class="no-hover side-card mb-4">
          <template #header>
            <div class="card-header-row">
              <h2 class="card-header-title">學校概況</h2>
              <el-button
                v-if="hasCriticalError"
                link
                type="primary"
                size="small"
                @click="retryCritical"
              >
                重新載入
              </el-button>
            </div>
          </template>
          <div v-if="isFirstLoad && loading" class="overview-list" aria-busy="true">
            <div v-for="i in 3" :key="i" class="overview-row">
              <div class="skeleton-pulse overview-skeleton__label" />
              <div class="skeleton-pulse overview-skeleton__value" />
            </div>
          </div>
          <div v-else class="overview-list">
            <div class="overview-row">
              <span class="overview-row__label">教職員總數</span>
              <span class="overview-row__value">{{ statDisplay(stats.total, criticalErrors.employees) }}</span>
            </div>
            <div class="overview-row">
              <span class="overview-row__label">教師人數</span>
              <span class="overview-row__value">{{ statDisplay(stats.teachers, criticalErrors.employees) }}</span>
            </div>
            <div class="overview-row">
              <span class="overview-row__label">全校在籍人數</span>
              <span class="overview-row__value">{{ statDisplay(studentCount, criticalErrors.students) }}</span>
            </div>
            <div v-if="hasCriticalError" class="overview-error text-secondary">部分統計載入失敗</div>
          </div>
        </el-card>

        <!-- 本月審核風險：只保留待辦磚沒有的增量資訊；當前待審筆數以待辦磚為單一來源 -->
        <el-card
          v-if="showApprovals && (approvalSummary.this_month_pending_leaves > 0 || approvalSummary.this_month_pending_overtimes > 0)"
          class="no-hover side-card mb-4"
        >
          <template #header>
            <div class="card-header-row">
              <h2 class="card-header-title">本月審核風險</h2>
              <el-badge
                :value="approvalSummary.this_month_pending_leaves + approvalSummary.this_month_pending_overtimes"
                type="danger"
              />
            </div>
          </template>
          <div class="approval-list">
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

        <!-- 外部整合健康徽章（ops 遙測，位階最低放最底；AUDIT_LOGS 權限） -->
        <IntegrationsHealthCard v-if="showIntegrationsHealth" />

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
  margin: 0;
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
  outline: 2px solid var(--brand-primary);
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
  /* text-secondary 在 warning-soft 底只有 4.3:1，改 neutral-600（≥6:1）過 AA */
  color: var(--neutral-600);
  margin-top: auto;
}

.todo-tile--warning {
  background: var(--color-warning-soft);
  border-color: var(--color-warning-soft);
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

.todo-source-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-warning-soft);
  color: var(--neutral-700);
  font-size: 13px;
  margin-bottom: 14px;
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

/* 統計卡 grid 平板中間帶
 * El Plus md 斷點（min-width: 992px）早於專案 --to-md（max-width: 1023.98px），
 * 故 992-1023px 區間 .el-col-md-6 已取得 25%（4 欄），需覆寫回 50%（2 欄）。
 * --to-sm 補回手機單欄：--to-md（max-width: 1023.98px）在 <768px 同樣命中，且本
 * :deep 選擇器 specificity 高於 El Plus 的 .el-col-xs-24，若不在 --to-sm 顯式還原
 * 100%，手機會被 --to-md 的 50% 規則套住而誤顯 2 欄。 */
@media (--to-md) {
  .stats-row :deep(.el-col-md-6) {
    max-width: 50%;
    flex: 0 0 50%;
  }
}
@media (--to-sm) {
  .stats-row :deep(.el-col-md-6) {
    max-width: 100%;
    flex: 0 0 100%;
  }
}

/* ── 學生出勤摘要條 ── */
/* stats-row--tight 讓上方統計列自帶 8px 間距，取代先前的負 margin hack */
.stats-row--tight {
  margin-bottom: 8px;
}

.student-summary-bar {
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

/* 右欄窄卡 / 手機全寬皆自適應：窄欄約 2 欄、全寬自動增欄 */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px 12px;
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
  margin: 0;
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

/* ── 學校概況（右欄壓縮複合卡） ── */
.overview-list {
  display: flex;
  flex-direction: column;
}

.overview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--bg-color-soft);
}

.overview-row:last-of-type {
  border-bottom: none;
}

.overview-row__label {
  font-size: 13px;
  color: var(--text-secondary);
}

.overview-row__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.overview-error {
  font-size: 12px;
  padding-top: 6px;
}

.overview-skeleton__label {
  width: 40%;
  height: 12px;
  border-radius: 4px;
}

.overview-skeleton__value {
  width: 20%;
  height: 20px;
  border-radius: 4px;
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

.events-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.events-skeleton__line {
  height: 14px;
  border-radius: 4px;
}

.events-skeleton__line:nth-child(1) { width: 88%; }
.events-skeleton__line:nth-child(2) { width: 70%; }
.events-skeleton__line:nth-child(3) { width: 80%; }

.events-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.event-group__date {
  font-size: 12px;
  font-weight: 600;
  /* text-tertiary 白底僅 2.6:1，微型標籤仍是內容，改 text-secondary 過 AA */
  color: var(--text-secondary);
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

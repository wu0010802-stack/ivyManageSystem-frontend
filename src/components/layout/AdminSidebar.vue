
<template>
  <el-aside :width="isMobile ? '260px' : (isCollapse ? '64px' : '260px')" class="admin-sidebar" :class="{ 'is-collapsed': isCollapse && !isMobile, 'sidebar-mobile': isMobile, 'sidebar-mobile-open': isMobile && mobileOpen, 'sidebar-mobile-hidden': isMobile && !mobileOpen }">
    <div class="logo-container">
      <img src="/LOGO.png" class="logo-icon-img" alt="IVY" />
      <transition name="fade">
        <span v-if="!isCollapse" class="logo-text">常春藤管理系統</span>
      </transition>
    </div>
    
    <el-scrollbar>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        :collapse="isCollapse && !isMobile"
        :router="true"
        unique-opened
        text-color="#94a3b8"
        active-text-color="#ffffff"
        background-color="#1e293b"
        @select="onMenuSelect"
      >
        <!-- 我的置頂 -->
        <template v-if="pinnedPages.length > 0">
          <div v-if="!isCollapse || isMobile" class="pinned-header">
            <el-icon><StarFilled /></el-icon>
            <span>我的置頂</span>
          </div>
          <el-menu-item
            v-for="item in pinnedPages"
            :key="`pinned-${item.path}`"
            :index="item.path"
            class="pinned-item"
          >
            <el-icon><StarFilled /></el-icon>
            <template #title>
              <span class="pinned-title-text">{{ item.title }}</span>
              <el-icon
                class="pinned-remove"
                title="取消置頂"
                @click.stop.prevent="unpin(item.path)"
              ><Close /></el-icon>
            </template>
          </el-menu-item>
          <div v-if="!isCollapse || isMobile" class="pinned-divider"></div>
        </template>

        <!-- 首頁區域 - 不摺疊 -->
        <el-menu-item v-if="canView.DASHBOARD" index="/">
          <el-icon><DataBoard /></el-icon>
          <template #title>儀表板</template>
        </el-menu-item>
        <el-menu-item v-if="canView.APPROVALS" index="/approvals">
          <el-icon><Finished /></el-icon>
          <template #title>
            審核工作台
            <el-badge v-if="pendingApprovals > 0" :value="pendingApprovals" :max="99" class="menu-badge" />
          </template>
        </el-menu-item>

        <!-- 假勤管理 -->
        <el-sub-menu v-if="hasVisibleLeaveItems" index="group-leave">
          <template #title>
            <el-icon><Clock /></el-icon>
            <span>人事薪資</span>
          </template>
          <el-menu-item v-if="canView.EMPLOYEES_READ" index="/employees">
            <el-icon><User /></el-icon>
            <template #title>員工管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SALARY_READ" index="/salary">
            <el-icon><Money /></el-icon>
            <template #title>薪資管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SALARY_READ" index="/gov-reports">
            <el-icon><Files /></el-icon>
            <template #title>政府申報匯出</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ATTENDANCE_READ" index="/attendance">
            <el-icon><Clock /></el-icon>
            <template #title>出勤管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.LEAVES_READ" index="/leaves">
            <el-icon><Document /></el-icon>
            <template #title>請假管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.OVERTIME_READ || canView.MEETINGS" index="/overtime">
            <el-icon><Watch /></el-icon>
            <template #title>加班 / 會議</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SCHEDULE" index="/schedule">
            <el-icon><Timer /></el-icon>
            <template #title>排班管理</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 學生教務 -->
        <el-sub-menu v-if="hasVisibleStudentItems" index="group-students">
          <template #title>
            <el-icon><School /></el-icon>
            <span>學生教務</span>
          </template>
          <el-menu-item v-if="canView.CLASSROOMS_READ" index="/classrooms">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>班級學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/students">
            <el-icon><User /></el-icon>
            <template #title>學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-attendance">
            <el-icon><Calendar /></el-icon>
            <template #title>學生出席紀錄</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-leaves">
            <el-icon><Calendar /></el-icon>
            <template #title>家長請假審核</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-enrollment">
            <el-icon><TrendCharts /></el-icon>
            <template #title>在籍統計</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/dismissal-queue">
            <el-icon><Van /></el-icon>
            <template #title>接送通知</template>
          </el-menu-item>
          <el-menu-item v-if="canView.FEES_READ" index="/fees">
            <el-icon><CreditCard /></el-icon>
            <template #title>學費管理</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 園務統計 -->
        <el-sub-menu v-if="hasVisibleStatsItems" index="group-stats">
          <template #title>
            <el-icon><TrendCharts /></el-icon>
            <span>園務統計</span>
          </template>
          <el-menu-item v-if="canView.RECRUITMENT_READ" index="/recruitment">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>招生統計</template>
          </el-menu-item>
          <el-menu-item v-if="canView.RECRUITMENT_READ" index="/recruitment-ivykids">
            <el-icon><Document /></el-icon>
            <template #title>官網報名</template>
          </el-menu-item>
          <el-menu-item v-if="canView.REPORTS" index="/reports">
            <el-icon><Files /></el-icon>
            <template #title>報表統計</template>
          </el-menu-item>
          <el-menu-item v-if="canView.BUSINESS_ANALYTICS" index="/analytics">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>經營分析</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 園務行政 -->
        <el-sub-menu v-if="hasVisibleAdminItems" index="group-admin">
          <template #title>
            <el-icon><Files /></el-icon>
            <span>園務行政</span>
          </template>
          <el-menu-item v-if="canView.ANNOUNCEMENTS_READ" index="/announcements">
            <el-icon><Bell /></el-icon>
            <template #title>公告管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.CALENDAR" index="/calendar">
            <el-icon><Calendar /></el-icon>
            <template #title>行事曆</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 課後才藝 -->
        <el-sub-menu v-if="hasVisibleActivityItems" index="group-activity">
          <template #title>
            <el-icon><Star /></el-icon>
            <span>課後才藝</span>
          </template>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>統計儀表板</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/registrations">
            <el-icon><Document /></el-icon>
            <template #title>報名管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_WRITE" index="/activity/pos">
            <el-icon><Money /></el-icon>
            <template #title>POS 收銀</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_PAYMENT_APPROVE" index="/activity/pos/approval">
            <el-icon><Finished /></el-icon>
            <template #title>收款簽核</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/catalog">
            <el-icon><Collection /></el-icon>
            <template #title>課程與用品</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/inquiries">
            <el-icon><ChatDotRound /></el-icon>
            <template #title>
              家長提問
              <el-badge v-if="pendingActivityInquiries > 0" :value="pendingActivityInquiries" :max="99" class="menu-badge" />
            </template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_WRITE" index="/activity/settings">
            <el-icon><Timer /></el-icon>
            <template #title>報名時間設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/changes">
            <el-icon><List /></el-icon>
            <template #title>修改紀錄</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/attendance">
            <el-icon><Checked /></el-icon>
            <template #title>點名管理</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 系統設定 -->
        <el-sub-menu v-if="hasVisibleSettingsItems" index="group-settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系統設定</span>
          </template>
          <el-menu-item v-if="canView.SETTINGS_READ" index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>一般設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.AUDIT_LOGS" index="/audit-logs">
            <el-icon><Document /></el-icon>
            <template #title>操作紀錄</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-scrollbar>

    <div v-if="!isMobile" class="collapse-toggle" @click="toggleCollapse">
      <el-icon v-if="isCollapse"><Expand /></el-icon>
      <el-icon v-else><Fold /></el-icon>
    </div>
  </el-aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  DataBoard, Finished, Calendar, Timer, Clock, Document, Watch,
  Money, User, School, OfficeBuilding, Bell, TrendCharts, Setting,
  Expand, Fold, DataAnalysis, Files,
  Star, StarFilled, Close, Collection, ChatDotRound, List, Van, CreditCard, Checked
} from '@element-plus/icons-vue'
import { PERMISSION_VALUES, getUserInfo } from '@/utils/auth'
import { usePinnedPages } from '@/composables/usePinnedPages'

const props = defineProps({
  pendingApprovals: {
    type: Number,
    default: 0
  },
  pendingActivityInquiries: {
    type: Number,
    default: 0
  },
  isMobile: {
    type: Boolean,
    default: false
  },
  mobileOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close-sidebar'])

const route = useRoute()
const isCollapse = ref(false)

const { pinnedPages, unpin } = usePinnedPages()

const canView = computed(() => {
  route.path

  const userInfo = getUserInfo()
  if (!userInfo || userInfo.role === 'teacher') {
    return {}
  }

  const permissions = userInfo.permissions
  if (permissions === -1 || permissions === null || permissions === undefined) {
    return Object.fromEntries(Object.keys(PERMISSION_VALUES).map((name) => [name, true]))
  }

  // 使用 BigInt 運算，避免高位元（≥ 2^31）在 JS 32-bit 有符號整數中溢位
  const permsBig = BigInt(permissions)
  return Object.fromEntries(
    Object.entries(PERMISSION_VALUES).map(([name, value]) => {
      const valBig = BigInt(value)
      return [name, (permsBig & valBig) === valBig]
    })
  )
})

const activeMenu = computed(() => route.path)

// 檢查子選單是否有任何可見項目
const hasVisibleLeaveItems = computed(() =>
  canView.value.EMPLOYEES_READ || canView.value.SALARY_READ ||
  canView.value.ATTENDANCE_READ || canView.value.LEAVES_READ ||
  canView.value.OVERTIME_READ || canView.value.MEETINGS ||
  canView.value.SCHEDULE
)

const hasVisibleStudentItems = computed(() =>
  canView.value.STUDENTS_READ || canView.value.CLASSROOMS_READ || canView.value.FEES_READ
)

const hasVisibleStatsItems = computed(() =>
  canView.value.RECRUITMENT_READ || canView.value.REPORTS || canView.value.BUSINESS_ANALYTICS
)

const hasVisibleAdminItems = computed(() =>
  canView.value.ANNOUNCEMENTS_READ || canView.value.CALENDAR
)

const hasVisibleActivityItems = computed(() =>
  canView.value.ACTIVITY_READ || canView.value.ACTIVITY_WRITE
)

const hasVisibleSettingsItems = computed(() =>
  canView.value.SETTINGS_READ || canView.value.AUDIT_LOGS
)

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

const onMenuSelect = () => {
  if (props.isMobile) {
    emit('close-sidebar')
  }
}
</script>

<style scoped>
.admin-sidebar {
  background-color: #1e293b;
  color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: width var(--transition-slow);
  overflow: hidden;
  border-right: 1px solid #334155;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  z-index: 20;
}

.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  background-color: #0f172a;
  border-bottom: 1px solid #334155;
  overflow: hidden;
  white-space: nowrap;
}

.is-collapsed .logo-container {
  justify-content: center;
  padding: 0;
}

.logo-icon-img {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
}

.logo-text {
  margin-left: var(--space-3);
  font-size: var(--text-xl);
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.el-menu-vertical {
  border-right: none;
  background-color: transparent !important;
}

:deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
  margin: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: none;
}

:deep(.el-menu-item:hover) {
  background-color: #334155 !important;
  color: #fff !important;
}

:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-soft) 100%);
  color: #fff !important;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

:deep(.el-menu-item .el-icon) {
  font-size: var(--text-xl);
}

/* 子選單樣式 */
:deep(.el-sub-menu) {
  margin: 0 var(--space-3);
  padding: var(--space-1) 0;
}

:deep(.el-sub-menu .el-sub-menu__title) {
  height: 50px;
  line-height: 50px;
  border-radius: var(--radius-md);
  color: #94a3b8 !important;
  position: relative;
  z-index: 1;
}

:deep(.el-sub-menu .el-sub-menu__title:hover) {
  background-color: #334155 !important;
  color: #fff !important;
}

:deep(.el-sub-menu .el-sub-menu__title .el-icon) {
  font-size: var(--text-xl);
}

:deep(.el-sub-menu .el-menu-item) {
  margin: 2px 0 2px var(--space-2);
  height: 44px;
  line-height: 44px;
  padding-left: 48px !important;
  font-size: 13px;
}

:deep(.el-sub-menu .el-menu-item .el-icon) {
  font-size: 16px;
}

:deep(.el-sub-menu.is-opened > .el-sub-menu__title) {
  color: #fff !important;
}

.collapse-toggle {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  border-top: 1px solid #334155;
  transition: all var(--transition-base);
}

.collapse-toggle:hover {
  background-color: #334155;
  color: #fff;
}

.menu-badge {
  margin-left: 8px;
  transform: scale(0.9);
  display: inline-flex;
  vertical-align: middle;
}

/* ===== 我的置頂 ===== */
.pinned-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px var(--space-5) 6px;
  font-size: 11px;
  font-weight: 600;
  color: #f59e0b;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.pinned-header .el-icon {
  font-size: 13px;
}

:deep(.el-menu-item.pinned-item) {
  background-color: rgba(245, 158, 11, 0.08);
}

:deep(.el-menu-item.pinned-item) > .el-icon {
  color: #f59e0b !important;
}

:deep(.el-menu-item.pinned-item:hover) {
  background-color: rgba(245, 158, 11, 0.18) !important;
}

.pinned-title-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-remove {
  margin-left: 8px;
  font-size: 14px;
  color: #64748b;
  opacity: 0;
  transition: opacity var(--transition-base), color var(--transition-base);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
}

:deep(.el-menu-item.pinned-item:hover) .pinned-remove {
  opacity: 1;
}

.pinned-remove:hover {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

.pinned-divider {
  height: 1px;
  background-color: #334155;
  margin: 6px var(--space-5) 6px;
}

:deep(.el-badge__content) {
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 確保選單項目不會有溢出元素遮擋其他項目的點擊 */
:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  overflow: hidden;
}

/* Mobile sidebar */
.sidebar-mobile {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-slow);
  z-index: 2000;
}

.sidebar-mobile-hidden {
  transform: translateX(-100%);
}

.sidebar-mobile-open {
  transform: translateX(0);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

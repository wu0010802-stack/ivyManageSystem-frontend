
<template>
  <el-aside :width="isMobile ? '260px' : (isCollapse ? '64px' : '260px')" class="admin-sidebar" :class="{ 'is-collapsed': isCollapse && !isMobile, 'sidebar-mobile': isMobile, 'sidebar-mobile-open': isMobile && mobileOpen, 'sidebar-mobile-hidden': isMobile && !mobileOpen }">
    <div class="logo-container">
      <div class="logo-icon">IM</div>
      <transition name="fade">
        <span v-if="!isCollapse" class="logo-text">Ivy Manager</span>
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
        <!-- 首頁區域 - 不摺疊 -->
        <el-menu-item v-if="can('DASHBOARD')" index="/">
          <el-icon><DataBoard /></el-icon>
          <template #title>儀表板</template>
        </el-menu-item>
        <el-menu-item v-if="can('APPROVALS')" index="/approvals">
          <el-icon><Finished /></el-icon>
          <template #title>
            審核工作台
            <el-badge v-if="pendingApprovals > 0" :value="pendingApprovals" :max="99" class="menu-badge" />
          </template>
        </el-menu-item>

        <!-- 考勤管理 -->
        <el-sub-menu v-if="hasVisibleAttendanceItems" index="group-attendance">
          <template #title>
            <el-icon><Clock /></el-icon>
            <span>考勤管理</span>
          </template>
          <el-menu-item v-if="can('CALENDAR')" index="/calendar">
            <el-icon><Calendar /></el-icon>
            <template #title>行事曆</template>
          </el-menu-item>
          <el-menu-item v-if="can('SCHEDULE')" index="/schedule">
            <el-icon><Timer /></el-icon>
            <template #title>排班管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('ATTENDANCE_READ')" index="/attendance">
            <el-icon><Clock /></el-icon>
            <template #title>出勤管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('LEAVES_READ')" index="/leaves">
            <el-icon><Document /></el-icon>
            <template #title>請假管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('OVERTIME_READ')" index="/overtime">
            <el-icon><Watch /></el-icon>
            <template #title>加班管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('MEETINGS')" index="/meetings">
            <el-icon><Notebook /></el-icon>
            <template #title>園務會議</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 人事教務 -->
        <el-sub-menu v-if="hasVisibleHrItems" index="group-hr">
          <template #title>
            <el-icon><User /></el-icon>
            <span>人事教務</span>
          </template>
          <el-menu-item v-if="can('EMPLOYEES_READ')" index="/employees">
            <el-icon><User /></el-icon>
            <template #title>員工管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('STUDENTS_READ')" index="/students">
            <el-icon><School /></el-icon>
            <template #title>學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('STUDENTS_READ')" index="/student-attendance">
            <el-icon><Calendar /></el-icon>
            <template #title>學生出席紀錄</template>
          </el-menu-item>
          <el-menu-item v-if="can('STUDENTS_READ')" index="/student-incidents">
            <el-icon><Warning /></el-icon>
            <template #title>學生事件紀錄</template>
          </el-menu-item>
          <el-menu-item v-if="can('STUDENTS_READ')" index="/student-assessments">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>學期評量記錄</template>
          </el-menu-item>
          <el-menu-item v-if="can('CLASSROOMS_READ')" index="/classrooms">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>班級管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('SALARY_READ')" index="/salary">
            <el-icon><Money /></el-icon>
            <template #title>薪資管理</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 園務行政 -->
        <el-sub-menu v-if="hasVisibleAdminItems" index="group-admin">
          <template #title>
            <el-icon><Notebook /></el-icon>
            <span>園務行政</span>
          </template>
          <el-menu-item v-if="can('ANNOUNCEMENTS_READ')" index="/announcements">
            <el-icon><Bell /></el-icon>
            <template #title>公告管理</template>
          </el-menu-item>
          <el-menu-item v-if="can('REPORTS')" index="/reports">
            <el-icon><TrendCharts /></el-icon>
            <template #title>報表統計</template>
          </el-menu-item>
          <el-menu-item v-if="can('AUDIT_LOGS')" index="/audit-logs">
            <el-icon><Document /></el-icon>
            <template #title>操作紀錄</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 系統設定 - 不摺疊 -->
        <el-menu-item v-if="can('SETTINGS_READ')" index="/settings">
          <el-icon><Setting /></el-icon>
          <template #title>系統設定</template>
        </el-menu-item>
        <el-menu-item v-if="can('SALARY_READ')" index="/dev/salary">
          <el-icon><Cpu /></el-icon>
          <template #title>薪資邏輯 (Dev)</template>
        </el-menu-item>
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
  Money, User, School, OfficeBuilding, Notebook, Bell, TrendCharts, Setting,
  Expand, Fold, Cpu, Warning, DataAnalysis
} from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

const props = defineProps({
  pendingApprovals: {
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
const activeMenu = computed(() => route.path)

// 權限檢查
const can = (permissionName) => hasPermission(permissionName)

// 檢查子選單是否有任何可見項目
const hasVisibleAttendanceItems = computed(() =>
  can('CALENDAR') || can('SCHEDULE') || can('ATTENDANCE_READ') || can('LEAVES_READ') || can('OVERTIME_READ') || can('MEETINGS')
)

const hasVisibleHrItems = computed(() =>
  can('EMPLOYEES_READ') || can('STUDENTS_READ') || can('CLASSROOMS_READ') || can('SALARY_READ')
)

const hasVisibleAdminItems = computed(() =>
  can('ANNOUNCEMENTS_READ') || can('REPORTS') || can('AUDIT_LOGS')
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

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-primary) 100%);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: var(--text-base);
  color: white;
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


<template>
  <el-aside
    id="admin-navigation"
    :width="isMobile ? '260px' : (isCollapse ? '64px' : '260px')"
    class="admin-sidebar"
    :class="{ 'is-collapsed': isCollapse && !isMobile, 'sidebar-mobile': isMobile, 'sidebar-mobile-open': isMobile && mobileOpen, 'sidebar-mobile-hidden': isMobile && !mobileOpen }"
    :aria-hidden="isMobile && !mobileOpen ? 'true' : undefined"
    :inert="isMobile && !mobileOpen"
    @keydown.esc.stop="requestClose"
  >
    <button
      v-if="isMobile"
      ref="closeButtonRef"
      type="button"
      class="mobile-sidebar-close"
      aria-label="關閉導覽選單"
      @click="requestClose"
    >
      <el-icon><Close /></el-icon>
    </button>
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
        active-text-color="#7dd3fc"
        background-color="#1e2a3a"
        @select="onMenuSelect"
      >
        <!-- 1. 儀表板 -->
        <el-menu-item v-if="canView.DASHBOARD" index="/">
          <el-icon><DataBoard /></el-icon>
          <template #title>儀表板</template>
        </el-menu-item>

        <!-- 2. 工作台 (合併簽核 + 高風險事件) -->
        <el-menu-item v-if="canView.APPROVALS" index="/workbench">
          <el-icon><Finished /></el-icon>
          <template #title>
            工作台
            <el-badge v-if="workbenchBadge > 0" :value="workbenchBadge" :max="99" class="menu-badge" />
          </template>
        </el-menu-item>

        <!-- 3. 人事薪資 -->
        <el-sub-menu v-if="hasVisibleLeaveItems" index="group-leave">
          <template #title>
            <el-icon><Suitcase /></el-icon>
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
          <el-menu-item
            v-if="canView.SETTINGS_READ || canView.SALARY_READ || canView.YEAR_END_READ || canView.APPRAISAL_FINALIZE || canView.APPRAISAL_READ"
            index="/appraisal-year-end"
          >
            <el-icon><Trophy /></el-icon>
            <template #title>考核與年終</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ATTENDANCE_READ" index="/attendance">
            <el-icon><Clock /></el-icon>
            <template #title>{{ MODULE_TERMS.attendance }}</template>
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
            <template #title>{{ MODULE_TERMS.schedule }}</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 4. 學生與班級 (不動) -->
        <el-sub-menu v-if="hasVisibleStudentItems" index="group-students">
          <template #title>
            <el-icon><School /></el-icon>
            <span>學生與班級</span>
          </template>
          <el-menu-item v-if="canView.CLASSROOMS_READ" index="/classrooms">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>班級學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/students">
            <el-icon><User /></el-icon>
            <template #title>學生</template>
          </el-menu-item>
          <el-menu-item v-if="canView.RECRUITMENT_READ" index="/students/admissions">
            <el-icon><Promotion /></el-icon>
            <template #title>招生入學</template>
          </el-menu-item>
          <!-- 在籍統計已折入「學生」頁的分頁（/students?tab=enrollment）；舊路徑 redirect 保留 -->
          <el-menu-item v-if="canView.STUDENTS_READ" index="/dismissal-queue">
            <el-icon><Van /></el-icon>
            <template #title>接送通知</template>
          </el-menu-item>
          <el-menu-item v-if="canView.FEES_READ" index="/fees">
            <el-icon><CreditCard /></el-icon>
            <template #title>學費管理</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 6. 園務行政 (不動) -->
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
          <el-menu-item
            v-if="canView.VENDOR_PAYMENT_READ || canView.MISC_RECEIPT_READ"
            index="/finance-signoffs"
          >
            <el-icon><Wallet /></el-icon>
            <template #title>收支簽收</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 7. 課後才藝 (含報名時間設定 + 修改紀錄) -->
        <el-sub-menu v-if="hasVisibleActivityItems" index="group-activity">
          <template #title>
            <el-icon><Star /></el-icon>
            <span>{{ MODULE_TERMS.activity }}</span>
          </template>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/dashboard">
            <el-icon><TrendCharts /></el-icon>
            <template #title>統計儀表板</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/registrations">
            <el-icon><Tickets /></el-icon>
            <template #title>
              報名管理
              <el-badge v-if="pendingActivityReview > 0" :value="pendingActivityReview" :max="99" class="menu-badge" />
            </template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_WRITE" index="/activity/settings">
            <el-icon><Timer /></el-icon>
            <template #title>報名時間設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_WRITE" index="/activity/pos">
            <el-icon><Coin /></el-icon>
            <template #title>POS 收銀</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_PAYMENT_APPROVE" index="/activity/pos/approval">
            <el-icon><CircleCheck /></el-icon>
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
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/attendance">
            <el-icon><Checked /></el-icon>
            <template #title>點名管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ACTIVITY_READ" index="/activity/changes">
            <el-icon><List /></el-icon>
            <template #title>修改紀錄</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 8. 報表 (新一級，收查詢類) -->
        <el-sub-menu v-if="hasVisibleReportsItems" index="group-reports">
          <template #title>
            <el-icon><DataAnalysis /></el-icon>
            <span>報表</span>
          </template>
          <el-menu-item v-if="canView.AUDIT_LOGS" index="/audit-logs">
            <el-icon><Memo /></el-icon>
            <template #title>操作紀錄</template>
          </el-menu-item>
          <el-menu-item v-if="canView.DATA_QUALITY_READ" index="/data-quality">
            <el-icon><WarningFilled /></el-icon>
            <template #title>資料品質</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SALARY_READ" index="/admin/gov-reports/monthly">
            <el-icon><Histogram /></el-icon>
            <template #title>月度月報</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SALARY_READ" index="/gov-reports">
            <el-icon><Stamp /></el-icon>
            <template #title>政府申報匯出</template>
          </el-menu-item>
          <el-menu-item v-if="canView.REPORTS" index="/reports">
            <el-icon><PieChart /></el-icon>
            <template #title>報表統計</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 9. 系統設定（路由拆分：帳號/角色/一般 三子項各自依權限顯示） -->
        <el-sub-menu v-if="hasVisibleSettingsItems" index="group-settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系統設定</span>
          </template>
          <el-menu-item v-if="canView.USER_MANAGEMENT_READ" index="/settings/accounts">
            <el-icon><User /></el-icon>
            <template #title>帳號設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ROLES_MANAGE" index="/settings/roles">
            <el-icon><Key /></el-icon>
            <template #title>角色設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SETTINGS_READ" index="/settings">
            <el-icon><Tools /></el-icon>
            <template #title>一般設定</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-scrollbar>

    <button
      v-if="!isMobile"
      type="button"
      class="collapse-toggle"
      :aria-label="isCollapse ? '展開側邊欄' : '收合側邊欄'"
      @click="toggleCollapse"
    >
      <el-icon v-if="isCollapse"><Expand /></el-icon>
      <el-icon v-else><Fold /></el-icon>
    </button>
  </el-aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  DataBoard, Finished, Calendar, Timer, Clock, Document, Watch,
  Money, User, School, OfficeBuilding, Bell, Setting,
  Expand, Fold, DataAnalysis, Files, Close,
  Star, Collection, ChatDotRound, List, Van, CreditCard, Checked,
  Trophy, WarningFilled, Key,
  Suitcase, Promotion, Wallet, TrendCharts, Tickets, Coin, CircleCheck,
  Memo, Histogram, Stamp, PieChart, Tools
} from '@element-plus/icons-vue'
import { PERMISSION_NAMES, hasPermission } from '@/utils/auth'
import { MODULE_TERMS } from '@/constants/moduleTerms'

const props = withDefaults(defineProps<{
  pendingApprovals?: number
  pendingActivityInquiries?: number
  pendingActivityReview?: number
  pendingHighRiskAudit?: number
  isMobile?: boolean
  mobileOpen?: boolean
}>(), {
  pendingApprovals: 0,
  pendingActivityInquiries: 0,
  pendingActivityReview: 0,
  pendingHighRiskAudit: 0,
  isMobile: false,
  mobileOpen: false,
})

const emit = defineEmits<{
  'close-sidebar': []
}>()

const route = useRoute()
const isCollapse = ref(false)
const closeButtonRef = ref<HTMLButtonElement | null>(null)

// 直接委派 src/utils/auth.ts 的 hasPermission()（含 teacher 短路 / null-lockdown /
// wildcard / bare 命中 / scope-qualified 後綴四段判斷），避免側欄自己重寫第二份權限實作
// 而漏掉 scope-aware 分支（曾發生：持 'STUDENTS_READ:own_class' 者路由可達但選單被隱藏）。
const canView = computed(() =>
  // hasPermission() 讀 auth.ts 的 _userInfoRef（shallowRef），login / 權限變更
  // （setUserInfo 整物件替換）會自動觸發本 computed 重算，無需靠 route.path 強制重算。
  // 不依賴 route.path，避免每次路由導航都重跑 ~74 個權限檢查並讓下游 hasVisibleX 全失效。
  Object.fromEntries(
    Object.keys(PERMISSION_NAMES).map((name) => [name, hasPermission(name)])
  )
)

const activeMenu = computed(() => {
  // 薪資 IA 拆 5 路由後子頁（settle/history/simulate/settings）仍高亮「薪資管理」
  if (route.path.startsWith('/salary/')) return '/salary'
  // 考核與年終巢狀路由（2026-07-10 改版）子頁仍高亮整合入口
  if (route.path.startsWith('/appraisal-year-end/')) return '/appraisal-year-end'
  return route.path
})

// 工作台 badge = 待簽核 + 高風險未確認
const workbenchBadge = computed(() =>
  (props.pendingApprovals ?? 0) + (props.pendingHighRiskAudit ?? 0)
)

// 檢查子選單是否有任何可見項目
const hasVisibleLeaveItems = computed(() =>
  canView.value.EMPLOYEES_READ || canView.value.SALARY_READ || canView.value.SALARY_WRITE ||
  canView.value.ATTENDANCE_READ || canView.value.LEAVES_READ ||
  canView.value.OVERTIME_READ || canView.value.MEETINGS ||
  canView.value.SCHEDULE || canView.value.YEAR_END_READ || canView.value.APPRAISAL_FINALIZE ||
  // 考核與年終整合入口含 SETTINGS_READ / APPRAISAL_READ，群組需據此顯示
  canView.value.SETTINGS_READ || canView.value.APPRAISAL_READ
)

const hasVisibleStudentItems = computed(() =>
  canView.value.STUDENTS_READ || canView.value.CLASSROOMS_READ || canView.value.FEES_READ ||
  canView.value.RECRUITMENT_READ
)

const hasVisibleAdminItems = computed(() =>
  canView.value.ANNOUNCEMENTS_READ || canView.value.CALENDAR ||
  canView.value.VENDOR_PAYMENT_READ || canView.value.MISC_RECEIPT_READ
)

const hasVisibleActivityItems = computed(() =>
  canView.value.ACTIVITY_READ || canView.value.ACTIVITY_WRITE || canView.value.ACTIVITY_PAYMENT_APPROVE
)

const hasVisibleReportsItems = computed(() =>
  canView.value.AUDIT_LOGS ||
  canView.value.SALARY_READ || canView.value.REPORTS || canView.value.DATA_QUALITY_READ
)

const hasVisibleSettingsItems = computed(() =>
  canView.value.SETTINGS_READ || canView.value.USER_MANAGEMENT_READ || canView.value.ROLES_MANAGE
)

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

const requestClose = () => {
  if (props.isMobile) emit('close-sidebar')
}

defineExpose({
  focusCloseButton: () => closeButtonRef.value?.focus(),
})

const onMenuSelect = () => {
  if (props.isMobile) {
    emit('close-sidebar')
  }
}
</script>

<style scoped>
/* 色票對應 design-tokens.css 的 --sidebar-*；el-menu 的 color props 需 hex 字面值
 * （collapsed 子選單 popup 由 EP 從 props 帶色），改色時兩處同步 */
.admin-sidebar {
  background-color: var(--sidebar-bg);
  color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: width var(--transition-slow);
  overflow: hidden;
  border-right: 1px solid var(--neutral-700);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  z-index: 20;
}

.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  background-color: var(--neutral-900);
  border-bottom: 1px solid var(--neutral-700);
  overflow: hidden;
  white-space: nowrap;
}

.mobile-sidebar-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text-hover);
  cursor: pointer;
}

.mobile-sidebar-close:hover {
  background-color: var(--sidebar-bg-active);
}

.sidebar-mobile .logo-container {
  padding-right: 60px;
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
  background-color: var(--sidebar-bg-active) !important;
  color: var(--sidebar-text-hover) !important;
}

:deep(.el-menu-item.is-active) {
  background-color: var(--sidebar-bg-active);
  color: var(--sidebar-text-active) !important;
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
  color: var(--text-tertiary) !important;
  position: relative;
  z-index: 1;
}

:deep(.el-sub-menu .el-sub-menu__title:hover) {
  background-color: var(--sidebar-bg-active) !important;
  color: var(--sidebar-text-hover) !important;
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

/* 收合（64px）時：自訂左右 margin 12px 讓項目只剩 40px 寬，EP collapse 仍套
 * padding-left 20px → 圖示被推到 x=32..56、超出 active 底塊右緣。歸零 padding
 * 改用 flex 置中，圖示與底塊才會同軸。 */
.is-collapsed :deep(.el-menu--collapse > .el-menu-item),
.is-collapsed :deep(.el-menu--collapse > .el-sub-menu > .el-sub-menu__title) {
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* EP collapse 把 menu-item 內容包進 absolute 的 tooltip trigger（自帶 padding 0 20px），
 * icon 實際位置由它決定，須一併歸零置中 */
.is-collapsed :deep(.el-menu--collapse .el-menu-tooltip__trigger) {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-toggle {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-top: 1px solid var(--neutral-700);
  transition: background-color var(--transition-base), color var(--transition-base);
}

.collapse-toggle:hover {
  background-color: var(--neutral-700);
  color: #fff;
}

.collapse-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
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

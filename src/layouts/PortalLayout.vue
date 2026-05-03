
<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { getSubstitutePendingCount, getUnreadCount, getSwapPendingCount } from '@/api/portal'
import { getPortalPendingCount } from '@/api/dismissalCalls'
import { getUnreadCount as getMessagesUnreadCount } from '@/api/portalMessages'
import { getTodayHub } from '@/api/portalClassHub'
import { changePassword, endImpersonate } from '@/api/auth'
import { getUserInfo, clearAuth, setUserInfo } from '@/utils/auth'
import OfflineIndicator from '@/components/OfflineIndicator.vue'
import { apiError } from '@/utils/error'
import A11yMenu from '@/components/common/A11yMenu.vue'

const route = useRoute()
const router = useRouter()
const activeIndex = computed(() => route.path)
const userInfo = computed(() => getUserInfo() || {})

const showPasswordDialog = ref(false)
const passwordForm = ref({ old_password: '', new_password: '', confirm_password: '' })
const passwordLoading = ref(false)

// Mobile sidebar
const isMobile = ref(false)
const sidebarOpen = ref(false)

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) sidebarOpen.value = false
}

// Unread announcement count
const unreadCount = ref(0)

// Swap pending count
const swapPendingCount = ref(0)
const substitutePendingCount = ref(0)
const dismissalPendingCount = ref(0)

// 家園溝通：家長訊息未讀
const messagesUnreadCount = ref(0)
// 今日工作台待辦數
const hubPendingCount = ref(0)

const fetchUnreadCount = async () => {
  try {
    const res = await getUnreadCount()
    unreadCount.value = res.data.unread_count || 0
  } catch (e) {
    // Silent fail
  }
}

const fetchSwapPendingCount = async () => {
  try {
    const res = await getSwapPendingCount()
    swapPendingCount.value = res.data.pending_count || 0
  } catch (e) {
    // Silent fail
  }
}

const fetchSubstitutePendingCount = async () => {
  try {
    const res = await getSubstitutePendingCount()
    substitutePendingCount.value = res.data.pending_count || 0
  } catch (e) {
    // Silent fail
  }
}

const fetchDismissalPendingCount = async () => {
  try {
    const res = await getPortalPendingCount()
    dismissalPendingCount.value = res.data.count || 0
  } catch (e) {
    // Silent fail
  }
}

const fetchMessagesUnreadCount = async () => {
  try {
    const res = await getMessagesUnreadCount()
    messagesUnreadCount.value = res.data.unread_count || 0
  } catch (e) {
    // 沒有 PARENT_MESSAGES_WRITE 權限會 403，靜默忽略
  }
}

const fetchHubPendingCount = async () => {
  try {
    const data = await getTodayHub()
    const c = data.counts || {}
    hubPendingCount.value =
      (c.attendance_pending || 0) +
      (c.medications_pending || 0) +
      (c.observations_pending || 0) +
      (c.contact_books_pending || 0)
    // incidents_today 不算「待辦」(它是已建立的事件數)，不納入 badge
  } catch {
    hubPendingCount.value = 0
  }
}

const refreshPortalCounts = () => {
  fetchUnreadCount()
  fetchSwapPendingCount()
  fetchSubstitutePendingCount()
  fetchDismissalPendingCount()
  fetchMessagesUnreadCount()
  fetchHubPendingCount()
}

// PWA 安裝提示
const deferredPrompt = ref(null)
const showInstallBanner = ref(false)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt.value = e
  showInstallBanner.value = true
})

const installPWA = async () => {
  if (!deferredPrompt.value) return
  deferredPrompt.value.prompt()
  await deferredPrompt.value.userChoice
  deferredPrompt.value = null
  showInstallBanner.value = false
}

const dismissInstallBanner = () => {
  showInstallBanner.value = false
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('portal-substitute-count-changed', fetchSubstitutePendingCount)
  fetchEmployees()
  refreshPortalCounts()
})

// Refresh counts when navigating
watch(() => route.path, () => {
  refreshPortalCounts()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('portal-substitute-count-changed', fetchSubstitutePendingCount)
})

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const closeSidebar = () => {
  if (isMobile.value) sidebarOpen.value = false
}

// Impersonate tracking: 後端透過 admin_token Cookie 備份管理員應證，
// 前端只需追蹤狀態旗標來控制 UI 顯示。
const isImpersonating = ref(false)

// 有 admin 角色或處於冒充狀態時顯示切換器
const showSwitcher = computed(() =>
  userInfo.value.role === 'admin' || isImpersonating.value
)

// 返回後台：自身是 admin/hr/supervisor，或處於冒充狀態
const showBackToAdmin = computed(() => {
  const role = userInfo.value.role
  return ['admin', 'hr', 'supervisor'].includes(role) || isImpersonating.value
})

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const employeeList = ref([])

const fetchEmployees = async () => {
  if (userInfo.value.role !== 'admin' && !isImpersonating.value) return
  try {
    // 冒充狀態下，後端會使用 admin_token Cookie 驗證
    // 但當前 access_token 是幫員工的，可能沒有 EMPLOYEES_READ 權限
    // 所以用後端 end-impersonate 再查，或者直接用 axios 帶 credential
    const res = await axios.get(`${API_BASE}/employees`, {
      withCredentials: true,
      timeout: 10000,
    })
    employeeList.value = res.data
  } catch {
    // silent
  }
}

const handleSwitchUser = async (employeeId) => {
  try {
    // 呼叫 impersonate API，後端會自動設定 access_token + admin_token Cookie
    const res = await axios.post(
      `${API_BASE}/auth/impersonate`,
      { employee_id: employeeId },
      { withCredentials: true, timeout: 10000 }
    )
    // 更新前端 userInfo
    setUserInfo(res.data.user)
    isImpersonating.value = true
    ElMessage.success(`已切換為：${res.data.user.name}`)
    window.location.reload()
  } catch (error) {
    ElMessage.error(apiError(error, '切換失敗'))
  }
}

const goBackToAdmin = async () => {
  if (!isImpersonating.value) {
    // hr/supervisor 以自己身份直接進入前台，沒有 impersonation session，直接返回即可
    router.push('/')
    return
  }
  try {
    const res = await endImpersonate()
    // 後端已清除 admin_token Cookie 並將 access_token 還原為管理員
    setUserInfo(res.data.user)
    isImpersonating.value = false
    router.push('/')
  } catch (error) {
    ElMessage.error(apiError(error, '返回失敗'))
    // 失敗時強制登出
    clearAuth()
    router.push('/login')
  }
}

const handleCommand = (cmd) => {
  if (cmd === 'logout') {
    isImpersonating.value = false
    clearAuth()
    router.push('/portal/login')
    ElMessage.success('已登出')
  } else if (cmd === 'changePassword') {
    passwordForm.value = { old_password: '', new_password: '', confirm_password: '' }
    showPasswordDialog.value = true
  }
}

const submitPassword = async () => {
  if (!passwordForm.value.old_password || !passwordForm.value.new_password) {
    ElMessage.warning('請填寫所有欄位')
    return
  }
  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    ElMessage.warning('新密碼與確認密碼不一致')
    return
  }
  passwordLoading.value = true
  try {
    await changePassword({
      old_password: passwordForm.value.old_password,
      new_password: passwordForm.value.new_password,
    })
    ElMessage.success('密碼修改成功')
    showPasswordDialog.value = false
  } catch (error) {
    ElMessage.error(apiError(error, '修改失敗'))
  } finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <el-container class="portal-layout" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile overlay -->
    <div class="sidebar-overlay" v-if="isMobile && sidebarOpen" @click="closeSidebar"></div>

    <el-aside :width="isMobile ? '220px' : '200px'" :class="{ 'sidebar-open': sidebarOpen, 'sidebar-hidden': isMobile && !sidebarOpen }">
      <div class="portal-logo">
        <span>教師專區</span>
      </div>
      <el-menu
        :default-active="activeIndex"
        :router="true"
        class="portal-menu"
        unique-opened
        text-color="#94a3b8"
        active-text-color="#ffffff"
        background-color="#1e293b"
        @select="closeSidebar"
      >
        <!-- 首頁 -->
        <el-menu-item index="/portal/home">
          <el-icon><HomeFilled /></el-icon>
          <span>今日首頁</span>
        </el-menu-item>

        <!-- 個人資料 -->
        <el-menu-item index="/portal/profile">
          <el-icon><UserFilled /></el-icon>
          <span>個人資料</span>
        </el-menu-item>

        <!-- 家園溝通 -->
        <el-sub-menu index="group-comm">
          <template #title>
            <el-icon><ChatLineRound /></el-icon>
            <span>家園溝通</span>
          </template>
          <el-menu-item index="/portal/messages">
            <el-icon><Message /></el-icon>
            <span>家長訊息</span>
            <el-badge v-if="messagesUnreadCount > 0" :value="messagesUnreadCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/announcements">
            <el-icon><Bell /></el-icon>
            <span>公告通知</span>
            <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="announcement-badge" />
          </el-menu-item>
        </el-sub-menu>

        <!-- 假勤申請 -->
        <el-sub-menu index="group-leave">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>假勤申請</span>
          </template>
          <el-menu-item index="/portal/attendance">
            <el-icon><Calendar /></el-icon>
            <span>我的出勤</span>
          </el-menu-item>
          <el-menu-item index="/portal/leave">
            <el-icon><Document /></el-icon>
            <span>請假申請</span>
            <el-badge v-if="substitutePendingCount > 0" :value="substitutePendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/overtime">
            <el-icon><Watch /></el-icon>
            <span>加班申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/punch-correction">
            <el-icon><Edit /></el-icon>
            <span>補打卡申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/anomalies">
            <el-icon><Warning /></el-icon>
            <span>異常確認</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- 我的排班 -->
        <el-menu-item index="/portal/schedule">
          <el-icon><Timer /></el-icon>
          <span>我的排班</span>
          <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="announcement-badge" />
        </el-menu-item>

        <!-- 班級教務 -->
        <el-sub-menu index="group-class">
          <template #title>
            <el-icon><School /></el-icon>
            <span>班級教務</span>
          </template>
          <el-menu-item index="/portal/students">
            <el-icon><User /></el-icon>
            <span>班級學生</span>
          </el-menu-item>
          <el-menu-item index="/portal/class-hub">
            <el-icon><Calendar /></el-icon>
            <span>今日工作台</span>
            <el-badge
              v-if="hubPendingCount > 0"
              :value="hubPendingCount"
              :max="99"
              class="announcement-badge"
            />
          </el-menu-item>
          <el-menu-item index="/portal/assessments">
            <el-icon><DataAnalysis /></el-icon>
            <span>學期評量</span>
          </el-menu-item>
          <el-menu-item index="/portal/dismissal-calls">
            <el-icon><Van /></el-icon>
            <span>接送通知</span>
            <el-badge v-if="dismissalPendingCount > 0" :value="dismissalPendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/activity">
            <el-icon><Brush /></el-icon>
            <span>才藝查詢</span>
          </el-menu-item>
          <el-menu-item index="/portal/activity/attendance">
            <el-icon><Checked /></el-icon>
            <span>才藝點名</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- 學校行事曆 -->
        <el-menu-item index="/portal/calendar">
          <el-icon><Calendar /></el-icon>
          <span>學校行事曆</span>
        </el-menu-item>

        <!-- 薪資查詢 -->
        <el-menu-item index="/portal/salary">
          <el-icon><Money /></el-icon>
          <span>薪資查詢</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <OfflineIndicator />

      <!-- PWA 安裝提示（手機首次訪問且瀏覽器支援時才顯示）-->
      <div v-if="showInstallBanner && isMobile" class="install-banner">
        <span>📱 加到桌面，打卡更方便！</span>
        <el-button size="small" type="success" @click="installPWA">加入桌面</el-button>
        <el-button size="small" text @click="dismissInstallBanner">✕</el-button>
      </div>

      <el-header height="60px">
        <div class="portal-header">
          <div class="header-left">
            <h3>常春藤義華幼兒園 - 教職員考勤系統</h3>
          </div>
          <div class="portal-user">
            <A11yMenu />
            <!-- 返回後台按鈕 -->
            <el-button
              v-if="showBackToAdmin"
              type="primary"
              size="small"
              plain
              @click="goBackToAdmin"
              style="margin-right: 8px"
            >
              ← 返回後台
            </el-button>

            <!-- Employee Switcher (Admin Only or impersonate mode) -->
            <el-dropdown v-if="showSwitcher" @command="handleSwitchUser" style="margin-right: 15px">
              <el-button type="warning" size="small" plain>
                切換視角 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="switcher-dropdown">
                  <el-dropdown-item
                    v-for="emp in employeeList"
                    :key="emp.id"
                    :command="emp.id"
                  >
                    {{ emp.employee_id }} - {{ emp.name }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <span class="user-name">{{ userInfo.name || '' }}</span>
            <el-dropdown @command="handleCommand">
              <el-avatar :size="32" icon="UserFilled" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="changePassword">修改密碼</el-dropdown-item>
                  <el-dropdown-item command="logout" divided>登出</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-header>

      <el-main>
        <RouterView />
      </el-main>

      <!-- Bottom Navigation (mobile only) -->
      <div v-if="isMobile" class="bottom-nav">
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/attendance') }" @click="router.push('/portal/attendance')">
          <el-icon><Calendar /></el-icon>
          <span>出勤</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/leave') }" @click="router.push('/portal/leave')">
          <div class="tab-icon-wrapper">
            <el-icon><Document /></el-icon>
            <el-badge v-if="substitutePendingCount > 0" :value="substitutePendingCount" :max="99" class="tab-badge" />
          </div>
          <span>請假</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/schedule') }" @click="router.push('/portal/schedule')">
          <div class="tab-icon-wrapper">
            <el-icon><Clock /></el-icon>
            <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="tab-badge" />
          </div>
          <span>排班</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/salary') }" @click="router.push('/portal/salary')">
          <el-icon><Money /></el-icon>
          <span>薪資</span>
        </div>
        <div class="bottom-tab" @click="toggleSidebar">
          <div class="tab-icon-wrapper">
            <el-icon><Menu /></el-icon>
            <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="tab-badge" />
          </div>
          <span>更多</span>
        </div>
      </div>
    </el-container>

    <!-- Change Password Dialog -->
    <el-dialog v-model="showPasswordDialog" title="修改密碼" :width="isMobile ? '90%' : '400px'">
      <el-form label-width="80px">
        <el-form-item label="舊密碼">
          <el-input v-model="passwordForm.old_password" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密碼">
          <el-input v-model="passwordForm.new_password" type="password" show-password />
        </el-form-item>
        <el-form-item label="確認密碼">
          <el-input v-model="passwordForm.confirm_password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasswordDialog = false">取消</el-button>
        <el-button type="primary" :loading="passwordLoading" @click="submitPassword">確認</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<style scoped>
.portal-layout {
  height: 100vh;
  background-color: var(--bg-color);
}

/* Sidebar Styling */
.el-aside {
  background-color: #1e293b;
  color: #fff;
  border-right: 1px solid #334155;
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-slow);
  z-index: 2000;
}

.portal-logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #334155;
  background-color: #0f172a;
}

.portal-logo span {
  font-size: var(--text-xl);
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.portal-menu {
  border-right: none;
  background-color: transparent !important;
}

:deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
  margin: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-tertiary) !important;
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
  color: inherit;
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
}

:deep(.el-sub-menu .el-sub-menu__title:hover) {
  background-color: #334155 !important;
  color: #fff !important;
}

:deep(.el-sub-menu.is-opened > .el-sub-menu__title) {
  color: #fff !important;
}

:deep(.el-sub-menu .el-menu-item) {
  margin: 2px 0 2px var(--space-2);
  height: 44px;
  line-height: 44px;
  padding-left: 44px !important;
  font-size: 13px;
}

/* Header Styling */
.el-header {
  background-color: var(--surface-color);
  border-bottom: 1px solid var(--border-color-light);
  display: flex;
  align-items: center;
  padding: 0 var(--space-6);
  height: 64px !important;
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.portal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.portal-header h3 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.portal-user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-base);
}

.portal-user:hover {
  background-color: var(--bg-color);
}

.user-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
}

/* Main Content：套用 Soft UI 表面色 */
.el-main {
  background-color: var(--pt-surface-app, var(--bg-color));
  padding: var(--space-6);
}

/* 全 Portal 內 el-card：升級為 Soft UI Evolution 雙層陰影 + hairline。
 * 既有 view 不需修改即可獲得新質感；hover 仍走 main.css 的 translateY 動畫。 */
:deep(.el-card) {
  box-shadow: var(--pt-elev-1) !important;
  border: var(--pt-hairline) !important;
}

:deep(.el-card:hover) {
  box-shadow: var(--pt-elev-2) !important;
}

:deep(.el-card[shadow="never"]),
:deep(.el-card.no-hover) {
  box-shadow: var(--pt-elev-1) !important;
}

/* Mobile padding 收緊 */
@media (max-width: 768px) {
  .el-main {
    padding: var(--space-4);
  }
}

.install-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  font-size: var(--text-base);
  color: #15803d;
}

/* Misc */
.switcher-dropdown {
  max-height: 400px;
  overflow-y: auto;
}

.announcement-badge {
  margin-left: auto;
}

:deep(.el-badge__content) {
  border: none;
}

/* Bottom Navigation */
.bottom-nav {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background-color: var(--surface-color);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  z-index: 1000;
}

.bottom-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.bottom-tab:active {
  background-color: var(--bg-color-soft);
}

.bottom-tab.active {
  color: var(--color-primary);
}

.bottom-tab .el-icon {
  font-size: 20px;
}

.tab-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-badge {
  position: absolute;
  top: -6px;
  right: -10px;
}

.tab-badge :deep(.el-badge__content) {
  font-size: 10px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  min-width: 16px;
}

/* Mobile sidebar overlay */
.sidebar-overlay {
  display: none;
}

/* Desktop: hide bottom-nav */
@media (min-width: 768px) {
  .bottom-nav {
    display: none;
  }
}

/* Mobile styles */
@media (max-width: 767px) {
  .portal-header h3 {
    font-size: var(--text-lg);
  }

  .el-header {
    padding: 0 var(--space-4);
  }

  .el-main {
    padding: var(--space-4);
    padding-bottom: calc(60px + env(safe-area-inset-bottom));
  }

  .el-aside {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  }

  .sidebar-hidden {
    transform: translateX(-100%);
  }

  .sidebar-open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
    z-index: 1999;
  }

  .user-name {
    display: none;
  }
}
</style>

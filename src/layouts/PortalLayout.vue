
<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import api from '@/api'
import { getUserInfo, clearAuth, getToken, setToken, setUserInfo } from '@/utils/auth'

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

const fetchUnreadCount = async () => {
  try {
    const res = await api.get('/portal/unread-count')
    unreadCount.value = res.data.unread_count || 0
  } catch (e) {
    // Silent fail
  }
}

const fetchSwapPendingCount = async () => {
  try {
    const res = await api.get('/portal/swap-pending-count')
    swapPendingCount.value = res.data.pending_count || 0
  } catch (e) {
    // Silent fail
  }
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
  fetchEmployees()
  fetchUnreadCount()
  fetchSwapPendingCount()
})

// Refresh counts when navigating
watch(() => route.path, () => {
  fetchUnreadCount()
  fetchSwapPendingCount()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const closeSidebar = () => {
  if (isMobile.value) sidebarOpen.value = false
}

// Employee Switcher Logic
const employeeList = ref([])

// 有 adminToken 備份時（impersonate 狀態）或自身是 admin 角色，均顯示切換器
const showSwitcher = computed(() =>
  userInfo.value.role === 'admin' || !!localStorage.getItem('adminToken')
)

// 返回後台：自身是 admin/hr/supervisor，或有 adminToken 備份（impersonate 狀態）
const showBackToAdmin = computed(() => {
  const role = userInfo.value.role
  return ['admin', 'hr', 'supervisor'].includes(role) || !!localStorage.getItem('adminToken')
})

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const fetchEmployees = async () => {
  const adminToken = localStorage.getItem('adminToken')
  if (userInfo.value.role !== 'admin' && !adminToken) return
  try {
    const effectiveToken = adminToken || getToken()
    const res = await axios.get(`${API_BASE}/employees`, {
      headers: { Authorization: `Bearer ${effectiveToken}` },
      timeout: 10000,
    })
    employeeList.value = res.data
  } catch {
    // silent
  }
}

const handleSwitchUser = async (employeeId) => {
  try {
    const adminToken = localStorage.getItem('adminToken')

    // 若尚未 impersonate 但當前角色是 admin，先備份 admin 憑證
    if (!adminToken && userInfo.value.role === 'admin') {
      localStorage.setItem('adminToken', getToken())
      localStorage.setItem('adminUserInfo', localStorage.getItem('userInfo'))
    }

    const effectiveAdminToken = localStorage.getItem('adminToken') || getToken()
    const res = await axios.post(
      `${API_BASE}/auth/impersonate`,
      { employee_id: employeeId },
      {
        headers: {
          Authorization: `Bearer ${effectiveAdminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    )
    // 保持 adminToken 不動（仍在 impersonate 狀態），只替換目標員工 token
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('userInfo', JSON.stringify(res.data.user))
    ElMessage.success(`已切換為：${res.data.user.name}`)
    window.location.reload()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '切換失敗')
  }
}

const goBackToAdmin = () => {
  const adminToken = localStorage.getItem('adminToken')
  const adminUserInfoStr = localStorage.getItem('adminUserInfo')
  if (adminToken && adminUserInfoStr) {
    setToken(adminToken)
    setUserInfo(JSON.parse(adminUserInfoStr))
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUserInfo')
  }
  router.push('/')
}

const handleCommand = (cmd) => {
  if (cmd === 'logout') {
    // 登出時一併清除 impersonate 備份
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUserInfo')
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
    await api.post('/auth/change-password', {
      old_password: passwordForm.value.old_password,
      new_password: passwordForm.value.new_password,
    })
    ElMessage.success('密碼修改成功')
    showPasswordDialog.value = false
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '修改失敗')
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
      <el-menu :default-active="activeIndex" :router="true" class="portal-menu" @select="closeSidebar">
        <el-menu-item index="/portal/profile">
          <el-icon><UserFilled /></el-icon>
          <span>個人資料</span>
        </el-menu-item>
        <el-menu-item index="/portal/attendance">
          <el-icon><Calendar /></el-icon>
          <span>我的出勤</span>
        </el-menu-item>
        <el-menu-item index="/portal/schedule" @click="fetchSwapPendingCount">
          <el-icon><Clock /></el-icon>
          <span>我的排班</span>
          <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="announcement-badge" />
        </el-menu-item>
        <el-menu-item index="/portal/leave">
          <el-icon><Document /></el-icon>
          <span>請假申請</span>
        </el-menu-item>
        <el-menu-item index="/portal/overtime">
          <el-icon><Clock /></el-icon>
          <span>加班申請</span>
        </el-menu-item>
        <el-menu-item index="/portal/anomalies">
          <el-icon><Warning /></el-icon>
          <span>異常確認</span>
        </el-menu-item>
        <el-menu-item index="/portal/students">
          <el-icon><User /></el-icon>
          <span>班級學生</span>
        </el-menu-item>
        <el-menu-item index="/portal/calendar">
          <el-icon><Calendar /></el-icon>
          <span>學校行事曆</span>
        </el-menu-item>
        <el-menu-item index="/portal/salary">
          <el-icon><Money /></el-icon>
          <span>薪資查詢</span>
        </el-menu-item>
        <el-menu-item index="/portal/announcements" @click="fetchUnreadCount">
          <el-icon><Bell /></el-icon>
          <span>公告通知</span>
          <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="announcement-badge" />
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- PWA 安裝提示（手機首次訪問且瀏覽器支援時才顯示）-->
      <div v-if="showInstallBanner && isMobile" class="install-banner">
        <span>📱 加到桌面，打卡更方便！</span>
        <el-button size="small" type="success" @click="installPWA">加入桌面</el-button>
        <el-button size="small" text @click="dismissInstallBanner">✕</el-button>
      </div>

      <el-header height="60px">
        <div class="portal-header">
          <div class="header-left">
            <button v-if="isMobile" class="hamburger-btn" @click="toggleSidebar">
              <span class="hamburger-line"></span>
              <span class="hamburger-line"></span>
              <span class="hamburger-line"></span>
            </button>
            <h3>義華幼兒園 - 教職員考勤系統</h3>
          </div>
          <div class="portal-user">
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

/* Main Content */
.el-main {
  background-color: var(--bg-color);
  padding: var(--space-6);
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

/* Hamburger button */
.hamburger-btn {
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.hamburger-line {
  display: block;
  width: 20px;
  height: 2px;
  background-color: var(--text-primary);
  border-radius: 2px;
  transition: all var(--transition-slow);
}

/* Mobile sidebar overlay */
.sidebar-overlay {
  display: none;
}

/* Mobile styles */
@media (max-width: 767px) {
  .hamburger-btn {
    display: flex;
  }

  .portal-header h3 {
    font-size: var(--text-lg);
  }

  .el-header {
    padding: 0 var(--space-4);
  }

  .el-main {
    padding: var(--space-4);
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

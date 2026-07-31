
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, provide, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSubstitutePendingCount, getUnreadCount, getSwapPendingCount } from '@/api/portal'
import { getUnreadCount as getMessagesUnreadCount } from '@/api/portalMessages'
import { initPortalDismissalAlerts, teardownPortalDismissalAlerts, usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'
import { getTodayHub } from '@/api/portalClassHub'
import { changePassword, endImpersonate } from '@/api/auth'
import { getUserInfo, clearAuth, setUserInfo, hasPortalPermission } from '@/utils/auth'
import OfflineIndicator from '@/components/OfflineIndicator.vue'
import { apiError } from '@/utils/error'
import A11yMenu from '@/components/common/A11yMenu.vue'
import PortalSearchPalette from '@/components/portal/PortalSearchPalette.vue'
import { usePortalSearch, installPortalSearchKeyboard } from '@/composables/usePortalSearch'
import { useIsMobile } from '@/composables/useIsMobile'
import {
  Search,
  Fold,
  UserFilled,
  HomeFilled,
  Calendar,
  Timer,
  Money,
  User,
  Document,
  School,
  Warning,
  Brush,
  Bell,
  Clock,
} from '@element-plus/icons-vue'

interface UserInfo {
  name?: string
  role?: string
  impersonation_mode?: 'readonly' | 'write' | null
  [key: string]: unknown
}

const { openPalette } = usePortalSearch()
installPortalSearchKeyboard()

const route = useRoute()
const router = useRouter()
const activeIndex = computed(() => route.path)
const userInfo = computed<UserInfo>(() => (getUserInfo() || {}) as UserInfo)

const showPasswordDialog = ref(false)
const passwordForm = ref<{ old_password: string; new_password: string; confirm_password: string }>(
  { old_password: '', new_password: '', confirm_password: '' }
)
const passwordLoading = ref(false)

// Mobile sidebar
const { isMobile } = useIsMobile()
// 娃娃車隨車操作為 per-user 顯式授權；沒有就不顯示入口（權限把關仍在 router guard）
const canOperateBusTrips = computed(() => hasPortalPermission('BUS_TRIPS_OPERATE'))
const sidebarOpen = ref(false)

watch(isMobile, (m) => {
  if (!m) sidebarOpen.value = false
})

// Unread announcement count
const unreadCount = ref(0)

// Swap pending count
const swapPendingCount = ref(0)
const substitutePendingCount = ref(0)

// 接送待處理數：由 module-singleton composable 即時維護（WS 推播驅動），殼層不另外 fetch
const { pendingCount: dismissalPendingCount } = usePortalDismissalAlerts()

// 家園溝通：家長訊息未讀
const messagesUnreadCount = ref(0)
// 今日工作台待辦數
const hubPendingCount = ref(0)

// 「今日工作台」menu badge 聚合：hub 待辦 + 家長訊息未讀。
// 不含公告（unreadCount），因為「公告通知」已是獨立頂層 menu item 自帶 badge。
const totalHubBadge = computed(
  () => hubPendingCount.value + messagesUnreadCount.value,
)

// Badge 刷新節流：避免短時間內被多次觸發（route 切換、tab 切回）打爆後端。
// 30 秒內已 refresh 過就不再全量重抓；個別事件（如代理人狀態變更）仍可 force。
const COUNTS_TTL_MS = 30_000
let lastCountsRefreshAt = 0

const fetchUnreadCount = async () => {
  try {
    const res = await getUnreadCount()
    unreadCount.value = (res.data as Record<string, unknown>)?.unread_count as number || 0
  } catch {
    // Silent fail
  }
}

const fetchSwapPendingCount = async () => {
  try {
    const res = await getSwapPendingCount()
    swapPendingCount.value = (res.data as Record<string, unknown>)?.pending_count as number || 0
  } catch {
    // Silent fail
  }
}

const fetchSubstitutePendingCount = async () => {
  try {
    const res = await getSubstitutePendingCount()
    substitutePendingCount.value = (res.data as Record<string, unknown>)?.pending_count as number || 0
  } catch {
    // Silent fail
  }
}

const fetchMessagesUnreadCount = async () => {
  try {
    const res = await getMessagesUnreadCount()
    messagesUnreadCount.value = (res.data as Record<string, unknown>)?.unread_count as number || 0
  } catch {
    // 沒有 PARENT_MESSAGES_WRITE 權限會 403，靜默忽略
  }
}

const fetchHubPendingCount = async () => {
  try {
    const data = await getTodayHub()
    const c = (data as Record<string, unknown>)?.counts as Record<string, number> | undefined || {}
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

const refreshPortalCounts = ({ force = false }: { force?: boolean } = {}) => {
  if (!force && Date.now() - lastCountsRefreshAt < COUNTS_TTL_MS) return
  lastCountsRefreshAt = Date.now()
  fetchUnreadCount()
  fetchSwapPendingCount()
  fetchSubstitutePendingCount()
  // dismissal count 由 composable 透過 WS 即時維護，不走輪詢
  fetchMessagesUnreadCount()
  fetchHubPendingCount()
}

// substitute 事件 listener wrapper：force 重抓單一欄位，不影響整體 TTL
const onSubstituteChanged = () => {
  fetchSubstitutePendingCount()
}

// tab 切回前景時，若距上次刷新超過 TTL 再抓一次（不切頁就不刷）
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    refreshPortalCounts()
  }
}

// PWA 安裝提示
const deferredPrompt = ref<Event | null>(null)
const showInstallBanner = ref(false)

// 具名 handler：於 onMounted 註冊、onUnmounted 移除（原本於 setup 直接註冊且
// 從不移除，登入登出循環會累積重複 listener）。
const onBeforeInstallPrompt = (e: Event) => {
  e.preventDefault()
  deferredPrompt.value = e
  showInstallBanner.value = true
}

const installPWA = async () => {
  if (!deferredPrompt.value) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt = deferredPrompt.value as any
  prompt.prompt()
  await prompt.userChoice
  deferredPrompt.value = null
  showInstallBanner.value = false
}

const dismissInstallBanner = () => {
  showInstallBanner.value = false
}

onMounted(() => {
  window.addEventListener('portal-substitute-count-changed', onSubstituteChanged)
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  document.addEventListener('visibilitychange', onVisibilityChange)
  refreshPortalCounts({ force: true })
  // 接送提醒提升到殼層：單一 WS、全 Portal 頁存活、AudioContext gesture unlock、visibilitychange 重連
  initPortalDismissalAlerts()

  // 導航更新一次性提示（v=1: 2026-05 教師端 ACD 改造）
  const PORTAL_LAYOUT_VERSION = '1'
  const stored = localStorage.getItem('portal_layout_v')
  if (stored !== PORTAL_LAYOUT_VERSION) {
    setTimeout(() => {
      ElMessageBox({
        title: '導航更新',
        message:
          '教師端介面已更新：\n\n' +
          '• 底部 tab 第 5 個從「更多」改為「我的」（個人選單）\n' +
          '• 側邊欄「班級教務」拆為「班級 — 教學」與「班級 — 管理」\n' +
          '• 新增「今日工作台」為預設首頁\n\n' +
          '原本的選單仍可由側邊欄找到。',
        type: 'info',
        confirmButtonText: '我知道了',
        showCancelButton: false,
      })
        .catch(() => {})
        .finally(() => {
          localStorage.setItem('portal_layout_v', PORTAL_LAYOUT_VERSION)
        })
    }, 500)
  }
})

onUnmounted(() => {
  window.removeEventListener('portal-substitute-count-changed', onSubstituteChanged)
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  teardownPortalDismissalAlerts()
})

const closeSidebar = () => {
  if (isMobile.value) sidebarOpen.value = false
}

// 冒充狀態：從 userInfo.impersonation_mode 推導（頁面重載後仍正確）。
// 'readonly' = 預覽中（唯讀），'write' = 代操作中（操作會被記錄），null = 非冒充。
const isImpersonating = computed(() =>
  userInfo.value.impersonation_mode === 'readonly' ||
  userInfo.value.impersonation_mode === 'write'
)

// readonly 旗標：供子頁面透過 inject('isReadonlyImpersonation') 取得，
// 決定是否隱藏寫入控制項（實際寫入攔截由後端守衛，此為前端 UX 增強）。
const isReadonlyImpersonation = computed(
  () => userInfo.value.impersonation_mode === 'readonly'
)
provide('isReadonlyImpersonation', isReadonlyImpersonation)

// 返回後台：自身是 admin/hr/supervisor，或處於冒充狀態
const showBackToAdmin = computed(() => {
  const role = userInfo.value.role
  return ['admin', 'hr', 'supervisor'].includes(role as string) || isImpersonating.value
})

const goBackToAdmin = async () => {
  if (!isImpersonating.value) {
    // hr/supervisor 以自己身份直接進入前台，沒有 impersonation session，直接返回即可
    router.push('/')
    return
  }
  try {
    const res = await endImpersonate()
    const user = (res.data as Record<string, unknown>).user as UserInfo
    // 後端已清除 admin_token Cookie 並將 access_token 還原為管理員；
    // setUserInfo 後 isImpersonating computed 自動重算為 false。
    setUserInfo(user)
    router.push('/')
  } catch (error) {
    ElMessage.error(apiError(error, '返回失敗'))
    // 失敗時強制登出
    clearAuth()
    router.push('/login')
  }
}

const handleCommand = (cmd: string) => {
  if (cmd === 'logout') {
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

    <el-aside id="portal-sidebar" :width="isMobile ? '220px' : '200px'" :class="{ 'sidebar-open': sidebarOpen, 'sidebar-hidden': isMobile && !sidebarOpen }">
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
        <!-- ============ 我的 ============ -->
        <el-sub-menu index="group-mine">
          <template #title>
            <el-icon><UserFilled /></el-icon>
            <span>我的</span>
          </template>
          <el-menu-item index="/portal/home">
            <el-icon><HomeFilled /></el-icon>
            <span>今日工作台</span>
            <el-badge v-if="totalHubBadge > 0" :value="totalHubBadge" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/attendance">
            <el-icon><Calendar /></el-icon>
            <span>我的出勤</span>
          </el-menu-item>
          <el-menu-item index="/portal/schedule">
            <el-icon><Timer /></el-icon>
            <span>我的排班</span>
            <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/salary">
            <el-icon><Money /></el-icon>
            <span>薪資查詢</span>
          </el-menu-item>
          <el-menu-item index="/portal/profile">
            <el-icon><User /></el-icon>
            <span>個人資料</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 假勤申請 ============ -->
        <el-sub-menu index="group-leave">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>假勤申請</span>
          </template>
          <el-menu-item index="/portal/leave">
            <span>請假申請</span>
            <el-badge v-if="substitutePendingCount > 0" :value="substitutePendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/overtime">
            <span>加班申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/punch-correction">
            <span>補打卡申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/anomalies">
            <span>異常確認</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 班級 — 教學 ============ -->
        <el-sub-menu index="group-class-teach">
          <template #title>
            <el-icon><School /></el-icon>
            <span>班級 — 教學</span>
          </template>
          <el-menu-item index="/portal/students">
            <span>班級學生</span>
          </el-menu-item>
          <el-menu-item index="/portal/class-hub">
            <span>今日班級工作台</span>
          </el-menu-item>
          <el-menu-item index="/portal/observations">
            <span>課堂觀察</span>
          </el-menu-item>
          <el-menu-item index="/portal/assessments">
            <span>學期評量</span>
          </el-menu-item>
          <el-menu-item index="/portal/albums">
            <span>班級相簿</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 班級 — 管理 ============ -->
        <el-sub-menu index="group-class-admin">
          <template #title>
            <el-icon><Warning /></el-icon>
            <span>班級 — 管理</span>
          </template>
          <el-menu-item index="/portal/incidents">
            <span>事件紀錄</span>
          </el-menu-item>
          <el-menu-item index="/portal/dismissal-calls">
            <span>接送通知</span>
            <el-badge v-if="dismissalPendingCount > 0" :value="dismissalPendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/medications">
            <span>用藥執行</span>
          </el-menu-item>
          <!-- 娃娃車：BUS_TRIPS_OPERATE 是 per-user 顯式授權（絕大多數老師沒有），
               不過濾的話所有人都會看到入口、點進去再被 router guard 踢回首頁。 -->
          <el-menu-item v-if="canOperateBusTrips" index="/portal/bus-trip">
            <span>娃娃車班次</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 才藝 ============ -->
        <el-sub-menu index="group-activity">
          <template #title>
            <el-icon><Brush /></el-icon>
            <span>才藝</span>
          </template>
          <el-menu-item index="/portal/activity">
            <span>才藝管理</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 其他 ============ -->
        <el-menu-item index="/portal/announcements">
          <el-icon><Bell /></el-icon>
          <span>公告通知</span>
          <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="announcement-badge" />
        </el-menu-item>
        <el-menu-item index="/portal/calendar">
          <el-icon><Calendar /></el-icon>
          <span>學校行事曆</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <OfflineIndicator />

      <!-- 冒充模式常駐橫幅：readonly（預覽）或 write（代操作）-->
      <el-alert
        v-if="isReadonlyImpersonation"
        type="info"
        :closable="false"
        class="impersonation-banner"
        show-icon
      >
        <template #default>
          <span class="impersonation-banner-text">
            預覽中（唯讀）— {{ userInfo.name }}
          </span>
          <el-button size="small" plain @click="goBackToAdmin" class="impersonation-exit-btn">
            返回後台
          </el-button>
        </template>
      </el-alert>
      <el-alert
        v-else-if="userInfo.impersonation_mode === 'write'"
        type="warning"
        :closable="false"
        class="impersonation-banner"
        show-icon
      >
        <template #default>
          <span class="impersonation-banner-text">
            代操作中（操作會被記錄）— {{ userInfo.name }}
          </span>
          <el-button size="small" plain @click="goBackToAdmin" class="impersonation-exit-btn">
            返回後台
          </el-button>
        </template>
      </el-alert>

      <!-- PWA 安裝提示（手機首次訪問且瀏覽器支援時才顯示）-->
      <div v-if="showInstallBanner && isMobile" class="install-banner">
        <span>📱 加到桌面，打卡更方便！</span>
        <el-button size="small" type="success" @click="installPWA">加入桌面</el-button>
        <el-button size="small" text @click="dismissInstallBanner">✕</el-button>
      </div>

      <el-header height="60px">
        <div class="portal-header">
          <div class="header-left">
            <!-- 手機漢堡鍵：點擊後開啟側欄；overlay/動畫/closeSidebar 既有，此為唯一缺漏的觸發點（P0） -->
            <button
              v-if="isMobile"
              class="portal-sidebar-toggle"
              data-test="portal-sidebar-toggle"
              type="button"
              :aria-expanded="sidebarOpen"
              aria-controls="portal-sidebar"
              aria-label="開啟選單"
              @click="sidebarOpen = true"
            >
              <el-icon><Fold /></el-icon>
            </button>
            <h3>常春藤教育機構 - 教職員考勤系統</h3>
          </div>
          <button class="psp-trigger-portal" @click="openPalette" title="搜尋 (Cmd+K)">
            <el-icon><Search /></el-icon>
            <span class="psp-trigger-label">搜尋…</span>
            <kbd class="psp-trigger-kbd">⌘K</kbd>
          </button>
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

            <span class="user-name">{{ userInfo.name || '' }}</span>
            <el-dropdown @command="handleCommand">
              <el-avatar :size="32" :icon="UserFilled" />
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
      <nav v-if="isMobile" class="bottom-nav" aria-label="主要導覽">
        <button
          type="button"
          class="bottom-tab"
          :class="{ active: route.path.startsWith('/portal/home') || route.path.startsWith('/portal/class-hub') }"
          :aria-current="route.path.startsWith('/portal/home') || route.path.startsWith('/portal/class-hub') ? 'page' : undefined"
          @click="router.push('/portal/home')"
        >
          <div class="tab-icon-wrapper">
            <el-icon><HomeFilled /></el-icon>
            <el-badge v-if="totalHubBadge > 0" :value="totalHubBadge" :max="99" class="tab-badge" />
          </div>
          <span>工作台</span>
        </button>
        <button
          type="button"
          class="bottom-tab"
          :class="{ active: route.path.startsWith('/portal/attendance') }"
          :aria-current="route.path.startsWith('/portal/attendance') ? 'page' : undefined"
          @click="router.push('/portal/attendance')"
        >
          <el-icon><Calendar /></el-icon>
          <span>出勤</span>
        </button>
        <button
          type="button"
          class="bottom-tab"
          :class="{ active: route.path.startsWith('/portal/schedule') }"
          :aria-current="route.path.startsWith('/portal/schedule') ? 'page' : undefined"
          @click="router.push('/portal/schedule')"
        >
          <div class="tab-icon-wrapper">
            <el-icon><Clock /></el-icon>
            <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="tab-badge" />
          </div>
          <span>排班</span>
        </button>
        <button
          type="button"
          class="bottom-tab"
          :class="{ active: route.path.startsWith('/portal/students') || route.path.startsWith('/portal/student') }"
          :aria-current="route.path.startsWith('/portal/students') || route.path.startsWith('/portal/student') ? 'page' : undefined"
          @click="router.push('/portal/students')"
        >
          <el-icon><User /></el-icon>
          <span>學生</span>
        </button>
        <button
          type="button"
          class="bottom-tab"
          :class="{ active: route.path.startsWith('/portal/profile') }"
          :aria-current="route.path.startsWith('/portal/profile') ? 'page' : undefined"
          @click="router.push('/portal/profile')"
        >
          <el-icon><UserFilled /></el-icon>
          <span>我的</span>
        </button>
      </nav>
      <button v-if="isMobile" class="psp-fab" @click="openPalette" aria-label="搜尋">
        <el-icon><Search /></el-icon>
      </button>
    </el-container>

    <!-- 全域快速搜尋 Palette (Cmd+K) -->
    <PortalSearchPalette />

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
  /* 亮色（預設）表面/文字 token。原本 --bg-color: var(--bg-color) 是自我循環
   * 引用（CSS 規格下無效），移除後由 :root 繼承；dark 覆寫見下方 html.dark 區塊。 */
  --bg-color-soft: #f3f4f6;
  --surface-color: var(--neutral-0);
  --pt-surface-app: #f8fafc;
  --pt-surface-card: #ffffff;
  --pt-surface-mute: #f3f4f6;
  --pt-surface-mute-soft: #f9fafb;
  --pt-text-strong: #0f172a;
  --pt-text-body: #1e293b;
  /* 次級文字 slate-700 (#334155, 10.4:1 AAA on #fff)：業主反映過淡，再往深調一階 */
  --pt-text-muted: #334155;
  --pt-text-soft: #334155;
  --pt-text-faint: #475569;
  height: 100vh;
  background-color: var(--bg-color);
  color: var(--pt-text-body);
}

/* Dark mode（教師經 A11yMenu 切 html.dark）：portal 走一致的深色表面 + 亮文字。
 * 原本亮色 token 硬鎖 + --pt-text-* 鎖深字但 --text-* 未鎖，造成 dark 下深底深字/
 * 白底亮字對比崩壞。此處以更高特異性（html.dark .portal-layout）覆寫為協調深色。 */
html.dark .portal-layout {
  --bg-color: #0f172a;
  --bg-color-soft: #1e293b;
  --surface-color: #1e293b;
  --pt-surface-app: #0f172a;
  --pt-surface-card: #1e293b;
  --pt-surface-mute: #263449;
  --pt-surface-mute-soft: #1e293b;
  --pt-text-strong: #f1f5f9;
  --pt-text-body: #e2e8f0;
  --pt-text-muted: #cbd5e1;
  --pt-text-soft: #cbd5e1;
  --pt-text-faint: #94a3b8;
}

/* Sidebar Styling */
.el-aside {
  background-color: var(--text-primary);
  color: #fff;
  border-right: 1px solid var(--neutral-700);
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
  border-bottom: 1px solid var(--neutral-700);
  background-color: var(--neutral-900);
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
  background-color: var(--neutral-700) !important;
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
  background-color: var(--neutral-700) !important;
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

/* Main Content：對齊管理端背景，避免 --pt-surface-app 被暗模式 token 覆寫導致教師端偏深 */
.el-main {
  background-color: var(--bg-color);
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
@media (--to-sm) {
  .el-main {
    padding: var(--space-4);
  }
}

/* 冒充模式常駐橫幅 */
.impersonation-banner {
  border-radius: 0 !important;
  border-left: none !important;
  border-right: none !important;
}

:deep(.impersonation-banner .el-alert__content) {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--space-3);
}

.impersonation-banner-text {
  flex: 1;
  font-weight: 600;
  font-size: var(--text-base);
}

.impersonation-exit-btn {
  flex-shrink: 0;
}

.install-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: #f0fdf4;
  border-bottom: 1px solid var(--color-success-soft);
  font-size: var(--text-base);
  color: var(--color-success-darker);
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

/* 手機漢堡鍵：命中區 ≥ 44×44px，觸發點透明以符合 Portal header 視覺 */
.portal-sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: 4px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Bottom Navigation */
.bottom-nav {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
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
  /* button reset：清除瀏覽器預設外觀，維持原視覺 */
  border: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  color: var(--pt-text-muted, #64748b);
  cursor: pointer;
  transition: color var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.bottom-tab:active {
  background-color: var(--bg-color-soft);
}

.bottom-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
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
@media (--to-sm) {
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

/* ── Cmd+K 搜尋觸發按鈕（桌面 top bar） ── */
.psp-trigger-portal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  color: var(--el-text-color-secondary);
}
.psp-trigger-portal:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.psp-trigger-kbd {
  padding: 1px 5px;
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  font-size: 11px;
}
@media (--to-sm) {
  .psp-trigger-portal {
    display: none;
  }
}

/* ── 行動端搜尋 FAB（右下角圓鈕） ── */
.psp-fab {
  position: fixed;
  bottom: calc(76px + env(safe-area-inset-bottom)); /* bottom-nav(60+inset)+16 gap */
  right: 16px;
  z-index: 50;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.psp-fab .el-icon {
  font-size: 22px;
}

/* dark mode：install-banner 背景是硬編淺綠（不翻色，finding #2 既有債），上游 a11y.css
   把 --color-success-darker 翻成亮色會讓提示文字塌對比；dark scope 還原可讀深字。 */
html.dark .install-banner {
  color: #15803d;
}
</style>


<template>
  <el-container class="admin-layout" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile overlay -->
    <button
      v-if="isMobile && sidebarOpen"
      type="button"
      class="sidebar-overlay"
      aria-label="關閉導覽選單"
      @click="closeSidebar"
    ></button>

    <AdminSidebar
      ref="sidebarRef"
      :pending-approvals="notificationStore.approvalCount"
      :pending-activity-inquiries="notificationStore.activityInquiryCount"
      :pending-activity-review="notificationStore.activityPendingReviewCount"
      :pending-high-risk-audit="unackHighRiskCount"
      :is-mobile="isMobile"
      :mobile-open="sidebarOpen"
      @close-sidebar="closeSidebar"
    />

    <el-container
      direction="vertical"
      class="main-content-wrapper"
      :inert="isMobile && sidebarOpen"
      :aria-hidden="isMobile && sidebarOpen ? 'true' : undefined"
    >
      <a class="skip-link" href="#admin-main">跳至主要內容</a>
      <AdminHeader
        ref="headerRef"
        :is-mobile="isMobile"
        :sidebar-open="sidebarOpen"
        @toggle-sidebar="toggleSidebar"
      />

      <el-main id="admin-main" tabindex="-1">
        <div class="content-container">
          <RouterView />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AdminSidebar from '../components/layout/AdminSidebar.vue'
import AdminHeader from '../components/layout/AdminHeader.vue'
import { isLoggedIn } from '@/utils/auth'
import { useNotificationStore } from '@/stores/notification'
import { useHighRiskAuditCount } from '@/composables/useHighRiskAuditCount'
import { useIsMobile } from '@/composables/useIsMobile'
import { useInboxNotifications } from '@/composables/useInboxNotifications'

const NOTIFICATION_POLL_MS = 60_000

const route = useRoute()
const notificationStore = useNotificationStore()
const { unackCount: unackHighRiskCount } = useHighRiskAuditCount()
const { isMobile } = useIsMobile()
const sidebarOpen = ref(false)
const sidebarRef = ref<InstanceType<typeof AdminSidebar> | null>(null)
const headerRef = ref<InstanceType<typeof AdminHeader> | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const inboxNotifications = useInboxNotifications(() => {
  if (isLoggedIn() && isAdminContext(route.path)) {
    return notificationStore.fetchSummary({ force: true })
  }
})

// 離開手機視窗時關閉手機側欄（原 checkMobile 的副作用）
watch(isMobile, (m) => {
  if (!m) sidebarOpen.value = false
})

const openSidebar = async () => {
  sidebarOpen.value = true
  await nextTick()
  sidebarRef.value?.focusCloseButton()
}

const closeSidebar = async () => {
  const shouldRestoreFocus = isMobile.value && sidebarOpen.value
  sidebarOpen.value = false
  if (shouldRestoreFocus) {
    await nextTick()
    headerRef.value?.focusSidebarToggle()
  }
}

const toggleSidebar = async () => {
  if (sidebarOpen.value) {
    await closeSidebar()
  } else {
    await openSidebar()
  }
}

// AdminLayout 即使被 App.vue 用 v-else 守住仍可能在 router 尚未 resolve 的
// 初次 mount 短暫渲染，這時 route.path 還是 START_LOCATION ('/')。為避免
// 公開頁/教師端/登入頁打到 admin-only 的 /api/notifications/summary，
// 這裡再守一道 path-based guard。
function isAdminContext(path: string): boolean {
  return (
    !path.startsWith('/public') &&
    !path.startsWith('/portal') &&
    path !== '/login' &&
    path !== '/change-password'
  )
}

function refreshNotifications() {
  if (isLoggedIn() && isAdminContext(route.path)) notificationStore.fetchSummary()
}

// 輪詢專用 callback：背景分頁（document.hidden）時跳過，省後端負載 / quota
// （對照 useHighRiskAuditCount）。切回前景後下一個 tick 自然恢復。
function pollNotifications() {
  if (typeof document !== 'undefined' && document.hidden) return
  refreshNotifications()
}

onMounted(() => {
  // admin 品牌色 scope（design-tokens.css / main.css 的 html.ivy-admin 區塊）；
  // 掛在 <html> 讓 teleport 到 body 的 dialog/message 也吃到
  document.documentElement.classList.add('ivy-admin')
  refreshNotifications()
  if (isLoggedIn() && isAdminContext(route.path)) inboxNotifications.start()
  // Why: 切頁不再觸發 fetchSummary（避免每次 navigation 多一支 API 等待），改用
  // 固定 60 秒輪詢；store 本身有 10s TTL + in-flight dedupe 守住，重複請求不會炸後端。
  pollTimer = setInterval(pollNotifications, NOTIFICATION_POLL_MS)
})

onUnmounted(() => {
  document.documentElement.classList.remove('ivy-admin')
  inboxNotifications.stop()
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
/* 動態視窗高度：iOS Safari / Android Chrome 的網址列會收合，100vh 是「網址列展開時」
   的高度且不隨捲動更新，會讓底部內容被瀏覽器 UI 裁掉。100dvh 隨可視區即時變動。
   先寫 100vh 給不支援 dvh 的舊瀏覽器當 fallback（同 main.css dialog 手法）。 */
.admin-layout {
  height: 100vh;
  height: 100dvh;
  background-color: var(--bg-color);
}

.main-content-wrapper {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.skip-link {
  position: fixed;
  top: var(--space-2);
  left: var(--space-2);
  z-index: var(--z-toast);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-200%);
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.el-main {
  padding: 0;
  overflow-y: auto;
  background-color: var(--bg-color);
}

.content-container {
  padding: var(--space-8);
  max-width: 1600px;
  margin: 0 auto;
}

/* Mobile overlay */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--overlay-medium);
  backdrop-filter: blur(2px);
  border: 0;
  padding: 0;
  z-index: 1999;
  cursor: pointer;
}

@media (--to-sm) {
  .content-container {
    padding: var(--space-4);
  }
}

/* 底部安全區：手機橫桿（home indicator）／Android 手勢列會蓋住捲動區最後一段內容，
   讓頁尾的分頁器、儲存鈕點不到。main.css 的 @supports 段只處理 .el-header 頂部與
   .bottom-nav，admin 的捲動內容區沒有涵蓋到，這裡補上。 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .content-container {
    padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  }

  @media (--to-sm) {
    .content-container {
      padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    }
  }
}
</style>
